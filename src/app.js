
'use strict';
const LEGACY_CATALOG_KEY='margem.painel.v1',ACTIVE_CATALOG_ACCOUNT='conduz.catalog.active-account.v1';
let KEY=LEGACY_CATALOG_KEY,activeCatalogAccount=null,legacyCatalogAccount=null;
const validCatalogAccount=id=>typeof id==='string'&&/^[1-9]\d{0,15}$/.test(id);
function accountCatalogKey(id){if(!validCatalogAccount(id))throw Error('Conta do catálogo inválida.');return LEGACY_CATALOG_KEY+'.account.'+id;}
function catalogOwners(data){
 const ids=[...(data.products??[]).flatMap(p=>[p.mercadoLivre?.sellerId,p.mlAds?.sellerId]),...(data.pendingProducts??[]).map(p=>p.item?.sellerId),...(data.adsReports??[]).map(r=>r.sellerId),...(data.adsAccounts??[]).map(r=>r.sellerId),...(data.adsReconciliations??[]).map(r=>r.sellerId),data.adsHistory?.sellerId,data.adsAccount?.sellerId];
 return new Set(ids.filter(id=>id!==undefined&&id!==null).map(String));
}
function planAccountCatalog(data,sellerId,previousId,legacyId,read){
 const key=accountCatalogKey(sellerId),owners=catalogOwners(data);
 const previous=previousId??(validCatalogAccount(legacyId)?legacyId:owners.size===1?[...owners][0]:null);
 if(previous&&[...owners].some(id=>id!==previous))throw Error('A cópia local contém dados de outra conta. Faça um backup e confira a associação antes de trocar de empresa.');
 const raw=read(key);let next;
 if(raw!==null){try{next=JSON.parse(raw);}catch{throw Error('Não foi possível ler o catálogo local desta conta. A cópia anterior foi preservada.');}if(!validState(next)||[...catalogOwners(next)].some(id=>id!==sellerId))throw Error('O catálogo local não corresponde à conta conectada. A cópia anterior foi preservada.');next=preserveCatalogFees(next);}
 else next=previous===sellerId?preserveCatalogFees(data):defaults();
 const writes=new Map();
 if(previousId)writes.set(accountCatalogKey(previousId),JSON.stringify(data));
 else if(previous&&read(accountCatalogKey(previous))===null)writes.set(accountCatalogKey(previous),JSON.stringify(data));
 writes.set(key,JSON.stringify(next));
 return {key,data:next,writes:[...writes],changed:previous!==sellerId};
}
const MARKETS={ml:'Mercado Livre',shopee:'Shopee'};
const SCENARIOS={ml:'Mercado Livre Clássico',mlPremium:'Mercado Livre Premium',shopee:'Shopee'};
// Política CNPJ verificada na Central do Vendedor em 13/11/2026. Cada cadastro guarda a versão.
const SHOPEE_POLICY_ID='cnpj-2026-10-01-checked-2026-11-13';
const SHOPEE_POLICY={checkedAt:'2026-11-13',easyReturnFee:.49,eventRate:5,url:'https://seller.shopee.com.br/edu/article/26839',returnsUrl:'https://seller.shopee.com.br/edu/article/26700',eventsUrl:'https://seller.shopee.com.br/edu/article/18712'};
const SHOPEE_BANDS=[{min:1,max:899,rate:20,half:true,fixed:0},{min:900,max:7999,rate:20,fixed:4.5},{min:8000,max:9999,rate:14,fixed:16},{min:10000,max:19999,rate:14,fixed:20},{min:20000,max:100000000000,rate:14,fixed:26}];
// Ads é uma reserva percentual do preço, independente das tarifas dos marketplaces.
const ADS_FIELDS=['ads','adsMl','adsShopee'];
const adsRate=(product,scenario='ml')=>product[scenario==='shopee'?'adsShopee':'adsMl']===undefined?(product.ads===undefined?0:product.ads):product[scenario==='shopee'?'adsShopee':'adsMl'];
const validAds=product=>ADS_FIELDS.every(k=>product[k]===undefined||Number.isFinite(product[k])&&product[k]>=0&&product[k]<100);
const copyAds=product=>Object.fromEntries(ADS_FIELDS.filter(k=>product[k]!==undefined).map(k=>[k,product[k]]));
function shopeeAtPrice(product,fee,cents){
 if(!validAds(product))return null;
 const band=SHOPEE_BANDS.find(b=>cents>=b.min&&cents<=b.max);if(!band)return null;
 const price=cents/100,commission=band.rate+(fee.officialEventEnabled?SHOPEE_POLICY.eventRate:0),commissionAmount=Math.round(cents*commission/100)/100;
 const fixedBase=band.half?Math.round(cents/2)/100:band.fixed,easyReturnApplied=fee.easyReturnEnabled?SHOPEE_POLICY.easyReturnFee:0;
 const ads=adsRate(product,'shopee'),adsAmount=price*ads/100,profit=price*(1-fee.tax/100)-product.cost-product.extra-commissionAmount-fixedBase-easyReturnApplied-adsAmount;
 return {price,profit,margin:profit/price*100,adsRate:ads,adsAmount,shippingApplied:0,commissionAmount,fixedBase,easyReturnApplied,baseCommission:band.rate,shopeePolicy:SHOPEE_POLICY_ID,feesApplied:{commission,fixed:fixedBase+easyReturnApplied,tax:fee.tax}};
}
function calculateShopee(product,fee){
 if(!validAds(product)||![product.cost,product.extra,product.margin,fee.tax].every(Number.isFinite)||product.cost<=0||product.extra<0||product.margin<0||fee.tax<0)return null;
 let best=null;
 for(const band of SHOPEE_BANDS){
  const rate=band.rate+(fee.officialEventEnabled?SHOPEE_POLICY.eventRate:0),slope=100-rate-fee.tax-product.margin-adsRate(product,'shopee')-(band.half?50:0);
  if(slope<=0)continue;
  const base=(product.cost+product.extra+band.fixed+(fee.easyReturnEnabled?SHOPEE_POLICY.easyReturnFee:0))*100;
  // A comissão arredondada em centavos repete o padrão a cada R$ 1. Examina os
  // 100 resíduos para obter o menor centavo viável em cada faixa, sem iteração de preços.
  for(let remainder=0;remainder<100;remainder++){
   const intercept=remainder*(1-(fee.tax+product.margin+adsRate(product,'shopee'))/100)-Math.round(remainder*rate/100)-(band.half?Math.round(remainder/2):0);
   const whole=Math.max(0,Math.ceil((band.min-remainder)/100),Math.ceil((base-intercept-1e-7)/slope));
   const cents=whole*100+remainder;if(cents<band.min||cents>band.max||best&&cents>=Math.round(best.price*100))continue;
   const result=shopeeAtPrice(product,fee,cents);if(result&&result.margin>=product.margin-1e-8)best=result;
  }
 }
 return best;
}
const marketOf=scenario=>scenario==='mlPremium'?'ml':scenario;
const defaults=()=>({products:[],kits:[],fees:{ml:{commission:14,premiumCommission:19,fixed:6,tax:6},shopee:{commission:20,fixed:4,tax:6,easyReturnFee:.49,officialEventRate:2.5,easyReturnEnabled:false,officialEventEnabled:false}}});
function effectiveFee(product,fee,scenario){
 fee=product.feeSnapshot?.[marketOf(scenario)]??fee;
 if(scenario==='shopee'&&fee.policyId===SHOPEE_POLICY_ID){const result=calculateShopee(product,fee);if(result)return result.feesApplied;}
 const quote=marketOf(scenario)==='ml'&&officialQuote(product,scenario);
 if(quote)return {commission:quote.commission,fixed:quote.fixed,tax:fee.tax};
 return {commission:(scenario==='mlPremium'?(fee.premiumCommission??fee.commission):fee.commission)+(scenario==='shopee'&&fee.officialEventEnabled?(fee.officialEventRate??2.5):0),fixed:fee.fixed+(scenario==='shopee'&&fee.easyReturnEnabled?(fee.easyReturnFee??.49):0),tax:fee.tax};
}
function validOptions(data){return ['shopeeEasyReturn','shopeeOfficialEvent'].every(k=>data[k]===undefined||typeof data[k]==='boolean');}
function optionalOptions(data){return Object.fromEntries(['shopeeEasyReturn','shopeeOfficialEvent'].filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));}
function validFeeOptions(fees){return (fees.shopee.policyId===undefined||fees.shopee.policyId===SHOPEE_POLICY_ID)&&(fees.ml.premiumCommission===undefined||(Number.isFinite(fees.ml.premiumCommission)&&fees.ml.premiumCommission>=0&&fees.ml.premiumCommission+fees.ml.tax<100))&&['easyReturnFee','officialEventRate'].every(k=>fees.shopee[k]===undefined||(Number.isFinite(fees.shopee[k])&&fees.shopee[k]>=0))&&['easyReturnEnabled','officialEventEnabled'].every(k=>fees.shopee[k]===undefined||typeof fees.shopee[k]==='boolean');}
function validFees(fees){return fees&&Object.keys(MARKETS).every(k=>fees[k]&&['commission','fixed','tax'].every(f=>Number.isFinite(fees[k][f])&&fees[k][f]>=0)&&fees[k].commission+fees[k].tax<100)&&validFeeOptions(fees);}
function copyFees(fees){
 return {ml:{commission:fees.ml.commission,premiumCommission:fees.ml.premiumCommission??fees.ml.commission,fixed:fees.ml.fixed,tax:fees.ml.tax},shopee:{commission:fees.shopee.commission,fixed:fees.shopee.fixed,tax:fees.shopee.tax,easyReturnFee:fees.shopee.easyReturnFee??.49,officialEventRate:fees.shopee.officialEventRate??2.5,easyReturnEnabled:Boolean(fees.shopee.easyReturnEnabled),officialEventEnabled:Boolean(fees.shopee.officialEventEnabled),...(fees.shopee.policyId?{policyId:fees.shopee.policyId}:{})}};
}
function withShopeePolicy(fees){const result=copyFees(fees);Object.assign(result.shopee,{policyId:SHOPEE_POLICY_ID,easyReturnFee:SHOPEE_POLICY.easyReturnFee,officialEventRate:SHOPEE_POLICY.eventRate});return result;}
function mlSafeUrl(value,domain){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname===domain||u.hostname.endsWith('.'+domain))?u.href:null;}catch{return null;}}
function validShippingQuote(q){return q&&['mercadolivre-shipping-options','mercadolivre-shipping-table'].includes(q.source)&&(q.source!=='mercadolivre-shipping-table'||Number.isFinite(Date.parse(q.tableCheckedAt))&&typeof q.dimensionsKnown==='boolean')&&/^MLB\d{5,15}$/.test(q.itemId)&&Number.isFinite(q.amount)&&q.amount>=0&&q.amount<=1e9&&q.currency==='BRL'&&Number.isFinite(Date.parse(q.fetchedAt))&&(q.price===null||Number.isFinite(q.price)&&q.price>0)&&['gold_special','gold_pro'].includes(q.listingType)&&q.shippingMode==='me2'&&/^[a-z0-9_]{2,40}$/.test(q.logisticType??'')&&typeof q.freeShipping==='boolean'&&(q.billableWeight===null||Number.isFinite(q.billableWeight)&&q.billableWeight>0);}
function copyShippingQuote(q){return Object.fromEntries(['source','itemId','amount','currency','fetchedAt','price','listingType','shippingMode','logisticType','freeShipping','billableWeight',...(q.source==='mercadolivre-shipping-table'?['tableCheckedAt','dimensionsKnown']:[])].map(k=>[k,q[k]]));}
function validCommissionReference(r){return r&&/^MLB\d{5,15}$/.test(r.itemId)&&/^MLB\d+$/.test(r.categoryId)&&Number.isFinite(r.price)&&r.price>0&&Number.isFinite(Date.parse(r.fetchedAt))&&['ml','mlPremium'].every(k=>['commission','fixed','feeAmount'].every(f=>Number.isFinite(r.quotes?.[k]?.[f])&&r.quotes[k][f]>=0)&&r.quotes[k].commission<100);}
function inactiveMlListing(link){return Boolean(link&&(link.availability==='unavailable'||['paused','closed','under_review','inactive'].includes(link.status)));}
function inactiveMlListingLabel(link){return inactiveMlListing(link)?({paused:'Anúncio pausado',closed:'Anúncio encerrado',under_review:'Anúncio em revisão',inactive:'Anúncio desativado'}[link.status]??'Anúncio indisponível'):'';}
function validCurrentLinkFields(link){return (link.currentFees===undefined||validCommissionReference(link.currentFees)&&link.currentFees.itemId===link.itemId&&link.currentFees.price===link.price)&&(link.availability===undefined||link.availability==='unavailable')&&(link.status===undefined||['active','paused','closed','under_review','inactive'].includes(link.status))&&(link.currentShipping===undefined||validShippingQuote(link.currentShipping)&&link.currentShipping.itemId===link.itemId&&link.currentShipping.price===link.price&&link.currentShipping.listingType===link.listingType);}
function copyCommissionReference(r){return {itemId:r.itemId,categoryId:r.categoryId,price:r.price,fetchedAt:r.fetchedAt,quotes:Object.fromEntries(['ml','mlPremium'].map(k=>[k,Object.fromEntries(['commission','fixed','feeAmount'].map(f=>[f,r.quotes[k][f]]))]))};}
function validMlSkus(skus){return skus===undefined||Array.isArray(skus)&&skus.length<=100&&skus.every(s=>typeof s==='string'&&s.trim().length>0&&s.length<=120&&!/[\u0000-\u001f]/.test(s));}
function validMlLink(link){return link&&validMlSkus(link.skus)&&/^MLB\d{5,15}$/.test(link.itemId)&&Number.isSafeInteger(link.sellerId)&&link.sellerId>0&&typeof link.title==='string'&&link.title.length<=256&&typeof link.listingType==='string'&&link.listingType.length<=50&&Boolean(mlSafeUrl(link.permalink,'mercadolivre.com.br'))&&(link.categoryId===null||/^MLB\d+$/.test(link.categoryId))&&(link.catalogProductId===null||/^MLB\d+$/.test(link.catalogProductId))&&(link.categoryName===null||(typeof link.categoryName==='string'&&link.categoryName.length<=80))&&(link.price===null||(Number.isFinite(link.price)&&link.price>=0))&&(link.weight===null||(Number.isFinite(link.weight)&&link.weight>0&&link.weight<=1e6))&&(link.thumbnail===null||Boolean(mlSafeUrl(link.thumbnail,'mlstatic.com')))&&Number.isInteger(link.variationCount)&&link.variationCount>=0&&typeof link.fetchedAt==='string'&&Number.isFinite(Date.parse(link.fetchedAt))&&(link.shippingQuote===undefined||validShippingQuote(link.shippingQuote)&&link.shippingQuote.itemId===link.itemId)&&validCurrentLinkFields(link);}
function copyMlLink(link){return {...(link.availability?{availability:link.availability}:{}),...(link.status?{status:link.status}:{}),...(link.skus?{skus:link.skus.slice()}:{}),...Object.fromEntries(['itemId','sellerId','title','categoryId','categoryName','catalogProductId','listingType','permalink','price','weight','thumbnail','variationCount','fetchedAt'].map(k=>[k,link[k]])),...(link.shippingQuote?{shippingQuote:copyShippingQuote(link.shippingQuote)}:{}),...(link.currentFees?{currentFees:copyCommissionReference(link.currentFees)}:{}),...(link.currentShipping?{currentShipping:copyShippingQuote(link.currentShipping)}:{})};}
function validPendingProducts(rows){
 if(rows===undefined)return true;if(!Array.isArray(rows)||rows.length>5000)return false;
 const ids=new Set(),items=new Set();return rows.every(p=>{const key=p?.item?.sellerId+':'+p?.item?.itemId;if(!p||'cost' in p||typeof p.id!=='string'||!p.id.trim()||p.id.length>200||ids.has(p.id)||items.has(key)||!validMlLink(p.item)||!Number.isFinite(p.margin)||p.margin<0||p.margin>=100||!validFees(p.feeSnapshot)||typeof p.importedAt!=='string'||!Number.isFinite(Date.parse(p.importedAt)))return false;ids.add(p.id);items.add(key);return true;});
}
function copyPendingProduct(p){return {id:p.id,item:copyMlLink(p.item),margin:p.margin,feeSnapshot:copyFees(p.feeSnapshot),importedAt:p.importedAt};}
const ML_QUOTE_FIELDS=['price','profit','margin','shippingApplied','commission','fixed','saleFeeAmount','listingFeeAmount','feeAmount'];
function validKitContext(c){return c&&/^MLB\d+$/.test(c.categoryId??'')&&typeof c.categoryName==='string'&&c.categoryName.length>0&&c.categoryName.length<=80&&/^MLB\d{5,15}$/.test(c.referenceItemId??'')&&(c.dimensions===null||c.dimensions&&['height','width','length'].every(k=>Number.isFinite(c.dimensions[k])&&c.dimensions[k]>0&&c.dimensions[k]<=1000));}
function copyKitContext(c){return {categoryId:c.categoryId,categoryName:c.categoryName,referenceItemId:c.referenceItemId,dimensions:c.dimensions?Object.fromEntries(['height','width','length'].map(k=>[k,c.dimensions[k]])):null};}
function sameKitContext(a,b){return validKitContext(a)&&validKitContext(b)&&a.categoryId===b.categoryId&&a.referenceItemId===b.referenceItemId&&['height','width','length'].every(k=>a.dimensions?.[k]===b.dimensions?.[k]);}
function validOfficialPricing(p){
 return p&&(p.kind===undefined||p.kind==='kit'&&validKitContext(p.context)&&p.itemId===p.context.referenceItemId&&p.categoryId===p.context.categoryId)&&p.source==='mercadolivre-listing-prices'&&/^MLB\d{5,15}$/.test(p.itemId)&&/^MLB\d+$/.test(p.categoryId)&&Number.isFinite(Date.parse(p.fetchedAt))&&['shippingMode','logisticType'].every(k=>typeof p[k]==='string'&&/^[a-z0-9_]{2,40}$/.test(p[k]))&&['cost','extra','margin','tax','mlShipping','weight'].every(k=>Number.isFinite(p.inputs?.[k])&&p.inputs[k]>=0)&&p.inputs.cost>0&&validAds(p.inputs)&&p.inputs.tax<100&&p.inputs.margin<100&&(p.inputs.autoShipping===undefined||p.inputs.autoShipping===true&&validShippingQuote(p.shippingQuote)&&p.shippingQuote.itemId===p.itemId&&p.inputs.mlShipping===p.shippingQuote.amount)&&['ml','mlPremium'].every(k=>['desired','minimum'].every(t=>{const q=p.quotes?.[k]?.[t];return q&&ML_QUOTE_FIELDS.every(f=>Number.isFinite(q[f])&&q[f]>=0)&&q.price>0&&q.commission<100&&Math.abs(q.feeAmount-q.saleFeeAmount-q.listingFeeAmount)<.00001;}));
}
function copyOfficialPricing(p){return {...(p.kind==='kit'?{kind:'kit',context:copyKitContext(p.context)}:{}),source:p.source,fetchedAt:p.fetchedAt,itemId:p.itemId,categoryId:p.categoryId,shippingMode:p.shippingMode,logisticType:p.logisticType,inputs:{...Object.fromEntries(['cost','extra','margin','tax','mlShipping','weight'].map(k=>[k,p.inputs[k]])),...(p.inputs.ads===undefined?{}:{ads:p.inputs.ads}),...(p.inputs.autoShipping?{autoShipping:true}:{})},...(p.inputs.autoShipping?{shippingQuote:copyShippingQuote(p.shippingQuote)}:{}),quotes:Object.fromEntries(['ml','mlPremium'].map(k=>[k,Object.fromEntries(['desired','minimum'].map(t=>[t,Object.fromEntries(ML_QUOTE_FIELDS.map(f=>[f,p.quotes[k][t][f]]))]))]))};}
function officialQuote(product,scenario){
 const p=product.mlPricing;if(!p||!validOfficialPricing(p))return null;
 if(p.kind==='kit'){if(!sameKitContext(p.context,product.mlContext))return null;}
 else if(p.itemId!==product.mercadoLivre?.itemId)return null;
 if(adsRate(p.inputs)!==adsRate(product)||!['cost','extra','weight'].every(k=>p.inputs[k]===product[k])||p.inputs.mlShipping!==(product.mlShipping??0)||p.inputs.tax!==product.feeSnapshot?.ml.tax)return null;
 const type=product.margin===p.inputs.margin?'desired':product.margin===10?'minimum':null;
 return type?p.quotes[scenario==='mlPremium'?'mlPremium':'ml'][type]:null;
}
function productInitialFees(product,fallback){
 const fees=copyFees(product?.feeSnapshot??fallback);
 // Novos cadastros manuais não recebem o antigo adicional fixo ilustrativo.
 if(!product)fees.ml.fixed=0;
 return fees;
}
function readProductFees(form,fallback){
 const present=Boolean(form.elements['product-ml-commission']);if(!present)return copyFees(fallback);
 const fees={};for(const market of Object.keys(MARKETS))fees[market]=Object.fromEntries(feeFields(market).map(([field])=>[field,Number(form.elements['product-'+market+'-'+field]?.value??NaN)]));
 if(!form.elements['product-ml-fixed'])fees.ml.fixed=Number(form.dataset?.mlFixed??fallback.ml.fixed);
 fees.shopee.easyReturnEnabled=Boolean(form.elements['product-shopee-easyReturnEnabled']?.checked);fees.shopee.officialEventEnabled=Boolean(form.elements['product-shopee-officialEventEnabled']?.checked);
 if(form.dataset?.shopeePolicy===SHOPEE_POLICY_ID){fees.shopee.policyId=SHOPEE_POLICY_ID;fees.shopee.easyReturnFee=SHOPEE_POLICY.easyReturnFee;fees.shopee.officialEventRate=SHOPEE_POLICY.eventRate;}
 return validFees(fees)?copyFees(fees):null;
}
function preserveCatalogFees(data){return {...data,kits:(data.kits??[]).map(k=>({...k,feeSnapshot:copyFees(k.feeSnapshot??data.fees)})),products:data.products.map(p=>({...p,mlShipping:p.mlShipping??0,feeSnapshot:copyFees(p.feeSnapshot??data.fees)}))};}
function calculate(product,fee,market){
 if(!validAds(product))return null;
 const ads=adsRate(product,market);
 if(market==='shopee'&&(product.feeSnapshot?.shopee??fee).policyId===SHOPEE_POLICY_ID)return calculateShopee(product,product.feeSnapshot?.shopee??fee);
 if(product.mlPricing&&marketOf(market)==='ml'){
  const quote=officialQuote(product,market);if(!quote)return null;
  const tax=product.feeSnapshot.ml.tax,adsAmount=quote.price*ads/100,profit=quote.price*(1-tax/100)-adsAmount-product.cost-product.extra-quote.shippingApplied-quote.feeAmount;
  if(profit/quote.price*100<product.margin-1e-7)return null;
  return {...quote,profit,margin:profit/quote.price*100,adsRate:ads,adsAmount,feesApplied:effectiveFee(product,fee,market),official:true};
 }
 fee=effectiveFee(product,fee,market);
 const denominator=1-(fee.commission+fee.tax+product.margin+ads)/100;
 if(!Number.isFinite(denominator)||denominator<=0)return null;
 const roundUp=value=>Math.ceil(Number((value*100).toFixed(7)))/100;
 const baseCost=product.cost+product.extra+fee.fixed;
 const basePrice=roundUp(baseCost/denominator);
 // O limite é avaliado no preço sem este frete, já arredondado ao centavo.
 // Assim, um frete alto não ativa a própria cobrança em produtos até R$ 100.
 const automaticShipping=validShippingQuote(product.mercadoLivre?.shippingQuote)&&product.mercadoLivre.shippingQuote.amount===product.mlShipping;
 const shippingApplied=marketOf(market)==='ml'&&(automaticShipping||basePrice>100)?(product.mlShipping??0):0;
 if(!Number.isFinite(shippingApplied)||shippingApplied<0)return null;
 const price=roundUp((baseCost+shippingApplied)/denominator);
 const adsAmount=price*ads/100,profit=price*(1-(fee.commission+fee.tax)/100)-baseCost-shippingApplied-adsAmount;
 if(!Number.isFinite(price)||price<=0||!Number.isFinite(profit))return null;
 return {price,profit,margin:profit/price*100,adsRate:ads,adsAmount,shippingApplied,feesApplied:fee};
}
function minimumPrice(product,fee,market){return calculate({...product,margin:10},fee,market);}
function currentScenario(product){return product?.mercadoLivre?.listingType==='gold_pro'?'mlPremium':product?.mercadoLivre?.listingType==='gold_special'?'ml':null;}
function hasCurrentPrice(product,scenario){return (!globalThis.ConduzMlDataRules||ConduzMlDataRules.fresh(product?.mercadoLivre))&&Boolean(scenario)&&currentScenario(product)===scenario&&Number.isFinite(product?.mercadoLivre?.price)&&product.mercadoLivre.price>0;}
function saleResult(product,fee,scenario){
 if(!validAds(product))return null;
 if(product.mercadoLivre&&marketOf(scenario)==='ml'&&globalThis.ConduzMlDataRules&&!ConduzMlDataRules.fresh(product.mercadoLivre))return null;
 if(!hasCurrentPrice(product,scenario)){const result=calculate(product,fee,scenario);return result?{...result,basis:'suggested'}:null;}
 const link=product.mercadoLivre,price=link.price,f=effectiveFee(product,fee,scenario);
 let shippingApplied,feeAmount,commission=f.commission,fixed=f.fixed;
 if(product.mlPricing){
  const reference=link.currentFees,shipping=link.currentShipping;
  if(!validCommissionReference(reference)||reference.itemId!==link.itemId||reference.price!==price||!validShippingQuote(shipping)||shipping.price!==price||shipping.listingType!==link.listingType)return null;
  const quote=reference.quotes[scenario];commission=quote.commission;fixed=quote.fixed;feeAmount=quote.feeAmount;shippingApplied=shipping.amount;
 }else{
  const shipping=link.currentShipping??link.shippingQuote;
  shippingApplied=validShippingQuote(shipping)&&shipping.price===price&&shipping.listingType===link.listingType?shipping.amount:price>100?(product.mlShipping??0):0;
  feeAmount=price*commission/100+fixed;
 }
 const ads=adsRate(product,scenario),adsAmount=price*ads/100,profit=price*(1-f.tax/100)-product.cost-product.extra-shippingApplied-feeAmount-adsAmount;
 return {price,profit,margin:profit/price*100,adsRate:ads,adsAmount,shippingApplied,commission,fixed,feeAmount,official:Boolean(product.mlPricing),feesApplied:{commission,fixed,tax:f.tax},basis:'current'};
}
function summaryResults(product,fees){
 if(!product)return null;
 const current=currentScenario(product),keys=hasCurrentPrice(product,current)?[current]:Object.keys(SCENARIOS);
 return keys.map(k=>saleResult(product,fees[marketOf(k)],k));
}
const PROFIT_HEALTH={low:{level:'low',className:'health-low',label:'Lucro baixo'},risk:{level:'risk',className:'health-risk',label:'Em risco'},safe:{level:'safe',className:'health-safe',label:'Seguro'},pending:{level:'pending',className:'health-pending',label:'Recalcular'}};
function profitRateHealth(rate){
 if(!Number.isFinite(rate))return PROFIT_HEALTH.pending;
 // Evita rebaixar 10% ou 15% exatos por ruído de ponto flutuante.
 return rate<10-1e-7?PROFIT_HEALTH.low:rate<15-1e-7?PROFIT_HEALTH.risk:PROFIT_HEALTH.safe;
}
function profitRate(result){return result&&Number.isFinite(result.price)&&result.price>0&&Number.isFinite(result.profit)?result.profit/result.price*100:null;}
function profitHealth(result){return profitRateHealth(profitRate(result));}
function pricingAverage(product,fees){
 if(!product)return null;
 const rates=summaryResults(product,fees).map(profitRate);
 return rates.some(rate=>!Number.isFinite(rate))?null:rates.reduce((sum,rate)=>sum+rate,0)/rates.length;
}
function averageProfit(product,fees){
 if(!product)return null;
 const profits=summaryResults(product,fees).map(result=>result?.profit);
 return profits.some(profit=>!Number.isFinite(profit))?null:profits.reduce((sum,profit)=>sum+profit,0)/profits.length;
}
function pricingHealth(product,fees){const average=pricingAverage(product,fees);return {...profitRateHealth(average),average,profit:averageProfit(product,fees),current:hasCurrentPrice(product,currentScenario(product))};}
function healthBadge(health,summary=false){return `<span class="health-badge ${health.className}${summary?' health-product':''}"${summary?' title="Com anúncio vinculado, usa o preço atual registrado e sua modalidade. Sem preço registrado, usa a média simulada dos três canais."':''}>${summary?`<span class="health-average">${health.current?'Lucro no preço atual':'Lucro médio simulado'}: <strong>${Number.isFinite(health.profit)?money(health.profit):'—'}</strong></span><span class="health-average">Lucro sobre venda: ${Number.isFinite(health.average)?number(health.average)+'%':'—'}</span>`:''}<span aria-hidden="true">●</span> ${health.label}</span>`;}

