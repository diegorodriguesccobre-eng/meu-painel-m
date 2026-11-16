// Consulta somente leitura de Product Ads (Ad Groups, API v2).
// https://developers.mercadolivre.com.br/pt_br/product-ads-para-catalogo-e-user-products-leitura
const fail=(message,status=422)=>Object.assign(new Error(message),{ads:true,status});
const positiveId=value=>Number.isSafeInteger(value)&&value>0;
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export const ADS_METRICS='cost,total_amount,clicks,direct_amount,indirect_amount,direct_units_quantity,indirect_units_quantity,direct_items_quantity,indirect_items_quantity,organic_units_amount,organic_units_quantity';
export function sellerSkus(item){
 const from=value=>Array.isArray(value)?value.filter(a=>a.id==='SELLER_SKU').map(a=>a.value_name):[];
 const values=[...from(item?.attributes),...(Array.isArray(item?.variations)?item.variations.flatMap(v=>from(v.attributes)):[])];
 return [...new Set(values.filter(v=>typeof v==='string').map(v=>v.trim()).filter(v=>v.length>0&&v.length<=120&&!/[\u0000-\u001f]/.test(v)))].slice(0,100);
}
const detailFields={directRevenue:'direct_amount',indirectRevenue:'indirect_amount',directUnits:'direct_units_quantity',indirectUnits:'indirect_units_quantity',directSales:'direct_items_quantity',indirectSales:'indirect_items_quantity'};
export function adsMetrics(metrics){
 if(!metrics||![metrics.cost,metrics.total_amount,metrics.clicks].every(finite)||!Number.isSafeInteger(metrics.clicks))throw fail('O Mercado Livre retornou métricas incompletas de publicidade.');
 const details=Object.fromEntries(Object.entries(detailFields).map(([key,field])=>[key,metrics[field]]));
 const complete=Object.entries(details).every(([key,value])=>finite(value)&&(key.endsWith('Revenue')||Number.isSafeInteger(value)));
 if(complete&&Math.abs(details.directRevenue+details.indirectRevenue-metrics.total_amount)>.02)throw fail('As receitas diretas e indiretas não correspondem ao total retornado.');
 const organic=finite(metrics.organic_units_amount)&&Number.isSafeInteger(metrics.organic_units_quantity)&&metrics.organic_units_quantity>=0;
 return {cost:metrics.cost,revenue:metrics.total_amount,clicks:metrics.clicks,breakdownComplete:complete,...Object.fromEntries(Object.keys(detailFields).map(key=>[key,complete?details[key]:null])),organicRevenue:organic?metrics.organic_units_amount:null,organicUnits:organic?metrics.organic_units_quantity:null};
}
async function advertisersFor(api){
 let access;
 try{access=await api('/advertising/advertisers?product_id=PADS',1);}catch(error){
  if(error.status===404)throw fail('Product Ads não está disponível para esta conta. Confira Mercado Livre > Meu perfil > Publicidade.',404);
  if(error.status===403)throw fail('O Mercado Livre não liberou a consulta de Product Ads para esta conexão. Confira as permissões de publicidade do aplicativo.',403);
  throw error;
 }
 if(!Array.isArray(access?.advertisers))throw fail('O Mercado Livre retornou uma lista de anunciantes inválida.');
 const advertisers=[...new Map(access.advertisers.filter(a=>a.site_id==='MLB'&&positiveId(a.advertiser_id)).map(a=>[a.advertiser_id,{id:a.advertiser_id,name:String(a.advertiser_name??a.account_name??'Anunciante').slice(0,120)}])).values()];
 if(!advertisers.length)throw fail('Nenhum anunciante Product Ads do Brasil está disponível para esta conta.');
 return advertisers;
}
export async function accountAds({input={},sellerId,api,now=Date.now}){
 const advertisers=await advertisersFor(api);
 const id=input.advertiserId===undefined?(advertisers.length===1?advertisers[0].id:null):input.advertiserId;
 if(id===null)return {advertisers,selectionRequired:true};
 if(!positiveId(id)||!advertisers.some(a=>a.id===id))throw fail('Escolha um anunciante autorizado para esta conta.',403);
 const period=adsPeriod(now),rows=[],seen=new Set();let offset=0,total=null,requests=1;
 do{
  if(++requests>38)throw fail('O total do anunciante atingiu o limite por operação do plano gratuito. Nenhum total parcial foi aplicado.');
  const query=new URLSearchParams({limit:'50',offset:String(offset),date_from:period.dateFrom,date_to:period.dateTo,metrics:ADS_METRICS});
  const data=await api(`/advertising/MLB/advertisers/${id}/product_ads/campaigns/search?${query}`,2),p=data?.paging;
  if(!p||!Number.isSafeInteger(p.total)||p.total<0||!Number.isSafeInteger(p.limit)||p.limit<=0||p.offset!==offset||!Array.isArray(data.results)||data.results.length>p.limit||offset+data.results.length>p.total||total!==null&&total!==p.total)throw fail('A paginação de campanhas está incompleta ou mudou durante a consulta.');
  total=p.total;
  for(const row of data.results){if(!positiveId(row.id)||seen.has(row.id)||row.advertiser_id!==undefined&&row.advertiser_id!==id)throw fail('A consulta de campanhas retornou uma identificação duplicada ou de outro anunciante.');seen.add(row.id);rows.push(adsMetrics(row.metrics));}
  offset+=data.results.length;if(offset<total&&data.results.length!==p.limit)throw fail('O Mercado Livre retornou uma página incompleta de campanhas.');
 }while(offset<total);
 // metrics_summary pode representar apenas a página. Soma métricas por campanha, uma vez.
 const detailed=rows.every(row=>row.breakdownComplete),organic=rows.every(row=>row.organicRevenue!==null),metrics={cost:0,revenue:0,clicks:0,breakdownComplete:detailed,...Object.fromEntries(Object.keys(detailFields).map(k=>[k,detailed?0:null])),organicRevenue:organic?0:null,organicUnits:organic?0:null};
 for(const row of rows){for(const k of ['cost','revenue','clicks'])metrics[k]+=row[k];if(detailed)for(const k of Object.keys(detailFields))metrics[k]+=row[k];if(organic){metrics.organicRevenue+=row.organicRevenue;metrics.organicUnits+=row.organicUnits;}}
 return {advertisers,selectionRequired:false,summary:{source:'mercado-livre-product-ads-account-v2',aggregation:'all-campaign-pages',metricsVersion:2,sellerId,advertiserId:id,advertiserName:advertisers.find(a=>a.id===id).name,currency:'BRL',...period,fetchedAt:new Date(now()).toISOString(),campaignCount:total,...metrics}};
}
export function adsPeriod(now=Date.now){
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now()));
 const end=new Date(day+'T12:00:00Z');end.setUTCDate(end.getUTCDate()-1);
 const start=new Date(end);start.setUTCDate(start.getUTCDate()-29);
 return {dateFrom:start.toISOString().slice(0,10),dateTo:end.toISOString().slice(0,10)};
}
export async function productAds({input,sellerId,api,now=Date.now,range}){
 if(!Array.isArray(input?.itemIds)||!input.itemIds.length||input.itemIds.length>5||input.itemIds.some(id=>!/^MLB\d{5,15}$/.test(id)))throw fail('Consulte de 1 a 5 anúncios vinculados por vez.',400);
 const ids=[...new Set(input.itemIds)],wanted=new Set(ids),period=range??adsPeriod(now);
 let requests=0;
 const read=async(path,version)=>{
  if(++requests>38)throw fail('A consulta de Ads excedeu o limite por operação do plano gratuito. Nenhum Ads deste lote foi alterado.');
  return api(path,version);
 };
 const owned=await read('/items/bulk?'+new URLSearchParams({ids:ids.join(',')}));
 if(!Array.isArray(owned)||ids.some(id=>!owned.some(row=>(row.code??row.status_code)===200&&row.body?.id===id&&Number(row.body.seller_id)===sellerId)))throw fail('Um anúncio não pertence à conta conectada ou não pôde ser verificado.',403);
 const advertisers=(await advertisersFor(read)).map(a=>a.id);
 if(advertisers.length>5)throw fail('Há muitos anunciantes vinculados à conta para uma consulta automática segura.');
 // Só aceitamos páginas completas e consistentes. Nunca transformamos falhas em gasto zero.
 async function pages(path,consume){
  let offset=0,total=null;const signatures=new Set();
  do{
   const join=path.includes('?')?'&':'?',data=await read(path+join+new URLSearchParams({offset:String(offset),limit:'50'}),2);
   const p=data?.paging,rows=data?.results;
   if(!p||!Number.isSafeInteger(p.total)||p.total<0||!Number.isSafeInteger(p.limit)||p.limit<1||p.offset!==offset||!Array.isArray(rows)||rows.length>p.limit||offset+rows.length>p.total||(total!==null&&p.total!==total))throw fail('A paginação de Product Ads mudou ou está incompleta. Tente atualizar novamente.');
   total=p.total;const signature=JSON.stringify(rows);
   if(rows.length&&signatures.has(signature))throw fail('Product Ads repetiu uma página. Os dados anteriores foram preservados.');
   signatures.add(signature);for(const row of rows)consume(row);
   offset+=rows.length;
   if(offset<total&&rows.length!==p.limit)throw fail('O Mercado Livre retornou uma página incompleta de Product Ads.');
  }while(offset<total);
 }
 const groups=new Map();
 for(const advertiser of advertisers){
  await pages(`/advertising/MLB/advertisers/${advertiser}/product_ads/ad_groups/search?`+new URLSearchParams({'filters[item_ids]':ids.join(',')}),row=>{
   if(!positiveId(row.id)||row.advertiser_id!==advertiser)throw fail('Identificação inválida de grupo de anúncios.');
   groups.set(row.id,advertiser);
  });
 }
 const totals=new Map(ids.map(id=>[id,{cost:0,revenue:0,clicks:0,rows:0,breakdownComplete:true,organicComplete:true,organicRevenue:0,organicUnits:0,...Object.fromEntries(Object.keys(detailFields).map(k=>[k,0]))}])),seen=new Set();
 for(const group of groups.keys()){
  await pages(`/advertising/MLB/product_ads/ad_groups/${group}/ads?`+new URLSearchParams({date_from:period.dateFrom,date_to:period.dateTo,metrics:ADS_METRICS}),row=>{
   if(!wanted.has(row.item_id))return; // Grupo compartilhado: nunca atribuir o total do grupo ao produto.
   if(row.ad_group_id!==group||!positiveId(row.campaign_id))throw fail('As métricas não correspondem ao grupo consultado.');
   const key=[row.item_id,group,row.campaign_id].join(':');if(seen.has(key))throw fail('Product Ads retornou métricas duplicadas.');seen.add(key);
   const m=adsMetrics(row.metrics),t=totals.get(row.item_id);t.cost+=m.cost;t.revenue+=m.revenue;t.clicks+=m.clicks;t.rows++;t.breakdownComplete&&=m.breakdownComplete;
   if(m.breakdownComplete)for(const key of Object.keys(detailFields))t[key]+=m[key];
   if(m.organicRevenue===null)t.organicComplete=false;else{t.organicRevenue+=m.organicRevenue;t.organicUnits+=m.organicUnits;}
   if(![t.cost,t.revenue,t.clicks].every(Number.isFinite))throw fail('As métricas excederam os limites de cálculo.');
  });
 }
 return {source:'mercado-livre-product-ads-v2',sellerId,currency:'BRL',...period,fetchedAt:new Date(now()).toISOString(),items:ids.map(itemId=>{
  const t=totals.get(itemId),acos=t.revenue>0?t.cost/t.revenue*100:null,roas=t.cost>0?t.revenue/t.cost:null;
  // Arredonda para cima para não reservar menos que o custo observado.
  const rate=acos===null?null:Math.max(0,Math.ceil((acos-1e-10)*100)/100);
  const breakdownComplete=Boolean(t.rows&&t.breakdownComplete);
  return {itemId,cost:t.cost,revenue:t.revenue,clicks:t.clicks,acos,roas,appliedRate:t.rows&&rate!==null&&rate>=0&&rate<100?rate:null,status:!t.rows?'no-ad':acos===null?'no-revenue':rate>=100?'high-acos':'ready',metricsVersion:2,breakdownComplete,...Object.fromEntries(Object.keys(detailFields).map(key=>[key,breakdownComplete?t[key]:null])),organicRevenue:t.rows&&t.organicComplete?t.organicRevenue:null,organicUnits:t.rows&&t.organicComplete?t.organicUnits:null,skus:sellerSkus(owned.find(row=>row.body?.id===itemId)?.body)};
 })};
}
