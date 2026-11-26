/* Laboratório exclusivamente local, com conta e valores fictícios. Nunca usa D1 remoto. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { createCipheriv, randomBytes, randomUUID } = require('node:crypto');
const { report, reconciliation, account } = require('./ads-fixtures.cjs');
const root = path.resolve(__dirname, '../..');
const clone = value => JSON.parse(JSON.stringify(value));

function fixture() {
 const source = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
 const context = vm.createContext({ URL });
 vm.runInContext(source.slice(0, source.indexOf('let state=defaults()')) + ';globalThis.data=defaults();', context);
 const data = clone(context.data), fees = data.fees;
 fees.ml = { commission: 11, premiumCommission: 14, fixed: 0, tax: 6 };
 const history = report();
 const link = { itemId: 'MLB1234567890', sellerId: 123, title: 'Produto fictício A', categoryId: 'MLB1000', categoryName: 'Teste', catalogProductId: null, listingType: 'gold_special', permalink: 'https://www.mercadolivre.com.br/MLB-1234567890-teste', price: 50, weight: .2, thumbnail: null, variationCount: 0, fetchedAt: history.fetchedAt };
 data.products = ['A', 'B'].map((letter, i) => ({ id: 'teste-' + letter, name: 'Produto fictício ' + letter, category: 'Laboratório', cost: 10 + i * 5, weight: .2, margin: 20, extra: 0, mlShipping: 0, adsMl: 6, adsShopee: 9, feeSnapshot: clone(fees), ...(i === 0 ? { mercadoLivre: link, mlAds: clone(history.items[0].total) } : {}) }));
 data.kits = ['A', 'B'].map(letter => ({ id: 'kit-' + letter, name: 'Kit fictício ' + letter, margin: 20, extra: 1, mlShipping: 0, adsMl: 5, adsShopee: 8, feeSnapshot: clone(fees), items: [{ productId: 'teste-' + letter, quantity: 2 }] }));
 data.adsReports = [history]; data.adsAccounts = [account()];
 data.adsReconciliations = [reconciliation(), reconciliation(history.items[0].periods[1])];
 return data;
}

function database() {
 const sqlite = new DatabaseSync(':memory:');
 sqlite.exec(fs.readFileSync(path.join(root, 'cloudflare/migrations/0001_catalog.sql'), 'utf8'));
 const db = {
  prepare(sql) { return { sql, values: [], bind(...values) { return { ...this, values }; }, async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; } }; },
  async batch(statements) {
   sqlite.exec('BEGIN IMMEDIATE');
   try {
    const rows = statements.map(s => {
     const query = sqlite.prepare(s.sql);
     if (/^SELECT/.test(s.sql)) return { results: query.all(...s.values), meta: { changes: 0 } };
     return { results: [], meta: { changes: Number(query.run(...s.values).changes) } };
    });
    sqlite.exec('COMMIT'); return rows;
   } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
  withSession() { return db; }, close() { sqlite.close(); }
 };
 return db;
}
function cookie() {
 const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from('ab'.repeat(32), 'hex'), iv);
 const payload = Buffer.concat([cipher.update(JSON.stringify({ type: 'session', userId: 123, exp: Date.now() + 3600000, accessToken: 'TEST_ONLY', nickname: 'EMPRESA FICTÍCIA' })), cipher.final()]);
 return '__Host-conduz_ml_session=' + Buffer.concat([iv, cipher.getAuthTag(), payload]).toString('base64url');
}

async function startLab({ ports = [0, 0], seed = fixture(), mlRequest = null } = {}) {
 const { createCatalogHandler } = await import('../../cloudflare/catalog.mjs');
 const db = database(), peers = [], requests = [];
 const env = { CATALOG_DB: db, CATALOG_SELLER_ID: '123', ML_CLIENT_ID: '1', ML_CLIENT_SECRET: 'TEST_ONLY', ML_SESSION_SECRET: 'ab'.repeat(32), ML_REDIRECT_URI: 'https://catalog-lab.example/api/ml/callback' };
 async function backend(url, options = {}) {
  const headers = { Cookie: cookie(), ...options.headers };
  if (options.method === 'PUT') Object.assign(headers, { Origin: 'https://catalog-lab.example', 'X-Conduz-Action': 'catalog', 'Content-Type': 'application/json' });
  return createCatalogHandler({ env })(new Request(url, { ...options, headers }));
 }
 const initial = await backend('http://127.0.0.1/api/catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schemaVersion: 2, revision: 0, mutationId: randomUUID(), data: seed }) });
 if (!initial.ok) throw Error('Fixture inválida: ' + await initial.text());
 for (const port of ports) {
  const peer = { offline: false, dropNextWrite: false, failNextWrite: false, hold: null };
  const server = http.createServer(async (req, res) => {
   try {
    const url = new URL(req.url, peer.origin);
    if (url.pathname === '/__lab') {
     res.setHeader('Content-Type', 'text/html; charset=utf-8');
     return res.end('<h1>Laboratório local · dados fictícios</h1><p>Cliente ' + peer.origin + ' · ' + (peer.offline ? 'SEM CONEXÃO' : 'ONLINE') + '</p><form method="post" action="/__lab/toggle"><button>Alternar conexão</button></form><a href="/">Abrir painel de teste</a>');
    }
    if (url.pathname === '/__lab/toggle' && req.method === 'POST') { peer.offline = !peer.offline; res.writeHead(303, { Location: '/__lab' }); return res.end(); }
    if (peer.offline && url.pathname.startsWith('/api/')) return req.socket.destroy();
    if (url.pathname.startsWith('/api/catalog')) {
     requests.push({ client: peer.origin, method: req.method, path: url.pathname, offline: peer.offline });
     if (peer.offline) return req.socket.destroy();
     if (peer.failNextWrite && req.method === 'PUT') { peer.failNextWrite = false; res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ message: 'Falha temporária simulada' })); }
     const bytes = []; for await (const part of req) bytes.push(part);
     const response = await backend(url.href, { method: req.method, headers: { ...(req.headers['if-none-match'] ? { 'If-None-Match': req.headers['if-none-match'] } : {}) }, ...(bytes.length ? { body: Buffer.concat(bytes) } : {}) });
     if (peer.dropNextWrite && req.method === 'PUT') { peer.dropNextWrite = false; return req.socket.destroy(); }
     if (peer.hold && req.method === 'PUT') { const held = peer.hold; peer.hold = null; await held; }
     res.writeHead(response.status, Object.fromEntries(response.headers)); return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if (url.pathname === '/api/ml/status') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ configured: true, connected: true, account: { id: 123, nickname: 'EMPRESA FICTÍCIA · TESTE LOCAL' } })); }
    if (mlRequest && url.pathname.startsWith('/api/ml/')) {
     const bytes = []; for await (const part of req) bytes.push(part);
     try {
      const data = await mlRequest(url.pathname.split('/').pop(), { method: req.method, query: Object.fromEntries(url.searchParams), ...(bytes.length ? { body: JSON.parse(Buffer.concat(bytes).toString()) } : {}) });
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(data));
     } catch (error) { res.writeHead(error.status ?? 503, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ message: error.message })); }
    }
    if (url.pathname.startsWith('/api/')) { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ message: 'Laboratório: nenhuma consulta externa é realizada; dados fictícios preservados.' })); }
    if (url.pathname !== '/') { res.writeHead(404); return res.end(); }
    let html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8')
     .replace('/* __PANEL_STYLES__ */', () => fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8'))
     .replace('/* __PANEL_SCRIPT__ */', () => fs.readFileSync(path.join(root, 'src/app.js'), 'utf8'))
     .replace('/* __ML_IMPORT_SCRIPT__ */', () => fs.readFileSync(path.join(root, 'src/ml-catalog-import.js'), 'utf8'))
     .replace('/* __CATALOG_SCRIPT__ */', () => fs.readFileSync(path.join(root, 'src/catalog-sync.js'), 'utf8'))
     .replace('<body>', '<body><aside style="padding:8px;background:#633;color:white;text-align:center">TESTE LOCAL · DADOS FICTÍCIOS · SEM ACESSO À PRODUÇÃO</aside>');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'", 'Cache-Control': 'no-store' });
    res.end(html);
   } catch (error) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end(error.message); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  peer.origin = 'http://127.0.0.1:' + server.address().port;
  peer.fetch = (url, options) => fetch(new URL(url, peer.origin), options);
  peer.server = server; peers.push(peer);
 }
 return { peers, requests, read: async () => (await backend(peers[0].origin + '/api/catalog')).json(), async close() { await Promise.all(peers.map(p => new Promise(resolve => p.server.close(resolve)))); db.close(); } };
}
module.exports = { startLab, fixture };
if (require.main === module) startLab({ ports: [43181, 43182] }).then(lab => {
 console.log('Laboratório fictício: ' + lab.peers.map(p => p.origin).join(' e '));
 process.on('SIGINT', async () => { await lab.close(); process.exit(); });
});