function kitTotals(kit,products){
 if(!kit||!validAds(kit)||!Array.isArray(kit.items)||!kit.items.length||(kit.feeSnapshot!==undefined&&!validFees(kit.feeSnapshot)))return null;
 const byId=new Map(products.map(p=>[p.id,p])),seen=new Set();let cost=0,extra=0,weight=0,units=0;
 for(const item of kit.items){
  if(!item||typeof item.productId!=='string')return null;
  const p=byId.get(item.productId);
  if(!p||seen.has(item.productId)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>9999)return null;
  seen.add(item.productId);cost+=Math.round(p.cost*100)*item.quantity;extra+=Math.round(p.extra*100)*item.quantity;weight+=p.weight*item.quantity;units+=item.quantity;
 }
 if(!Number.isFinite(kit.margin)||kit.margin<0||kit.margin>=100||!Number.isFinite(kit.extra)||kit.extra<0||!Number.isFinite(kit.mlShipping)||kit.mlShipping<0)return null;
 return {cost:cost/100,extra:extra/100+kit.extra,weight:Math.round(weight*1000)/1000,units,margin:kit.margin,...copyAds(kit),mlShipping:kit.mlShipping,...(kit.mlContext?{mlContext:copyKitContext(kit.mlContext)}:{}),...(kit.mlPricing?{mlPricing:kit.mlPricing}:{}),shopeeEasyReturn:Boolean(kit.shopeeEasyReturn),shopeeOfficialEvent:Boolean(kit.shopeeOfficialEvent),...(kit.feeSnapshot===undefined?{}:{feeSnapshot:kit.feeSnapshot})};
}
function validKits(kits,products){
 if(!Array.isArray(kits))return false;const ids=new Set();
 return kits.every(k=>{if(!k||!validOptions(k)||typeof k.id!=='string'||!k.id.trim()||ids.has(k.id)||typeof k.name!=='string'||!k.name.trim()||k.name.length>120||!kitTotals(k,products)||(k.mlContext!==undefined&&!validKitContext(k.mlContext))||(k.mlPricing!==undefined&&(!validOfficialPricing(k.mlPricing)||k.mlPricing.kind!=='kit'||!sameKitContext(k.mlContext,k.mlPricing.context))))return false;ids.add(k.id);return true;});
}
function splitCSV(text,delimiter){
 const records=[];let cells=[],value='',quoted=false,closed=false,line=1,start=1;
 function cell(){cells.push(value);value='';closed=false;}
 function row(){cell();if(cells.some(c=>c.trim()))records.push({cells,line:start});cells=[];start=line+1;}
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else{value+=c;if(c==='\n')line++;}continue;}
  if(c==='"'){if(value.trim()||closed)throw Error(`Linha ${line}: aspas fora do início do campo.`);value='';quoted=true;}
  else if(c===delimiter)cell();
  else if(c==='\r'||c==='\n'){row();if(c==='\r'&&text[i+1]==='\n')i++;line++;}
  else if(closed){if(!/\s/.test(c))throw Error(`Linha ${line}: texto após o fechamento das aspas.`);}
  else value+=c;
 }
 if(quoted)throw Error(`Linha ${start}: campo com aspas não foi fechado.`);
 row();return records;
}
function importNumber(value,precision){
 const s=value.trim();
 // Vírgula ou ponto decimal, sem separador de milhares para evitar ambiguidades.
 if(!new RegExp('^\\d+(?:[.,]\\d{1,'+precision+'})?$').test(s))return NaN;
 return Number(s.replace(',','.'));
}
function readCSVRecords(text){
 if(text.length>2*1024*1024)throw Error('O CSV deve ter no máximo 2 MB.');
 text=text.replace(/^\uFEFF/,'');
 let delimiter,first='',quoted=false;
 const sep=text.match(/^sep=([;,\t])\r?\n/i);
 if(sep){delimiter=sep[1];text=text.slice(sep[0].length);}
 else{
  const headerText=text.replace(/^(?:[ \t]*\r?\n)+/,'');
  for(let i=0;i<headerText.length;i++){const c=headerText[i];if(c==='"'){if(quoted&&headerText[i+1]==='"'){i++;continue;}quoted=!quoted;}if(!quoted&&(c==='\n'||c==='\r'))break;if(!quoted)first+=c;}
  delimiter=[';',',','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
 }
 const records=splitCSV(text,delimiter);
 if(!records.length)throw Error('O arquivo está vazio.');
 return records;
}
function parseImportCSV(text,options){
 const records=readCSVRecords(text);
 const normalize=s=>s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const headers=records.shift().cells.map(normalize);
 const aliases={name:['nome','produto'],cost:['custo','custo (r$)'],weight:['peso','peso (kg)']};
 const columns={};
 for(const [key,names] of Object.entries(aliases)){
  const found=headers.map((h,i)=>names.includes(h)?i:-1).filter(i=>i>=0);
  if(found.length!==1)throw Error(`O cabeçalho deve conter uma única coluna “${names[0]}”.`);
  columns[key]=found[0];
 }
 if(!records.length)throw Error('O CSV tem cabeçalho, mas não tem produtos.');
 if(records.length>5000)throw Error('Importe até 5.000 produtos por arquivo.');
 const category=options.category.trim(),margin=Number(options.margin);
 if(!category||category.length>80)throw Error('Informe uma categoria com até 80 caracteres.');
 if(!Number.isFinite(margin)||margin<0||margin>=100)throw Error('Informe uma margem de 0 a 99,99%.');
 const products=[],errors=[];
 for(const {cells,line} of records){
  if(cells.length!==headers.length){errors.push(`Linha ${line}: número de campos diferente do cabeçalho. Use aspas se o campo contiver o separador.`);continue;}
  const name=cells[columns.name].trim(),cost=importNumber(cells[columns.cost],2),weight=importNumber(cells[columns.weight],3);
  const problems=[];
  if(!name||name.length>120)problems.push('nome vazio ou com mais de 120 caracteres');
  if(!Number.isFinite(cost)||cost<.01||cost>1e9)problems.push('custo inválido (mínimo 0,01; até 2 casas decimais)');
  if(!Number.isFinite(weight)||weight<0||weight>1e6)problems.push('peso inválido (em kg; até 3 casas decimais)');
  if(problems.length){errors.push(`Linha ${line}: ${problems.join('; ')}.`);continue;}
  products.push({name,cost,weight,category,margin,extra:0,mlShipping:0});
 }
 return {products,errors,total:records.length};
}
const money=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const number=(v,d=2)=>v.toLocaleString('pt-BR',{maximumFractionDigits:d});
const escapeHTML=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function feeFields(market){return market==='ml'?[['commission','Comissão Clássica (%)'],['premiumCommission','Comissão Premium (%)'],['fixed','Taxa fixa (R$)'],['tax','Imposto (%)']]:[['commission','Comissão base (%)'],['fixed','Taxa fixa base (R$)'],['tax','Imposto (%)'],['easyReturnFee','Devolução Fácil (R$/pedido)'],['officialEventRate','Eventos oficiais (+ p.p.)']];}
function feeValue(fee,field){return fee[field]??({premiumCommission:fee.commission,easyReturnFee:.49,officialEventRate:2.5}[field]);}
function feeDetailsHTML(product,fee,scenario,result){
 if(result?.basis==='current'&&result.official)return `<div class="fee-info">Tarifa oficial no preço atual: ${money(result.feeAmount)}<br>Comissão: ${number(result.commission)}% · parcela fixa: ${money(result.fixed)} (já incluída)<br>Imposto: ${number(result.feesApplied.tax)}%<br>Consultada em ${escapeHTML(new Date(product.mercadoLivre.currentFees.fetchedAt).toLocaleString('pt-BR'))}</div>`;
 fee=product.feeSnapshot?.[marketOf(scenario)]??fee;
 if(scenario==='shopee'&&fee.policyId===SHOPEE_POLICY_ID){const quote=result??calculateShopee(product,fee);return `<div class="fee-info">Política CNPJ conferida em 13/11/2026 · valores pela faixa de preço${quote?`<br>Comissão base: ${number(quote.baseCommission)}% · taxa fixa por item: ${money(quote.fixedBase)}`:''}<br>Devolução Fácil: ${fee.easyReturnEnabled?'Sim (R$ 0,49 por pedido)':'Não'}<br>Campanhas de Destaque: ${fee.officialEventEnabled?'Sim (+5 p.p.)':'Não'}<br>Imposto cadastrado: ${number(fee.tax)}%<br>Simulação de 1 item ou 1 kit por pedido.</div>`;}
 const f=effectiveFee(product,fee,scenario);
 const quote=marketOf(scenario)==='ml'&&officialQuote(product,scenario);
 if(quote)return `<div class="fee-info">Tarifa oficial total: ${money(quote.feeAmount)}<br>Comissão: ${number(quote.commission)}% · parcela fixa: ${money(quote.fixed)} (já incluída)<br>Imposto: ${number(f.tax)}%<br>Consultada em ${escapeHTML(new Date(product.mlPricing.fetchedAt).toLocaleString('pt-BR'))}<br>${escapeHTML(product.mlPricing.shippingMode)} · ${escapeHTML(product.mlPricing.logisticType)}</div>`;
 return `<div class="fee-info">Comissão: ${number(f.commission)}% · taxa fixa: ${money(f.fixed)} · imposto: ${number(f.tax)}%${scenario==='shopee'?`<br>Devolução Fácil: ${fee.easyReturnEnabled?'Sim (+'+money(feeValue(fee,'easyReturnFee'))+')':'Não'}<br>Evento oficial: ${fee.officialEventEnabled?'Sim (+'+number(feeValue(fee,'officialEventRate'))+' p.p.)':'Não'}`:''}</div>`;
}
function highestProfitScenario(product,fees){
 if(hasCurrentPrice(product,currentScenario(product)))return null;
 const results=Object.keys(SCENARIOS).map(key=>({key,result:saleResult(product,fees[marketOf(key)],key)}));
 if(results.some(({result})=>!result))return null;
 const ranked=results.sort((a,b)=>Math.round(b.result.profit*100)-Math.round(a.result.profit*100));
 return Math.round(ranked[0].result.profit*100)>Math.round(ranked[1].result.profit*100)?ranked[0].key:null;
}
function saleBreakdown(product,fee,scenario,result){
 const f=effectiveFee(product,fee,scenario),official=Boolean(result.official),tax=result.price*f.tax/100;
 const commission=official?result.feeAmount:result.shopeePolicy?result.commissionAmount:result.price*f.commission/100;
 return {cost:product.cost,extra:product.extra,tax,commission,fixed:official?0:result.shopeePolicy?result.fixedBase:f.fixed,returns:result.shopeePolicy?result.easyReturnApplied:0,shipping:result.shippingApplied,ads:result.price*adsRate(product,scenario)/100,adsRate:adsRate(product,scenario),commissionLabel:official?`Tarifa oficial (${number(result.commission)}%)`:`Comissão (${number(f.commission)}%)`,taxRate:f.tax};
}
function equivalentRoas(value){
 const percent=typeof value==='string'&&value.trim()===''?NaN:Number(value);
 const roas=Number.isFinite(percent)&&percent>0&&percent<100?100/percent:null;
 return roas!==null&&Number.isFinite(roas)?roas:null;
}
function cardAdsHTML(product,scenario){
 const rate=adsRate(product,scenario),roas=equivalentRoas(rate);
 const actual=product.mlAds;
 if(actual&&scenario===currentScenario(product)&&validProductAds(product)){
  const date=value=>value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4);
  const note=actual.status==='no-ad'?'Sem anúncio publicitário localizado; Ads cadastrado preservado.':actual.status==='no-revenue'?'Sem receita atribuída: ACOS indisponível; Ads cadastrado preservado.':actual.status==='high-acos'?'ACOS igual ou superior a 100%: Ads cadastrado preservado; revise a precificação.':rate!==actual.appliedRate?'Ads foi editado após a consulta; os resultados reais abaixo continuam sendo do período informado.':'';
  return '<div class="sale-advertising" aria-label="Publicidade Mercado Livre"><span>Ads <strong>'+number(rate)+'%</strong></span><span title="Receita atribuída dividida pelo investimento do período. ROAS não é lucro.">ROAS real <strong>'+(actual.roas===null?'—':number(actual.roas,1)+'x')+'</strong></span></div><div class="sale-ads-real"><span>Investido <strong>'+(actual.status==='no-ad'?'—':money(actual.cost))+'</strong></span><small>'+date(actual.dateFrom)+' a '+date(actual.dateTo)+'</small><details><summary>Dados de Product Ads</summary><p>Receita atribuída: '+(actual.status==='no-ad'?'—':money(actual.revenue))+' · ACOS: '+(actual.acos===null?'—':number(actual.acos)+'%')+' · '+actual.clicks+' clique(s).</p><p>Consultado em '+escapeHTML(new Date(actual.fetchedAt).toLocaleString('pt-BR'))+'. Receita inclui vendas diretas e indiretas; a atribuição pode ser atualizada pelo Mercado Livre. O total investido não é descontado novamente do lucro por venda.</p></details>'+(note?'<p class="ads-warning">'+note+'</p>':'')+'</div>';
 }
 return '<div class="sale-advertising" aria-label="Publicidade '+SCENARIOS[scenario]+'"><span>Ads <strong>'+number(rate)+'%</strong></span><span title="ROAS equivalente estimado: 100 dividido por Ads (%). Não é o desempenho real da campanha.">ROAS <strong>'+(roas===null?'—':number(roas,1)+'x')+'</strong></span></div>';
}
const ADS_DETAIL_FIELDS=['directRevenue','indirectRevenue','directUnits','indirectUnits','directSales','indirectSales'];
const ITEM_SALES_FIELDS=['revenue','paidRevenue','cancelledRevenue','refundedRevenue','discountRevenue','cashbackRevenue','orders','units','cancelledOrders','refundedOrders','refundReview','discountReview','financialReview','logisticsReview','notDeliveredPaidOrders','notDeliveredPaidRevenue'];
function validItemSales(s,a,partial=false){
 if(!s||s.itemId!==a.itemId||s.sellerId!==a.sellerId||s.currency!=='BRL'||s.dateFrom!==a.dateFrom||s.dateTo!==a.dateTo)return false;
 const valid=fields=>fields.every(k=>Number.isFinite(s[k])&&s[k]>=0&&(k.endsWith('Revenue')||k==='revenue'?Number.isSafeInteger(Math.round(s[k]*100))&&Math.abs(s[k]*100-Math.round(s[k]*100))<.00001:Number.isSafeInteger(s[k])));
 if(s.source==='mercado-livre-orders-v1')return s.basis==='paid-item-sales-created'&&valid(['revenue','cancelledRevenue','orders','units','cancelledOrders','refundReview'])&&['ready','refund-review'].includes(s.status)&&(s.status==='ready'?s.refundReview===0:s.refundReview>0);
 return s.source==='mercado-livre-orders-v2'&&s.basis==='paid-item-sales-net-of-confirmed-refunds'&&valid(ITEM_SALES_FIELDS)&&typeof s.complete==='boolean'&&(partial||s.complete)&&['ready','review'].includes(s.status)&&(s.status==='ready'?s.refundReview+s.discountReview+s.financialReview===0:s.refundReview+s.discountReview+s.financialReview>0)&&Math.abs(s.paidRevenue-s.refundedRevenue-s.revenue)<.00001&&s.notDeliveredPaidRevenue<=s.revenue+.00001&&s.notDeliveredPaidOrders<=s.orders&&s.refundedOrders<=s.orders;
}
function readyItemSales(a){return a?.sales?.source==='mercado-livre-orders-v2'&&a.sales.status==='ready'&&validItemSales(a.sales,a);}
function combineItemSales(parts){
 if(!parts.length||!parts.every(s=>s.source==='mercado-livre-orders-v2'&&validItemSales(s,s,true)&&s.itemId===parts[0].itemId&&s.sellerId===parts[0].sellerId))return undefined;
 const s={...parts[0],dateTo:parts.at(-1).dateTo,complete:true,...Object.fromEntries(ITEM_SALES_FIELDS.map(k=>[k,parts.reduce((sum,p)=>sum+(k==='revenue'||k.endsWith('Revenue')?Math.round(p[k]*100):p[k]),0)/(k==='revenue'||k.endsWith('Revenue')?100:1)]))};s.status=s.refundReview+s.discountReview+s.financialReview?'review':'ready';return s;
}
function copyItemSales(s){return Object.fromEntries(['source','basis','itemId','sellerId','currency','dateFrom','dateTo',...(s.source==='mercado-livre-orders-v2'?[...ITEM_SALES_FIELDS,'complete']:['revenue','orders','units','cancelledRevenue','cancelledOrders','refundReview']),'status'].map(k=>[k,s[k]]));}
function validAdsBreakdown(a){
 if(a.sales!==undefined&&!validItemSales(a.sales,a))return false;
 if(a.salesIssue!==undefined&&!['permission','limit','failed','not-queried'].includes(a.salesIssue))return false;
 if(a.periodsComplete!==undefined&&typeof a.periodsComplete!=='boolean')return false;
 if(a.organicRevenue!==undefined||a.organicUnits!==undefined){if(!(a.organicRevenue===null&&a.organicUnits===null)&&!(Number.isFinite(a.organicRevenue)&&a.organicRevenue>=0&&Number.isSafeInteger(a.organicUnits)&&a.organicUnits>=0))return false;}
 if(a.skus!==undefined&&(!Array.isArray(a.skus)||a.skus.length>100||!a.skus.every(s=>typeof s==='string'&&s.length>0&&s.length<=120&&!/[\u0000-\u001f]/.test(s))))return false;
 if(a.metricsVersion===undefined)return true; // Backups v15 continuam legíveis; a gestão solicita nova consulta.
 if(a.metricsVersion!==2||typeof a.breakdownComplete!=='boolean')return false;
 if(!a.breakdownComplete)return ADS_DETAIL_FIELDS.every(k=>a[k]===null);
 return ADS_DETAIL_FIELDS.every(k=>Number.isFinite(a[k])&&a[k]>=0&&(k.endsWith('Revenue')||Number.isSafeInteger(a[k])))&&Math.abs(a.directRevenue+a.indirectRevenue-a.revenue)<=.02;
}
function adsCurrentPeriod(now=Date.now()){
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const end=new Date(day+'T12:00:00Z');end.setUTCDate(end.getUTCDate()-1);const start=new Date(end);start.setUTCDate(start.getUTCDate()-29);
 return {dateFrom:start.toISOString().slice(0,10),dateTo:end.toISOString().slice(0,10)};
}
function validAdsDates(a,min=30,max=30){const days=(Date.parse(a.dateTo)-Date.parse(a.dateFrom))/86400000+1;return ['dateFrom','dateTo'].every(k=>typeof a[k]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(a[k])&&Number.isFinite(Date.parse(a[k]))&&new Date(a[k]).toISOString().slice(0,10)===a[k])&&Number.isInteger(days)&&days>=min&&days<=max;}
function validAdsAccount(a){return a&&a.source==='mercado-livre-product-ads-account-v2'&&(a.aggregation===undefined||a.aggregation==='all-campaign-pages')&&a.metricsVersion===2&&a.currency==='BRL'&&Number.isSafeInteger(a.sellerId)&&a.sellerId>0&&Number.isSafeInteger(a.advertiserId)&&a.advertiserId>0&&typeof a.advertiserName==='string'&&a.advertiserName.length<=120&&Number.isSafeInteger(a.campaignCount)&&a.campaignCount>=0&&validAdsDates(a)&&typeof a.fetchedAt==='string'&&Number.isFinite(Date.parse(a.fetchedAt))&&['cost','revenue','clicks'].every(k=>Number.isFinite(a[k])&&a[k]>=0)&&Number.isSafeInteger(a.clicks)&&validAdsBreakdown(a);}
function copyAdsAccount(a){return Object.fromEntries(['source',...(a.aggregation?['aggregation']:[]),'metricsVersion','sellerId','advertiserId','advertiserName','currency','dateFrom','dateTo','fetchedAt','campaignCount','cost','revenue','clicks','breakdownComplete',...ADS_DETAIL_FIELDS,...(a.organicRevenue!==undefined?['organicRevenue','organicUnits']:[])].map(k=>[k,a[k]]));}
const ADS_RECONCILE_FIELDS=['revenue','goods','fees','tax','shipping','other'];
function adsEvidenceKey(a){return JSON.stringify(['sellerId','itemId','dateFrom','dateTo','cost','revenue',...ADS_DETAIL_FIELDS].map(k=>a[k]??null));}
function validAdsReconciliation(r){return r&&r.source==='manual-reconciliation'&&/^MLB\d{5,15}$/.test(r.itemId)&&Number.isSafeInteger(r.sellerId)&&r.sellerId>0&&validAdsDates(r,1,90)&&['direct','attributed'].includes(r.scope)&&typeof r.basis==='string'&&r.basis.length<=2000&&typeof r.notes==='string'&&r.notes.trim().length>=3&&r.notes.length<=600&&typeof r.savedAt==='string'&&Number.isFinite(Date.parse(r.savedAt))&&ADS_RECONCILE_FIELDS.every(k=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<=1e12&&Math.abs(r[k]*100-Math.round(r[k]*100))<.001);}
function copyAdsReconciliation(r){return Object.fromEntries(['source','itemId','sellerId','dateFrom','dateTo','scope','basis','notes','savedAt',...ADS_RECONCILE_FIELDS].map(k=>[k,r[k]]));}
const adsReportKey=r=>[r.sellerId,r.baseDate,r.bucketDays].join(':');
const adsAccountKey=r=>[r.sellerId,r.advertiserId,r.dateFrom,r.dateTo].join(':');
const adsReconciliationKey=r=>[r.sellerId,r.itemId,r.dateFrom,r.dateTo].join(':');
function mergeAdsReportList(reports){
 const result=new Map();
 for(const report of reports){
  const key=adsReportKey(report),old=result.get(key);
  if(!old){result.set(key,copyAdsHistory(report));continue;}
  const latest=Date.parse(report.fetchedAt)>=Date.parse(old.fetchedAt)?report:old,items=new Map(old.items.map(row=>[row.itemId,row]));
  for(const row of report.items){const previous=items.get(row.itemId);if(!previous||Date.parse(row.total.fetchedAt)>=Date.parse(previous.total.fetchedAt))items.set(row.itemId,row);}
  result.set(key,copyAdsHistory({...latest,items:[...items.values()]}));
 }
 return [...result.values()];
}
function mergeAdsAccountList(accounts){
 const result=new Map();
 for(const a of accounts){const key=adsAccountKey(a),old=result.get(key);if(!old||Date.parse(a.fetchedAt)>=Date.parse(old.fetchedAt))result.set(key,copyAdsAccount(a));}
 return [...result.values()];
}
function collectAdsArchives(data){
 const reports=mergeAdsReportList([...(data.adsReports??[]),...(data.adsHistory?[data.adsHistory]:[])]),accounts=mergeAdsAccountList([...(data.adsAccounts??[]),...(data.adsAccount?[data.adsAccount]:[])]);
 return {...(reports.length||data.adsReports!==undefined?{adsReports:reports}:{}),...(accounts.length||data.adsAccounts!==undefined?{adsAccounts:accounts}:{})};
}
function validAdsManagement(s){
 if(s.adsAccount!==undefined&&!validAdsAccount(s.adsAccount))return false;if(s.adsHistory!==undefined&&!validAdsHistory(s.adsHistory))return false;
 for(const [field,validate,key] of [['adsReports',validAdsHistory,adsReportKey],['adsAccounts',validAdsAccount,adsAccountKey]]){
  const values=s[field];if(values!==undefined&&(!Array.isArray(values)||!values.every(validate)||new Set(values.map(key)).size!==values.length))return false;
 }
 if(s.adsReconciliations===undefined)return true;
 if(!Array.isArray(s.adsReconciliations)||s.adsReconciliations.length>5000||!s.adsReconciliations.every(validAdsReconciliation))return false;
 const keys=s.adsReconciliations.map(r=>[r.sellerId,r.itemId,r.dateFrom,r.dateTo].join(':'));return new Set(keys).size===keys.length;
}
function adsMeasured(p,period){return Boolean(p?.mlAds&&validProductAds(p)&&p.mlAds.status!=='no-ad'&&p.mlAds.periodsComplete!==false&&(!period||p.mlAds.dateFrom===period.dateFrom&&p.mlAds.dateTo===period.dateTo));}
function adsHistoryReady(a){return Boolean(a?.metricsVersion===2&&a.breakdownComplete&&a.cost>0&&a.clicks>0&&a.revenue>0);}
function adsReconciled(p,reconciliations=[]){
 const a=p.mlAds;if(!adsMeasured(p))return null;
 const r=reconciliations.find(r=>r.sellerId===a.sellerId&&r.itemId===a.itemId&&r.dateFrom===a.dateFrom&&r.dateTo===a.dateTo);
 if(!r||!validAdsReconciliation(r)||r.basis!==adsEvidenceKey(a))return null;
 const expenses=['goods','fees','tax','shipping','other'].reduce((sum,k)=>sum+r[k],0),profit=r.revenue-expenses-a.cost;
 return {profit,revenue:r.revenue,expenses,ads:a.cost,margin:r.revenue>0?profit/r.revenue*100:null,record:r};
}
function estimateProductAds(p,fees){
 const a=p.mlAds;if(!adsMeasured(p)||a.metricsVersion!==2||!a.breakdownComplete)return null;
 if(a.cost>0&&a.directRevenue===0&&a.directUnits===0)return {profit:-a.cost,costs:0,contribution:0,revenue:0,ads:a.cost,criterion:'Gasto do anúncio sem receita direta atribuída.'};
 if(!adsHistoryReady(a)||a.directUnits<=0||a.directRevenue<=0)return null;
 const scenario=currentScenario(p)??'ml',result=saleResult(p,fees.ml,scenario);if(!result)return null;
 const d=saleBreakdown(p,fees.ml,scenario,result),rate=(d.tax+d.commission+d.fixed)/result.price;
 const costs=a.directUnits*(p.cost+p.extra+d.shipping)+a.directRevenue*rate,contribution=a.directRevenue-costs;
 return {profit:contribution-a.cost,costs,contribution,revenue:a.directRevenue,ads:a.cost,criterion:'Estimativa das vendas diretas com custos, imposto e tarifa/frete de referência atuais; todo o gasto do anúncio é alocado às diretas. Indiretas não recebem o custo deste produto.'};
}
function adsBlueStrength(profit){return !Number.isFinite(profit)||profit<=0?.025:.07+.40*(profit/(profit+500));}
function adsManagementData(data,sellerId=null,now=Date.now()){
 const period=adsCurrentPeriod(now),seen=new Set(),products=[];
 for(const p of data.products){const key=p.mercadoLivre?[p.mercadoLivre.sellerId,p.mercadoLivre.itemId].join(':'):'local:'+p.id;if(seen.has(key))continue;seen.add(key);products.push(p);}
 const sameAccount=p=>sellerId===null||p.mercadoLivre?.sellerId===sellerId;
 const measured=products.filter(p=>sameAccount(p)&&adsMeasured(p,period));
 const sum=key=>measured.reduce((total,p)=>total+p.mlAds[key],0),detailed=measured.every(p=>p.mlAds.metricsVersion===2&&p.mlAds.breakdownComplete);
 const totals={cost:sum('cost'),revenue:sum('revenue'),clicks:sum('clicks'),...Object.fromEntries(ADS_DETAIL_FIELDS.map(k=>[k,detailed?sum(k):null]))};
 const cost=totals.cost,revenue=totals.revenue,clicks=totals.clicks;
 const estimates=measured.map(p=>estimateProductAds(p,data.fees)).filter(Boolean),actual=measured.map(p=>adsReconciled(p,data.adsReconciliations??[])).filter(Boolean);
 const account=validAdsAccount(data.adsAccount)&&data.adsAccount.aggregation==='all-campaign-pages'&&data.adsAccount.dateFrom===period.dateFrom&&data.adsAccount.dateTo===period.dateTo&&(sellerId===null||data.adsAccount.sellerId===sellerId)?data.adsAccount:null;
 return {period,products,measured,totals,account,days:30,cpc:clicks>0?cost/clicks:null,acos:revenue>0?cost/revenue*100:null,roas:cost>0?revenue/cost:null,estimate:estimates.length?estimates.reduce((s,r)=>s+r.profit,0):null,estimatedCount:estimates.length,actual:actual.length?actual.reduce((s,r)=>s+r.profit,0):null,actualCount:actual.length};
}
function adsProjection(metrics,dailyBudget,days){
 if(!Number.isFinite(dailyBudget)||dailyBudget<0||dailyBudget>1e9||!Number.isInteger(days)||days<1||days>365)return null;
 const spend=dailyBudget*days;
 if(!adsHistoryReady(metrics))return {spend,revenue:null,clicks:null,directUnits:null,indirectUnits:null,cpc:null,roas:null};
 const ratio=spend/metrics.cost;return {spend,revenue:metrics.revenue*ratio,clicks:metrics.clicks*ratio,directUnits:metrics.directUnits*ratio,indirectUnits:metrics.indirectUnits*ratio,cpc:metrics.cost/metrics.clicks,roas:metrics.revenue/metrics.cost};
}
function adsHistoryRanges(baseDate,bucketDays){
 if(typeof baseDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(baseDate)||!Number.isFinite(Date.parse(baseDate))||new Date(baseDate).toISOString().slice(0,10)!==baseDate||![7,14,30].includes(bucketDays))return null;
 const count=bucketDays===30?3:4,end=Date.parse(baseDate),start=end-(count*bucketDays-1)*86400000;
 return Array.from({length:count},(_,i)=>({dateFrom:new Date(start+i*bucketDays*86400000).toISOString().slice(0,10),dateTo:new Date(start+((i+1)*bucketDays-1)*86400000).toISOString().slice(0,10)}));
}
function validAdsHistory(h){
 if(!h||h.source!=='mercado-livre-product-ads-history-v2'||h.currency!=='BRL'||!Number.isSafeInteger(h.sellerId)||h.sellerId<=0||typeof h.fetchedAt!=='string'||!Number.isFinite(Date.parse(h.fetchedAt))||!Array.isArray(h.items)||h.items.length>10000)return false;
 const ranges=adsHistoryRanges(h.baseDate,h.bucketDays);if(!ranges||JSON.stringify(h.ranges)!==JSON.stringify(ranges)||h.dateFrom!==ranges[0].dateFrom||h.dateTo!==ranges.at(-1).dateTo)return false;
 const seen=new Set();return h.items.every(row=>{
  if(!row||!/^MLB\d{5,15}$/.test(row.itemId)||seen.has(row.itemId)||!Array.isArray(row.periods)||row.periods.length!==ranges.length)return false;seen.add(row.itemId);
  const valid=a=>a&&validProductAds({mercadoLivre:{itemId:row.itemId,sellerId:h.sellerId},mlAds:a});
  if(!valid(row.total)||row.total.dateFrom!==h.dateFrom||row.total.dateTo!==h.dateTo)return false;
  if(!row.periods.every((a,i)=>valid(a)&&a.dateFrom===ranges[i].dateFrom&&a.dateTo===ranges[i].dateTo))return false;
  const measured=row.periods.filter(a=>a.status!=='no-ad');if(measured.length!==row.periods.length&&row.total.periodsComplete!==false)return false;
  if(row.total.sales&&(!row.periods.every(a=>a.sales?.source===row.total.sales.source)||!(row.total.sales.source==='mercado-livre-orders-v2'?ITEM_SALES_FIELDS:['revenue','orders','units','cancelledRevenue','cancelledOrders','refundReview']).every(k=>Math.abs(row.total.sales[k]-row.periods.reduce((s,a)=>s+a.sales[k],0))<.00001)))return false;
  return ['cost','revenue','clicks'].every(k=>Math.abs(row.total[k]-measured.reduce((s,a)=>s+a[k],0))<.00001)&&ADS_DETAIL_FIELDS.every(k=>!row.total.breakdownComplete||Math.abs(row.total[k]-measured.reduce((s,a)=>s+a[k],0))<.00001)&&(row.total.organicRevenue===null||row.total.organicRevenue===undefined||Math.abs(row.total.organicRevenue-measured.reduce((s,a)=>s+(a.organicRevenue??0),0))<.00001);
 });
}
function copyAdsHistory(h){return {...Object.fromEntries(['source','sellerId','currency','baseDate','bucketDays','dateFrom','dateTo','fetchedAt'].map(k=>[k,h[k]])),ranges:h.ranges.map(r=>({dateFrom:r.dateFrom,dateTo:r.dateTo})),items:h.items.map(row=>({itemId:row.itemId,periods:row.periods.map(copyProductAds),total:copyProductAds(row.total)}))};}
const ADS_HISTORY_METRICS={cost:'Investimento em Ads',revenue:'Receita atribuída a Ads',acos:'ACOS',roas:'ROAS',tacos:'TACOS',estimate:'Lucro estimado · diretas',actual:'Lucro apurado · conciliado'};
function adsHistoryMetric(a,p,fees,reconciliations,metric,history=null){
 if(!a||a.status==='no-ad'||a.periodsComplete===false||!validProductAds({...p,mlAds:a}))return null;
 if(['cost','revenue','acos','roas'].includes(metric))return a[metric];
 if(metric==='tacos'){const total=readyItemSales(a)?a.sales.revenue:null;return total>0?a.cost/total*100:null;}
 if(metric==='estimate')return estimateProductAds({...p,mlAds:a},fees)?.profit??null;
 if(metric==='actual'){
  const direct=adsReconciled({...p,mlAds:a},reconciliations);if(direct)return direct.profit;
  if(history&&a===history.total){const parts=history.periods.map(period=>adsReconciled({...p,mlAds:period},reconciliations));if(parts.every(Boolean)&&new Set(parts.map(r=>r.record.scope)).size===1)return parts.reduce((s,r)=>s+r.profit,0);}
  return null;
 }
 return null;
}
function adsHistoryNumber(value,metric){return value===null||!Number.isFinite(value)?'—':['acos','tacos'].includes(metric)?number(value,2)+'%':metric==='roas'?number(value,2)+'x':money(value);}
function adsTrend(current,previous){if(!Number.isFinite(current)||!Number.isFinite(previous)||current===previous)return {arrow:'',label:'Sem variação disponível'};const arrow=current>previous?'↑':'↓';return {arrow,label:previous===0?'Comparação com período anterior de valor zero':number((current-previous)/Math.abs(previous)*100,2)+'% em relação ao período anterior'};}
function adsHistoryCsv(rows,ranges,metric,fees,reconciliations){
 const header=['Produto','MLB','SKU','Início','Fim','Métrica','Valor da métrica','Investimento Ads','Receita Ads','Receita direta','Receita indireta','Receita orgânica','ACOS (%)','ROAS','TACOS (%)','Lucro estimado diretas','Lucro apurado conciliado','Origem','Faturamento confirmado do anúncio','Vendas canceladas excluídas','Base do TACOS','Descontos nos produtos','Reembolsos confirmados','Não entregues pagos mantidos','Reembolsos a conferir','Descontos a conferir','Pagamentos a conferir'];
 const dec=n=>Number.isFinite(n)?n.toFixed(4).replace('.',','):'';
 const lines=[header];for(const {product:p,history:row} of rows)for(const [i,a] of [...row.periods,row.total].entries()){
  const known=a.status!=='no-ad'&&a.periodsComplete!==false;lines.push([p.name,row.itemId,(a.skus??p.mercadoLivre?.skus??[]).join(' | '),a.dateFrom,a.dateTo,ADS_HISTORY_METRICS[metric],dec(adsHistoryMetric(a,p,fees,reconciliations,metric,row)),known?dec(a.cost):'',known?dec(a.revenue):'',known&&a.breakdownComplete?dec(a.directRevenue):'',known&&a.breakdownComplete?dec(a.indirectRevenue):'',known?dec(a.organicRevenue):'',known?dec(a.acos):'',known?dec(a.roas):'',dec(adsHistoryMetric(a,p,fees,reconciliations,'tacos')),dec(adsHistoryMetric(a,p,fees,reconciliations,'estimate')),dec(adsHistoryMetric(a,p,fees,reconciliations,'actual',row)),i===ranges.length?'Total recalculado dos valores do período':'API Mercado Livre',readyItemSales(a)?dec(a.sales.revenue):'',a.sales?dec(a.sales.cancelledRevenue):'',readyItemSales(a)?'Produtos após descontos e reembolsos confirmados; não entregue pago mantido':'Sem dados suficientes de vendas',...['discountRevenue','refundedRevenue','notDeliveredPaidRevenue','refundReview','discountReview','financialReview'].map(k=>a.sales?.source==='mercado-livre-orders-v2'?dec(a.sales[k]):'')]);
 }
 return '\uFEFF'+lines.map(row=>row.map(csvCell).join(';')).join('\r\n');
}

