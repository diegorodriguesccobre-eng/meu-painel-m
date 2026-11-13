const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const core=script.slice(0,script.indexOf('let state=defaults()'));
const csv=script.slice(script.indexOf('function csvCell'),script.indexOf("$('export').onclick"));
const context=vm.createContext({URL});
vm.runInContext(core+csv+';globalThis.api={adsRate,calculate,minimumPrice,saleResult,saleBreakdown,kitTotals,defaults,withShopeePolicy,buildBackup,parseBackup,buildCSV,validState,copyOfficialPricing};',context);
const api=context.api;
const fees=api.withShopeePolicy(api.defaults().fees);
const product={id:'produto',name:'Teste',category:'Teste',cost:100,extra:0,weight:.35,margin:20,mlShipping:20,feeSnapshot:fees};
const clone=value=>JSON.parse(JSON.stringify(value));

test('Ads de cada marketplace altera somente os respectivos preços, lucros e mínimos',()=>{
 const p={...product,adsMl:6,adsShopee:12};
 for(const scenario of ['ml','mlPremium','shopee']){
  const fee=fees[scenario==='mlPremium'?'ml':scenario];
  const result=api.calculate(p,fee,scenario),minimum=api.minimumPrice(p,fee,scenario);
  const rate=scenario==='shopee'?12:6;
  assert.equal(result.adsRate,rate);assert.ok(Math.abs(result.adsAmount-result.price*rate/100)<1e-8);
  assert.ok(result.margin>=20-1e-8);assert.ok(minimum.margin>=10-1e-8);
  assert.equal(api.saleBreakdown(p,fee,scenario,result).adsRate,rate);
  const other={...p,[scenario==='shopee'?'adsMl':'adsShopee']:30};
  assert.deepEqual(clone(api.calculate(other,fee,scenario)),clone(result));
  assert.deepEqual(clone(api.minimumPrice(other,fee,scenario)),clone(minimum));
 }
 assert.equal(api.adsRate(p,'mlPremium'),6);
 const zero={...p,ads:50,adsMl:0,adsShopee:0};
 assert.equal(api.calculate(zero,fees.ml,'ml').adsAmount,0);
 assert.equal(api.calculate(zero,fees.shopee,'shopee').adsAmount,0);
});

test('legado com Ads único conserva exatamente os resultados ao separar e restaurar',()=>{
 const kit={id:'kit',name:'Kit legado',margin:20,extra:3,ads:8,mlShipping:20,feeSnapshot:fees,items:[{productId:product.id,quantity:2}]};
 const legacy={...product,ads:6},split={...product,adsMl:6,adsShopee:6};
 const saved=api.parseBackup(JSON.stringify({format:'margem-backup',version:13,data:{products:[legacy],kits:[kit],fees}}));
 for(const scenario of ['ml','mlPremium','shopee']){
  const fee=fees[scenario==='mlPremium'?'ml':scenario];
  assert.deepEqual(clone(api.calculate(saved.products[0],fee,scenario)),clone(api.calculate(split,fee,scenario)));
  assert.deepEqual(clone(api.minimumPrice(saved.products[0],fee,scenario)),clone(api.minimumPrice(split,fee,scenario)));
  const before=api.kitTotals(saved.kits[0],saved.products),after=api.kitTotals({...kit,ads:undefined,adsMl:8,adsShopee:8},[split]);
  assert.deepEqual(clone(api.calculate(before,fee,scenario)),clone(api.calculate(after,fee,scenario)));
 }
 assert.equal(api.adsRate({ads:6,adsMl:0},'ml'),0);assert.equal(api.adsRate({ads:6,adsMl:0},'shopee'),6);
});

test('kits preservam dois percentuais próprios e ignoram os Ads dos componentes',()=>{
 const component={...product,adsMl:40,adsShopee:50};
 const kit={id:'kit',name:'Kit',margin:20,extra:0,mlShipping:20,adsMl:5,adsShopee:9,feeSnapshot:fees,items:[{productId:component.id,quantity:3}]};
 const totals=api.kitTotals(kit,[component]),changed=api.kitTotals(kit,[{...component,adsMl:0,adsShopee:0}]);
 assert.equal(totals.adsMl,5);assert.equal(totals.adsShopee,9);
 for(const scenario of ['ml','mlPremium','shopee']){
  const fee=fees[scenario==='mlPremium'?'ml':scenario],result=api.calculate(totals,fee,scenario);
  assert.equal(result.adsRate,scenario==='shopee'?9:5);assert.deepEqual(clone(result),clone(api.calculate(changed,fee,scenario)));
 }
 const backup=api.buildBackup({products:[component],kits:[kit],fees}),restored=api.parseBackup(backup);
 assert.equal(JSON.parse(backup).version,15);
 assert.equal(restored.products[0].adsMl,40);assert.equal(restored.products[0].adsShopee,50);
 assert.equal(restored.kits[0].adsMl,5);assert.equal(restored.kits[0].adsShopee,9);
 const lines=api.buildCSV([{...product,adsMl:5,adsShopee:9}],fees).split('\r\n'),header=lines[0].split(';'),row=lines[1].split(';');
 assert.equal(row.length,header.length);
 assert.equal(row[header.indexOf('"Ads Mercado Livre (%)"')],'"5,00"');
 assert.equal(row[header.indexOf('"Ads Shopee (%)"')],'"9,00"');
 for(const field of ['adsMl','adsShopee'])for(const value of [-1,100,null,'5',NaN,Infinity])assert.equal(api.validState({products:[{...product,[field]:value}],kits:[],fees}),false);
});

