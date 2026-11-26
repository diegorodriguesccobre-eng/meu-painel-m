import { createHash, randomUUID } from 'node:crypto';

// Cotas internas conservadoras, não representam os limites oficiais de cada recurso.
export const ACCOUNT_MINUTE_LIMIT = 300, ACCOUNT_DAY_LIMIT = 8000, RESERVATION = 40;
const VERIFY_INTERVAL = 5 * 60000, LEASE_TIME = 20 * 60000, REFRESH_INTERVAL = 5 * 3600000;
const failure = (code, message, status = 403, retryAfter = 0) => Object.assign(new Error(message), { accountControl:true, code, status, retryAfter });
export function createAccountControls({ env, fetchImpl, now = Date.now }) {
 const db = env.CATALOG_DB.withSession?.('first-primary') ?? env.CATALOG_DB;
 const allowed = new Set(String(env.CATALOG_SELLER_IDS ?? env.CATALOG_SELLER_ID ?? '').split(',').map(s => s.trim()));
 let reservation = null, used = 0;
 const read = id => db.prepare('SELECT * FROM ml_account_controls WHERE seller_id = ?').bind(String(id)).first();
 async function policy(id) {
  if (!allowed.has(String(id))) throw failure('ACCOUNT_FORBIDDEN','Esta empresa não está liberada para o painel.');
  const row = await read(id);
  return { sellerId:String(id), epoch:row?.data_epoch ?? 0, enabled:row?.enabled !== 0, purgedAt:row?.purged_at ?? null };
 }
 async function beforeCall(id) {
  if (!id) return; // Troca inicial do código OAuth ainda não identifica o vendedor.
  if (!reservation) {
   const time = now(), minute = Math.floor(time / 60000), day = Math.floor(time / 86400000);
   const row = await db.prepare(`INSERT INTO ml_query_usage (seller_id,minute,minute_calls,day,day_calls) VALUES (?,?,?,?,?)
    ON CONFLICT(seller_id) DO UPDATE SET minute=excluded.minute,day=excluded.day,
    minute_calls=(CASE WHEN minute=excluded.minute THEN minute_calls ELSE 0 END)+excluded.minute_calls,
    day_calls=(CASE WHEN day=excluded.day THEN day_calls ELSE 0 END)+excluded.day_calls
    WHERE blocked_until<=? AND (CASE WHEN minute=excluded.minute THEN minute_calls ELSE 0 END)+excluded.minute_calls<=?
    AND (CASE WHEN day=excluded.day THEN day_calls ELSE 0 END)+excluded.day_calls<=? RETURNING seller_id`)
    .bind(String(id),minute,RESERVATION,day,RESERVATION,time,ACCOUNT_MINUTE_LIMIT,ACCOUNT_DAY_LIMIT).first();
   if (!row) {
    const current = await db.prepare('SELECT * FROM ml_query_usage WHERE seller_id = ?').bind(String(id)).first();
    const until = Math.max(current?.blocked_until ?? 0, current?.day === day && current.day_calls + RESERVATION > ACCOUNT_DAY_LIMIT ? (day+1)*86400000 : (minute+1)*60000);
    throw failure('ACCOUNT_QUERY_LIMIT','Limite compartilhado de consultas da empresa. Aguarde antes de tentar novamente; os dados anteriores foram preservados.',429,Math.max(1,Math.ceil((until-time)/1000)));
   }
   reservation = { id:String(id), minute, day };
  }
  if (used >= RESERVATION) throw failure('ACCOUNT_QUERY_LIMIT','Esta operação atingiu o limite de consultas. Os cadastros anteriores foram preservados.',429,60);
  used++;
 }
 async function finish() {
  if (!reservation) return;
  const unused = RESERVATION-used, r = reservation; reservation = null;
  if (unused) await db.prepare(`UPDATE ml_query_usage SET minute_calls=MAX(0,minute_calls-CASE WHEN minute=? THEN ? ELSE 0 END),day_calls=MAX(0,day_calls-CASE WHEN day=? THEN ? ELSE 0 END) WHERE seller_id=? RETURNING seller_id`).bind(r.minute,unused,r.day,unused,r.id).first();
 }
 async function blocked(id, response) {
  if (response.status !== 429 || !id) return;
  const raw=response.headers.get('Retry-After'), seconds=/^\d+$/.test(raw??'')?Number(raw):Math.ceil((Date.parse(raw)-now())/1000);
  const until=now()+Math.min(3600,Math.max(60,Number.isFinite(seconds)?seconds:60))*1000;
  await db.prepare('UPDATE ml_query_usage SET blocked_until=MAX(blocked_until,?) WHERE seller_id=? RETURNING seller_id').bind(until,String(id)).first();
 }
 async function connected(id) {
  if (!allowed.has(String(id))) throw failure('ACCOUNT_FORBIDDEN','Esta empresa não está liberada para o painel.');
  const row = await db.prepare('INSERT INTO ml_account_controls (seller_id) VALUES (?) ON CONFLICT(seller_id) DO UPDATE SET enabled=1 RETURNING data_epoch').bind(String(id)).first();
  await db.prepare('DELETE FROM ml_session_checks WHERE expires_at<=? RETURNING token_digest').bind(now()).first();
  return row.data_epoch;
 }
 async function authorize(s) {
  const p = await policy(s.userId);
  if (!p.enabled || (s.dataEpoch ?? 0) !== p.epoch) throw Object.assign(failure('INTEGRATION_ENDED','A integração foi encerrada em outro acesso. Entre novamente para conectar a empresa.',401),{dataPolicy:p});
  const digest = createHash('sha256').update(s.accessToken).digest('hex');
  const last = await db.prepare('SELECT * FROM ml_session_checks WHERE token_digest = ?').bind(digest).first();
  if(last&&last.seller_id!==String(s.userId))throw failure('ACCOUNT_CHANGED','A autorização não corresponde à conta conectada.',409);
  if (last?.denied) throw failure('AUTHORIZATION_REVOKED','A autorização do Mercado Livre deixou de ser válida. Conecte a conta novamente.',401);
  if (!last || now()-last.verified_at>=VERIFY_INTERVAL) {
   await beforeCall(s.userId);
   const response = await fetchImpl('https://api.mercadolibre.com/users/me',{headers:{Authorization:'Bearer '+s.accessToken,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(12000)});
   await blocked(s.userId,response);
   if (response.status===429) throw failure('ACCOUNT_QUERY_LIMIT','O Mercado Livre limitou as consultas desta empresa. Aguarde para tentar novamente.',429,60);
   if (response.status===401) {
    await db.prepare('INSERT INTO ml_session_checks (token_digest,seller_id,verified_at,expires_at,denied) VALUES (?,?,?,?,1) ON CONFLICT(token_digest) DO UPDATE SET denied=1 RETURNING token_digest').bind(digest,String(s.userId),now(),s.exp).first();
    throw failure('AUTHORIZATION_REVOKED','O Mercado Livre não reconhece mais esta autorização. Conecte a conta novamente.',401);
   }
   if (!response.ok) throw failure('AUTHORIZATION_CHECK_UNAVAILABLE','Não foi possível confirmar a autorização da conta. Tente novamente; os dados foram preservados.',503);
   const user=await response.json();if(user.id!==s.userId)throw failure('ACCOUNT_CHANGED','A autorização retornou outra empresa.',409);
   await db.prepare('INSERT INTO ml_session_checks (token_digest,seller_id,verified_at,expires_at) VALUES (?,?,?,?) ON CONFLICT(token_digest) DO UPDATE SET verified_at=excluded.verified_at,expires_at=excluded.expires_at,denied=0 RETURNING token_digest').bind(digest,String(s.userId),now(),s.exp).first();
  }
  return p;
 }
 async function lease(id, owner, complete = false, release = false) {
  if (complete || release) {
   if (!/^[a-f0-9-]{36}$/.test(owner??'')) throw failure('INVALID_LEASE','Identificação de atualização inválida.',400);
   const row=await db.prepare('UPDATE ml_account_controls SET refresh_until=0,refreshed_at=CASE WHEN ? THEN ? ELSE refreshed_at END WHERE seller_id=? AND refresh_owner=? AND refresh_until>? RETURNING refreshed_at').bind(complete?1:0,now(),String(id),owner,now()).first();
   if(!row)throw failure('REFRESH_LEASE_EXPIRED','A atualização perdeu sua reserva. Os dados já salvos foram preservados.',409);
   return {completed:true};
  }
  const token=randomUUID(),time=now();
  const row=await db.prepare(`INSERT INTO ml_account_controls (seller_id,refresh_owner,refresh_until) VALUES (?,?,?) ON CONFLICT(seller_id) DO UPDATE SET refresh_owner=excluded.refresh_owner,refresh_until=excluded.refresh_until WHERE enabled=1 AND refresh_until<=? AND (refreshed_at=0 OR refreshed_at<=?) RETURNING refresh_until`).bind(String(id),token,time+LEASE_TIME,time,time-REFRESH_INTERVAL).first();
  if(row)return {acquired:true,owner:token,expiresAt:row.refresh_until};
  const current=await read(id);return {acquired:false,retryAt:Math.max(current?.refresh_until??time,current?.refreshed_at?current.refreshed_at+REFRESH_INTERVAL:time)};
 }
 return {policy,authorize,beforeCall,finish,blocked,connected,lease};
}
