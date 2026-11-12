import { createHandler } from '../netlify/functions/mercadolivre.mjs';

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
      const route = pathname.match(/^\/api\/ml\/([a-z-]+)$/);
      if (route) {
        const handler = createHandler({ env, fetchImpl: budgetedFetch(fetchImpl), now });
        return handler(request, { params: { action: route[1] } });
      }
      if (pathname.startsWith('/api/')) {
        return Response.json({ error: 'NOT_FOUND' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        return new Response('Método não permitido', { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      if (!env.ASSETS) return new Response('Painel ainda não publicado.', { status: 503 });
      return env.ASSETS.fetch(request);
    }
  };
}

