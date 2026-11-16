// Faturamento do próprio anúncio por data da venda, antes de tarifas e frete.
// Receita atribuída de Product Ads não substitui vendas efetivas do item.
const fail=message=>Object.assign(new Error(message),{ads:true,status:422});
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export async function itemSales({itemId,sellerId,range,api}){
 if(!/^MLB\d{5,15}$/.test(itemId)||!Number.isSafeInteger(sellerId)||sellerId<=0)throw fail('Identificação inválida para consultar o faturamento.');
 const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!valid(range?.dateFrom)||!valid(range?.dateTo))throw fail('Período inválido para consultar as vendas.');
 const from=range.dateFrom+'T00:00:00.000-03:00',to=range.dateTo+'T23:59:59.999-03:00',start=Date.parse(from),end=Date.parse(to);
 if(end<start||end-start>=90*86400000)throw fail('Consulte até 90 dias de vendas por vez.');
 const seen=new Set();let offset=0,total=null,requests=0,revenueCents=0,cancelledCents=0,orders=0,units=0,cancelledOrders=0,refundReview=0;
 do{
  if(++requests>30)throw fail('O faturamento atingiu o limite de consultas por operação. Nenhuma soma parcial foi utilizada.');
  const query=new URLSearchParams({seller:String(sellerId),q:itemId,'order.date_created.from':from,'order.date_created.to':to,'order.status':'paid,partially_refunded,cancelled,pending_cancel',sort:'date_asc',limit:'50',offset:String(offset)});
  const data=await api('/orders/search?'+query),p=data?.paging,rows=data?.results;
  if(!p||!Number.isSafeInteger(p.total)||p.total<0||!Number.isSafeInteger(p.limit)||p.limit<=0||p.offset!==offset||!Array.isArray(rows)||rows.length>p.limit||offset+rows.length>p.total||total!==null&&p.total!==total)throw fail('A paginação de vendas está incompleta ou mudou durante a consulta.');
  total=p.total;
  for(const order of rows){
   const key=String(order.id);if(!/^\d{1,20}$/.test(key)||seen.has(key)||Number(order.seller?.id)!==sellerId)throw fail('A consulta de vendas retornou pedido duplicado ou de outra conta.');seen.add(key);
   const created=Date.parse(order.date_created);if(!Number.isFinite(created)||created<start||created>end||!Array.isArray(order.order_items))throw fail('As vendas retornadas não correspondem ao período solicitado.');
   const lines=order.order_items.filter(line=>line.item?.id===itemId);if(!lines.length)continue; // Busca genérica pode encontrar outro título/SKU. Nunca somar o pacote inteiro.
   if(order.currency_id!=='BRL'||lines.some(line=>line.currency_id!==undefined&&line.currency_id!=='BRL'||!Number.isSafeInteger(line.quantity)||line.quantity<=0||!finite(line.unit_price)))throw fail('As vendas do anúncio têm moeda ou valores incompletos.');
   const cents=lines.reduce((sum,line)=>sum+Math.round(line.unit_price*line.quantity*100),0),qty=lines.reduce((sum,line)=>sum+line.quantity,0);
   if(!Number.isSafeInteger(cents)||!Number.isSafeInteger(revenueCents+cents))throw fail('O faturamento excedeu o limite seguro de cálculo.');
   if(['cancelled','pending_cancel'].includes(order.status)){cancelledCents+=cents;cancelledOrders++;}
   else if(['paid','partially_refunded'].includes(order.status)){revenueCents+=cents;orders++;units+=qty;if(order.status==='partially_refunded')refundReview++;}
   else throw fail('A consulta retornou um status de venda não previsto para esta base.');
  }
  offset+=rows.length;if(offset<total&&rows.length!==p.limit)throw fail('A consulta de vendas retornou uma página incompleta.');
 }while(offset<total);
 return {source:'mercado-livre-orders-v1',basis:'paid-item-sales-created',itemId,sellerId,currency:'BRL',...range,revenue:revenueCents/100,orders,units,cancelledRevenue:cancelledCents/100,cancelledOrders,refundReview,status:refundReview?'refund-review':'ready'};
}
