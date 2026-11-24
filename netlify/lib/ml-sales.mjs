import {createHash} from 'node:crypto';

// Apenas receita dos produtos. Frete, tarifas, repasses e bônus não são receita do TACOS.
export const SALES_FIELDS=['revenue','paidRevenue','cancelledRevenue','refundedRevenue','discountRevenue','cashbackRevenue','orders','units','cancelledOrders','refundedOrders','refundReview','discountReview','financialReview','logisticsReview','notDeliveredPaidOrders','notDeliveredPaidRevenue'];
export const SALES_SOURCE='mercado-livre-orders-v2',SALES_BASIS='paid-item-sales-net-of-confirmed-refunds';
export const SALES_PAGE_SIZE=10;
const fail=message=>Object.assign(new Error(message),{ads:true,status:422});
const nonnegative=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const cents=n=>{if(!nonnegative(n)||!Number.isSafeInteger(Math.round(n*100)))throw fail('Valor de venda inválido.');return Math.round(n*100);};
const numericId=value=>/^\d{1,20}$/.test(String(value));
const moneyField=k=>k==='revenue'||k.endsWith('Revenue');
const review=s=>s.refundReview+s.discountReview+s.financialReview>0;
function context({itemId,sellerId,range}){
 if(!/^MLB\d{5,15}$/.test(itemId)||!Number.isSafeInteger(sellerId)||sellerId<=0)throw fail('Identificação inválida para consultar o faturamento.');
 const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!valid(range?.dateFrom)||!valid(range?.dateTo))throw fail('Período inválido para consultar as vendas.');
 const from=range.dateFrom+'T00:00:00.000-03:00',to=range.dateTo+'T23:59:59.999-03:00';
 if(Date.parse(to)<Date.parse(from)||Date.parse(to)-Date.parse(from)>=90*86400000)throw fail('Consulte até 90 dias de vendas por vez.');
 return {from,to,itemId,sellerId,dateFrom:range.dateFrom,dateTo:range.dateTo};
}
function checkOrder(order,c){
 if(!numericId(order?.id)||Number(order.seller?.id)!==c.sellerId||order.currency_id!=='BRL'||!Array.isArray(order.order_items))throw fail('A consulta retornou pedido de outra conta ou moeda inválida.');
 const created=Date.parse(order.date_created);if(!Number.isFinite(created)||created<Date.parse(c.from)||created>Date.parse(c.to))throw fail('As vendas não correspondem ao período solicitado.');
 for(const line of order.order_items)if(!/^MLB\d{5,15}$/.test(line.item?.id)||!Number.isSafeInteger(line.quantity)||line.quantity<=0||line.currency_id!==undefined&&line.currency_id!=='BRL'||!nonnegative(line.unit_price))throw fail('Os itens da venda estão incompletos.');
}
function productValue(order,itemId){
 const lines=order.order_items.filter(line=>line.item.id===itemId);
 return {lines,net:lines.reduce((sum,line)=>sum+cents(line.unit_price*line.quantity),0),quantity:lines.reduce((sum,line)=>sum+line.quantity,0)};
}
function discountsFor(order,itemId,data){
 const value=productValue(order,itemId);if(!Array.isArray(data?.details))throw fail('Detalhamento de descontos incompleto.');
 let price=0,coupon=0,cashback=0;const couponIds=new Set();
 for(const detail of data.details){
  if(!['discount','coupon','cashback'].includes(detail.type)||!Array.isArray(detail.items))throw fail('Tipo de desconto não reconhecido.');
  const entries=detail.items.filter(line=>line.id===itemId);if(!entries.length)continue;
  if(detail.type==='coupon'&&detail.coupon?.id!==undefined){const key=String(detail.coupon.id);if(couponIds.has(key))throw fail('Cupom duplicado.');couponIds.add(key);}
  for(const entry of entries){
   if(!Number.isSafeInteger(entry.quantity)||entry.quantity<=0||entry.quantity>value.quantity)throw fail('Quantidade de desconto inválida.');
   const amount=cents(entry.amounts?.total); // TOTAL do item, não valor por unidade.
   if(detail.type==='discount')price+=amount;else if(detail.type==='coupon')coupon+=amount;else cashback+=amount;
  }
 }
 // gross_price já é total de todas as unidades. unit_price pode incluir o cupom.
 const hasGross=value.lines.every(line=>nonnegative(line.gross_price));
 const embedded=hasGross?value.lines.reduce((sum,line)=>sum+cents(line.gross_price),0)-value.net:price;
 if(embedded<0)throw fail('Preço bruto menor que o preço pago.');
 let additional=0;
 if(coupon){
  if(!hasGross)throw fail('Cupom sem base para confirmar se já está incluído no preço.');
  additional=price+coupon-embedded;
  if(additional<0||additional>coupon)throw fail('O desconto não concilia com o preço do item.');
 }
 if(additional>value.net)throw fail('Desconto maior que o valor do produto.');
 return {...value,net:value.net-additional,discount:embedded+additional,cashback};
}
function paymentState(order,net){
 if(!Array.isArray(order.payments)||!order.payments.length)return {kind:'review'};
 const valid=order.payments.filter(p=>['approved','refunded','partially_refunded','charged_back'].includes(p.status));
 if(valid.some(p=>p.currency_id!==undefined&&p.currency_id!=='BRL'||p.order_id!==undefined&&String(p.order_id)!==String(order.id)||p.collector?.id!==undefined&&Number(p.collector.id)!==Number(order.seller.id)))return {kind:'review'};
 if(valid.length&&valid.every(p=>p.status==='refunded'))return {kind:'full'};
 if(valid.some(p=>p.status==='charged_back')||!valid.length)return {kind:'review'};
 const partial=order.status==='partially_refunded'||valid.some(p=>p.status!=='approved'||nonnegative(p.transaction_amount_refunded)&&p.transaction_amount_refunded>0);
 if(!partial)return {kind:'paid'};
 // Só deduzir parcial quando TODO o pagamento corresponde ao próprio produto.
 // Sem frete/parcelamento/outros itens; nunca ratear reembolso entre produtos.
 const oneProduct=order.order_items.every(line=>line.item.id===order.order_items[0].item.id);
 const exact=oneProduct&&valid.every(p=>p.status==='approved'&&nonnegative(p.transaction_amount)&&nonnegative(p.transaction_amount_refunded)&&p.shipping_cost===0&&nonnegative(p.total_paid_amount)&&cents(p.total_paid_amount)===cents(p.transaction_amount))&&(!nonnegative(order.shipping_cost)||order.shipping_cost===0);
 if(exact&&valid.reduce((sum,p)=>sum+cents(p.transaction_amount),0)===net){
  const amount=valid.reduce((sum,p)=>sum+cents(p.transaction_amount_refunded),0);
  if(amount>0&&amount<=net)return {kind:'partial',amount};
 }
 return {kind:'partial-review'};
}
function shape(c,values,complete){
 return {source:SALES_SOURCE,basis:SALES_BASIS,itemId:c.itemId,sellerId:c.sellerId,currency:'BRL',dateFrom:c.dateFrom,dateTo:c.dateTo,...Object.fromEntries(SALES_FIELDS.map(k=>[k,moneyField(k)?values[k]/100:values[k]])),complete,status:review(values)?'review':'ready'};
}
export function sumItemSales(parts){
 if(!parts.length)return undefined;const first=parts[0];
 if(!parts.every(s=>s.source===SALES_SOURCE&&s.basis===SALES_BASIS&&s.itemId===first.itemId&&s.sellerId===first.sellerId&&s.currency==='BRL'))throw fail('Não é possível misturar bases de faturamento.');
 const totals=Object.fromEntries(SALES_FIELDS.map(k=>[k,parts.reduce((sum,s)=>sum+(moneyField(k)?cents(s[k]):s[k]),0)]));
 if(!SALES_FIELDS.every(k=>Number.isSafeInteger(totals[k])&&totals[k]>=0))throw fail('O total de faturamento excedeu o limite seguro.');
 return shape({...first,dateTo:parts.at(-1).dateTo},totals,true);
}
export async function itemSalesPage({itemId,sellerId,range,api,offset=0,expectedTotal=null}){
 const c=context({itemId,sellerId,range});
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000||expectedTotal!==null&&(!Number.isSafeInteger(expectedTotal)||expectedTotal<0))throw fail('Página de vendas inválida.');
 const query=new URLSearchParams({seller:String(sellerId),q:itemId,'order.date_created.from':c.from,'order.date_created.to':c.to,'order.status':'paid,partially_refunded,cancelled,pending_cancel,confirmed',sort:'date_asc',limit:String(SALES_PAGE_SIZE),offset:String(offset)});
 const data=await api('/orders/search?'+query),p=data?.paging,rows=data?.results;
 if(!p||!Number.isSafeInteger(p.total)||p.total<0||!Number.isSafeInteger(p.limit)||p.limit<=0||p.limit>SALES_PAGE_SIZE||p.offset!==offset||!Array.isArray(rows)||rows.length>p.limit||offset+rows.length>p.total||expectedTotal!==null&&p.total!==expectedTotal||offset+rows.length<p.total&&rows.length!==p.limit)throw fail('A paginação de vendas está incompleta ou mudou durante a consulta.');
 const values=Object.fromEntries(SALES_FIELDS.map(k=>[k,0])),keys=[],seen=new Set();
 for(const row of rows){
  checkOrder(row,c);const key=String(row.id);if(seen.has(key))throw fail('Pedido duplicado na consulta.');seen.add(key);keys.push(createHash('sha256').update(sellerId+':'+key).digest('hex'));
  let value=productValue(row,itemId);if(!value.lines.length)continue;
  if(['cancelled','pending_cancel'].includes(row.status)){values.cancelledRevenue+=value.net;values.cancelledOrders++;continue;}
  const order=await api('/orders/'+key);checkOrder(order,c);
  if(String(order.id)!==key||!productValue(order,itemId).lines.length)throw fail('O detalhe não corresponde ao pedido consultado.');
  value=productValue(order,itemId);
  if(['cancelled','pending_cancel'].includes(order.status)){values.cancelledRevenue+=value.net;values.cancelledOrders++;continue;}
  if(!['paid','partially_refunded','confirmed'].includes(order.status))throw fail('Status de venda não reconhecido.');
  try{value=discountsFor(order,itemId,await api('/orders/'+key+'/discounts'));values.discountRevenue+=value.discount;values.cashbackRevenue+=value.cashback;}
  catch{values.discountReview++;}
  const payment=paymentState(order,value.net);
  if(order.status==='confirmed'&&payment.kind==='review')continue;
  values.orders++;values.units+=value.quantity;values.paidRevenue+=value.net;
  let refund=0;
  if(payment.kind==='full'){refund=value.net;values.refundedOrders++;}
  else if(payment.kind==='partial'){refund=payment.amount;values.refundedOrders++;}
  else if(payment.kind==='partial-review')values.refundReview++;
  else if(payment.kind==='review'||order.status==='confirmed')values.financialReview++;
  values.refundedRevenue+=refund;values.revenue+=value.net-refund;
  let undelivered=Array.isArray(order.tags)&&order.tags.includes('not_delivered');
  if(order.shipping?.id!==undefined&&order.shipping.id!==null){
   if(!numericId(order.shipping.id)){values.logisticsReview++;}
   else try{
    const shipment=await api('/shipments/'+order.shipping.id);
    if(String(shipment.id)!==String(order.shipping.id)||typeof shipment.status!=='string')throw fail('Envio inválido.');
    undelivered=['not_delivered','cancelled','returned'].includes(shipment.status);
   }catch{values.logisticsReview++;}
  }
  if(undelivered&&['paid','partial'].includes(payment.kind)){values.notDeliveredPaidOrders++;values.notDeliveredPaidRevenue+=value.net-refund;}
 }
 if(!SALES_FIELDS.every(k=>Number.isSafeInteger(values[k])&&values[k]>=0))throw fail('O faturamento excedeu o limite seguro.');
 const nextOffset=offset+rows.length<p.total?offset+rows.length:null;
 return {sales:shape(c,values,offset===0&&nextOffset===null),page:{offset,count:rows.length,total:p.total,nextOffset,keys}};
}
export async function itemSales(options){
 const parts=[],seen=new Set();let offset=0,expectedTotal=null;
 for(let i=0;i<1000;i++){
  const result=await itemSalesPage({...options,offset,expectedTotal});
  for(const key of result.page.keys){if(seen.has(key))throw fail('Pedido duplicado entre páginas.');seen.add(key);}
  parts.push(result.sales);expectedTotal=result.page.total;if(result.page.nextOffset===null)return sumItemSales(parts);offset=result.page.nextOffset;
 }
 throw fail('A consulta de vendas atingiu o limite. Nenhuma soma parcial foi utilizada.');
}