test('preço atual do ML usa Ads ML mesmo com Ads Shopee diferente',()=>{
 const p={...product,adsMl:6,adsShopee:30,feeSnapshot:{...fees,ml:{...fees.ml,fixed:0}},mercadoLivre:{listingType:'gold_special',price:200}};
 const result=api.saleResult(p,fees.ml,'ml');assert.equal(result.price,200);assert.equal(result.adsAmount,12);assert.equal(result.profit,28);
 assert.deepEqual(clone(api.saleResult({...p,adsShopee:0},fees.ml,'ml')),clone(result));
});

function formHarness(){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,elements:{}});return nodes.get(id);};
 const c=vm.createContext({URL,$:get});
 vm.runInContext(core+`\nlet state={products:[],kits:[],fees:defaults().fees},mlLinkedDraft={itemId:'MLB1234567890'},kitItems=new Map(),kitEditing=null,kitPricingDraft=null;
 function readKitContext(){return {categoryId:'MLB1234',categoryName:'Teste',referenceItemId:'MLB1234567890',dimensions:null};}
 `+script.slice(script.indexOf('function readKitDraft'),script.indexOf('async function requestKitPricing'))+
 script.slice(script.indexOf('function pricingInput'),script.indexOf('function renderAutoPricing'))+
 ';globalThis.testApi={pricingInput,pricingMatches,readKitDraft,kitPricingInput,kitInputKey,kitPricingMatches};',c);
 get('product-form').elements=Object.fromEntries(Object.entries({cost:30,extra:0,margin:20,weight:.35,mlShipping:0,adsMl:6,adsShopee:15,'product-ml-tax':6}).map(([k,value])=>[k,{value:String(value)}]));
 for(const [id,value] of Object.entries({'kit-name':'Kit','kit-margin':20,'kit-extra':0,'kit-shipping':0,'kit-ads-ml':6,'kit-ads-shopee':15}))get(id).value=String(value);
 return {get,c,api:c.testApi};
}

test('consulta de produto e kit envia somente Ads ML; editar Shopee mantém a chave',()=>{
 const h=formHarness(),before=h.api.pricingInput();
 assert.equal(before.ads,6);assert.equal(before.adsMl,undefined);assert.equal(before.adsShopee,undefined);
 h.get('product-form').elements.adsShopee.value='21';assert.deepEqual(clone(h.api.pricingInput()),clone(before));
 h.get('product-form').elements.adsMl.value='8';assert.equal(h.api.pricingInput().ads,8);
 const totals={cost:30,extra:0,weight:.35,margin:20,mlShipping:0,adsMl:6,adsShopee:15,feeSnapshot:fees};
 const input=h.api.kitPricingInput(totals),key=h.api.kitInputKey(input);
 assert.equal(input.ads,6);assert.equal(h.api.kitInputKey(h.api.kitPricingInput({...totals,adsShopee:21})),key);
 assert.notEqual(h.api.kitInputKey(h.api.kitPricingInput({...totals,adsMl:8})),key);
 assert.equal(h.api.readKitDraft().adsMl,6);assert.equal(h.api.readKitDraft().adsShopee,15);
});

test('cotação oficial permanece válida ao separar Ads antigo ou editar somente Shopee',async()=>{
 const {officialPricing}=await import('../netlify/lib/ml-tarifas.mjs');
 const item={id:'MLB1234567890',category_id:'MLB1234',shipping:{mode:'me2',logistic_type:'cross_docking'}};
 const pricing=await officialPricing({item,input:{cost:30,extra:0,margin:20,tax:6,ads:6,weight:.35,mlShipping:0},api:async request=>{
  const price=Number(new URL('https://api.mercadolibre.com'+request).searchParams.get('price'));
  return ['gold_special','gold_pro'].map((listing_type_id,i)=>({listing_type_id,currency_id:'BRL',listing_fee_amount:0,sale_fee_amount:Math.round(price*(14+i*5))/100+6,sale_fee_details:{percentage_fee:14+i*5,fixed_fee:6}}));
 }});
 const legacy={...product,cost:30,mlShipping:0,ads:6,mercadoLivre:{itemId:item.id},mlPricing:pricing};
 const split={...legacy,ads:undefined,adsMl:6,adsShopee:15};
 for(const scenario of ['ml','mlPremium']){
  assert.deepEqual(clone(api.calculate(legacy,fees.ml,scenario)),clone(api.calculate(split,fees.ml,scenario)));
  assert.deepEqual(clone(api.minimumPrice(legacy,fees.ml,scenario)),clone(api.minimumPrice(split,fees.ml,scenario)));
  assert.equal(api.calculate({...split,adsMl:7},fees.ml,scenario),null);
 }
 const h=formHarness();h.get('product-form').elements.mlShipping.value='0';
 const input=h.api.pricingInput();pricing.inputs.autoShipping=undefined;input.autoShipping=undefined;
 assert.equal(h.api.pricingMatches(pricing,input),true);
 h.get('product-form').elements.adsShopee.value='21';assert.equal(h.api.pricingMatches(pricing,{...h.api.pricingInput(),autoShipping:undefined}),true);
 h.get('product-form').elements.adsMl.value='8';assert.equal(h.api.pricingMatches(pricing,{...h.api.pricingInput(),autoShipping:undefined}),false);
 const kitContext={categoryId:item.category_id,categoryName:'Teste',referenceItemId:item.id,dimensions:null};
 const kitQuote={...pricing,kind:'kit',context:kitContext};
 assert.equal(h.api.kitPricingMatches(kitQuote,{...pricing.inputs,context:kitContext}),true);
 assert.equal(h.api.kitPricingMatches(kitQuote,{...pricing.inputs,ads:7,context:kitContext}),false);
});
