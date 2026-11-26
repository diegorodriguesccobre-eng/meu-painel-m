const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { report, reconciliation, account } = require('./support/ads-fixtures.cjs');
const source = fs.readFileSync(path.join(__dirname, '../src/catalog-sync.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const core = app.slice(0, app.indexOf('let state=defaults()'));
const clone = x => JSON.parse(JSON.stringify(x));
function product(id, cost = 10) { return { id, name: id, category: 'Teste', cost, weight: .2, margin: 20, extra: 0 }; }
function server() {
 const s = { data: null, revision: 0, writes: 0, hold: null, offline: false, accountChanged: false };
 s.fetch = async (url, options = {}) => {
  if (s.offline) throw Error('Sem internet');
  if (url.endsWith('/status')) return Response.json({ configured: true });
  if (s.accountChanged) return Response.json({ error: 'ACCOUNT_CHANGED', message: 'A conta mudou em outra aba. Recarregue a página.' }, { status: 409 });
  if (options.method !== 'PUT') {
   if (options.headers?.['If-None-Match'] === '"' + s.revision + '"') return new Response(null, { status: 304 });
   return Response.json({ revision: s.revision, data: clone(s.data) });
  }
  const body = JSON.parse(options.body);
  assert.equal(body.schemaVersion, 4);
  if (body.revision !== s.revision) return Response.json({ message: 'Conflito' }, { status: 409 });
  s.data = clone(body.data); s.revision++; s.writes++;
  const response = Response.json({ revision: s.revision });
  if (s.hold) { const hold = s.hold; s.hold = null; await hold; }
  return response;
 };
 return s;
}
function client(s) {
 const nodes = new Map(), storage = new Map();
 const get = id => {
  if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '', disabled: false, open: false, elements: {}, classList: { toggle() {}, remove() {} }, showModal() { this.open = true; }, close() { this.open = false; } });
  return nodes.get(id);
 };
 const context = vm.createContext({ URL, document: { getElementById: get, hidden: false }, fetch: s.fetch, Response, AbortSignal, crypto: { randomUUID }, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) }, setTimeout: () => 1, clearTimeout() {}, setInterval() {}, addEventListener() {}, kitItems: new Map(), kitEditing: null, render() {} });
 vm.runInContext(core + '\nglobalThis.state=defaults();', context);
 vm.runInContext(source, context);
 return { context, get, storage, run: code => vm.runInContext(code, context), api: context.ConduzCatalog, add(p) { context.state.products.push(clone(p)); context.ConduzCatalog.onLocalChange(); }, data() { return clone(context.state); } };
}
const connection = { connected: true, account: { id: 123 } };

test('pendências chegam a outro funcionário e concluir um produto não ressuscita pendência concorrente', async () => {
 const s = server(), a = client(s), b = client(s), item = require('./support/ml-import-fixtures.cjs').response('MLB9000000001').item;
 const pending = { id: 'pendente-1', item, margin: 25, feeSnapshot: clone(a.data().fees), importedAt: '2026-11-20T12:00:00Z' };
 await a.api.connect(connection); a.context.state.pendingProducts = [pending]; a.api.onLocalChange(); await a.api.sync(); await b.api.connect(connection);
 assert.deepEqual(b.data().pendingProducts, [pending]);
 a.context.state.pendingProducts = []; a.context.state.products.push({ ...product('concluido'), mercadoLivre: item }); await a.api.sync();
 b.context.state.pendingProducts[0].item.fetchedAt = '2026-11-21T12:00:00Z'; await b.api.sync(); await a.api.sync();
 assert.equal(b.data().pendingProducts.length, 0); assert.equal(a.data().pendingProducts.length, 0); assert.equal(b.data().products[0].id, 'concluido');
});

test('troca de sessão em outra aba interrompe a sincronização sem enviar a edição para a outra empresa', async () => {
 const s = server(), c = client(s); await c.api.connect(connection);
 c.add(product('cobre')); await c.api.sync(); const writes = s.writes;
 c.context.state.products[0].cost = 19; s.accountChanged = true;
 await c.api.sync(); await c.api.sync();
 assert.equal(s.writes, writes); assert.equal(s.data.products[0].cost, 10); assert.equal(c.data().products[0].cost, 19);
 assert.ok(c.get('cloud-catalog-status').textContent.includes('Recarregue'));
});

test('dois funcionários adicionam produtos diferentes e recebem o catálogo combinado, preservando taxas', async () => {
 const s = server(), a = client(s), b = client(s);
 await a.api.connect(connection); await b.api.connect(connection);
 a.add(product('a')); await a.api.sync();
 b.add(product('b')); await b.api.sync(); await a.api.sync();
 assert.deepEqual(a.data().products.map(p => p.id).sort(), ['a', 'b']);
 assert.deepEqual(b.data().products.map(p => p.id).sort(), ['a', 'b']);
 assert.deepEqual(a.data().fees, b.data().fees);
 assert.equal(s.writes, 2);
});

