const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const context=vm.createContext({URL});
vm.runInContext(script.slice(0,script.indexOf('let state=defaults()'))+';globalThis.api={defaults,copyFees,productInitialFees,readProductFees,feeFields,calculate};',context);
const api=context.api;
function form(fees,fixed){
 return {dataset:{mlFixed:String(fixed)},elements:Object.fromEntries(['ml','shopee'].flatMap(m=>api.feeFields(m).filter(([k])=>m!=='ml'||k!=='fixed').map(([k])=>['product-'+m+'-'+k,{value:String(fees[m][k]??0)}])))};
}

test('novo produto manual não herda o adicional fixo legado e preserva Shopee e Ads',()=>{
 const defaults=api.defaults().fees;defaults.ml.fixed=6;
 const before=JSON.stringify(defaults),initial=api.productInitialFees(undefined,defaults),read=api.readProductFees(form(initial,initial.ml.fixed),defaults);
 assert.equal(initial.ml.fixed,0);assert.equal(read.ml.fixed,0);assert.equal(JSON.stringify(defaults),before);
 assert.equal(read.shopee.fixed,defaults.shopee.fixed);
 const result=api.calculate({cost:10,extra:0,weight:.3,margin:20,mlShipping:0,adsMl:5,adsShopee:12,feeSnapshot:read},defaults.ml,'ml');
 assert.equal(result.price,18.19);assert.ok(result.margin>=20);assert.equal(result.feesApplied.fixed,0);
});

test('editar produto antigo preserva a parcela histórica sem criar um campo manual',()=>{
 const fees=api.copyFees(api.defaults().fees);fees.ml.fixed=6;
 const product={cost:30,extra:0,margin:20,weight:.3,mlShipping:0,adsMl:5,adsShopee:12,feeSnapshot:fees};
 const initial=api.productInitialFees(product,api.defaults().fees),read=api.readProductFees(form(initial,initial.ml.fixed),api.defaults().fees);
 assert.equal(read.ml.fixed,6);
 assert.equal(api.calculate({...product,feeSnapshot:read},read.ml,'ml').price,api.calculate(product,fees.ml,'ml').price);
 assert.equal(JSON.stringify(product.feeSnapshot),JSON.stringify(fees));
});

test('parcela da API, inclusive zero, pode ser preservada sem somar adicional manual',()=>{
 const fees=api.defaults().fees;
 for(const amount of [0,2.5]){
  const f=form(fees,amount),read=api.readProductFees(f,fees);
  assert.equal(f.elements['product-ml-fixed'],undefined);assert.equal(read.ml.fixed,amount);
  assert.equal(read.ml.tax,fees.ml.tax);assert.equal(read.shopee.fixed,fees.shopee.fixed);
 }
});
