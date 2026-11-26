import { createHandler } from '../netlify/functions/mercadolivre.mjs';
import { createCatalogHandler } from './catalog.mjs';
import { createAccountControls } from './ml-account-controls.mjs';

// O plano Free aceita 50 subrequisições por execução. Reserva margem para o runtime.
export const MAX_EXTERNAL_REQUESTS = 45;
export function budgetedFetch(fetchImpl, limit = MAX_EXTERNAL_REQUESTS) {
  let used = 0;
  return async (...args) => {
    if (used >= limit) {
      throw Object.assign(new Error('Esta cotação atingiu o limite de consultas por operação do plano gratuito. Os valores anteriores foram preservados; ajuste os dados ou tente uma cotação menor.'), { pricing: true });
    }
    used++;
    return fetchImpl(...args);
  };
}

export function createWorker({ fetchImpl = (...args) => globalThis.fetch(...args), now = Date.now } = {}) {
  return {
    async fetch(request, env) {
      const { pathname } = new URL(request.url);
      const controlsEnabled=env.ML_ACCOUNT_CONTROLS==='true'&&Boolean(env.CATALOG_DB);
      // Reserva espaço também para autenticação e contadores D1 na cota Free.
      const limitedFetch = budgetedFetch(fetchImpl,controlsEnabled?40:MAX_EXTERNAL_REQUESTS);
      const control = controlsEnabled ? createAccountControls({env,fetchImpl:limitedFetch,now}) : null;
      try {
      if (pathname === '/api/catalog' || pathname.startsWith('/api/catalog/')) {
        return await createCatalogHandler({ env, now, accountControl:control })(request);
      }
      const route = pathname.match(/^\/api\/ml\/([a-z-]+)$/);
      if (route) {
        const handler = createHandler({ env, fetchImpl: limitedFetch, now, accountControl:control });
        return await handler(request, { params: { action: route[1] } });
      }
      if (pathname.startsWith('/api/')) {
        return Response.json({ error: 'NOT_FOUND' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        return new Response('Método não permitido', { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      if (!env.ASSETS) return new Response('Painel ainda não publicado.', { status: 503 });
      return env.ASSETS.fetch(request);
      } catch (error) {
        if(error.accountControl)return Response.json({error:error.code,message:error.message,...(error.dataPolicy?{dataPolicy:error.dataPolicy}:{})},{status:error.status,headers:{'Cache-Control':'no-store',...(error.retryAfter?{'Retry-After':String(error.retryAfter)}:{})}});
        return Response.json({error:'SERVICE_UNAVAILABLE',message:'Não foi possível confirmar os controles da conta. Tente novamente; os cadastros foram preservados.'},{status:503,headers:{'Cache-Control':'no-store'}});
      } finally {
        // Uma falha na devolução da reserva mantém a contagem conservadora, sem liberar consultas extras.
        try { await control?.finish(); } catch {}
      }
    }
  };
}

