const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1],context=vm.createContext({URL});
vm.runInContext(script.slice(0,script.indexOf('let state=defaults()'))+';globalThis.api={calculate,calculateShopee,shopeeAtPrice,withShopeePolicy,defaults,buildBackup,parseBackup,kitTotals,validState,SHOPEE_POLICY_ID};',context);
const api=context.api;
const fees=api.withShopeePolicy(api.defaults().fees);
const product={id:'cnpj',name:'Produto',category:'Teste',cost:10,extra:0,weight:.16,margin:8,mlShipping:0,feeSnapshot:fees};

test('Shopee CNPJ: comissão e parcela fixa seguem a tabela, incluindo preços de fronteira',()=>{
 for(const [price,rate,fixed] of [[.01,20,.01],[8.98,20,4.49],[8.99,20,4.5],[9,20,4.5],[79.99,20,4.5],[80,14,16],[99.99,14,16],[100,14,20],[199.99,14,20],[200,14,26],[500,14,26],[2000,14,26]]){
  const result=api.shopeeAtPrice(product,fees.shopee,Math.round(price*100));
  assert.equal(result.baseCommission,rate);assert.equal(result.fixedBase,fixed);assert.equal(result.shippingApplied,0);
 }
});

// Oráculo independente: percorre todos os centavos e reconcilia cada desconto.
function bruteMinimum(p,f,lastCents){
 for(let n=1;n<=lastCents;n++){
  const price=n/100,rate=(n<8000?20:14)+(f.officialEventEnabled?5:0);
  const fixed=n<900?Math.round(n/2)/100:n<8000?4.5:n<10000?16:n<20000?20:26;
  const commission=Math.round(n*rate/100)/100,returns=f.easyReturnEnabled?.49:0;
  const profit=price-p.cost-p.extra-price*f.tax/100-commission-fixed-returns;
  if(profit/price*100>=p.margin-1e-8)return price;
 }
 return null;
}
test('Shopee: menor preço preserva a margem em 168 combinações e nas mudanças de faixa',()=>{
 for(const cost of [.01,2,10,45,65,100,150])for(const tax of [0,11.3])for(const margin of [0,10,20])for(const easyReturnEnabled of [false,true])for(const officialEventEnabled of [false,true]){
  const p={...product,cost,margin,extra:.31},f={...fees.shopee,tax,easyReturnEnabled,officialEventEnabled};
  const result=api.calculateShopee(p,f);assert.ok(result);
  assert.equal(result.price,bruteMinimum(p,f,Math.round(result.price*100)));
  assert.ok(result.margin>=margin-1e-8);
  assert.ok(Math.abs(result.price-result.profit-p.cost-p.extra-result.price*tax/100-result.commissionAmount-result.fixedBase-result.easyReturnApplied)<1e-8);
 }
});

test('Shopee: exemplo das capturas usa imposto cadastrado e taxa fixa vigente',()=>{
 const f={...fees.shopee,tax:11.3},p={...product,feeSnapshot:{...fees,shopee:f}};
 const result=api.calculate(p,f,'shopee');
 // R$ 23,89 fica em 7,9968% após arredondar a comissão; o centavo seguinte preserva 8%.
 assert.equal(result.price,23.9);assert.equal(Number(result.profit.toFixed(2)),1.92);
 assert.equal(result.feesApplied.tax,11.3);assert.equal(result.fixedBase,4.5);
 assert.equal(api.calculate({...p,mlShipping:999},f,'shopee').price,result.price);
});

test('Shopee: serviços só são cobrados pelas marcações, com R$ 0,49 por pedido e 5 p.p.',()=>{
 for(const easyReturnEnabled of [false,true])for(const officialEventEnabled of [false,true]){
  const f={...fees.shopee,easyReturnEnabled,officialEventEnabled},result=api.shopeeAtPrice(product,f,12000);
  assert.equal(result.feesApplied.commission,officialEventEnabled?19:14);
  assert.equal(result.easyReturnApplied,easyReturnEnabled?.49:0);
  assert.equal(result.fixedBase,20);
 }
});

test('Shopee: kits pagam a parcela por item anunciado e uma devolução por pedido, não por componente',()=>{
 const f=api.withShopeePolicy(api.defaults().fees);f.shopee.easyReturnEnabled=true;
 const kit={id:'kit',name:'Kit',margin:20,extra:0,mlShipping:0,feeSnapshot:f,items:[{productId:product.id,quantity:5}]};
 const totals=api.kitTotals(kit,[product]),result=api.calculate(totals,f.shopee,'shopee');
 assert.equal(totals.units,5);assert.equal(result.easyReturnApplied,.49);
 assert.ok(result.fixedBase===16||result.fixedBase===20||result.fixedBase===26||result.fixedBase===4.5);
 const saved=api.parseBackup(api.buildBackup({products:[product],fees:f,kits:[kit]}));
 assert.equal(saved.kits[0].feeSnapshot.shopee.policyId,api.SHOPEE_POLICY_ID);
 assert.equal(api.calculate(api.kitTotals(saved.kits[0],saved.products),saved.fees.shopee,'shopee').price,result.price);
});

test('Shopee: política fica no cadastro sem alterar imposto, marcações ou taxas legadas',()=>{
 const legacy=api.defaults().fees;Object.assign(legacy.shopee,{commission:25,fixed:7,tax:9,easyReturnFee:.99,officialEventRate:3,easyReturnEnabled:true,officialEventEnabled:true});
 const before=JSON.stringify(legacy),automatic=api.withShopeePolicy(legacy);
 assert.equal(JSON.stringify(legacy),before);assert.equal(automatic.shopee.tax,9);
 assert.equal(automatic.shopee.easyReturnEnabled,true);assert.equal(automatic.shopee.officialEventEnabled,true);
 assert.equal(automatic.shopee.easyReturnFee,.49);assert.equal(automatic.shopee.officialEventRate,5);
 const old={...product,cost:30,margin:20,feeSnapshot:legacy};
 assert.equal(api.calculate(old,legacy.shopee,'shopee').price,88.35);
 const restored=api.parseBackup(api.buildBackup({products:[old],fees:legacy,kits:[]}));
 assert.equal(api.calculate(restored.products[0],restored.fees.shopee,'shopee').price,88.35);
 assert.equal(restored.products[0].feeSnapshot.shopee.policyId,undefined);
 assert.equal(api.validState({products:[{...product,feeSnapshot:{...fees,shopee:{...fees.shopee,policyId:'desconhecida'}}}],fees,kits:[]}),false);
});

test('Shopee: custos e margens inviáveis não se tornam preço zero ou taxa presumida',()=>{
 assert.equal(api.calculateShopee({...product,margin:99},fees.shopee),null);
 assert.equal(api.calculateShopee({...product,cost:NaN},fees.shopee),null);
 assert.equal(api.calculateShopee(product,{...fees.shopee,tax:100}),null);
});
