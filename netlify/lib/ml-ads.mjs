// Consulta somente leitura de Product Ads (Ad Groups, API v2).
// https://developers.mercadolivre.com.br/pt_br/product-ads-para-catalogo-e-user-products-leitura
const fail=(message,status=422)=>Object.assign(new Error(message),{ads:true,status});
const positiveId=value=>Number.isSafeInteger(value)&&value>0;
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export function adsPeriod(now=Date.now){
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now()));
 const end=new Date(day+'T12:00:00Z');end.setUTCDate(end.getUTCDate()-1);
 const start=new Date(end);start.setUTCDate(start.getUTCDate()-29);
 return {dateFrom:start.toISOString().slice(0,10),dateTo:end.toISOString().slice(0,10)};
}
export async function productAds({input,sellerId,api,now=Date.now}){
 if(!Array.isArray(input?.itemIds)||!input.itemIds.length||input.itemIds.length>5||input.itemIds.some(id=>!/^MLB\d{5,15}$/.test(id)))throw fail('Consulte de 1 a 5 anúncios vinculados por vez.',400);
 const ids=[...new Set(input.itemIds)],wanted=new Set(ids),period=adsPeriod(now);
 let requests=0;
 const read=async(path,version)=>{
  if(++requests>38)throw fail('A consulta de Ads excedeu o limite por operação do plano gratuito. Nenhum Ads deste lote foi alterado.');
  return api(path,version);
 };
 const owned=await read('/items/bulk?'+new URLSearchParams({ids:ids.join(',')}));
 if(!Array.isArray(owned)||ids.some(id=>!owned.some(row=>(row.code??row.status_code)===200&&row.body?.id===id&&Number(row.body.seller_id)===sellerId)))throw fail('Um anúncio não pertence à conta conectada ou não pôde ser verificado.',403);
 let access;
 try{access=await read('/advertising/advertisers?product_id=PADS',1);}catch(error){
  if(error.status===404)throw fail('Product Ads não está disponível para esta conta. Confira Mercado Livre > Meu perfil > Publicidade.',404);
  if(error.status===403)throw fail('O Mercado Livre não liberou a consulta de Product Ads para esta conexão. Confira as permissões de publicidade do aplicativo.',403);
  throw error;
 }
 if(!Array.isArray(access?.advertisers))throw fail('O Mercado Livre retornou uma lista de anunciantes inválida.');
 const advertisers=[...new Set(access.advertisers.filter(a=>a.site_id==='MLB'&&positiveId(a.advertiser_id)).map(a=>a.advertiser_id))];
 if(!advertisers.length)throw fail('Nenhum anunciante Product Ads do Brasil está disponível para esta conta.');
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
 const totals=new Map(ids.map(id=>[id,{cost:0,revenue:0,clicks:0,rows:0}])),seen=new Set();
 for(const group of groups.keys()){
  await pages(`/advertising/MLB/product_ads/ad_groups/${group}/ads?`+new URLSearchParams({date_from:period.dateFrom,date_to:period.dateTo,metrics:'cost,total_amount,clicks,roas,acos'}),row=>{
   if(!wanted.has(row.item_id))return; // Grupo compartilhado: nunca atribuir o total do grupo ao produto.
   if(row.ad_group_id!==group||!positiveId(row.campaign_id))throw fail('As métricas não correspondem ao grupo consultado.');
   const key=[row.item_id,group,row.campaign_id].join(':');if(seen.has(key))throw fail('Product Ads retornou métricas duplicadas.');seen.add(key);
   const m=row.metrics;if(!m||![m.cost,m.total_amount,m.clicks].every(finite)||!Number.isSafeInteger(m.clicks))throw fail('O Mercado Livre retornou métricas incompletas de publicidade.');
   const t=totals.get(row.item_id);t.cost+=m.cost;t.revenue+=m.total_amount;t.clicks+=m.clicks;t.rows++;
   if(![t.cost,t.revenue,t.clicks].every(Number.isFinite))throw fail('As métricas excederam os limites de cálculo.');
  });
 }
 return {source:'mercado-livre-product-ads-v2',sellerId,currency:'BRL',...period,fetchedAt:new Date(now()).toISOString(),items:ids.map(itemId=>{
  const t=totals.get(itemId),acos=t.revenue>0?t.cost/t.revenue*100:null,roas=t.cost>0?t.revenue/t.cost:null;
  // Arredonda para cima para não reservar menos que o custo observado.
  const rate=acos===null?null:Math.max(0,Math.ceil((acos-1e-10)*100)/100);
  return {itemId,cost:t.cost,revenue:t.revenue,clicks:t.clicks,acos,roas,appliedRate:t.rows&&rate!==null&&rate>=0&&rate<100?rate:null,status:!t.rows?'no-ad':acos===null?'no-revenue':rate>=100?'high-acos':'ready'};
 })};
}
