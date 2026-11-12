// A tarifa total retornada pelo listing_prices já inclui o custo fixo.
// Nunca soma fixed_fee novamente a sale_fee_amount.
import { shippingQuote } from './ml-frete.mjs';
const MODES={ml:'gold_special',mlPremium:'gold_pro'};
const up=n=>Math.ceil(Number((n*100).toFixed(7)))/100;
const fail=message=>{throw Object.assign(new Error(message),{pricing:true});};

export async function officialPricing({item,input,api,now=Date.now}){
 const {cost,extra,margin,tax,mlShipping,weight}=input;
 if(![cost,extra,margin,tax,mlShipping,weight].every(Number.isFinite)||cost<=0||cost>1e9||extra<0||extra>1e9||mlShipping<0||mlShipping>1e9||weight<0||weight>1e6||margin<0||margin>=100||tax<0||tax>=100)fail('Confira custo, peso, margem, imposto e frete antes de consultar.');
 if(!/^MLB\d+$/.test(item.category_id??''))fail('O anúncio não informou uma categoria brasileira válida.');
 const shippingMode=item.shipping?.mode,logisticType=item.shipping?.logistic_type;
 if(!/^[a-z0-9_]{2,40}$/.test(shippingMode??'')||!/^[a-z0-9_]{2,40}$/.test(logisticType??''))fail('O anúncio não informou modo de envio e logística. Use as taxas manuais até conferir esses dados no Mercado Livre.');
 const cache=new Map(),shippingCache=new Map(),automatic=input.autoShipping===true;
 let profilePromise,shippingForbidden=false;
 const shippingApi=path=>path==='/users/me'?(profilePromise??=api(path)):api(path);
 async function freight(price,scenario,forceFree){
  const key=[price.toFixed(2),scenario,forceFree].join(':');
  if(!shippingCache.has(key))shippingCache.set(key,shippingQuote({item,price,listingType:MODES[scenario],forceFree,weight,api:shippingApi,now,preferTable:shippingForbidden,onForbidden:()=>{shippingForbidden=true;}}));
  return shippingCache.get(key);
 }
 async function quote(price,scenario,billableWeight){
  const key=price.toFixed(2)+':'+(billableWeight??weight*1000);
  if(!cache.has(key))cache.set(key,(async()=>{
   const params=new URLSearchParams({price:price.toFixed(2),category_id:item.category_id,currency_id:'BRL',shipping_mode:shippingMode,logistic_type:logisticType,quantity:'1'});
   if((billableWeight??weight*1000)>0)params.set('billable_weight',String(Math.ceil(billableWeight??weight*1000)));
   if(item.tags?.includes('supermarket_eligible'))params.set('tags','supermarket_eligible');
   const response=await api('/sites/MLB/listing_prices?'+params);
   return Array.isArray(response)?response:[response];
  })());
  const row=(await cache.get(key)).find(r=>r.listing_type_id===MODES[scenario]);
  const rate=row?.sale_fee_details?.percentage_fee,fixed=row?.sale_fee_details?.fixed_fee,sale=row?.sale_fee_amount,listing=row?.listing_fee_amount;
  if(row?.currency_id!=='BRL'||![rate,fixed,sale,listing].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)||rate>=100)fail('A API não retornou uma tarifa completa para Clássico e Premium. Nenhuma taxa manual foi substituída.');
  return {commission:rate,fixed,saleFeeAmount:sale,listingFeeAmount:listing,feeAmount:sale+listing};
 }
 async function solve(scenario,target,shipping,useAutomatic=false,forceFree=false){
  if(tax+target>=100)fail('O imposto e a margem desejada devem somar menos de 100%.');
  let price=up((cost+extra+shipping)/(1-(tax+target)/100)),best=null;
  const seen=new Set();
  for(let round=0;round<12;round++){
   if(!Number.isFinite(price)||price<=0||price>1e9)fail('Não foi possível sugerir um preço válido com esta margem.');
   const shipment=useAutomatic?await freight(price,scenario,forceFree):null,shippingCost=shipment?.amount??shipping;
   const fee=await quote(price,scenario,shipment?.billableWeight),profit=price*(1-tax/100)-cost-extra-shippingCost-fee.feeAmount;
   const result={price,profit,margin:profit/price*100,shippingApplied:shippingCost,...fee,...(shipment?{shippingQuote:shipment}:{})};
   const qualifies=result.margin>=target-1e-8;
   if(qualifies&&(!best||price<best.price))best=result;
   const denominator=1-(fee.commission+tax+target)/100;
   if(denominator<=0)fail('A tarifa oficial, o imposto e a margem deixam este cenário inviável. Reduza a margem para consultar.');
   // A parcela residual usa o total oficial, inclusive arredondamentos e descontos.
   const residual=fee.feeAmount-price*fee.commission/100;
   let next=up((cost+extra+shippingCost+residual)/denominator);
   if(qualifies&&Math.abs(next-price)<.011){
    const previous=up(price-.01);
    if(previous<=0)return result;
    const priorShipment=useAutomatic?await freight(previous,scenario,forceFree):null;
    const prior=await quote(previous,scenario,priorShipment?.billableWeight);
    const priorProfit=previous*(1-tax/100)-cost-extra-(priorShipment?.amount??shipping)-prior.feeAmount;
    if(priorProfit/previous*100<target-1e-8)return result;
    next=previous;
   }
   if(next===price)next=up(price+.01);
   if(seen.has(next.toFixed(2)))break;
   seen.add(price.toFixed(2));price=next;
  }
  // Em uma mudança de faixa descontínua, conserva somente preço já validado.
  if(best)return best;
  fail('As tarifas mudaram entre faixas de preço e a cotação não convergiu. Tente uma margem diferente ou use as taxas manuais.');
 }
 async function forMargin(scenario,target){
  if(automatic)return solve(scenario,target,0,true);
  const base=await solve(scenario,target,0);
  return base.price>100&&mlShipping>0?solve(scenario,target,mlShipping):base;
 }
 const entries=await Promise.all(Object.keys(MODES).map(async scenario=>[scenario,{desired:await forMargin(scenario,margin),minimum:await forMargin(scenario,10)}]));
 const quotes=Object.fromEntries(entries),selected=quotes[item.listing_type_id==='gold_pro'?'mlPremium':'ml'].desired;
 return {source:'mercadolivre-listing-prices',fetchedAt:new Date(now()).toISOString(),itemId:item.id,categoryId:item.category_id,shippingMode,logisticType,inputs:{cost,extra,margin,tax,mlShipping:automatic?selected.shippingApplied:mlShipping,weight,...(automatic?{autoShipping:true}:{})},...(automatic?{shippingQuote:selected.shippingQuote}:{}),quotes};
}
