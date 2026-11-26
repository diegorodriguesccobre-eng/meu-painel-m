const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createCipheriv, randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const load = import('../cloudflare/app.mjs');
const { report, reconciliation, account } = require('./support/ads-fixtures.cjs');
const origin = 'https://painel.example';

function database(t) {
 const sqlite = new DatabaseSync(':memory:');
 sqlite.exec(fs.readFileSync(path.join(__dirname, '../cloudflare/migrations/0001_catalog.sql'), 'utf8'));
 t.after(() => sqlite.close());
 const db = {
  failBatch: false,
  prepare(sql) {
   return { sql, values: [], bind(...values) { return { ...this, values }; },
    async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; } };
  },
  async batch(statements) {
   sqlite.exec('BEGIN IMMEDIATE');
   try {
    const rows = statements.map((s, i) => {
     if (db.failBatch && i === 2) throw Error('Falha simulada');
     const query = sqlite.prepare(s.sql);
     if (/^SELECT/.test(s.sql)) return { results: query.all(...s.values), meta: { changes: 0 } };
     const result = query.run(...s.values); return { results: [], meta: { changes: Number(result.changes) } };
    });
    sqlite.exec('COMMIT'); return rows;
   } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
  withSession(mode) { assert.equal(mode, 'first-primary'); return db; }
 };
 return db;
}
function session(userId = 123, exp = Date.now() + 60000) {
 const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from('ab'.repeat(32), 'hex'), iv);
 const payload = Buffer.concat([cipher.update(JSON.stringify({ type: 'session', userId, exp, accessToken: 'TEST_ONLY', nickname: 'EMPRESA TESTE' })), cipher.final()]);
 return '__Host-conduz_ml_session=' + Buffer.concat([iv, cipher.getAuthTag(), payload]).toString('base64url');
}
function setup(t) {
 const db = database(t);
 return { db, env: { CATALOG_DB: db, CATALOG_SELLER_ID: '123', PANEL_LOGIN_REQUIRED:'false',ML_CLIENT_ID: '1', ML_CLIENT_SECRET: 'TEST_ONLY', ML_SESSION_SECRET: 'ab'.repeat(32), ML_REDIRECT_URI: origin + '/api/ml/callback' } };
}
const fees = { ml: { commission: 11, premiumCommission: 14, fixed: 0, tax: 6 }, shopee: { commission: 20, fixed: 4.5, tax: 6 } };
const product = (id = 'p1') => ({ id, name: 'Produto ' + id, category: 'Teste', cost: 10, weight: .2, margin: 20, extra: 0 });
const catalog = () => ({ products: [product()], kits: [], fees });
function request(method = 'GET', body, options = {}) {
 return new Request(origin + '/api/catalog', { method, headers: { Cookie: session(), ...(method === 'PUT' ? { Origin: origin, 'X-Conduz-Action': 'catalog', 'Content-Type': 'application/json' } : {}), ...options }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const write = (data = catalog(), revision = 0, mutationId = randomUUID()) => ({ schemaVersion: 2, revision, mutationId, data });

test('pendências sem custo são compartilhadas e uma página antiga não pode apagá-las', async t => {
 const { createWorker } = await load, worker = createWorker(), { env } = setup(t);
 const item = require('./support/ml-import-fixtures.cjs').response('MLB9000000001').item;
 const pending = { id: 'pending-1', item, margin: 20, feeSnapshot: fees, importedAt: '2026-11-20T12:00:00Z' };
 const data = { ...catalog(), pendingProducts: [pending] };
 assert.equal((await worker.fetch(request('PUT', { ...write(data), schemaVersion: 4 }), env)).status, 200);
 const saved = await (await worker.fetch(request(), env)).json(); assert.deepEqual(saved.data.pendingProducts, [pending]);
 const old = await worker.fetch(request('PUT', { ...write(catalog(), 1), schemaVersion: 3 }), env);
 assert.equal(old.status, 426); assert.equal((await old.json()).error, 'CLIENT_UPDATE_REQUIRED');
 assert.equal((await worker.fetch(request('PUT', { ...write({ ...catalog(), pendingProducts: [] }, 1), schemaVersion: 4 }), env)).status, 200);
 assert.deepEqual((await (await worker.fetch(request(), env)).json()).data.pendingProducts, []);
});
test('valida custo ausente, proprietário e duplicatas nas pendências antes de gravar', async t => {
 const { createWorker } = await load, worker = createWorker(), { env } = setup(t);
 const item = require('./support/ml-import-fixtures.cjs').response('MLB9000000001').item;
 const pending = { id: 'pending-1', item, margin: 20, feeSnapshot: fees, importedAt: '2026-11-20T12:00:00Z' };
 for (const rows of [[{ ...pending, cost: 0 }], [{ ...pending, item: { ...item, sellerId: 456 } }], [pending, { ...pending, id: 'outro' }]]) {
  assert.equal((await worker.fetch(request('PUT', { ...write({ ...catalog(), pendingProducts: rows }), schemaVersion: 4 }), env)).status, 400);
 }
 assert.equal((await worker.fetch(request('PUT', { ...write(catalog()), schemaVersion: 4 }), env)).status, 400);
 assert.equal((await (await worker.fetch(request(), env)).json()).revision, 0);
});

test('catálogo reutiliza sessão criptografada, exige conta da empresa e bloqueia origem externa', async t => {
 const { createWorker } = await load, worker = createWorker(), { env } = setup(t);
 assert.equal((await worker.fetch(request('GET', null, { Cookie: '' }), env)).status, 401);
 assert.equal((await worker.fetch(request('GET', null, { Cookie: '__Host-conduz_ml_session=forjado' }), env)).status, 401);
 assert.equal((await worker.fetch(request('GET', null, { Cookie: session(456) }), env)).status, 403);
 assert.equal((await worker.fetch(request('GET', null, { Cookie: session(123, 1) }), env)).status, 401);
 assert.equal((await worker.fetch(request('PUT', write(), { Origin: 'https://outra.example' }), env)).status, 403);
 assert.equal((await worker.fetch(request('PUT', write(), { 'X-Conduz-Action': '' }), env)).status, 403);
 assert.equal((await worker.fetch(request('GET', null, { 'Sec-Fetch-Site': 'cross-site' }), env)).status, 403);
 assert.equal((await worker.fetch(request('GET'), { ...env, CATALOG_SELLER_ID: '' })).status, 503);
});

test('catálogo preserva taxas, kits e valores; não armazena token e reconhece revisões sem baixar novamente', async t => {
 const { createWorker } = await load, worker = createWorker(), { env } = setup(t);
 const before = await (await worker.fetch(request(), env)).json(); assert.equal(before.data, null);
 const data = catalog(); data.products[0].feeSnapshot = fees; data.products[0].adsMl = 6;
 data.kits.push({ id: 'kit', name: 'Kit', margin: 20, extra: 1, mlShipping: 0, items: [{ productId: 'p1', quantity: 2 }], feeSnapshot: fees });
 const saved = await worker.fetch(request('PUT', write(data)), env); assert.equal(saved.status, 200);
 const response = await worker.fetch(request(), env); assert.equal(response.headers.get('Cache-Control'), 'no-store');
 const result = await response.json(); assert.deepEqual(result.data, data); assert.equal(result.revision, 1);
 assert.ok(!JSON.stringify(result).includes('TEST_ONLY'));
 assert.equal((await worker.fetch(request('GET', null, { 'If-None-Match': '"1"' }), env)).status, 304);
});

test('edições concorrentes não sobrescrevem versões e uma repetição idêntica não duplica gravações', async t => {
 const { createWorker } = await load, worker = createWorker(), { env } = setup(t);
 const first = write(); assert.equal((await worker.fetch(request('PUT', first), env)).status, 200);
 assert.equal((await worker.fetch(request('PUT', first), env)).status, 200);
 const a = catalog(), b = catalog(); a.products[0].cost = 11; b.products[0].cost = 12;
 const responses = await Promise.all([worker.fetch(request('PUT', write(a, 1)), env), worker.fetch(request('PUT', write(b, 1)), env)]);
 assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
 const current = await (await worker.fetch(request(), env)).json(); assert.equal(current.revision, 2);
 assert.ok([11, 12].includes(current.data.products[0].cost));
});

test('gravação transacional mantém catálogo anterior quando uma parte falha e preserva Unicode entre partes', async t => {
 const { createWorker } = await load, worker = createWorker(), { env, db } = setup(t);
 await worker.fetch(request('PUT', write()), env);
 db.failBatch = true;
 assert.equal((await worker.fetch(request('PUT', write({ ...catalog(), products: [product('outro')] }, 1)), env)).status, 503);
 db.failBatch = false;
 assert.equal((await (await worker.fetch(request(), env)).json()).revision, 1);
 const data = catalog(); data.products[0].notes = '';
 const start = JSON.stringify(data).indexOf('"notes":"') + '"notes":"'.length;
 data.products[0].notes = 'a'.repeat(119999 - start) + '😀' + 'z'.repeat(120000);
 assert.equal((await worker.fetch(request('PUT', write(data, 1)), env)).status, 200);
 assert.deepEqual((await (await worker.fetch(request(), env)).json()).data, data);
});

test('validação recusa kits órfãos, custos inválidos, conta de outro vendedor e payload excessivo', async t => {
 const { createWorker } = await load, worker = createWorker(), { env } = setup(t);
 const invalids = [];
 const missing = catalog(); missing.kits = [{ id: 'k', name: 'Kit', margin: 20, extra: 0, items: [{ productId: 'ausente', quantity: 1 }] }]; invalids.push(missing);
 const foreign = catalog(); foreign.products[0].mercadoLivre = { sellerId: 456 }; invalids.push(foreign);
 const cost = catalog(); cost.products[0].cost = -1; invalids.push(cost);
 const repeated = catalog(); repeated.products.push(product()); invalids.push(repeated);
 for (const data of invalids) assert.equal((await worker.fetch(request('PUT', write(data)), env)).status, 400);
 assert.equal((await worker.fetch(request('PUT', write(), { 'Content-Length': String(9 * 1024 * 1024) }), env)).status, 413);
 assert.equal((await (await worker.fetch(request(), env)).json()).revision, 0);
});

test('Ads completo é preservado e versões antigas da página não podem apagar relatórios',async t=>{
 const {createWorker}=await load,worker=createWorker(),{env}=setup(t),data=catalog();
 data.adsReports=[report()];data.adsAccounts=[account()];data.adsReconciliations=[reconciliation()];
 assert.equal((await worker.fetch(request('PUT',write(data)),env)).status,200);
 assert.deepEqual((await (await worker.fetch(request(),env)).json()).data,data);
 const old=write(catalog(),1);delete old.schemaVersion;
 assert.equal((await worker.fetch(request('PUT',old),env)).status,426);
 assert.equal((await (await worker.fetch(request(),env)).json()).data.adsReconciliations.length,1);
});

test('recusa outra conta nos relatórios, nas métricas internas e nas conciliações',async t=>{
 const {createWorker}=await load,worker=createWorker(),{env}=setup(t);
 const cases=[{adsReports:[report({sellerId:999})]},{adsAccounts:[account({sellerId:999})]},{adsReconciliations:[reconciliation(undefined,{sellerId:999})]}];
 const nested=report();nested.items[0].periods[0].sellerId=999;cases.push({adsReports:[nested]});
 const duplicate=reconciliation();cases.push({adsReconciliations:[duplicate,duplicate]});
 for(const extra of cases)assert.equal((await worker.fetch(request('PUT',write({...catalog(),...extra})),env)).status,400);
 assert.equal((await (await worker.fetch(request(),env)).json()).revision,0);
});

test('duas empresas autorizadas têm catálogos, kits, Ads e revisões independentes no mesmo banco', async t => {
 const { createWorker } = await load, worker = createWorker(), { env } = setup(t);
 env.CATALOG_SELLER_IDS = '123,456';
 const headers = id => ({ Cookie: session(id), 'X-Conduz-Catalog-Account': String(id) });
 const a = catalog(), b = catalog();
 a.products[0].name = 'Cobre'; b.products[0].name = 'Energia'; b.products[0].cost = 28;
 for (const [id, data] of [[123, a], [456, b]]) {
  data.kits = [{ id: 'kit', name: 'Kit ' + data.products[0].name, margin: 20, extra: 0, items: [{ productId: 'p1', quantity: 2 }] }];
  data.adsReports = [report({ sellerId: id })]; data.adsAccounts = [account({ sellerId: id })];
  data.adsReconciliations = [reconciliation(undefined, { sellerId: id })];
  const body = { ...write(data), schemaVersion: 3 };
  assert.equal((await worker.fetch(request('PUT', body, headers(id)), env)).status, 200);
 }
 for (const [id, data] of [[123, a], [456, b]]) {
  const result = await (await worker.fetch(request('GET', null, headers(id)), env)).json();
  assert.equal(result.revision, 1); assert.deepEqual(result.data, data);
 }
 b.products[0].cost = 30;
 assert.equal((await worker.fetch(request('PUT', { ...write(b, 1), schemaVersion: 3 }, headers(456)), env)).status, 200);
 const unchanged = await (await worker.fetch(request('GET', null, headers(123)), env)).json();
 assert.equal(unchanged.revision, 1); assert.deepEqual(unchanged.data, a);
 const forged = await worker.fetch(request('GET', null, { ...headers(123), 'X-Conduz-Catalog-Account': '456' }), env);
 assert.equal(forged.status, 409); assert.equal((await forged.json()).error, 'ACCOUNT_CHANGED');
 assert.equal((await worker.fetch(request('GET', null, headers(789)), env)).status, 403);
});

test('abas antigas e uma sessão trocada não gravam nem leem o catálogo de outra empresa', async t => {
 const { createWorker } = await load, worker = createWorker(), { env } = setup(t); env.CATALOG_SELLER_IDS = '123,456';
 const headers = { Cookie: session(456), 'X-Conduz-Catalog-Account': '456' };
 assert.equal((await worker.fetch(request('GET', null, { Cookie: session(456) }), env)).status, 426);
 assert.equal((await worker.fetch(request('PUT', write(), headers), env)).status, 426);
 const stale = { ...headers, 'X-Conduz-Catalog-Account': '123' };
 assert.equal((await worker.fetch(request('PUT', { ...write(), schemaVersion: 3 }, stale), env)).status, 409);
 const foreign = { ...catalog(), adsReports: [report({ sellerId: 123 })] };
 assert.equal((await worker.fetch(request('PUT', { ...write(foreign), schemaVersion: 3 }, headers), env)).status, 400);
 assert.equal((await (await worker.fetch(request('GET', null, headers), env)).json()).revision, 0);
 const configuration = await (await worker.fetch(new Request(origin + '/api/catalog/status'), env)).json();
 assert.equal(configuration.schemaVersion, 4); assert.equal(configuration.legacySellerId, '123');
 for (const value of ['', '123,outro', '0', '123,,456']) {
  assert.equal((await worker.fetch(request(), { ...env, CATALOG_SELLER_IDS: value })).status, 503);
 }
});

test('consultas do Mercado Livre e desconexão recusam a identidade de uma aba antiga antes de chamar a API', async t => {
 const { createWorker } = await load, { env } = setup(t); let calls = 0;
 const worker = createWorker({ fetchImpl: async () => { calls++; throw Error('Não deve consultar'); } });
 const headers = { Cookie: session(456), 'X-Conduz-Account': '123', Origin: origin, 'X-Conduz-Action': 'mercadolivre' };
 const items = await worker.fetch(new Request(origin + '/api/ml/items', { headers }), env);
 assert.equal(items.status, 409); assert.equal((await items.json()).error, 'ACCOUNT_CHANGED');
 const disconnect = await worker.fetch(new Request(origin + '/api/ml/disconnect', { method: 'POST', headers }), env);
 assert.equal(disconnect.status, 409); assert.equal(disconnect.headers.get('Set-Cookie'), null); assert.equal(calls, 0);
 const status = await (await worker.fetch(new Request(origin + '/api/ml/status', { headers }), env)).json();
 assert.equal(status.account.id, 456);
});
