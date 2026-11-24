const fields = ['cost','revenue','clicks','directRevenue','indirectRevenue','directUnits','indirectUnits','directSales','indirectSales'];
function metrics(itemId, dateFrom, dateTo, sellerId=123, fetchedAt='2026-11-24T13:00:00.000Z') {
 return {source:'mercado-livre-product-ads-v2',metricsVersion:2,sellerId,itemId,currency:'BRL',dateFrom,dateTo,fetchedAt,cost:10,revenue:100,clicks:20,acos:10,roas:10,appliedRate:10,status:'ready',breakdownComplete:true,directRevenue:80,indirectRevenue:20,directUnits:8,indirectUnits:2,directSales:7,indirectSales:2};
}
function report({baseDate='2026-11-15',itemId='MLB1234567890',sellerId=123,fetchedAt}={}) {
 const end=Date.parse(baseDate),ranges=Array.from({length:4},(_,i)=>({dateFrom:new Date(end-(27-i*7)*86400000).toISOString().slice(0,10),dateTo:new Date(end-(21-i*7)*86400000).toISOString().slice(0,10)}));
 const periods=ranges.map(r=>metrics(itemId,r.dateFrom,r.dateTo,sellerId,fetchedAt));
 const total=metrics(itemId,ranges[0].dateFrom,baseDate,sellerId,fetchedAt);
 for(const field of fields)total[field]*=4;
 return {source:'mercado-livre-product-ads-history-v2',sellerId,currency:'BRL',baseDate,bucketDays:7,dateFrom:ranges[0].dateFrom,dateTo:baseDate,fetchedAt:total.fetchedAt,ranges,items:[{itemId,periods,total}]};
}
function reconciliation(a=report().items[0].periods[0],overrides={}) {
 const basis=JSON.stringify(['sellerId','itemId','dateFrom','dateTo','cost','revenue','directRevenue','indirectRevenue','directUnits','indirectUnits','directSales','indirectSales'].map(k=>a[k]));
 return {source:'manual-reconciliation',sellerId:a.sellerId,itemId:a.itemId,dateFrom:a.dateFrom,dateTo:a.dateTo,scope:'direct',basis,savedAt:a.fetchedAt,notes:'Conferência sintética das vendas diretas.',revenue:80,goods:20,fees:12,tax:4,shipping:5,other:1,...overrides};
}
function account({sellerId=123,advertiserId=77,fetchedAt='2026-11-24T13:00:00.000Z'}={}) {
 return {source:'mercado-livre-product-ads-account-v2',aggregation:'all-campaign-pages',metricsVersion:2,sellerId,advertiserId,advertiserName:'Anunciante de teste',currency:'BRL',dateFrom:'2026-10-17',dateTo:'2026-11-15',fetchedAt,campaignCount:1,cost:10,revenue:100,clicks:20,breakdownComplete:true,directRevenue:80,indirectRevenue:20,directUnits:8,indirectUnits:2,directSales:7,indirectSales:2};
}
module.exports={metrics,report,reconciliation,account};
