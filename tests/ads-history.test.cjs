const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const now=()=>Date.parse('2026-11-16T13:00:00Z'),id='MLB1234567890';
const code=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const context=vm.createContext({URL});vm.runInContext(code.slice(0,code.indexOf('let state=defaults()'))+code.slice(code.indexOf('function csvCell'),code.indexOf("$('export').onclick"))+';globalThis.api={defaults,validState,validProductAds,validAdsHistory,adsHistoryRanges,adsHistoryMetric,adsHistoryCsv,adsEvidenceKey,adsReconciled,buildBackup,parseBackup,adsTrend};',context);const core=context.api;
function setup(options={}){
 const calls=[],page=results=>({paging:{offset:0,total:results.length,limit:50},results});
 const api=async(path,version)=>{
  calls.push(path);const u=new URL(path,'https://api.mercadolibre.com');
  if(u.pathname==='/items/bulk')return [{code:200,body:{id,seller_id:options.foreign?999:123,attributes:[{id:'SELLER_SKU',value_name:'CONECTOR-KIT10'}],variations:[{attributes:[{id:'SELLER_SKU',value_name:'CONECTOR-KIT10-A'}]}]}}];
  if(u.pathname==='/advertising/advertisers')return {advertisers:[{advertiser_id:77,site_id:'MLB'}]};
  if(u.pathname==='/orders/search'){
   if(options.sales===false)throw Object.assign(Error('SEM_ACESSO'),{status:403});
   const day=u.searchParams.get('order.date_created.from').slice(0,10);
   return page([{id:Number(day.replaceAll('-','')),seller:{id:123},status:'paid',currency_id:'BRL',date_created:day+'T12:00:00-03:00',order_items:[{item:{id},unit_price:100,quantity:5}]}]);
  }
  assert.equal(version,2);if(u.pathname.endsWith('/ad_groups/search'))return page([{id:80,advertiser_id:77}]);
  assert.match(path,/ad_groups\/80\/ads/);const index=['2026-10-19','2026-10-26','2026-11-02','2026-11-09'].indexOf(u.searchParams.get('date_from'));assert.ok(index>=0);
  if(options.fail===index)throw Error('Falha de teste');
  if(options.missing===index)return page([]);
  const cost=[50,10,20,20][index],direct=[150,300,300,250][index],indirect=[50,100,0,50][index];
  return page([{item_id:id,campaign_id:10,ad_group_id:80,metrics:{cost,total_amount:direct+indirect,clicks:50,direct_amount:direct,indirect_amount:indirect,direct_units_quantity:5,indirect_units_quantity:1,direct_items_quantity:5,indirect_items_quantity:1,...(options.organic===false?{}:{organic_units_amount:100,organic_units_quantity:2})}}]);
 };
 return {calls,run:async()=>{const {productAdsHistory}=await import('../netlify/lib/ml-ads-history.mjs');return productAdsHistory({input:{itemIds:[id],baseDate:'2026-11-15',bucketDays:7},sellerId:123,api,now});}};
}
function product(){return {id:'p',name:'Conector',category:'Teste',cost:10,extra:0,weight:.1,mlShipping:0,margin:20,adsMl:5,feeSnapshot:core.defaults().fees,mercadoLivre:{itemId:id,sellerId:123,title:'Conector',categoryId:'MLB1234',categoryName:'Teste',catalogProductId:null,listingType:'gold_special',permalink:'https://produto.mercadolivre.com.br/MLB-1234567890-_JM',price:100,weight:.1,thumbnail:null,variationCount:0,fetchedAt:new Date(now()).toISOString()}};}
test('quatro semanas fechadas reproduzem as datas da referência e respeitam limite de 90 dias',async()=>{
 const {historyRanges}=await import('../netlify/lib/ml-ads-history.mjs'),ranges=historyRanges({baseDate:'2026-11-15',bucketDays:7},now);
 assert.deepEqual(ranges,[{dateFrom:'2026-10-19',dateTo:'2026-10-25'},{dateFrom:'2026-10-26',dateTo:'2026-11-01'},{dateFrom:'2026-11-02',dateTo:'2026-11-08'},{dateFrom:'2026-11-09',dateTo:'2026-11-15'}]);
 assert.deepEqual(JSON.parse(JSON.stringify(core.adsHistoryRanges('2026-11-15',7))),ranges);
 assert.throws(()=>historyRanges({baseDate:'2026-11-16',bucketDays:7},now),/encerrados/);
 assert.throws(()=>historyRanges({baseDate:'2026-09-01',bucketDays:30},now),/90 dias/);
 assert.throws(()=>historyRanges({baseDate:'2026-11-31',bucketDays:7},now),/válida/);
 assert.equal(historyRanges({baseDate:'2026-11-15',bucketDays:30},now).length,3);
});
test('cache de metadados consulta somente GET, verifica propriedade e recalcula razões do total',async()=>{
 const f=setup(),h=await f.run();assert.equal(f.calls.length,11);assert.equal(f.calls.filter(path=>path.startsWith('/items/bulk')).length,1);
 assert.equal(h.items[0].total.cost,100);assert.equal(h.items[0].total.revenue,1200);assert.equal(h.items[0].total.roas,12);assert.notEqual(h.items[0].total.roas,(4+40+15+15)/4);
 assert.equal(h.items[0].total.organicRevenue,400);assert.deepEqual(h.items[0].total.skus,['CONECTOR-KIT10','CONECTOR-KIT10-A']);assert.ok(core.validAdsHistory(h));
 await assert.rejects(setup({foreign:true}).run(),e=>e.ads&&e.status===403);await assert.rejects(setup({fail:2}).run(),/Falha/);
});
test('TACOS usa faturamento pago do próprio item; receita atribuída e orgânico não substituem pedidos',async()=>{
 const h=await setup().run(),p=product(),total=h.items[0].total;
 assert.equal(core.adsHistoryMetric(total,p,core.defaults().fees,[],'tacos'),5);assert.equal(total.sales.revenue,2000);
 assert.ok(Math.abs(core.adsHistoryMetric(total,p,core.defaults().fees,[],'acos')-100/1200*100)<1e-9);
 const missing=await setup({organic:false}).run();assert.equal(core.adsHistoryMetric(missing.items[0].total,p,core.defaults().fees,[],'tacos'),5);
 const denied=await setup({sales:false}).run();assert.equal(core.adsHistoryMetric(denied.items[0].total,p,core.defaults().fees,[],'tacos'),null);assert.equal(denied.items[0].total.salesIssue,'permission');assert.equal(denied.items[0].total.roas,12);
 assert.equal(core.adsHistoryMetric(total,p,core.defaults().fees,[],'actual'),null);
});
test('backup v17 guarda comparativo/SKU e aceita conciliação semanal sem alterar Ads de precificação',async()=>{
 const h=await setup().run(),p=product(),a=h.items[0].periods[0],r={source:'manual-reconciliation',sellerId:123,itemId:id,dateFrom:a.dateFrom,dateTo:a.dateTo,scope:'direct',basis:core.adsEvidenceKey(a),savedAt:new Date(now()).toISOString(),notes:'Relatório semanal; todo gasto alocado às vendas diretas.',revenue:150,goods:50,fees:20,tax:9,shipping:10,other:1};
 const data={products:[p],kits:[],fees:core.defaults().fees,adsHistory:h,adsReconciliations:[r]};assert.ok(core.validState(data));
 const text=core.buildBackup(data),restored=core.parseBackup(text);assert.equal(JSON.parse(text).version,17);assert.equal(restored.products[0].adsMl,5);
 assert.equal(core.adsReconciled({...p,mlAds:a},[r]).profit,10);assert.equal(core.adsHistoryMetric(a,p,data.fees,[r],'actual'),10);
 assert.equal(restored.adsHistory.items[0].total.organicRevenue,400);
 assert.equal(restored.adsHistory.items[0].total.sales.revenue,2000);
 const corrupt=JSON.parse(JSON.stringify(data));corrupt.adsHistory.items[0].total.cost=1;assert.equal(core.validState(corrupt),false);
});
test('backup anterior não recebe TACOS estimado como se fosse faturamento; totais de vendas adulterados são rejeitados',async()=>{
 const h=await setup().run(),p=product();for(const a of [...h.items[0].periods,h.items[0].total])delete a.sales;assert.ok(core.validAdsHistory(h));assert.equal(core.adsHistoryMetric(h.items[0].total,p,core.defaults().fees,[],'tacos'),null);
 const bad=await setup().run();bad.items[0].total.sales.revenue=1;assert.equal(core.validAdsHistory(bad),false);
});
test('CSV exporta células visíveis, datas, razões e lucro com proteção de fórmula e sem inventar apuração',async()=>{
 const h=await setup().run(),p=product();p.name='=HYPERLINK("teste")';const csv=core.adsHistoryCsv([{product:p,history:h.items[0]}],h.ranges,'cost',core.defaults().fees,[]),lines=csv.split('\r\n');
 assert.equal(lines.length,6);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes("' =")==false);assert.match(csv,/'=HYPERLINK/);assert.ok(csv.includes('CONECTOR-KIT10'));assert.ok(csv.includes('Total recalculado'));
 assert.equal(core.adsTrend(20,10).arrow,'↑');assert.equal(core.adsTrend(10,20).arrow,'↓');assert.equal(core.adsTrend(null,20).arrow,'');
});
test('total apurado pode somar períodos conciliados somente se todos têm a mesma base',async()=>{
 const h=await setup().run(),p=product(),row=h.items[0];
 const records=row.periods.map(a=>({source:'manual-reconciliation',sellerId:123,itemId:id,dateFrom:a.dateFrom,dateTo:a.dateTo,scope:'direct',basis:core.adsEvidenceKey(a),savedAt:new Date(now()).toISOString(),notes:'Relatório semanal conferido. Ads uma vez nas diretas.',revenue:150,goods:0,fees:0,tax:0,shipping:0,other:0}));
 assert.equal(core.adsHistoryMetric(row.total,p,core.defaults().fees,records,'actual',row),500);
 assert.equal(core.adsHistoryMetric(row.total,p,core.defaults().fees,records.slice(0,3),'actual',row),null);
 assert.equal(core.adsHistoryMetric(row.total,p,core.defaults().fees,[{...records[0],scope:'attributed'},...records.slice(1)],'actual',row),null);
});
test('uma semana sem dados não vira zero nem produz um total de período falsamente completo',async()=>{
 const h=await setup({missing:1}).run(),p=product(),row=h.items[0];assert.ok(core.validAdsHistory(h));assert.equal(row.periods[1].status,'no-ad');assert.equal(row.total.periodsComplete,false);
 for(const metric of ['cost','revenue','acos','roas','tacos','estimate','actual'])assert.equal(core.adsHistoryMetric(row.total,p,core.defaults().fees,[],metric,row),null);
 const csv=core.adsHistoryCsv([{product:p,history:row}],h.ranges,'cost',core.defaults().fees,[]);assert.ok(!csv.split('\r\n').at(-1).includes('90,0000'),'total parcial não é exportado como total completo');
});
