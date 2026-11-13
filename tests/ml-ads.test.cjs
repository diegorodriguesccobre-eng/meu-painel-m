const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const modulePromise=import('../netlify/lib/ml-ads.mjs');
const now=()=>Date.parse('2026-11-13T15:00:00Z');
const item='MLB1234567890',other='MLB9876543210';
const page=(results,offset=0,total=results.length,limit=50)=>({paging:{offset,total,limit},results});
function fixture(options={}){
 const calls=[];
 const api=async(path,version)=>{
  calls.push({path,version});const u=new URL(path,'https://api.mercadolibre.com');
  if(u.pathname==='/items/bulk')return [item,other].map(id=>({code:200,body:{id,seller_id:options.foreign?999:123}}));
  if(u.pathname==='/advertising/advertisers'){
   assert.equal(version,1);if(options.denied)throw Object.assign(Error('API_ERROR'),{status:options.denied});
   return {advertisers:[{advertiser_id:77,site_id:'MLB'},{advertiser_id:99,site_id:'MLM'}]};
  }
  assert.equal(version,2);
  if(u.pathname.endsWith('/ad_groups/search')){
   assert.equal(u.searchParams.get('filters[item_ids]'),options.ids?.join(',')??item);
   return options.groups??page([{id:80,advertiser_id:77}]);
  }
  assert.equal(u.pathname,'/advertising/MLB/product_ads/ad_groups/80/ads');
  assert.equal(u.searchParams.get('date_from'),'2026-10-14');assert.equal(u.searchParams.get('date_to'),'2026-11-12');
  if(options.pages)return options.pages(Number(u.searchParams.get('offset')));
  return options.metrics??page([{item_id:item,campaign_id:10,ad_group_id:80,metrics:{cost:60,total_amount:1000,clicks:120}}, {item_id:other,campaign_id:10,ad_group_id:80,metrics:{cost:999,total_amount:9999,clicks:12}}]);
 };
 return {calls,run:async()=>{const {productAds}=await modulePromise;return productAds({input:{itemIds:options.ids??[item]},sellerId:123,api,now});}};
}
test('período usa 30 dias encerrados no fuso de São Paulo, inclusive na virada UTC',async()=>{
 const {adsPeriod}=await modulePromise;
 assert.deepEqual(adsPeriod(now),{dateFrom:'2026-10-14',dateTo:'2026-11-12'});
 assert.deepEqual(adsPeriod(()=>Date.parse('2026-11-13T01:00:00Z')),{dateFrom:'2026-10-13',dateTo:'2026-11-11'});
});
test('consulta atual v2 apura ACOS e ROAS do item, sem usar totais de grupos compartilhados',async()=>{
 const f=fixture(),data=await f.run();assert.equal(f.calls.length,4);
 assert.equal(data.currency,'BRL');assert.equal(data.sellerId,123);assert.equal(data.items.length,1);
 assert.deepEqual(data.items[0],{itemId:item,cost:60,revenue:1000,clicks:120,acos:6,roas:1000/60,appliedRate:6,status:'ready'});
 assert.ok(f.calls.every(c=>!c.path.includes('/ads/search')));
});
test('anúncios de outra conta são rejeitados antes de consultar publicidade',async()=>{
 const f=fixture({foreign:true});await assert.rejects(f.run(),e=>e.ads&&e.status===403);assert.equal(f.calls.length,1);
});
test('ausência de acesso e de anunciante não se transforma em investimento zero',async()=>{
 for(const status of [403,404])await assert.rejects(fixture({denied:status}).run(),e=>e.ads&&e.status===status);
});
test('soma receita e investimento antes de calcular razões; percorre todas as páginas',async()=>{
 const f=fixture({ids:[item,other],pages:offset=>page([{item_id:offset?other:item,campaign_id:10,ad_group_id:80,metrics:{cost:offset?40:60,total_amount:offset?200:1000,clicks:20}}],offset,2,1)});
 const data=await f.run();assert.equal(f.calls.length,5);assert.equal(data.items[0].acos,6);assert.equal(data.items[1].acos,20);
});
test('sem receita, sem anúncios e ACOS excessivo preservam o Ads anterior',async()=>{
 for(const [cost,revenue,status,rate,roas] of [[60,0,'no-revenue',null,0],[0,0,'no-revenue',null,null],[0,100,'ready',0,null],[100,100,'high-acos',null,1],[99.999,100,'high-acos',null,100/99.999]]){
  const result=await fixture({metrics:page([{item_id:item,campaign_id:10,ad_group_id:80,metrics:{cost,total_amount:revenue,clicks:1}}])}).run();
  assert.equal(result.items[0].status,status);assert.equal(result.items[0].appliedRate,rate);assert.equal(result.items[0].roas,roas);
 }
 const result=await fixture({groups:page([])}).run();assert.equal(result.items[0].status,'no-ad');assert.equal(result.items[0].appliedRate,null);
});
test('métricas ausentes, páginas truncadas/repetidas ou linhas duplicadas falham sem resultados parciais',async()=>{
 const row={item_id:item,campaign_id:10,ad_group_id:80,metrics:{cost:60,total_amount:1000,clicks:5}};
 for(const options of [{metrics:page([{...row,metrics:{cost:60}}])},{metrics:page([row,row])},{metrics:page([row],0,10,50)},{pages:offset=>page([row],offset,2,1)}])await assert.rejects(fixture(options).run(),e=>e.ads===true);
});
test('consulta tem limite próprio de requisições antes do orçamento gratuito do Worker',async()=>{
 const f=fixture({pages:offset=>page([{item_id:'MLB1111111111',campaign_id:offset+1,ad_group_id:80,metrics:{cost:0,total_amount:0,clicks:0}}],offset,100,1)});
 await assert.rejects(f.run(),e=>e.ads&&/plano gratuito/.test(e.message));assert.equal(f.calls.length,38);
});
test('rota Ads exige sessão, origem própria e repassa versões sem mudar escopo OAuth',async()=>{
 const {createHandler}=await import('../netlify/functions/mercadolivre.mjs');
 const {createCipheriv}=require('node:crypto'),key=Buffer.alloc(32,7),iv=Buffer.alloc(12,8),cipher=createCipheriv('aes-256-gcm',key,iv);
 const bytes=Buffer.concat([cipher.update(JSON.stringify({type:'session',exp:now()+60000,userId:123,accessToken:'TEST_ONLY'})),cipher.final()]);
 const cookie='__Host-conduz_ml_session='+Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');
 const origin='https://example.test',f=fixture();
 const handler=createHandler({now,env:{ML_CLIENT_ID:'123',ML_CLIENT_SECRET:'TEST_ONLY',ML_SESSION_SECRET:key.toString('hex'),ML_REDIRECT_URI:origin+'/api/ml/callback'},fetchImpl:async(url,init)=>{
  assert.equal(init.method,undefined);assert.equal(init.headers.Authorization,'Bearer TEST_ONLY');assert.equal(init.redirect,'manual');
  const u=new URL(url);return Response.json(await (async()=>{
   if(u.pathname==='/items/bulk')return [{code:200,body:{id:item,seller_id:123}}];
   if(u.pathname==='/advertising/advertisers'){assert.equal(init.headers['Api-Version'],'1');return {advertisers:[{advertiser_id:77,site_id:'MLB'}]};}
   assert.equal(init.headers['Api-Version'],'2');return page([]);
  })());
 }});
 const req=(headers={})=>new Request(origin+'/api/ml/ads',{method:'POST',headers,body:JSON.stringify({itemIds:[item]})});
 assert.equal((await handler(req())).status,403);
 assert.equal((await handler(req({Origin:origin,'X-Conduz-Action':'mercadolivre'}))).status,401);
 const response=await handler(req({Cookie:cookie,Origin:origin,'X-Conduz-Action':'mercadolivre'}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal((await response.json()).advertising.items[0].status,'no-ad');
});
const script=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const context=vm.createContext({URL,Intl,Date});
vm.runInContext(script.slice(0,script.indexOf('let state=defaults()'))+script.slice(script.indexOf('function applyProductAds('),script.indexOf('async function refreshRegisteredAds('))+';globalThis.api={applyProductAds,validProductAds,buildBackup,parseBackup,defaults,cardAdsHTML,calculate,saleResult,officialQuote};',context);
const app=context.api;
const product=()=>({id:'p',name:'Teste',category:'Teste',cost:100,weight:.3,extra:0,margin:20,mlShipping:20,adsMl:2,adsShopee:12,mercadoLivre:{itemId:item,sellerId:123,title:'Teste',listingType:'gold_special',permalink:'https://produto.mercadolivre.com.br/MLB-1234567890-_JM',categoryId:'MLB1234',categoryName:'Teste',catalogProductId:null,price:300,weight:.3,thumbnail:null,variationCount:0,fetchedAt:new Date(now()).toISOString()}});
test('ACOS atualiza só Ads ML, reserva é aplicada uma vez e backup v15 preserva métricas',async()=>{
 const data=await fixture().run(),p=product();app.applyProductAds(p,data,data.items[0]);assert.equal(p.adsMl,6);assert.equal(p.adsShopee,12);
 const fees=app.defaults().fees,c=app.calculate(p,fees.ml,'ml');assert.ok(Math.abs(c.adsAmount-c.price*.06)<1e-9);
 const backup=app.buildBackup({products:[p],kits:[],fees});assert.equal(JSON.parse(backup).version,15);
 const restored=app.parseBackup(backup).products[0];assert.equal(restored.mlAds.cost,60);assert.equal(restored.adsShopee,12);assert.ok(app.validProductAds(restored));
 const card=app.cardAdsHTML(p,'ml');assert.match(card,/ROAS real/);assert.match(card,/Investido/);assert.match(card,/14\/10\/2026 a 12\/11\/2026/);
 assert.doesNotMatch(app.cardAdsHTML(p,'mlPremium'),/ROAS real|Investido/);assert.doesNotMatch(app.cardAdsHTML(p,'shopee'),/ROAS real|Investido/);
});
test('sem ACOS válido não sobrescreve Ads, vínculo trocado não aceita métricas antigas',async()=>{
 for(const options of [{groups:page([])},{metrics:page([{item_id:item,campaign_id:10,ad_group_id:80,metrics:{cost:80,total_amount:0,clicks:1}}])}]){
  const data=await fixture(options).run(),p=product();app.applyProductAds(p,data,data.items[0]);assert.equal(p.adsMl,2);assert.match(app.cardAdsHTML(p,'ml'),/preservado/);
  const foreign={...p,mercadoLivre:{...p.mercadoLivre,itemId:other}};assert.equal(app.validProductAds(foreign),false);
 }
});
function syncHarness(products,loader){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{open:false,disabled:false,textContent:''});return nodes.get(id);};
 const calls=[];let saved=0;
 const ctx=vm.createContext({URL,Intl,Date:class extends Date{static now(){return now();}},$:get,persist:()=>saved++,render(){},mlRequest:async(action,options)=>{calls.push({action,options});return loader(action,options);}});
 const run=code=>vm.runInContext(code,ctx);
 run(script.slice(0,script.indexOf('let state=defaults()'))+`let state={products:${JSON.stringify(products)},kits:[],fees:defaults().fees},mlConnection={connected:true,account:{id:123}};`+script.split('\n').find(l=>l.startsWith('function pricingMatches('))+script.slice(script.indexOf('let mlAdsBusy=false'),script.indexOf('async function mlRequest(')));
 return {run,calls,get,saved:()=>saved,sync:force=>run('refreshRegisteredAds('+Boolean(force)+')'),product:()=>JSON.parse(run('JSON.stringify(state.products[0])'))};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('sincronização automática preserva edições de Shopee, usa cache e não modifica formulário aberto',async()=>{
 const data=await fixture().run(),pending=deferred(),h=syncHarness([product()],()=>pending.promise);
 const sync=h.sync();h.run('state.products[0].adsShopee=17');pending.resolve({advertising:data});await sync;
 assert.equal(h.product().adsMl,6);assert.equal(h.product().adsShopee,17);assert.equal(h.calls.length,1);
 await h.sync();assert.equal(h.calls.length,1);h.get('product-dialog').open=true;await h.sync(true);assert.equal(h.calls.length,1);
});
test('troca de conta e erros não aplicam respostas pendentes nem zeram Ads',async()=>{
 const data=await fixture().run(),pending=deferred(),h=syncHarness([product()],()=>pending.promise),sync=h.sync();
 h.run('mlConnection.account.id=999;mlAdsEpoch++');pending.resolve({advertising:data});await sync;assert.equal(h.product().adsMl,2);assert.equal(h.saved(),0);
 const denied=syncHarness([product()],async()=>{throw Error('Sem permissão para Product Ads.');});await denied.sync();assert.equal(denied.product().adsMl,2);assert.match(denied.get('ml-ads-status').textContent,/Sem permissão/);
});
test('mudança do ACOS recalcula cotação oficial com Ads ML, mantendo preços atuais e Shopee',async()=>{
 const {officialPricing}=await import('../netlify/lib/ml-tarifas.mjs');
 const mlItem={id:item,category_id:'MLB1234',shipping:{mode:'me2',logistic_type:'cross_docking'}};
 const pricingApi=async path=>{const price=Number(new URL(path,'https://api.mercadolibre.com').searchParams.get('price'));return ['gold_special','gold_pro'].map((listing_type_id,i)=>({listing_type_id,currency_id:'BRL',listing_fee_amount:0,sale_fee_amount:Math.round(price*(14+i*5))/100,sale_fee_details:{percentage_fee:14+i*5,fixed_fee:0}}));};
 const p=product(),fees=app.defaults().fees;p.feeSnapshot=fees;
 p.mlPricing=await officialPricing({item:mlItem,input:{cost:p.cost,extra:p.extra,margin:p.margin,tax:fees.ml.tax,weight:p.weight,mlShipping:p.mlShipping,ads:2},api:pricingApi,now});
 const data=await fixture().run(),h=syncHarness([p],async(action,options)=>action==='ads'?{advertising:data}:{pricing:await officialPricing({item:mlItem,input:options.body,api:pricingApi,now})});
 await h.sync();const saved=h.product();assert.equal(saved.adsMl,6);assert.equal(saved.adsShopee,12);assert.equal(saved.mercadoLivre.price,300);assert.equal(saved.mlPricing.inputs.ads,6);
 assert.ok(app.officialQuote(saved,'ml'));assert.equal(h.calls.filter(c=>c.action==='pricing').length,1);
 assert.equal(h.calls[1].options.body.ads,6);assert.equal(h.calls[1].options.body.adsShopee,undefined);
});
