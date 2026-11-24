const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const itemId='MLB1234567890',otherId='MLB9876543210',sellerId=123,range={dateFrom:'2026-10-19',dateTo:'2026-10-25'};
function order(id=1,overrides={}){return {id,seller:{id:sellerId},currency_id:'BRL',status:'paid',date_created:'2026-10-20T12:00:00-03:00',buyer:{nickname:'PRIVATE_BUYER',address:'PRIVATE_ADDRESS'},payments:[{id:id+1000,order_id:id,collector:{id:sellerId},status:'approved',currency_id:'BRL',transaction_amount:100,total_paid_amount:100,transaction_amount_refunded:0,shipping_cost:0}],order_items:[{item:{id:itemId},quantity:2,unit_price:50,currency_id:'BRL'}],...overrides};}
const discount=(type,amount,id=itemId,quantity=2)=>({type,...(type==='coupon'?{coupon:{id:'coupon-1'}}:{}),items:[{id,quantity,amounts:{total:amount,seller:amount}}]});
function setup(rows,options={}){
 const calls=[];return {calls,api:async path=>{
  calls.push(path);const url=new URL(path,'https://api.mercadolibre.com');
  if(url.pathname==='/orders/search'){const offset=Number(url.searchParams.get('offset'));assert.equal(url.searchParams.get('seller'),'123');assert.equal(url.searchParams.get('limit'),'10');return {paging:{offset,total:rows.length,limit:10},results:rows.slice(offset,offset+10).map(r=>structuredClone(r))};}
  if(/^\/orders\/\d+\/discounts$/.test(url.pathname)){if(options.discountError)throw Object.assign(Error('PRIVATE_ERROR'),{status:options.discountError});return structuredClone(options.discounts?.[url.pathname.split('/')[2]]??{details:[]});}
  if(/^\/orders\/\d+$/.test(url.pathname))return structuredClone(options.details?.[url.pathname.split('/').pop()]??rows.find(r=>String(r.id)===url.pathname.split('/').pop()));
  if(/^\/shipments\/\d+$/.test(url.pathname)){if(options.shippingError)throw Object.assign(Error('PRIVATE_ERROR'),{status:403});return options.shipments?.[url.pathname.split('/').pop()]??{id:Number(url.pathname.split('/').pop()),status:'delivered'};}
  throw Error('Consulta inesperada: '+path);
 }};
}
async function run(rows,options={}){const f=setup(rows,options),{itemSales}=await import('../netlify/lib/ml-sales.mjs');return {sales:await itemSales({itemId,sellerId,range,api:f.api}),calls:f.calls};}
const code=require('./support/app-source.cjs').readAppScript(),ctx=vm.createContext({URL});
vm.runInContext(code.slice(0,code.indexOf('let state=defaults()'))+code.slice(code.indexOf('async function fetchItemSalesPages'),code.indexOf('function adsHistoryCell'))+';globalThis.core={validItemSales,readyItemSales,combineItemSales,copyItemSales,fetchItemSalesPages,ITEM_SALES_FIELDS};',ctx);const core=ctx.core;

