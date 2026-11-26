const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fixtures = require('./support/ml-import-fixtures.cjs');
const source = fs.readFileSync('src/app.js', 'utf8');
const core = source.slice(0, source.indexOf('let state=defaults()'));
const helpers = ['savedAdsPricingInput', 'pricingMatches'].map(name => source.match(new RegExp('^function ' + name + '.*$', 'm'))[0]).join('\n');
const clone = x => JSON.parse(JSON.stringify(x));
function app(ui = false, request = fixtures.requests().request) {
 const nodes = new Map(), saved = [];
 const get = id => { if (!nodes.has(id)) nodes.set(id, { value:'', textContent:'', innerHTML:'', disabled:false, open:false, showModal(){this.open=true;}, close(){this.open=false;} }); return nodes.get(id); };
 const c = vm.createContext({ URL, mlRequest:request, render(){}, toast(){}, refreshRegisteredAds(){c.refreshed=(c.refreshed??0)+1;}, persist(){if(c.failStorage)return false;saved.push(clone(vm.runInContext('state',c)));return true;} });
 vm.runInContext(core+'\n'+helpers+'\nlet state='+JSON.stringify(fixtures.data())+';let mlConnection={connected:true,account:{id:123,nickname:"FICTÍCIA"}},currentPricesBusy=false,mlAdsBusy=false,adsUi={busy:false},adsHistoryUi={busy:false};',c);
 vm.runInContext(fs.readFileSync('src/ml-catalog-import.js','utf8'),c);
 if(ui)c.document={getElementById:get};
 vm.runInContext(fs.readFileSync('src/pending-costs.js','utf8'),c);
 const run=s=>vm.runInContext(s,c);
 const seed=(count=2)=>{const data=fixtures.data();data.products[0].mercadoLivre.skus=['EXISTENTE'];data.pendingProducts=Array.from({length:count},(_,i)=>clone(c.ConduzMlImport.pendingProduct(fixtures.response('MLB'+(9000000001+i)).item,data.fees)));c.seed=data;run('state=seed');return data;};
 const upload=async text=>get('pending-costs-file').onchange({target:{files:[{size:Buffer.byteLength(text),text:async()=>text}]}});
 return {api:c.ConduzPendingCosts,c,get,saved,run,seed,upload,data:()=>clone(run('state'))};
}
const csv='sku;custo\nSKU-MLB9000000001;12,50\nSKU-MLB9000000002;23,40';
const inspect=(a,data,text=csv,request=fixtures.requests().request)=>a.api.inspectCosts({data,csvRows:a.api.parseCostsCSV(text),sellerId:123,request});