function validProductAds(product){
 const a=product.mlAds;if(a===undefined)return true;
 const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!a||a.source!=='mercado-livre-product-ads-v2'||a.currency!=='BRL'||a.itemId!==product.mercadoLivre?.itemId||a.sellerId!==product.mercadoLivre?.sellerId||!date(a.dateFrom)||!date(a.dateTo)||!validAdsDates(a,1,90)||!Number.isFinite(Date.parse(a.fetchedAt))||!['cost','revenue','clicks'].every(k=>Number.isFinite(a[k])&&a[k]>=0)||!Number.isSafeInteger(a.clicks)||!['no-ad','no-revenue','high-acos','ready'].includes(a.status)||!validAdsBreakdown(a))return false;
 const acos=a.revenue>0?a.cost/a.revenue*100:null,roas=a.cost>0?a.revenue/a.cost:null,rate=acos===null?null:Math.max(0,Math.ceil((acos-1e-10)*100)/100);
 if(acos!==a.acos||roas!==a.roas)return false;
 if(a.status==='ready')return a.appliedRate===rate&&rate>=0&&rate<100;
 if(a.appliedRate!==null)return false;
 if(a.status==='high-acos')return rate!==null&&rate>=100;
 return a.status==='no-ad'?a.cost===0&&a.revenue===0&&a.clicks===0:a.revenue===0;
}
function copyProductAds(a){return Object.fromEntries(['source','sellerId','itemId','currency','dateFrom','dateTo','fetchedAt','cost','revenue','clicks','acos','roas','appliedRate','status',...(a.metricsVersion===2?['metricsVersion','breakdownComplete',...ADS_DETAIL_FIELDS]:[]),...(a.organicRevenue!==undefined?['organicRevenue','organicUnits']:[]),...(a.skus!==undefined?['skus']:[]),...(a.periodsComplete!==undefined?['periodsComplete']:[]),...(a.sales?['sales']:[]),...(a.salesIssue?['salesIssue']:[])].map(k=>[k,k==='skus'?a.skus.slice():k==='sales'?copyItemSales(a.sales):a[k]]));}
function productHeadingHTML(product){
 const status=inactiveMlListingLabel(product.mercadoLivre);
 return '<div class="product-heading"><div class="product-identity"><h3>'+escapeHTML(product.name)+'</h3>'+(status?'<span class="product-status" title="O cadastro, os custos e as margens continuam preservados.">'+escapeHTML(status)+'</span>':'')+'<div class="product-meta"><span>'+escapeHTML(product.category)+'</span>'+(product.mercadoLivre?'<a class="ml-item-link" href="'+escapeHTML(product.mercadoLivre.permalink)+'" target="_blank" rel="noopener noreferrer" title="Preço registrado: '+(hasCurrentPrice(product,currentScenario(product))?money(product.mercadoLivre.price):'aguardando atualização')+'">ML vinculado: '+escapeHTML(product.mercadoLivre.itemId)+' ↗</a>':'')+'</div></div><div class="product-actions"><button class="row-action" data-edit="'+escapeHTML(product.id)+'" aria-label="Editar '+escapeHTML(product.name)+'">Editar</button><button class="row-action" data-delete="'+escapeHTML(product.id)+'" aria-label="Excluir '+escapeHTML(product.name)+'">Excluir</button></div></div>';
}
function saleCardHTML(product,fee,scenario,{result=saleResult(product,fee,scenario),minimum=minimumPrice(product,fee,scenario),best=null,pending=false,compact=true}={}){
 const health=pending?PROFIT_HEALTH.pending:profitHealth(result),name={ml:'ML Clássico',mlPremium:'ML Premium',shopee:'Shopee'}[scenario];
 const row=(label,value,deduct=true)=>`<div><dt>${label}</dt><dd>${deduct&&value>0?'− ':''}${money(value)}</dd></div>`;
 const d=result?saleBreakdown(product,fee,scenario,result):null,suggested=result?.basis==='current'?calculate(product,fee,scenario):null;
 const breakdown=result?`<dl class="sale-breakdown">${row('Custo do produto',d.cost,false)}${d.extra>0?row('Outros custos',d.extra):''}${row('Imposto ('+number(d.taxRate)+'%)',d.tax)}${row(d.commissionLabel,d.commission)}${d.fixed>0?row(result.shopeePolicy?'Taxa fixa por item':'Taxa fixa',d.fixed):''}${d.returns>0?row('Devolução Fácil (por pedido)',d.returns):''}${row('Custo de frete',d.shipping)}${d.ads>0?row('Ads ('+number(d.adsRate)+'%)',d.ads):''}</dl>`:'';
 return `<article class="sale-card ${pending?'health-pending':health.className}" aria-label="Resultado ${SCENARIOS[scenario]}"><div class="sale-top"><h3 class="sale-market sale-market-${scenario}">${name}</h3>${healthBadge(health)}</div>${result&&!pending?`<div class="sale-main"><span class="sale-price-label">${result.basis==='current'?'Preço de venda atual':'Preço sugerido de venda'}</span><strong class="sale-price">${money(result.price)}</strong><div class="sale-profits" title="Lucro após os custos, taxas e a reserva de publicidade (Ads). O percentual é calculado sobre o preço de venda.">Lucros: ${money(result.profit)} · ${number(profitRate(result))}%</div>${cardAdsHTML(product,scenario)}</div>${compact?'':breakdown}<div class="sale-footer">${result.basis==='current'?`<div class="sale-target"><span class="sub">Sugestão para sua meta de ${number(product.margin)}%</span><strong>${suggested?money(suggested.price):'Atualize a cotação'}</strong></div>`:''}<div class="minimum"><span>${product.mlPricing&&marketOf(scenario)==='ml'?'Preço para 10% (API)':'Mínimo para 10%'}</span>${minimum?`<strong>${money(minimum.price)}</strong>${minimum.shippingApplied>0?`<span class="sub">Inclui ${money(minimum.shippingApplied)} de frete</span>`:''}`:'<span class="danger-text">Inviável com estas taxas</span>'}</div>${scenario===best?'<span class="sale-best">↗ Maior lucro</span>':''}<details><summary>${compact?'Ver custos e taxas':'Taxas e serviços aplicados'}</summary>${compact?breakdown:''}${feeDetailsHTML(product,fee,scenario,result)}</details></div>`:`<p class="sale-pending">${product.mercadoLivre&&marketOf(scenario)==='ml'&&globalThis.ConduzMlDataRules&&!ConduzMlDataRules.fresh(product.mercadoLivre)?(product.mercadoLivre.status==='closed'?'Anúncio encerrado. Custos e margens preservados.':product.mercadoLivre.availability==='unavailable'?'Anúncio indisponível no Mercado Livre. Custos e margens preservados.':'Dados do anúncio vencidos. Aguardando atualização; custos e margens preservados.'):pending?'Aguardando cotação oficial.':hasCurrentPrice(product,scenario)?'Consulte as tarifas do preço atual para apurar o lucro.':product.mlPricing&&marketOf(scenario)==='ml'?'Atualize a cotação: os dados mudaram.':'Inviável: confira custos, taxas e margem desejada.'}</p>${cardAdsHTML(product,scenario)}`}</article>`;
}
function validState(s){return s&&validPendingProducts(s.pendingProducts)&&validAdsManagement(s)&&Array.isArray(s.products)&&validFees(s.fees)&&s.products.every(p=>p&&validAds(p)&&validProductAds(p)&&typeof p.id==='string'&&typeof p.name==='string'&&p.name.trim()&&typeof p.category==='string'&&['cost','weight','margin','extra'].every(k=>Number.isFinite(p[k])&&p[k]>=0)&&(p.mlShipping===undefined||(Number.isFinite(p.mlShipping)&&p.mlShipping>=0))&&p.cost>0&&p.margin<100&&validOptions(p)&&(p.mercadoLivre===undefined||validMlLink(p.mercadoLivre))&&(p.mlPricing===undefined||(validOfficialPricing(p.mlPricing)&&p.mlPricing.itemId===p.mercadoLivre?.itemId))&&(p.feeSnapshot===undefined||validFees(p.feeSnapshot)))&&validKits(s.kits??[],s.products);}
function backupData(data){
 if(!validState(data))throw Error('O arquivo contém produtos ou taxas inválidos.');
 const ids=new Set();
 const products=data.products.map(p=>{
  if(!p.id.trim()||ids.has(p.id)||!p.category.trim())throw Error('O arquivo contém identificadores repetidos ou campos obrigatórios vazios.');
  ids.add(p.id);
  return {...Object.fromEntries(['id','name','category','cost','weight','margin','extra','mlShipping'].map(k=>[k,k==='mlShipping'?(p[k]??0):p[k]])),...copyAds(p),...(p.mlAds?{mlAds:copyProductAds(p.mlAds)}:{}),...optionalOptions(p),...(p.mercadoLivre===undefined?{}:{mercadoLivre:copyMlLink(p.mercadoLivre)}),...(p.mlPricing===undefined?{}:{mlPricing:copyOfficialPricing(p.mlPricing)}),...(p.feeSnapshot===undefined?{}:{feeSnapshot:copyFees(p.feeSnapshot)})};
 });
 const fees=Object.fromEntries(Object.keys(MARKETS).map(k=>[k,Object.fromEntries(['commission','fixed','tax',...(k==='ml'?['premiumCommission']:['easyReturnFee','officialEventRate','easyReturnEnabled','officialEventEnabled','policyId'])].filter(f=>data.fees[k][f]!==undefined).map(f=>[f,data.fees[k][f]]))]));
 return {...collectAdsArchives(data),...(data.pendingProducts===undefined?{}:{pendingProducts:data.pendingProducts.map(copyPendingProduct)}),...(data.adsHistory?{adsHistory:copyAdsHistory(data.adsHistory)}:{}),...(data.adsAccount?{adsAccount:copyAdsAccount(data.adsAccount)}:{}),...(data.adsReconciliations?{adsReconciliations:data.adsReconciliations.map(copyAdsReconciliation)}:{}),products,fees,kits:(data.kits??[]).map(k=>({id:k.id,name:k.name,margin:k.margin,extra:k.extra,mlShipping:k.mlShipping,...copyAds(k),...(k.mlContext?{mlContext:copyKitContext(k.mlContext)}:{}),...(k.mlPricing?{mlPricing:copyOfficialPricing(k.mlPricing)}:{}),...optionalOptions(k),...(k.feeSnapshot===undefined?{}:{feeSnapshot:copyFees(k.feeSnapshot)}),items:k.items.map(i=>({productId:i.productId,quantity:i.quantity}))}))};
}
function buildBackup(data){return JSON.stringify({format:'margem-backup',version:19,createdAt:new Date().toISOString(),data:backupData(globalThis.ConduzMlPolicy?.sanitizeLocal(data)??data)},null,2);}
function parseBackup(text){
 if(text.length>20*1024*1024)throw Error('O backup deve ter no máximo 20 MB.');
 let backup;try{backup=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('Não foi possível ler o JSON. Selecione um arquivo gerado por “Baixar backup”.');}
 if(!backup||backup.format!=='margem-backup'||![1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19].includes(backup.version))throw Error('Formato ou versão de backup incompatível. Use um arquivo gerado por este painel.');
 return backupData(backup.data);
}
let state=defaults(),storageProblem='',feesMigrated=false;
try{const account=localStorage.getItem(ACTIVE_CATALOG_ACCOUNT);if(account!==null){KEY=accountCatalogKey(account);activeCatalogAccount=account;}const saved=localStorage.getItem(KEY);if(saved){const parsed=JSON.parse(saved);if(!validState(parsed))throw Error('Dados inválidos');if(activeCatalogAccount&&[...catalogOwners(parsed)].some(id=>id!==activeCatalogAccount))throw Error('Conta inválida');feesMigrated=parsed.products.some(p=>p.feeSnapshot===undefined)||(parsed.kits??[]).some(k=>k.feeSnapshot===undefined);state=preserveCatalogFees(parsed);}}catch{storageProblem='Não foi possível ler os dados salvos. Esta sessão começa vazia; confira seu backup antes de salvar novos dados.';}
let sort={key:'name',direction:1},editing=null,deleting=null,toastTimer;
const $=id=>document.getElementById(id);
function setProductPane(pane){
 if(!['product','listing','ml','shopee'].includes(pane))return;
 $('product-form').dataset.productPane=pane;
 for(const key of ['product','listing','ml','shopee'])$('product-tab-'+key).setAttribute('aria-selected',String(key===pane));
}
for(const pane of ['product','listing','ml','shopee']){
 $('product-tab-'+pane).onclick=()=>setProductPane(pane);
 $('product-tab-'+pane).onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const panes=['product','listing','ml','shopee'],next=panes[(panes.indexOf(pane)+(e.key==='ArrowRight'?1:3))%4];setProductPane(next);$('product-tab-'+next).focus?.();};
}
$('product-form').addEventListener?.('invalid',e=>{if(e.target!==$('product-form').querySelector(':invalid'))return;const pane=e.target.closest('[data-product-pane]')?.dataset.productPane;if(pane)setProductPane(pane);},true);

