const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = import('../cloudflare/app.mjs');

test('Cloudflare serve o painel sem chamar APIs e recusa caminhos indevidos', async () => {
  const { createWorker } = await load;
  let assets = 0, network = 0;
  const worker = createWorker({ fetchImpl: async () => { network++; throw Error('Rede inesperada'); } });
  const env = { ASSETS: { fetch: async () => { assets++; return new Response('Painel'); } } };
  assert.equal(await (await worker.fetch(new Request('https://painel.example/'), env)).text(), 'Painel');
  assert.equal((await worker.fetch(new Request('https://painel.example/api/outro'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://painel.example/', { method: 'POST' }), env)).status, 405);
  assert.equal(assets, 1); assert.equal(network, 0);
});

test('Cloudflare mantém diagnóstico e bloqueia integração sem sessão/configuração', async () => {
  const { createWorker } = await load;
  const worker = createWorker({ fetchImpl: async () => { throw Error('Rede inesperada'); } });
  const status = await worker.fetch(new Request('https://painel.example/api/ml/status'), {});
  assert.deepEqual(await status.json(), { configured: false, connected: false, account: null, expiresAt: null });
  assert.equal(status.headers.get('Cache-Control'), 'no-store');
  assert.equal((await worker.fetch(new Request('https://painel.example/api/ml/items'), {})).status, 503);
  const env = { ML_CLIENT_ID: '123456', ML_CLIENT_SECRET: 'TEST_ONLY', ML_SESSION_SECRET: 'ab'.repeat(32), ML_REDIRECT_URI: 'https://painel.example/api/ml/callback' };
  assert.equal((await worker.fetch(new Request('https://painel.example/api/ml/items'), env)).status, 401);
  assert.equal((await worker.fetch(new Request('https://painel.example/api/ml/connect', { method: 'POST', headers: { Origin: 'https://outra.example', 'X-Conduz-Action': 'mercadolivre' } }), env)).status, 403);
});

test('orçamento de chamadas encerra a operação antes da cota Free e reinicia a cada execução', async () => {
  const { budgetedFetch, MAX_EXTERNAL_REQUESTS } = await load;
  let calls = 0;
  const mock = async () => { calls++; return new Response('ok'); };
  const limited = budgetedFetch(mock);
  for (let i = 0; i < MAX_EXTERNAL_REQUESTS; i++) await limited('https://api.example');
  await assert.rejects(() => limited('https://api.example'), error => error.pricing === true && error.message.includes('plano gratuito'));
  assert.equal(calls, 45);
  await budgetedFetch(mock)('https://api.example'); assert.equal(calls, 46);
});

test('Worker completa OAuth e calcula os dois anúncios com frete dentro do orçamento Free', async () => {
  const { createWorker } = await load;
  const origin = 'https://painel.example', calls = [];
  const env = { ML_CLIENT_ID: '123456', ML_CLIENT_SECRET: 'TEST_ONLY', ML_SESSION_SECRET: 'ab'.repeat(32), ML_REDIRECT_URI: origin + '/api/ml/callback' };
  const worker = createWorker({ fetchImpl: async (url, init) => {
    assert.equal(init.redirect, 'manual'); const u = new URL(url); calls.push({ path: u.pathname, method: init.method ?? 'GET' });
    if (u.pathname === '/oauth/token') return Response.json({ access_token: 'TEST_ONLY', expires_in: 21600 });
    if (u.pathname === '/users/me') return Response.json({ id: 123, nickname: 'TESTE' });
    if (u.pathname === '/items/MLB1234567890') return Response.json({ id: 'MLB1234567890', seller_id: 123, category_id: 'MLB1234', listing_type_id: 'gold_special', condition: 'new', shipping: { mode: 'me2', logistic_type: 'cross_docking' } });
    if (u.pathname === '/users/123/shipping_options/free') return Response.json({ coverage: { all_country: { list_cost: 12.95, currency_id: 'BRL', billable_weight: 350 } } });
    if (u.pathname === '/sites/MLB/listing_prices') {
      const price = Number(u.searchParams.get('price'));
      return Response.json(['gold_special', 'gold_pro'].map((listing_type_id, i) => ({ listing_type_id, currency_id: 'BRL', listing_fee_amount: 0, sale_fee_amount: Math.round(price * (14 + i * 5)) / 100 + 6, sale_fee_details: { percentage_fee: 14 + i * 5, fixed_fee: 6 } })));
    }
    throw Error('Endpoint de teste inesperado');
  } });
  const headers = { Origin: origin, 'X-Conduz-Action': 'mercadolivre' };
  const start = await worker.fetch(new Request(origin + '/api/ml/connect', { method: 'POST', headers }), env);
  const auth = new URL((await start.json()).authorizationUrl), flow = start.headers.get('set-cookie').split(';')[0];
  const callback = await worker.fetch(new Request(origin + '/api/ml/callback?' + new URLSearchParams({ state: auth.searchParams.get('state'), code: 'TEST_ONLY' }), { headers: { Cookie: flow } }), env);
  assert.equal(callback.status, 303);
  const session = callback.headers.getSetCookie().find(c => c.startsWith('__Host-conduz_ml_session=')).split(';')[0];
  const before = calls.length;
  const response = await worker.fetch(new Request(origin + '/api/ml/pricing', { method: 'POST', headers: { ...headers, Cookie: session, 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: 'MLB1234567890', cost: 30, extra: 0, weight: .35, margin: 20, tax: 6, mlShipping: 0, autoShipping: true }) }), env);
  assert.equal(response.status, 200);
  const { pricing } = await response.json();
  for (const scenario of Object.values(pricing.quotes)) {
    assert.ok(scenario.desired.margin >= 20 - 1e-8); assert.equal(scenario.desired.shippingApplied, 12.95);
    assert.ok(scenario.minimum.margin >= 10 - 1e-8);
  }
  assert.ok(calls.length - before <= 45);
  assert.ok(calls.filter(c => c.path !== '/oauth/token').every(c => c.method === 'GET'));
});

test('fetch padrão preserva o contexto global exigido pelo runtime',async()=>{
 const {createWorker}=await load,original=globalThis.fetch,origin='https://painel.example';
 const env={ML_CLIENT_ID:'123456',ML_CLIENT_SECRET:'TEST_ONLY',ML_SESSION_SECRET:'ab'.repeat(32),ML_REDIRECT_URI:origin+'/api/ml/callback'};
 let calls=0;globalThis.fetch=function(url,init){assert.equal(this,globalThis);assert.equal(init.redirect,'manual');calls++;return Promise.resolve(Response.json(String(url).endsWith('/oauth/token')?{access_token:'TEST_ONLY',expires_in:21600}:{id:123,nickname:'TESTE'}));};
 try{const worker=createWorker(),start=await worker.fetch(new Request(origin+'/api/ml/connect',{method:'POST',headers:{Origin:origin,'X-Conduz-Action':'mercadolivre'}}),env),auth=new URL((await start.json()).authorizationUrl),cookie=start.headers.get('set-cookie').split(';')[0];
 const response=await worker.fetch(new Request(origin+'/api/ml/callback?'+new URLSearchParams({state:auth.searchParams.get('state'),code:'TEST_ONLY'}),{headers:{Cookie:cookie}}),env);
 assert.equal(new URL(response.headers.get('location')).searchParams.get('ml'),'connected');assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});
