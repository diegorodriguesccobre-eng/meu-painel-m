const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCipheriv, randomBytes } = require('node:crypto');
const fs = require('node:fs'), vm = require('node:vm');
const origin = 'https://painel.example', time = Date.parse('2026-11-26T12:00:00Z');
const env = { ML_CLIENT_ID:'123', ML_CLIENT_SECRET:'TEST_ONLY', ML_SESSION_SECRET:'ab'.repeat(32), ML_REDIRECT_URI:origin+'/api/ml/callback', CATALOG_SELLER_ID:'123' };
function session(extra = {}) {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(env.ML_SESSION_SECRET,'hex'),iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify({type:'session',userId:123,nickname:'CONTA FICTÍCIA',accessToken:'TEST_ACCESS_NOT_REAL',exp:time+3600000,...extra})),cipher.final()]);
 return '__Host-conduz_ml_session='+Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
const input = () => ({ nickname:'Diego teste',role:'analista',acceptedTerms:true,acceptedPrivacy:true,termsVersion:'2026-11-26',privacyVersion:'2026-11-26' });
function request(action, token, data, headers = {}) {
 const post=data!==undefined;
 return new Request(origin+'/api/ml/'+action,{method:post?'POST':'GET',headers:{...(token?{Cookie:token}:{}),...(post?{Origin:origin,'Content-Type':'application/json','X-Conduz-Action':'mercadolivre','X-Conduz-Account':'123'}:{}),...headers},...(post?{body:JSON.stringify(data)}:{})});
}
async function app() {
 const {createWorker}=await import('../cloudflare/app.mjs');let calls=0;
 const worker=createWorker({now:()=>time,fetchImpl:async url=>{calls++;assert.ok(String(url).includes('/users/123/items/search'));return Response.json({results:[]});}});
 return {fetch:(req,overrides={})=>worker.fetch(req,{...env,...overrides}),calls:()=>calls};
}
test('conta conectada sem identificação não libera catálogo nem APIs de anúncios',async()=>{
 const a=await app(),token=session(),status=await(await a.fetch(request('status',token))).json();
 assert.equal(status.connected,true);assert.equal(status.accessRequired,true);assert.equal(status.accessGranted,false);assert.equal(status.profile,null);
 assert.equal((await a.fetch(request('catalog-items',token))).status,403);assert.equal(a.calls(),0);
 const response=await a.fetch(new Request(origin+'/api/catalog',{headers:{Cookie:token}}),{CATALOG_DB:{}});
 assert.equal(response.status,403);assert.equal((await response.json()).error,'PANEL_ACCESS_REQUIRED');
});
test('prosseguir valida conta, apelido, função e dois aceites no servidor, mantendo prazo e credenciais protegidas',async()=>{
 const a=await app(),token=session();
 for(const patch of [{nickname:' '},{role:'superadmin'},{acceptedTerms:false},{acceptedPrivacy:false},{acceptedTerms:'true'},{termsVersion:'antiga'},{privacyVersion:'antiga'},{nickname:'a'.repeat(61)}])assert.equal((await a.fetch(request('access',token,{...input(),...patch}))).status,400);
 assert.equal((await a.fetch(request('access',token,input(),{Origin:'https://outra.example'}))).status,403);
 assert.equal((await a.fetch(request('access',token,input(),{'X-Conduz-Account':'456'}))).status,409);
 assert.equal((await a.fetch(request('access',null,input()))).status,401);
 assert.equal((await a.fetch(request('access',token,input()),{CATALOG_SELLER_ID:'456'})).status,403);
 const response=await a.fetch(request('access',token,input())),data=await response.json(),saved=response.headers.get('set-cookie');
 assert.equal(response.status,200);assert.equal(data.profile.nickname,'Diego teste');assert.equal(data.profile.role,'analista');assert.equal(data.profile.acceptedAt,new Date(time).toISOString());assert.equal(data.accessGranted,true);
 assert.ok(saved.includes('Secure'));assert.ok(saved.includes('HttpOnly'));assert.ok(saved.includes('SameSite=Lax'));assert.ok(saved.includes('Max-Age=3600'));assert.ok(!saved.includes('TEST_ACCESS'));assert.ok(!JSON.stringify(data).includes('TEST_ACCESS'));
 const approved=saved.split(';')[0],status=await(await a.fetch(request('status',approved))).json();assert.equal(status.accessGranted,true);
 assert.equal((await a.fetch(request('catalog-items',approved))).status,200);assert.equal(a.calls(),1);
});
test('versões antigas, sessão expirada, cookie adulterado e perfil de outra conta não liberam o painel',async()=>{
 const a=await app(),profile={...input(),accountId:123,acceptedAt:new Date(time).toISOString()};
 for(const p of [{...profile,termsVersion:'antiga'},{...profile,accountId:456},{...profile,role:'hacker'}])assert.equal((await a.fetch(request('items',session({profile:p})))).status,403);
 assert.equal((await a.fetch(request('items',session({exp:time-1,profile})))).status,401);
 const bad=session({profile})+'corrompido';assert.equal((await a.fetch(request('items',bad))).status,401);assert.equal(a.calls(),0);
});

