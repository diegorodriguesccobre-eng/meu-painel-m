const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { startLab } = require('./support/catalog-lab.cjs');
const app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../src/catalog-sync.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function client(peer, storage = new Map()) {
 const nodes = new Map(), events = new Map();
 const get = id => {
  if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '', disabled: false, open: false, elements: {}, value: '', classList: { toggle() {}, remove() {} }, showModal() { this.open = true; }, close() { this.open = false; } });
  return nodes.get(id);
 };
 const context = vm.createContext({ URL, document: { getElementById: get, hidden: false }, fetch: peer.fetch, Response, AbortSignal, crypto: { randomUUID }, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) }, setTimeout: () => 1, clearTimeout() {}, setInterval() {}, addEventListener(name, handler) { events.set(name, handler); }, kitItems: new Map(), kitEditing: null, render() {} });
 const run = code => vm.runInContext(code, context);
 run(app.slice(0, app.indexOf('let state=defaults()')) + '\nglobalThis.state=defaults();');
 if (storage.has('margem.painel.v1')) context.state = JSON.parse(storage.get('margem.painel.v1'));
 run(source);
 return { context, get, storage, run, events, api: context.ConduzCatalog, data: () => clone(context.state), edit(code) { run(code + ';localStorage.setItem(KEY,JSON.stringify(state));ConduzCatalog.onLocalChange();'); } };
}
const connection = { connected: true, account: { id: 123 } };
async function setup(t) { const lab = await startLab(); t.after(() => lab.close()); const a = client(lab.peers[0]), b = client(lab.peers[1]); await a.api.connect(connection); await b.api.connect(connection); return { lab, a, b }; }
const ids = data => [data.products.length, data.kits.length, data.adsReconciliations.length];
async function until(predicate) {
 for (let attempt = 0; attempt < 100; attempt++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
 assert.fail('A sincronização não concluiu no prazo do teste.');
}

test('queda de rede preserva produto, kit e conciliação após recarregar, e recupera sem duplicatas', async t => {
 const { lab, a, b } = await setup(t), initial = await lab.read();
 lab.peers[0].offline = true;
 a.edit('state.products[0].cost=12;state.kits[0].margin=25;state.adsReconciliations[0].goods=22');
 await a.api.sync();
 assert.match(a.get('cloud-catalog-status').textContent, /aguardam/);
 assert.deepEqual((await lab.read()).data, initial.data);
 const reloaded = client(lab.peers[0], a.storage);
 assert.equal(reloaded.data().products[0].cost, 12);
 assert.equal(reloaded.data().kits[0].margin, 25);
 assert.equal(reloaded.data().adsReconciliations[0].goods, 22);
 lab.peers[0].offline = false;
 await reloaded.api.connect(connection); await b.api.sync();
 assert.deepEqual(ids(b.data()), [2, 2, 2]);
 assert.equal(b.data().products[0].cost, 12); assert.equal(b.data().kits[0].margin, 25); assert.equal(b.data().adsReconciliations[0].goods, 22);
 assert.deepEqual(b.data().products[0].feeSnapshot, initial.data.products[0].feeSnapshot);
 assert.deepEqual(b.data().products[0].mlAds, initial.data.products[0].mlAds);
 assert.equal(b.data().products[0].adsMl, 6); assert.equal(b.data().products[0].adsShopee, 9);
});

test('resposta perdida após gravar e erro 503 recuperam sem repetir cadastros ou despesas de Ads', async t => {
 const { lab, a, b } = await setup(t);
 a.edit('state.products[0].cost=13;state.kits[0].extra=3;state.adsReconciliations[0].other=2');
 lab.peers[0].dropNextWrite = true; await a.api.sync();
 assert.match(a.get('cloud-catalog-status').textContent, /aguardam/);
 const saved = await lab.read(); assert.equal(saved.data.products[0].cost, 13);
 await a.api.sync(); assert.equal((await lab.read()).revision, saved.revision);
 a.edit('state.kits[1].extra=4'); lab.peers[0].failNextWrite = true; await a.api.sync();
 assert.match(a.get('cloud-catalog-status').textContent, /Falha temporária/);
 await a.api.sync(); await b.api.sync();
 assert.deepEqual(ids(b.data()), [2, 2, 2]); assert.equal(b.data().kits[1].extra, 4); assert.equal(b.data().adsReconciliations[0].other, 2);
});

test('dois funcionários editam produtos, kits e conciliações diferentes e recebem a combinação completa', async t => {
 const { lab, a, b } = await setup(t);
 a.edit('state.products[0].cost=11;state.kits[0].margin=21;state.adsReconciliations[0].goods=21');
 b.edit('state.products[1].cost=16;state.kits[1].margin=22;state.adsReconciliations[1].goods=23');
 await Promise.all([a.api.sync(), b.api.sync()]);
 await a.api.sync(); await b.api.sync(); await a.api.sync();
 const data = (await lab.read()).data;
 assert.deepEqual(data.products.map(p => p.cost), [11, 16]); assert.deepEqual(data.kits.map(k => k.margin), [21, 22]); assert.deepEqual(data.adsReconciliations.map(r => r.goods), [21, 23]);
 assert.deepEqual(a.data().products, b.data().products); assert.deepEqual(a.data().kits, b.data().kits); assert.deepEqual(a.data().adsReconciliations, b.data().adsReconciliations);
});

test('conflitos nos mesmos produto, kit e conciliação exigem escolhas explícitas e propagam a resolução', async t => {
 const { lab, a, b } = await setup(t);
 a.edit('state.products[0].cost=11;state.kits[0].margin=21;state.adsReconciliations[0].goods=21');
 b.edit('state.products[0].cost=12;state.kits[0].margin=22;state.adsReconciliations[0].goods=22');
 await a.api.sync(); await b.api.sync();
 b.get('cloud-review').onclick();
 assert.equal((b.get('cloud-review-options').innerHTML.match(/<fieldset/g) ?? []).length, 3);
 assert.match(b.get('cloud-review-options').innerHTML, /Kit fictício A/);
 b.get('cloud-review-form').onsubmit({ preventDefault() {} });
 assert.match(b.get('cloud-review-error').textContent, /Escolha uma versão/);
 assert.equal((await lab.read()).data.products[0].cost, 11);
 b.get('cloud-review-form').elements = { 'cloud-choice-0': { value: 'local' }, 'cloud-choice-1': { value: 'remote' }, 'cloud-choice-2': { value: 'local' } };
 b.get('cloud-review-form').onsubmit({ preventDefault() {} });
 await until(async () => (await lab.read()).data.products[0].cost === 12);
 await until(() => b.get('cloud-catalog-status').textContent === 'Catálogo sincronizado com a empresa.');
 await a.api.sync();
 assert.equal(a.data().products[0].cost, 12); assert.equal(a.data().kits[0].margin, 21); assert.equal(a.data().adsReconciliations[0].goods, 22);
 assert.deepEqual(ids(a.data()), [2, 2, 2]); assert.ok(b.storage.has('conduz.catalog.before-sharing.123'));
});

test('formulários abertos de produto, kit e conciliação preservam rascunhos até a edição terminar', async t => {
 const { a, b } = await setup(t);
 const cases = [
  { begin() { b.get('product-dialog').open = true; }, end() { b.get('product-dialog').open = false; }, edit: 'state.products[0].cost=18', value: data => data.products[0].cost, expected: 18 },
  { begin() { b.context.kitEditing = 'kit-A'; }, end() { b.context.kitEditing = null; }, edit: 'state.kits[0].margin=23', value: data => data.kits[0].margin, expected: 23 },
  { begin() { b.get('ads-reconcile-dialog').open = true; }, end() { b.get('ads-reconcile-dialog').open = false; }, edit: 'state.adsReconciliations[0].goods=24', value: data => data.adsReconciliations[0].goods, expected: 24 }
 ];
 for (const scenario of cases) {
  scenario.begin(); a.edit(scenario.edit); await a.api.sync(); await b.api.sync();
  assert.notEqual(scenario.value(b.data()), scenario.expected); assert.match(b.get('cloud-catalog-status').textContent, /Conclua a edição/);
  scenario.end(); await b.api.sync(); assert.equal(scenario.value(b.data()), scenario.expected);
 }
});

test('catálogo indisponível ao reabrir permite tentar novamente e retoma após voltar à janela', async t => {
 const { lab, a, b } = await setup(t);
 lab.peers[0].offline = true;
 const reloaded = client(lab.peers[0], a.storage); await reloaded.api.connect(connection);
 assert.equal(reloaded.get('cloud-sync').disabled, false);
 reloaded.edit('state.kits[0].extra=7');
 lab.peers[0].offline = false;
 await reloaded.events.get('focus')();
 await until(() => /sincronizado/.test(reloaded.get('cloud-catalog-status').textContent));
 await b.api.sync(); assert.equal(b.data().kits[0].extra, 7);
 reloaded.api.disconnect(); lab.peers[0].offline = true;
 await reloaded.events.get('online')();
 assert.match(reloaded.get('cloud-catalog-status').textContent, /encerrada/);
});

test('abertura sem internet recupera a sessão existente ao reconectar, sem consultas duplicadas nem novo login', async () => {
 const events = new Map(), nodes = new Map(), calls = { status: 0, catalog: 0, prices: 0, ads: 0 };
 let offline = true;
 const context = vm.createContext({ URL, location: { protocol: 'http:', href: 'http://127.0.0.1/' }, addEventListener(name, callback) { events.set(name, callback); },
  $: id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); },
  mlRequest: async () => { calls.status++; if (offline) throw new TypeError('Failed to fetch'); return connection; },
  ConduzCatalog: { async connect() { calls.catalog++; } }, renderMlConnection() {}, renderKitPreview() {},
  async refreshRegisteredPrices() { calls.prices++; }, async refreshRegisteredAds() { calls.ads++; }, kitEditing: null, kitItems: new Map(), mlConnection: null });
 const start = app.indexOf('let mlInitializationBusy='), end = app.indexOf('resetKitEditor();showScreen(\'products\');');
 assert.ok(start > 0 && end > start);
 vm.runInContext(app.slice(start, end), context);
 await context.initializeMercadoLivre(); assert.equal(calls.catalog, 0);
 offline = false; events.get('online')(); events.get('focus')();
 await until(() => calls.ads === 1);
 assert.deepEqual(calls, { status: 2, catalog: 1, prices: 1, ads: 1 });
 events.get('focus')(); await new Promise(resolve => setImmediate(resolve));
 assert.equal(calls.status, 2);
});