test('edições do mesmo produto exigem revisão e não enviam a escolha silenciosamente', async () => {
 const s = server(), a = client(s), b = client(s);
 await a.api.connect(connection); a.add(product('p')); await a.api.sync(); await b.api.connect(connection);
 a.context.state.products[0].cost = 11; await a.api.sync();
 b.context.state.products[0].cost = 12; await b.api.sync();
 assert.equal(s.data.products[0].cost, 11); assert.equal(b.data().products[0].cost, 12);
 assert.ok(b.get('cloud-catalog-status').textContent.includes('alterações simultâneas'));
 b.get('cloud-review').onclick();
 assert.ok(b.get('cloud-review-options').innerHTML.includes('Minha edição'));
 assert.ok(b.get('cloud-review-options').innerHTML.includes('Versão da empresa'));
});

test('primeira associação pede escolha, e uma falha de rede mantém os produtos locais pendentes', async () => {
 const s = server(), a = client(s); a.add(product('local'));
 await a.api.connect(connection); assert.equal(s.writes, 0);
 assert.ok(a.get('cloud-catalog-status').textContent.includes('Escolha'));
 a.get('cloud-review').onclick(); a.get('cloud-review-form').onsubmit({ preventDefault() {} });
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(s.data.products[0].id, 'local');
 s.offline = true; a.add(product('offline')); await a.api.sync();
 assert.equal(a.data().products.length, 2); assert.equal(s.data.products.length, 1);
 assert.ok(a.get('cloud-catalog-status').textContent.includes('aguardam'));
 s.offline = false; await a.api.sync(); assert.equal(s.data.products.length, 2);
});

test('uma edição durante a gravação e uma resposta após desconectar não são perdidas nem reaplicadas', async () => {
 const s = server(), a = client(s); await a.api.connect(connection);
 let release; s.hold = new Promise(resolve => { release = resolve; });
 a.add(product('primeiro')); const saving = a.api.sync();
 await new Promise(resolve => setImmediate(resolve));
 a.add(product('durante')); release(); await saving;
 assert.equal(a.data().products.length, 2); await a.api.sync(); assert.equal(s.data.products.length, 2);
 s.hold = new Promise(resolve => { release = resolve; });
 a.context.state.products[0].cost = 50; const delayed = a.api.sync();
 await new Promise(resolve => setImmediate(resolve)); a.api.disconnect();
 a.context.state.products[0].cost = 99; release(); await delayed;
 assert.equal(a.data().products[0].cost, 99);
 assert.ok(a.get('cloud-catalog-status').textContent.includes('encerrada'));
});

test('exclusão concorrente com edição fica em conflito; diferenças só de data não criam falso conflito', () => {
 const context = vm.createContext({}); vm.runInContext(source, context);
 const { merge } = context.ConduzCatalogMerge;
 const base = { products: [product('p')], kits: [], fees: {} };
 const local = clone(base), remote = clone(base); local.products = []; remote.products[0].cost = 20;
 assert.equal(merge(base, local, remote).conflicts.length, 1);
 const a = clone(base), b = clone(base); a.products[0].fetchedAt = '2026-01-01'; b.products[0].fetchedAt = '2026-02-01';
 assert.equal(merge(base, a, b).conflicts.length, 0);
});

test('cache local ausente ou corrompido não é enviado como exclusão do catálogo central', async () => {
 const s = server(), a = client(s); await a.api.connect(connection);
 a.add(product('preservado')); await a.api.sync();
 const base = clone(s.data), writes = s.writes;
 for (const badLocal of [null, '{inválido']) {
  const b = client(s);
  b.storage.set('conduz.catalog.sync.v1.123', JSON.stringify({ revision: s.revision, base }));
  if (badLocal !== null) b.storage.set('margem.painel.v1', badLocal);
  await b.api.connect(connection);
  assert.equal(b.data().products[0].id, 'preservado'); assert.equal(s.writes, writes);
 }
});

