const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { report, account, reconciliation } = require('./support/ads-fixtures.cjs');
const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const core = source.slice(0, source.indexOf('let state=defaults()'));
const bootstrap = source.slice(source.indexOf('let state=defaults()'), source.indexOf('let sort='));
const activate = source.slice(source.indexOf('function activateAccountCatalog('), source.indexOf('function restoreProductDraftAfterConnect('));
const restoreDraft = source.slice(source.indexOf('function restoreProductDraftAfterConnect('), source.indexOf('async function initializeMercadoLivre('));
const persist = source.split('\n').find(line => line.startsWith('function persist()'));
const clone = value => JSON.parse(JSON.stringify(value));

function client(storage = new Map()) {
 const nodes = new Map(), drafts = new Map();
 const get = id => {
  if (!nodes.has(id)) nodes.set(id, { open: false, value: '', textContent: '', elements: {}, classList: { toggle() {}, remove() {} }, showModal() { this.open = true; }, close() { this.open = false; } });
  return nodes.get(id);
 };
 const context = vm.createContext({ URL, document: { getElementById: get }, localStorage: {
  getItem: key => storage.get(key) ?? null,
  setItem(key, value) { if (context.failStorage) throw Error('Sem espaço'); storage.set(key, value); }
 }, sessionStorage: { getItem: key => drafts.get(key) ?? null, removeItem: key => drafts.delete(key) } });
 vm.runInContext(core + bootstrap + `
  const $=id=>document.getElementById(id);
  let kitEditing=null,kitItems=new Map(),editing=null,deleting=null,sort={key:'name',direction:1};
  let mlLookupVersion=0,mlAdsEpoch=0,mlPricingVersion=0,mlShippingVersion=0,importReadVersion=0,restoreReadVersion=0;
  const adsHistoryUi={epoch:0},adsUi={};
  let openedProduct=null;
  function resetMlCatalog(){} function resetKitEditor(){} function render(){}
  function toast(){} function renderAdsRoas(){} function renderMlLink(){}
  function openProduct(p){openedProduct=p;}
 ` + activate + restoreDraft + persist, context);
 return { context, storage, drafts, get, run: code => vm.runInContext(code, context), data: () => clone(vm.runInContext('state', context)),
  activate(id) { context.targetAccount = id; return vm.runInContext("activateAccountCatalog(targetAccount,'123')", context); } };
}
function data(owner, label) {
 const c = client(), result = c.data();
 result.products = [{ id: 'same-id', name: label, category: 'Teste', cost: 10, weight: .2, margin: 20, extra: 0 }];
 result.kits = [{ id: 'same-kit', name: 'Kit ' + label, margin: 20, extra: 0, mlShipping: 0, items: [{ productId: 'same-id', quantity: 2 }] }];
 result.adsReports = [report({ sellerId: owner })];
 result.adsAccounts = [account({ sellerId: owner })];
 result.adsReconciliations = [reconciliation(undefined, { sellerId: owner })];
 return result;
}

test('migra o catálogo antigo para a primeira empresa sem entregar seus produtos, kits ou Ads à segunda', () => {
 const original = data(123, 'Cobre'), storage = new Map([['margem.painel.v1', JSON.stringify(original)]]), c = client(storage);
 const previous = c.data();
 c.activate(456);
 assert.equal(c.data().products.length, 0); assert.equal(c.data().kits.length, 0);
 assert.equal(c.data().adsReports?.length ?? 0, 0);
 assert.deepEqual(JSON.parse(storage.get('margem.painel.v1.account.123')), previous);
 assert.deepEqual(JSON.parse(storage.get('margem.painel.v1')), original);
 assert.equal(storage.get('conduz.catalog.active-account.v1'), '456');
 c.activate(123);
 assert.equal(c.data().products[0].name, 'Cobre'); assert.equal(c.data().kits[0].name, 'Kit Cobre');
 assert.equal(c.data().adsReports[0].sellerId, 123); assert.equal(c.data().adsReconciliations[0].sellerId, 123);
});

test('duas empresas mantêm produtos, kits, taxas e Ads distintos mesmo com os mesmos IDs de cadastro', () => {
 const a = data(123, 'Cobre'), b = data(456, 'Energia'); b.fees.ml.tax = 8;
 const storage = new Map([['margem.painel.v1', JSON.stringify(a)], ['margem.painel.v1.account.456', JSON.stringify(b)]]);
 const c = client(storage); c.activate(123); c.run('state.products[0].cost=12;persist()');
 c.activate(456); assert.equal(c.data().products[0].name, 'Energia'); assert.equal(c.data().fees.ml.tax, 8);
 assert.ok(c.data().adsReports.every(r => r.sellerId === 456));
 c.run('state.products[0].cost=28;state.kits[0].extra=3;persist()');
 c.activate(123); assert.equal(c.data().products[0].cost, 12); assert.equal(c.data().kits[0].extra, 0); assert.equal(c.data().fees.ml.tax, a.fees.ml.tax);
 c.activate(456); assert.equal(c.data().products[0].cost, 28); assert.equal(c.data().kits[0].extra, 3);
 const reloaded = client(storage); assert.equal(reloaded.data().products[0].name, 'Energia');
 assert.equal(reloaded.data().products[0].cost, 28); assert.equal(reloaded.data().adsReconciliations[0].sellerId, 456);
});

test('uma aba antiga continua gravando somente a própria empresa após outra aba trocar de conta', () => {
 const storage = new Map([['margem.painel.v1', JSON.stringify(data(123, 'Cobre'))]]), a = client(storage);
 a.activate(123); const b = client(storage); b.activate(456);
 const energyBefore = storage.get('margem.painel.v1.account.456');
 a.run('state.products[0].cost=19;persist()');
 assert.equal(storage.get('margem.painel.v1.account.456'), energyBefore);
 assert.equal(JSON.parse(storage.get('margem.painel.v1.account.123')).products[0].cost, 19);
});

