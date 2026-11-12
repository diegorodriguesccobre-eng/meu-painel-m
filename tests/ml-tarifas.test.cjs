const {test}=require('node:test');
const assert=require('node:assert/strict');
const item={id:'MLB1234567890',condition:'new',category_id:'MLB1234',shipping:{mode:'me2',logistic_type:'cross_docking'}};
const input={cost:30,extra:0,margin:20,tax:6,mlShipping:0,weight:.35};
const load=import('../netlify/lib/ml-tarifas.mjs');
function simulator(fees){const calls=[];return {calls,api:async path=>{const u=new URL('https://api.mercadolibre.com'+path);calls.push(u);const price=Number(u.searchParams.get('price'));return ['gold_special','gold_pro'].map((listing_type_id,i)=>{const {rate,fixed}=fees(price,i);return {currency_id:'BRL',listing_type_id,listing_fee_amount:0,sale_fee_amount:Math.round(price*rate)/100+fixed,sale_fee_details:{percentage_fee:rate,fixed_fee:fixed}};});}};}
test('3 produtos: tarifas oficiais mantêm margem e não somam parcela fixa duas vezes',async()=>{
 const {officialPricing}=await load;
 for(const [cost,margin] of [[30,20],[25,25],[60,12]]){
  const mock=simulator((p,i)=>({rate:14+i*5,fixed:6}));
  const result=await officialPricing({item,input:{...input,cost,margin},api:mock.api});
  for(const [scenario,v] of Object.entries(result.quotes))for(const [kind,q] of Object.entries(v)){
   const target=kind==='minimum'?10:margin,rate=scenario==='ml'?14:19;
   assert.ok(q.margin>=target-1e-8);
   assert.ok(Math.abs(q.profit-(q.price*.94-cost-q.feeAmount))<1e-8);
   const prev=q.price-.01,prevFee=Math.round(prev*rate)/100+6;
   assert.ok((prev*.94-cost-prevFee)/prev*100<target-1e-8);
   assert.equal(q.feeAmount,q.saleFeeAmount);
  }
  assert.ok(mock.calls.every(u=>u.searchParams.get('category_id')===item.category_id&&u.searchParams.get('shipping_mode')==='me2'&&u.searchParams.get('logistic_type')==='cross_docking'&&u.searchParams.get('billable_weight')==='350'));
 }
});
test('mudança de faixa consulta de novo a tarifa do preço sugerido',async()=>{
 const {officialPricing}=await load,mock=simulator((p,i)=>({rate:p<79?14+i*5:12+i*5,fixed:p<79?6:0}));
 const result=await officialPricing({item,input:{...input,cost:58,margin:20},api:mock.api});
 for(const v of Object.values(result.quotes))for(const q of Object.values(v)){
  assert.equal(q.fixed,q.price<79?6:0);assert.ok(q.margin>=10);
 }
 assert.ok(mock.calls.some(u=>Number(u.searchParams.get('price'))<79));assert.ok(mock.calls.some(u=>Number(u.searchParams.get('price'))>=79));
});
test('frete segue o limite sem frete e os custos não dependem de taxas globais',async()=>{
 const {officialPricing}=await load,mock=simulator(()=>({rate:14,fixed:6}));
 const below=await officialPricing({item,input:{...input,cost:54,mlShipping:100},api:mock.api});
 assert.equal(below.quotes.ml.desired.price,100);assert.equal(below.quotes.ml.desired.shippingApplied,0);
 const above=await officialPricing({item,input:{...input,cost:60,mlShipping:20},api:mock.api});
 assert.equal(above.quotes.ml.desired.shippingApplied,20);assert.ok(above.quotes.ml.desired.margin>=20);
});
test('não aceita tarifas incompletas, categoria ou logística ausentes e margens inviáveis',async()=>{
 const {officialPricing}=await load,mock=simulator(()=>({rate:14,fixed:6}));
 await assert.rejects(officialPricing({item:{...item,shipping:{}},input,api:mock.api}),/modo de envio/);
 await assert.rejects(officialPricing({item:{...item,category_id:null},input,api:mock.api}),/categoria/);
 await assert.rejects(officialPricing({item,input:{...input,margin:95},api:mock.api}),/inviável|somar/);
 await assert.rejects(officialPricing({item,input,api:async()=>[{currency_id:'BRL',listing_type_id:'gold_special',sale_fee_amount:3}]}),/completa/);
});

