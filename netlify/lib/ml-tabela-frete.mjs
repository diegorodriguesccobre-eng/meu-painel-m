// Dados numéricos da ajuda oficial 40538, conferidos em 12/11/2026.
export const TABLE_CHECKED_AT='2026-11-12T16:35:00.000Z';
export const TABLE_URL='https://www.mercadolivre.com.br/ajuda/40538';
const limits=[.3,.5,1,1.5,2,3,4,5,6,7,8,9,10,11,13,15,17,20,25,30,40,50,60,70,80,90,100,125,150,Infinity];
const rows=[
 [5.65,6.85,8.15,12.95,14.95,16.95,19.05,21.65],
 [5.95,6.95,8.25,13.85,16.15,18.15,20.45,23.25],
 [6.05,7.15,8.45,14.45,16.85,19.05,21.35,24.45],
 [6.15,7.35,8.65,14.75,17.15,19.45,21.75,25.45],
 [6.25,7.45,8.75,15.05,17.65,19.85,22.25,25.55],
 [6.35,8.65,9.15,16.45,19.15,21.65,24.35,27.05],
 [6.45,8.75,9.75,17.85,20.75,23.35,26.35,29.25],
 [6.55,8.85,10.25,19.75,22.85,26.05,29.25,32.45],
 [6.65,8.95,10.35,25.95,29.15,33.35,36.45,40.85],
 [6.75,9.05,10.45,27.55,31.65,36.75,40.85,45.25],
 [6.85,9.25,10.55,29.45,34.35,39.25,44.15,49.35],
 [6.95,9.35,10.65,30.25,35.25,40.35,45.35,50.75],
 [7.05,9.45,10.85,38.25,45.05,51.95,58.75,65.85],
 [7.05,9.65,11.05,41.65,48.55,55.45,62.35,69.35],
 [7.15,10.05,11.45,42.55,49.75,56.85,63.85,70.95],
 [7.25,10.25,11.65,45.55,52.95,60.55,68.15,75.65],
 [7.35,10.45,11.85,48.95,56.55,64.05,71.35,79.35],
 [7.45,10.65,12.05,55.15,64.35,73.55,82.75,91.95],
 [7.65,11.05,12.25,64.55,75.75,85.45,96.25,106.85],
 [7.75,11.25,12.45,66.45,76.05,86.25,97.15,107.85],
 [7.85,11.45,12.65,68.35,79.65,89.75,100.05,107.95],
 [7.95,11.65,12.85,70.95,81.85,92.85,103.45,111.65],
 [8.05,11.85,13.05,75.55,87.25,99.05,110.25,119.05],
 [8.15,12.05,13.25,80.95,93.75,105.95,118.05,127.45],
 [8.25,12.25,13.45,84.65,97.95,110.75,123.35,133.15],
 [8.35,12.45,13.65,94.05,108.35,122.95,136.95,147.85],
 [8.45,12.65,13.85,107.45,124.85,140.45,156.45,168.85],
 [8.55,12.85,14.05,120.15,138.95,156.95,174.85,188.85],
 [8.65,12.85,14.25,127.45,147.05,166.55,185.55,200.35],
 [8.75,12.85,14.45,167.05,193.35,218.45,243.45,262.85]
];
const reject=message=>{throw Object.assign(new Error(message),{shipping:true,pricing:true});};
function measure(item,key,unit){
 const a=item.attributes?.find(a=>a.id===key),v=a?.value_struct??a?.values?.[0]?.struct;
 const text=v?`${v.number} ${v.unit}`:a?.value_name;
 const m=String(text??'').match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|mg|cm|mm|m)$/i);if(!m)return null;
 const scale=unit==='kg'?{kg:1,g:.001,mg:.000001}:{cm:1,mm:.1,m:100};
 return scale[m[2]]?Number(m[1].replace(',','.'))*scale[m[2]]:null;
}
export function tableShippingQuote({item,price,listingType,freeShipping,weight,profile,now=Date.now}){
 const rep=profile?.seller_reputation;
 const eligible=rep&&(/^5_green/.test(rep.level_id??'')||rep.level_id===null||['silver','gold','platinum'].includes(rep.power_seller_status));
 if(!eligible)reject('Não foi possível confirmar que a conta se enquadra na tabela para MercadoLíder, reputação verde ou sem reputação. Informe o frete manualmente.');
 if(item.condition!=='new'||!['fulfillment','cross_docking','xd_drop_off','drop_off'].includes(item.shipping?.logistic_type)||item.tags?.includes('supermarket_eligible')||/BOOK|PET_FOOD|ANIMAL_FOOD/.test(item.domain_id??''))reject('Este anúncio exige uma tabela de frete específica. Confira o custo no Mercado Livre.');
 if(!Number.isFinite(price)||price<=0)reject('Não foi possível obter o preço de referência para estimar o frete pela tabela.');
 let dims=null,physical=weight>0?weight:null;
 const parsed=String(item.shipping?.dimensions??'').match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/);
 if(parsed){dims=parsed.slice(1,4).map(Number);physical??=Number(parsed[4])/1000;}
 if(!dims){const values=['HEIGHT','WIDTH','LENGTH'].map(k=>measure(item,'SELLER_PACKAGE_'+k,'cm')??measure(item,'PACKAGE_'+k,'cm'));if(values.every(v=>v>0))dims=values;}
 physical??=measure(item,'SELLER_PACKAGE_WEIGHT','kg')??measure(item,'PACKAGE_WEIGHT','kg')??measure(item,'WEIGHT','kg');
 if(!Number.isFinite(physical)||physical<=0)reject('Informe o peso do pacote para preencher o frete automaticamente.');
 const billable=Math.max(physical,dims?dims.reduce((a,b)=>a*b,1)/6000:0),row=rows[limits.findIndex(limit=>billable<=limit)],cents=Math.round(price*100);
 const column=[1899,4899,7899,9999,11999,14999,19999,Infinity].findIndex(limit=>cents<=limit);
 let amount=row[freeShipping&&price<79?3:column];
 if(price<19)amount=Math.min(amount,Math.floor(price*50)/100);
 return {source:'mercadolivre-shipping-table',itemId:item.id,amount,currency:'BRL',fetchedAt:new Date(now()).toISOString(),price,listingType,shippingMode:'me2',logisticType:item.shipping.logistic_type,freeShipping,billableWeight:Math.ceil(billable*1000),tableCheckedAt:TABLE_CHECKED_AT,dimensionsKnown:Boolean(dims)};
}
