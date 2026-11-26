/* Dados fictícios para importação; nenhuma chamada externa. */
const { fixture } = require('./catalog-lab.cjs');
const stamp = '2026-11-20T12:00:00.000Z';
const clone = x => JSON.parse(JSON.stringify(x));
function response(id = 'MLB1234567890', price = 55, variations = 0) {
 const shipping = { source: 'mercadolivre-shipping-options', itemId: id, amount: 5, currency: 'BRL', fetchedAt: stamp, price, listingType: 'gold_special', shippingMode: 'me2', logisticType: 'xd_drop_off', freeShipping: true, billableWeight: 200 };
 return { item: { itemId: id, sellerId: 123, title: 'Anúncio fictício ' + id, categoryId: 'MLB1000', categoryName: 'Categoria oficial', catalogProductId: null, listingType: 'gold_special', permalink: 'https://produto.mercadolivre.com.br/MLB-' + id.slice(3) + '-teste-_JM', price, weight: .3, thumbnail: null, variationCount: variations, fetchedAt: stamp, skus: ['SKU-' + id], shippingQuote: shipping },
  commissions: { itemId: id, categoryId: 'MLB1000', price, fetchedAt: stamp, quotes: Object.fromEntries([['ml', 11], ['mlPremium', 14]].map(([key, commission]) => [key, { commission, fixed: 0, feeAmount: Math.round(price * commission) / 100 }])) } };
}
function pricing(input) {
 const shipping = response(input.itemId).item.shippingQuote;
 const inputs = { cost: input.cost, extra: input.extra, margin: input.margin, tax: input.tax, mlShipping: input.autoShipping ? 5 : input.mlShipping, weight: input.weight, ads: input.ads ?? 0, ...(input.autoShipping ? { autoShipping: true } : {}) };
 function quote(commission, margin) {
  const freight = inputs.mlShipping;
  let cents = Math.ceil((input.cost + input.extra + freight) / (1 - (commission + input.tax + inputs.ads + margin) / 100) * 100 - 1e-8);
  for (let n = 0; n < 100; n++, cents++) {
   const price = cents / 100, fee = Math.round(price * commission) / 100;
   const profit = price - input.cost - input.extra - freight - fee - price * (input.tax + inputs.ads) / 100;
   if (profit / price * 100 + 1e-9 >= margin) return { price, profit, margin: profit / price * 100, shippingApplied: freight, commission, fixed: 0, saleFeeAmount: fee, listingFeeAmount: 0, feeAmount: fee };
  }
  throw Error('Fixture de preço inviável');
 }
 return { source: 'mercadolivre-listing-prices', fetchedAt: stamp, itemId: input.itemId, categoryId: 'MLB1000', shippingMode: 'me2', logisticType: 'xd_drop_off', inputs, ...(input.autoShipping ? { shippingQuote: { ...shipping, amount: 5 } } : {}), quotes: Object.fromEntries([['ml', 11], ['mlPremium', 14]].map(([market, commission]) => [market, { desired: quote(commission, input.margin), minimum: quote(commission, 10) }])) };
}
function data() {
 const result = fixture(), p = result.products[0];
 p.mlPricing = pricing({ itemId: p.mercadoLivre.itemId, cost: p.cost, extra: p.extra, margin: p.margin, tax: p.feeSnapshot.ml.tax, ads: p.adsMl, weight: p.weight, mlShipping: 0, autoShipping: true });
 p.mlShipping = 5;
 return result;
}
function requests(ids = ['MLB1234567890', 'MLB9000000001']) {
 const calls = [];
 const request = async (action, options = {}) => {
  calls.push({ action, options: clone(options) });
  if (action === 'catalog-items') { const offset = Number(options.query?.cursor ?? 0), page = ids.slice(offset, offset + 20); return { itemIds: page, items: page.map(id => response(id).item), unavailableIds: [], nextCursor: offset + page.length < ids.length ? String(offset + page.length) : null }; }
  if (action === 'item') return response(options.query.id);
  if (action === 'pricing') return { pricing: pricing(options.body) };
  throw Error('Endpoint inesperado no teste: ' + action);
 };
 return { request, calls };
}
module.exports = { data, response, pricing, requests, stamp };
