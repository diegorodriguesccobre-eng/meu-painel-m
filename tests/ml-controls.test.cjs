const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createCipheriv,randomBytes,randomUUID}=require('node:crypto');
const fs=require('node:fs');
const fixtures=require('./support/ml-import-fixtures.cjs');
const load=Promise.all([import('../cloudflare/app.mjs'),import('../cloudflare/ml-account-controls.mjs')]);
const origin='https://painel.example',start=Date.parse('2026-11-26T14:00:00Z');
function setup(t){
 const sql=new DatabaseSync(':memory:');for(const name of ['0001_catalog.sql','0002_ml_account_controls.sql'])sql.exec(fs.readFileSync('cloudflare/migrations/'+name,'utf8'));t.after(()=>sql.close());
 const db={fail:false,prepare(sqlText){return {sql:sqlText,values:[],bind(...values){return {...this,values};},async first(){return sql.prepare(this.sql).get(...this.values)??null;}};},async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>{if(db.fail&&s.sql.startsWith('INSERT INTO ml_account_controls'))throw Error('Falha na política');const q=sql.prepare(s.sql);return /^SELECT/.test(s.sql)?{results:q.all(...s.values),meta:{changes:0}}:{results:[],meta:{changes:Number(q.run(...s.values).changes)}};});sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}},withSession(){return db;}};
 const a={db,sql,time:start,calls:[],networkStatus:200};
 a.env={CATALOG_DB:db,ML_ACCOUNT_CONTROLS:'true',CATALOG_SELLER_ID:'123',PANEL_LOGIN_REQUIRED:'false',ML_CLIENT_ID:'1',ML_CLIENT_SECRET:'TEST_ONLY',ML_SESSION_SECRET:'ab'.repeat(32),ML_REDIRECT_URI:origin+'/api/ml/callback'};
 a.fetch=async(url,init)=>{a.calls.push({url,method:init.method??'GET'});if(a.networkStatus!==200)return Response.json({error:'TEST_ONLY'},{status:a.networkStatus,headers:{'Retry-After':'120'}});if(url.endsWith('/users/me'))return Response.json({id:123,nickname:'TESTE'});throw Error('Rede inesperada: '+url);};
 a.cookie=(epoch=0,id=123,token='TEST_ONLY')=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(a.env.ML_SESSION_SECRET,'hex'),iv);const bytes=Buffer.concat([cipher.update(JSON.stringify({type:'session',userId:id,exp:a.time+21600000,accessToken:token,dataEpoch:epoch,nickname:'TESTE'})),cipher.final()]);return '__Host-conduz_ml_session='+Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');};
 a.request=(path='/api/catalog',method='GET',body,epoch=0)=>new Request(origin+path,{method,headers:{Cookie:a.cookie(epoch),Origin:origin,'X-Conduz-Action':path.startsWith('/api/catalog')?'catalog':'mercadolivre','X-Conduz-Catalog-Account':'123','X-Conduz-Account':'123','X-Conduz-Data-Epoch':String(epoch),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return a;
}
function catalog(){const data=fixtures.data();data.pendingProducts=[{id:'pending',item:fixtures.response('MLB9000000001').item,margin:27,feeSnapshot:structuredClone(data.fees),importedAt:fixtures.stamp}];return data;}
const body=(data,revision=0)=>({schemaVersion:4,data,revision,mutationId:randomUUID()});

test('reserva atômica compartilha a cota entre funcionários e devolve chamadas não usadas',async t=>{
 const a=setup(t),[, {createAccountControls}]=await load;const controls=Array.from({length:9},()=>createAccountControls({env:a.env,fetchImpl:a.fetch,now:()=>a.time}));
 const results=await Promise.allSettled(controls.map(c=>c.beforeCall(123)));assert.equal(results.filter(r=>r.status==='fulfilled').length,7);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===429).length,2);
 await Promise.all(controls.map(c=>c.finish()));assert.equal(a.sql.prepare('SELECT minute_calls FROM ml_query_usage').get().minute_calls,7);assert.equal(a.sql.prepare('SELECT day_calls FROM ml_query_usage').get().day_calls,7);
});
test('limite diário e pausa do Mercado Livre valem para outra instância e virada de janela não recebe desconto incorreto',async t=>{
 const a=setup(t),[, {createAccountControls,ACCOUNT_DAY_LIMIT}]=await load,make=()=>createAccountControls({env:a.env,fetchImpl:a.fetch,now:()=>a.time});
 const first=make();await first.beforeCall(123);await first.blocked(123,new Response('',{status:429,headers:{'Retry-After':'120'}}));await first.finish();await assert.rejects(make().beforeCall(123),e=>e.status===429&&e.retryAfter>=120);
 a.time+=121000;const second=make();await second.beforeCall(123);a.time+=60000;const third=make();await third.beforeCall(123);await second.finish();assert.equal(a.sql.prepare('SELECT minute_calls FROM ml_query_usage').get().minute_calls,40);await third.finish();
 a.sql.prepare('UPDATE ml_query_usage SET day_calls=?').run(ACCOUNT_DAY_LIMIT-20);await assert.rejects(make().beforeCall(123),e=>e.status===429&&e.retryAfter>60);assert.equal(a.calls.length,0);
});
test('confirma autorização em cinco minutos sem guardar token e recusa consulta quando a validação falha',async t=>{
 const a=setup(t),[{createWorker}]=await load,worker=createWorker({fetchImpl:a.fetch,now:()=>a.time});
 for(let i=0;i<2;i++)assert.equal((await worker.fetch(a.request('/api/ml/status'),a.env)).status,200);assert.equal(a.calls.length,1);
 assert.ok(!JSON.stringify(a.sql.prepare('SELECT * FROM ml_session_checks').all()).includes('TEST_ONLY'));
 a.time+=300001;a.networkStatus=500;assert.equal((await worker.fetch(a.request(),a.env)).status,503);
 a.networkStatus=401;assert.equal((await worker.fetch(a.request(),a.env)).status,401);const n=a.calls.length;assert.equal((await worker.fetch(a.request(),a.env)).status,401);assert.equal(a.calls.length,n);
 assert.equal(a.sql.prepare('SELECT count(*) AS n FROM catalog_heads').get().n,0);
});
test('reserva de renovação impede trabalhos duplicados e falha não marca catálogo como atualizado',async t=>{
 const a=setup(t),[, {createAccountControls}]=await load,c=createAccountControls({env:a.env,fetchImpl:a.fetch,now:()=>a.time});
 const [one,two]=await Promise.all([c.lease(123),c.lease(123)]);assert.equal(Number(one.acquired)+Number(two.acquired),1);const lease=one.acquired?one:two;
 await c.lease(123,lease.owner,false,true);assert.equal(a.sql.prepare('SELECT refreshed_at FROM ml_account_controls').get().refreshed_at,0);
 const retry=await c.lease(123);assert.equal(retry.acquired,true);await c.lease(123,retry.owner,true);assert.equal((await c.lease(123)).acquired,false);
 a.time+=5*3600000+1;assert.equal((await c.lease(123)).acquired,true);await assert.rejects(c.lease(123,retry.owner,true),e=>e.status===409);
});
test('revisar não remove dados e confirmação exige origem, texto, conta e revisão corretos',async t=>{
 const a=setup(t),[{createWorker}]=await load,worker=createWorker({fetchImpl:a.fetch,now:()=>a.time}),data=catalog();
 assert.equal((await worker.fetch(a.request('/api/catalog','PUT',body(data)),a.env)).status,200);
 const preview=await (await worker.fetch(a.request('/api/catalog/lifecycle'),a.env)).json();assert.equal(preview.counts.products,2);assert.equal(preview.counts.pending,1);
 for(const input of [{action:'purge-imported',confirmation:'',revision:1},{action:'purge-imported',confirmation:'REMOVER IMPORTADOS',revision:0}])assert.ok((await worker.fetch(a.request('/api/catalog/lifecycle','POST',input),a.env)).status>=400);
 assert.deepEqual((await (await worker.fetch(a.request(),a.env)).json()).data,data);
});
test('encerrar remove somente importados, preserva custos e conciliações, elimina versão anterior e bloqueia sessões antigas',async t=>{
 const a=setup(t),[{createWorker},{createAccountControls}]=await load,worker=createWorker({fetchImpl:a.fetch,now:()=>a.time}),data=catalog();
 await worker.fetch(a.request('/api/catalog','PUT',body(data)),a.env);
 const result=await worker.fetch(a.request('/api/catalog/lifecycle','POST',{action:'purge-imported',confirmation:'REMOVER IMPORTADOS',revision:1}),a.env);assert.equal(result.status,200);const saved=await result.json();
 assert.equal(saved.data.products[0].cost,data.products[0].cost);assert.equal(saved.data.products[0].margin,data.products[0].margin);assert.deepEqual(saved.data.kits.map(k=>k.items),data.kits.map(k=>k.items));assert.deepEqual(saved.data.adsReconciliations,data.adsReconciliations);assert.deepEqual(saved.data.fees,data.fees);
 assert.equal(saved.data.products[0].mercadoLivre,undefined);assert.equal(saved.data.products[0].mlPricing,undefined);assert.equal(saved.data.products[0].mlAds,undefined);assert.equal(saved.data.pendingProducts.length,0);assert.equal(saved.data.adsReports.length,0);
 assert.deepEqual(a.sql.prepare('SELECT DISTINCT revision FROM catalog_chunks').all().map(r=>r.revision),[2]);
 for(const path of ['/api/catalog','/api/ml/status']){const response=await worker.fetch(a.request(path),a.env);assert.equal(response.status,401);assert.equal((await response.json()).error,'INTEGRATION_ENDED');}
 const control=createAccountControls({env:a.env,fetchImpl:a.fetch,now:()=>a.time});assert.equal(await control.connected(123),1);
 assert.equal((await worker.fetch(a.request(),a.env)).status,401);const fresh=await worker.fetch(a.request('/api/catalog','GET',null,1),a.env);assert.equal(fresh.status,200);assert.equal((await fresh.json()).data.products[0].cost,10);
 const restored=await worker.fetch(a.request('/api/catalog','PUT',body(data,2),1),a.env);assert.equal(restored.status,200);const check=await (await worker.fetch(a.request('/api/catalog','GET',null,1),a.env)).json();assert.equal(check.data.products[0].mercadoLivre,undefined);assert.equal(check.data.pendingProducts.length,0);assert.deepEqual(check.data.adsReconciliations,data.adsReconciliations);
});
test('falha na remoção faz rollback do catálogo e da política da empresa',async t=>{
 const a=setup(t),[{createWorker}]=await load,worker=createWorker({fetchImpl:a.fetch,now:()=>a.time}),data=catalog();await worker.fetch(a.request('/api/catalog','PUT',body(data)),a.env);a.db.fail=true;
 assert.equal((await worker.fetch(a.request('/api/catalog/lifecycle','POST',{action:'purge-imported',confirmation:'REMOVER IMPORTADOS',revision:1}),a.env)).status,503);a.db.fail=false;
 assert.deepEqual((await (await worker.fetch(a.request(),a.env)).json()).data,data);assert.equal(a.sql.prepare('SELECT count(*) AS n FROM ml_account_controls WHERE enabled=0').get().n,0);
});
test('dados da outra empresa e chamadas sem permissão não usam a cota da conta liberada',async t=>{
 const a=setup(t),[{createWorker}]=await load,worker=createWorker({fetchImpl:a.fetch,now:()=>a.time});const request=a.request('/api/ml/status');request.headers.set('Cookie',a.cookie(0,456));assert.equal((await worker.fetch(request,a.env)).status,403);assert.equal(a.calls.length,0);assert.equal(a.sql.prepare('SELECT count(*) AS n FROM ml_query_usage').get().n,0);
});
