import { createHash } from 'node:crypto';
import { createHandler } from '../netlify/functions/mercadolivre.mjs';
import rules from '../shared/ml-data-rules.js';

export const MAX_CATALOG_BYTES = 8 * 1024 * 1024;
const CHUNK_CHARACTERS = 120000;
const HEAD = 'SELECT revision, updated_at, mutation_id, digest FROM catalog_heads WHERE seller_id = ?';
const headers = { 'Cache-Control': 'no-store', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff' };
const json = (data, status = 200, extra = {}) => Response.json(data, { status, headers: { ...headers, ...extra } });
const fail = message => { throw Object.assign(new Error(message), { catalogValidation: true }); };
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const number = (x, min = 0, max = 1e12) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const text = (x, max = 200) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
export function catalogAccounts(env) {
  const values = env.CATALOG_SELLER_IDS === undefined ? [env.CATALOG_SELLER_ID] : String(env.CATALOG_SELLER_IDS).split(',').map(x => x.trim());
  if (!values.length || values.some(id => !/^[1-9]\d{0,15}$/.test(id ?? ''))) return new Set();
  return new Set(values);
}
async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, raw = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_CATALOG_BYTES) { await reader.cancel(); throw Object.assign(new Error('O catálogo compartilhado aceita até 8 MB.'), { tooLarge: true }); }
      raw += decoder.decode(value, { stream: true });
    }
    return raw + decoder.decode();
  } finally { reader.releaseLock(); }
}