function uiApp() {
 const nodes=new Map(),calls=[],get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',checked:false,disabled:false,inert:false,open:false,classList:{values:new Set(),toggle(k,v){v?this.values.add(k):this.values.delete(k);}},setAttribute(){},focus(){},reset(){},reportValidity(){return true;}});return nodes.get(id);};
 const c=vm.createContext({document:{getElementById:get,querySelectorAll:()=>[]},setTimeout:()=>1,clearTimeout(){},Date,mlRequest:async(...args)=>{calls.push(args);return {};},initializeMercadoLivre:async()=>{},connectMercadoLivre(){},toast(){},renderMlConnection(){},ConduzCatalog:{disconnect(){}},resetMlCatalog(){},resetKitEditor(){}});
 vm.runInContext('let activeCatalogAccount="123",mlConnection={configured:true,connected:true,account:{id:123,nickname:"TESTE"},policyVersion:"2026-11-26"},mlLookupVersion=0,mlAdsEpoch=0;',c);
 vm.runInContext(fs.readFileSync('src/panel-access.js','utf8'),c);return {get,c,calls,api:c.ConduzAccess,run:s=>vm.runInContext(s,c)};
}
test('tela de entrada mantém painel oculto, aceites vazios e não revela dados de outra empresa',async()=>{
 const a=uiApp(),connection={configured:true,connected:true,account:{id:123,nickname:'TESTE'}};
 assert.equal(a.api.acceptConnection(connection),false);assert.equal(a.get('app-shell').inert,true);assert.equal(a.get('access-terms').checked,false);assert.equal(a.get('access-privacy').checked,false);
 const allowed={...connection,accessGranted:true,profile:{nickname:'Pessoa',role:'administrador'}};
 assert.equal(a.api.acceptConnection(allowed),true);assert.equal(a.api.enterPanel(allowed),true);assert.equal(a.get('app-shell').inert,false);assert.equal(a.get('access-session').textContent,'Pessoa · ADM');
 assert.equal(a.api.enterPanel({...allowed,account:{id:456}}),false);
 a.api.acceptConnection({...connection,connected:false});assert.equal(a.get('app-shell').inert,true);
});
test('Prosseguir envia identificação e aceites explícitos; função não vira permissão e Sair encerra a sessão',async()=>{
 const a=uiApp();a.get('access-nickname').value='Pessoa';a.get('access-role').value='dono';a.get('access-terms').checked=true;a.get('access-privacy').checked=true;
 await a.get('access-form').onsubmit({preventDefault(){}});assert.equal(a.calls.length,1);assert.equal(a.calls[0][0],'access');assert.equal(a.calls[0][1].body.role,'dono');assert.equal(a.calls[0][1].body.acceptedTerms,true);
 await a.get('access-signout').onclick();assert.equal(a.calls[1][0],'disconnect');assert.equal(a.get('access-terms').checked,false);assert.equal(a.get('access-privacy').checked,false);assert.equal(a.get('access-nickname').value,'');
});
