const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const rules=require('../shared/ml-data-rules.js');
const fixtures=require('./support/ml-import-fixtures.cjs');
const clone=x=>JSON.parse(JSON.stringify(x)),time=Date.parse(fixtures.stamp);
function app(){const s=fs.readFileSync('src/app.js','utf8'),c=vm.createContext({URL,Date:class extends Date{static now(){return time;}},ConduzMlDataRules:rules});vm.runInContext(s.slice(0,s.indexOf('let state=defaults()'))+'\n'+['savedAdsPricingInput','pricingMatches'].map(n=>s.match(new RegExp('^function '+n+'.*$','m'))[0]).join('\n'),c);vm.runInContext(fs.readFileSync('src/ml-catalog-import.js','utf8'),c);return c;}
test('dados de anúncio vencem em seis horas e indisponibilidade não vira lucro atual',()=>{const item=fixtures.response().item;assert.equal(rules.fresh(item,time+rules.TTL-1),true);assert.equal(rules.fresh(item,time+rules.TTL),false);assert.equal(rules.fresh({...item,fetchedAt:'inválido'},time),false);assert.equal(rules.fresh(rules.unavailable(item,time),time),false);});
test('renovação completa preserva cadastros internos, margens e automações de precificação e Ads',async()=>{
 const c=app(),data=fixtures.data(),before=clone(data),loader=fixtures.requests();data.pendingProducts=[c.ConduzMlImport.pendingProduct(fixtures.response('MLB9000000001').item,data.fees)];const pendingMargin=data.pendingProducts[0].margin=28;
 const result=await c.ConduzMlImport.refreshCatalog({data,sellerId:123,request:loader.request,now:()=>time}),saved=c.ConduzMlImport.applyRefresh(data,result,123).data;
 for(const field of ['cost','weight','margin','extra','adsMl','adsShopee','feeSnapshot','mlPricing','mlAds'])assert.deepEqual(clone(saved.products[0][field]),before.products[0][field]);assert.equal(saved.products[0].mercadoLivre.price,55);assert.equal(saved.pendingProducts[0].margin,pendingMargin);assert.deepEqual(clone(saved.kits),before.kits);assert.equal(loader.calls.some(x=>x.action==='pricing'),false);
});
test('anúncio removido só perde conteúdo importado após confirmação e ausência na lista não basta',async()=>{
 const c=app(),data=fixtures.data(),loader=fixtures.requests([]);const result=await c.ConduzMlImport.refreshCatalog({data,sellerId:123,now:()=>time,request:async(action,options)=>{if(action==='item')throw Object.assign(Error('Não encontrado'),{status:404});return loader.request(action,options);}}),saved=c.ConduzMlImport.applyRefresh(data,result,123).data;
 assert.equal(saved.products[0].cost,10);assert.equal(saved.products[0].margin,20);assert.equal(saved.products[0].mercadoLivre.availability,'unavailable');assert.equal(saved.products[0].mercadoLivre.price,null);assert.equal(saved.products[0].mlPricing,undefined);assert.equal(saved.products[0].mlAds,undefined);
 const active=await c.ConduzMlImport.refreshCatalog({data,sellerId:123,now:()=>time,request:loader.request});assert.equal(active.products[0].proposal.mercadoLivre.price,55);
});
test('falha e edição concorrente não apagam dados nem sobrescrevem novo custo ou margem',async()=>{
 const c=app(),data=fixtures.data(),loader=fixtures.requests();const result=await c.ConduzMlImport.refreshCatalog({data,sellerId:123,request:loader.request,now:()=>time});data.products[0].cost=99;data.products[0].margin=30;const saved=c.ConduzMlImport.applyRefresh(data,result,123);assert.equal(saved.skipped,1);assert.equal(saved.data.products[0].cost,99);assert.equal(saved.data.products[0].margin,30);
 const failed=await c.ConduzMlImport.refreshCatalog({data,sellerId:123,now:()=>time,request:async(action,options)=>{if(action==='item')throw Error('Sem rede');return loader.request(action,options);}});assert.equal(failed.failed.length,1);assert.equal(failed.products.length,0);
});
test('encerramento preserva informações próprias e restauração antiga não ressuscita dados removidos',()=>{
 const data=fixtures.data(),before=clone(data),purged=rules.purge(data);assert.deepEqual(purged.products.map(p=>({cost:p.cost,margin:p.margin,adsMl:p.adsMl})),data.products.map(p=>({cost:p.cost,margin:p.margin,adsMl:p.adsMl})));assert.deepEqual(purged.adsReconciliations,data.adsReconciliations);assert.deepEqual(purged.kits.map(k=>k.items),data.kits.map(k=>k.items));assert.equal(purged.adsReports.length,0);assert.equal(purged.products[0].mercadoLivre,undefined);assert.deepEqual(data,before);
 const restored=rules.sanitize(data,'2026-11-26T12:00:00Z');assert.equal(restored.products[0].mercadoLivre,undefined);const newer=clone(data);newer.products[0].mercadoLivre.fetchedAt='2026-11-27T12:00:00Z';assert.ok(rules.sanitize(newer,'2026-11-26T12:00:00Z').products[0].mercadoLivre);
});
