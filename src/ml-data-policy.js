/* Renovação coordenada, limites compartilhados e encerramento revisável da integração. */
(function () {
 'use strict';
 const ui=id=>document.getElementById(id),rules=globalThis.ConduzMlDataRules;
 if(!rules||typeof document==='undefined'||!ui('ml-data-status'))return;
 const policies=new Map(),waits=new Map();let owner=null,busy=false,generation=0,timer=null,expiryTimer=null,nextRefresh=0,lastCheck=0,review=null;
 const account=()=>mlConnection.account?.id;
 const editing=()=>['product-dialog','restore-dialog','import-dialog','ads-reconcile-dialog','cloud-review-dialog','ml-retention-dialog'].some(id=>ui(id)?.open)||globalThis.ConduzMlImport?.isReviewOpen()||kitEditing||kitItems.size||currentPricesBusy||mlAdsBusy||adsUi.busy||adsHistoryUi.busy;
 const policyFor=id=>policies.get(String(id));
 function sanitizeLocal(data,id=activeCatalogAccount){const p=policyFor(id);return p?.purgedAt?(p.enabled?rules.sanitize(data,p.purgedAt):rules.purge(data)):data;}
 function acceptPolicy(p){
  if(!p||!/^\d+$/.test(p.sellerId)||!Number.isSafeInteger(p.epoch)||p.epoch<0||typeof p.enabled!=='boolean'||p.purgedAt!==null&&!Number.isFinite(Date.parse(p.purgedAt)))throw Error('A política de dados da conta é inválida.');
  policies.set(p.sellerId,p);
  if(!p.purgedAt)return;
  const clean=data=>p.enabled?rules.sanitize(data,p.purgedAt):rules.purge(data);
  try{
   const key=accountCatalogKey(p.sellerId),raw=localStorage.getItem(key);
   if(raw){const data=JSON.parse(raw);if(validState(data))localStorage.setItem(key,JSON.stringify(clean(data)));}
   const syncKey='conduz.catalog.sync.v1.'+p.sellerId,cached=localStorage.getItem(syncKey);
   if(cached){const meta=JSON.parse(cached);if(meta.base){meta.base=clean(meta.base);localStorage.setItem(syncKey,JSON.stringify(meta));}}
   const backupKey='conduz.catalog.before-sharing.'+p.sellerId,backup=localStorage.getItem(backupKey);
   if(backup){const saved=JSON.parse(backup);if(saved.data){saved.data=clean(saved.data);localStorage.setItem(backupKey,JSON.stringify(saved));}}
   const draftKey='conduz.mlProductDraft.'+p.sellerId,draft=sessionStorage.getItem(draftKey);
   if(draft){const saved=JSON.parse(draft);delete saved.linked;sessionStorage.setItem(draftKey,JSON.stringify(saved));}
   if(String(activeCatalogAccount)===p.sellerId){const next=clean(state);if(JSON.stringify(next)!==JSON.stringify(state)){state=next;localStorage.setItem(KEY,JSON.stringify(state));render();}}
  }catch{ui('ml-data-status').textContent='A integração foi encerrada, mas esta cópia local não pôde ser limpa. Não use os dados importados; libere o armazenamento e recarregue o painel.';}
 }
 function noteError(error){if(error.status===429&&account()){const seconds=Math.max(1,error.retryAfter||60);waits.set(String(account()),Date.now()+seconds*1000);nextRefresh=Date.now()+seconds*1000;ui('ml-data-status').textContent='Consultas da empresa em espera até '+new Date(nextRefresh).toLocaleTimeString('pt-BR')+'. Custos e margens preservados.';}}
 function checkWait(action){const until=waits.get(String(account()))??0;if(!['status','connect','disconnect','access','refresh-lease'].includes(action)&&until>Date.now())throw Object.assign(Error('As consultas desta empresa estão em espera. Aguarde até '+new Date(until).toLocaleTimeString('pt-BR')+'.'),{status:429,retryAfter:Math.ceil((until-Date.now())/1000)});}
 function queue(){if(timer!==null)return;timer=setTimeout(()=>{timer=null;refresh();},700);}
 function scheduleExpiry(){
  clearTimeout(expiryTimer);const stamps=[...state.products.map(p=>p.mercadoLivre),...(state.pendingProducts??[]).map(p=>p.item)].filter(item=>rules.fresh(item)).map(item=>Date.parse(item.fetchedAt)+rules.TTL-Date.now());
  if(stamps.length)expiryTimer=setTimeout(()=>{render();scheduleExpiry();},Math.max(10,Math.min(...stamps)+10));
 }
 async function refresh(){
  if(busy||!owner||!mlConnection.connected||account()!==owner||document.hidden||editing()||Date.now()<nextRefresh||!globalThis.ConduzCatalog?.readyForImport(owner))return;
  const id=owner,version=generation,active=()=>generation===version&&owner===id&&mlConnection.connected&&account()===id;
  busy=true;let lease=null,done=false;
  try{
   lease=await mlRequest('refresh-lease',{method:'POST',body:{}});if(!active())return;
   if(!lease.acquired){nextRefresh=Math.max(Date.now()+60000,lease.retryAt||0);ui('ml-data-status').textContent='A renovação é compartilhada entre os funcionários. Próxima conferência até '+new Date(nextRefresh).toLocaleString('pt-BR')+'.';return;}
   const result=await ConduzMlImport.refreshCatalog({data:JSON.parse(JSON.stringify(state)),sellerId:id,request:mlRequest,active,progress:text=>{if(active())ui('ml-data-status').textContent=text;}});
   if(!active()||!result)return;
   if(editing()){nextRefresh=Date.now()+60000;return;}
   const previous=state,applied=ConduzMlImport.applyRefresh(state,result,id);state=applied.data;
   if(!persist()){state=previous;throw Error('Não foi possível gravar a renovação. Custos e margens anteriores preservados.');}
   render();await ConduzCatalog.sync();if(!active())return;
   const failures=result.failed.length+applied.skipped+(ConduzCatalog.isSynced(id)?0:1);scheduleExpiry();
   done=!failures;nextRefresh=Date.now()+(done?5*3600000:5*60000);
   ui('ml-data-status').textContent=done?'Anúncios renovados em '+new Date().toLocaleString('pt-BR')+'. Nova conferência em até 5 horas enquanto o painel estiver aberto. Dados com mais de 6 horas não são apresentados como atuais.':failures+' anúncio(s) aguardam nova conferência. Custos e margens preservados; dados vencidos ficam indisponíveis.';
   ui('ml-catalog-auto-status').textContent=result.items.length+' anúncio(s) consultado(s). Novos anúncios permanecem pendentes de custo; cadastros anteriores foram preservados.';
  }catch(error){if(active()){noteError(error);nextRefresh=Math.max(nextRefresh,Date.now()+5*60000);ui('ml-data-status').textContent=error.message+' Os dados vencidos não serão apresentados como atuais.';}}
  finally{
   if(lease?.owner&&active())try{await mlRequest('refresh-lease',{method:'POST',body:{owner:lease.owner,complete:done,release:!done}});}catch{}
   if(version===generation)busy=false;
  }
 }
 async function heartbeat(){
  if(document.hidden||!mlConnection.connected||busy)return;
  if(Date.now()-lastCheck>=5*60000){lastCheck=Date.now();try{const status=await mlRequest('status');if(!status.connected||status.accessRequired&&!status.accessGranted){mlConnection=status;ConduzCatalog?.disconnect();renderMlConnection();return;}if(status.account?.id!==account()){ConduzCatalog?.disconnect();mlConnection=status;renderMlConnection('A conta mudou. Recarregue o painel.');return;}ConduzAccess?.acceptConnection(status);}catch(error){ui('ml-data-status').textContent=error.message;return;}}
  if(!editing())render();await refresh();
 }
 const headers=()=>({'Content-Type':'application/json','X-Conduz-Action':'catalog','X-Conduz-Catalog-Account':String(account()),'X-Conduz-Data-Epoch':String(policyFor(account())?.epoch??0)});
 async function retentionRequest(method,body){const response=await fetch('/api/catalog/lifecycle',{method,credentials:'same-origin',cache:'no-store',headers:headers(),...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();if(value.dataPolicy)acceptPolicy(value.dataPolicy);if(!response.ok)throw Object.assign(Error(value.message??'Não foi possível conferir a retenção.'),{status:response.status});return value;}
 ui('ml-retention-open').onclick=async()=>{
  if(busy||editing()){toast('Conclua a edição ou consulta em andamento antes de revisar o encerramento.');return;}
  try{await ConduzCatalog.sync();const result=await retentionRequest('GET');review={...result,account:account()};const c=result.counts;ui('ml-retention-summary').textContent='Conta: '+mlConnection.account.nickname+' · '+c.products+' produto(s), '+c.kits+' kit(s), '+c.pending+' pendência(s), '+c.reports+' relatório(s) e '+c.manualReconciliations+' conciliação(ões) manual(is). Custos, margens, produtos, kits e conciliações manuais serão mantidos. Vínculos, dados consultados, cotações oficiais, pendências sem custo e relatórios importados serão removidos. A integração será encerrada para todos os acessos desta empresa.';ui('ml-retention-confirmation').value='';ui('ml-retention-error').textContent='';ui('ml-retention-dialog').showModal();}
  catch(error){toast(error.message);}
 };
 ui('ml-retention-form').onsubmit=async e=>{
  e.preventDefault();if(!review||review.account!==account())return;const id=account();ui('ml-retention-save').disabled=true;
  try{const result=await retentionRequest('POST',{action:'purge-imported',confirmation:ui('ml-retention-confirmation').value,revision:review.revision});acceptPolicy(result.dataPolicy);ui('ml-retention-dialog').close();review=null;ConduzCatalog.disconnect();await mlRequest('disconnect',{method:'POST'});mlConnection={configured:true,connected:false,account:null};renderMlConnection();render();toast('Dados importados removidos do catálogo ativo. Cadastros internos preservados. Conecte novamente para reativar as consultas.');}
  catch(error){ui('ml-retention-error').textContent=error.message;}
  finally{ui('ml-retention-save').disabled=false;}
 };
 ui('ml-retention-cancel').onclick=ui('ml-retention-close').onclick=()=>{review=null;ui('ml-retention-dialog').close();};
 globalThis.ConduzMlPolicy={acceptPolicy,sanitizeLocal,noteError,checkWait,epoch:id=>policyFor(id)?.epoch??0,isRefreshing:()=>busy,catalogReady(id){if(owner!==id){generation++;owner=id;nextRefresh=0;lastCheck=Date.now();}scheduleExpiry();queue();},disconnected(){generation++;owner=null;busy=false;clearTimeout(timer);clearTimeout(expiryTimer);timer=null;},refresh};
 globalThis.addEventListener?.('focus',heartbeat);globalThis.addEventListener?.('online',()=>{nextRefresh=0;heartbeat();});
 document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)heartbeat();});globalThis.setInterval?.(heartbeat,60000);
})();
