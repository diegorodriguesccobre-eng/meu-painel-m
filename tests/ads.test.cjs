const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const context=vm.createContext({URL});
vm.runInContext(script.slice(0,script.indexOf('let state=defaults()'))+
 script.slice(script.indexOf('function csvCell'),script.indexOf("$('export').onclick"))+
 ';globalThis.api={calculate,minimumPrice,calculateShopee,saleResult,saleBreakdown,saleCardHTML,profitHealth,defaults,withShopeePolicy,kitTotals,validState,buildBackup,parseBackup,buildCSV,validOfficialPricing,copyOfficialPricing};',context);
const api=context.api;
const fees=api.defaults().fees;
Object.assign(fees.ml,{commission:14,premiumCommission:19,fixed:0,tax:6});
const product={id:'ads-product',name:'Produto com Ads',category:'Teste',cost:100,extra:0,weight:.35,margin:20,mlShipping:20,feeSnapshot:fees};
const link={itemId:'MLB1234567890',sellerId:123,title:'Anúncio de teste',categoryId:'MLB1234',categoryName:'Teste',catalogProductId:null,listingType:'gold_special',permalink:'https://www.mercadolivre.com.br/p/MLB1234567890',price:200,weight:.35,thumbnail:null,variationCount:0,fetchedAt:'2026-11-13T12:00:00.000Z'};
const clone=value=>JSON.parse(JSON.stringify(value));

test('Ads aumenta a sugestão e entra uma única vez no lucro dos três canais',()=>{
 for(const scenario of ['ml','mlPremium','shopee']){
  const fee=fees[scenario==='mlPremium'?'ml':scenario],before=api.calculate(product,fee,scenario),p={...product,ads:6},after=api.calculate(p,fee,scenario);
  assert.ok(after.price>before.price);assert.ok(after.margin>=20-1e-8);
  const d=api.saleBreakdown(p,fee,scenario,after);
  assert.ok(Math.abs(after.adsAmount-after.price*.06)<1e-8);
  assert.ok(Math.abs(after.profit-(after.price-d.cost-d.extra-d.tax-d.commission-d.fixed-d.returns-d.shipping-d.ads))<1e-8);
  assert.match(api.saleCardHTML(p,fee,scenario),/Ads \(6%\)/);
 }
 assert.equal(api.calculate({...product,ads:6},fees.ml,'ml').price,222.23);
});

test('preço atual permanece em R$200 e Ads muda o lucro e a classificação',()=>{
 const p={...product,mercadoLivre:link};
 const before=api.saleResult(p,fees.ml,'ml'),risk=api.saleResult({...p,ads:6},fees.ml,'ml'),low=api.saleResult({...p,ads:12},fees.ml,'ml');
 assert.equal(before.price,200);assert.equal(before.profit,40);assert.equal(api.profitHealth(before).level,'safe');
 assert.equal(risk.price,200);assert.equal(risk.adsAmount,12);assert.equal(risk.profit,28);assert.ok(Math.abs(risk.margin-14)<1e-8);assert.equal(api.profitHealth(risk).level,'risk');
 assert.equal(low.price,200);assert.equal(low.profit,16);assert.equal(api.profitHealth(low).level,'low');
 const loss=api.saleResult({...p,ads:25},fees.ml,'ml');assert.equal(loss.profit,-10);assert.equal(api.profitHealth(loss).level,'low');
});

test('mínimo de 10% considera Ads e reavalia o limite manual de frete',()=>{
 const p={...product,cost:60,ads:8};
 const result=api.minimumPrice(p,fees.ml,'ml');
 assert.ok(result.margin>=10-1e-8);
 const prev=result.price-.01;
 assert.ok((prev*(1-(14+6+8)/100)-60-result.shippingApplied)/prev*100<10);
 assert.equal(api.calculate({...product,cost:59,ads:0},fees.ml,'ml').shippingApplied,0);
 assert.equal(api.calculate({...product,cost:59,ads:10},fees.ml,'ml').shippingApplied,20);
});

