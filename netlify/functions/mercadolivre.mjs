import { randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';
import { officialPricing } from '../lib/ml-tarifas.mjs';
import { shippingQuote } from '../lib/ml-frete.mjs';

const API='https://api.mercadolibre.com';
const SESSION='__Host-conduz_ml_session', FLOW='__Host-conduz_ml_oauth';
export const config={path:'/api/ml/:action'};

function safeUrl(value,domain){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname===domain||u.hostname.endsWith('.'+domain))?u.href:null;}catch{return null;}}
export function itemId(value){
 const input=String(value??'').trim();
 if(/^MLB-?\d{5,15}$/i.test(input))return input.toUpperCase().replace('-','');
 const url=safeUrl(input,'mercadolivre.com.br');if(!url)return null;
 const parsed=new URL(url),query=parsed.searchParams.get('item_id');
 if(query&&/^MLB\d{5,15}$/i.test(query))return query.toUpperCase();
 if(/^\/p\//.test(parsed.pathname))return null;
 const match=parsed.pathname.match(/(?:^|\/)MLB-?(\d{5,15})(?!\d)/i);return match?'MLB'+match[1]:null;
}
function attributeWeight(attribute){
 const struct=attribute?.value_struct??attribute?.values?.[0]?.struct;
 const raw=struct?`${struct.number} ${struct.unit}`:attribute?.value_name;
 const m=String(raw??'').trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|mg)$/i);if(!m)return null;
 const weight=Number(m[1].replace(',','.'))*({kg:1,g:.001,mg:.000001}[m[2].toLowerCase()]);
 return Number.isFinite(weight)&&weight>0&&weight<=1e6?Math.round(weight*1000)/1000:null;
}
export function normalizeItem(item){
 const id=itemId(item?.id);if(!id||!item||typeof item.title!=='string')throw new Error('INVALID_ITEM');
 let weight=null;for(const key of ['SELLER_PACKAGE_WEIGHT','PACKAGE_WEIGHT','WEIGHT']){weight=attributeWeight(item.attributes?.find(a=>a.id===key));if(weight!==null)break;}
 if(weight===null&&typeof item.shipping?.dimensions==='string'){
  const m=item.shipping.dimensions.match(/^\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?,(\d+(?:\.\d+)?)$/);
  if(m&&Number(m[1])>0)weight=Math.round(Number(m[1]))/1000;
 }
 if(!Number.isFinite(weight)||weight<=0||weight>1e6)weight=null;
 return {itemId:id,title:item.title.slice(0,256),categoryId:/^MLB\d+$/.test(item.category_id)?item.category_id:null,
  listingType:String(item.listing_type_id??'').slice(0,50),catalogProductId:/^MLB\d+$/.test(item.catalog_product_id)?item.catalog_product_id:null,
  permalink:safeUrl(item.permalink,'mercadolivre.com.br')??`https://produto.mercadolivre.com.br/MLB-${id.slice(3)}-_JM`,
  thumbnail:safeUrl(item.secure_thumbnail??item.pictures?.[0]?.secure_url??'','mlstatic.com'),weight,
  variationCount:Array.isArray(item.variations)?item.variations.length:0};
}
export function createHandler({env=process.env,fetchImpl=globalThis.fetch,now=Date.now}={}){
 const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Cookie'};
 function json(data,status=200,extra={}){return Response.json(data,{status,headers:{...headers,...extra}});}
 function settings(){
  const {ML_CLIENT_ID,ML_CLIENT_SECRET,ML_SESSION_SECRET,ML_REDIRECT_URI}=env;
  if(!/^\d+$/.test(ML_CLIENT_ID??'')||!ML_CLIENT_SECRET||!/[a-f0-9]{64}/i.test(ML_SESSION_SECRET??'')||ML_SESSION_SECRET.length!==64)return null;
  try{const u=new URL(ML_REDIRECT_URI);if(u.protocol!=='https:'||u.pathname!=='/api/ml/callback'||u.search||u.hash||u.username||u.password)return null;
   return {id:ML_CLIENT_ID,secret:ML_CLIENT_SECRET,key:Buffer.from(ML_SESSION_SECRET,'hex'),redirect:u.href,origin:u.origin};
  }catch{return null;}
 }
 function seal(value,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');}
 function unseal(value,key,type){try{const b=Buffer.from(value??'','base64url');if(b.length<29)return null;const decipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));decipher.setAuthTag(b.subarray(12,28));const data=JSON.parse(Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString());return data.type===type&&data.exp>now()?data:null;}catch{return null;}}
 const cookie=(name,value,seconds)=>`${name}=${value}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`;
 function cookies(req){return Object.fromEntries((req.headers.get('cookie')??'').split(';').map(s=>s.trim().split('=')));}
 async function api(path,token){
  const response=await fetchImpl(API+path,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok){const e=new Error('API_ERROR');e.status=response.status;throw e;}
  return response.json();
 }
 function session(req,cfg){return unseal(cookies(req)[SESSION],cfg.key,'session');}
 return async function handler(req,context={}){
  const action=context.params?.action??new URL(req.url).pathname.split('/').pop(),cfg=settings();
  if(action==='status'){
   if(req.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
   const s=cfg&&session(req,cfg);return json({configured:Boolean(cfg),connected:Boolean(s),account:s?{id:s.userId,nickname:s.nickname}:null,expiresAt:s?new Date(s.exp).toISOString():null});
  }
  if(!cfg)return json({error:'NOT_CONFIGURED',message:'A conexão com o Mercado Livre ainda precisa ser configurada pelo responsável pelo painel.'},503);
  const sameOrigin=()=>req.headers.get('origin')===cfg.origin&&req.headers.get('x-conduz-action')==='mercadolivre';
  if(action==='connect'){
   if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
   if(!sameOrigin())return json({error:'INVALID_ORIGIN'},403);
   const nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
   const auth=new URL('https://auth.mercadolivre.com.br/authorization');
   for(const [k,v] of Object.entries({response_type:'code',client_id:cfg.id,redirect_uri:cfg.redirect,state:nonce,scope:'read',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))auth.searchParams.set(k,v);
   return json({authorizationUrl:auth.href},200,{'Set-Cookie':cookie(FLOW,seal({type:'oauth',nonce,verifier,exp:now()+5*60*1000},cfg.key),300)});
  }
  if(action==='callback'){
   if(req.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
   const query=new URL(req.url).searchParams,flow=unseal(cookies(req)[FLOW],cfg.key,'oauth'),state=query.get('state')??'';
   const destination=new URL('/',cfg.origin);destination.searchParams.set('ml','error');
   const h=new Headers(headers);h.append('Set-Cookie',cookie(FLOW,'',0));
   try{
    if(!flow||state.length!==flow.nonce.length||!timingSafeEqual(Buffer.from(state),Buffer.from(flow.nonce))||query.has('error'))throw Error('INVALID_STATE');
    const code=query.get('code');if(!code||code.length>4096)throw Error('INVALID_CODE');
    const response=await fetchImpl(API+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'authorization_code',client_id:cfg.id,client_secret:cfg.secret,redirect_uri:cfg.redirect,code,code_verifier:flow.verifier}),redirect:'error',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('TOKEN_EXCHANGE_FAILED');const token=await response.json();
    if(typeof token.access_token!=='string'||!Number.isFinite(token.expires_in)||token.expires_in<60)throw Error('INVALID_TOKEN');
    const user=await api('/users/me',token.access_token);if(!Number.isSafeInteger(user.id)||user.id<=0)throw Error('INVALID_USER');
    const seconds=Math.floor(Math.min(token.expires_in,21600)),value=seal({type:'session',accessToken:token.access_token,userId:user.id,nickname:String(user.nickname??'Conta Mercado Livre').slice(0,80),exp:now()+seconds*1000},cfg.key);
    if(value.length>3800)throw Error('SESSION_TOO_LARGE');h.append('Set-Cookie',cookie(SESSION,value,seconds));destination.searchParams.set('ml','connected');
   }catch{/* Nunca devolve credenciais nem detalhes da troca OAuth ao navegador. */}
   h.set('Location',destination.href);return new Response(null,{status:303,headers:h});
  }
  if(action==='disconnect'){
   if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
   if(!sameOrigin())return json({error:'INVALID_ORIGIN'},403);
   return json({connected:false},200,{'Set-Cookie':cookie(SESSION,'',0)});
  }
  if(!['items','item','pricing','shipping'].includes(action))return json({error:'NOT_FOUND'},404);
  if(req.method!==(action==='pricing'?'POST':'GET'))return json({error:'METHOD_NOT_ALLOWED'},405);
  if(action==='pricing'&&!sameOrigin())return json({error:'INVALID_ORIGIN'},403);
  if(req.headers.get('origin')&&req.headers.get('origin')!==cfg.origin)return json({error:'INVALID_ORIGIN'},403);
  const s=session(req,cfg);if(!s)return json({error:'CONNECT_REQUIRED',message:'Conecte sua conta do Mercado Livre para consultar os anúncios.'},401);
  try{
   if(action==='pricing'){
    if(Number(req.headers.get('content-length'))>4096)return json({message:'Consulta muito grande.'},413);
    const raw=await req.text();if(raw.length>4096)return json({message:'Consulta muito grande.'},413);
    let input;try{input=JSON.parse(raw);}catch{return json({message:'Dados de cotação inválidos.'},400);}
    const id=itemId(input?.itemId);if(!id)return json({message:'Vincule um anúncio da sua conta para consultar suas tarifas.'},400);
    const item=await api('/items/'+id,s.accessToken);if(Number(item.seller_id)!==s.userId)return json({message:'Este anúncio não pertence à conta conectada.'},403);
    const pricing=await officialPricing({item,input,api:path=>api(path,s.accessToken),now});
    return json({pricing});
   }
   const query=new URL(req.url).searchParams;
   if(action==='items'){
    const cursor=query.get('cursor')??'';if(cursor.length>4096)return json({error:'INVALID_CURSOR'},400);
    const params=new URLSearchParams({search_type:'scan',limit:'20'});if(cursor)params.set('scroll_id',cursor);
    const list=await api(`/users/${s.userId}/items/search?${params}`,s.accessToken),ids=(list?.results??[]).filter(id=>itemId(id)===id).slice(0,20);
    if(!ids.length)return json({items:[],nextCursor:null});
    const bulk=await api('/items/bulk?'+new URLSearchParams({ids:ids.join(',')}),s.accessToken);
    if(!Array.isArray(bulk))throw Error('INVALID_RESPONSE');
    const items=bulk.filter(entry=>(entry.status_code??entry.code)===200&&Number(entry.body?.seller_id)===s.userId).map(entry=>normalizeItem(entry.body));
    return json({items,nextCursor:ids.length===20&&typeof list.scroll_id==='string'?list.scroll_id:null});
   }
   const id=itemId(query.get('id'));if(!id)return json({error:'INVALID_ID',message:'Informe o ID MLB ou o link do anúncio da sua conta.'},400);
   const item=await api('/items/'+id,s.accessToken);if(Number(item.seller_id)!==s.userId)return json({error:'NOT_YOUR_ITEM',message:'Este anúncio não pertence à conta conectada.'},403);
   const normalized=normalizeItem(item);let categoryName=normalized.categoryId,price=null;
   if(normalized.categoryId)try{const category=await api('/categories/'+normalized.categoryId,s.accessToken);if(typeof category.name==='string')categoryName=category.name.slice(0,80);}catch{}
   try{const sale=await api('/items/'+id+'/sale_price',s.accessToken);if(sale.currency_id==='BRL'&&Number.isFinite(sale.amount)&&sale.amount>=0)price=sale.amount;}catch{}
   let shipping=null,shippingMessage=null;
   try{shipping=await shippingQuote({item,price,api:path=>api(path,s.accessToken),now});}catch(error){if(action==='shipping')throw error;shippingMessage=error.shipping?error.message:'Não foi possível consultar o frete do vendedor. Tente novamente.';}
   if(action==='shipping')return json({shipping});
   return json({item:{...normalized,categoryName,price,sellerId:s.userId,fetchedAt:new Date(now()).toISOString(),...(shipping?{shippingQuote:shipping}:{})},shippingMessage});
  }catch(error){
   if(error.pricing)return json({error:'PRICING_UNAVAILABLE',message:error.message},422);
   const status=error.status;
   const message=status===401?'A sessão do Mercado Livre expirou. Conecte a conta novamente.':status===403?'A conta não tem permissão para consultar este recurso. Confira as permissões do aplicativo.':status===404?'Anúncio não encontrado. Confira o ID MLB.':status===429?'O Mercado Livre limitou as consultas. Aguarde e tente novamente.':'Não foi possível consultar o Mercado Livre agora. Tente novamente.';
   return json({error:'MERCADO_LIVRE_ERROR',message},[401,403,404,429].includes(status)?status:502);
  }
 };
}
export default createHandler();