test('relatórios de períodos e anúncios diferentes são combinados sem mudar métricas ou filtros locais', async () => {
 const s=server(),a=client(s),b=client(s);await a.api.connect(connection);await b.api.connect(connection);
 const first=report(),second=report({baseDate:'2026-11-16',itemId:'MLB9876543210'});
 a.context.state.adsHistory=clone(first);await a.api.sync();
 b.context.state.adsHistory=clone(second);await b.api.sync();await a.api.sync();
 assert.equal(s.data.adsReports.length,2);assert.equal(a.data().adsReports.length,2);
 assert.equal(a.data().adsHistory.baseDate,'2026-11-15');assert.equal(b.data().adsHistory.baseDate,'2026-11-16');
 assert.deepEqual(s.data.adsReports.find(r=>r.baseDate===first.baseDate),first);
 const next=report({itemId:'MLB2222222222',fetchedAt:'2026-11-24T14:00:00.000Z'});
 b.context.state.adsHistory=clone(next);await b.api.sync();await a.api.sync();
 const combined=s.data.adsReports.find(r=>r.baseDate===first.baseDate);
 assert.equal(combined.items.length,2);assert.deepEqual(combined.items.find(r=>r.itemId===first.items[0].itemId),first.items[0]);
});

test('resumos e conciliações migram de dados antigos e chegam a um novo funcionário sem exportação',async()=>{
 const s=server(),a=client(s);await a.api.connect(connection);
 const h=report(),r=reconciliation(),summary=account();
 a.context.state.adsHistory=clone(h);a.context.state.adsAccount=clone(summary);a.context.state.adsReconciliations=[clone(r)];
 await a.api.sync();const b=client(s);await b.api.connect(connection);
 assert.deepEqual(b.data().adsReconciliations,[r]);assert.deepEqual(b.data().adsAccount,summary);assert.deepEqual(b.data().adsHistory,h);
 assert.equal(b.data().adsReports.length,1);assert.equal(b.data().adsAccounts.length,1);
 b.context.state.adsReports=[];b.context.state.adsAccounts=[];b.context.state.adsReconciliations=[];delete b.context.state.adsHistory;delete b.context.state.adsAccount;
 await b.api.sync();assert.equal(s.data.adsReconciliations.length,1);assert.equal(s.data.adsReports.length,1);
});

test('conciliações independentes são combinadas e divergência no mesmo anúncio/período pede revisão',async()=>{
 const s=server(),a=client(s),b=client(s);await a.api.connect(connection);await b.api.connect(connection);
 const h=report(),r=reconciliation(),other=reconciliation(h.items[0].periods[1]);
 a.context.state.adsReconciliations=[clone(r)];await a.api.sync();b.context.state.adsReconciliations=[clone(other)];await b.api.sync();await a.api.sync();
 assert.equal(s.data.adsReconciliations.length,2);
 a.context.state.adsReconciliations.find(x=>x.dateFrom===r.dateFrom).goods=21;await a.api.sync();
 b.context.state.adsReconciliations.find(x=>x.dateFrom===r.dateFrom).goods=22;await b.api.sync();
 assert.equal(s.data.adsReconciliations.find(x=>x.dateFrom===r.dateFrom).goods,21);
 assert.equal(b.data().adsReconciliations.find(x=>x.dateFrom===r.dateFrom).goods,22);
 b.get('cloud-review').onclick();assert.match(b.get('cloud-review-options').innerHTML,/Conciliação MLB1234567890/);
 assert.match(b.get('cloud-review-options').innerHTML,/produtos R\$/);
});

test('conciliação em edição não é substituída e dados de outra conta ficam apenas no navegador',async()=>{
 const s=server(),a=client(s),b=client(s);await a.api.connect(connection);await b.api.connect(connection);
 b.context.state.adsHistory=report({sellerId:999});
 a.context.state.adsReconciliations=[reconciliation()];await a.api.sync();
 b.get('ads-reconcile-dialog').open=true;await b.api.sync();assert.equal(b.data().adsReconciliations?.length??0,0);
 b.get('ads-reconcile-dialog').open=false;await b.api.sync();
 assert.equal(b.data().adsReconciliations.length,1);assert.ok(b.data().adsReports.some(r=>r.sellerId===999));
 assert.ok(s.data.adsReports.every(r=>r.sellerId===123));
});

test('backup v18 preserva vários relatórios e migra v17 sem inventar conciliações ou métricas',()=>{
 const a=client(server()),h=report(),next=report({baseDate:'2026-11-16'});a.context.state.adsHistory=h;a.context.state.adsReports=[h,next];a.context.state.adsAccounts=[account()];a.context.state.adsReconciliations=[reconciliation()];
 const backup=a.run('buildBackup(state)'),restored=a.run('parseBackup('+JSON.stringify(backup)+')');
 assert.equal(JSON.parse(backup).version,19);assert.equal(restored.adsReports.length,2);assert.equal(restored.adsReconciliations[0].goods,20);
 const legacy={format:'margem-backup',version:17,data:{products:[],kits:[],fees:a.data().fees,adsHistory:h}};
 a.context.oldBackup=JSON.stringify(legacy);const upgraded=a.run('parseBackup(oldBackup)');assert.equal(upgraded.adsReports.length,1);assert.equal(upgraded.adsReconciliations,undefined);
});
