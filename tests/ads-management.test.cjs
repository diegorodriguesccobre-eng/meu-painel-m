const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const script=require('./support/app-source.cjs').readAppScript();
const ctx=vm.createContext({URL});vm.runInContext(script.slice(0,script.indexOf('let state=defaults()'))+';globalThis.api={defaults,validState,validProductAds,validAdsAccount,validAdsReconciliation,validAdsManagement,adsEvidenceKey,adsReconciled,estimateProductAds,adsBlueStrength,adsCurrentPeriod,adsManagementData,adsProjection,buildBackup,parseBackup,copyProductAds};',ctx);
const api=ctx.api,now=Date.parse('2026-11-16T13:00:00Z'),period={dateFrom:'2026-10-17',dateTo:'2026-11-15'};
const clone=v=>JSON.parse(JSON.stringify(v));
function product(id='MLB1234567890',overrides={}){
 const p={id,name:'Teste '+id,category:'Teste',cost:20,extra:0,weight:.3,mlShipping:0,margin:20,adsMl:5,adsShopee:10,feeSnapshot:api.defaults().fees,mercadoLivre:{itemId:id,sellerId:123,title:'Teste',listingType:'gold_special',categoryId:'MLB1234',categoryName:'Teste',catalogProductId:null,price:100,weight:.3,thumbnail:null,variationCount:0,fetchedAt:new Date(now).toISOString(),permalink:'https://produto.mercadolivre.com.br/MLB-'+id.slice(3)+'-_JM'}};
 const a={source:'mercado-livre-product-ads-v2',metricsVersion:2,sellerId:123,itemId:id,currency:'BRL',...period,fetchedAt:new Date(now).toISOString(),cost:100,revenue:1000,clicks:200,acos:10,roas:10,appliedRate:10,status:'ready',breakdownComplete:true,directRevenue:800,indirectRevenue:200,directUnits:8,indirectUnits:2,directSales:7,indirectSales:2,...overrides};
 p.mlAds=a;return p;
}
function record(p,values={}){return {source:'manual-reconciliation',sellerId:123,itemId:p.mercadoLivre.itemId,...period,scope:'direct',basis:api.adsEvidenceKey(p.mlAds),savedAt:new Date(now).toISOString(),notes:'Relatório das vendas diretas; todo Ads alocado às diretas.',revenue:780,goods:160,fees:109.2,tax:46.8,shipping:40,other:10,...values};}
test('separa receita indireta da estimativa de lucro e desconta gasto uma vez',()=>{
 const p=product(),result=api.estimateProductAds(p,api.defaults().fees);
 // Na referência de R$100: comissão 14 + fixo6 + imposto6; custos por unidade20.
 const expected=800-8*20-800*.26-100;assert.ok(Math.abs(result.profit-expected)<1e-9);
 const changed=product(undefined,{revenue:2000,indirectRevenue:1200,acos:5,roas:20,appliedRate:5});
 assert.equal(api.estimateProductAds(changed,api.defaults().fees).profit,result.profit,'receita indireta não recebe margem/custo do produto anunciado');
 assert.match(result.criterion,/diretas/);
});
test('lucro apurado requer conciliação, usa despesas reais e não reserva percentual adicional de Ads',()=>{
 const p=product(),r=record(p);assert.equal(api.adsReconciled(p,[]),null);
 const actual=api.adsReconciled(p,[r]);assert.ok(Math.abs(actual.profit-(780-160-109.2-46.8-40-10-100))<1e-8);
 assert.equal(actual.ads,100);p.adsMl=40;assert.equal(api.adsReconciled(p,[r]).profit,actual.profit,'reserva prevista não é descontada da apuração');
 p.cost=500;assert.equal(api.adsReconciled(p,[r]).profit,actual.profit,'custo atual não altera despesa já conciliada');
 p.mlAds.cost=110;assert.equal(api.adsReconciled(p,[r]),null,'nova evidência requer revisão da conciliação');
});
test('zero, ausência de histórico, métricas antigas e dias sem vendas não criam lucro gratuito',()=>{
 const empty=product(undefined,{cost:0,revenue:0,clicks:0,acos:null,roas:null,appliedRate:null,status:'no-revenue',directRevenue:0,indirectRevenue:0,directUnits:0,indirectUnits:0,directSales:0,indirectSales:0});
 assert.equal(api.estimateProductAds(empty,api.defaults().fees),null);
 const old=product();for(const k of ['metricsVersion','breakdownComplete','directRevenue','indirectRevenue','directUnits','indirectUnits','directSales','indirectSales'])delete old.mlAds[k];assert.ok(api.validProductAds(old));assert.equal(api.estimateProductAds(old,api.defaults().fees),null);
 const spend=product(undefined,{revenue:0,acos:null,roas:0,appliedRate:null,status:'no-revenue',directRevenue:0,indirectRevenue:0,directUnits:0,indirectUnits:0,directSales:0,indirectSales:0});assert.equal(api.estimateProductAds(spend,api.defaults().fees).profit,-100);
 const forecast=api.adsProjection({...empty.mlAds},50,30);assert.equal(forecast.spend,1500);assert.equal(forecast.revenue,null);
});
test('totais deduplicam anúncios e não misturam contas ou períodos; médias são ponderadas por valores',()=>{
 const p=product(),q=product('MLB9876543210',{cost:200,revenue:1000,acos:20,roas:5,appliedRate:20}),duplicate={...p,id:'duplicate'},foreign=product('MLB8888888888');foreign.mercadoLivre.sellerId=999;foreign.mlAds.sellerId=999;
 const stale=product('MLB7777777777');stale.mlAds.dateFrom='2026-10-16';stale.mlAds.dateTo='2026-11-14';
 const data={products:[p,q,duplicate,foreign,stale],fees:api.defaults().fees},summary=api.adsManagementData(data,123,now);
 assert.equal(summary.products.length,4);assert.equal(summary.measured.length,2);assert.equal(summary.totals.cost,300);assert.equal(summary.roas,2000/300);assert.equal(summary.acos,15);assert.notEqual(summary.roas,(10+5)/2);
});
test('cenários usam CPC e receitas agregadas; azul é monotônico pelo lucro, não por ROAS',()=>{
 const p=product(),forecast=api.adsProjection(p.mlAds,10,30);assert.equal(forecast.spend,300);assert.equal(forecast.revenue,3000);assert.equal(forecast.clicks,600);assert.equal(forecast.directUnits,24);assert.equal(forecast.indirectUnits,6);
 assert.equal(api.adsProjection(p.mlAds,-1,30),null);assert.equal(api.adsProjection(p.mlAds,10,0),null);
 assert.ok(api.adsBlueStrength(1000)>api.adsBlueStrength(100));assert.ok(api.adsBlueStrength(100)>api.adsBlueStrength(0));assert.equal(api.adsBlueStrength(-500),api.adsBlueStrength(null));
});
test('backup v18 preserva conciliação e separação de receitas; aceita v15 sem completar dados ausentes',()=>{
 const p=product(),r=record(p),data={products:[p],kits:[],fees:api.defaults().fees,adsReconciliations:[r]};
 assert.ok(api.validState(data));const text=api.buildBackup(data),restored=api.parseBackup(text);assert.equal(JSON.parse(text).version,19);assert.deepEqual(clone(restored),clone(data));
 const old=clone(data);delete old.adsReconciliations;delete old.products[0].mlAds.metricsVersion;delete old.products[0].mlAds.breakdownComplete;for(const k of ['directRevenue','indirectRevenue','directUnits','indirectUnits','directSales','indirectSales'])delete old.products[0].mlAds[k];
 const legacy=api.parseBackup(JSON.stringify({format:'margem-backup',version:15,data:old}));assert.equal(legacy.products[0].mlAds.directRevenue,undefined);assert.equal(api.estimateProductAds(legacy.products[0],legacy.fees),null);
 const invalid={...data,adsReconciliations:[record(p,{goods:-1})]};assert.equal(api.validState(invalid),false);
 assert.equal(api.validState({...data,adsReconciliations:[r,r]}),false);
 assert.equal(api.validState({...data,products:[product(undefined,{directRevenue:100})]}),false);
});
test('resumo do anunciante soma campanhas de todas as páginas e não soma contas delegadas',async()=>{
 const {accountAds}=await import('../netlify/lib/ml-ads.mjs');let requests=0;
 const metrics={cost:100,total_amount:1000,clicks:200,direct_amount:800,indirect_amount:200,direct_units_quantity:8,indirect_units_quantity:2,direct_items_quantity:7,indirect_items_quantity:2};
 const api=async(url,version)=>{requests++;if(url.startsWith('/advertising/advertisers')){assert.equal(version,1);return {advertisers:[{advertiser_id:88,site_id:'MLB',advertiser_name:'Conta teste'}]};}assert.equal(version,2);assert.match(url,/campaigns\/search/);assert.ok(!url.includes('metrics_summary'));const offset=Number(new URL(url,'https://api.mercadolibre.com').searchParams.get('offset'));return {paging:{total:2,offset,limit:1},results:[{id:offset+1,advertiser_id:88,metrics}],metrics_summary:{...metrics,cost:999999}};};
 const response=await accountAds({sellerId:123,input:{},api,now:()=>now});assert.equal(requests,3);assert.equal(response.summary.cost,200);assert.equal(response.summary.directRevenue,1600);assert.equal(response.summary.campaignCount,2);assert.equal(response.summary.aggregation,'all-campaign-pages');assert.ok(ctx.api.validAdsAccount(response.summary));
 const multiple=await accountAds({sellerId:123,input:{},api:async()=>({advertisers:[{advertiser_id:88,site_id:'MLB'},{advertiser_id:99,site_id:'MLB'}]})});assert.equal(multiple.selectionRequired,true);assert.equal(multiple.summary,undefined);
 await assert.rejects(accountAds({sellerId:123,input:{advertiserId:666},api}),e=>e.ads&&e.status===403);
});
test('métricas detalhadas não inventam separação quando ela está ausente e rejeitam totais inconsistentes',async()=>{
 const {adsMetrics}=await import('../netlify/lib/ml-ads.mjs');
 const empty=adsMetrics({cost:10,total_amount:50,clicks:2});assert.equal(empty.breakdownComplete,false);assert.equal(empty.directRevenue,null);
 assert.throws(()=>adsMetrics({cost:10,total_amount:100,clicks:2,direct_amount:80,indirect_amount:30,direct_units_quantity:8,indirect_units_quantity:2,direct_items_quantity:7,indirect_items_quantity:2}),/não correspondem/);
});
test('resumo do anunciante também é preservado no backup e validado contra mistura de receitas',()=>{
 const p=product(),a={source:'mercado-livre-product-ads-account-v2',metricsVersion:2,sellerId:123,advertiserId:88,advertiserName:'Teste',currency:'BRL',...period,fetchedAt:new Date(now).toISOString(),campaignCount:3,cost:100,revenue:1000,clicks:200,breakdownComplete:true,directRevenue:800,indirectRevenue:200,directUnits:8,indirectUnits:2,directSales:7,indirectSales:2};
 const data={products:[p],kits:[],fees:api.defaults().fees,adsAccount:a,adsReconciliations:[record(p)]};
 assert.deepEqual(clone(api.parseBackup(api.buildBackup(data))),clone({...data,adsAccounts:[a]}));
 assert.equal(api.validState({...data,adsAccount:{...a,indirectRevenue:999}}),false);
 const different=api.adsManagementData(data,999,now);assert.equal(different.account,null);assert.equal(different.totals.cost,0);
});
test('consulta de totais da conta exige sessão e mesma origem e não vira proxy público',async()=>{
 const {createHandler}=await import('../netlify/functions/mercadolivre.mjs');let calls=0;
 const origin='https://example.test',handler=createHandler({env:{PANEL_LOGIN_REQUIRED:'false',ML_CLIENT_ID:'123',ML_CLIENT_SECRET:'TEST_ONLY',ML_SESSION_SECRET:'ab'.repeat(32),ML_REDIRECT_URI:origin+'/api/ml/callback'},fetchImpl:async()=>{calls++;throw Error('Não deveria consultar');}});
 const req=(method,headers={})=>new Request(origin+'/api/ml/ads-account',{method,headers,...(method==='POST'?{body:'{}'}:{})});
 assert.equal((await handler(req('GET'))).status,405);
 assert.equal((await handler(req('POST',{Origin:'https://foreign.test','X-Conduz-Action':'mercadolivre'}))).status,403);
 assert.equal((await handler(req('POST',{Origin:origin,'X-Conduz-Action':'mercadolivre'}))).status,401);assert.equal(calls,0);
});