function bruteShopee(p,f){
 for(let cents=1;cents<=100000;cents++){
  const price=cents/100,rate=(cents<8000?20:14)+(f.officialEventEnabled?5:0);
  const fixed=cents<900?Math.round(cents/2)/100:cents<8000?4.5:cents<10000?16:cents<20000?20:26;
  const profit=price-p.cost-p.extra-price*(f.tax+p.ads)/100-Math.round(cents*rate/100)/100-fixed-(f.easyReturnEnabled?.49:0);
  if(profit/price*100>=p.margin-1e-8)return price;
 }
 return null;
}
test('Shopee automática mantém tabela e marcações, inclusive faixas alteradas por Ads',()=>{
 for(const cost of [2,10,45,65,100])for(const ads of [0,6,12.35])for(const enabled of [false,true]){
  const f={...api.withShopeePolicy(fees).shopee,easyReturnEnabled:enabled,officialEventEnabled:enabled};
  const p={...product,cost,extra:.31,ads,margin:20},result=api.calculateShopee(p,f);
  assert.ok(result);assert.equal(result.price,bruteShopee(p,f));
  assert.ok(result.margin>=20-1e-8);assert.equal(result.easyReturnApplied,enabled?.49:0);
 }
});

test('kit aplica seu próprio Ads uma vez e ignora Ads dos componentes',()=>{
 const component={...product,ads:40,cost:10,extra:1};
 const kit={id:'kit-ads',name:'Kit com Ads',margin:20,extra:2,mlShipping:20,ads:6,feeSnapshot:fees,items:[{productId:component.id,quantity:3}]};
 const totals=api.kitTotals(kit,[component]);
 assert.equal(totals.cost,30);assert.equal(totals.extra,5);assert.equal(totals.ads,6);
 const result=api.calculate(totals,fees.ml,'ml');assert.ok(Math.abs(result.adsAmount-result.price*.06)<1e-8);
 const changed=api.kitTotals(kit,[{...component,ads:0}]);
 assert.equal(api.calculate(changed,fees.ml,'ml').price,result.price);
 const saved=api.parseBackup(api.buildBackup({products:[component],kits:[kit],fees}));
 assert.equal(saved.products[0].ads,40);assert.equal(saved.kits[0].ads,6);
});

test('backup v15 e CSV guardam Ads, backups antigos continuam em zero',()=>{
 const p={...product,ads:6};
 const data={products:[p],kits:[],fees},backup=api.buildBackup(data);
 assert.equal(JSON.parse(backup).version,15);assert.equal(api.parseBackup(backup).products[0].ads,6);
 const csv=api.buildCSV([p],fees),lines=csv.split('\r\n'),headers=lines[0].split(';'),values=lines[1].split(';');
 assert.equal(headers.length,values.length);assert.equal(values[headers.indexOf('"Ads Mercado Livre (%)"')],'"6,00"');
 assert.ok(headers.includes('"Mercado Livre Clássico - Ads (R$)"'));
 const old=api.parseBackup(JSON.stringify({format:'margem-backup',version:12,data:{products:[product],kits:[],fees}}));
 assert.equal(api.calculate(old.products[0],fees.ml,'ml').price,200);
 assert.equal(api.calculate({...product,ads:0},fees.ml,'ml').price,200);
 for(const ads of [-1,100,NaN,Infinity,'5',null]){
  assert.equal(api.validState({products:[{...product,ads}],fees,kits:[]}),false);
  assert.equal(api.calculate({...product,ads},fees.ml,'ml'),null);
 }
 assert.equal(api.calculate({...product,ads:70},fees.ml,'ml'),null);
});