test('promoção já no unit_price não é descontada outra vez nem multiplicada duas vezes',async()=>{
 const r=order();r.order_items[0].gross_price=120;
 const {sales}=await run([r],{discounts:{1:{details:[discount('discount',20)]}}});
 assert.equal(sales.revenue,100);assert.equal(sales.discountRevenue,20);assert.equal(sales.status,'ready');assert.ok(core.validItemSales(sales,sales));
});
test('cupom por item desconta somente a parcela ainda não incluída no preço',async()=>{
 const r=order();r.order_items[0].gross_price=120;
 const {sales}=await run([r],{discounts:{1:{details:[discount('discount',20),discount('coupon',10)]}}});
 assert.equal(sales.revenue,90);assert.equal(sales.discountRevenue,30);assert.equal(sales.status,'ready');
 r.order_items[0].unit_price=45;const already=await run([r],{discounts:{1:{details:[discount('discount',20),discount('coupon',10)]}}});
 assert.equal(already.sales.revenue,90);assert.equal(already.sales.discountRevenue,30);
});
test('cupom sem base de inclusão, duplicado ou maior que a venda fica pendente',async()=>{
 const fixtures=[{r:order(),details:[discount('coupon',10)]},{r:order(),details:[discount('coupon',10),discount('coupon',10)]},{r:order(),details:[discount('coupon',200)]}];
 for(const {r,details} of fixtures){const {sales}=await run([r],{discounts:{1:{details}}});assert.equal(sales.status,'review');assert.equal(sales.discountReview,1);assert.equal(core.readyItemSales({...sales,sales}),false);}
});
test('pacote usa os descontos oficiais do item, sem ratear pelo total do pacote',async()=>{
 const r=order();r.order_items[0].gross_price=100;r.order_items.push({item:{id:otherId},quantity:1,unit_price:900,gross_price:900});
 const {sales}=await run([r],{discounts:{1:{details:[{type:'coupon',coupon:{id:'c'},items:[{id:itemId,quantity:2,amounts:{total:7}},{id:otherId,quantity:1,amounts:{total:93}}]}]}}});
 assert.equal(sales.revenue,93);assert.equal(sales.discountRevenue,7);assert.equal(sales.status,'ready');
});
test('cashback não é abatido do preço pago; indisponibilidade de desconto não vira taxa zero',async()=>{
 const a=await run([order()],{discounts:{1:{details:[discount('cashback',12)]}}});assert.equal(a.sales.revenue,100);assert.equal(a.sales.cashbackRevenue,12);assert.equal(a.sales.discountRevenue,0);
 const b=await run([order()],{discountError:403});assert.equal(b.sales.discountReview,1);assert.equal(b.sales.status,'review');
});
test('reembolso integral confirmado exclui o valor dos produtos, sem usar o repasse líquido',async()=>{
 const r=order();r.payments[0].status='refunded';r.payments[0].net_received_amount=74;
 const {sales}=await run([r]);assert.equal(sales.revenue,0);assert.equal(sales.refundedRevenue,100);assert.equal(sales.refundedOrders,1);assert.equal(sales.paidRevenue,100);assert.equal(sales.status,'ready');
});
test('reembolso parcial do único produto, sem frete nem acréscimos, desconta só o valor confirmado',async()=>{
 const r=order(1,{status:'partially_refunded'});r.payments[0].transaction_amount_refunded=20;
 const {sales}=await run([r]);assert.equal(sales.revenue,80);assert.equal(sales.refundedRevenue,20);assert.equal(sales.refundReview,0);assert.equal(sales.status,'ready');
});
test('parcial sem valor bruto, com outros produtos, frete ou parcelamento não recebe rateio inventado',async()=>{
 const fixtures=[order(1,{status:'partially_refunded'}),order(1,{status:'partially_refunded'}),order(1,{status:'partially_refunded'}),order(1,{status:'partially_refunded'})];
 delete fixtures[0].payments[0].transaction_amount_refunded;
 fixtures[1].order_items.push({item:{id:otherId},quantity:1,unit_price:20});fixtures[1].payments[0].transaction_amount=120;fixtures[1].payments[0].transaction_amount_refunded=20;
 fixtures[2].payments[0].shipping_cost=10;fixtures[2].payments[0].transaction_amount_refunded=20;
 fixtures[3].payments[0].total_paid_amount=110;fixtures[3].payments[0].transaction_amount_refunded=20;
 for(const r of fixtures){const {sales}=await run([r]);assert.equal(sales.status,'review');assert.equal(sales.refundReview,1);assert.equal(sales.refundedRevenue,0);}
});
test('não entregue pago é mantido; entrega física ou tag não comprovam estorno',async()=>{
 const r=order(1,{shipping:{id:55},tags:['not_delivered']});
 const {sales}=await run([r],{shipments:{55:{id:55,status:'not_delivered'}}});assert.equal(sales.revenue,100);assert.equal(sales.notDeliveredPaidRevenue,100);assert.equal(sales.notDeliveredPaidOrders,1);assert.equal(sales.status,'ready');
 const returned=await run([r],{shipments:{55:{id:55,status:'returned'}}});assert.equal(returned.sales.revenue,100);
 r.payments[0].status='refunded';const refunded=await run([r],{shipments:{55:{id:55,status:'not_delivered'}}});assert.equal(refunded.sales.revenue,0);assert.equal(refunded.sales.refundedRevenue,100);
});
test('estado atual do envio prevalece sobre tag antiga, e falha logística não inventa reembolso',async()=>{
 const r=order(1,{shipping:{id:55},tags:['not_delivered']});const a=await run([r]);assert.equal(a.sales.notDeliveredPaidOrders,0);assert.equal(a.sales.revenue,100);
 const b=await run([r],{shippingError:true});assert.equal(b.sales.revenue,100);assert.equal(b.sales.logisticsReview,1);assert.equal(b.sales.refundedRevenue,0);
});
test('pagamento ausente, de outro recebedor ou misto sem alocação não fica confirmado',async()=>{
 const missing=order(1,{tags:['not_delivered'],payments:[]}),foreign=order();foreign.payments[0].collector.id=999;
 for(const r of [missing,foreign]){const {sales}=await run([r]);assert.equal(sales.status,'review');assert.equal(sales.financialReview,1);assert.equal(sales.notDeliveredPaidRevenue,0);}
 const mixed=order();mixed.payments.push({...mixed.payments[0],id:5000,status:'refunded'});assert.equal((await run([mixed])).sales.refundReview,1);
});
test('canceladas e não pagas não entram em receita e busca não expõe identificadores nem compradores',async()=>{
 const {sales}=await run([order(1,{status:'cancelled'}),order(2,{status:'pending_cancel'}),order(3,{status:'confirmed',payments:[]})]);assert.equal(sales.revenue,0);assert.equal(sales.orders,0);assert.equal(sales.cancelledRevenue,200);assert.equal(sales.cancelledOrders,2);assert.ok(!JSON.stringify(sales).includes('PRIVATE'));
});
test('cada lote cabe no limite gratuito, e soma final só é confirmada após todas as páginas',async()=>{
 const rows=Array.from({length:25},(_,i)=>order(i+1,{shipping:{id:100+i}})),f=setup(rows),{itemSalesPage,itemSales,SALES_FIELDS}=await import('../netlify/lib/ml-sales.mjs');
 const page=await itemSalesPage({itemId,sellerId,range,api:f.api});assert.equal(page.sales.complete,false);assert.equal(page.page.nextOffset,10);assert.ok(f.calls.length<=31);assert.ok(page.page.keys.every(k=>/^[a-f0-9]{64}$/.test(k)));assert.ok(!JSON.stringify(page).includes('PRIVATE'));
 const total=await itemSales({itemId,sellerId,range,api:setup(rows).api});assert.equal(total.revenue,2500);assert.equal(total.complete,true);assert.ok(core.validItemSales(total,total));assert.deepEqual(Array.from(core.ITEM_SALES_FIELDS),SALES_FIELDS);
});
test('cliente percorre páginas e rejeita totais que mudam, duplicações e resposta de outro item',async()=>{
 const rows=Array.from({length:21},(_,i)=>order(i+1)),f=setup(rows),{itemSalesPage}=await import('../netlify/lib/ml-sales.mjs'),a={itemId,sellerId,currency:'BRL',...range};let requests=0;
 ctx.mlRequest=async(action,{query})=>{assert.equal(action,'sales');requests++;return itemSalesPage({itemId,sellerId,range,offset:query.offset,expectedTotal:query.total??null,api:f.api});};
 const sales=await core.fetchItemSalesPages(a);assert.equal(requests,3);assert.equal(sales.revenue,2100);
 const first=await itemSalesPage({itemId,sellerId,range,api:setup(rows).api});
 for(const kind of ['total','duplicate','item']){let count=0;ctx.mlRequest=async()=>{count++;const p=structuredClone(first);if(count>1){p.page.offset=10;p.page.nextOffset=20;p.sales.complete=false;if(kind==='total')p.page.total++;if(kind==='item')p.sales.itemId=otherId;}return p;};await assert.rejects(core.fetchItemSalesPages(a));}
});
test('mudança de filtros interrompe a paginação, sem aproveitar soma parcial',async()=>{
 const {itemSalesPage}=await import('../netlify/lib/ml-sales.mjs'),rows=Array.from({length:11},(_,i)=>order(i+1));let active=true;
 ctx.mlRequest=async()=>{const result=await itemSalesPage({itemId,sellerId,range,api:setup(rows).api});active=false;return result;};await assert.rejects(core.fetchItemSalesPages({itemId,sellerId,...range},()=>active),/interrompida/);
});
test('períodos com pendência contaminam o total, e fonte antiga permanece legível sem TACOS confirmado',async()=>{
 const a=(await run([order()])).sales,b=(await run([order(2,{status:'partially_refunded'})])).sales,total=core.combineItemSales([a,b]);assert.equal(total.status,'review');assert.equal(total.refundReview,1);assert.equal(core.readyItemSales({...total,sales:total}),false);
 const old={source:'mercado-livre-orders-v1',basis:'paid-item-sales-created',itemId,sellerId,currency:'BRL',...range,revenue:100,cancelledRevenue:0,orders:1,units:2,cancelledOrders:0,refundReview:0,status:'ready'};assert.ok(core.validItemSales(old,old));assert.equal(core.readyItemSales({...old,sales:old}),false);
 const corrupt={...a,refundedRevenue:20};assert.equal(core.validItemSales(corrupt,corrupt),false);const copied=core.copyItemSales(a);assert.equal(copied.paidRevenue,100);assert.equal(copied.complete,true);
});
