const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createCipheriv, randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const load = import('../cloudflare/app.mjs');
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
 return { db, env: { CATALOG_DB: db, CATALOG_SELLER_ID: '123', ML_CLIENT_ID: '1', ML_CLIENT_SECRET: 'TEST_ONLY', ML_SESSION_SECRET: 'ab'.repeat(32), ML_REDIRECT_URI: origin + '/api/ml/callback' } };
}
const fees = { ml: { commission: 11, premiumCommission: 14, fixed: 0, tax: 6 }, shopee: { commission: 20, fixed: 4.5, tax: 6 } };
const product = (id = 'p1') => ({ id, name: 'Produto ' + id, category: 'Teste', cost: 10, weight: .2, margin: 20, extra: 0 });
const catalog = () => ({ products: [product()], kits: [], fees });
function request(method = 'GET', body, options = {}) {
 return new Request(origin + '/api/catalog', { method, headers: { Cookie: session(), ...(method === 'PUT' ? { Origin: origin, 'X-Conduz-Action': 'catalog', 'Content-Type': 'application/json' } : {}), ...options }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const write = (data = catalog(), revision = 0, mutationId = randomUUID()) => ({ revision, mutationId, data });

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
