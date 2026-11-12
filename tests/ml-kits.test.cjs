const {test}=require('node:test');
const assert=require('node:assert/strict');
const modulePromise=import('../netlify/lib/ml-kits.mjs');
const ref={id:'MLB1234567890',seller_id:123,category_id:'MLB1111',condition:'new',shipping:{mode:'me2',logistic_type:'cross_docking',dimensions:'100x100x100,99999',free_shipping:true}};
const category={id:'MLB4321',name:'Categoria própria do kit',children_categories:[],settings:{listing_allowed:true,status:'enabled',shipping_modes:['me2'],catalog_domain:'MLB-CIRCUIT_BREAKERS'}};
const input={cost:60,extra:5,margin:20,weight:1.2,tax:6,mlShipping:0,context:{categoryId:category.id,categoryName:'Não confiar neste nome',referenceItemId:ref.id,dimensions:null}};
function mock({reference=ref,selectedCategory=category}={}){const calls=[];return {calls,api:async path=>{
 calls.push(path);const u=new URL('https://api.mercadolibre.com'+path);
 if(u.pathname==='/items/'+ref.id)return reference;
 if(u.pathname==='/categories/'+category.id)return selectedCategory;
 if(u.pathname==='/users/me')return {id:123,seller_reputation:{level_id:'5_green'}};
 if(u.pathname==='/sites/MLB/listing_prices'){assert.equal(u.searchParams.get('category_id'),category.id);const p=Number(u.searchParams.get('price'));return ['gold_special','gold_pro'].map((listing_type_id,i)=>({listing_type_id,currency_id:'BRL',listing_fee_amount:0,sale_fee_amount:Math.round(p*(12+i*5))/100,sale_fee_details:{percentage_fee:12+i*5,fixed_fee:0}}));}
 if(u.pathname==='/users/123/shipping_options/free'){assert.equal(u.searchParams.get('item_id'),null);assert.equal(u.searchParams.get('category_id'),category.id);assert.equal(u.searchParams.get('dimensions'),'10x20x30,1200');return {coverage:{all_country:{list_cost:20,currency_id:'BRL',billable_weight:1200}}};}
 throw Error('Endpoint inesperado: '+path);
}};}
test('kit usa sua categoria, custo e peso total; nunca herda embalagem ou frete do componente',async()=>{
 const {kitPricing}=await modulePromise,m=mock(),p=await kitPricing({input,sellerId:123,api:m.api});
 assert.equal(p.kind,'kit');assert.equal(p.categoryId,category.id);assert.equal(p.context.categoryName,category.name);assert.equal(p.context.dimensions,null);
 assert.equal(p.inputs.weight,1.2);assert.equal(p.shippingQuote.billableWeight,1200);assert.equal(p.shippingQuote.source,'mercadolivre-shipping-table');
 assert.equal(p.quotes.ml.desired.commission,12);assert.equal(p.quotes.mlPremium.desired.commission,17);
 assert.ok(!m.calls.some(path=>path.includes('shipping_options/free')));
 for(const v of Object.values(p.quotes))for(const [kind,q] of Object.entries(v)){assert.ok(q.margin>=(kind==='desired'?20:10)-1e-8);assert.ok(Math.abs(q.profit-(q.price*.94-65-q.shippingApplied-q.feeAmount))<1e-8);}
});
test('com medidas reais do kit consulta frete por dimensões, sem usar item_id do componente',async()=>{
 const {kitPricing}=await modulePromise,m=mock(),p=await kitPricing({input:{...input,context:{...input.context,dimensions:{height:10,width:20,length:30}}},sellerId:123,api:m.api});
 assert.equal(p.shippingQuote.source,'mercadolivre-shipping-options');assert.equal(p.quotes.ml.desired.shippingApplied,20);
 assert.ok(m.calls.some(path=>path.includes('shipping_options/free')));assert.ok(!m.calls.some(path=>path.includes('100x100x100')));
});
test('bloqueia referência de outra conta, categoria pai e medidas incompletas',async()=>{
 const {kitPricing}=await modulePromise;
 const other=mock({reference:{...ref,seller_id:999}});await assert.rejects(kitPricing({input,sellerId:123,api:other.api}),/conta conectada/);assert.equal(other.calls.length,1);
 const parent=mock({selectedCategory:{...category,children_categories:[{id:'MLB1'}]}});await assert.rejects(kitPricing({input,sellerId:123,api:parent.api}),/categoria final/);
 const dimensions=mock();await assert.rejects(kitPricing({input:{...input,context:{...input.context,dimensions:{height:10,width:20}}},sellerId:123,api:dimensions.api}),/três medidas/);assert.equal(dimensions.calls.length,0);
});