const item={id:link.itemId,seller_id:123,condition:'new',listing_type_id:'gold_special',category_id:'MLB1234',shipping:{mode:'me2',logistic_type:'cross_docking'}};
function marketplace(){
 const calls=[];
 return {calls,api:async request=>{
  const u=new URL('https://api.mercadolibre.com'+request);calls.push(u);
  if(u.pathname==='/users/me')return {id:123,seller_reputation:{level_id:'5_green'}};
  if(u.pathname==='/items/'+item.id)return item;
  if(u.pathname==='/categories/MLB1234')return {id:'MLB1234',name:'Categoria do conjunto',children_categories:[],settings:{listing_allowed:true,shipping_modes:['me2']}};
  if(u.pathname.includes('shipping_options/free')){const price=Number(u.searchParams.get('item_price'));return {coverage:{all_country:{list_cost:price>=200?25:price>=79?20:6.85,currency_id:'BRL',billable_weight:350}}};}
  assert.equal(u.pathname,'/sites/MLB/listing_prices');
  const price=Number(u.searchParams.get('price'));
  return ['gold_special','gold_pro'].map((listing_type_id,i)=>{const rate=(price<100?14:12)+i*5,fixed=price<79?6:0;return {currency_id:'BRL',listing_type_id,listing_fee_amount:0,sale_fee_amount:Math.round(price*rate)/100+fixed,sale_fee_details:{percentage_fee:rate,fixed_fee:fixed}};});
 }};
}
test('API recalcula tarifas e frete nos preços com Ads para produtos e kits',async()=>{
 const {officialPricing}=await import('../netlify/lib/ml-tarifas.mjs');
 const {kitPricing}=await import('../netlify/lib/ml-kits.mjs');
 for(const kind of ['product','kit']){
  const m=marketplace(),input={cost:100,extra:5,margin:20,tax:6,ads:8,mlShipping:0,weight:.35,autoShipping:true};
  if(kind==='kit')input.context={categoryId:'MLB1234',categoryName:'Teste',referenceItemId:item.id,dimensions:{height:10,width:10,length:10}};
  const pricing=kind==='kit'?await kitPricing({input,sellerId:123,api:m.api}):await officialPricing({item,input,api:m.api});
  assert.equal(pricing.inputs.ads,8);assert.ok(api.validOfficialPricing(pricing));assert.equal(api.copyOfficialPricing(pricing).inputs.ads,8);
  const p={...product,extra:5,ads:8,mlShipping:pricing.inputs.mlShipping,mlPricing:pricing,...(kind==='kit'?{mlContext:pricing.context}:{mercadoLivre:link})};
  for(const scenario of ['ml','mlPremium'])for(const type of ['desired','minimum']){
   const q=pricing.quotes[scenario][type],target=type==='minimum'?10:20;
   assert.ok(q.margin>=target-1e-8);
   assert.ok(Math.abs(q.profit-(q.price*(1-.06-.08)-105-q.shippingApplied-q.feeAmount))<1e-8);
   assert.ok(m.calls.some(u=>u.pathname==='/sites/MLB/listing_prices'&&Number(u.searchParams.get('price'))===q.price));
   const result=type==='minimum'?api.minimumPrice(p,fees.ml,scenario):api.calculate(p,fees.ml,scenario);
   assert.ok(result);assert.ok(Math.abs(result.profit-q.profit)<1e-8);
  }
  assert.ok(m.calls.length<=45,'Consulta continua no limite por operação do plano Free');
  assert.equal(api.calculate({...p,ads:9},fees.ml,'ml'),null,'Alterar Ads invalida a cotação anterior');
  if(kind==='product'){
   const restored=api.parseBackup(api.buildBackup({products:[p],kits:[],fees}));assert.equal(restored.products[0].mlPricing.inputs.ads,8);
  }else{
   const kit={id:'kit-oficial',name:'Kit oficial',margin:20,extra:5,ads:8,mlShipping:p.mlShipping,feeSnapshot:fees,mlContext:p.mlContext,mlPricing:pricing,items:[{productId:product.id,quantity:1}]};
   const restored=api.parseBackup(api.buildBackup({products:[product],kits:[kit],fees}));assert.equal(restored.kits[0].mlPricing.inputs.ads,8);
   assert.equal(api.calculate(api.kitTotals(restored.kits[0],restored.products),fees.ml,'ml').price,pricing.quotes.ml.desired.price);
  }
 }
});

test('servidor recusa Ads inválido e preserva compatibilidade de cotações sem Ads',async()=>{
 const {officialPricing}=await import('../netlify/lib/ml-tarifas.mjs');
 const input={cost:30,extra:0,margin:20,tax:6,mlShipping:0,weight:.35};
 for(const ads of [-1,100,'5',null,Infinity])await assert.rejects(officialPricing({item,input:{...input,ads},api:marketplace().api}),/Ads/);
 const m=marketplace(),legacy=await officialPricing({item,input,api:m.api});assert.equal(legacy.inputs.ads,0);
 const invalid=marketplace();await assert.rejects(officialPricing({item,input:{...input,ads:80},api:invalid.api}),/somar|inviável/);
});
