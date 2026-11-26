/* Worker completo, D1 em memória e API fictícia. Nenhum serviço externo é consultado. */
const http=require('node:http'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {createCipheriv,randomBytes,randomUUID}=require('node:crypto');
const fixtures=require('./ml-import-fixtures.cjs');
async function startLab(){
 const {createWorker}=await import('../../cloudflare/app.mjs');
 const sql=new DatabaseSync(':memory:');for(const file of ['0001_catalog.sql','0002_ml_account_controls.sql'])sql.exec(fs.readFileSync('cloudflare/migrations/'+file,'utf8'));
 const db={prepare(sqlText){return {sql:sqlText,values:[],bind(...values){return {...this,values};},async first(){return sql.prepare(this.sql).get(...this.values)??null;}};},async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>{const q=sql.prepare(s.sql);return /^SELECT/.test(s.sql)?{results:q.all(...s.values),meta:{changes:0}}:{results:[],meta:{changes:Number(q.run(...s.values).changes)}};});sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}},withSession(){return db;}};
 const env={CATALOG_DB:db,CATALOG_SELLER_ID:'123',ML_ACCOUNT_CONTROLS:'true',PANEL_LOGIN_REQUIRED:'false',ML_CLIENT_ID:'1',ML_CLIENT_SECRET:'TEST_ONLY',ML_SESSION_SECRET:'ab'.repeat(32),ML_REDIRECT_URI:'https://controls-lab.example/api/ml/callback'};
 let token='';const setSession=epoch=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(env.ML_SESSION_SECRET,'hex'),iv),bytes=Buffer.concat([cipher.update(JSON.stringify({type:'session',dataEpoch:epoch,userId:123,exp:Date.now()+21600000,accessToken:'TEST_ONLY',nickname:'EMPRESA FICTÍCIA'})),cipher.final()]);token='__Host-conduz_ml_session='+Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');};setSession(0);
 const ids=['MLB1234567890','MLB9000000001','MLB9000000002'];
 const item=id=>({id,seller_id:123,title:'Produto fictício '+id,status:id.endsWith('2')?'closed':'active',category_id:'MLB1000',listing_type_id:'gold_special',condition:'new',permalink:'https://produto.mercadolivre.com.br/MLB-'+id.slice(3)+'-_JM',attributes:[{id:'SELLER_SKU',value_name:'SKU-'+id},{id:'WEIGHT',value_name:'0.3 kg'}],shipping:{mode:'me2',logistic_type:'xd_drop_off',free_shipping:true}});
 const worker=createWorker({fetchImpl:async url=>{
  const u=new URL(url),p=u.pathname;
  if(p==='/users/me')return Response.json({id:123,nickname:'EMPRESA FICTÍCIA'});
  if(p==='/users/123/items/search')return Response.json({results:ids});
  if(p==='/items/bulk')return Response.json(u.searchParams.get('ids').split(',').map(id=>({code:200,body:item(id)})));
  if(/^\/items\/MLB\d+\/sale_price$/.test(p))return Response.json({amount:55,currency_id:'BRL'});
  if(/^\/items\/MLB\d+$/.test(p))return Response.json(item(p.split('/').pop()));
  if(p==='/categories/MLB1000')return Response.json({name:'Categoria fictícia'});
  if(p==='/users/123/shipping_options/free')return Response.json({coverage:{all_country:{list_cost:5,currency_id:'BRL',billable_weight:300}}});
  if(p==='/sites/MLB/listing_prices'){const price=Number(u.searchParams.get('price'));return Response.json(['gold_special','gold_pro'].map((listing_type_id,i)=>({listing_type_id,currency_id:'BRL',listing_fee_amount:0,sale_fee_amount:Math.round(price*(11+i*3))/100,sale_fee_details:{percentage_fee:11+i*3,fixed_fee:0}})));}
  return Response.json({error:'FICTITIOUS_UNAVAILABLE'},{status:503});
 }});
 const seed=fixtures.data();seed.pendingProducts=ids.slice(1).map(id=>({id:'pending-'+id,item:fixtures.response(id).item,margin:20,feeSnapshot:structuredClone(seed.fees),importedAt:fixtures.stamp}));
 const backend=(path,method='GET',body,extra={})=>worker.fetch(new Request('https://controls-lab.example'+path,{method,headers:{Cookie:token,Origin:'https://controls-lab.example','Content-Type':'application/json','X-Conduz-Action':path.startsWith('/api/catalog')?'catalog':'mercadolivre','X-Conduz-Catalog-Account':'123','X-Conduz-Account':'123',...extra},...(body?{body}: {})}),env);
 const initial=await backend('/api/catalog','PUT',JSON.stringify({schemaVersion:4,revision:0,mutationId:randomUUID(),data:seed}));if(!initial.ok)throw Error(await initial.text());
 const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://127.0.0.1:43185');
  if(u.pathname==='/__lab'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<h1>Laboratório de controles · somente dados fictícios</h1><form action="/__lab/reconnect" method="post"><button>Reativar conta fictícia</button></form><a href="/">Abrir painel fictício</a>');}
  if(u.pathname==='/__lab/reconnect'&&req.method==='POST'){sql.prepare('UPDATE ml_account_controls SET enabled=1').run();setSession(sql.prepare('SELECT data_epoch FROM ml_account_controls WHERE seller_id=?').get('123')?.data_epoch??0);res.writeHead(303,{Location:'/'});return res.end();}
  if(u.pathname.startsWith('/api/')){const bytes=[];for await(const part of req)bytes.push(part);const response=await backend(u.pathname+u.search,req.method,bytes.length?Buffer.concat(bytes).toString():undefined,{'X-Conduz-Data-Epoch':req.headers['x-conduz-data-epoch']??'0',...(req.headers['if-none-match']?{'If-None-Match':req.headers['if-none-match']}:{})});res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(await response.text());}
  if(u.pathname==='/'){const html=require('../../preparar-site.cjs').compilePage().replace('<body>','<body><aside style="padding:8px;background:#633;color:white;text-align:center">TESTE LOCAL · DADOS FICTÍCIOS · SEM ACESSO À PRODUÇÃO</aside>');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);}
  res.writeHead(404);res.end();
 }catch(error){res.writeHead(500);res.end(error.message);}});
 await new Promise(r=>server.listen(43185,'127.0.0.1',r));console.log('Controles de contas · dados fictícios: http://127.0.0.1:43185/');
 process.on('SIGINT',()=>server.close(()=>{sql.close();process.exit();}));
}
startLab().catch(error=>{console.error(error);process.exitCode=1;});
