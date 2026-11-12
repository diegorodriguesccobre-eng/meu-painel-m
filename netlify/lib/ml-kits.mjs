import { officialPricing } from './ml-tarifas.mjs';
const fail=message=>{throw Object.assign(new Error(message),{pricing:true});};
export async function kitPricing({input,sellerId,api,now=Date.now}){
 const c=input?.context;
 if(!c||!/^MLB\d+$/.test(c.categoryId??'')||!/^MLB\d{5,15}$/.test(c.referenceItemId??''))fail('Escolha a categoria do kit e um anúncio da sua conta como referência de logística.');
 const dimensions=c.dimensions??null;
 if(dimensions!==null&&(!['height','width','length'].every(k=>Number.isFinite(dimensions[k])&&dimensions[k]>0&&dimensions[k]<=1000)))fail('Informe as três medidas da embalagem do kit em centímetros, ou deixe as três vazias.');
 const reference=await api('/items/'+c.referenceItemId);
 if(Number(reference.seller_id)!==sellerId)fail('A referência de logística deve ser um anúncio da conta conectada.');
 const category=await api('/categories/'+c.categoryId);
 if(category.id!==c.categoryId||!Array.isArray(category.children_categories)||category.children_categories.length||category.settings?.listing_allowed===false||category.settings?.status==='disabled')fail('Escolha uma categoria final válida para o kit.');
 if(category.settings?.shipping_modes&&!category.settings.shipping_modes.includes('me2'))fail('A categoria do kit não aceita Mercado Envios 2. Confira o frete manualmente.');
 const context={categoryId:category.id,categoryName:String(category.name??category.id).slice(0,80),referenceItemId:reference.id,dimensions};
 // Não herda peso, dimensões, categoria ou frete do produto de referência.
 const item={id:reference.id,seller_id:sellerId,category_id:category.id,domain_id:category.settings?.catalog_domain,condition:'new',listing_type_id:'gold_special',isKit:true,attributes:[],tags:[],shipping:{mode:reference.shipping?.mode,logistic_type:reference.shipping?.logistic_type,free_shipping:false,tags:[],dimensions:dimensions?`${dimensions.height}x${dimensions.width}x${dimensions.length},${Math.ceil(input.weight*1000)}`:null}};
 const pricing=await officialPricing({item,input:{...input,autoShipping:true},api,now});
 return {...pricing,kind:'kit',context};
}