test('frete automático por preço e modalidade mantém margem e usa peso faturável oficial',async()=>{
 const {officialPricing}=await load,fees=simulator((p,i)=>({rate:14+i*5,fixed:6})),shippingCalls=[];
 const api=async path=>{
  if(!path.includes('shipping_options/free'))return fees.api(path);
  const query=new URL('https://api.mercadolibre.com'+path).searchParams;shippingCalls.push(query);
  const price=Number(query.get('item_price')),amount=query.get('free_shipping')==='true'?(query.get('listing_type_id')==='gold_pro'?23:20)+(price>=200?2:0):0;
  return {coverage:{all_country:{list_cost:amount,currency_id:'BRL',billable_weight:950}}};
 };
 const result=await officialPricing({item:{...item,seller_id:123,listing_type_id:'gold_special'},input:{...input,cost:90,autoShipping:true,mlShipping:999},api});
 assert.equal(result.inputs.mlShipping,result.shippingQuote.amount);assert.equal(result.shippingQuote.amount,20);
 assert.ok(shippingCalls.some(q=>q.get('listing_type_id')==='gold_pro'));assert.ok(shippingCalls.every(q=>q.get('item_id')===item.id&&q.get('verbose')==='true'));
 for(const v of Object.values(result.quotes))for(const [kind,q] of Object.entries(v)){
  assert.ok(q.shippingApplied>=20);assert.ok(q.margin>=(kind==='desired'?20:10)-1e-8);
  assert.ok(Math.abs(q.profit-(q.price*.94-90-q.shippingApplied-q.feeAmount))<1e-8);
 }
 assert.ok(fees.calls.some(u=>u.searchParams.get('billable_weight')==='950'));
 const below=await officialPricing({item:{...item,seller_id:123,listing_type_id:'gold_special',shipping:{...item.shipping,free_shipping:true}},input:{...input,cost:15,autoShipping:true},api});
 assert.equal(below.quotes.ml.desired.shippingApplied,20);assert.ok(below.quotes.ml.desired.margin>=20);
});

test('list_cost descontado é usado uma vez e frete ausente nunca se torna zero',async()=>{
 const {shippingQuote}=await import('../netlify/lib/ml-frete.mjs');
 const own={...item,seller_id:123,listing_type_id:'gold_special',shipping:{...item.shipping,free_shipping:true,dimensions:'10x20x30,500'}};
 const q=await shippingQuote({item:own,price:150,weight:.75,api:async path=>{assert.equal(new URL('https://api.mercadolibre.com'+path).searchParams.get('dimensions'),'10x20x30,750');return {coverage:{all_country:{list_cost:12,currency_id:'BRL',billable_weight:1000},discount:{rate:.4,promoted_amount:20}}};}});
 assert.equal(q.amount,12);assert.equal(q.billableWeight,1000);
 await assert.rejects(shippingQuote({item:own,api:async()=>({coverage:{all_country:{currency_id:'BRL'}}})}),/incompleta/);
 await assert.rejects(shippingQuote({item:own,api:async()=>{throw Object.assign(Error('denied'),{status:403});}}),/não foi considerado zero/);
 const zero=await shippingQuote({item:own,api:async()=>({coverage:{all_country:{currency_id:'BRL',list_cost:0}}})});assert.equal(zero.amount,0);
 await assert.rejects(shippingQuote({item:{...own,shipping:{mode:'custom'}},api:async()=>{throw Error('não chamar');}}),/não usa Mercado Envios/);
});

test('regras oficiais: cobra custo retornado abaixo de 79 e simula frete rápido a partir de 79',async()=>{
 const {shippingQuote}=await import('../netlify/lib/ml-frete.mjs');
 const own={...item,seller_id:123,listing_type_id:'gold_special',shipping:{...item.shipping,free_shipping:false}};
 for(const price of [24,78.99,79,99.99,100]){
  const result=await shippingQuote({item:own,price,api:async path=>{const params=new URL('https://api.mercadolibre.com'+path).searchParams;assert.equal(params.get('free_shipping'),String(price>=79));return {coverage:{all_country:{list_cost:price<79?6.85:12.95,currency_id:'BRL'}}};}});
  assert.equal(result.amount,price<79?6.85:12.95);
 }
 const oldMandatory={...own,shipping:{...own.shipping,free_shipping:true,tags:['mandatory_free_shipping']}};
 const lower=await shippingQuote({item:oldMandatory,price:60,api:async path=>{assert.equal(new URL('https://api.mercadolibre.com'+path).searchParams.get('free_shipping'),'false');return {coverage:{all_country:{list_cost:8.15,currency_id:'BRL'}}};}});assert.equal(lower.amount,8.15);
});
