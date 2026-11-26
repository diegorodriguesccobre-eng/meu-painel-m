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
 const c = vm.createContext({ URL, ...(ui ? { document: { getElementById: get } } : {}), mlRequest: request, render() {}, toast: s => notices.push(s), openProduct: p => opened.push(clone(p)), importMlItem() {}, renderAutoPricing() {}, scheduleOfficialPricing() {}, persist: () => { if (c.failStorage) return false; saved.push(clone(vm.runInContext('state', c))); return true; } });
 vm.runInContext(core + '\n' + helpers + '\nlet state=' + JSON.stringify(fixtures.data()) + ';let mlConnection={connected:true,account:{id:123,nickname:"FICTÍCIA"}},currentPricesBusy=false,mlAdsBusy=false,adsUi={busy:false},adsHistoryUi={busy:false};', c);
 vm.runInContext(moduleSource, c);
 return { api: c.ConduzMlImport, get, saved, notices, opened, c, run: s => vm.runInContext(s, c), data: () => clone(vm.runInContext('state', c)) };
}
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
 a.get('ml-import-open').onclick(); await a.get('ml-import-load').onclick();
 assert.deepEqual(a.data(), before); assert.equal(a.saved.length, 0); assert.equal(a.get('ml-import-save').disabled, true);
 a.get('ml-import-filter').value = 'pending'; a.get('ml-import-select').onclick(); assert.equal(a.get('ml-import-save').disabled, false);
 a.get('ml-import-save').onclick(); assert.equal(a.saved.length, 1); assert.equal(a.data().pendingProducts.length, 1); assert.deepEqual(a.data().products, before.products); assert.deepEqual(a.data().kits, before.kits);
 a.get('ml-import-open').onclick(); await a.get('ml-import-load').onclick(); a.get('ml-import-cancel').onclick(); assert.equal(a.saved.length, 1);
});
test('falha de armazenamento preserva os dados anteriores e mantém a revisão aberta para recuperar', async () => {
 const loader = fixtures.requests(), a = app(true, loader.request), before = a.data(); a.get('ml-import-open').onclick(); await a.get('ml-import-load').onclick(); a.get('ml-import-select').onclick();
 a.c.failStorage = true; a.get('ml-import-save').onclick();
 assert.deepEqual(a.data(), before); assert.equal(a.saved.length, 0); assert.equal(a.get('ml-import-dialog').open, true); assert.match(a.get('ml-import-error').textContent, /armazenamento/);
});
test('controlador salva conferência de existentes e pendências sem perder campos após copiar a revisão', async () => {
 const loader = fixtures.requests(), a = app(true, loader.request), before = a.data();
 a.get('ml-import-open').onclick(); await a.get('ml-import-load').onclick(); a.get('ml-import-select').onclick(); a.get('ml-import-save').onclick();
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