function setKitPane(pane){if(!['editor','prices'].includes(pane))return;$('kits-view').dataset.kitPane=pane;for(const key of ['editor','prices'])$('kit-tab-'+key).setAttribute('aria-selected',String(key===pane));}
for(const pane of ['editor','prices']){
 $('kit-tab-'+pane).onclick=()=>{setKitPane(pane);$(pane==='editor'?'kit-editor-panel':'kit-preview-panel').scrollIntoView?.({block:'start'});};
 $('kit-tab-'+pane).onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const next=pane==='editor'?'prices':'editor';setKitPane(next);$('kit-tab-'+next).focus?.();};
}

function renderAdsRoas(){
 const form=$('product-form');
 for(const [input,badge] of [[form.elements.adsMl,$('product-ml-roas')],[form.elements.adsShopee,$('product-shopee-roas')],[$('kit-ads-ml'),$('kit-ml-roas')],[$('kit-ads-shopee'),$('kit-shopee-roas')]]){
  const roas=equivalentRoas(input?.value);
  const valid=roas!==null&&Number.isFinite(roas),text=valid?'ROAS '+number(roas,1)+'x':'ROAS —';
  if(badge.textContent!==text)badge.textContent=text;
  badge.classList.toggle('is-empty',!valid);
  badge.title=valid?'ROAS equivalente estimado: 100 ÷ Ads (%). Não representa o resultado real da campanha.':'Informe Ads maior que zero para ver o ROAS equivalente. Com 0% não há uma relação finita de receita por gasto.';
 }
}
function compactStatusTitles(){for(const id of ['ml-product-status','ml-pricing-status','ml-shipping-status','shipping-help','product-shopee-policy-status']){const node=$(id);if(node)node.title=node.textContent;}}