export function validateCatalog(data, sellerId) {
  if (!object(data) || Object.keys(data).some(k => !['products', 'kits', 'pendingProducts', 'fees', 'adsReports', 'adsAccounts', 'adsReconciliations'].includes(k))) fail('Formato do catálogo inválido.');
  if (!Array.isArray(data.products) || !Array.isArray(data.kits) || data.products.length > 5000 || data.kits.length > 5000) fail('O catálogo aceita até 5.000 produtos e 5.000 kits.');
  const checkFees = fees => {
    if (!object(fees) || !object(fees.ml) || !object(fees.shopee)) fail('Taxas inválidas.');
    for (const f of [fees.ml, fees.shopee]) {
      if (!number(f.commission, 0, 99.99) || !number(f.tax, 0, 99.99) || !number(f.fixed)) fail('Taxas inválidas.');
      for (const key of ['premiumCommission', 'officialEventRate']) if (f[key] !== undefined && !number(f[key], 0, 99.99)) fail('Percentual inválido.');
      if (f.easyReturnFee !== undefined && !number(f.easyReturnFee)) fail('Adicional inválido.');
      for (const key of ['easyReturnEnabled', 'officialEventEnabled']) if (f[key] !== undefined && typeof f[key] !== 'boolean') fail('Serviço inválido.');
    }
  };
  checkFees(data.fees);
  if (data.pendingProducts !== undefined) {
    if (!Array.isArray(data.pendingProducts) || data.pendingProducts.length > 5000) fail('O catálogo aceita até 5.000 anúncios pendentes.');
    const pendingIds = new Set(), pendingItems = new Set();
    for (const p of data.pendingProducts) {
      const item = p?.item, key = item?.sellerId + ':' + item?.itemId;
      if (!object(p) || !text(p.id) || pendingIds.has(p.id) || pendingItems.has(key) || !object(item) || String(item.sellerId) !== sellerId || !/^MLB\d{5,15}$/.test(item.itemId ?? '') || !text(item.title, 256) || !number(p.margin, 0, 99.99) || typeof p.importedAt !== 'string' || !Number.isFinite(Date.parse(p.importedAt)) || 'cost' in p) fail('Anúncio pendente inválido, repetido ou de outra conta.');
      checkFees(p.feeSnapshot); pendingIds.add(p.id); pendingItems.add(key);
    }
  }
  const ids = new Set();
  const common = row => {
    if (!object(row) || !text(row.id) || !text(row.name, 120) || !number(row.margin, 0, 99.99) || !number(row.extra)) fail('Cadastro inválido.');
    for (const key of ['ads', 'adsMl', 'adsShopee']) if (row[key] !== undefined && !number(row[key], 0, 99.99)) fail('Ads inválido.');
    if (row.mlShipping !== undefined && !number(row.mlShipping)) fail('Frete inválido.');
    if (row.feeSnapshot !== undefined) checkFees(row.feeSnapshot);
    if (row.mercadoLivre !== undefined && (!object(row.mercadoLivre) || String(row.mercadoLivre.sellerId) !== sellerId)) fail('O anúncio pertence a outra conta do Mercado Livre.');
    if (row.mlAds !== undefined && (!object(row.mlAds) || String(row.mlAds.sellerId) !== sellerId)) fail('A publicidade pertence a outra conta.');
  };
  for (const p of data.products) {
    common(p);
    if (ids.has(p.id) || !text(p.category, 80) || !number(p.cost, .01, 1e9) || !number(p.weight, 0, 1e6)) fail('Produto inválido ou repetido.');
    ids.add(p.id);
  }
  const kitIds = new Set();
  for (const kit of data.kits) {
    common(kit);
    if (kitIds.has(kit.id) || !Array.isArray(kit.items) || !kit.items.length) fail('Kit inválido ou repetido.');
    kitIds.add(kit.id);
    const components = new Set();
    for (const i of kit.items) {
      if (!object(i) || !ids.has(i.productId) || components.has(i.productId) || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 9999) fail('Confira os componentes e as quantidades do kit.');
      components.add(i.productId);
    }
  }
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const period = r => date(r.dateFrom) && date(r.dateTo) && r.dateFrom <= r.dateTo && (Date.parse(r.dateTo) - Date.parse(r.dateFrom)) / 86400000 < 90;
  const owned = r => object(r) && String(r.sellerId) === sellerId;
  const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const snapshot = (r, itemId) => {
    if (!owned(r) || r.itemId !== itemId || !period(r) || r.currency !== 'BRL' || !timestamp(r.fetchedAt) || !['cost', 'revenue', 'clicks'].every(k => number(r[k]))) fail('Métricas de Ads inválidas ou de outra conta.');
    if (r.sales !== undefined && (!owned(r.sales) || r.sales.itemId !== itemId || r.sales.dateFrom !== r.dateFrom || r.sales.dateTo !== r.dateTo)) fail('A base de vendas de Ads não corresponde à consulta.');
  };
  for (const [field, limit, key] of [
    ['adsReports', null, r => [r.sellerId, r.baseDate, r.bucketDays].join(':')],
    ['adsAccounts', null, r => [r.sellerId, r.advertiserId, r.dateFrom, r.dateTo].join(':')],
    ['adsReconciliations', 5000, r => [r.sellerId, r.itemId, r.dateFrom, r.dateTo].join(':')]
  ]) {
    if (data[field] === undefined) continue;
    if (!Array.isArray(data[field]) || (limit !== null && data[field].length > limit)) fail('Quantidade de registros de Ads inválida.');
    const seen = new Set();
    for (const r of data[field]) {
      if (!owned(r) || !period(r) || seen.has(key(r))) fail('Registro de Ads repetido, inválido ou de outra conta.');
      seen.add(key(r));
      if (field === 'adsReconciliations') {
        if (r.source !== 'manual-reconciliation' || !/^MLB\d{5,15}$/.test(r.itemId ?? '') || !['direct', 'attributed'].includes(r.scope) || typeof r.basis !== 'string' || r.basis.length > 2000 || !text(r.notes, 600) || r.notes.trim().length < 3 || !timestamp(r.savedAt) || !['revenue', 'goods', 'fees', 'tax', 'shipping', 'other'].every(k => number(r[k]) && Math.abs(r[k] * 100 - Math.round(r[k] * 100)) < .001)) fail('Conciliação de Ads inválida.');
      } else if (field === 'adsAccounts') {
        if (r.source !== 'mercado-livre-product-ads-account-v2' || r.currency !== 'BRL' || !Number.isSafeInteger(r.advertiserId) || r.advertiserId <= 0 || !timestamp(r.fetchedAt) || !['cost', 'revenue', 'clicks'].every(k => number(r[k]))) fail('Resumo do anunciante inválido.');
      } else {
        if (r.source !== 'mercado-livre-product-ads-history-v2' || r.currency !== 'BRL' || !date(r.baseDate) || ![7, 14, 30].includes(r.bucketDays) || !timestamp(r.fetchedAt) || !Array.isArray(r.items) || r.items.length > 10000 || !Array.isArray(r.ranges) || r.ranges.length !== (r.bucketDays === 30 ? 3 : 4)) fail('Relatório de Ads inválido.');
        const items = new Set();
        for (const row of r.items) {
          if (!object(row) || !/^MLB\d{5,15}$/.test(row.itemId ?? '') || items.has(row.itemId) || !Array.isArray(row.periods) || row.periods.length !== r.ranges.length) fail('Anúncio repetido ou inválido no relatório.');
          items.add(row.itemId); snapshot(row.total, row.itemId);
          if (row.total.dateFrom !== r.dateFrom || row.total.dateTo !== r.dateTo) fail('Total incompatível com o período.');
          row.periods.forEach((p, i) => { snapshot(p, row.itemId); if (p.dateFrom !== r.ranges[i]?.dateFrom || p.dateTo !== r.ranges[i]?.dateTo) fail('Período do relatório incompatível.'); });
        }
      }
    }
  }
  return data;
}