test('CSV de custos preserva SKU e aceita formatos comuns de exportação sem confundir códigos com números',()=>{
 const a=app();
 for(const text of ['\uFEFFsep=;\r\nCódigo;Preço de custo\r\n001-Ab;12,50','SKU,custo\n001-Ab,"12,50"','sku\tcusto\n001-Ab\t12.50']){
  const rows=a.api.parseCostsCSV(text);assert.equal(rows[0].sku,'001-Ab');assert.equal(rows[0].cost,12.5);assert.equal(rows[0].problem,'');
 }
 const rows=a.api.parseCostsCSV('sku;custo\n"SKU;especial";1');assert.equal(rows[0].sku,'SKU;especial');
});
test('cabeçalho ambíguo, arquivo vazio, campos malformados e limites são rejeitados',()=>{
 const a=app();for(const text of ['', 'sku;custo', 'sku;codigo;custo\na;a;2', 'nome;custo\na;2','sku;custo\n"ab;2'])assert.throws(()=>a.api.parseCostsCSV(text));
 assert.throws(()=>a.api.parseCostsCSV('x'.repeat(2*1024*1024+1)),/2 MB/);
 assert.throws(()=>a.api.parseCostsCSV('sku;custo\n'+Array.from({length:5001},(_,i)=>i+';1').join('\n')),/5.000/);
 assert.ok(a.api.parseCostsCSV('sku;custo\na;1;2')[0].problem);
});
test('duplicatas inclusive iguais e valores inválidos não permitem aplicar custo por engano',()=>{
 const a=app(),rows=a.api.parseCostsCSV('sku;custo\na;2\na;2\nb;0\nc;-1\nd;1.000,00\ne;1,234\nf;R$ 2\n;2');
 assert.ok(rows.every(r=>r.problem));assert.match(rows[0].problem,/repetido/);assert.match(rows[1].problem,/repetido/);
});
test('apenas pendências com SKU exato são associadas, e custos existentes ficam visíveis e protegidos',()=>{
 const a=app(),data=a.seed(),rows=a.api.matchCosts(data,a.api.parseCostsCSV('sku;custo\nEXISTENTE;999\nsku-MLB9000000001;3\nSKU-MLB9000000001;12,50'),123);
 assert.equal(rows[0].kind,'existing');assert.equal(rows[0].existingCost,10);assert.equal(rows[0].ready,false);assert.equal(rows[1].kind,'missing');assert.equal(rows[2].eligible,true);
});
test('confere frete e comissões oficiais antes da seleção, preservando margem, imposto, serviços e preço atual',async()=>{
 const a=app(),data=a.seed();data.pendingProducts[0].margin=27;data.pendingProducts[0].feeSnapshot.ml.tax=9;data.pendingProducts[0].feeSnapshot.shopee.tax=11;data.pendingProducts[0].feeSnapshot.shopee.easyReturnEnabled=true;
 const before=clone(data),loader=fixtures.requests(),rows=await inspect(a,data,csv,loader.request),p=rows[0].proposal;
 assert.ok(rows.every(r=>r.ready));assert.deepEqual(data,before);assert.equal(a.saved.length,0);
 assert.equal(p.cost,12.5);assert.equal(p.margin,27);assert.equal(p.feeSnapshot.ml.tax,9);assert.equal(p.feeSnapshot.shopee.tax,11);assert.equal(p.feeSnapshot.shopee.easyReturnEnabled,true);
 assert.equal(p.mlPricing.inputs.autoShipping,true);assert.equal(p.mlPricing.inputs.weight,.3);assert.equal(p.mlShipping,5);assert.equal(p.feeSnapshot.ml.commission,11);assert.equal(p.feeSnapshot.ml.premiumCommission,14);
 const q=p.mlPricing.quotes.ml.desired;assert.ok(q.margin>=27);assert.ok(Math.abs(q.profit-(q.price-12.5-5-q.feeAmount-q.price*.09))<1e-8);
 assert.equal(p.mercadoLivre.currentShipping.price,55);assert.equal(p.mercadoLivre.currentFees.price,55);
 assert.equal(loader.calls.filter(c=>c.action==='pricing').length,2);assert.equal(p.adsMl,0);assert.equal(p.adsShopee,0);
});
test('salva somente os selecionados e mantém íntegros produtos anteriores, kits, relatórios e pendências restantes',async()=>{
 const a=app(),data=a.seed(),before=clone(data),rows=await inspect(a,data),next=a.api.applyCosts(data,rows,new Set([rows[0].id]),123);
 assert.equal(next.products.length,3);assert.equal(next.pendingProducts.length,1);assert.equal(next.pendingProducts[0].id,before.pendingProducts[1].id);
 assert.deepEqual(clone(next.products.slice(0,2)),before.products);for(const k of ['kits','fees','adsReports','adsAccounts','adsReconciliations'])assert.deepEqual(clone(next[k]),before[k]);assert.deepEqual(data,before);
 assert.throws(()=>a.api.applyCosts(next,rows,new Set([rows[0].id]),123),/mudou|recebeu/);
});
test('SKU compartilhado por vários anúncios exige seleção individual e variações não são concluídas',async()=>{
 const a=app(),data=a.seed();data.pendingProducts.forEach(p=>p.item.skus=['COMUM']);
 const rows=await inspect(a,data,'sku;custo\nCOMUM;10',async(action,options)=>{const r=await fixtures.requests().request(action,options);if(action==='item')r.item.skus=['COMUM'];return r;});
 assert.equal(rows.length,2);assert.ok(rows.every(r=>r.ready));assert.equal(a.api.applyCosts(data,rows,new Set([rows[1].id]),123).pendingProducts.length,1);
 data.pendingProducts[0].item.variationCount=2;data.pendingProducts[1].item.skus.push('OUTRO');
 const blocked=await inspect(a,data,'sku;custo\nCOMUM;10');assert.ok(blocked.every(r=>!r.ready));
});
test('peso ausente, SKU alterado, modalidade inválida e outra conta não geram custos nem preços inventados',async()=>{
 for(const mutate of [r=>r.item.weight=null,r=>r.item.skus=['ALTERADO'],r=>r.item.variationCount=1,r=>r.item.listingType='free',r=>r.item.sellerId=456]){
  const a=app(),data=a.seed(1);data.pendingProducts[0].item.weight=null;
  const rows=await inspect(a,data,csv,async(action,options)=>{const r=await fixtures.requests().request(action,options);if(action==='item')mutate(r);return r;});
  assert.equal(rows[0].ready,false);assert.throws(()=>a.api.applyCosts(data,rows,new Set([rows[0].id]),123),/indisponíveis/);assert.equal(data.products.length,2);
 }
});
test('cotação de outro custo/categoria e falhas oficiais preservam a pendência',async()=>{
 for(const fault of ['cost','category','network']){
  const a=app(),data=a.seed(1),rows=await inspect(a,data,csv,async(action,options)=>{const r=await fixtures.requests().request(action,options);if(action==='pricing'){if(fault==='network')throw Error('Frete indisponível');if(fault==='cost')r.pricing.inputs.cost++;else r.pricing.categoryId='MLB999';}return r;});
  assert.equal(rows[0].ready,false);assert.match(rows[0].note,/cotação|Frete/);assert.equal(a.saved.length,0);
 }
});
test('mudança concorrente de margem, cadastro já concluído e troca de empresa abortam lote sem gravação parcial',async()=>{
 const a=app(),data=a.seed(),rows=await inspect(a,data),selected=new Set(rows.filter(r=>r.ready).map(r=>r.id));
 const changed=clone(data);changed.pendingProducts[1].margin=25;assert.throws(()=>a.api.applyCosts(changed,rows,selected,123),/mudou/);assert.equal(changed.products.length,2);
 const completed=clone(data);completed.products.push(clone(rows[1].proposal));assert.throws(()=>a.api.applyCosts(completed,rows,selected,123),/recebeu/);assert.equal(completed.products.length,3);
 assert.throws(()=>a.api.applyCosts(data,rows,selected,456),/outra empresa/);
});
test('limite de API sinaliza anúncios restantes e cancelamento ignora respostas tardias',async()=>{
 const a=app(),data=a.seed(5),text='sku;custo\n'+data.pendingProducts.map(p=>p.item.skus[0]+';10').join('\n');let calls=0;
 const rows=await inspect(a,data,text,async()=>{calls++;throw Object.assign(Error('Limite de consultas'),{status:429});});assert.ok(calls<=2);assert.ok(rows.every(r=>!r.ready&&/Limite/.test(r.note)));
 let active=true;const resolves=[];const task=a.api.inspectCosts({data,csvRows:a.api.parseCostsCSV(text),sellerId:123,active:()=>active,request:()=>new Promise(r=>resolves.push(r))});active=false;for(const resolve of resolves)resolve(fixtures.response('MLB9000000001'));assert.equal(await task,null);
});
test('controlador começa sem seleção, não grava na leitura e cancela sem alterar o catálogo',async()=>{
 const a=app(true),before=clone(a.seed());a.get('pending-costs-open').onclick();await a.upload(csv);
 assert.equal(a.api.isOpen(),true);assert.equal(a.get('pending-costs-save').disabled,true);assert.equal(a.saved.length,0);assert.deepEqual(a.data(),before);
 a.get('pending-costs-select').onclick();assert.equal(a.get('pending-costs-save').disabled,false);a.get('pending-costs-cancel').onclick();assert.equal(a.api.isOpen(),false);assert.deepEqual(a.data(),before);
});
test('seleção respeita a busca e confirmação conclui somente o anúncio escolhido e aciona Ads existente',async()=>{
 const a=app(true),before=clone(a.seed());a.get('pending-costs-open').onclick();await a.upload(csv);a.get('pending-costs-search').value='9000000002';a.get('pending-costs-search').oninput();a.get('pending-costs-select').onclick();a.get('pending-costs-save').onclick();
 assert.equal(a.saved.length,1);assert.equal(a.data().products.length,3);assert.equal(a.data().products[2].cost,23.4);assert.equal(a.data().pendingProducts[0].item.itemId,'MLB9000000001');assert.deepEqual(a.data().products.slice(0,2),before.products);assert.equal(a.c.refreshed,1);assert.equal(a.api.isOpen(),false);
});
test('falha de armazenamento e sessão alterada preservam estado anterior e revisão recuperável',async()=>{
 const a=app(true),before=clone(a.seed());a.get('pending-costs-open').onclick();await a.upload(csv);a.get('pending-costs-select').onclick();a.c.failStorage=true;a.get('pending-costs-save').onclick();assert.deepEqual(a.data(),before);assert.equal(a.api.isOpen(),true);assert.match(a.get('pending-costs-error').textContent,/gravar/);
 a.c.failStorage=false;a.run('mlConnection.account.id=456');a.get('pending-costs-save').onclick();assert.deepEqual(a.data(),before);assert.equal(a.saved.length,0);
});