function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4500);}
function persist(){try{state=globalThis.ConduzMlPolicy?.sanitizeLocal(state)??state;state={...state,...collectAdsArchives(state)};localStorage.setItem(KEY,JSON.stringify(state));$('save-status').textContent='● Salvo neste navegador';globalThis.ConduzCatalog?.onLocalChange();return true;}catch{$('save-status').textContent='⚠ Dados só nesta sessão';toast('Não foi possível salvar. Baixe um backup antes de fechar.');globalThis.ConduzCatalog?.onLocalChange();return false;}}
function visibleProducts(){
 const query=$('search').value.trim().toLocaleLowerCase('pt-BR');
 const value=p=>SCENARIOS[sort.key]?(saleResult(p,state.fees[marketOf(sort.key)],sort.key)?.price??Infinity):p[sort.key];
 return state.products.filter(p=>(p.name+' '+p.category+' '+(p.mercadoLivre?.itemId??'')).toLocaleLowerCase('pt-BR').includes(query)).sort((a,b)=>{
  // A prioridade do estado do anúncio permanece mesmo ao inverter a ordenação.
  const inactive=Number(inactiveMlListing(a.mercadoLivre))-Number(inactiveMlListing(b.mercadoLivre));
  if(inactive)return inactive;
  const av=value(a),bv=value(b);
  return sort.direction*(typeof av==='string'?av.localeCompare(bv,'pt-BR'):av===bv?0:av>bv?1:-1);
 });
}
function render(){
 const products=visibleProducts();$('count').textContent=state.products.length;const averages=state.products.map(p=>averageProfit(p,state.fees)).filter(Number.isFinite);$('average').textContent=averages.length?money(averages.reduce((sum,avg)=>sum+avg,0)/averages.length):'—';$('average-help').textContent=state.products.length?'Cálculo completo: '+averages.length+' de '+state.products.length+' produtos':'Estimativa por venda nos três canais';const healthCounts={low:0,risk:0,safe:0,pending:0};for(const p of state.products)healthCounts[pricingHealth(p,state.fees).level]++;$('warning-count').textContent=healthCounts.low;$('risk-count').textContent=healthCounts.risk;$('safe-count').textContent=healthCounts.safe;$('pending-count').textContent=healthCounts.pending?healthCounts.pending+' para recalcular':'';
 $('rows').innerHTML=products.map(p=>`<tr role="row" class="${pricingHealth(p,state.fees).className}${inactiveMlListing(p.mercadoLivre)?' product-inactive':''}"><td role="cell" class="product-name" data-label="Produto">${productHeadingHTML(p)}</td><td role="cell" data-label="Custo">${money(p.cost)}${p.extra>0?`<span class="sub">+ ${money(p.extra)} outros custos</span>`:''}</td><td role="cell" data-label="Peso">${number(p.weight,3)} kg</td><td role="cell" data-label="Margem desejada"><span class="margin">${number(p.margin)}%</span></td>${Object.keys(SCENARIOS).map(k=>{
 const fee=state.fees[marketOf(k)],c=saleResult(p,fee,k),minimum=minimumPrice(p,fee,k);
 return `<td role="cell" class="price-health ${profitHealth(c).className}" data-label="${SCENARIOS[k]}">${saleCardHTML(p,fee,k,{result:c,minimum,best:highestProfitScenario(p,state.fees)})}</td>`;
}).join('')}<td role="cell" class="product-summary" data-label="Resumo">${healthBadge(pricingHealth(p,state.fees),true)}</td></tr>`).join('');
 $('empty').classList.toggle('hidden',products.length>0);$('empty').innerHTML=state.products.length?'Nenhum produto corresponde à busca.':'Seu catálogo começa aqui.<br>Cadastre seu primeiro produto.';$('table-count').textContent=`${products.length} de ${state.products.length} produtos`;$('export').disabled=products.length===0;
 $('mobile-sort').value=sort.key;$('sort-direction').textContent=sort.direction===1?'↑ Crescente':'↓ Decrescente';
 renderKitScreen();renderAdsDashboard();globalThis.ConduzMlImport?.renderPending();
}
function openProduct(p){setProductPane('product');editing=p?.id??null;$('product-form').reset();$('product-error').textContent='';$('dialog-title').textContent=p?'Editar produto':'Novo produto';if(p)for(const key of ['name','category','cost','weight','margin','extra','mlShipping'])$('product-form').elements[key].value=p[key];for(const [name,market] of [['adsMl','ml'],['adsShopee','shopee']]){const input=$('product-form').elements[name];if(input)input.value=String(p?adsRate(p,market):0);}renderAdsRoas();prepareProductIntegration(p);$('product-dialog').showModal();}
$('add').onclick=()=>openProduct();$('cancel').onclick=$('close-dialog').onclick=()=>{mlLookupVersion++;mlPricingVersion++;mlShippingVersion++;clearTimeout(mlPricingTimer);$('product-dialog').close();};$('product-dialog').oncancel=()=>{mlLookupVersion++;mlPricingVersion++;mlShippingVersion++;clearTimeout(mlPricingTimer);};
$('product-form').onsubmit=async e=>{e.preventDefault();if(productSaving)return;const form=e.target;productSaving=true;try{if(mlShippingPending)await mlShippingPending;if($('ml-auto-fees').checked){const result=await requestOfficialPricing();if(!result||!pricingMatches(result,pricingInput())){$('product-error').textContent='Aguarde uma cotação oficial válida antes de salvar, ou desmarque a opção para usar taxas manuais.';return;}if(!$('product-dialog').open)return;}const p={id:editing??(globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+Math.random().toString(36).slice(2)),name:form.elements.name.value.trim(),category:form.elements.category.value.trim(),...Object.fromEntries(['cost','weight','margin','extra','mlShipping','adsMl','adsShopee'].map(k=>[k,Number(form.elements[k]?.value??(k.startsWith('ads')?0:NaN))])),feeSnapshot:readProductFees(form,(editing?state.products.find(old=>old.id===editing)?.feeSnapshot:null)??state.fees),...(mlLinkedDraft?{mercadoLivre:copyMlLink(mlLinkedDraft)}:{}),...($('ml-auto-fees').checked&&mlPricingDraft?{mlPricing:copyOfficialPricing(mlPricingDraft)}:{})};if(!p.name||!p.category){$('product-error').textContent='Preencha nome e categoria.';return;}if(!validAds(p)){$('product-error').textContent='Informe Ads de 0 a 99,99%.';return;}if(!p.feeSnapshot){$('product-error').textContent='Confira as taxas deste produto: valores devem ser não negativos e cada comissão mais imposto deve ficar abaixo de 100%.';return;}if(Object.keys(SCENARIOS).some(k=>!calculate(p,state.fees[marketOf(k)],k))){$('product-error').textContent='A comissão, o imposto, Ads e a margem devem somar menos de 100% nos dois marketplaces.';return;}const old=state.products.find(old=>old.id===editing);if(old?.mlAds&&validProductAds({...p,mlAds:old.mlAds}))p.mlAds=copyProductAds(old.mlAds);const previousState=state;state={...state,products:editing?state.products.map(old=>old.id===editing?p:old):[...state.products,p],...(state.pendingProducts?{pendingProducts:state.pendingProducts.filter(row=>row.item.sellerId!==p.mercadoLivre?.sellerId||row.item.itemId!==p.mercadoLivre?.itemId)}:{})};if(!validState(state)||!persist()){state=previousState;$('product-error').textContent='Não foi possível gravar o cadastro. A pendência e os dados anteriores foram preservados; confira o armazenamento do navegador.';render();return;}render();$('product-dialog').close();refreshRegisteredAds();}finally{productSaving=false;}};
$('mobile-sort').onchange=e=>{sort={key:e.target.value,direction:sort.direction};render();};
$('sort-direction').onclick=()=>{sort.direction*=-1;render();};
$('search').oninput=render;
$('rows').onclick=e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.edit)openProduct(state.products.find(p=>p.id===button.dataset.edit));if(button.dataset.delete){if(state.kits.some(k=>k.items.some(i=>i.productId===button.dataset.delete))){toast('Este produto faz parte de um kit. Edite ou exclua o kit antes de remover o produto.');return;}deleting=button.dataset.delete;$('delete-text').textContent=state.products.find(p=>p.id===deleting).name+' será removido do catálogo.';$('delete-dialog').showModal();}};
$('delete-cancel').onclick=()=>$('delete-dialog').close();$('delete-confirm').onclick=()=>{if(state.kits.some(k=>k.items.some(i=>i.productId===deleting))){toast('Este produto faz parte de um kit. Edite ou exclua o kit antes de remover o produto.');$('delete-dialog').close();return;}state.products=state.products.filter(p=>p.id!==deleting);persist();render();$('delete-dialog').close();};
function csvCell(value){let s=String(value);if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function buildCSV(products,fees){
 const header=['Produto','Categoria','Custo (R$)','Peso (kg)','Outros custos por venda (R$)','Frete ML cadastrado (R$)','Margem desejada (%)','Ads Mercado Livre (%)','Ads Shopee (%)','Shopee - Devolução Fácil','Shopee - Evento oficial','ML - anúncio vinculado','ML - modalidade vinculada','ML - preço anunciado (R$)',...Object.values(SCENARIOS).flatMap(n=>[n+' - preço (R$)',n+' - lucro (R$)',n+' - margem efetiva (%)',n+' - comissão efetiva (%)',n+' - taxa fixa efetiva (R$)',n+' - imposto (%)',n+' - frete aplicado (R$)',n+' - preço mínimo para margem de 10% (R$)',n+' - Ads (R$)']),'ML - origem das tarifas','ML - data da consulta','ML Clássico - tarifa total oficial (R$)','ML Premium - tarifa total oficial (R$)','ML - origem do frete','ML - data da consulta de frete','Shopee - política de tarifas','Classificação pelo lucro líquido',...Object.values(SCENARIOS).map(n=>n+' - classificação por lucro líquido'),'Base da classificação','Lucro líquido médio por venda (R$)','Lucro líquido médio sobre a venda (%)'];
 const decimal=n=>n.toFixed(2).replace('.',',');
 return '\uFEFF'+[header,...products.map(p=>[p.name,p.category,decimal(p.cost),String(p.weight).replace('.',','),decimal(p.extra),decimal(p.mlShipping??0),decimal(p.margin),decimal(adsRate(p,'ml')),decimal(adsRate(p,'shopee')),(p.feeSnapshot??fees).shopee.easyReturnEnabled?'Sim':'Não',(p.feeSnapshot??fees).shopee.officialEventEnabled?'Sim':'Não',p.mercadoLivre?.itemId??'',p.mercadoLivre?.listingType??'',hasCurrentPrice(p,currentScenario(p))?decimal(p.mercadoLivre.price):'',...Object.keys(SCENARIOS).flatMap(k=>{const base=fees[marketOf(k)],c=saleResult(p,base,k),f=c?.feesApplied??effectiveFee(p,base,k),minimum=minimumPrice(p,base,k);return [...(c?[decimal(c.price),decimal(c.profit),decimal(c.margin)]:['Inviável','','']),decimal(f.commission),decimal(f.fixed),decimal(f.tax),c?decimal(c.shippingApplied):'',minimum?decimal(minimum.price):'Inviável',c?decimal(c.adsAmount):''];}),p.mlPricing?'API oficial Mercado Livre':'Manual',p.mlPricing?.fetchedAt??'',...['ml','mlPremium'].map(k=>{const q=saleResult(p,fees.ml,k);return q?.official?decimal(q.feeAmount):'';}),(p.mercadoLivre?.currentShipping??p.mercadoLivre?.shippingQuote)?((p.mercadoLivre.currentShipping??p.mercadoLivre.shippingQuote).source==='mercadolivre-shipping-table'?'Tabela oficial 40538':'API Mercado Livre'):'Manual',(p.mercadoLivre?.currentShipping??p.mercadoLivre?.shippingQuote)?.fetchedAt??'',(p.feeSnapshot??fees).shopee.policyId??'Manual (taxas preservadas)',pricingHealth(p,fees).label,...Object.keys(SCENARIOS).map(k=>profitHealth(saleResult(p,fees[marketOf(k)],k)).label),hasCurrentPrice(p,currentScenario(p))?'Preço atual do anúncio vinculado':'Média simulada dos três canais',averageProfit(p,fees)===null?'':decimal(averageProfit(p,fees)),pricingAverage(p,fees)===null?'':decimal(pricingAverage(p,fees))])].map(row=>row.map(csvCell).join(';')).join('\r\n');
}
$('export').onclick=()=>{const blob=new Blob([buildCSV(visibleProducts(),state.fees)],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='precos-marketplaces-'+new Date().toLocaleDateString('sv-SE')+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV exportado com os produtos visíveis, na ordem da tabela.');};
let importText=null,importBatch=[],importReadVersion=0;
function resetImportPreview(){importBatch=[];$('import-confirm').disabled=true;$('import-preview').innerHTML='';$('import-errors').innerHTML='';}
function previewImport(){
 resetImportPreview();if(importText===null)return;
 try{
  const result=parseImportCSV(importText,{category:$('import-category').value,margin:$('import-margin').value});
  const batchFees=withShopeePolicy(state.fees);
  if(result.products.some(p=>Object.keys(SCENARIOS).some(k=>!calculate({...p,extra:0,mlShipping:0,feeSnapshot:batchFees},batchFees[marketOf(k)],k))))throw Error('A margem do lote, a comissão e o imposto devem permitir um preço válido nos dois marketplaces. Ajuste a margem ou as taxas.');
  $('import-status').textContent=result.errors.length?`${result.errors.length} linha(s) com erro. Corrija o arquivo e selecione novamente. Nenhum produto será importado enquanto houver erros.`:`${result.total} produto(s) prontos para importar. Prévia dos primeiros ${Math.min(10,result.total)}:`;
  $('import-errors').innerHTML=result.errors.slice(0,20).map(error=>`<li>${escapeHTML(error)}</li>`).join('')+(result.errors.length>20?'<li>Outros erros omitidos; revise também as demais linhas.</li>':'');
  $('import-preview').innerHTML=result.products.slice(0,10).map(p=>`<li><strong>${escapeHTML(p.name)}</strong><small>${money(p.cost)} · ${number(p.weight,3)} kg · ${escapeHTML(p.category)} · margem ${number(p.margin)}%</small></li>`).join('');
  if(!result.errors.length){importBatch=result.products;$('import-confirm').disabled=false;}
 }catch(error){$('import-status').textContent='Não foi possível preparar a importação.';$('import-errors').innerHTML=`<li>${escapeHTML(error.message)}</li>`;}
}
$('import').onclick=()=>{importReadVersion++;importText=null;resetImportPreview();$('import-file').value='';$('import-status').textContent='Selecione um CSV para conferir os produtos antes de importar.';$('import-dialog').showModal();};
$('import-cancel').onclick=()=>{importReadVersion++;importText=null;resetImportPreview();$('import-dialog').close();};
$('import-dialog').oncancel=()=>{importReadVersion++;importText=null;resetImportPreview();};
$('import-file').onchange=async e=>{
 const version=++importReadVersion,file=e.target.files[0];importText=null;resetImportPreview();
 if(!file){$('import-status').textContent='Selecione um CSV.';return;}
 if(file.size>2*1024*1024){$('import-status').textContent='O CSV deve ter no máximo 2 MB.';return;}
 $('import-status').textContent='Lendo arquivo…';
 try{
  const bytes=await file.arrayBuffer();if(version!==importReadVersion)return;
  try{importText=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{importText=new TextDecoder('windows-1252').decode(bytes);}
  previewImport();
 }catch{if(version===importReadVersion)$('import-status').textContent='Não foi possível ler o arquivo. Selecione-o novamente.';}
};
$('import-category').oninput=$('import-margin').oninput=previewImport;
$('import-form').onsubmit=e=>{
 e.preventDefault();previewImport();if(!importBatch.length)return;
 const added=importBatch.map((p,i)=>({...p,feeSnapshot:withShopeePolicy(state.fees),id:'csv-'+(globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+Math.random().toString(36).slice(2))+'-'+i}));
 state.products.push(...added);const saved=persist();render();importReadVersion++;importText=null;resetImportPreview();$('import-dialog').close();
 if(saved)toast(`${added.length} produto(s) importados e salvos neste navegador.`);
};
let restoreCandidate=null,restoreReadVersion=0;
function clearRestore(){restoreCandidate=null;$('restore-confirm').disabled=true;$('restore-summary').textContent='';$('restore-error').textContent='';}
function previewRestore(text){
 clearRestore();
 try{
  restoreCandidate=parseBackup(text);
  $('restore-status').textContent=`Backup válido: ${restoreCandidate.products.length} produto(s) e ${restoreCandidate.kits.length} kit(s). Atualmente há ${state.products.length} produto(s) neste navegador.`;
  $('restore-summary').textContent=Object.entries(MARKETS).map(([k,name])=>{const f=restoreCandidate.fees[k];return k==='ml'?`${name}: Clássica ${number(f.commission)}%, Premium ${number(feeValue(f,'premiumCommission'))}%, taxa fixa ${money(f.fixed)}, imposto ${number(f.tax)}%.`:`${name}: comissão base ${number(f.commission)}%, taxa fixa ${money(f.fixed)}, imposto ${number(f.tax)}%, Devolução Fácil +${money(feeValue(f,'easyReturnFee'))}, eventos oficiais +${number(feeValue(f,'officialEventRate'))} p.p. (Devolução Fácil: ${f.easyReturnEnabled?'ativa':'inativa'}; Eventos Oficiais: ${f.officialEventEnabled?'ativos':'inativos'}).`;}).join('\n');
  $('restore-confirm').disabled=false;
 }catch(error){$('restore-status').textContent='Este arquivo não pode ser restaurado.';$('restore-error').textContent=error.message;}
}
$('download-backup').onclick=()=>{
 try{
  const blob=new Blob([buildBackup(state)],{type:'application/json;charset=utf-8;'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='margem-backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Download do backup iniciado: todos os produtos, kits e taxas foram incluídos.');
 }catch(error){toast('Não foi possível gerar o backup: '+error.message);}
};
$('restore-backup').onclick=()=>{restoreReadVersion++;clearRestore();$('restore-file').value='';$('restore-status').textContent='Selecione um backup para conferir o conteúdo.';$('restore-dialog').showModal();};
$('restore-cancel').onclick=()=>{restoreReadVersion++;clearRestore();$('restore-dialog').close();};
$('restore-dialog').oncancel=()=>{restoreReadVersion++;clearRestore();};
$('restore-file').onchange=async e=>{
 const version=++restoreReadVersion,file=e.target.files[0];clearRestore();
 if(!file){$('restore-status').textContent='Selecione um backup.';return;}
 if(file.size>20*1024*1024){$('restore-status').textContent='O backup deve ter no máximo 20 MB.';return;}
 $('restore-status').textContent='Lendo e validando backup…';
 try{const text=await file.text();if(version===restoreReadVersion)previewRestore(text);}
 catch{if(version===restoreReadVersion){$('restore-status').textContent='Falha na leitura do backup.';$('restore-error').textContent='Selecione o arquivo novamente.';}}
};
$('restore-form').onsubmit=e=>{
 e.preventDefault();if(!restoreCandidate)return;
 let restored;
 try{
  restored=preserveCatalogFees(backupData(restoreCandidate));restored=globalThis.ConduzMlPolicy?.sanitizeLocal(restored)??restored;
  // Grave primeiro: se o armazenamento falhar, o catálogo atual fica intacto.
  localStorage.setItem(KEY,JSON.stringify(restored));
 }catch{$('restore-error').textContent='Não foi possível salvar o backup no navegador. Seus dados atuais foram mantidos. Verifique o espaço disponível e tente novamente.';return;}
 state=restored;editing=null;sort={key:'name',direction:1};$('search').value='';$('save-status').textContent='● Salvo neste navegador';globalThis.ConduzCatalog?.onLocalChange();
 importReadVersion++;importText=null;resetImportPreview();resetKitEditor();render();restoreReadVersion++;clearRestore();$('restore-dialog').close();toast('Backup restaurado: produtos, kits e taxas salvos neste navegador.');
};
let kitItems=new Map(),kitEditing=null,kitDeleting=null;
let kitCategories=new Map(),kitContextDraft=null,kitPricingDraft=null,kitPricingVersion=0,kitPricingTimer,kitPricingPending=null,kitLastAttemptKey=null,kitPricingError='',kitCategoryVersion=0;
function renderKitSelectors(){
 for(const p of state.products)if(p.mercadoLivre?.categoryId)kitCategories.set(p.mercadoLivre.categoryId,{id:p.mercadoLivre.categoryId,name:p.mercadoLivre.categoryName??p.category});
 if(kitContextDraft)kitCategories.set(kitContextDraft.categoryId,{id:kitContextDraft.categoryId,name:kitContextDraft.categoryName});
 let category=$('kit-category').value||kitContextDraft?.categoryId||'';
 if(!category){const ids=[...new Set([...kitItems.keys()].map(id=>state.products.find(p=>p.id===id)?.mercadoLivre?.categoryId).filter(Boolean))];if(ids.length===1)category=ids[0];}
 $('kit-category').innerHTML='<option value="">Escolha a categoria do kit</option>'+[...kitCategories.values()].map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)} (${escapeHTML(c.id)})</option>`).join('');$('kit-category').value=category;
 const refs=state.products.filter(p=>p.mercadoLivre),old=$('kit-reference').value||kitContextDraft?.referenceItemId;
 const reference=refs.some(p=>p.mercadoLivre.itemId===old)?old:(refs.find(p=>kitItems.has(p.id))??refs[0])?.mercadoLivre.itemId??'';
 $('kit-reference').innerHTML='<option value="">Escolha um anúncio de referência</option>'+refs.map(p=>`<option value="${escapeHTML(p.mercadoLivre.itemId)}">${escapeHTML(p.name)} (${escapeHTML(p.mercadoLivre.itemId)})</option>`).join('');$('kit-reference').value=reference;
}
function readKitContext(){
 const dimensions=Object.fromEntries(['height','width','length'].map(k=>[k,Number($('kit-'+k).value)])),has=Object.values(dimensions).some(Boolean),category=kitCategories.get($('kit-category').value);
 const context={categoryId:category?.id,categoryName:category?.name,referenceItemId:$('kit-reference').value,dimensions:has?dimensions:null};return validKitContext(context)?context:null;
}
function readKitDraft(){const auto=$('kit-auto-fees').checked,context=auto&&readKitContext();return {name:$('kit-name').value.trim(),margin:Number($('kit-margin').value),adsMl:Number($('kit-ads-ml').value),adsShopee:Number($('kit-ads-shopee').value),extra:Number($('kit-extra').value),mlShipping:Number($('kit-shipping').value),items:Array.from(kitItems,([productId,quantity])=>({productId,quantity})),feeSnapshot:withShopeePolicy((kitEditing?state.kits.find(k=>k.id===kitEditing)?.feeSnapshot:null)??state.fees),...(context?{mlContext:copyKitContext(context)}:{}),...(auto&&kitPricingDraft?{mlPricing:copyOfficialPricing(kitPricingDraft)}:{})};}
function kitPricingInput(totals=kitTotals(readKitDraft(),state.products)){return totals&&readKitContext()?{cost:totals.cost,extra:totals.extra,weight:totals.weight,margin:totals.margin,ads:adsRate(totals),tax:(totals.feeSnapshot??state.fees).ml.tax,mlShipping:totals.mlShipping,context:copyKitContext(readKitContext())}:null;}
function kitPricingMatches(p,input){return input&&validOfficialPricing(p)&&p.kind==='kit'&&sameKitContext(p.context,input.context)&&adsRate(p.inputs)===adsRate(input)&&['cost','extra','weight','margin','tax'].every(k=>p.inputs[k]===input[k]);}
function kitInputKey(input){return input?JSON.stringify({...input,mlShipping:0}):null;}
async function requestKitPricing(force=false){
 const input=kitPricingInput(),key=kitInputKey(input);if(!$('kit-auto-fees').checked||!input)return null;
 if(!force&&kitPricingMatches(kitPricingDraft,input))return kitPricingDraft;
 if(!mlConnection.connected){kitPricingError='Conecte o Mercado Livre na tela Meus produtos para consultar as tarifas do kit.';renderKitPreview();return null;}
 if(!force&&kitPricingPending?.key===key)return kitPricingPending.promise;
 clearTimeout(kitPricingTimer);const version=++kitPricingVersion;kitLastAttemptKey=key;kitPricingError='';
 const promise=(async()=>{
  try{const result=await mlRequest('kit-pricing',{method:'POST',body:input});if(version!==kitPricingVersion||!$('kit-auto-fees').checked||kitInputKey(kitPricingInput())!==key)return null;
   if(!kitPricingMatches(result.pricing,input))throw Error('A consulta retornou dados diferentes dos dados deste kit.');
   kitPricingDraft=copyOfficialPricing(result.pricing);kitContextDraft=copyKitContext(result.pricing.context);$('kit-shipping').value=String(kitPricingDraft.inputs.mlShipping);return kitPricingDraft;
  }catch(error){if(version===kitPricingVersion)kitPricingError=error.message;return null;}
  finally{if(version===kitPricingVersion){kitPricingPending=null;renderKitPreview();}}
 })();kitPricingPending={key,version,promise};renderKitPreview();return promise;
}
async function findKitCategories(){
 const version=++kitCategoryVersion,q=$('kit-category-query').value.trim();$('kit-ml-status').textContent='Buscando categorias oficiais…';
 try{const data=await mlRequest('categories',{query:{q}});if(version!==kitCategoryVersion)return;
  for(const c of data.categories??[])if(/^MLB\d+$/.test(c.id)&&typeof c.name==='string')kitCategories.set(c.id,c);
  renderKitSelectors();if(data.categories?.length)$('kit-category').value=data.categories[0].id;
  kitLastAttemptKey=null;renderKitPreview();if(!data.categories?.length)$('kit-ml-status').textContent='Nenhuma categoria encontrada. Tente um nome mais específico.';
 }catch(error){if(version===kitCategoryVersion)$('kit-ml-status').textContent=error.message;}
}
function kitPricesHTML(totals,awaiting=false,compact=true){
 return Object.entries(SCENARIOS).map(([k,name])=>{
  const fee=state.fees[marketOf(k)],c=calculate(totals,fee,k),minimum=minimumPrice(totals,fee,k);
  return saleCardHTML(totals,fee,k,{result:c,minimum,best:awaiting?null:highestProfitScenario(totals,state.fees),pending:awaiting&&marketOf(k)==='ml',compact});
 }).join('');
}
function renderKitPicker(){
 renderKitSelectors();
 const query=$('kit-search').value.trim().toLocaleLowerCase('pt-BR');
 const products=state.products.filter(p=>(p.name+' '+p.category).toLocaleLowerCase('pt-BR').includes(query));
 $('kit-picker').innerHTML=products.length?products.map(p=>`<li><label class="kit-choice"><input type="checkbox" data-kit-product="${escapeHTML(p.id)}" ${kitItems.has(p.id)?'checked':''}><span><strong>${escapeHTML(p.name)}</strong><small>${money(p.cost)} · ${number(p.weight,3)} kg · ${escapeHTML(p.category)}</small></span></label><label>Quantidade<input type="number" min="1" max="9999" step="1" required inputmode="numeric" data-kit-quantity="${escapeHTML(p.id)}" aria-label="Quantidade de ${escapeHTML(p.name)}" value="${kitItems.get(p.id)??1}" ${kitItems.has(p.id)?'':'disabled'}></label></li>`).join(''):`<li>${state.products.length?'Nenhum produto encontrado.':'Cadastre produtos na tela Meus produtos para montar seu kit.'}</li>`;
}
function renderKitPreview(){
 renderAdsRoas();
 const draft=readKitDraft(),totals=kitTotals(draft,state.products);
 const auto=Boolean($('kit-auto-fees').checked),input=auto&&totals?kitPricingInput(totals):null,key=kitInputKey(input),ready=auto&&kitPricingMatches(kitPricingDraft,input),fees=draft.feeSnapshot??state.fees;
 $('kit-shipping').readOnly=auto;$('kit-ml-classic').value=auto?(ready?kitPricingDraft.quotes.ml.desired.commission:''):fees.ml.commission;$('kit-ml-premium').value=auto?(ready?kitPricingDraft.quotes.mlPremium.desired.commission:''):(fees.ml.premiumCommission??fees.ml.commission);$('kit-ml-tax').value=fees.ml.tax;
 $('kit-refresh-pricing').disabled=!auto||!input||!mlConnection.connected;$('kit-category-find').disabled=!mlConnection.connected;
 if(kitPricingPending&&(!auto||key!==kitPricingPending.key)){kitPricingVersion++;kitPricingPending=null;}
 if(!auto||!key)clearTimeout(kitPricingTimer);
 if(auto&&key&&!ready&&mlConnection.connected&&key!==kitLastAttemptKey){kitPricingError='';kitLastAttemptKey=key;clearTimeout(kitPricingTimer);kitPricingTimer=setTimeout(()=>requestKitPricing(),650);}
 $('kit-ml-status').textContent=!auto?'Tarifas manuais preservadas neste kit.':ready?`Categoria: ${kitPricingDraft.context.categoryName}. Cotação de ${new Date(kitPricingDraft.fetchedAt).toLocaleString('pt-BR')}. Frete Clássico: ${money(kitPricingDraft.quotes.ml.desired.shippingApplied)}; Premium: ${money(kitPricingDraft.quotes.mlPremium.desired.shippingApplied)}. ${kitPricingDraft.shippingQuote?.source==='mercadolivre-shipping-table'?'Frete estimado pela tabela oficial 40538, conferida em '+new Date(kitPricingDraft.shippingQuote.tableCheckedAt).toLocaleDateString('pt-BR')+'.':''}`:kitPricingError||(!totals?'Selecione os produtos e as quantidades do kit.':!readKitContext()?'Escolha a categoria e a referência de logística; confira as medidas da embalagem.':!mlConnection.connected?'Conecte sua conta do Mercado Livre para consultar o kit.':'Consultando frete e comissões oficiais do kit…');
 $('kit-fee-info').textContent=kitEditing?'Este kit mantém as taxas e os serviços salvos no cadastro, mesmo ao editar.':'Ao salvar, o kit guarda uma cópia das taxas gerais e dos serviços ativos naquele momento.';
 if(auto)$('kit-fee-info').textContent='Ao salvar, este kit guarda sua categoria, o frete e as comissões da consulta. Alterações nas taxas gerais não mudam a cotação salva.';
 $('kit-error').textContent='';$('kit-save').disabled=true;
 if(!totals){$('kit-totals').innerHTML='';$('kit-prices').innerHTML='<p>Selecione ao menos um produto com quantidade válida para calcular o kit.</p>';if(draft.items.length)$('kit-error').textContent='Confira as quantidades, a margem, Ads e os custos do kit.';return;}
 $('kit-totals').innerHTML=`<div><small>Custo dos produtos</small><strong>${money(totals.cost)}</strong></div><div><small>Outros custos totais</small><strong>${money(totals.extra)}</strong></div><div><small>Peso total</small><strong>${number(totals.weight,3)} kg</strong></div><div><small>Unidades no kit</small><strong>${totals.units}</strong><span class="sub">${draft.items.length} produto(s) diferente(s)</span></div>`;
 const averageHealth=pricingHealth(auto&&!ready?null:totals,state.fees);$('kit-totals').innerHTML+=`<div class="kit-average ${averageHealth.className}"><small>Lucro médio por venda do kit</small><strong>${Number.isFinite(averageHealth.profit)?money(averageHealth.profit):'—'}</strong>${healthBadge(averageHealth)}<span class="sub">Lucro sobre venda: ${Number.isFinite(averageHealth.average)?number(averageHealth.average)+'%':'—'} · Média dos três canais</span></div>`;
 $('kit-prices').innerHTML=kitPricesHTML(totals,auto&&!ready,true);
 const feasible=Object.keys(SCENARIOS).every(k=>calculate(totals,state.fees[marketOf(k)],k));
 if(!feasible&&(!auto||ready))$('kit-error').textContent='A margem, Ads, a comissão e o imposto devem somar menos de 100% nos dois marketplaces.';
 $('kit-save').disabled=!feasible||!draft.name||draft.name.length>120||auto&&!ready;
}
function renderKitScreen(){
 renderKitPicker();renderKitPreview();$('kit-count').textContent=`${state.kits.length} kit(s) salvo(s)`;
 $('saved-kits').innerHTML=state.kits.length?state.kits.map(kit=>{
  const totals=kitTotals(kit,state.products);
  return `<article class="saved-kit ${pricingHealth(totals,state.fees).className}"><h3>${escapeHTML(kit.name)}</h3>${healthBadge(pricingHealth(totals,state.fees),true)}<br><span class="margin">Margem desejada: ${number(kit.margin)}%</span><span class="sub" style="margin-top:8px">${kit.mlContext?'Categoria do kit: '+escapeHTML(kit.mlContext.categoryName)+' · ':''}${kit.mlPricing?'Cotação oficial preservada':'Taxas preservadas do cadastro'}</span><ul>${kit.items.map(i=>`<li>${i.quantity} × ${escapeHTML(state.products.find(p=>p.id===i.productId)?.name??'Produto indisponível')}</li>`).join('')}</ul>${totals?`<p>Custo: ${money(totals.cost)} · outros custos: ${money(totals.extra)} · ${number(totals.weight,3)} kg</p><div class="kit-prices">${kitPricesHTML(totals)}</div>`:'<p class="error">Revise os produtos e as quantidades deste kit.</p>'}<div class="actions"><button class="btn quiet" data-edit-kit="${escapeHTML(kit.id)}">Editar kit</button><button class="btn quiet" data-delete-kit="${escapeHTML(kit.id)}">Excluir kit</button></div></article>`;
 }).join(''):'<p>Nenhum kit salvo. Monte o primeiro usando os produtos cadastrados.</p>';
}
function resetKitEditor(){kitItems=new Map();kitEditing=null;kitContextDraft=null;kitPricingDraft=null;kitPricingVersion++;kitCategoryVersion++;kitPricingPending=null;kitLastAttemptKey=null;kitPricingError='';clearTimeout(kitPricingTimer);$('kit-category').value='';$('kit-reference').value='';$('kit-category-query').value='';for(const k of ['height','width','length'])$('kit-'+k).value='';$('kit-auto-fees').checked=Boolean(mlConnection.connected);$('kit-name').value='Meu kit';$('kit-margin').value='20';$('kit-ads-ml').value='0';$('kit-ads-shopee').value='0';$('kit-extra').value='0';$('kit-shipping').value='0';$('kit-search').value='';$('kit-editor-title').textContent='Monte seu kit';}
function showScreen(screen){
 const active=['products','kits','ads'].includes(screen)?screen:'products';
 for(const key of ['products','kits','ads']){$(key+'-view').classList.toggle('hidden',active!==key);$('view-'+key).setAttribute('aria-pressed',String(active===key));}
 if(active==='kits')renderKitScreen();if(active==='ads')adsSetLayout(adsHistoryUi.layout);
}
$('view-products').onclick=()=>showScreen('products');$('view-kits').onclick=()=>showScreen('kits');$('view-ads').onclick=()=>showScreen('ads');
const sidebarMedia=globalThis.matchMedia?.('(max-width: 1100px)');
let sidebarOpen=false;
let sidebarCollapsed=false,sidebarTooltipTarget=null;
try{sidebarCollapsed=localStorage.getItem('conduz.sidebar.collapsed.v1')==='1';}catch{}
function hideSidebarTooltip(){
 $('sidebar-tooltip').hidden=true;sidebarTooltipTarget?.removeAttribute('aria-describedby');sidebarTooltipTarget=null;
}
function renderSidebarCollapse(){
 const collapsed=sidebarCollapsed&&!sidebarMedia?.matches,label=collapsed?'Expandir menu lateral':'Recolher menu lateral';
 $('app-shell').classList.toggle('sidebar-collapsed',collapsed);
 $('sidebar-collapse').setAttribute('aria-expanded',String(!collapsed));$('sidebar-collapse').setAttribute('aria-label',label);$('sidebar-collapse').title=label;
 hideSidebarTooltip();
}
function showSidebarTooltip(target){
 if(!sidebarCollapsed||sidebarMedia?.matches||!target?.dataset.sidebarLabel)return;
 hideSidebarTooltip();sidebarTooltipTarget=target;
 const tooltip=$('sidebar-tooltip'),bounds=target.getBoundingClientRect(),side=$('app-sidebar').getBoundingClientRect();
 tooltip.textContent=target.dataset.sidebarLabel;tooltip.style.left=(side.right+10)+'px';tooltip.style.top=Math.max(28,Math.min(bounds.top+bounds.height/2,globalThis.innerHeight-28))+'px';tooltip.hidden=false;
 target.setAttribute('aria-describedby','sidebar-tooltip');
}
$('sidebar-collapse').onclick=()=>{
 sidebarCollapsed=!sidebarCollapsed;
 try{localStorage.setItem('conduz.sidebar.collapsed.v1',sidebarCollapsed?'1':'0');}catch{}
 renderSidebarCollapse();
};
$('app-sidebar').addEventListener?.('mouseover',e=>showSidebarTooltip(e.target.closest('[data-sidebar-label]')));
$('app-sidebar').addEventListener?.('mouseout',e=>{if(sidebarTooltipTarget&&!sidebarTooltipTarget.contains(e.relatedTarget))hideSidebarTooltip();});
$('app-sidebar').addEventListener?.('focusin',e=>showSidebarTooltip(e.target.closest('[data-sidebar-label]')));
$('app-sidebar').addEventListener?.('focusout',hideSidebarTooltip);
for(const event of ['resize','scroll'])globalThis.addEventListener?.(event,hideSidebarTooltip,true);
function setSidebarOpen(open,restoreFocus=true){
 const mobile=Boolean(sidebarMedia?.matches);sidebarOpen=mobile&&open;
 hideSidebarTooltip();
 document.body?.classList?.toggle('navigation-open',sidebarOpen);
 $('app-sidebar').inert=mobile&&!sidebarOpen;$('main-content').inert=sidebarOpen;
 $('sidebar-overlay').hidden=!sidebarOpen;$('sidebar-toggle').setAttribute('aria-expanded',String(!mobile||sidebarOpen));
 if(sidebarOpen)$('sidebar-menu').querySelector?.('button[aria-pressed="true"]')?.focus();
 else if(mobile&&restoreFocus)$('sidebar-toggle').focus?.();
}
$('sidebar-toggle').onclick=()=>setSidebarOpen(!sidebarOpen);
$('sidebar-close').onclick=$('sidebar-overlay').onclick=()=>setSidebarOpen(false);
$('sidebar-menu').addEventListener?.('click',e=>{if(e.target.closest('button[id^="view-"],a'))setSidebarOpen(false);});
document.addEventListener?.('keydown',e=>{
 if(e.key==='Escape')hideSidebarTooltip();
 if(!sidebarOpen)return;
 if(e.key==='Escape'){e.preventDefault();setSidebarOpen(false);return;}
 if(e.key!=='Tab')return;
 const items=Array.from($('app-sidebar').querySelectorAll('button:not(:disabled),a[href]')).filter(el=>el.getClientRects().length),first=items[0],last=items[items.length-1];
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
sidebarMedia?.addEventListener?.('change',()=>{setSidebarOpen(false,false);renderSidebarCollapse();});setSidebarOpen(false,false);renderSidebarCollapse();
$('kit-search').oninput=renderKitPicker;
$('kit-picker').onchange=e=>{
 const input=e.target;
 if(input.dataset.kitProduct){if(input.checked)kitItems.set(input.dataset.kitProduct,1);else kitItems.delete(input.dataset.kitProduct);renderKitPicker();}
 else if(input.dataset.kitQuantity)kitItems.set(input.dataset.kitQuantity,Number(input.value));
 renderKitPreview();
};
$('kit-picker').oninput=e=>{if(e.target.dataset.kitQuantity){kitItems.set(e.target.dataset.kitQuantity,Number(e.target.value));renderKitPreview();}};
for(const id of ['kit-name','kit-margin','kit-ads-ml','kit-ads-shopee','kit-extra','kit-shipping'])$(id).oninput=renderKitPreview;
for(const id of ['kit-height','kit-width','kit-length'])$(id).oninput=renderKitPreview;
for(const id of ['kit-auto-fees','kit-category','kit-reference'])$(id).onchange=()=>{kitPricingError='';kitLastAttemptKey=null;renderKitPreview();};
$('kit-category-find').onclick=findKitCategories;$('kit-category-query').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();findKitCategories();}};
$('kit-refresh-pricing').onclick=()=>requestKitPricing(true);
$('kit-new').onclick=()=>{resetKitEditor();renderKitScreen();};
$('kit-form').onsubmit=async e=>{
 if($('kit-auto-fees').checked){e.preventDefault();const result=await requestKitPricing();if(!result||!kitPricingMatches(result,kitPricingInput()))return;}
 e.preventDefault();renderKitPreview();if($('kit-save').disabled)return;
 const draft=readKitDraft(),id=kitEditing??('kit-'+(globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+Math.random().toString(36).slice(2)));
 const kit={...draft,id,feeSnapshot:copyFees(draft.feeSnapshot??state.fees)};if(kitEditing)state.kits=state.kits.map(k=>k.id===id?kit:k);else state.kits.push(kit);
 const saved=persist();resetKitEditor();renderKitScreen();if(saved)toast(kit.mlPricing?'Kit salvo com frete e comissões oficiais preservados.':'Kit salvo. Os preços acompanham os custos atuais dos produtos.');
};
$('saved-kits').onclick=e=>{
 const button=e.target.closest('button');if(!button)return;
 if(button.dataset.editKit){const kit=state.kits.find(k=>k.id===button.dataset.editKit);if(!kit)return;kitEditing=kit.id;kitContextDraft=kit.mlContext?copyKitContext(kit.mlContext):null;kitPricingDraft=kit.mlPricing?copyOfficialPricing(kit.mlPricing):null;kitPricingVersion++;kitPricingPending=null;kitLastAttemptKey=null;kitPricingError='';clearTimeout(kitPricingTimer);$('kit-auto-fees').checked=Boolean(kit.mlPricing);$('kit-category').value=kit.mlContext?.categoryId??'';$('kit-reference').value=kit.mlContext?.referenceItemId??'';for(const k of ['height','width','length'])$('kit-'+k).value=kit.mlContext?.dimensions?.[k]??'';kitItems=new Map(kit.items.map(i=>[i.productId,i.quantity]));$('kit-name').value=kit.name;$('kit-margin').value=kit.margin;$('kit-ads-ml').value=String(adsRate(kit,'ml'));$('kit-ads-shopee').value=String(adsRate(kit,'shopee'));$('kit-extra').value=kit.extra;$('kit-shipping').value=kit.mlShipping;$('kit-search').value='';$('kit-editor-title').textContent='Editar kit';renderKitScreen();}
 if(button.dataset.deleteKit){kitDeleting=button.dataset.deleteKit;$('kit-delete-text').textContent=state.kits.find(k=>k.id===kitDeleting).name+' será removido. Os produtos individuais serão mantidos.';$('kit-delete-dialog').showModal();}
};
$('kit-delete-cancel').onclick=()=>$('kit-delete-dialog').close();$('kit-delete-confirm').onclick=()=>{state.kits=state.kits.filter(k=>k.id!==kitDeleting);if(kitEditing===kitDeleting)resetKitEditor();persist();renderKitScreen();$('kit-delete-dialog').close();};
let mlConnection={configured:false,connected:false,account:null},mlLinkedDraft=null,mlLookupVersion=0,mlPickerVersion=0,mlCursor=null,mlCatalog=[];
let mlPricingDraft=null,mlPricingVersion=0,mlPricingTimer,mlPricingPending=null;
let productSaving=false,mlShippingVersion=0,mlShippingPending=null,mlManualRatesDraft=null,mlCommissionReference=null;
function renderAutomaticShipping(message){
 const quote=mlLinkedDraft?.shippingQuote,field=$('product-form').elements.mlShipping;
 if(field)field.readOnly=Boolean(quote);
 $('ml-shipping-status').textContent=message??(quote?`Frete preenchido automaticamente: ${money(quote.amount)} para ${quote.listingType==='gold_pro'?'Premium':'Clássico'}. ${quote.source==='mercadolivre-shipping-table'?'Estimativa pela tabela oficial 40538, conferida em '+new Date(quote.tableCheckedAt).toLocaleDateString('pt-BR')+(quote.dimensionsKnown?' (peso físico e volumétrico).':' (dimensões indisponíveis: confira o peso faturável do pacote).'):'Estimativa do vendedor consultada em '+new Date(quote.fetchedAt).toLocaleString('pt-BR')+'.'}`:'');
 $('shipping-help').textContent=mlLinkedDraft?'O frete do vendedor é obtido do Mercado Livre ao vincular. Com tarifas oficiais, recalculamos o frete para cada preço e modalidade. O campo mostra a referência da modalidade vinculada. A cotação é estimada; quando a API de frete não está disponível, usamos a tabela oficial aplicável à conta. O custo definitivo depende da venda.':'No cadastro manual, o frete entra no Mercado Livre se o preço sem ele ultrapassar R$ 100,00. Não repita o mesmo frete em outros custos.';compactStatusTitles();
}
function loadAutomaticShipping(){
 if(!mlLinkedDraft||!mlConnection.connected)return;
 const version=++mlShippingVersion,id=mlLinkedDraft.itemId;
 renderAutomaticShipping('Consultando automaticamente o frete do vendedor no Mercado Livre…');
 const promise=(async()=>{
  try{const data=await mlRequest('shipping',{query:{id}});if(version!==mlShippingVersion||mlLinkedDraft?.itemId!==id||!$('product-dialog').open)return;
   if(!validShippingQuote(data.shipping)||data.shipping.itemId!==id)throw Error('A consulta não retornou um frete válido.');
   mlLinkedDraft.shippingQuote=copyShippingQuote(data.shipping);$('product-form').elements.mlShipping.value=String(data.shipping.amount);renderAutomaticShipping();scheduleOfficialPricing();
  }catch(error){if(version===mlShippingVersion)renderAutomaticShipping(error.message+' Informe o frete manualmente se necessário.');}
  finally{if(version===mlShippingVersion)mlShippingPending=null;}
 })();mlShippingPending=promise;return promise;
}
function pricingInput(){const form=$('product-form');return {itemId:mlLinkedDraft?.itemId,...(mlLinkedDraft?{autoShipping:true}:{}),...Object.fromEntries(['cost','extra','margin','mlShipping','weight'].map(k=>[k,Number(form.elements[k]?.value)])),ads:Number(form.elements.adsMl?.value??0),tax:Number(form.elements['product-ml-tax']?.value)};}
function pricingMatches(pricing,input){return validOfficialPricing(pricing)&&pricing.itemId===input.itemId&&adsRate(pricing.inputs)===adsRate(input)&&(pricing.inputs.autoShipping===true)===(input.autoShipping===true)&&Object.keys(pricing.inputs).every(k=>pricing.inputs[k]===input[k]);}
function renderAutoPricing(message){
 const enabled=Boolean($('ml-auto-fees').checked),input=pricingInput(),ready=enabled&&pricingMatches(mlPricingDraft,input);
 const reference=enabled&&!(input.cost>0)&&validCommissionReference(mlCommissionReference)&&mlCommissionReference.itemId===mlLinkedDraft?.itemId;
 $('ml-auto-fees').disabled=!mlLinkedDraft;
 const selected=mlLinkedDraft?.listingType==='gold_pro'?'mlPremium':'ml';
 const selectedQuote=ready?mlPricingDraft.quotes[selected].desired:reference?mlCommissionReference.quotes[selected]:null;
 $('product-form').dataset.mlFixed=String(enabled?(selectedQuote?.fixed??0):Number($('product-form').dataset.mlManualFixed??0));
 for(const [key,scenario] of [['commission','ml'],['premiumCommission','mlPremium']]){
  const field=$('product-form').elements['product-ml-'+key];if(!field)continue;
  if(enabled&&!field.readOnly){mlManualRatesDraft??={};mlManualRatesDraft[key]=field.value;}
  if(!enabled&&field.readOnly&&mlManualRatesDraft?.[key]!==undefined)field.value=mlManualRatesDraft[key];
  field.disabled=false;field.readOnly=enabled;field.required=!enabled;field.parentElement?.classList.toggle('hidden',false);
  const q=ready?mlPricingDraft.quotes[scenario].desired:reference?mlCommissionReference.quotes[scenario]:null;
  if(enabled)field.value=q?String(q.commission):'';
  field.placeholder=enabled&&!q?'Aguardando consulta':'';
  const note=$('product-ml-'+key+'-info');note.classList.toggle('hidden',!enabled);
  const source=ready?mlPricingDraft:mlCommissionReference;
  note.textContent=q?`Categoria: ${mlLinkedDraft.categoryName??source.categoryId}. Tarifa total de ${money(q.feeAmount)} no preço de ${money(ready?q.price:source.price)}; taxa fixa de ${money(q.fixed)} já incluída. ${reference?'Referência do anúncio; informe custo e margem para recalcular.':'Consulta em '+new Date(source.fetchedAt).toLocaleString('pt-BR')+'.'}`:'Aguardando consulta válida para a categoria e o preço deste produto.';field.title=note.textContent;
 }
 $('ml-refresh-pricing').disabled=!enabled||!mlLinkedDraft||!mlConnection.connected;
 $('ml-pricing-status').textContent=message??(!mlLinkedDraft?'Vincule um anúncio para consultar as tarifas da categoria.':!enabled?'Tarifas manuais: os valores deste produto serão preservados.':ready?'Cotação oficial de '+new Date(mlPricingDraft.fetchedAt).toLocaleString('pt-BR')+'. Será preservada neste produto.':'Preencha custo, peso, margem e imposto para consultar as tarifas automaticamente.');
 const previewProduct=ready?{...pricingInput(),mercadoLivre:mlLinkedDraft,feeSnapshot:readProductFees($('product-form'),state.fees),mlPricing:mlPricingDraft}:null;
 $('ml-pricing-preview').innerHTML=ready?['ml','mlPremium'].map(key=>{const result=calculate(previewProduct,state.fees.ml,key);return '<div class="product-estimate"><span>'+({ml:'Clássico',mlPremium:'Premium'}[key])+'</span><strong>'+(result?money(result.price):'Recalcular')+'</strong>'+(result?'<small>Lucro '+money(result.profit)+' · '+number(profitRate(result))+'%</small>':'')+'</div>';}).join(''):'';compactStatusTitles();
}
async function requestOfficialPricing(force=false){
 const input=pricingInput(),key=JSON.stringify(input);
 if(!$('ml-auto-fees').checked)return null;
 if(!force&&pricingMatches(mlPricingDraft,input))return mlPricingDraft;
 if(!input.itemId||!validAds(input)||!['cost','extra','margin','mlShipping','weight','tax'].every(k=>Number.isFinite(input[k])&&input[k]>=0)||input.cost<=0||input.margin>=100||input.tax>=100){renderAutoPricing('Preencha um custo maior que zero e confira margem, Ads, peso, frete e imposto.');return null;}
 if(!mlConnection.connected){renderAutoPricing('Conecte o Mercado Livre para atualizar esta cotação. A consulta salva continua disponível.');return null;}
 if(!force&&mlPricingPending?.key===key)return mlPricingPending.promise;
 clearTimeout(mlPricingTimer);const version=++mlPricingVersion;
 renderAutoPricing('Consultando tarifas oficiais e validando a margem nos preços sugeridos…');
 const promise=(async()=>{
  try{const data=await mlRequest('pricing',{method:'POST',body:input});if(version!==mlPricingVersion||JSON.stringify(pricingInput())!==key||!$('ml-auto-fees').checked)return null;
   if(!pricingMatches(data.pricing,{...input,...(input.autoShipping?{mlShipping:data.pricing?.inputs?.mlShipping}:{})}))throw Error('A cotação retornada não corresponde aos dados do formulário. Consulte novamente.');
   mlPricingDraft=copyOfficialPricing(data.pricing);if(mlPricingDraft.shippingQuote){mlLinkedDraft.shippingQuote=copyShippingQuote(mlPricingDraft.shippingQuote);$('product-form').elements.mlShipping.value=String(mlPricingDraft.inputs.mlShipping);renderAutomaticShipping();}renderAutoPricing();return mlPricingDraft;
  }catch(error){if(version===mlPricingVersion)renderAutoPricing(error.message+' As tarifas manuais não foram aplicadas no lugar das oficiais.');return null;}
  finally{if(mlPricingPending?.version===version)mlPricingPending=null;}
 })();mlPricingPending={key,version,promise};return promise;
}
function scheduleOfficialPricing(){
 mlPricingVersion++;mlPricingPending=null;clearTimeout(mlPricingTimer);renderAutoPricing();
 if($('ml-auto-fees').checked)mlPricingTimer=setTimeout(()=>requestOfficialPricing(),650);
}
$('ml-auto-fees').onchange=()=>scheduleOfficialPricing();
$('ml-refresh-pricing').onclick=()=>requestOfficialPricing(true);
$('product-form').oninput=e=>{if(['adsMl','adsShopee'].includes(e.target.name))renderAdsRoas();if(['cost','extra','margin','adsShopee'].includes(e.target.name)||e.target.name?.startsWith('product-shopee-'))renderShopeePricing();if(['cost','extra','margin','adsMl','weight','mlShipping','product-ml-tax'].includes(e.target.name))scheduleOfficialPricing();};
function renderShopeePricing(){
 const form=$('product-form'),fields=form.elements;if(!fields['product-shopee-tax']||!fields.cost)return;
 form.dataset.shopeePolicy=SHOPEE_POLICY_ID;
 const fee={tax:Number(fields['product-shopee-tax'].value),easyReturnEnabled:Boolean(fields['product-shopee-easyReturnEnabled']?.checked),officialEventEnabled:Boolean(fields['product-shopee-officialEventEnabled']?.checked)};
 const result=fields.cost.value!==''&&fields.margin.value!==''?calculateShopee({cost:Number(fields.cost.value),extra:Number(fields.extra.value),margin:Number(fields.margin.value),adsShopee:Number(fields.adsShopee?.value??0)},fee):null;
 const values={commission:result?.baseCommission,fixed:result?.fixedBase,easyReturnFee:SHOPEE_POLICY.easyReturnFee,officialEventRate:SHOPEE_POLICY.eventRate};
 for(const [key,value] of Object.entries(values)){const field=fields['product-shopee-'+key];if(!field)continue;field.readOnly=true;field.required=false;field.disabled=false;field.value=value===undefined?'':String(value);field.placeholder=value===undefined?'Preencha custo e margem':'';}
 $('product-shopee-policy-status').textContent=`Tabela oficial para CNPJ conferida em 13/11/2026. ${result?'Taxas calculadas no preço sugerido de '+money(result.price)+'.':'Informe custo, margem e imposto para calcular a faixa.'} Devolução Fácil: R$ 0,49 por pedido; Campanhas de Destaque: +5 p.p., aplicados somente conforme suas marcações. Marque os programas quando a cobrança estiver ativa; a campanha incide nas vendas da loja durante a participação. O imposto mantém o percentual cadastrado da empresa. Simulação de 1 item ou 1 kit por pedido.`;compactStatusTitles();
}
function renderProductRates(fees){
 mlManualRatesDraft={commission:String(fees.ml.commission),premiumCommission:String(fees.ml.premiumCommission??fees.ml.commission)};
 $('product-form').dataset.mlManualFixed=String(fees.ml.fixed);$('product-form').dataset.mlFixed=String(fees.ml.fixed);
 $('product-rate-fields').innerHTML=Object.entries(MARKETS).map(([market,name])=>`<section class="market" data-product-pane="${market}"><strong>${name}</strong><div class="fields">${feeFields(market).filter(([field])=>market!=='ml'||field!=='fixed').map(([field,label])=>{
  const official=market==='ml'&&['commission','premiumCommission'].includes(field),id='product-ml-'+field+'-info';
  const input=`<label>${label}<input name="product-${market}-${field}" type="number" min="0" max="${['fixed','easyReturnFee'].includes(field)?'1000000000':'99.99'}" step="0.01" required inputmode="decimal" value="${feeValue(fees[market],field)}" ${official?`aria-describedby="${id}"`:''}></label>`;
  return official?`<div>${input}<p id="${id}" class="help hidden" role="status"></p></div>`:input;
  }).join('')}</div>${market==='shopee'?`<label class="option-question"><input type="checkbox" name="product-shopee-easyReturnEnabled" ${fees.shopee.easyReturnEnabled?'checked':''}><span>Devolução Fácil neste produto</span></label><label class="option-question"><input type="checkbox" name="product-shopee-officialEventEnabled" ${fees.shopee.officialEventEnabled?'checked':''}><span>Eventos Oficiais / Campanhas de Destaque</span></label><p class="help" id="product-shopee-policy-status" role="status"></p><a class="help" href="${SHOPEE_POLICY.url}" target="_blank" rel="noopener noreferrer">Política oficial da Shopee para CNPJ ↗</a>`:''}</section>`).join('');
 $('product-form').dataset.shopeePolicy='';renderShopeePricing();
}
function renderMlLink(){
 $('ml-unlink').classList.toggle('hidden',!mlLinkedDraft);
 $('ml-linked-preview').innerHTML=mlLinkedDraft?`${mlLinkedDraft.thumbnail?`<img class="ml-linked-image" src="${escapeHTML(mlLinkedDraft.thumbnail)}" alt="" referrerpolicy="no-referrer">`:''}<p><strong>${escapeHTML(mlLinkedDraft.title)}</strong><br><a class="ml-item-link" href="${escapeHTML(mlLinkedDraft.permalink)}" target="_blank" rel="noopener noreferrer">${escapeHTML(mlLinkedDraft.itemId)} ↗</a> · ${mlLinkedDraft.listingType==='gold_pro'?'Premium':mlLinkedDraft.listingType==='gold_special'?'Clássico':escapeHTML(mlLinkedDraft.listingType||'Modalidade não informada')}</p><p>${mlLinkedDraft.price!==null?'Preço anunciado: '+money(mlLinkedDraft.price)+' (referência).':'Preço anunciado não disponível nesta consulta.'} Informe seu custo de compra; ele não é o preço do anúncio.</p>${mlLinkedDraft.weight===null?'<p>O anúncio não informou peso utilizável. Preencha o peso manualmente.</p>':''}${mlLinkedDraft.variationCount?'<p>Este anúncio possui variações. Confira o peso e o custo do SKU desejado.</p>':''}`:'Nenhum anúncio vinculado. Você pode cadastrar o produto manualmente.';
}
function prepareProductIntegration(product){
 mlCommissionReference=null;
 mlLookupVersion++;mlLinkedDraft=product?.mercadoLivre?copyMlLink(product.mercadoLivre):null;$('ml-item-query').value=mlLinkedDraft?.itemId??'';
 $('ml-product-status').textContent=mlConnection.connected?'Escolha um anúncio da conta conectada ou informe o ID MLB.':'Conecte a conta para consultar seus anúncios. O cadastro manual continua disponível.';
 renderProductRates(productInitialFees(product,state.fees));renderMlLink();mlPricingVersion++;clearTimeout(mlPricingTimer);mlPricingDraft=product?.mlPricing?copyOfficialPricing(product.mlPricing):null;$('ml-auto-fees').checked=Boolean(mlPricingDraft);mlShippingVersion++;mlShippingPending=null;renderAutomaticShipping();renderAutoPricing();if(mlLinkedDraft&&!mlLinkedDraft.shippingQuote)loadAutomaticShipping();compactStatusTitles();
}
function renderMlConnection(message){
 globalThis.ConduzAccess?.acceptConnection(mlConnection);
 globalThis.ConduzAccess?.enterPanel(mlConnection);
 if(message)globalThis.ConduzAccess?.showError(message);
 if(!mlConnection.connected)globalThis.ConduzMlImport?.onDisconnect();
 $('ml-connection-status').textContent=message??(mlConnection.connected?`Conta conectada: ${mlConnection.account.nickname}. Escolha o anúncio no cadastro de produto.`:mlConnection.configured?'Conta desconectada. Conecte para consultar seu catálogo.':'Conexão aguardando configuração. O restante do painel funciona normalmente.');
 $('ml-connect').disabled=!mlConnection.configured;$('ml-connect').classList.toggle('hidden',mlConnection.connected);
 $('ml-disconnect').classList.toggle('hidden',!mlConnection.connected);$('ml-setup-help').classList.toggle('hidden',mlConnection.configured);
 $('ml-connect-product').disabled=!mlConnection.configured;$('ml-connect-product').classList.toggle('hidden',mlConnection.connected);
 $('ml-open-picker').disabled=!mlConnection.connected;$('ml-find-item').disabled=!mlConnection.connected;
 $('ml-refresh-current').classList.toggle('hidden',!mlConnection.connected);$('ml-refresh-ads').classList.toggle('hidden',!mlConnection.connected);renderAdsDashboard();
}
function currentLinkFromResponse(previous,response){
 const item=response.item;if(!validMlLink(item)||item.itemId!==previous.itemId||item.sellerId!==previous.sellerId)throw Error('O anúncio consultado não corresponde ao produto cadastrado.');
 const link={...copyMlLink(previous),price:item.price,listingType:item.listingType,fetchedAt:item.fetchedAt,...(item.status!==undefined?{status:item.status}:{}),...(item.skus?{skus:item.skus.slice()}:{})};
 if(item.price!==previous.price||item.listingType!==previous.listingType){delete link.currentFees;delete link.currentShipping;}
 if(validCommissionReference(response.commissions)&&response.commissions.itemId===item.itemId&&response.commissions.price===item.price)link.currentFees=copyCommissionReference(response.commissions);
 if(validShippingQuote(item.shippingQuote)&&item.shippingQuote.price===item.price&&item.shippingQuote.listingType===item.listingType)link.currentShipping=copyShippingQuote(item.shippingQuote);
 return link;
}
let currentPricesBusy=false;
async function refreshRegisteredPrices(force=false){
 if(currentPricesBusy||!mlConnection.connected||globalThis.ConduzMlImport?.isOpen())return;
 const products=state.products.filter(p=>p.mercadoLivre&&(force||globalThis.ConduzMlDataRules&&!ConduzMlDataRules.fresh(p.mercadoLivre)||!p.mercadoLivre.currentFees||p.mlPricing&&!p.mercadoLivre.currentShipping));
 if(!products.length)return;
 currentPricesBusy=true;$('ml-refresh-current').disabled=true;let updated=0,failed=0;
 try{
  for(const product of products){
   if(!mlConnection.connected)break;
   $('ml-current-status').textContent=`Consultando preços e tarifas dos anúncios: ${updated+failed+1} de ${products.length}…`;
   try{const response=await mlRequest('item',{query:{id:product.mercadoLivre.itemId}}),current=state.products.find(p=>p.id===product.id);
    if(!current||current.mercadoLivre?.itemId!==product.mercadoLivre.itemId||globalThis.ConduzMlImport?.isOpen())continue;
    if(!(response.item?.price>0))throw Error('Preço atual indisponível; preservando o preço registrado.');
    current.mercadoLivre=currentLinkFromResponse(current.mercadoLivre,response);updated++;
   }catch{failed++;}
  }
  if(updated){persist();render();}
  $('ml-current-status').textContent=`${updated} anúncio(s) atualizado(s). ${failed?failed+' consulta(s) indisponível(is); os dados anteriores foram preservados.':'O lucro usa o preço registrado na modalidade do anúncio. As sugestões e taxas salvas continuam preservadas.'}`;
 }finally{currentPricesBusy=false;$('ml-refresh-current').disabled=false;}
}
$('ml-refresh-current').onclick=()=>refreshRegisteredPrices(true);
var adsUi={busy:false,advertisers:[],selectedAdvertiser:null,accountError:'',budgetTouched:false,reconcileProduct:null,reconcileBasis:null};
const adsDate=value=>value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4);
function adsMetric(label,value,note='',empty=false){return '<div class="ads-metric'+(empty?' is-empty':'')+'"><small>'+escapeHTML(label)+'</small><strong>'+escapeHTML(value)+'</strong><span>'+escapeHTML(note)+'</span></div>';}
function adsMetricsHTML(a){
 const known=Boolean(a),cpc=a?.clicks>0?a.cost/a.clicks:null,roas=a?.cost>0?a.revenue/a.cost:null;
 return adsMetric('Investimento consultado',known?money(a.cost):'Sem dados suficientes',known?'Média diária: '+money(a.cost/30):'Conecte e atualize a consulta',!known)+adsMetric('Receita atribuída',known?money(a.revenue):'—','Receita não é lucro',!known)+adsMetric('ROAS',roas===null?'—':number(roas,2)+'x','Receita / investimento',roas===null)+adsMetric('CPC médio',cpc===null?'—':money(cpc),'Investimento / cliques',cpc===null);
}
var adsHistoryUi={busy:false,epoch:0,layout:'periods',rows:[],ranges:[],metric:'cost'};
function adsSetLayout(layout,load=true){
 adsHistoryUi.layout=layout==='cards'?'cards':'periods';$('ads-view').dataset.adsLayout=adsHistoryUi.layout;
 for(const key of ['periods','cards'])$('ads-layout-'+key).setAttribute('aria-pressed',String(key===adsHistoryUi.layout));
 renderAdsDashboard();if(load&&mlConnection.connected){if(adsHistoryUi.layout==='periods')refreshAdsHistory();else refreshAdsManagement();}
}
function historyQuery(){return {baseDate:$('ads-history-base').value,bucketDays:Number($('ads-history-bucket').value||7)};}
function currentAdsHistory(){
 const q=historyQuery(),seller=mlConnection?.account?.id;
 return [...(state.adsReports??[]),...(state.adsHistory?[state.adsHistory]:[])].find(h=>h.baseDate===q.baseDate&&h.bucketDays===q.bucketDays&&(!seller||h.sellerId===seller)&&validAdsHistory(h))??null;
}
function renderAdsHistory(){
 if(!adsHistoryUi)return;
 const saved=state.adsHistory;if(!adsHistoryUi.initialized){$('ads-history-bucket').value=String(saved?.bucketDays??7);adsHistoryUi.initialized=true;}if(!$('ads-history-base').value)$('ads-history-base').value=saved?.baseDate??adsCurrentPeriod().dateTo;
 const q=historyQuery(),ranges=adsHistoryRanges(q.baseDate,q.bucketDays),metric=$('ads-history-metric').value||'cost',color=$('ads-history-color').value||'estimate';
 const latest=adsCurrentPeriod().dateTo,count=q.bucketDays===30?3:4,span=count*q.bucketDays;$('ads-history-base').max=latest;$('ads-history-base').min=new Date(Date.parse(latest)-(90-span)*86400000).toISOString().slice(0,10);
 const h=currentAdsHistory(),savedReports=(state.adsReports??[]).filter(r=>!mlConnection.account||r.sellerId===mlConnection.account.id).sort((a,b)=>b.baseDate.localeCompare(a.baseDate)||a.bucketDays-b.bucketDays);
 $('ads-saved-report').innerHTML='<option value="">Selecione um relatório salvo</option>'+savedReports.map(r=>'<option value="'+escapeHTML(adsReportKey(r))+'">'+adsDate(r.dateFrom)+' a '+adsDate(r.dateTo)+' · '+r.bucketDays+' dias por período · '+r.items.length+' anúncio(s)</option>').join('');
 $('ads-saved-report').disabled=!savedReports.length;$('ads-saved-report').value=h?adsReportKey(h):'';
 const needle=$('ads-history-query').value.trim().toLocaleLowerCase('pt-BR'),type=$('ads-history-search-type').value||'all',seen=new Set(),rows=[];
 for(const p of state.products){const link=p.mercadoLivre;if(!link||mlConnection.account&&link.sellerId!==mlConnection.account.id)continue;const key=link.sellerId+':'+link.itemId;if(seen.has(key))continue;seen.add(key);const history=h?.items.find(row=>row.itemId===link.itemId),skus=history?.total.skus??link.skus??[];const haystack=type==='sku'?skus.join(' '):type==='id'?link.itemId:type==='name'?p.name:[p.name,link.itemId,...skus].join(' ');if(needle&&!haystack.toLocaleLowerCase('pt-BR').includes(needle))continue;rows.push({product:p,history});}
 rows.sort((a,b)=>{const x=adsHistoryMetric(a.history?.total,a.product,state.fees,state.adsReconciliations??[],metric,a.history),y=adsHistoryMetric(b.history?.total,b.product,state.fees,state.adsReconciliations??[],metric,b.history);return x===null?y===null?a.product.name.localeCompare(b.product.name,'pt-BR'):1:y===null?-1:y-x;});
 adsHistoryUi.rows=rows;adsHistoryUi.ranges=ranges??[];adsHistoryUi.metric=metric;
 $('ads-history-apply').disabled=adsHistoryUi.busy;$('ads-history-apply').textContent=adsHistoryUi.busy?'Consultando…':'Filtrar';$('ads-history-export').disabled=!h||!rows.some(r=>r.history);
 $('ads-history-caption').textContent=ranges?ADS_HISTORY_METRICS[metric]+' · '+adsDate(ranges[0].dateFrom)+' a '+adsDate(ranges.at(-1).dateTo)+' · '+span+' dias.':'Escolha os filtros para comparar.';
 $('ads-history-legend').textContent=color==='metric'?'Azul acompanha a magnitude da métrica selecionada; em investimento, azul intenso significa maior gasto. Setas indicam variação, não recomendação.':'Azul acompanha '+(color==='actual'?'lucro apurado por conciliação':'lucro estimado das vendas diretas')+' em reais; maior lucro, azul mais intenso. Prejuízo é discreto; sem dados, fundo neutro.';
 if(!ranges){$('ads-history-head').innerHTML='';$('ads-history-body').innerHTML='';return;}
 const rangeHead=r=>'<span class="ads-h-date">'+adsDate(r.dateFrom)+'<br>'+adsDate(r.dateTo)+'</span>';
 $('ads-history-head').innerHTML='<tr><th scope="col" class="ads-h-ad">Anúncio / SKU</th><th scope="col" class="ads-h-account">Conta</th>'+ranges.map((r,i)=>'<th scope="col">'+(ranges.length-i)*q.bucketDays+' / '+(ranges.length-i-1)*q.bucketDays+' dias'+rangeHead(r)+'</th>').join('')+'<th scope="col" class="ads-h-total">Total · '+span+' dias'+rangeHead({dateFrom:ranges[0].dateFrom,dateTo:ranges.at(-1).dateTo})+'</th></tr>';
 const max=Math.max(0,...rows.flatMap(({product:p,history:row})=>row?[...row.periods,row.total].map(a=>Math.abs(adsHistoryMetric(a,p,state.fees,state.adsReconciliations??[],metric,row)??0)):[]));
 $('ads-history-body').innerHTML=rows.length?rows.map(({product:p,history:row})=>{
  const link=p.mercadoLivre,skus=row?.total.skus??link.skus??[],name=mlConnection.account?.id===link.sellerId?mlConnection.account.nickname:'Conta '+link.sellerId;
  const photo=link.thumbnail?'<img src="'+escapeHTML(link.thumbnail)+'" alt="" loading="lazy">':'<span class="ads-h-photo" aria-hidden="true">'+escapeHTML(p.name.slice(0,2).toUpperCase())+'</span>';
  return '<tr><td class="ads-h-ad"><div class="ads-h-product">'+photo+'<div><a href="'+escapeHTML(link.permalink)+'" target="_blank" rel="noopener noreferrer">'+link.itemId+' ↗</a><p>'+escapeHTML(p.name)+'</p><div class="ads-h-sku">SKU: '+escapeHTML(skus.length?skus.join(' · '):'não informado pela API')+'</div></div></div></td><td class="ads-h-account-label">'+escapeHTML(name)+'</td>'+ranges.map((r,i)=>adsHistoryCell(p,row?.periods[i],row?.periods[i-1],i,metric,color,max,row)).join('')+adsHistoryCell(p,row?.total,null,'total',metric,color,max,row)+'</tr>';
 }).join(''):'<tr><td colspan="'+(ranges.length+3)+'">'+(needle?'Nenhum produto cadastrado corresponde à busca. SKU usa o atributo SELLER_SKU do Mercado Livre.':'Vincule seus produtos na tela Meus produtos para consultar o comparativo.')+'</td></tr>';
 const known=rows.filter(row=>row.history).length;$('ads-history-count').textContent=rows.length+' anúncio(s) cadastrado(s) · '+known+' com comparativo carregado.';
 if(!h&&!adsHistoryUi.busy)$('ads-history-status').textContent='Sem dados suficientes para estes filtros. Clique em Filtrar para consultar todos os anúncios cadastrados da conta.';
}
function adsSalesBasisHTML(a){
 if(readyItemSales(a)){const s=a.sales;return '<p>Faturamento confirmado do anúncio: '+money(s.revenue)+' · '+number(s.orders)+' pedido(s) pago(s) verificado(s). Descontos dos produtos: '+money(s.discountRevenue)+'. Reembolsos confirmados excluídos: '+money(s.refundedRevenue)+'. Canceladas excluídas: '+money(s.cancelledRevenue)+'.</p>'+(s.notDeliveredPaidOrders?'<p>'+number(s.notDeliveredPaidOrders)+' pedido(s) não entregue(s) com pagamento confirmado: '+money(s.notDeliveredPaidRevenue)+' mantidos no faturamento. O estado da entrega não comprova reembolso.</p>':'')+(s.logisticsReview?'<p>A logística de '+number(s.logisticsReview)+' pedido(s) não pôde ser conferida; a receita acima segue os pagamentos.</p>':'')+'<p>Base do TACOS: produtos do próprio anúncio após descontos e reembolsos confirmados, pela data de criação da venda em São Paulo. Valores de cupons já incluídos no preço não são descontados outra vez. Frete, tarifas, impostos, bônus, cashback e vendas indiretas de outros produtos não são somados à receita.</p>';}
 const s=a.sales,pending=s?.source==='mercado-livre-orders-v2'?'Pendências: '+number(s.discountReview)+' desconto(s), '+number(s.refundReview)+' reembolso(s) parcial(is) e '+number(s.financialReview)+' pagamento(s). Não há rateio estimado de reembolso entre produtos.':s?.source==='mercado-livre-orders-v1'?'Atualize o comparativo para conferir descontos e reembolsos pela nova base.':null;
 const reason=pending??(a.salesIssue==='permission'?'A conexão ainda não permite consultar os pedidos. Habilite Vendas em Leitura e conecte novamente.':a.salesIssue==='limit'?'A consulta de vendas atingiu o limite por operação; atualize o comparativo.':'Atualize o comparativo para consultar os pedidos do anúncio.');
 return '<p>TACOS: sem dados suficientes de faturamento. '+reason+'</p>';
}
async function fetchItemSalesPages(a,active=()=>true){
 const parts=[],seen=new Set();let offset=0,total=null;
 for(let count=0;count<1000;count++){
  if(!active())throw Error('Consulta interrompida porque os filtros ou a conta mudaram.');
  const data=await mlRequest('sales',{query:{id:a.itemId,from:a.dateFrom,to:a.dateTo,offset,...(total===null?{}:{total})}}),p=data.page;
  if(!active())throw Error('Consulta interrompida porque os filtros ou a conta mudaram.');
  if(!validItemSales(data.sales,a,true)||data.sales.source!=='mercado-livre-orders-v2'||!p||p.offset!==offset||!Number.isSafeInteger(p.total)||p.total<0||!Number.isSafeInteger(p.count)||p.count<0||p.count>10||offset+p.count>p.total||total!==null&&p.total!==total||!Array.isArray(p.keys)||p.keys.length!==p.count||p.keys.some(k=>typeof k!=='string'||!/^[a-f0-9]{64}$/.test(k)||seen.has(k))||new Set(p.keys).size!==p.keys.length||p.nextOffset!==(offset+p.count===p.total?null:offset+p.count)||p.nextOffset!==null&&p.count===0||data.sales.complete!==(offset===0&&p.nextOffset===null))throw Error('A consulta de vendas veio incompleta ou mudou durante a paginação.');
  p.keys.forEach(k=>seen.add(k));parts.push(data.sales);total=p.total;
  if(p.nextOffset===null)return combineItemSales(parts);offset=p.nextOffset;
 }
 throw Error('A consulta de vendas atingiu o limite; nenhuma soma parcial foi utilizada.');
}
function adsHistoryCell(p,a,previous,index,metric,color,max,history){
 const value=adsHistoryMetric(a,p,state.fees,state.adsReconciliations??[],metric,history),profit=adsHistoryMetric(a,p,state.fees,state.adsReconciliations??[],color==='actual'?'actual':'estimate',history);
 const strength=color==='metric'?Number.isFinite(value)&&max>0?.04+.42*Math.abs(value)/max:.025:adsBlueStrength(profit),known=a&&a.status!=='no-ad'&&a.periodsComplete!==false;
 const trend=adsTrend(value,adsHistoryMetric(previous,p,state.fees,state.adsReconciliations??[],metric)),tacos=adsHistoryMetric(a,p,state.fees,state.adsReconciliations??[],'tacos');
 const eligible=known&&a.breakdownComplete&&(a.cost>0||a.revenue>0||a.clicks>0);
 return '<td class="ads-h-cell '+(color==='metric'?Number.isFinite(value)?'':'is-empty':Number.isFinite(profit)?'':'is-empty')+'" style="--cell-blue:'+strength+'"><div class="ads-h-main"><strong>'+(value===null?'Sem dados suficientes':adsHistoryNumber(value,metric))+'</strong><span title="'+escapeHTML(trend.label)+'" aria-label="'+escapeHTML(trend.label)+'">'+trend.arrow+'</span></div>'+(known?'<small>Receita Ads: '+money(a.revenue)+'</small><small>ACOS: '+adsHistoryNumber(a.acos,'acos')+'</small><small>ROAS: '+adsHistoryNumber(a.roas,'roas')+'</small><small>TACOS: '+adsHistoryNumber(tacos,'tacos')+'</small>'+(!readyItemSales(a)?'<small>Faturamento: sem dados suficientes</small>':'<small>Vendas confirmadas: '+money(a.sales.revenue)+'</small>')+'<small>Lucro est. direto: '+adsHistoryNumber(adsHistoryMetric(a,p,state.fees,state.adsReconciliations??[],'estimate'),'estimate')+'</small><details><summary>Diretas / indiretas e base</summary><p>Diretas: '+(a.breakdownComplete?money(a.directRevenue)+' · '+number(a.directSales)+' venda(s) · '+number(a.directUnits)+' unidade(s)':'sem dados suficientes')+'.</p><p>Indiretas: '+(a.breakdownComplete?money(a.indirectRevenue)+' · '+number(a.indirectSales)+' venda(s) · '+number(a.indirectUnits)+' unidade(s)':'sem dados suficientes')+'.</p><p>Receita orgânica: '+(a.organicRevenue===null||a.organicRevenue===undefined?'sem dados suficientes':money(a.organicRevenue))+'.</p>'+adsSalesBasisHTML(a)+'<p>Lucro apurado: '+adsHistoryNumber(adsHistoryMetric(a,p,state.fees,state.adsReconciliations??[],'actual',history),'actual')+'. Sem conciliação válida, não é apurado.</p><p>Consulta: '+escapeHTML(new Date(a.fetchedAt).toLocaleString('pt-BR'))+'.</p><p>Dados da API; atribuição de 14 dias. Custos da estimativa são os atuais do cadastro. O total recalcula as razões.</p></details>'+(!eligible?'<small>Sem dados suficientes para retorno / lucro.</small>':''):'<small>Sem dados suficientes</small>')+'<button type="button" data-history-reconcile="'+escapeHTML(p.id)+'" data-history-index="'+index+'" '+(eligible?'':'disabled')+'>Conciliar período</button></td>';
}
async function refreshAdsHistory(force=false){
 if(adsHistoryUi.busy)return;if(!mlConnection.connected){await connectMercadoLivre();return;}
 const q=historyQuery(),ranges=adsHistoryRanges(q.baseDate,q.bucketDays);if(!ranges){$('ads-history-status').textContent='Escolha filtros válidos.';return;}
 const archived=currentAdsHistory(),latestAvailable=adsCurrentPeriod().dateTo;
 if(!force&&archived&&ranges[0].dateFrom<new Date(Date.parse(latestAvailable)-89*86400000).toISOString().slice(0,10)){renderAdsHistory();$('ads-history-status').textContent='Relatório salvo disponível para leitura. Novas consultas à API aceitam apenas os últimos 90 dias.';return;}
 const latest=adsCurrentPeriod().dateTo;if(q.baseDate>latest||ranges[0].dateFrom<new Date(Date.parse(latest)-89*86400000).toISOString().slice(0,10)){$('ads-history-status').textContent='Use somente dias encerrados dos últimos 90 dias disponíveis.';return;}
 const seller=mlConnection.account.id,epoch=++adsHistoryUi.epoch,connectionEpoch=mlAdsEpoch;
 const ids=[...new Set(state.products.filter(p=>p.mercadoLivre?.sellerId===seller).map(p=>p.mercadoLivre.itemId))];
 const old=currentAdsHistory(),matches=validAdsHistory(old)&&old.sellerId===seller&&old.baseDate===q.baseDate&&old.bucketDays===q.bucketDays;
 if(!force&&matches&&ids.every(id=>old.items.some(row=>row.itemId===id&&Date.now()-Date.parse(row.total.fetchedAt)<600000))){renderAdsHistory();$('ads-history-status').textContent='Comparativo salvo em '+new Date(old.fetchedAt).toLocaleString('pt-BR')+'. Use Filtrar para atualizar.';return;}
 if(!ids.length){renderAdsHistory();$('ads-history-status').textContent='Nenhum anúncio cadastrado está vinculado à conta conectada.';return;}
 const active=()=>mlConnection.connected&&mlConnection.account?.id===seller&&mlAdsEpoch===connectionEpoch&&adsHistoryUi.epoch===epoch&&JSON.stringify(historyQuery())===JSON.stringify(q);
 adsHistoryUi.busy=true;renderAdsDashboard();let loaded=0,error='';
 try{
  for(let i=0;i<ids.length;i+=2){
   if(!active())break;$('ads-history-status').textContent='Consultando períodos: '+Math.min(i+2,ids.length)+' de '+ids.length+' anúncios…';
   try{const batch=ids.slice(i,i+2),h=(await mlRequest('ads-history',{method:'POST',body:{...q,itemIds:batch,includeSales:false}})).history;
    if(!active())break;if(!validAdsHistory(h)||h.sellerId!==seller||h.baseDate!==q.baseDate||h.bucketDays!==q.bucketDays||h.items.length!==batch.length||h.items.some(row=>!batch.includes(row.itemId)))throw Error('O comparativo veio incompleto ou não corresponde aos filtros.');
    let salesFailure=null;for(const row of h.items){
     for(const a of row.periods){
      if(!active())break;$('ads-history-status').textContent='Conferindo descontos e pagamentos: '+row.itemId+' · '+a.dateFrom+' a '+a.dateTo+'…';
      if(salesFailure){a.salesIssue=salesFailure;continue;}
      try{a.sales=await fetchItemSalesPages(a,active);delete a.salesIssue;}catch(e){a.salesIssue=[401,403].includes(e.status)?'permission':'failed';if([401,403,429].includes(e.status))salesFailure=a.salesIssue;}
     }
     delete row.total.sales;delete row.total.salesIssue;
     if(row.periods.every(a=>a.sales))row.total.sales=combineItemSales(row.periods.map(a=>a.sales));else row.total.salesIssue=row.periods.find(a=>a.salesIssue)?.salesIssue??'failed';
    }
    if(!active())break;if(!validAdsHistory(h))throw Error('O faturamento não conciliou com os períodos consultados.');
    const prior=state.adsHistory,keep=validAdsHistory(prior)&&prior.sellerId===seller&&prior.baseDate===q.baseDate&&prior.bucketDays===q.bucketDays?prior.items.filter(row=>!batch.includes(row.itemId)):[];
    state.adsHistory=copyAdsHistory({...h,items:[...keep,...h.items]});loaded+=h.items.length;persist();renderAdsHistory();
   }catch(e){error=e.message;break;}
  }
  if(active())$('ads-history-status').textContent=loaded+' anúncio(s) atualizado(s). '+(error?'Consulta parcial: '+error+' As células sem consulta não foram preenchidas com zero.':'Valores consultados por período; os indicadores do total foram recalculados. Os filtros não alteram a precificação.');
 }finally{adsHistoryUi.busy=false;renderAdsDashboard();if(!active()&&mlConnection.connected)$('ads-history-status').textContent='Filtros alterados. Clique em Filtrar para consultar a nova seleção.';if(!mlConnection.connected)$('ads-history-status').textContent='Conecte a conta novamente para consultar os períodos.';}
}
$('ads-layout-periods').onclick=()=>adsSetLayout('periods');$('ads-layout-cards').onclick=()=>adsSetLayout('cards');
$('ads-history-filter').onsubmit=e=>{e.preventDefault();refreshAdsHistory(true);};
$('ads-saved-report').onchange=e=>{
 const report=(state.adsReports??[]).find(r=>adsReportKey(r)===e.target.value&&(!mlConnection.account||r.sellerId===mlConnection.account.id));if(!report)return;
 adsHistoryUi.epoch++;adsHistoryUi.initialized=true;state.adsHistory=copyAdsHistory(report);$('ads-history-base').value=report.baseDate;$('ads-history-bucket').value=String(report.bucketDays);persist();renderAdsHistory();$('ads-history-status').textContent='Relatório salvo carregado. Última consulta: '+new Date(report.fetchedAt).toLocaleString('pt-BR')+'. Novas consultas à API continuam limitadas aos últimos 90 dias.';
};
for(const id of ['ads-history-metric','ads-history-color','ads-history-search-type','ads-history-query'])$(id).oninput=()=>renderAdsHistory();
for(const id of ['ads-history-base','ads-history-bucket'])$(id).onchange=()=>{adsHistoryUi.epoch++;renderAdsHistory();};
$('ads-history-body').onclick=e=>{const button=e.target.closest('button[data-history-reconcile]');if(!button)return;const p=state.products.find(p=>p.id===button.dataset.historyReconcile),row=currentAdsHistory()?.items.find(row=>row.itemId===p?.mercadoLivre?.itemId),a=button.dataset.historyIndex==='total'?row?.total:row?.periods[Number(button.dataset.historyIndex)];if(a)openAdsReconciliation(p.id,a);};
$('ads-history-export').onclick=()=>{const rows=adsHistoryUi.rows.filter(row=>row.history);if(!rows.length)return;const text=adsHistoryCsv(rows,adsHistoryUi.ranges,adsHistoryUi.metric,state.fees,state.adsReconciliations??[]),url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'})),link=document.createElement('a');link.href=url;link.download='ads-comparativo-'+$('ads-history-base').value+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};

function renderAdsDashboard(){
 if(!adsUi)return;
 const seller=mlConnection?.account?.id??null,d=adsManagementData(state,seller),a=d.account,grid=$('ads-products-grid');
 $('ads-period').textContent='Últimos 30 dias encerrados · '+adsDate(d.period.dateFrom)+' a '+adsDate(d.period.dateTo);
 const refreshing=adsUi.busy||adsHistoryUi.busy;$('ads-refresh').disabled=refreshing;$('ads-refresh').textContent=mlConnection.connected?(refreshing?'Atualizando…':'Atualizar dados de Ads'):'Conectar Mercado Livre';
 $('ads-account-metrics').innerHTML=adsMetricsHTML(a);
 $('ads-account-scope').textContent=a?`${a.advertiserName} · ${a.campaignCount} campanha(s) · consultado em ${new Date(a.fetchedAt).toLocaleString('pt-BR')}. Inclui produtos fora deste catálogo.`:adsUi.accountError||'Resumo oficial do anunciante: conecte a conta e atualize os dados. Os números dos produtos abaixo têm escopo próprio.';
 const accountDetail=a?.metricsVersion===2&&a.breakdownComplete;
 $('ads-account-breakdown').innerHTML=accountDetail?'<span>Receita direta <strong>'+money(a.directRevenue)+'</strong> · '+number(a.directSales)+' venda(s) / '+number(a.directUnits)+' unidade(s)</span><span>Receita indireta <strong>'+money(a.indirectRevenue)+'</strong> · '+number(a.indirectSales)+' venda(s) / '+number(a.indirectUnits)+' unidade(s)</span>': '<span>Separação direta / indireta: sem dados suficientes.</span>';
 const advertisers=adsUi.advertisers.length?adsUi.advertisers:a?[{id:a.advertiserId,name:a.advertiserName}]:[];
 $('ads-advertiser-label').classList.toggle('hidden',advertisers.length<2);
 $('ads-advertiser').innerHTML='<option value="">Selecione o anunciante</option>'+advertisers.map(v=>'<option value="'+v.id+'">'+escapeHTML(v.name)+' · '+v.id+'</option>').join('');
 $('ads-advertiser').value=String(adsUi.selectedAdvertiser??a?.advertiserId??'');
 const scope=$('ads-projection-scope').value||'products',base=scope==='account'?a:{...d.totals,metricsVersion:2,breakdownComplete:d.measured.length>0&&d.totals.directRevenue!==null};
 if(!adsUi.budgetTouched)$('ads-daily-budget').value=base?String(Math.round(base.cost/30*100)/100):'';
 const rawBudget=$('ads-daily-budget').value,budget=rawBudget===''?NaN:Number(rawBudget),horizon=Number($('ads-horizon').value||30),projection=adsProjection(base,budget,horizon);
 const projected=projection?.revenue!==null&&projection?.revenue!==undefined;
 $('ads-projection').innerHTML=adsMetric('Investimento no cenário',projection?money(projection.spend):'Informe um orçamento',horizon+' dias',!projection)+adsMetric('Receita atribuída projetada',projected?money(projection.revenue):'Sem dados suficientes','Mantendo o ROAS histórico',!projected)+adsMetric('Cliques projetados',projected?number(projection.clicks,0):'—','Mantendo o CPC histórico',!projected)+adsMetric('Unidades diretas / indiretas',projected?number(projection.directUnits,1)+' / '+number(projection.indirectUnits,1):'—','Unidades, não pedidos únicos',!projected);
 $('ads-projection-note').textContent=!projection?'Informe um investimento diário válido.':!projected?'Sem dados suficientes para projetar retorno: é necessário histórico de investimento, cliques e receita, com separação direta / indireta.':'Base: '+(scope==='account'?'anunciante selecionado':'produtos cadastrados')+'. CPC '+money(projection.cpc)+' · ROAS '+number(projection.roas,2)+'x. Unidades por clique mantidas. O desempenho pode mudar com orçamento, preços e concorrência; não há promessa de lucro.';
 $('ads-products-metrics').innerHTML=adsMetric('Gasto dos cadastrados',d.measured.length?money(d.totals.cost):'Sem dados suficientes','Sem duplicar anúncios vinculados',!d.measured.length)+adsMetric('Média por anúncio consultado',d.measured.length?money(d.totals.cost/d.measured.length):'—',d.measured.length+' anúncio(s) com consulta do período',!d.measured.length)+adsMetric('Lucro estimado · diretas',d.estimate===null?'Sem dados suficientes':money(d.estimate),d.estimatedCount+' anúncio(s) com estimativa; custos atuais',d.estimate===null)+adsMetric('Lucro apurado · conciliado',d.actual===null?'Sem dados suficientes':money(d.actual),d.actualCount+' de '+d.measured.length+' anúncio(s) conciliado(s); total parcial',d.actual===null);
 const ready=d.measured.filter(p=>adsHistoryReady(p.mlAds)).length,linked=d.products.filter(p=>p.mercadoLivre).length;
 $('ads-coverage').textContent=`${linked} anúncio(s) único(s) vinculado(s) · ${d.measured.length} consulta(s) do período · ${ready} com histórico para projeção. Cadastrados e total do anunciante são escopos diferentes.`;
 const query=$('ads-search').value.trim().toLocaleLowerCase('pt-BR'),basis=$('ads-color-basis').value||'estimate',sort=$('ads-sort').value||'spend';
 const value=p=>{if(seller!==null&&p.mercadoLivre?.sellerId!==seller||!adsMeasured(p,d.period))return null;return basis==='actual'?adsReconciled(p,state.adsReconciliations??[])?.profit??null:estimateProductAds(p,state.fees)?.profit??null;};
 const products=d.products.filter(p=>(p.name+' '+(p.mercadoLivre?.itemId??'')).toLocaleLowerCase('pt-BR').includes(query)).sort((x,y)=>sort==='name'?x.name.localeCompare(y.name,'pt-BR'):sort==='profit'?(value(y)??-Infinity)-(value(x)??-Infinity):(adsMeasured(y,d.period)?y.mlAds.cost:-1)-(adsMeasured(x,d.period)?x.mlAds.cost:-1));
 grid.innerHTML=products.length?products.map((p,index)=>adsProductTile(p,index,d,{basis,projection,scope,seller})).join(''):'<p class="ads-missing">'+(state.products.length?'Nenhum produto corresponde à busca.':'Cadastre e vincule seus produtos na tela Meus produtos para acompanhar a publicidade.')+'</p>';renderAdsHistory();
}
function adsProductTile(p,index,d,{basis,projection,scope,seller}){
 const a=p.mlAds,sameSeller=seller===null||p.mercadoLivre?.sellerId===seller,measured=sameSeller&&adsMeasured(p,d.period),detailed=measured&&a.metricsVersion===2&&a.breakdownComplete;
 const active=measured&&(a.cost>0||a.clicks>0||a.revenue>0),estimate=active?estimateProductAds(p,state.fees):null,actual=active?adsReconciled(p,state.adsReconciliations??[]):null;
 const profit=basis==='actual'?actual?.profit:estimate?.profit,strength=adsBlueStrength(profit);
 let missing=!p.mercadoLivre?'Vincule um anúncio na tela Meus produtos.':!sameSeller?'Este anúncio pertence a outra conta.':!measured?'Atualize a consulta para o período atual.':!active?'Não houve atividade atribuída no período. Isso não define o custo da publicidade futura.':!detailed?'Atualize para obter receitas, vendas e unidades diretas e indiretas.':'';
 const noData='Sem dados suficientes',r=detailed?a:null,ratio=measured&&a.cost>0?a.revenue/a.cost:null,cpc=measured&&a.clicks>0?a.cost/a.clicks:null;
 const duplicate=state.products.filter(row=>p.mercadoLivre&&row.mercadoLivre?.itemId===p.mercadoLivre.itemId&&row.mercadoLivre.sellerId===p.mercadoLivre.sellerId).length;
 const old=state.adsReconciliations?.find(r=>r.sellerId===a?.sellerId&&r.itemId===a?.itemId&&r.dateFrom===a?.dateFrom&&r.dateTo===a?.dateTo);
 let forecast='';
 if(scope==='products'&&projection?.revenue!==null&&projection&&estimate&&d.totals.cost>0){const spend=projection.spend*a.cost/d.totals.cost,factor=a.cost>0?spend/a.cost:0;forecast='<div class="ads-forecast-mini">No cenário: investimento '+money(spend)+' · lucro estimado das diretas '+money(estimate.profit*factor)+'. Distribuição histórica entre os cadastrados.</div>';}
 return `<article class="ads-product-card ${Number.isFinite(profit)?'':'is-missing'}" style="--ads-strength:${strength}" aria-label="Publicidade de ${escapeHTML(p.name)}"><div class="ads-tile-heading"><div><h3>${escapeHTML(p.name)}</h3>${p.mercadoLivre?'<a href="'+escapeHTML(p.mercadoLivre.permalink)+'" target="_blank" rel="noopener noreferrer">'+p.mercadoLivre.itemId+' ↗</a>':'<span class="ads-missing">Sem anúncio vinculado</span>'}</div><span class="ads-tile-index">${String(index+1).padStart(2,'0')}</span></div><div class="ads-data-tag">${measured?'Consultado pela API · atribuição atualizável':'Histórico pendente'}${duplicate>1?' · '+duplicate+' cadastros compartilham este anúncio':''}</div><div class="ads-spend-line"><div><small>Investimento no período</small><strong>${measured?money(a.cost):'—'}</strong></div><span>ROAS ${ratio===null?'—':number(ratio,2)+'x'}<br>CPC ${cpc===null?'—':money(cpc)}</span></div><div class="ads-tile-sales"><div><small>Vendas diretas · receita</small><strong>${r?money(r.directRevenue):'—'}</strong><span>${r?number(r.directSales)+' venda(s) · '+number(r.directUnits)+' unidade(s)':noData}</span></div><div><small>Vendas indiretas · receita</small><strong>${r?money(r.indirectRevenue):'—'}</strong><span>${r?number(r.indirectSales)+' venda(s) · '+number(r.indirectUnits)+' unidade(s)':noData}</span></div></div>${missing?'<p class="ads-tile-note">'+noData+'. '+escapeHTML(missing)+'</p>':''}<div class="ads-financial-pair"><div class="ads-tile-financial"><small>Estimativa · vendas diretas</small><strong>${estimate?money(estimate.profit):noData}</strong><span>Custos atuais · Ads descontado uma vez.</span></div><div class="ads-tile-financial is-actual"><small>Apurado · conciliado</small><strong>${actual?money(actual.profit):noData}</strong><span>${actual?'Conciliação manual · '+(actual.record.scope==='direct'?'somente diretas':'diretas e indiretas')+' · '+adsDate(actual.record.savedAt.slice(0,10)):old?'A evidência de Ads mudou. Revise a conciliação.':'Requer conciliação dos custos efetivos.'}</span></div></div><p class="ads-tile-note">Cor pela ${basis==='actual'?'apuração conciliada':'estimativa das diretas'} em reais.${Number.isFinite(profit)&&profit<0?' Resultado negativo.':''}</p><div class="ads-tile-mini"><span>Ads na precificação<strong>${number(adsRate(p,'ml'))}%</strong></span><span>ACOS consultado<strong>${measured&&a.acos!==null?number(a.acos,2)+'%':'—'}</strong></span></div><details><summary>Ver base e critério</summary><p>${estimate?escapeHTML(estimate.criterion):noData+' para estimar lucro.'}</p><p>Receita indireta pode corresponder a outros produtos; seus custos não são presumidos. Janela de atribuição: 14 dias.</p>${actual?'<p>Fonte e distribuição: '+escapeHTML(actual.record.notes)+'</p><p>Receita conciliada '+money(actual.revenue)+' − despesas '+money(actual.expenses)+' − Ads '+money(actual.ads)+' = '+money(actual.profit)+'.</p>':''}${a?'<p>Última consulta: '+escapeHTML(new Date(a.fetchedAt).toLocaleString('pt-BR'))+'.</p>':''}${forecast}</details><button type="button" class="btn quiet" data-ads-reconcile="${escapeHTML(p.id)}" ${active&&detailed?'':'disabled'}>${actual?'Revisar conciliação':'Conciliar lucro apurado'}</button></article>`;
}
async function refreshAdsManagement(force=false,accountOnly=false){
 if(adsUi.busy)return;if(!mlConnection.connected){await connectMercadoLivre();return;}
 const seller=mlConnection.account.id,epoch=mlAdsEpoch;adsUi.busy=true;renderAdsDashboard();$('ads-management-status').textContent='Consultando os dados oficiais. As tarifas e o frete da precificação continuam automáticos.';
 try{
  if(!accountOnly)await refreshRegisteredAds(force);
  if(!mlConnection.connected||mlConnection.account?.id!==seller||mlAdsEpoch!==epoch)return;
  const old=state.adsAccount,current=adsCurrentPeriod(),selected=adsUi.selectedAdvertiser;
  const fresh=validAdsAccount(old)&&old.aggregation==='all-campaign-pages'&&old.sellerId===seller&&(!selected||selected===old.advertiserId)&&old.dateTo===current.dateTo&&Date.now()-Date.parse(old.fetchedAt)<600000;
  if(force||!fresh){
   const response=await mlRequest('ads-account',{method:'POST',body:selected?{advertiserId:selected}:{}});
   if(!mlConnection.connected||mlConnection.account?.id!==seller||mlAdsEpoch!==epoch)return;
   if(!Array.isArray(response.advertisers)||!response.advertisers.every(v=>Number.isSafeInteger(v.id)&&v.id>0&&typeof v.name==='string'&&v.name.length<=120))throw Error('Lista de anunciantes inválida.');
   adsUi.advertisers=response.advertisers;
   if(response.selectionRequired){adsUi.accountError='Há mais de um anunciante disponível. Escolha o anunciante para consultar o total; contas delegadas não são somadas.';}
   else{if(!validAdsAccount(response.summary)||response.summary.sellerId!==seller)throw Error('Resumo do anunciante inválido.');state.adsAccount=copyAdsAccount(response.summary);adsUi.selectedAdvertiser=response.summary.advertiserId;adsUi.accountError='';persist();}
  }
  $('ads-management-status').textContent=adsUi.accountError||'Consulta concluída. Gastos e atribuição vêm da API; projeções e conciliações têm identificação própria. Confira eventuais avisos de histórico nos cartões.';
 }catch(error){adsUi.accountError=error.message;$('ads-management-status').textContent=error.message+' Os dados anteriores foram preservados; a data da consulta permanece visível.';}
 finally{adsUi.busy=false;if(!mlConnection.connected)$('ads-management-status').textContent='Conecte a conta para atualizar os dados. As consultas anteriores continuam identificadas pela data.';renderAdsDashboard();}
}
function openAdsReconciliation(id,snapshot=null){
 const p=state.products.find(p=>p.id===id),a=snapshot??p?.mlAds;if(!p||!a||!validProductAds({...p,mlAds:a})||a.status==='no-ad'||!a.breakdownComplete||a.metricsVersion!==2){toast('Sem dados suficientes. Atualize a consulta de Ads.');return;}
 adsUi.reconcileProduct=id;adsUi.reconcileFromHistory=Boolean(snapshot);adsUi.reconcileContext=copyProductAds(a);adsUi.reconcileBasis=adsEvidenceKey(a);const form=$('ads-reconcile-form');form.reset();
 const old=state.adsReconciliations?.find(r=>r.sellerId===a.sellerId&&r.itemId===a.itemId&&r.dateFrom===a.dateFrom&&r.dateTo===a.dateTo);
 form.elements.scope.value=old?.scope??'direct';for(const k of ADS_RECONCILE_FIELDS)form.elements[k].value=old?String(old[k]):'';form.elements.notes.value=old?.notes??'';form.elements.confirmed.checked=false;
 $('ads-reconcile-context').textContent=p.name+' · '+adsDate(a.dateFrom)+' a '+adsDate(a.dateTo);$('ads-reconcile-spend').textContent=money(a.cost);$('ads-reconcile-error').textContent='';$('ads-reconcile-dialog').showModal();
}
$('ads-refresh').onclick=()=>adsHistoryUi.layout==='periods'?refreshAdsHistory(true):refreshAdsManagement(true);
$('ads-advertiser').onchange=e=>{adsUi.selectedAdvertiser=e.target.value?Number(e.target.value):null;refreshAdsManagement(true,true);};
for(const id of ['ads-search','ads-color-basis','ads-sort','ads-projection-scope','ads-horizon'])$(id).oninput=()=>renderAdsDashboard();
$('ads-projection-scope').onchange=()=>{adsUi.budgetTouched=false;renderAdsDashboard();};
$('ads-daily-budget').oninput=()=>{adsUi.budgetTouched=true;renderAdsDashboard();};
$('ads-products-grid').onclick=e=>{const button=e.target.closest('button[data-ads-reconcile]');if(button)openAdsReconciliation(button.dataset.adsReconcile);};
$('ads-reconcile-close').onclick=$('ads-reconcile-cancel').onclick=()=>$('ads-reconcile-dialog').close();
$('ads-reconcile-form').onsubmit=e=>{
 e.preventDefault();const form=e.target,p=state.products.find(p=>p.id===adsUi.reconcileProduct),context=adsUi.reconcileContext,row=currentAdsHistory()?.items.find(r=>r.itemId===p?.mercadoLivre?.itemId),a=adsUi.reconcileFromHistory?[...(row?.periods??[]),row?.total].find(a=>a?.dateFrom===context?.dateFrom&&a?.dateTo===context?.dateTo):p?.mlAds;
 if(!p||!a||!validProductAds({...p,mlAds:a})||adsEvidenceKey(a)!==adsUi.reconcileBasis){$('ads-reconcile-error').textContent='Os dados de Ads mudaram. Feche e abra a conciliação para conferir novamente.';return;}
 const r={source:'manual-reconciliation',itemId:a.itemId,sellerId:a.sellerId,dateFrom:a.dateFrom,dateTo:a.dateTo,scope:form.elements.scope.value,basis:adsEvidenceKey(a),notes:form.elements.notes.value.trim(),savedAt:new Date().toISOString(),...Object.fromEntries(ADS_RECONCILE_FIELDS.map(k=>[k,form.elements[k].value===''?NaN:Number(form.elements[k].value)]))};
 if(!form.elements.confirmed.checked||!validAdsReconciliation(r)){$('ads-reconcile-error').textContent='Preencha e confirme todos os valores efetivos, inclusive zero quando conferido, e informe a fonte da conciliação.';return;}
 state.adsReconciliations=(state.adsReconciliations??[]).filter(old=>!(old.sellerId===r.sellerId&&old.itemId===r.itemId&&old.dateFrom===r.dateFrom&&old.dateTo===r.dateTo));state.adsReconciliations.push(copyAdsReconciliation(r));persist();renderAdsDashboard();$('ads-reconcile-dialog').close();toast('Conciliação salva. O gasto de Ads foi descontado uma única vez.');
};

let mlAdsBusy=false,mlAdsEpoch=0;
function savedAdsPricingInput(p){return {itemId:p.mercadoLivre.itemId,cost:p.cost,extra:p.extra,margin:p.margin,weight:p.weight,mlShipping:p.mlShipping??0,ads:adsRate(p,'ml'),tax:(p.feeSnapshot??state.fees).ml.tax,...(p.mlPricing?.inputs.autoShipping?{autoShipping:true}:{})};}
function applyProductAds(product,advertising,row){
 const snapshot={...row,...Object.fromEntries(['source','sellerId','currency','dateFrom','dateTo','fetchedAt'].map(k=>[k,advertising[k]]))};
 if(!validProductAds({...product,mlAds:snapshot}))throw Error('Os dados de Ads não correspondem ao produto ou ao período consultado.');
 product.mlAds=copyProductAds(snapshot);
 if(snapshot.status==='ready')product.adsMl=snapshot.appliedRate;
}
async function refreshRegisteredAds(force=false){
 if(mlAdsBusy||!mlConnection.connected)return;
 if($('product-dialog').open||globalThis.ConduzMlImport?.isOpen()){$('ml-ads-status').textContent='Salve ou feche o cadastro ou a revisão do catálogo para atualizar Ads.';return;}
 const sellerId=mlConnection.account?.id,epoch=mlAdsEpoch,now=Date.now();
 const ids=[...new Set(state.products.filter(p=>p.mercadoLivre?.sellerId===sellerId&&(force||!p.mlAds||p.mlAds.metricsVersion!==2||p.mlAds.dateTo!==adsCurrentPeriod(now).dateTo||now-Date.parse(p.mlAds.fetchedAt)>600000)).map(p=>p.mercadoLivre.itemId))];
 if(!ids.length)return;
 mlAdsBusy=true;$('ml-refresh-ads').disabled=true;let updated=0,unavailable=0,quoteFailures=0,skipped=0,errorMessage='';
 const active=()=>mlConnection.connected&&mlConnection.account?.id===sellerId&&mlAdsEpoch===epoch;
 try{
  for(let i=0;i<ids.length;i+=5){
   if(!active())break;
   $('ml-ads-status').textContent=`Consultando Product Ads: ${Math.min(i+5,ids.length)} de ${ids.length} anúncio(s). Período: últimos 30 dias encerrados…`;
   const batch=ids.slice(i,i+5);
   let advertising;
   try{
    advertising=(await mlRequest('ads',{method:'POST',body:{itemIds:batch}})).advertising;
    if(!active())break;
    if(!advertising||advertising.sellerId!==sellerId||!Array.isArray(advertising.items)||advertising.items.length!==batch.length||new Set(advertising.items.map(r=>r.itemId)).size!==batch.length||advertising.items.some(r=>!batch.includes(r.itemId)))throw Error('A resposta de Product Ads está incompleta.');
    // Valida o lote inteiro antes de alterar qualquer cadastro.
    for(const row of advertising.items){const linked=state.products.find(p=>p.mercadoLivre?.sellerId===sellerId&&p.mercadoLivre.itemId===row.itemId);if(linked&&!validProductAds({...linked,mlAds:{...row,...Object.fromEntries(['source','sellerId','currency','dateFrom','dateTo','fetchedAt'].map(k=>[k,advertising[k]]))}}))throw Error('O Mercado Livre retornou métricas inválidas.');}
   }catch(error){errorMessage=error.message;unavailable+=batch.length;break;}
   const repricing=[];
   for(const row of advertising.items){
    const products=state.products.filter(p=>p.mercadoLivre?.sellerId===sellerId&&p.mercadoLivre.itemId===row.itemId);
    for(const p of products){
     if($('product-dialog').open||globalThis.ConduzMlImport?.isOpen()){skipped++;continue;}
     const oldRate=adsRate(p,'ml');applyProductAds(p,advertising,row);
     if(row.status==='ready'){updated++;if(p.mlPricing&&(oldRate!==adsRate(p,'ml')||!pricingMatches(p.mlPricing,savedAdsPricingInput(p))))repricing.push(p.id);}else unavailable++;
    }
   }
   persist();render();
   for(const id of repricing){
    if(!active()||$('product-dialog').open||globalThis.ConduzMlImport?.isOpen())break;
    const p=state.products.find(p=>p.id===id);if(!p||p.mercadoLivre?.sellerId!==sellerId)continue;
    const input=savedAdsPricingInput(p),key=JSON.stringify(input);
    try{
     const response=await mlRequest('pricing',{method:'POST',body:input});
     if(!active()||$('product-dialog').open||globalThis.ConduzMlImport?.isOpen())break;
     const current=state.products.find(p=>p.id===id);
     if(!current?.mercadoLivre||JSON.stringify(savedAdsPricingInput(current))!==key)continue;
     const expected={...input,...(input.autoShipping?{mlShipping:response.pricing?.inputs?.mlShipping}:{})};
     if(!pricingMatches(response.pricing,expected))throw Error('Cotação diferente dos dados atuais.');
     current.mlPricing=copyOfficialPricing(response.pricing);
     if(input.autoShipping){current.mlShipping=current.mlPricing.inputs.mlShipping;if(current.mlPricing.shippingQuote)current.mercadoLivre.shippingQuote=copyShippingQuote(current.mlPricing.shippingQuote);}
     persist();render();
    }catch{quoteFailures++;}
   }
  }
  if(active())$('ml-ads-status').textContent=`Product Ads: ${updated} cadastro(s) com Ads atualizado pelo ACOS real. ${unavailable?unavailable+' sem ACOS aplicável ou consulta disponível; Ads anterior preservado. ':''}${skipped?skipped+' preservado(s) enquanto o formulário está aberto. ':''}${quoteFailures?quoteFailures+' cotação(ões) pendente(s); clique em Atualizar Ads para tentar novamente. ':''}${errorMessage?' '+errorMessage:'Período e investimento aparecem no cartão da modalidade vinculada. Receita atribuída pode mudar nos dias seguintes.'}`;
 }finally{mlAdsBusy=false;$('ml-refresh-ads').disabled=false;}
}
$('ml-refresh-ads').onclick=()=>refreshRegisteredAds(true);
async function mlRequest(action,{query={},method='GET',body}={}){
 globalThis.ConduzMlPolicy?.checkWait(action);
 const params=new URLSearchParams(query),url='/api/ml/'+action+(params.size?'?'+params:'');
 const owner=action==='access'?mlConnection.account?.id:activeCatalogAccount??mlConnection.account?.id;
 const response=await fetch(url,{method,credentials:'same-origin',headers:{...(method==='POST'?{'X-Conduz-Action':'mercadolivre',...(body?{'Content-Type':'application/json'}:{})}:{}),...(!['status','connect'].includes(action)&&owner?{'X-Conduz-Account':String(owner)}:{})},...(body?{body:JSON.stringify(body)}:{})});
 let data;try{data=await response.json();}catch{throw Error('A conexão não está disponível neste endereço. Abra a versão publicada do painel.');}
 if(data.dataPolicy)globalThis.ConduzMlPolicy?.acceptPolicy(data.dataPolicy);
 if(!response.ok){globalThis.ConduzMlPolicy?.noteError({status:response.status,retryAfter:Number(response.headers.get('Retry-After')??0)});if(['INTEGRATION_ENDED','AUTHORIZATION_REVOKED','DATA_POLICY_CHANGED'].includes(data.error)){mlConnection.connected=false;globalThis.ConduzCatalog?.disconnect();renderMlConnection(data.message);}else if(data.error==='PANEL_ACCESS_REQUIRED'){mlConnection.accessGranted=false;globalThis.ConduzCatalog?.disconnect();renderMlConnection(data.message);}else if(data.error==='ACCOUNT_CHANGED'){globalThis.ConduzCatalog?.disconnect();mlConnection.connected=false;renderMlConnection(data.message);}else if(response.status===401){mlConnection.connected=false;renderMlConnection('A conexão expirou. Conecte a conta novamente.');$('ml-ads-status').textContent='Conecte a conta para atualizar Ads. Os valores anteriores foram preservados.';}throw Object.assign(Error(data.message??'Não foi possível acessar o Mercado Livre agora.'),{status:response.status,code:data.error,retryAfter:Number(response.headers.get('Retry-After')??0)});}return data;
}
function saveProductDraftBeforeConnect(){
 if(!$('product-dialog').open)return true;
 try{const fields=Array.from($('product-form').elements).filter(el=>el.name&&['INPUT','SELECT'].includes(el.tagName)).map(el=>({name:el.name,value:el.type==='checkbox'?el.checked:el.value}));sessionStorage.setItem('conduz.mlProductDraft.'+(activeCatalogAccount??'unassigned'),JSON.stringify({catalogKey:KEY,editing,fields,linked:mlLinkedDraft}));return true;}
 catch{$('ml-product-status').textContent='Não foi possível guardar o formulário temporariamente. Salve o produto antes de conectar.';return false;}
}
async function connectMercadoLivre(){
 if(!saveProductDraftBeforeConnect())return;
 try{const result=await mlRequest('connect',{method:'POST'});const url=new URL(result.authorizationUrl);if(url.origin!=='https://auth.mercadolivre.com.br')throw Error('Endereço de autorização inválido.');location.assign(url.href);}
 catch(error){toast(error.message);$('ml-product-status').textContent=error.message;}
}
async function importMlItem(id){
 if(!mlConnection.connected){$('ml-product-status').textContent='Conecte sua conta primeiro.';return;}
 const version=++mlLookupVersion;$('ml-find-item').disabled=true;$('ml-product-status').textContent='Consultando anúncio…';
 try{
  const result=await mlRequest('item',{query:{id}});if(version!==mlLookupVersion||!$('product-dialog').open)return;
  if(!validMlLink(result.item))throw Error('O anúncio retornou dados incompletos. Confira o ID ou tente outro anúncio.');
  mlLinkedDraft=currentLinkFromResponse(result.item,result);mlCommissionReference=validCommissionReference(result.commissions)?result.commissions:null;const form=$('product-form');form.elements.name.value=mlLinkedDraft.title.slice(0,120);form.elements.category.value=(mlLinkedDraft.categoryName??mlLinkedDraft.categoryId??'Mercado Livre').slice(0,80);
  if(mlLinkedDraft.weight!==null)form.elements.weight.value=mlLinkedDraft.weight;
  $('ml-item-query').value=mlLinkedDraft.itemId;$('ml-product-status').textContent='Dados importados. Confira o custo, o peso, a margem e as taxas antes de salvar.';renderMlLink();mlShippingVersion++;mlShippingPending=null;if(mlLinkedDraft.shippingQuote)form.elements.mlShipping.value=String(mlLinkedDraft.shippingQuote.amount);else form.elements.mlShipping.value='';renderAutomaticShipping(result.shippingMessage);mlPricingDraft=null;$('ml-auto-fees').checked=true;renderAutoPricing();scheduleOfficialPricing();
 }catch(error){if(version===mlLookupVersion)$('ml-product-status').textContent=error.message;}
 finally{if(version===mlLookupVersion)$('ml-find-item').disabled=!mlConnection.connected;}
}
// Catálogo completo: uma consulta sequencial, reaproveitada por conta nesta aba.
const ML_CATALOG_CACHE_MS=5*60*1000,ML_CATALOG_CURSOR_MS=4*60*1000;
let mlCatalogComplete=false,mlCatalogUpdatedAt=0,mlCatalogStartedAt=0,mlCatalogAccount=null,mlCatalogError='',mlCatalogPending=null;
let mlCatalogIds=new Set(),mlCatalogPages=new Set();
function normalizeMlCatalogQuery(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');}
function resetMlCatalog(account=null){
 mlPickerVersion++;mlCatalog=[];mlCursor=null;mlCatalogComplete=false;mlCatalogUpdatedAt=0;mlCatalogStartedAt=0;mlCatalogAccount=account;mlCatalogError='';mlCatalogPending=null;mlCatalogIds=new Set();mlCatalogPages=new Set();
}
function renderMlCatalog(){
 const query=normalizeMlCatalogQuery($('ml-picker-search').value.trim()),loading=Boolean(mlCatalogPending);
 const items=mlCatalog.filter(item=>normalizeMlCatalogQuery(item.title+' '+item.itemId).includes(query));
 const empty=mlCatalogError?'A consulta não foi concluída. Tente novamente para buscar em todo o catálogo.':!mlCatalogComplete?'Procurando no catálogo completo. Os próximos anúncios aparecerão automaticamente…':'Nenhum anúncio encontrado no catálogo da conta.';
 $('ml-picker-items').innerHTML=items.map(item=>`<li>${item.thumbnail?`<img src="${escapeHTML(item.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}<div><strong>${escapeHTML(item.title)}</strong><span class="sub">${escapeHTML(item.itemId)} · ${item.listingType==='gold_pro'?'Premium':item.listingType==='gold_special'?'Clássico':escapeHTML(item.listingType??'')}</span></div><button type="button" class="btn quiet" data-ml-pick="${escapeHTML(item.itemId)}">Selecionar</button></li>`).join('')||'<li>'+empty+'</li>';
 const matches=query?` ${items.length} resultado(s)${mlCatalogComplete?'':' até agora'}.`:'';
 $('ml-picker-status').textContent=mlCatalogError?`Busca incompleta: ${mlCatalog.length} anúncio(s) carregado(s).${matches} ${mlCatalogError}`:mlCatalogComplete?`Catálogo completo: ${mlCatalog.length} anúncio(s).${matches} Selecione um para importar os dados.`:`Carregando automaticamente todo o catálogo… ${mlCatalog.length} anúncio(s) carregado(s).${matches}`;
 $('ml-picker-items').setAttribute('aria-busy',String(loading));
 $('ml-load-more').disabled=loading;$('ml-load-more').hidden=loading||!mlCatalogComplete&&!mlCatalogError;$('ml-load-more').textContent=mlCatalogError?'Tentar novamente':'Atualizar catálogo';
}
function loadMlCatalog(force=false){
 if(!mlConnection.connected||!$('ml-picker-dialog').open)return;
 const account=mlConnection.account?.id??null,stamp=mlCatalogComplete?mlCatalogUpdatedAt:mlCatalogStartedAt,ttl=mlCatalogComplete?ML_CATALOG_CACHE_MS:ML_CATALOG_CURSOR_MS;
 if(force||account!==mlCatalogAccount||mlCatalogError||!mlCatalogPending&&(!stamp||Date.now()-stamp>=ttl))resetMlCatalog(account);
 if(mlCatalogComplete){renderMlCatalog();return;}
 if(mlCatalogPending)return mlCatalogPending.promise;
 const version=mlPickerVersion,run={promise:null};mlCatalogPending=run;mlCatalogError='';if(!mlCatalogStartedAt)mlCatalogStartedAt=Date.now();
 run.promise=(async()=>{
  try{
   while(version===mlPickerVersion&&mlConnection.connected&&$('ml-picker-dialog').open&&!mlCatalogComplete){
    const data=await mlRequest('items',{query:mlCursor?{cursor:mlCursor}:{}});
    if(version!==mlPickerVersion||account!==(mlConnection.account?.id??null))return;
    if(!data||!Array.isArray(data.items)||!Object.prototype.hasOwnProperty.call(data,'nextCursor')||data.nextCursor!==null&&data.nextCursor!==undefined&&(typeof data.nextCursor!=='string'||!data.nextCursor||data.nextCursor.length>4096))throw Error('O Mercado Livre retornou uma página de catálogo inválida.');
    const fingerprint=data.items.map(item=>item?.itemId).filter(id=>/^MLB\d{5,15}$/.test(id)).sort().join(',');
    if(fingerprint&&mlCatalogPages.has(fingerprint))throw Error('A consulta do catálogo deixou de avançar. Tente novamente.');
    if(fingerprint)mlCatalogPages.add(fingerprint);
    for(const item of data.items){if(item&&/^MLB\d{5,15}$/.test(item.itemId)&&typeof item.title==='string'&&!mlCatalogIds.has(item.itemId)){mlCatalogIds.add(item.itemId);mlCatalog.push({...item,title:item.title.slice(0,256),thumbnail:mlSafeUrl(item.thumbnail,'mlstatic.com')});}}
    // Guarda a página em memória mesmo se a janela fechar durante a requisição,
    // para poder retomar o cursor sem pular os anúncios recebidos.
    mlCursor=data.nextCursor??null;mlCatalogComplete=!mlCursor;mlCatalogUpdatedAt=Date.now();
    if($('ml-picker-dialog').open)renderMlCatalog();
   }
  }catch(error){if(version===mlPickerVersion){mlCatalogComplete=false;mlCatalogError=error?.message||'Não foi possível concluir a consulta do catálogo.';}}
  finally{if(mlCatalogPending===run){mlCatalogPending=null;if($('ml-picker-dialog').open)renderMlCatalog();}}
 })();renderMlCatalog();return run.promise;
}
function openMlCatalog(){
 if(!mlConnection.connected)return;
 $('ml-picker-search').value='';$('ml-picker-dialog').showModal();renderMlCatalog();return loadMlCatalog();
}
$('ml-open-picker').onclick=openMlCatalog;
$('ml-picker-search').oninput=renderMlCatalog;
$('ml-load-more').onclick=()=>loadMlCatalog(true);
$('ml-picker-close').onclick=()=>$('ml-picker-dialog').close();
$('ml-picker-items').onclick=e=>{const button=e.target.closest('button');if(!button?.dataset.mlPick)return;$('ml-picker-dialog').close();importMlItem(button.dataset.mlPick);};
// Fim do controlador do catálogo.
$('ml-connect').onclick=$('ml-connect-product').onclick=connectMercadoLivre;
$('ml-disconnect').onclick=async()=>{try{await mlRequest('disconnect',{method:'POST'});globalThis.ConduzCatalog?.disconnect();mlLookupVersion++;mlAdsEpoch++;resetMlCatalog();mlConnection.connected=false;mlConnection.account=null;renderMlConnection();toast('Conta desconectada neste navegador. Seus produtos e vínculos locais foram mantidos.');}catch(error){toast(error.message);}};
$('ml-find-item').onclick=()=>importMlItem($('ml-item-query').value.trim());
$('ml-unlink').onclick=()=>{mlLookupVersion++;mlLinkedDraft=null;mlPricingDraft=null;mlPricingVersion++;mlShippingVersion++;$('ml-auto-fees').checked=false;renderAutomaticShipping();renderAutoPricing();$('ml-item-query').value='';renderMlLink();$('ml-product-status').textContent='Vínculo removido do formulário. Salve o produto para confirmar.';};
let mlInitializationBusy=false,mlInitializationRetry=false;
function activateAccountCatalog(accountId,legacyId){
 const sellerId=String(accountId);accountCatalogKey(sellerId);
 if(validCatalogAccount(legacyId))legacyCatalogAccount=legacyId;
 if(activeCatalogAccount===sellerId)return false;
 const plan=planAccountCatalog(state,sellerId,activeCatalogAccount,legacyCatalogAccount,key=>localStorage.getItem(key));
 if(plan.changed&&(['product-dialog','restore-dialog','import-dialog','ads-reconcile-dialog','delete-dialog','kit-delete-dialog','ml-picker-dialog','cloud-review-dialog'].some(id=>$(id).open)||globalThis.ConduzMlImport?.isOpen()||kitEditing||kitItems.size))throw Error('Conclua ou cancele a edição em andamento e recarregue a página para trocar de empresa. Seus dados foram preservados.');
 // Grava todas as cópias antes de trocar a chave usada por persist() e pela sincronização.
 for(const [key,value] of plan.writes)localStorage.setItem(key,value);
 localStorage.setItem(ACTIVE_CATALOG_ACCOUNT,sellerId);
 KEY=plan.key;activeCatalogAccount=sellerId;state=plan.data;
 if(plan.changed){
  mlLookupVersion++;mlAdsEpoch++;mlPricingVersion++;mlShippingVersion++;resetMlCatalog(sellerId);
  importReadVersion++;restoreReadVersion++;
  editing=null;deleting=null;sort={key:'name',direction:1};$('search').value='';
  adsHistoryUi.epoch++;adsUi.advertisers=[];adsUi.selectedAdvertiser=null;adsUi.accountError='';adsUi.budgetTouched=false;adsUi.reconcileProduct=null;adsUi.reconcileBasis=null;
  $('ads-history-query').value='';$('ads-saved-report').value='';resetKitEditor();
 }
 storageProblem='';render();return plan.changed;
}
function restoreProductDraftAfterConnect(){
 try{
  const key=['conduz.mlProductDraft.'+(activeCatalogAccount??'unassigned'),'conduz.mlProductDraft.unassigned','conduz.mlProductDraft'].find(key=>sessionStorage.getItem(key)!==null);
  if(!key)return;const raw=sessionStorage.getItem(key);
  const draft=JSON.parse(raw),draftKey=draft.catalogKey??LEGACY_CATALOG_KEY;
  if(draftKey!==KEY&&!(draftKey===LEGACY_CATALOG_KEY&&activeCatalogAccount===legacyCatalogAccount)){toast('O formulário anterior pertence a outra empresa e foi mantido separado.');return;}
  const product=draft.editing?state.products.find(p=>p.id===draft.editing):null;
  if(draft.editing&&!product)return;
  openProduct(product);for(const field of draft.fields??[])for(const name of field.name==='ads'?['adsMl','adsShopee']:[field.name]){const input=$('product-form').elements[name];if(input&&['INPUT','SELECT'].includes(input.tagName)){if(input.type==='checkbox')input.checked=Boolean(field.value);else input.value=String(field.value);}}
  renderAdsRoas();if(validMlLink(draft.linked)&&String(draft.linked.sellerId)===activeCatalogAccount){mlLinkedDraft=copyMlLink(draft.linked);renderMlLink();}
  sessionStorage.removeItem(key);
 }catch{}
}
async function initializeMercadoLivre(){
 if(!['https:','http:'].includes(globalThis.location?.protocol)){renderMlConnection('Para conectar o Mercado Livre, abra o painel no endereço publicado. O cadastro manual funciona neste arquivo.');return;}
 if(mlInitializationBusy)return;
 const query=new URL(location.href).searchParams,callback=query.get('ml');
 if(callback){
  const clean=new URL(location.href);clean.searchParams.delete('ml');history.replaceState(null,'',clean.href);
 }
 mlInitializationBusy=true;
 try{mlConnection=await mlRequest('status');mlInitializationRetry=false;if(globalThis.ConduzAccess&&!globalThis.ConduzAccess.acceptConnection(mlConnection)){globalThis.ConduzCatalog?.disconnect();renderMlConnection(callback==='error'?'A autorização não foi concluída. Tente novamente.':undefined);return;}await globalThis.ConduzCatalog?.connect(mlConnection);renderMlConnection(callback==='error'?'A autorização não foi concluída. Tente conectar novamente.':undefined);if(callback&&mlConnection.connected)restoreProductDraftAfterConnect();if(mlConnection.connected){$('ml-product-status').textContent='Conta conectada. Busque o anúncio ou escolha do catálogo.';if(!kitEditing&&!kitItems.size)$('kit-auto-fees').checked=true;renderKitPreview();await refreshRegisteredPrices();await refreshRegisteredAds();}}
 catch(error){mlInitializationRetry=!error.status||error.status>=500;renderMlConnection(error.name==='TypeError'?'Sem conexão no momento. Os cadastros locais foram mantidos; tentaremos novamente quando a conexão voltar.':error.message);}
 finally{mlInitializationBusy=false;}
}
for(const event of ['online','focus'])globalThis.addEventListener?.(event,()=>{if(mlInitializationRetry)initializeMercadoLivre();});
resetKitEditor();showScreen('products');render();if(feesMigrated)persist();if(storageProblem){$('save-status').textContent='⚠ Verifique o armazenamento';toast(storageProblem);}initializeMercadoLivre();