async function loadCatalog(db,sellerId) {
 const [heads,chunks]=await db.batch([db.prepare(HEAD).bind(sellerId),db.prepare('SELECT content FROM catalog_chunks WHERE seller_id = ? AND revision = (SELECT revision FROM catalog_heads WHERE seller_id = ?) ORDER BY position').bind(sellerId,sellerId)]);
 const head=heads.results[0];if(!head?.revision)return null;
 const raw=chunks.results.map(x=>x.content).join('');if(createHash('sha256').update(raw).digest('hex')!==head.digest)throw Error('INCOMPLETE_CATALOG');
 return {head,data:JSON.parse(raw)};
}
async function saveCatalog(db,{data,sellerId,revision:previousRevision,mutationId,now,extra=[]}) {
 const content=JSON.stringify(data),digest=createHash('sha256').update(content).digest('hex'),updatedAt=new Date(now()).toISOString(),revision=previousRevision+1;
 const statements=[db.prepare('INSERT OR IGNORE INTO catalog_heads (seller_id, revision, updated_at) VALUES (?, 0, ?)').bind(sellerId,updatedAt),db.prepare('UPDATE catalog_heads SET revision = ?, updated_at = ?, mutation_id = ?, digest = ? WHERE seller_id = ? AND revision = ?').bind(revision,updatedAt,mutationId,digest,sellerId,previousRevision)];
 for(let position=0,offset=0;offset<content.length;position++){
  let end=Math.min(content.length,offset+CHUNK_CHARACTERS);if(end<content.length&&/[\uD800-\uDBFF]/.test(content[end-1]))end--;
  statements.push(db.prepare('INSERT INTO catalog_chunks (seller_id, revision, position, content) SELECT seller_id, revision, ?, ? FROM catalog_heads WHERE seller_id = ? AND revision = ? AND mutation_id = ?').bind(position,content.slice(offset,end),sellerId,revision,mutationId));offset=end;
 }
 statements.push(db.prepare('DELETE FROM catalog_chunks WHERE seller_id = ? AND revision < ? AND EXISTS (SELECT 1 FROM catalog_heads WHERE seller_id = ? AND revision = ? AND mutation_id = ?)').bind(sellerId,revision-1,sellerId,revision,mutationId),...extra);
 const results=await db.batch(statements);return results[1].meta.changes===1?{revision,updatedAt}:null;
}
export function createCatalogHandler({ env, now = Date.now, accountControl = null }) {
  return async request => {
    const path = new URL(request.url).pathname;
    const accounts = catalogAccounts(env), multipleAccounts = env.CATALOG_SELLER_IDS !== undefined;
    const configured = Boolean(env.CATALOG_DB && accounts.size);
    if (path === '/api/catalog/status' && request.method === 'GET') return json({ configured, schemaVersion: 4, legacySellerId: accounts.has(env.CATALOG_SELLER_ID) ? env.CATALOG_SELLER_ID : null });
    const lifecycle=path==='/api/catalog/lifecycle';
    if (path !== '/api/catalog' && !lifecycle) return json({ error: 'NOT_FOUND' }, 404);
    if (!(lifecycle?['GET','POST']:['GET','PUT']).includes(request.method)) return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: lifecycle?'GET, POST':'GET, PUT' });
    if (!configured) return json({ error: 'NOT_CONFIGURED', message: 'O catálogo compartilhado ainda precisa ser configurado.' }, 503);
    let origin;
    try { origin = new URL(env.ML_REDIRECT_URI).origin; } catch { return json({ error: 'NOT_CONFIGURED' }, 503); }
    if ((request.headers.get('origin') && request.headers.get('origin') !== origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'INVALID_ORIGIN' }, 403);
    if (['PUT','POST'].includes(request.method) && (request.headers.get('origin') !== origin || request.headers.get('x-conduz-action') !== 'catalog')) return json({ error: 'INVALID_ORIGIN' }, 403);

    // Reutiliza a validação criptográfica e a expiração do OAuth já existente.
    // O token do ML nunca é retornado nem armazenado no D1.
    const sessionRequest = new Request(new URL('/api/ml/status', request.url), { headers: { Cookie: request.headers.get('cookie') ?? '' } });
    const status = await createHandler({ env, now, accountControl })(sessionRequest, { params: { action: 'status' } });
    const identity = await status.json();
    if (!identity.connected) return json({ error: 'CONNECT_REQUIRED', message: 'Conecte a conta da empresa no Mercado Livre para acessar o catálogo.' }, 401);
    if (identity.accessRequired && !identity.accessGranted) return json({ error: 'PANEL_ACCESS_REQUIRED', message: 'Conclua a identificação e o aceite na tela de entrada para acessar o catálogo.' }, 403);
    const sellerId = String(identity.account.id);
    if (!accounts.has(sellerId)) return json({ error: 'ACCOUNT_FORBIDDEN', message: 'Esta conta do Mercado Livre ainda não foi liberada para o catálogo compartilhado.' }, 403);
    const expectedAccount = request.headers.get('x-conduz-catalog-account');
    if (multipleAccounts && !expectedAccount) return json({ error: 'CLIENT_UPDATE_REQUIRED', message: 'Atualize a página para usar o catálogo separado de cada empresa. Os dados foram preservados.' }, 426);
    if (expectedAccount && expectedAccount !== sellerId) return json({ error: 'ACCOUNT_CHANGED', message: 'A conta do Mercado Livre mudou em outra aba. Recarregue a página para abrir o catálogo correto; sua cópia local foi preservada.' }, 409);
    const db = env.CATALOG_DB.withSession ? env.CATALOG_DB.withSession('first-primary') : env.CATALOG_DB;
    const policy=identity.dataPolicy;
    if(policy && request.method!=='GET' && (policy.epoch>0||request.headers.has('x-conduz-data-epoch')) && request.headers.get('x-conduz-data-epoch')!==String(policy.epoch))return json({error:'DATA_POLICY_CHANGED',message:'A retenção dos dados mudou. Recarregue o painel antes de salvar.',dataPolicy:policy},409);
    try {
      if(lifecycle){
       if(!accountControl)return json({message:'O controle de retenção ainda não foi ativado.'},503);
       const loaded=await loadCatalog(db,sellerId);
       if(request.method==='GET')return json({revision:loaded?.head.revision??0,dataPolicy:policy,counts:{products:loaded?.data.products.length??0,kits:loaded?.data.kits.length??0,pending:loaded?.data.pendingProducts?.length??0,reports:loaded?.data.adsReports?.length??0,manualReconciliations:loaded?.data.adsReconciliations?.length??0}});
       if(!request.headers.get('content-type')?.startsWith('application/json'))return json({message:'Envie dados JSON.'},415);
       const raw=await readBody(request);if(raw.length>2048)return json({message:'Confirmação inválida.'},400);const input=JSON.parse(raw);
       if(input.action!=='purge-imported'||input.confirmation!=='REMOVER IMPORTADOS')return json({message:'Revise os efeitos e digite REMOVER IMPORTADOS para confirmar.'},400);
       if(!loaded)return json({message:'Não há catálogo compartilhado para limpar. Use Sair para desconectar.'},400);
       if(input.revision!==loaded.head.revision)return json({error:'VERSION_CONFLICT',message:'O catálogo mudou. Abra a revisão novamente antes de encerrar a integração.'},409);
       const data=rules.purge(loaded.data),stamp=new Date(now()).toISOString(),nextRevision=loaded.head.revision+1,mutationId=crypto.randomUUID();validateCatalog(data,sellerId);
       const guard='EXISTS (SELECT 1 FROM catalog_heads WHERE seller_id=? AND revision=? AND mutation_id=?)';
       const extra=[db.prepare(`INSERT INTO ml_account_controls (seller_id,data_epoch,enabled,purged_at) SELECT ?,?,0,? WHERE ${guard} ON CONFLICT(seller_id) DO UPDATE SET data_epoch=excluded.data_epoch,enabled=0,purged_at=excluded.purged_at,refresh_owner=NULL,refresh_until=0,refreshed_at=0`).bind(sellerId,policy.epoch+1,stamp,sellerId,nextRevision,mutationId),db.prepare(`DELETE FROM catalog_chunks WHERE seller_id=? AND revision<? AND ${guard}`).bind(sellerId,nextRevision,sellerId,nextRevision,mutationId),db.prepare(`DELETE FROM ml_session_checks WHERE seller_id=? AND ${guard}`).bind(sellerId,sellerId,nextRevision,mutationId)];
       const saved=await saveCatalog(db,{data,sellerId,revision:loaded.head.revision,mutationId,now,extra});
       if(!saved)return json({error:'VERSION_CONFLICT',message:'Outro funcionário salvou uma alteração. Revise novamente; nada foi removido.'},409);
       return json({...saved,data,dataPolicy:{sellerId,epoch:policy.epoch+1,enabled:false,purgedAt:stamp}});
      }
      if (request.method === 'GET') {
        const head = await db.prepare(HEAD).bind(sellerId).first();
        if (!head || head.revision === 0) return json({ revision: 0, data: null, updatedAt: null,...(policy?{dataPolicy:policy}:{}) });
        if (request.headers.get('if-none-match') === '"' + head.revision + '"') return new Response(null, { status: 304, headers });
        const [heads, chunks] = await db.batch([
          db.prepare(HEAD).bind(sellerId),
          db.prepare('SELECT content FROM catalog_chunks WHERE seller_id = ? AND revision = (SELECT revision FROM catalog_heads WHERE seller_id = ?) ORDER BY position').bind(sellerId, sellerId)
        ]);
        const current = heads.results[0];
        const raw = chunks.results.map(x => x.content).join('');
        if (!raw || createHash('sha256').update(raw).digest('hex') !== current.digest) throw Error('INCOMPLETE_CATALOG');
        return json({ revision: current.revision, updatedAt: current.updated_at, data: JSON.parse(raw),...(policy?{dataPolicy:policy}:{}) }, 200, { ETag: '"' + current.revision + '"' });
      }
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ message: 'Envie dados JSON.' }, 415);
      if (Number(request.headers.get('content-length')) > MAX_CATALOG_BYTES) return json({ message: 'O catálogo compartilhado aceita até 8 MB.' }, 413);
      const raw = await readBody(request);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ message: 'Conteúdo inválido.' }, 400); }
      if (body?.schemaVersion !== 4 && body?.schemaVersion !== 3 && (multipleAccounts || body?.schemaVersion !== 2)) return json({ error: 'CLIENT_UPDATE_REQUIRED', message: 'Atualize a página para sincronizar o catálogo e os dados de Ads da conta correta. A cópia local foi mantida.' }, 426);
      if (body.schemaVersion === 4 && !Array.isArray(body.data?.pendingProducts)) fail('Envie também os anúncios pendentes para preservar o catálogo completo.');
      if (!Number.isSafeInteger(body?.revision) || body.revision < 0 || !/^[a-f0-9-]{36}$/.test(body.mutationId ?? '')) fail('Versão de gravação inválida.');
      validateCatalog(body.data, sellerId);
      if(policy?.purgedAt)body.data=rules.sanitize(body.data,policy.purgedAt);
      const content = JSON.stringify(body.data), digest = createHash('sha256').update(content).digest('hex');
      const previous = await db.prepare(HEAD).bind(sellerId).first();
      if (previous?.revision && body.schemaVersion !== 4) {
        const [chunks] = await db.batch([db.prepare('SELECT content FROM catalog_chunks WHERE seller_id = ? AND revision = ? ORDER BY position').bind(sellerId, previous.revision)]);
        const stored = chunks.results.map(x => x.content).join('');
        if (createHash('sha256').update(stored).digest('hex') !== previous.digest) throw Error('INCOMPLETE_CATALOG');
        if (JSON.parse(stored).pendingProducts?.length) return json({ error: 'CLIENT_UPDATE_REQUIRED', message: 'Recarregue a página para preservar os anúncios pendentes de custo. A cópia local foi mantida.' }, 426);
      }
      if (previous?.mutation_id === body.mutationId && previous.digest === digest) return json({ revision: previous.revision, updatedAt: previous.updated_at });
      const saved=await saveCatalog(db,{data:body.data,sellerId,revision:body.revision,mutationId:body.mutationId,now});
      if(!saved)return json({error:'VERSION_CONFLICT',message:'Outro funcionário atualizou o catálogo. Confira a versão mais recente.'},409);
      return json(saved);
    } catch (error) {
      if (error.tooLarge) return json({ message: error.message }, 413);
      if (error.catalogValidation) return json({ message: error.message }, 400);
      return json({ error: 'CATALOG_UNAVAILABLE', message: 'Não foi possível acessar o catálogo compartilhado. A cópia local foi preservada.' }, 503);
    }
  };
}
