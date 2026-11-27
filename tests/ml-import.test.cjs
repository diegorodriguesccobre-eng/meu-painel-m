const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fixtures = require('./support/ml-import-fixtures.cjs');
const source = fs.readFileSync('src/app.js', 'utf8'), moduleSource = fs.readFileSync('src/ml-catalog-import.js', 'utf8');
const core = source.slice(0, source.indexOf('let state=defaults()'));
const helpers = ['savedAdsPricingInput', 'pricingMatches'].map(name => source.match(new RegExp('^function ' + name + '.*$', 'm'))[0]).join('\n');
const clone = x => JSON.parse(JSON.stringify(x));
function app(ui = false, request) {
 const nodes = new Map(), saved = [], notices = [], opened = [];
 const get = id => { if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', disabled: false, open: false, classList: { toggle() {} }, showModal() { this.open = true; }, close() { this.open = false; } }); return nodes.get(id); };
 const c = vm.createContext({ URL, setTimeout: () => 1, clearTimeout() {}, ConduzCatalog: { readyForImport: () => !c.cloudUnavailable }, ...(ui ? { document: { getElementById: get } } : {}), mlRequest: request, render() {}, toast: s => notices.push(s), openProduct: p => opened.push(clone(p)), importMlItem() {}, renderAutoPricing() {}, scheduleOfficialPricing() {}, persist: () => { if (c.failStorage) return false; saved.push(clone(vm.runInContext('state', c))); return true; } });
 vm.runInContext(core + '\n' + helpers + '\nlet state=' + JSON.stringify(fixtures.data()) + ';let mlConnection={connected:true,account:{id:123,nickname:"FICTÍCIA"}},currentPricesBusy=false,mlAdsBusy=false,kitEditing=null,kitItems=new Map(),adsUi={busy:false},adsHistoryUi={busy:false};', c);
 vm.runInContext(moduleSource, c);
 return { api: c.ConduzMlImport, get, saved, notices, opened, c, run: s => vm.runInContext(s, c), data: () => clone(vm.runInContext('state', c)) };
}
test('pendências mantêm anúncios desativados no fim antes da paginação, sem alterar os dados salvos', () => {
 const a=app(true),statuses=['closed',...Array(30).fill('active'),'paused','inactive','unavailable'];
 a.c.seedPending=statuses.map((status,index)=>a.api.pendingProduct({...fixtures.response('MLB900000000'+index).item,title:'Produto '+index,...(status==='unavailable'?{availability:'unavailable'}:{status})},fixtures.data().fees));
 a.run('state.pendingProducts=seedPending');const before=a.data();a.api.renderPending();
 assert.doesNotMatch(a.get('ml-pending-list').innerHTML,/MLB900000000(?:0|31)(?:\D|$)/);
 assert.match(a.get('ml-pending-list').innerHTML,/MLB9000000001/);
 a.get('ml-pending-next').onclick();assert.match(a.get('ml-pending-list').innerHTML,/Anúncio encerrado/);
 a.get('ml-pending-search').value='MLB9000000000';a.get('ml-pending-search').oninput();
 assert.match(a.get('ml-pending-list').innerHTML,/Anúncio encerrado/);
 assert.deepEqual(a.data(),before);assert.equal(a.saved.length,0);
});

test('consulta 41 anúncios em páginas até o fim sem alterar dados, com concorrência limitada e pendências sem custo', async () => {
 const ids = ['MLB1234567890', ...Array.from({ length: 40 }, (_, i) => 'MLB' + (9000000000 + i))], loader = fixtures.requests(ids), a = app(), before = fixtures.data();
 const result = await a.api.inspectCatalog({ data: before, sellerId: 123, request: loader.request });
 assert.equal(result.total, 41); assert.equal(result.rows.length, 41);
 assert.deepEqual(loader.calls.filter(c => c.action === 'catalog-items').map(c => c.options.query), [{}, { cursor: '20' }, { cursor: '40' }]);
 assert.equal(result.rows.filter(r => r.kind === 'pending').length, 40);
 for (const row of result.rows.filter(r => r.kind === 'pending')) assert.equal('cost' in row.proposal, false);
 assert.deepEqual(before, fixtures.data()); assert.equal(a.saved.length, 0);
});
test('a proposta preserva dados internos, taxas, Ads, margem e kits e recalcula sugestões oficiais para o mesmo custo', async () => {
 const a = app(), data = fixtures.data(), loader = fixtures.requests();
 const result = await a.api.inspectCatalog({ data, sellerId: 123, request: loader.request }), row = result.rows.find(r => r.kind === 'existing');
 assert.equal(row.ready, true);
 for (const key of ['id', 'name', 'category', 'cost', 'weight', 'margin', 'extra', 'adsMl', 'adsShopee', 'feeSnapshot', 'mlAds']) assert.deepEqual(clone(row.proposal[key]), data.products[0][key]);
 assert.equal(row.proposal.mercadoLivre.price, 55); assert.equal(row.proposal.mlPricing.inputs.weight, data.products[0].weight);
 assert.equal(row.proposal.mlPricing.inputs.cost, data.products[0].cost); assert.equal(row.proposal.mlPricing.inputs.margin, data.products[0].margin);
 const next = a.api.applyReview(data, result.rows, new Set([row.id]), 123);
 assert.deepEqual(clone(next.kits), data.kits); assert.deepEqual(clone(next.fees), data.fees); assert.deepEqual(clone(next.products[1]), data.products[1]);
 assert.equal(next.pendingProducts.length, 0); assert.equal(data.products[0].mercadoLivre.price, 50);
});
test('importar novamente atualiza a mesma pendência e mantém sua margem e taxas, sem duplicar anúncios', async () => {
 const a = app(), data = fixtures.data(), loader = fixtures.requests(), first = await a.api.inspectCatalog({ data, sellerId: 123, request: loader.request });
 const pending = first.rows.find(r => r.kind === 'pending');
 const next = a.api.applyReview(data, first.rows, new Set([pending.id]), 123); next.pendingProducts[0].margin = 27; next.pendingProducts[0].feeSnapshot.ml.tax = 9;
 const second = await a.api.inspectCatalog({ data: next, sellerId: 123, request: loader.request });
 const saved = a.api.applyReview(next, second.rows, new Set([pending.id]), 123);
 assert.equal(saved.pendingProducts.length, 1); assert.equal(saved.pendingProducts[0].margin, 27); assert.equal(saved.pendingProducts[0].feeSnapshot.ml.tax, 9); assert.equal(saved.products.length, data.products.length);
});
test('mudança durante revisão, troca de empresa e cadastro criado em outra aba não são sobrescritos', async () => {
 const a = app(), data = fixtures.data(), loader = fixtures.requests(), result = await a.api.inspectCatalog({ data, sellerId: 123, request: loader.request });
 const existing = result.rows.find(r => r.kind === 'existing'), pending = result.rows.find(r => r.kind === 'pending');
 const edited = clone(data); edited.products[0].cost = 99;
 assert.throws(() => a.api.applyReview(edited, result.rows, new Set([existing.id, pending.id]), 123), /mudou/); assert.equal(edited.pendingProducts, undefined);
 assert.throws(() => a.api.applyReview(data, result.rows, new Set([pending.id]), 456), /outra conta/);
 const completed = clone(data); completed.products.push({ ...completed.products[1], id: 'novo', mercadoLivre: pending.item });
 assert.throws(() => a.api.applyReview(completed, result.rows, new Set([pending.id]), 123), /já recebeu/);
});
test('não confunde falha de preço ou de cotação com lucro zero e preserva cadastro fora da listagem', async () => {
 const a = app(), data = fixtures.data(), loader = fixtures.requests(['MLB9000000001']);
 const absent = await a.api.inspectCatalog({ data, sellerId: 123, request: loader.request });
 assert.equal(absent.rows.find(r => r.kind === 'existing').ready, false); assert.match(absent.rows.find(r => r.kind === 'existing').note, /não apareceu/);
 const failed = await a.api.inspectCatalog({ data, sellerId: 123, request: async (action, options) => {
  if (action === 'pricing') throw Error('Frete indisponível'); return fixtures.requests(['MLB1234567890']).request(action, options);
 } });
 const row = failed.rows[0]; assert.equal(row.ready, false); assert.match(row.note, /Frete indisponível/);
 assert.throws(() => a.api.applyReview(data, failed.rows, new Set([row.id]), 123), /indisponível/);
});
test('listagem incompleta, repetida ou de outra conta não vira revisão integral válida', async () => {
 const a = app(), data = fixtures.data();
 await assert.rejects(a.api.inspectCatalog({ data, sellerId: 123, request: async () => ({ items: [], nextCursor: null }) }), /incompleta/);
 const repeated = { itemIds: ['MLB1234567890'], items: [], unavailableIds: ['MLB1234567890'], nextCursor: 'mesmo' };
 await assert.rejects(a.api.inspectCatalog({ data, sellerId: 123, request: async () => repeated }), /deixou de avançar/);
 const loader = fixtures.requests(); const result = await a.api.inspectCatalog({ data, sellerId: 123, request: async (action, options) => { const r = await loader.request(action, options); if (action === 'item') r.item.sellerId = 456; return r; } });
 assert.ok(result.rows.every(r => !r.ready));
});
test('cancelar ignora resposta em andamento e erro 429 deixa os anúncios não consultados explícitos', async () => {
 const a = app(), data = fixtures.data(); let active = true, resolve;
 const task = a.api.inspectCatalog({ data, sellerId: 123, active: () => active, request: () => new Promise(r => { resolve = r; }) });
 active = false; resolve({ itemIds: [], items: [], unavailableIds: [], nextCursor: null }); assert.equal(await task, null);
 const loader = fixtures.requests(Array.from({ length: 8 }, (_, i) => 'MLB' + (9000000000 + i)));
 const result = await a.api.inspectCatalog({ data, sellerId: 123, request: (action, options) => { if (action === 'item') throw Object.assign(Error('Limite de consultas'), { status: 429 }); return loader.request(action, options); } });
 assert.equal(result.total, 8); assert.ok(result.stopped); assert.equal(result.rows.filter(r => r.item.itemId !== 'MLB1234567890').length, 8); assert.ok(result.rows.every(r => !r.ready));
});
test('variações exigem revisão individual e não substituem automaticamente o preço de um cadastro', async () => {
 const a = app(), data = fixtures.data(), loader = fixtures.requests();
 const result = await a.api.inspectCatalog({ data, sellerId: 123, request: async (action, options) => { const r = await loader.request(action, options); if (action === 'item') r.item.variationCount = 3; return r; } });
 assert.equal(result.rows.find(r => r.kind === 'existing').ready, false); assert.equal(result.rows.find(r => r.kind === 'pending').ready, true);
 assert.equal(loader.calls.some(c => c.action === 'pricing'), false);
});
test('controlador não grava ao consultar ou cancelar; salva apenas resultados selecionados após revisão', async () => {
 const loader = fixtures.requests(), a = app(true, loader.request), before = a.data();
 await a.get('ml-import-open').onclick();
 assert.deepEqual(a.data(), before); assert.equal(a.saved.length, 0); assert.equal(a.get('ml-import-save').disabled, true);
 a.get('ml-import-filter').value = 'pending'; a.get('ml-import-select').onclick(); assert.equal(a.get('ml-import-save').disabled, false);
 a.get('ml-import-save').onclick(); assert.equal(a.saved.length, 1); assert.equal(a.data().pendingProducts.length, 1); assert.deepEqual(a.data().products, before.products); assert.deepEqual(a.data().kits, before.kits);
 await a.get('ml-import-open').onclick(); a.get('ml-import-cancel').onclick(); assert.equal(a.saved.length, 1);
});
test('falha de armazenamento preserva os dados anteriores e mantém a revisão aberta para recuperar', async () => {
 const loader = fixtures.requests(), a = app(true, loader.request), before = a.data(); await a.get('ml-import-open').onclick(); a.get('ml-import-select').onclick();
 a.c.failStorage = true; a.get('ml-import-save').onclick();
 assert.deepEqual(a.data(), before); assert.equal(a.saved.length, 0); assert.equal(a.get('ml-import-dialog').open, true); assert.match(a.get('ml-import-error').textContent, /armazenamento/);
});
test('controlador salva conferência de existentes e pendências sem perder campos após copiar a revisão', async () => {
 const loader = fixtures.requests(), a = app(true, loader.request), before = a.data();
 await a.get('ml-import-open').onclick(); a.get('ml-import-select').onclick(); a.get('ml-import-save').onclick();
 assert.equal(a.saved.length, 1); const after = a.data(); assert.equal(after.products[0].mercadoLivre.price, 55); assert.equal(after.pendingProducts.length, 1);
 for (const key of ['cost', 'margin', 'adsMl', 'adsShopee', 'weight', 'name', 'feeSnapshot']) assert.deepEqual(after.products[0][key], before.products[0][key]);
 assert.deepEqual(after.products[1], before.products[1]); assert.deepEqual(after.kits, before.kits); assert.deepEqual(after.adsReconciliations, before.adsReconciliations);
});
test('pendências sobrevivem ao backup v19; custo ausente não entra nos produtos válidos nem nos kits', async () => {
 const a = app(true), data = fixtures.data(), loader = fixtures.requests(); const result = await a.api.inspectCatalog({ data, sellerId: 123, request: loader.request }); const p = result.rows.find(r => r.kind === 'pending');
 const saved = a.api.applyReview(data, result.rows, new Set([p.id]), 123); a.c.savedFixture = saved;
 const backup = a.run('buildBackup(savedFixture)'); assert.equal(JSON.parse(backup).version, 19); a.c.backup = backup;
 assert.deepEqual(clone(a.run('parseBackup(backup).pendingProducts')), clone(saved.pendingProducts));
 assert.equal(a.run('validState({...savedFixture,products:[...savedFixture.products,{...savedFixture.products[0],cost:0}]})'), false);
 assert.equal(a.run('validPendingProducts([{...savedFixture.pendingProducts[0],cost:0}])'), false);
 a.c.seedPending = saved.pendingProducts; a.run('state.pendingProducts=seedPending'); a.get('ml-pending-list').onclick({ target: { closest: () => ({ dataset: { completePending: p.proposal.id } }) } });
 assert.equal(a.opened[0].cost, ''); assert.equal(a.data().pendingProducts.length, 1); assert.equal(a.saved.length, 0);
});

test('ao conectar, importa automaticamente todo o catálogo em lotes sem exigir botão e sem consultar preços dos existentes', async () => {
 const loader = fixtures.requests(['MLB1234567890', ...Array.from({ length: 40 }, (_, i) => 'MLB' + (9000000000 + i))]);
 const a = app(true, loader.request), before = a.data();
 a.api.onCatalogReady(123); await a.api.syncNewProducts();
 assert.equal(a.saved.length, 1); assert.equal(a.data().pendingProducts.length, 40);
 assert.deepEqual(a.data().products, before.products); assert.deepEqual(a.data().kits, before.kits); assert.deepEqual(a.data().fees, before.fees); assert.deepEqual(a.data().adsReconciliations, before.adsReconciliations);
 assert.equal(loader.calls.length, 3); assert.ok(loader.calls.every(c => c.action === 'catalog-items'));
 assert.equal(a.get('ml-import-dialog').open, false); assert.match(a.get('ml-catalog-auto-status').textContent, /40 novo/);
 a.api.onCatalogReady(123); await a.api.syncNewProducts(); assert.equal(a.saved.length, 1); assert.equal(loader.calls.length, 3);
 assert.ok(a.data().pendingProducts.every(p => !Object.hasOwn(p, 'cost')));
});

test('importação automática aguarda catálogo autorizado e edição aberta e ignora anúncios concluídos durante a consulta', async () => {
 const loader = fixtures.requests(); let release;
 const a = app(true, async (action, options) => { const r = await loader.request(action, options); if (action === 'catalog-items') await new Promise(resolve => { release = resolve; }); return r; });
 a.c.cloudUnavailable = true; a.api.onCatalogReady(123); await a.api.syncNewProducts(); assert.equal(loader.calls.length, 0);
 a.c.cloudUnavailable = false; a.get('product-dialog').open = true; await a.api.syncNewProducts(); assert.equal(loader.calls.length, 0);
 a.get('product-dialog').open = false; const loading = a.api.syncNewProducts(); await new Promise(resolve => setImmediate(resolve));
 a.c.completed = { ...a.data().products[1], id: 'concluido', mercadoLivre: fixtures.response('MLB9000000001').item };
 a.run('state.products.push(completed)'); release(); await loading;
 assert.equal(a.data().products.length, 3); assert.equal(a.data().pendingProducts?.length ?? 0, 0); assert.equal(a.saved.length, 0);
});

test('não duplica nem sobrescreve pendências existentes e retenta consulta indisponível explicitamente', async () => {
 const a = app(), data = fixtures.data(), item = fixtures.response('MLB9000000001').item;
 const first = a.api.addDiscovered(data, [item, item], 123); first.pendingProducts[0].margin = 29;
 const second = a.api.addDiscovered(first, [{ ...item, price: 999 }], 123);
 assert.strictEqual(second, first); assert.equal(second.pendingProducts[0].margin, 29); assert.equal(second.pendingProducts[0].item.price, 55);
 const loader = fixtures.requests(), unavailable = await a.api.discoverCatalog({ sellerId: 123, request: async (action, options) => {
  if (action === 'item') throw Error('Anúncio indisponível'); const r = await loader.request(action, options); r.items = r.items.filter(i => i.itemId !== 'MLB9000000001'); r.unavailableIds = ['MLB9000000001']; return r;
 } });
 assert.deepEqual(clone(unavailable.unavailable), ['MLB9000000001']); assert.equal(unavailable.total, 2); assert.equal(unavailable.items.length, 1);
});

test('falha de listagem ou armazenamento não aplica importação automática parcialmente', async () => {
 const loader = fixtures.requests(Array.from({ length: 21 }, (_, i) => 'MLB' + (9000000000 + i)));
 const a = app(true, (action, options) => options.query?.cursor ? Promise.reject(Error('Sem conexão')) : loader.request(action, options)), before = a.data();
 a.api.onCatalogReady(123); await a.api.syncNewProducts(); assert.deepEqual(a.data(), before); assert.equal(a.saved.length, 0); assert.match(a.get('ml-catalog-auto-status').textContent, /Sem conexão/);
 const b = app(true, fixtures.requests().request), old = b.data(); b.c.failStorage = true; b.api.onCatalogReady(123); await b.api.syncNewProducts();
 assert.deepEqual(b.data(), old); assert.equal(b.saved.length, 0); assert.match(b.get('ml-catalog-auto-status').textContent, /gravar/);
});

test('desconectar ou trocar de conta descarta uma importação automática em andamento', async () => {
 let release; const loader = fixtures.requests(), a = app(true, async (action, options) => { const r = await loader.request(action, options); await new Promise(resolve => { release = resolve; }); return r; }), before = a.data();
 a.api.onCatalogReady(123); const task = a.api.syncNewProducts(); await new Promise(resolve => setImmediate(resolve));
 a.api.onDisconnect(); a.run('mlConnection={connected:true,account:{id:456}}'); release(); await task;
 assert.deepEqual(a.data(), before); assert.equal(a.saved.length, 0);
 assert.throws(() => a.api.addDiscovered(before, [fixtures.response().item], 456), /outra conta/);
});
