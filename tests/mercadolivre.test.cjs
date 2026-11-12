const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const origin='https://precificacaoprodutos.netlify.app';
const env={ML_CLIENT_ID:'123456',ML_CLIENT_SECRET:'TEST_SECRET_NOT_REAL',ML_SESSION_SECRET:'ab'.repeat(32),ML_REDIRECT_URI:origin+'/api/ml/callback'};
const fixture={id:'MLB1234567890',title:'Produto de teste',condition:'new',shipping:{mode:'me2',logistic_type:'cross_docking',free_shipping:false},site_id:'MLB',seller_id:123,category_id:'MLB1234',catalog_product_id:'MLB56789',listing_type_id:'gold_special',permalink:'https://produto.mercadolivre.com.br/MLB-1234567890-_JM',secure_thumbnail:'https://http2.mlstatic.com/foto.png',attributes:[{id:'PACKAGE_WEIGHT',value_struct:{number:750,unit:'g'}}],variations:[],price:999999};
const modulePromise=import('../netlify/functions/mercadolivre.mjs');
function request(action,{method='GET',cookie,query={},ownOrigin=origin,header=true,body}={}){
 const headers={};if(cookie)headers.Cookie=cookie;if(method==='POST'){headers.Origin=ownOrigin;if(header)headers['X-Conduz-Action']='mercadolivre';}
 return new Request(origin+'/api/ml/'+action+'?'+new URLSearchParams(query),{method,headers,...(body?{body:JSON.stringify(body)}:{})});
}
async function setup(options={}){
 const {createHandler}=await modulePromise;let time=Date.parse('2026-11-11T12:00:00Z');const calls=[];
 const fetchImpl=async(url,init={})=>{
  assert.equal(init.redirect,'manual');calls.push({url,init});if(options.fetch)return options.fetch(url,init);
  const path=new URL(url).pathname;
  if(path==='/oauth/token')return Response.json({access_token:'TEST_ACCESS_TOKEN_NOT_REAL',refresh_token:'DO_NOT_STORE_REFRESH_TOKEN',expires_in:21600});
  assert.equal(init.headers.Authorization,'Bearer TEST_ACCESS_TOKEN_NOT_REAL');
  if(path==='/users/me')return Response.json({id:123,nickname:'CONDUZ_TESTE',seller_reputation:{level_id:'5_green'}});
  if(path==='/users/123/items/search')return Response.json({results:[fixture.id],scroll_id:'cursor-teste'});
  if(path==='/items/bulk')return Response.json([{id:fixture.id,status_code:200,body:fixture},{id:'MLB9876543210',status_code:403,body:{message:'no access'}}]);
  if(path==='/items/'+fixture.id)return Response.json(options.item??fixture);
  if(path==='/sites/MLB/listing_prices'){
   const price=Number(new URL(url).searchParams.get('price'));
   return Response.json(['gold_special','gold_pro'].map((listing_type_id,i)=>({listing_type_id,currency_id:'BRL',listing_fee_amount:0,sale_fee_amount:Math.round(price*(14+i*5))/100+6,sale_fee_details:{percentage_fee:14+i*5,fixed_fee:6}})));
  }
  if(path==='/categories/MLB1234')return Response.json({id:'MLB1234',name:'Categoria teste',children_categories:[],settings:{listing_allowed:true,status:'enabled',shipping_modes:['me2']}});
  if(path==='/sites/MLB/domain_discovery/search')return Response.json([{category_id:'MLB1234',category_name:'Categoria teste'},{category_id:'MLB1234',category_name:'Categoria teste'},{category_id:'evil',category_name:'Inválida'}]);
  if(path==='/items/'+fixture.id+'/sale_price')return options.noPrice?Response.json({message:'Denied'}, {status:403}):Response.json({amount:54.9,currency_id:'BRL'});
  if(path==='/users/123/shipping_options/free')return Response.json({coverage:{all_country:{list_cost:options.shippingCost??18.5,currency_id:'BRL',billable_weight:750},discount:{rate:.4,promoted_amount:30.83}}});
  throw Error('Endpoint inesperado: '+url);
 };
 const handler=createHandler({env:options.env??env,fetchImpl,now:()=>time});
 return {handler,calls,advance:ms=>{time+=ms;}};
}
async function authorize(app){
 const start=await app.handler(request('connect',{method:'POST'}));assert.equal(start.status,200);
 const auth=new URL((await start.json()).authorizationUrl),flow=start.headers.get('set-cookie').split(';')[0];
 const callback=await app.handler(request('callback',{cookie:flow,query:{state:auth.searchParams.get('state'),code:'TEST_AUTHORIZATION_CODE'}}));
 assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),origin+'/?ml=connected');
 const cookie=callback.headers.getSetCookie().find(c=>c.startsWith('__Host-conduz_ml_session='));assert.ok(cookie);
 return {cookie:cookie.split(';')[0],fullCookie:cookie,auth,flow};
}
test('sem configuração a integração fica indisponível e não consulta APIs',async()=>{
 const app=await setup({env:{}}),status=await app.handler(request('status'));
 assert.deepEqual(await status.json(),{configured:false,connected:false,account:null,expiresAt:null});
 assert.equal((await app.handler(request('items'))).status,503);assert.equal(app.calls.length,0);
});
test('OAuth usa state e PKCE, cookies seguros e não expõe credenciais ao JavaScript',async()=>{
 const app=await setup(),auth=await authorize(app);
 assert.equal(auth.auth.origin,'https://auth.mercadolivre.com.br');assert.equal(auth.auth.searchParams.get('scope'),'read');assert.equal(auth.auth.searchParams.get('code_challenge_method'),'S256');
 const tokenCall=app.calls.find(c=>c.url.endsWith('/oauth/token')),body=tokenCall.init.body;
 assert.equal(body.get('client_secret'),env.ML_CLIENT_SECRET);
 assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'),auth.auth.searchParams.get('code_challenge'));
 assert.ok(auth.fullCookie.includes('HttpOnly'));assert.ok(auth.fullCookie.includes('Secure'));assert.ok(auth.fullCookie.includes('SameSite=Lax'));
 assert.ok(!auth.fullCookie.includes('TEST_ACCESS_TOKEN'));assert.ok(!auth.fullCookie.includes('DO_NOT_STORE_REFRESH_TOKEN'));
 const status=await app.handler(request('status',{cookie:auth.cookie})),json=await status.json();
 assert.equal(json.connected,true);assert.equal(json.account.nickname,'CONDUZ_TESTE');assert.ok(!JSON.stringify(json).includes('TOKEN'));
 assert.equal(status.headers.get('cache-control'),'no-store');
});
test('requisições de outra origem não iniciam nem desconectam a conta',async()=>{
 const app=await setup();assert.equal((await app.handler(request('connect',{method:'POST',ownOrigin:'https://evil.example'}))).status,403);
 assert.equal((await app.handler(request('connect',{method:'POST',header:false}))).status,403);
 assert.equal((await app.handler(request('connect'))).status,405);
 assert.equal((await app.handler(request('disconnect',{method:'POST',ownOrigin:'https://evil.example'}))).status,403);assert.equal(app.calls.length,0);
});
test('callback com state inválido ou expirado não troca o código',async()=>{
 const app=await setup(),start=await app.handler(request('connect',{method:'POST'})),data=await start.json(),auth=new URL(data.authorizationUrl),cookie=start.headers.get('set-cookie').split(';')[0];
 const wrong=await app.handler(request('callback',{cookie,query:{state:'outro',code:'fake'}}));assert.equal(wrong.headers.get('location'),origin+'/?ml=error&ml_reason=state');assert.equal(app.calls.length,0);
 app.advance(301000);const expired=await app.handler(request('callback',{cookie,query:{state:auth.searchParams.get('state'),code:'fake'}}));assert.equal(expired.headers.get('location'),origin+'/?ml=error&ml_reason=state');assert.equal(app.calls.length,0);
});
test('catálogo usa scan e o endpoint bulk atual, retornando apenas itens da conta',async()=>{
 const app=await setup(),auth=await authorize(app),response=await app.handler(request('items',{cookie:auth.cookie,query:{cursor:'cursor:abc+/='}})),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.items.length,1);assert.equal(data.items[0].itemId,fixture.id);assert.equal(data.items[0].weight,.75);
 const search=app.calls.find(c=>c.url.includes('/items/search'));assert.equal(new URL(search.url).searchParams.get('search_type'),'scan');assert.equal(new URL(search.url).searchParams.get('scroll_id'),'cursor:abc+/=');
 assert.ok(app.calls.some(c=>c.url.includes('/items/bulk?')));assert.equal(data.nextCursor,null);assert.equal(data.items[0].price,undefined);
});
test('consulta importa dados do anúncio e preço de referência sem criar custo de compra',async()=>{
 const app=await setup(),auth=await authorize(app),response=await app.handler(request('item',{cookie:auth.cookie,query:{id:fixture.permalink}})),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.item.title,fixture.title);assert.equal(data.item.categoryName,'Categoria teste');assert.equal(data.item.weight,.75);assert.equal(data.item.price,54.9);assert.equal(data.item.cost,undefined);assert.equal(data.item.sellerId,123);
 assert.equal(data.commissions.quotes.ml.commission,14);assert.equal(data.commissions.quotes.mlPremium.commission,19);assert.equal(data.commissions.price,54.9);assert.equal(data.commissions.categoryId,fixture.category_id);
 assert.ok(app.calls.every(c=>c.init.method===undefined||c.url=== 'https://api.mercadolibre.com/oauth/token'));
});
test('não usa o campo de preço depreciado quando a API de preço não está disponível',async()=>{
 const app=await setup({noPrice:true}),auth=await authorize(app),response=await app.handler(request('item',{cookie:auth.cookie,query:{id:fixture.id}}));assert.equal((await response.json()).item.price,null);
});
test('não permite vincular anúncios de outra conta',async()=>{
 const app=await setup({item:{...fixture,seller_id:456}}),auth=await authorize(app),response=await app.handler(request('item',{cookie:auth.cookie,query:{id:fixture.id}}));assert.equal(response.status,403);assert.equal((await response.json()).error,'NOT_YOUR_ITEM');
});
test('sessão expirada ou adulterada não acessa o catálogo; desconexão remove o cookie',async()=>{
 const app=await setup(),auth=await authorize(app);
 assert.equal((await app.handler(request('items'))).status,401);
 const altered=auth.cookie.slice(0,-8)+'xxxxxxxx';assert.equal((await app.handler(request('items',{cookie:altered}))).status,401);
 const disconnected=await app.handler(request('disconnect',{method:'POST',cookie:auth.cookie}));assert.equal(disconnected.status,200);assert.ok(disconnected.headers.get('set-cookie').includes('Max-Age=0'));
 app.advance(21601000);assert.equal((await app.handler(request('items',{cookie:auth.cookie}))).status,401);
});
test('valida IDs e URLs e não transforma consultas em proxy de URLs arbitrárias',async()=>{
 const {itemId,normalizeItem}=await modulePromise;
 assert.equal(itemId('MLB-1234567890'),fixture.id);assert.equal(itemId(fixture.permalink),fixture.id);
 assert.equal(itemId('https://www.mercadolivre.com.br/p/MLB12345?item_id=MLB1234567890'),fixture.id);
 assert.equal(itemId('https://www.mercadolivre.com.br/p/MLB12345'),null);
 assert.equal(itemId('http://169.254.169.254/latest/meta-data/MLB1234567890'),null);
 assert.equal(itemId('https://mercadolivre.com.br.evil.example/MLB1234567890'),null);
 assert.equal(itemId('https://evil@www.mercadolivre.com.br/MLB1234567890'),null);
 assert.equal(normalizeItem({...fixture,attributes:[],shipping:{}}).weight,null);
 assert.equal(normalizeItem({...fixture,attributes:[],shipping:{dimensions:'10x20x30,500'}}).weight,.5);
 assert.equal(normalizeItem({...fixture,attributes:[{id:'WEIGHT',value_name:'1,25 kg'}]}).weight,1.25);
 const app=await setup(),auth=await authorize(app),count=app.calls.length;
 assert.equal((await app.handler(request('item',{cookie:auth.cookie,query:{id:'https://evil.example/'}}))).status,400);assert.equal(app.calls.length,count);
 assert.equal((await app.handler(request('item',{cookie:auth.cookie,method:'POST',query:{id:fixture.id}}))).status,405);
});
test('erros de limite não vazam respostas ou tokens da API',async()=>{
 const app=await setup(),auth=await authorize(app),{createHandler}=await modulePromise;
 const failing=createHandler({env,now:()=>Date.parse('2026-11-11T12:00:00Z'),fetchImpl:async()=>Response.json({error:'TEST_ACCESS_TOKEN_NOT_REAL'},{status:429})});
 const response=await failing(request('items',{cookie:auth.cookie})),body=await response.text();assert.equal(response.status,429);assert.ok(!body.includes('TEST_ACCESS_TOKEN'));assert.ok(body.includes('limitou'));
});