test('falha de armazenamento, catálogo corrompido ou formulário aberto impedem a troca sem apagar a cópia atual', () => {
 for (const failure of ['storage', 'corrupt', 'editing', 'delete']) {
  const storage = new Map([['margem.painel.v1', JSON.stringify(data(123, 'Cobre'))]]), c = client(storage);
  c.activate(123); const before = c.data(), beforeKey = c.run('KEY');
  if (failure === 'storage') c.context.failStorage = true;
  if (failure === 'corrupt') storage.set('margem.painel.v1.account.456', '{inválido');
  if (failure === 'editing') c.get('product-dialog').open = true;
  if (failure === 'delete') c.get('delete-dialog').open = true;
  assert.throws(() => c.activate(456));
  assert.deepEqual(c.data(), before); assert.equal(c.run('KEY'), beforeKey);
  assert.equal(storage.get('conduz.catalog.active-account.v1'), '123');
 }
});

test('não restaura o formulário de produto da Cobre dentro do catálogo da Energia', () => {
 const c = client(new Map([['margem.painel.v1', JSON.stringify(data(123, 'Cobre'))]])); c.activate(123);
 c.drafts.set('conduz.mlProductDraft', JSON.stringify({ catalogKey: c.run('KEY'), editing: 'same-id', fields: [] }));
 c.activate(456); c.run('restoreProductDraftAfterConnect()');
 assert.equal(c.run('openedProduct'), null); assert.ok(c.drafts.has('conduz.mlProductDraft'));
 c.activate(123); c.run('restoreProductDraftAfterConnect()');
 assert.equal(c.run('openedProduct.name'), 'Cobre'); assert.equal(c.drafts.has('conduz.mlProductDraft'), false);
});

test('recusa um perfil local que contém dados identificados como pertencentes a outra conta', () => {
 const storage = new Map([['margem.painel.v1', JSON.stringify(data(123, 'Cobre'))], ['margem.painel.v1.account.456', JSON.stringify(data(123, 'Misturado'))]]);
 const c = client(storage), before = c.data(); assert.throws(() => c.activate(456), /não corresponde/);
 assert.deepEqual(c.data(), before); assert.equal(storage.has('conduz.catalog.active-account.v1'), false);
});

test('a sincronização troca a cópia local antes de enviar dados e mantém ambas as bases da empresa isoladas', async () => {
 const { randomUUID } = require('node:crypto');
 const storage = new Map([['margem.painel.v1', JSON.stringify(data(123, 'Cobre'))]]), c = client(storage);
 const cobre = c.data(), databases = new Map([['123', { revision: 1, data: clone(cobre) }], ['456', { revision: 0, data: null }]]);
 storage.set('conduz.catalog.sync.v1.123', JSON.stringify({ revision: 1, base: cobre }));
 let signedIn = '123';
 Object.assign(c.context, { Response, AbortSignal, crypto: { randomUUID }, setTimeout: () => 1, clearTimeout() {}, setInterval() {}, addEventListener() {},
  fetch: async (url, options = {}) => {
   if (url.endsWith('/status')) return Response.json({ configured: true, schemaVersion: 4, legacySellerId: '123' });
   assert.equal(options.headers['X-Conduz-Catalog-Account'], signedIn);
   const db = databases.get(signedIn);
   if (options.method === 'PUT') {
    const body = JSON.parse(options.body); assert.equal(body.schemaVersion, 4); assert.equal(body.revision, db.revision);
    db.data = clone(body.data); db.revision++; return Response.json({ revision: db.revision });
   }
   if (options.headers['If-None-Match'] === '"' + db.revision + '"') return new Response(null, { status: 304 });
   return Response.json(clone(db));
  }
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/catalog-sync.js'), 'utf8'), c.context);
 await c.context.ConduzCatalog.connect({ connected: true, account: { id: 123 } });
 signedIn = '456'; await c.context.ConduzCatalog.connect({ connected: true, account: { id: 456 } });
 assert.equal(c.data().products.length, 0); assert.equal(c.data().kits.length, 0); assert.equal(c.data().adsReports.length, 0);
 c.run("state.products.push({id:'energia',name:'Energia',category:'Teste',cost:28,weight:.2,margin:20,extra:0});persist()");
 await c.context.ConduzCatalog.sync();
 assert.equal(databases.get('456').data.products[0].name, 'Energia');
 assert.deepEqual(databases.get('123').data, cobre);
 signedIn = '123'; await c.context.ConduzCatalog.connect({ connected: true, account: { id: 123 } });
 assert.equal(c.data().products[0].name, 'Cobre'); assert.equal(c.data().adsReconciliations[0].sellerId, 123);
 assert.equal(databases.get('456').data.products[0].name, 'Energia');
 // Um cache que foi gravado sob a conta errada não representa exclusões da base legítima.
 const badStorage = new Map(storage); badStorage.set('margem.painel.v1.account.123', JSON.stringify(data(456, 'Conta errada')));
 const bad = client(badStorage);
 for (const key of ['Response','AbortSignal','crypto','setTimeout','clearTimeout','setInterval','addEventListener','fetch']) bad.context[key] = c.context[key];
 vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/catalog-sync.js'), 'utf8'), bad.context);
 await bad.context.ConduzCatalog.connect({ connected: true, account: { id: 123 } });
 assert.equal(bad.data().products[0].name, 'Cobre'); assert.equal(databases.get('123').revision, 1);
 assert.deepEqual(databases.get('123').data, cobre);
});
