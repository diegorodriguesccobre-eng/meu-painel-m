const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const controller=script.slice(script.indexOf('// Catálogo completo:'),script.indexOf('// Fim do controlador do catálogo.'));
const ad=(n,title='Produto '+n)=>({itemId:'MLB'+(9000000000+n),title,listingType:'gold_special',thumbnail:null});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(setImmediate);
function harness(loader){
 let clock=1000000;const nodes=new Map(),calls=[],imported=[];
 const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',open:false,hidden:false,disabled:false,showModal(){this.open=true;},close(){this.open=false;},setAttribute(k,v){this[k]=v;}});return nodes.get(id);};
 const context=vm.createContext({$:get,Date:class extends Date{static now(){return clock;}},escapeHTML:String,mlSafeUrl:()=>null,
  mlRequest:async(action,options)=>{assert.equal(action,'items');calls.push({...options.query});return loader(options.query,calls.length);},importMlItem:id=>imported.push(id)});
 const run=code=>vm.runInContext(code,context);
 run('let mlConnection={connected:true,account:{id:123}},mlPickerVersion=0,mlCursor=null,mlCatalog=[];'+controller);
 return {get,calls,imported,run,advance:ms=>{clock+=ms;},open:()=>get('ml-open-picker').onclick(),close:()=>get('ml-picker-close').onclick(),search:q=>{get('ml-picker-search').value=q;get('ml-picker-search').oninput();},retry:()=>get('ml-load-more').onclick(),
  state:()=>JSON.parse(run('JSON.stringify({ids:mlCatalog.map(i=>i.itemId),complete:mlCatalogComplete,cursor:mlCursor,error:mlCatalogError,busy:Boolean(mlCatalogPending)})'))};
}

test('busca encontra anúncio na terceira página automaticamente e acompanha o texto atual',async()=>{
 const first=deferred(),second=deferred();
 const app=harness((q,n)=>n===1?first.promise:n===2?second.promise:{items:[ad(41,'Cabo de cobre final')],nextCursor:null});
 const loading=app.open();app.search('inexistente');app.search('cabo');
 assert.equal(app.calls.length,1);assert.match(app.get('ml-picker-items').innerHTML,/Procurando no catálogo completo/);
 assert.doesNotMatch(app.get('ml-picker-items').innerHTML,/Nenhum anúncio encontrado/);
 first.resolve({items:Array.from({length:20},(_,i)=>ad(i)),nextCursor:'pagina-2'});await tick();
 assert.equal(app.calls.length,2);assert.match(app.get('ml-picker-status').textContent,/20 anúncio/);
 assert.doesNotMatch(app.get('ml-picker-status').textContent,/Catálogo completo:/);
 second.resolve({items:Array.from({length:20},(_,i)=>ad(i+20)),nextCursor:'pagina-3'});await loading;
 assert.equal(app.calls.length,3);assert.deepEqual(app.calls,[{},{cursor:'pagina-2'},{cursor:'pagina-3'}]);
 assert.match(app.get('ml-picker-items').innerHTML,/Cabo de cobre final/);
 assert.doesNotMatch(app.get('ml-picker-items').innerHTML,/Produto 0/);
 assert.match(app.get('ml-picker-status').textContent,/Catálogo completo: 41 anúncio/);
 assert.equal(app.state().complete,true);assert.equal(app.get('ml-load-more').disabled,false);
});

test('filtro por nome sem acento e ID reutiliza o catálogo completo na mesma conta',async()=>{
 const app=harness(()=>({items:[ad(1,'Conexão elétrica')],nextCursor:null}));await app.open();
 app.search('CONEXAO');assert.match(app.get('ml-picker-items').innerHTML,/Conexão elétrica/);
 app.search(ad(1).itemId);assert.match(app.get('ml-picker-items').innerHTML,/Selecionar/);
 app.close();await app.open();assert.equal(app.calls.length,1);
 app.advance(5*60*1000+1);await app.open();assert.equal(app.calls.length,2);
});

test('página sem anúncios utilizáveis não interrompe a consulta antes dos próximos resultados',async()=>{
 const app=harness((q,n)=>n===1?{items:[ad(1)],nextCursor:'segundo'}:n===2?{items:[],nextCursor:'terceiro'}:{items:[ad(2,'Resultado depois da página vazia')],nextCursor:null});
 await app.open();assert.equal(app.calls.length,3);assert.deepEqual(app.state().ids,[ad(1).itemId,ad(2).itemId]);assert.equal(app.state().complete,true);
});