test('cotação oficial exige sessão e origem, deriva categoria/logística do anúncio próprio e usa apenas GET na API',async()=>{
 const app=await setup({item:{...fixture,shipping:{mode:'me2',logistic_type:'cross_docking'}}}),auth=await authorize(app);
 const body={itemId:fixture.id,cost:30,extra:0,margin:20,weight:.35,tax:6,mlShipping:0,categoryId:'MLB_INJETADA'};
 assert.equal((await app.handler(request('pricing',{method:'POST',body}))).status,401);
 assert.equal((await app.handler(request('pricing',{method:'POST',cookie:auth.cookie,body,ownOrigin:'https://evil.example'}))).status,403);
 const response=await app.handler(request('pricing',{method:'POST',cookie:auth.cookie,body})),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.pricing.quotes.ml.desired.price,60);assert.equal(data.pricing.categoryId,fixture.category_id);
 assert.ok(app.calls.filter(c=>c.url.includes('listing_prices')).every(c=>new URL(c.url).searchParams.get('logistic_type')==='cross_docking'&&new URL(c.url).searchParams.get('category_id')===fixture.category_id));
 assert.ok(app.calls.every(c=>c.init.method===undefined||c.url.endsWith('/oauth/token')));
 assert.ok(!JSON.stringify(data).includes('TEST_ACCESS_TOKEN'));assert.equal(response.headers.get('cache-control'),'no-store');
 const other=await setup({item:{...fixture,seller_id:999}}),otherAuth=await authorize(other);
 assert.equal((await other.handler(request('pricing',{method:'POST',cookie:otherAuth.cookie,body}))).status,403);
 assert.ok(!other.calls.some(c=>c.url.includes('listing_prices')));
});

