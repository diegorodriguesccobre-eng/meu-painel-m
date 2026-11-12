const unavailable=message=>{throw Object.assign(new Error(message),{shipping:true,pricing:true});};
export async function shippingQuote({item,price=null,listingType=item.listing_type_id,forceFree=false,weight=null,api,now=Date.now}){
 if(item.shipping?.mode!=='me2')unavailable('O anúncio não usa Mercado Envios 2. O Mercado Livre não disponibiliza esta cotação automática para o modo de envio informado.');
 if(!Number.isSafeInteger(item.seller_id)||!/^MLB\d{5,15}$/.test(item.id??'')||!['gold_special','gold_pro'].includes(listingType)||!/^[a-z0-9_]{2,40}$/.test(item.shipping.logistic_type??''))unavailable('Faltam dados de logística no anúncio para consultar o frete.');
 const hasPrice=Number.isFinite(price)&&price>0,mandatoryCurrent=item.shipping.tags?.includes('mandatory_free_shipping')===true;
 const tableApplies=item.condition==='new'&&['fulfillment','cross_docking','xd_drop_off','drop_off'].includes(item.shipping.logistic_type);
 // Ajuda 40538: novos em Full/Coleta/Agências oferecem frete rápido a partir de R$79.
 // Abaixo dessa faixa, a API ainda pode retornar custo para o vendedor.
 const freeShipping=forceFree||(hasPrice&&tableApplies?price>=79||item.shipping.free_shipping===true&&!mandatoryCurrent:item.shipping.free_shipping===true||mandatoryCurrent);
 const params=new URLSearchParams({item_id:item.id,listing_type_id:listingType,currency_id:'BRL',mode:'me2',logistic_type:item.shipping.logistic_type,free_shipping:String(freeShipping),verbose:'true'});
 if(Number.isFinite(price)&&price>0)params.set('item_price',price.toFixed(2));
 if(['new','used','not_specified'].includes(item.condition))params.set('condition',item.condition);
 // Mantém dimensões reais; nunca cria um pacote fictício para obter um frete.
 const dimensions=item.shipping.dimensions;
 if(typeof dimensions==='string'&&/^\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?,\d+(?:\.\d+)?$/.test(dimensions))params.set('dimensions',weight>0?dimensions.split(',')[0]+','+Math.ceil(weight*1000):dimensions);
 let data;
 try{data=await api(`/users/${item.seller_id}/shipping_options/free?${params}`);}catch(error){
  if([401,429].includes(error.status))throw error;
  unavailable('O Mercado Livre não retornou o custo de frete deste anúncio. O valor não foi considerado zero; tente consultar novamente.');
 }
 const value=data?.coverage?.all_country;
 if(value?.currency_id!=='BRL'||typeof value.list_cost!=='number'||!Number.isFinite(value.list_cost)||value.list_cost<0||value.list_cost>1e9)unavailable('A cotação de frete veio incompleta. Consulte novamente antes de salvar.');
 // list_cost já contém o desconto de frete do vendedor quando verbose=true.
 return {source:'mercadolivre-shipping-options',itemId:item.id,amount:value.list_cost,currency:'BRL',fetchedAt:new Date(now()).toISOString(),price:Number.isFinite(price)&&price>0?price:null,listingType,shippingMode:'me2',logisticType:item.shipping.logistic_type,freeShipping,billableWeight:Number.isFinite(value.billable_weight)&&value.billable_weight>0?value.billable_weight:null};
}
