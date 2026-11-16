import {productAds,adsPeriod} from './ml-ads.mjs';
const fail=message=>Object.assign(new Error(message),{ads:true,status:422});
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function historyRanges({baseDate,bucketDays},now=Date.now){
 if(!date(baseDate)||![7,14,30].includes(bucketDays))throw fail('Escolha uma data-base válida e períodos de 7, 14 ou 30 dias.');
 const latest=adsPeriod(now).dateTo,count=bucketDays===30?3:4,span=count*bucketDays,end=Date.parse(baseDate+'T00:00:00Z'),start=end-(span-1)*86400000;
 if(baseDate>latest||start<Date.parse(latest+'T00:00:00Z')-89*86400000)throw fail('A comparação deve usar somente dias encerrados dos últimos 90 dias disponíveis na API.');
 return Array.from({length:count},(_,index)=>({dateFrom:new Date(start+index*bucketDays*86400000).toISOString().slice(0,10),dateTo:new Date(start+((index+1)*bucketDays-1)*86400000).toISOString().slice(0,10)}));
}
export function sumAdsPeriods(periods){
 const fields=['cost','revenue','clicks','directRevenue','indirectRevenue','directUnits','indirectUnits','directSales','indirectSales','organicRevenue','organicUnits'];
 const measured=periods.filter(p=>p.status!=='no-ad'),detailed=measured.length>0&&measured.every(p=>p.breakdownComplete),organic=measured.length>0&&measured.every(p=>p.organicRevenue!==null&&p.organicRevenue!==undefined);
 const totals=Object.fromEntries(fields.map(k=>[k,k.startsWith('organic')?!organic?null:measured.reduce((s,p)=>s+p[k],0):k.startsWith('direct')||k.startsWith('indirect')?!detailed?null:measured.reduce((s,p)=>s+p[k],0):measured.reduce((s,p)=>s+p[k],0)]));
 const acos=totals.revenue>0?totals.cost/totals.revenue*100:null,roas=totals.cost>0?totals.revenue/totals.cost:null,rate=acos===null?null:Math.max(0,Math.ceil((acos-1e-10)*100)/100);
 return {...periods[0],...totals,dateTo:periods.at(-1).dateTo,periodsComplete:measured.length===periods.length,breakdownComplete:detailed,acos,roas,appliedRate:rate!==null&&rate<100?rate:null,status:!measured.length?'no-ad':acos===null?'no-revenue':rate>=100?'high-acos':'ready'};
}
export async function productAdsHistory({input,sellerId,api,now=Date.now}){
 if(!Array.isArray(input?.itemIds)||!input.itemIds.length||input.itemIds.length>2)throw fail('Consulte até dois anúncios por lote no comparativo.');
 const ranges=historyRanges(input,now),cache=new Map();let requests=0;
 const read=(path,version)=>{
  const key=version+':'+path;if(cache.has(key))return cache.get(key);
  if(++requests>38)throw fail('O comparativo atingiu o limite por operação do plano gratuito. Os dados anteriores foram preservados.');
  const result=api(path,version);cache.set(key,result);return result;
 };
 const queries=[];for(const range of ranges)queries.push(await productAds({input:{itemIds:input.itemIds},sellerId,api:read,now,range}));
 const first=queries[0];
 return {source:'mercado-livre-product-ads-history-v2',sellerId,currency:'BRL',baseDate:input.baseDate,bucketDays:input.bucketDays,dateFrom:ranges[0].dateFrom,dateTo:ranges.at(-1).dateTo,fetchedAt:new Date(now()).toISOString(),ranges,items:first.items.map(item=>{
  const periods=queries.map((query,index)=>{const row=query.items.find(row=>row.itemId===item.itemId);if(!row)throw fail('Uma comparação veio incompleta.');return {...row,source:first.source,sellerId,currency:'BRL',...ranges[index],fetchedAt:query.fetchedAt};});
  return {itemId:item.itemId,periods,total:sumAdsPeriods(periods)};
 })};
}