test('importar anúncio preenche estimativa de frete e endpoint de frete não consulta anúncios de outra conta',async()=>{
 const app=await setup({item:{...fixture,shipping:{mode:'me2',logistic_type:'cross_docking',free_shipping:true}}}),auth=await authorize(app);
 const data=await (await app.handler(request('item',{cookie:auth.cookie,query:{id:fixture.id}}))).json();
 assert.equal(data.item.shippingQuote.amount,18.5);assert.equal(data.item.shippingQuote.price,54.9);assert.equal(data.shippingMessage,null);
 const frete=await (await app.handler(request('shipping',{cookie:auth.cookie,query:{id:fixture.id}}))).json();assert.equal(frete.shipping.amount,18.5);
 const call=app.calls.find(c=>c.url.includes('/shipping_options/free')),query=new URL(call.url).searchParams;
 assert.equal(query.get('item_id'),fixture.id);assert.equal(query.get('free_shipping'),'true');assert.equal(query.get('verbose'),'true');assert.equal(query.get('item_price'),'54.90');
 assert.equal((await app.handler(request('shipping',{query:{id:fixture.id}}))).status,401);
 const other=await setup({item:{...fixture,seller_id:999}}),otherAuth=await authorize(other);
 assert.equal((await other.handler(request('shipping',{cookie:otherAuth.cookie,query:{id:fixture.id}}))).status,403);
 assert.ok(!other.calls.some(c=>c.url.includes('shipping_options/free')));
});

