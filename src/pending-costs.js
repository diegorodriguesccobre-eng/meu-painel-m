/* Custos por SKU: leitura e cotações só viram cadastros após revisão e confirmação. */
(function () {
 'use strict';
 const clone = x => JSON.parse(JSON.stringify(x));
 const stable = x => Array.isArray(x) ? x.map(stable) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, stable(x[k])])) : x;
 const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
 const key = item => item.sellerId + ':' + item.itemId;
 const skus = item => [...new Set((item?.skus ?? []).map(s => s.trim()))];
 const validSku = s => typeof s === 'string' && s.length > 0 && s.length <= 120 && !/[\u0000-\u001f\u007f]/.test(s);
 const normalizeHeader = s => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\s]+/g, ' ');
 const PAGE_SIZE = 20;

 function parseCostsCSV(text) {
  const records = readCSVRecords(text), headers = records.shift().cells.map(normalizeHeader), columns = {};
  for (const [name, aliases] of Object.entries({ sku: ['sku','codigo','codigo (sku)'], cost: ['custo','custo (r$)','preco custo','preco de custo','preco custo (r$)'] })) {
   const found = headers.flatMap((h, i) => aliases.includes(h) ? [i] : []);
   if (found.length !== 1) throw Error('Informe uma única coluna ' + (name === 'sku' ? 'SKU' : 'custo') + ' no cabeçalho.');
   columns[name] = found[0];
  }
  if (!records.length) throw Error('O CSV tem cabeçalho, mas não tem custos.');
  if (records.length > 5000) throw Error('Importe até 5.000 linhas por arquivo.');
  const rows = records.map(({ cells, line }) => {
   const sku = (cells[columns.sku] ?? '').trim(), cost = importNumber(cells[columns.cost] ?? '', 2);
   const problem = cells.length !== headers.length ? 'Quantidade de campos diferente do cabeçalho; use aspas para valores com o separador.' : !validSku(sku) ? 'SKU vazio, inválido ou maior que 120 caracteres.' : !Number.isFinite(cost) || cost < .01 || cost > 1e9 ? 'Custo inválido: use valor maior que zero, até duas casas decimais e sem R$ ou separador de milhares.' : '';
   return { line, sku, cost, problem };
  });
  const seen = new Map();
  for (const row of rows) if (validSku(row.sku)) seen.set(row.sku, (seen.get(row.sku) ?? 0) + 1);
  for (const row of rows) if (seen.get(row.sku) > 1) row.problem = 'SKU repetido no CSV. Mantenha uma única linha para esse código; nenhum dos custos repetidos será aplicado.';
  return rows;
 }
 function matchCosts(data, csvRows, sellerId) {
  const rows = [];
  for (const csv of csvRows) {
   const base = { line: csv.line, sku: csv.sku, cost: csv.cost, ready: false };
   if (csv.problem) { rows.push({ ...base, id: 'line:' + csv.line, kind: 'invalid', note: csv.problem }); continue; }
   const existing = data.products.filter(p => p.mercadoLivre?.sellerId === sellerId && skus(p.mercadoLivre).includes(csv.sku));
   const pending = (data.pendingProducts ?? []).filter(p => p.item.sellerId === sellerId && skus(p.item).includes(csv.sku));
   for (const p of existing) {
    const ambiguous = p.mercadoLivre.variationCount > 0 || skus(p.mercadoLivre).length !== 1, unchanged = p.cost === csv.cost;
    rows.push({ ...base, id: 'existing:' + csv.line + ':' + p.id, kind: 'existing', name: p.name, item: p.mercadoLivre, base: clone(p), existingCost: p.cost, unchanged, eligible: !ambiguous && !unchanged,
     fallbackFees: p.feeSnapshot ? null : clone(data.fees), kitCount: (data.kits ?? []).filter(k => k.items.some(i => i.productId === p.id)).length,
     note: unchanged ? 'O custo do CSV é igual ao atual. Nenhuma alteração necessária.' : ambiguous ? 'Anúncio com variações ou vários SKUs: confira o custo da unidade individualmente.' : existing.length + pending.length > 1 ? 'SKU compartilhado por vários cadastros ou anúncios. Confira o custo da unidade e selecione somente os desejados.' : 'Atualização de custo encontrada. Aguardando conferência dos cálculos.' });
   }
   for (const p of pending) {
    const registered = data.products.some(product => product.mercadoLivre && key(product.mercadoLivre) === key(p.item));
    const ambiguous = p.item.variationCount > 0 || skus(p.item).length !== 1;
    rows.push({ ...base, id: 'pending:' + p.id, kind: 'pending', name: p.item.title, item: p.item, base: clone(p), eligible: !registered && !ambiguous,
     note: registered ? 'Este anúncio já possui um produto cadastrado. O custo existente será preservado.' : ambiguous ? 'Anúncio com variações ou vários SKUs: conclua o cadastro individualmente para conferir a unidade.' : pending.length > 1 ? 'Este SKU aparece em vários anúncios. Confira cada anúncio e selecione somente os desejados.' : 'Custo encontrado pelo SKU exato. Aguardando cotação oficial.' });
   }
   if (!existing.length && !pending.length) rows.push({ ...base, id: 'missing:' + csv.line, kind: 'missing', note: 'SKU não encontrado nos produtos ou anúncios pendentes desta empresa. Nenhum produto será criado por nome.' });
  }
  return rows;
 }
 async function inspectCosts({ data, csvRows, sellerId, request, active = () => true, progress = () => {} }) {
  const rows = matchCosts(data, csvRows, sellerId), candidates = rows.filter(r => r.eligible); let index = 0, finished = 0, stopped = '';
  async function worker() {
   while (active() && !stopped && index < candidates.length) {
    const row = candidates[index++];
    try {
     const item = ConduzMlImport.importedLink(await request('item', { query: { id: row.item.itemId } }), sellerId);
     if (!active()) return;
     if (item.itemId !== row.item.itemId || item.variationCount || skus(item).length !== 1 || skus(item)[0] !== row.sku) throw Error('O SKU ou as variações do anúncio mudaram. Confira individualmente; o cadastro anterior foi preservado.');
     if (!(item.price > 0) || !['gold_special','gold_pro'].includes(item.listingType)) throw Error('Preço ou modalidade indisponível para calcular e conferir o lucro.');
     if (row.kind === 'existing') {
      const product = { ...clone(row.base), cost: row.cost };
      if (!product.feeSnapshot) product.feeSnapshot = copyFees(row.fallbackFees);
      let pricing;
      if (product.mlPricing) {
       const input = savedAdsPricingInput(product), response = await request('pricing', { method: 'POST', body: input });
       if (!active()) return;
       pricing = response.pricing;
       if (pricing?.categoryId !== item.categoryId) throw Error('A categoria da cotação mudou. Consulte novamente antes de atualizar o custo.');
      }
      const proposal = ConduzMlImport.proposedProduct(product, item, pricing, data.fees);
      if (Object.keys(SCENARIOS).some(s => !calculate(proposal, data.fees[marketOf(s)], s))) throw Error('O novo custo não permite calcular todos os preços com as configurações preservadas.');
      row.item = item; row.proposal = proposal; row.ready = true;
      row.note = 'Custo atual de ' + money(row.existingCost) + ' → novo custo de ' + money(row.cost) + '. Margem de ' + number(proposal.margin) + '%, Ads e taxas configuradas preservados. ' + (product.mlPricing ? 'Cotação oficial renovada no modo de frete já utilizado.' : 'Cálculos refeitos com as taxas e o frete cadastrados.');
      continue;
     }
     const weight = item.weight ?? row.base.item.weight;
     if (!(weight > 0)) throw Error('Peso indisponível. Conclua individualmente para informar o peso e consultar o frete.');
     const fees = withShopeePolicy(row.base.feeSnapshot);
     const product = { id: 'ml-product-' + sellerId + '-' + item.itemId, name: item.title.slice(0,120), category: (item.categoryName ?? item.categoryId ?? 'Mercado Livre').slice(0,80), cost: row.cost, weight, margin: row.base.margin, extra: 0, adsMl: 0, adsShopee: 0, mlShipping: 0, feeSnapshot: fees, mercadoLivre: copyMlLink(item) };
     const input = { ...savedAdsPricingInput(product), autoShipping: true };
     const response = await request('pricing', { method: 'POST', body: input });
     if (!active()) return;
     const pricing = response.pricing, expected = { ...input, mlShipping: pricing?.inputs?.mlShipping };
     if (!pricingMatches(pricing, expected) || pricing.categoryId !== item.categoryId) throw Error('A cotação não corresponde ao custo, margem, peso, imposto ou categoria em revisão.');
     product.mlPricing = copyOfficialPricing(pricing); product.mlShipping = pricing.inputs.mlShipping; product.mercadoLivre.shippingQuote = copyShippingQuote(pricing.shippingQuote);
     fees.ml.commission = pricing.quotes.ml.desired.commission; fees.ml.premiumCommission = pricing.quotes.mlPremium.desired.commission; fees.ml.fixed = pricing.quotes[currentScenario(product)].desired.fixed;
     const shopee = calculateShopee(product, fees.shopee);
     if (!shopee) throw Error('Preço da Shopee inviável para o custo, as taxas e a margem preservada.');
     fees.shopee.commission = shopee.baseCommission; fees.shopee.fixed = shopee.fixedBase;
     if (!validState({ products: [product], kits: [], fees: data.fees }) || Object.keys(SCENARIOS).some(s => !calculate(product, data.fees[marketOf(s)], s)) || !saleResult(product, fees.ml, currentScenario(product))) throw Error('Dados insuficientes para concluir este anúncio com os cálculos válidos.');
     row.item = item; row.proposal = product; row.ready = true;
     row.note = 'Custo do CSV e margem de ' + number(product.margin) + '%; frete e comissões consultados automaticamente. Confira os preços antes de selecionar.';
    } catch (error) { row.note = error.message; if ([401,403,409,429].includes(error.status)) stopped = error.message; }
    finally { finished++; if (active()) progress('Conferindo custos e cotações… ' + finished + ' de ' + candidates.length + ' anúncios.'); }
   }
  }
  await Promise.all([worker(), worker()]);
  if (!active()) return null;
  for (const row of candidates.slice(index)) row.note = stopped || 'Consulta não concluída. Os dados anteriores foram preservados.';
  return rows;
 }
 function applyCosts(data, rows, selected, sellerId) {
  const chosen = rows.filter(r => selected.has(r.id));
  if (!chosen.length || chosen.length !== selected.size) throw Error('Selecione ao menos um resultado disponível na revisão.');
  const next = { ...data, products: data.products.slice(), pendingProducts: (data.pendingProducts ?? []).slice() }, used = new Set();
  for (const row of chosen) {
   const baseLink = row.kind === 'existing' ? row.base?.mercadoLivre : row.base?.item, identity = row.kind + ':' + row.base?.id;
   if (!['existing','pending'].includes(row.kind) || !row.ready || !row.proposal || baseLink?.sellerId !== sellerId || row.item?.sellerId !== sellerId || key(baseLink) !== key(row.item) || key(row.proposal.mercadoLivre) !== key(baseLink) || row.proposal.cost !== row.cost || used.has(identity)) throw Error('A seleção contém dados indisponíveis, repetidos ou de outra empresa.');
   if (row.kind === 'existing') {
    const index = next.products.findIndex(p => p.id === row.base.id);
    if (index < 0 || !same(next.products[index], row.base)) throw Error('Um produto mudou durante a revisão. Leia o arquivo novamente para preservar a edição mais recente.');
    if (row.fallbackFees && !same(data.fees, row.fallbackFees)) throw Error('As taxas usadas na revisão mudaram. Leia o arquivo novamente.');
    next.products[index] = clone(row.proposal); used.add(identity);
    continue;
   }
   const pending = next.pendingProducts.find(p => p.id === row.base.id);
   if (!pending || !same(pending, row.base)) throw Error('Uma pendência mudou durante a revisão. Leia o arquivo novamente para preservar os dados mais recentes.');
   if (next.products.some(p => p.id === row.proposal.id || p.mercadoLivre && key(p.mercadoLivre) === key(row.item))) throw Error('Um anúncio selecionado já recebeu um custo. Leia novamente o CSV; o cadastro existente será preservado.');
   next.products.push(clone(row.proposal)); next.pendingProducts = next.pendingProducts.filter(p => p.id !== row.base.id); used.add(identity);
  }
  if (next.products.length > 5000 || !validState(next) || [...catalogOwners(next)].some(id => id !== String(sellerId))) throw Error('O catálogo atingiu um limite ou contém dados incompatíveis. Nada foi salvo.');
  return next;
 }
 const api = { parseCostsCSV, matchCosts, inspectCosts, applyCosts };
 globalThis.ConduzPendingCosts = api;
 if (typeof document === 'undefined' || !document.getElementById('pending-costs-dialog')) return;
 const ui = id => document.getElementById(id);
 let version = 0, busy = false, rows = [], selected = new Set(), owner = null, page = 0;
 const isOpen = () => ui('pending-costs-dialog').open;
 api.isOpen = isOpen;
 const moneyOrEmpty = n => Number.isFinite(n) ? money(n) : 'Inválido';
 const filtered = () => {
  const q = ui('pending-costs-search').value.trim().toLocaleLowerCase('pt-BR');
  return rows.filter(r => [r.sku,r.name,r.item?.itemId].join(' ').toLocaleLowerCase('pt-BR').includes(q));
 };
 function rowHTML(row) {
  const p = row.proposal;
  const prices = p ? '<div class="pending-cost-prices">' + Object.keys(SCENARIOS).map(s => { const fee = p.feeSnapshot[marketOf(s)], r = saleResult(p, fee, s), suggestion = r?.basis === 'current' ? calculate(p, fee, s) : null; return '<div><strong>' + SCENARIOS[s] + '</strong><span>' + (r?.basis === 'current' ? 'Preço atual: ' : 'Sugestão: ') + (r ? money(r.price) : 'Sem dados suficientes') + '</span><span>Lucro: ' + (r ? money(r.profit) + ' · ' + number(r.margin) + '%' : 'Sem dados suficientes') + '</span>' + (suggestion ? '<span>Sugestão para ' + number(p.margin) + '%: ' + money(suggestion.price) + '</span>' : '') + '</div>'; }).join('') + '</div>' : '';
  const comparison = row.kind === 'existing' ? '<div class="pending-cost-comparison"><div><span>Custo atual</span><strong>' + moneyOrEmpty(row.existingCost) + '</strong></div><div><span>Novo custo (CSV)</span><strong>' + moneyOrEmpty(row.cost) + '</strong></div></div>' : '<p>Custo no CSV: <strong>' + moneyOrEmpty(row.cost) + '</strong></p>';
  return '<article class="pending-cost-row"><label class="pending-cost-choice"><input type="checkbox" data-cost-row="' + escapeHTML(row.id) + '" aria-label="Selecionar ' + escapeHTML(row.name ?? row.sku ?? 'linha') + '" ' + (selected.has(row.id) ? 'checked ' : '') + (row.ready ? '' : 'disabled ') + '><strong>' + escapeHTML(row.name ?? row.sku ?? 'Linha inválida') + '</strong></label><p>' + (row.kind === 'existing' ? 'Produto cadastrado · ' : row.kind === 'pending' ? 'Custo pendente · ' : '') + 'Linha ' + row.line + ' · SKU: ' + escapeHTML(row.sku || '(vazio)') + (row.item ? ' · ' + escapeHTML(row.item.itemId) : '') + '</p>' + comparison + (row.base ? '<p>Margem desejada preservada: <strong>' + number(row.base.margin) + '%</strong></p>' : '') + '<p class="help">' + escapeHTML(row.note) + '</p>' + (row.kitCount ? '<p class="help">Usado em ' + row.kitCount + ' kit(s). O custo dos componentes acompanha o produto; confira e atualize as cotações dos kits se necessário, mantendo suas margens.</p>' : '') + prices + '</article>';
 }
 function renderReview() {
  const found = filtered(); page = Math.min(page, Math.max(0, Math.ceil(found.length / PAGE_SIZE) - 1));
  ui('pending-costs-rows').innerHTML = found.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(rowHTML).join('') || '<p class="help">' + (busy ? 'Aguarde a conferência.' : 'Nenhum resultado nesta busca. Selecione um CSV para conferir.') + '</p>';
  ui('pending-costs-page').textContent = (found.length ? (page * PAGE_SIZE + 1) + '–' + Math.min((page + 1) * PAGE_SIZE, found.length) + ' de ' + found.length : '0 resultados') + ' · ' + selected.size + ' selecionado(s)';
  ui('pending-costs-prev').disabled = page === 0; ui('pending-costs-next').disabled = (page + 1) * PAGE_SIZE >= found.length;
  ui('pending-costs-file').disabled = busy;
  ui('pending-costs-select').disabled = busy || !rows.some(r => r.ready); ui('pending-costs-clear').disabled = busy || !selected.size;
  ui('pending-costs-save').disabled = busy || !selected.size || !mlConnection.connected || mlConnection.account?.id !== owner;
  ui('pending-costs-save').textContent = 'Salvar selecionados' + (selected.size ? ' (' + selected.size + ')' : '');
 }
 function cancel() { version++; busy = false; rows = []; selected.clear(); ui('pending-costs-dialog').close(); }
 ui('pending-costs-open').onclick = () => {
  if (!mlConnection.connected) { toast('Conecte a conta da empresa para importar custos.'); return; }
  if (currentPricesBusy || mlAdsBusy || adsUi.busy || adsHistoryUi.busy || globalThis.ConduzMlImport?.isOpen?.()) { toast('Aguarde ou feche a consulta ou revisão em andamento e tente novamente.'); return; }
  version++; owner = mlConnection.account.id; busy = false; rows = []; selected = new Set(); page = 0;
  ui('pending-costs-file').value = ''; ui('pending-costs-search').value = ''; ui('pending-costs-error').textContent = '';
  ui('pending-costs-account').textContent = 'Conta: ' + mlConnection.account.nickname;
  ui('pending-costs-status').textContent = 'Selecione um CSV com SKU e custo. A leitura e as consultas não salvam produtos.';
  renderReview(); ui('pending-costs-dialog').showModal();
 };
 ui('pending-costs-file').onchange = async e => {
  const file = e.target.files?.[0]; if (!file) return;
  const generation = ++version, sellerId = owner, baseline = clone(state);
  const active = () => generation === version && isOpen() && mlConnection.connected && mlConnection.account?.id === sellerId;
  busy = true; rows = []; selected.clear(); ui('pending-costs-error').textContent = ''; renderReview();
  try {
   if (file.size > 2 * 1024 * 1024) throw Error('O CSV deve ter no máximo 2 MB.');
   const text = await file.text(); if (!active()) return;
   const csvRows = parseCostsCSV(text);
   const result = await inspectCosts({ data: baseline, csvRows, sellerId, request: mlRequest, active, progress: s => { if (active()) ui('pending-costs-status').textContent = s; } });
   if (!active() || !result) return;
   rows = result;
   ui('pending-costs-status').textContent = csvRows.length + ' linha(s) no CSV · ' + rows.filter(r => r.ready && r.kind === 'existing').length + ' atualização(ões) de custo · ' + rows.filter(r => r.ready && r.kind === 'pending').length + ' pendência(s) para concluir · ' + rows.filter(r => r.unchanged).length + ' custo(s) sem alteração · ' + rows.filter(r => !r.ready && !r.unchanged).length + ' resultado(s) sem aplicação. Revise e marque somente os desejados.';
  } catch (error) { if (active()) { ui('pending-costs-error').textContent = error.message + ' Nada foi salvo.'; ui('pending-costs-status').textContent = 'Corrija o arquivo ou a conexão e selecione o CSV novamente.'; } }
  finally { if (generation === version) { busy = false; ui('pending-costs-file').value = ''; renderReview(); } }
 };
 ui('pending-costs-save').onclick = () => {
  if (busy || !mlConnection.connected || mlConnection.account?.id !== owner) return;
  try {
   const previous = state, next = applyCosts(state, rows, selected, owner), updated = rows.filter(r => selected.has(r.id) && r.kind === 'existing').length, completed = rows.filter(r => selected.has(r.id) && r.kind === 'pending').length;
   state = next;
   if (!persist()) { state = previous; throw Error('Não foi possível gravar. As pendências e os custos anteriores foram preservados. Confira o armazenamento do navegador.'); }
   cancel(); render(); toast(updated + ' custo(s) atualizado(s) · ' + completed + ' produto(s) concluído(s). Confira a sincronização da empresa.'); refreshRegisteredAds();
  } catch (error) { ui('pending-costs-error').textContent = error.message; }
 };
 ui('pending-costs-select').onclick = () => { for (const r of filtered()) if (r.ready) selected.add(r.id); renderReview(); };
 ui('pending-costs-clear').onclick = () => { selected.clear(); renderReview(); };
 ui('pending-costs-search').oninput = () => { page = 0; renderReview(); };
 ui('pending-costs-prev').onclick = () => { page--; renderReview(); }; ui('pending-costs-next').onclick = () => { page++; renderReview(); };
 ui('pending-costs-rows').onchange = e => { const id = e.target.dataset.costRow; if (!rows.some(r => r.id === id && r.ready)) return; e.target.checked ? selected.add(id) : selected.delete(id); renderReview(); };
 ui('pending-costs-cancel').onclick = ui('pending-costs-close').onclick = cancel;
 ui('pending-costs-dialog').oncancel = e => { e.preventDefault(); cancel(); };
})();
