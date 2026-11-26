/* Regras puras compartilhadas pelo navegador e Worker. Não contêm credenciais. */
'use strict';
(function () {
 'use strict';
 const TTL = 6 * 60 * 60 * 1000;
 const copy = x => JSON.parse(JSON.stringify(x));
 const fresh = (item, now = Date.now()) => Boolean(item && item.availability !== 'unavailable' && !['closed','inactive'].includes(item.status) && Number.isFinite(Date.parse(item.fetchedAt)) && now - Date.parse(item.fetchedAt) < TTL && Date.parse(item.fetchedAt) <= now + 60000);
 function unavailable(item, now = Date.now()) {
  return { ...(['closed','inactive'].includes(item.status)?{status:item.status}:{}),itemId:item.itemId, sellerId:item.sellerId, title:item.status==='closed'?'Anúncio encerrado':'Anúncio indisponível no Mercado Livre', categoryId:null, categoryName:null, catalogProductId:null, listingType:item.listingType, permalink:'https://produto.mercadolivre.com.br/MLB-'+item.itemId.slice(3)+'-_JM', price:null, weight:null, thumbnail:null, variationCount:0, fetchedAt:new Date(now).toISOString(), availability:'unavailable' };
 }
 function sanitize(data, purgedAt, all = false) {
  const result = copy(data), cutoff = Date.parse(purgedAt);
  const old = row => all || row && (!Number.isFinite(Date.parse(row.fetchedAt)) || Date.parse(row.fetchedAt) <= cutoff);
  for (const p of result.products ?? []) {
   if (p.mercadoLivre && old(p.mercadoLivre)) { delete p.mercadoLivre; delete p.mlPricing; }
   if (p.mlPricing && old(p.mlPricing)) delete p.mlPricing;
   if (p.mlAds && old(p.mlAds)) delete p.mlAds;
  }
  for (const kit of result.kits ?? []) if (all || kit.mlContext && (!kit.mlPricing || old(kit.mlPricing))) { delete kit.mlContext; delete kit.mlPricing; }
  result.pendingProducts = (result.pendingProducts ?? []).filter(p => !old(p.item));
  for (const field of ['adsReports','adsAccounts']) result[field] = (result[field] ?? []).filter(row => !old(row));
  for (const field of ['adsHistory','adsAccount']) if (result[field] && old(result[field])) delete result[field];
  // Custos, margens, taxas configuradas, kits e conciliações manuais pertencem à empresa.
  return result;
 }
 const rules = { TTL, fresh, unavailable, sanitize, purge: data => sanitize(data, null, true) };
 globalThis.ConduzMlDataRules = rules;
 if (typeof module !== 'undefined' && module.exports) module.exports = rules;
})();