test('categorias e kit exigem sessão, origem e identificadores válidos',async()=>{
 const app=await setup(),auth=await authorize(app),body={cost:30,extra:0,weight:.75,margin:20,tax:6,mlShipping:0,context:{categoryId:'MLB1234',categoryName:'Teste',referenceItemId:fixture.id,dimensions:null}};
 assert.equal((await app.handler(request('kit-pricing',{method:'POST',body}))).status,401);
 assert.equal((await app.handler(request('kit-pricing',{method:'POST',body,cookie:auth.cookie,ownOrigin:'https://evil.example'}))).status,403);
 const response=await app.handler(request('kit-pricing',{method:'POST',body,cookie:auth.cookie}));assert.equal(response.status,200);assert.equal((await response.json()).pricing.kind,'kit');
 const categories=await app.handler(request('categories',{cookie:auth.cookie,query:{q:'kit disjuntores'}}));assert.deepEqual((await categories.json()).categories,[{id:'MLB1234',name:'Categoria teste'}]);
 assert.equal((await app.handler(request('categories',{cookie:auth.cookie,query:{q:'a'}}))).status,400);
});

test('diagnóstico OAuth informa só a etapa e o código permitido, sem expor a resposta da API',async()=>{
 const app=await setup({fetch:async()=>Response.json({error:'invalid_client',error_description:'TEST_SECRET_NOT_REAL',access_token:'TEST_TOKEN_NOT_REAL'}, {status:400})});
 const start=await app.handler(request('connect',{method:'POST'})),auth=new URL((await start.json()).authorizationUrl),cookie=start.headers.get('set-cookie').split(';')[0];
 const response=await app.handler(request('callback',{cookie,query:{state:auth.searchParams.get('state'),code:'TEST_AUTHORIZATION_CODE'}})),location=response.headers.get('location');
 assert.equal(new URL(location).searchParams.get('ml_reason'),'exchange_400_invalid_client');
 assert.ok(!/TEST_SECRET|TEST_TOKEN|TEST_AUTHORIZATION_CODE/.test(location));
});

test('redirecionamento inesperado no token é rejeitado sem seguir outro destino',async()=>{
 const app=await setup({fetch:async()=>new Response('',{status:302,headers:{Location:'https://outro.example'}})});
 const start=await app.handler(request('connect',{method:'POST'})),auth=new URL((await start.json()).authorizationUrl),cookie=start.headers.get('set-cookie').split(';')[0];
 const response=await app.handler(request('callback',{cookie,query:{state:auth.searchParams.get('state'),code:'TEST_ONLY'}}));
 assert.equal(new URL(response.headers.get('location')).searchParams.get('ml_reason'),'exchange_302');assert.equal(app.calls.length,1);assert.equal(app.calls[0].url,'https://api.mercadolibre.com/oauth/token');
});