test('cursores opacos podem permanecer iguais; anúncios repetidos são deduplicados',async()=>{
 const app=harness((q,n)=>n===1?{items:[ad(1)],nextCursor:'mesmo-cursor'}:n===2?{items:[ad(1),ad(2)],nextCursor:'mesmo-cursor'}:{items:[],nextCursor:null});
 await app.open();assert.equal(app.calls.length,3);assert.deepEqual(app.state().ids,[ad(1).itemId,ad(2).itemId]);assert.equal(app.state().complete,true);
});

test('fechar interrompe próximas páginas e preserva a página pendente para retomar sem pular anúncios',async()=>{
 const page=deferred();const app=harness((q,n)=>n===1?page.promise:{items:[ad(2)],nextCursor:null});
 const loading=app.open();app.close();page.resolve({items:[ad(1)],nextCursor:'retomar'});await loading;
 assert.equal(app.calls.length,1);assert.deepEqual(app.state().ids,[ad(1).itemId]);assert.equal(app.state().complete,false);
 await app.open();assert.deepEqual(app.calls,[{},{cursor:'retomar'}]);assert.deepEqual(app.state().ids,[ad(1).itemId,ad(2).itemId]);
});

test('reabrir durante uma requisição compartilha o carregamento e não duplica chamadas',async()=>{
 const page=deferred();const app=harness((q,n)=>n===1?page.promise:{items:[ad(2)],nextCursor:null});
 const first=app.open();app.close();const second=app.open();app.search('Produto 2');assert.equal(app.calls.length,1);
 page.resolve({items:[ad(1)],nextCursor:'continuar'});await Promise.all([first,second]);
 assert.equal(app.calls.length,2);assert.equal(app.state().complete,true);assert.match(app.get('ml-picker-items').innerHTML,/Produto 2/);
});

test('erro mantém resultado parcial explícito; nova tentativa recomeça a consulta inteira',async()=>{
 const app=harness((q,n)=>{if(n===2)throw Error('Falha temporária');return !q.cursor?{items:[ad(1)],nextCursor:'outra'}:{items:[ad(2,'Item procurado')],nextCursor:null};});
 await app.open();app.search('Item procurado');assert.equal(app.state().complete,false);
 assert.match(app.get('ml-picker-status').textContent,/Busca incompleta/);assert.doesNotMatch(app.get('ml-picker-items').innerHTML,/Nenhum anúncio encontrado/);
 assert.equal(app.get('ml-load-more').textContent,'Tentar novamente');assert.equal(app.get('ml-load-more').hidden,false);
 await app.retry();assert.deepEqual(app.calls,[{},{cursor:'outra'},{},{cursor:'outra'}]);assert.equal(app.state().complete,true);assert.match(app.get('ml-picker-items').innerHTML,/Item procurado/);
});

test('troca de conta invalida o catálogo anterior e ignora respostas pendentes dessa conta',async()=>{
 const old=deferred();const app=harness((q,n)=>n===1?old.promise:{items:[ad(2,'Conta nova')],nextCursor:null});
 const previous=app.open();app.close();app.run('mlConnection.account.id=456');await app.open();
 old.resolve({items:[ad(1,'Conta antiga')],nextCursor:'antigo'});await previous;
 assert.deepEqual(app.state().ids,[ad(2).itemId]);assert.match(app.get('ml-picker-items').innerHTML,/Conta nova/);assert.doesNotMatch(app.get('ml-picker-items').innerHTML,/Conta antiga/);
});

test('página repetida ou resposta sem cursor não produz falso catálogo completo nem laço sem fim',async()=>{
 const repeated=harness(()=>({items:[ad(1)],nextCursor:'fixo'}));await repeated.open();assert.equal(repeated.calls.length,2);assert.equal(repeated.state().complete,false);assert.match(repeated.state().error,/deixou de avançar/);
 const invalid=harness(()=>({items:[ad(1)]}));await invalid.open();assert.equal(invalid.state().complete,false);assert.match(invalid.state().error,/inválida/);
});

test('selecionar anúncio interrompe o carregamento e encaminha somente o ID escolhido',async()=>{
 const page=deferred();const app=harness(()=>page.promise);const loading=app.open();
 app.get('ml-picker-items').onclick({target:{closest:()=>({dataset:{mlPick:ad(9).itemId}})}});
 page.resolve({items:[ad(1)],nextCursor:'não-carregar'});await loading;
 assert.deepEqual(app.imported,[ad(9).itemId]);assert.equal(app.calls.length,1);assert.equal(app.get('ml-picker-dialog').open,false);
});
