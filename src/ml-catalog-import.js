/* Importação em lote: consultas e propostas ficam separadas dos cadastros salvos. */
(function () {
 'use strict';
 const clone = value => JSON.parse(JSON.stringify(value));
 const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
 const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
 const itemKey = item => item.sellerId + ':' + item.itemId;
 const normalizeQuery = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
 const PAGE_SIZE = 30, MAX_ITEMS = 10000;

 function importedLink(response, sellerId) {
  const item = response?.item;
  if (!validMlLink(item) || item.sellerId !== sellerId) throw Error('O anúncio retornou dados inválidos ou pertence a outra conta.');
  const link = copyMlLink(item), fees = response.commissions, shipping = item.shippingQuote;
  if (validCommissionReference(fees) && fees.itemId === item.itemId && fees.price === item.price) link.currentFees = copyCommissionReference(fees);
  if (validShippingQuote(shipping) && shipping.price === item.price && shipping.listingType === item.listingType) link.currentShipping = copyShippingQuote(shipping);
  return link;
 }
 function pendingProduct(item, fees, previous) {
  return { id: previous?.id ?? 'ml-pending-' + item.sellerId + '-' + item.itemId, item: copyMlLink(item), margin: previous?.margin ?? 20,
   feeSnapshot: copyFees(previous?.feeSnapshot ?? fees), importedAt: previous?.importedAt ?? new Date().toISOString() };
 }
 function proposedProduct(product, item, pricing, fees) {
  if (!product.mercadoLivre || itemKey(product.mercadoLivre) !== itemKey(item)) throw Error('O anúncio não corresponde ao cadastro em revisão.');
  if (item.variationCount > 0) throw Error('Anúncio com variações: confira preço e custo de cada variação individualmente. O cadastro será preservado.');
  if (!(item.price > 0) || !['gold_special', 'gold_pro'].includes(item.listingType)) throw Error('Preço atual ou modalidade indisponível para conferir o lucro. Cadastro preservado.');
  const next = { ...clone(product), mercadoLivre: copyMlLink(item) };
  if (product.mlPricing) {
   const input = { ...savedAdsPricingInput(product), ...(product.mlPricing.inputs.autoShipping ? { mlShipping: pricing?.inputs?.mlShipping } : {}) };
   if (!pricingMatches(pricing, input)) throw Error('A cotação não corresponde ao custo, margem, peso, imposto e Ads preservados.');
   next.mlPricing = copyOfficialPricing(pricing);
   if (input.autoShipping) { next.mlShipping = pricing.inputs.mlShipping; next.mercadoLivre.shippingQuote = copyShippingQuote(pricing.shippingQuote); }
  }
  if (!validState({ products: [next], kits: [], fees }) || !saleResult(next, fees.ml, currentScenario(next))) throw Error('Sem dados suficientes para conferir o lucro no preço atual. Cadastro preservado.');
  return next;
 }
 function applyReview(data, rows, selected, sellerId) {
  const chosen = rows.filter(row => selected.has(row.id));
  if (!chosen.length) throw Error('Selecione ao menos um resultado disponível.');
  const next = { ...data, products: data.products.slice(), pendingProducts: (data.pendingProducts ?? []).slice() };
  for (const row of chosen) {
   if (!row.ready || row.item?.sellerId !== sellerId) throw Error('A seleção contém uma consulta indisponível ou de outra conta.');
   if (row.kind === 'existing') {
    const index = next.products.findIndex(p => p.id === row.base.id);
    if (index < 0 || !same(next.products[index], row.base)) throw Error('Um cadastro mudou durante a revisão. Consulte novamente para preservar a edição mais recente.');
    next.products[index] = clone(row.proposal);
   } else if (row.kind === 'pending') {
    if (next.products.some(p => p.mercadoLivre && itemKey(p.mercadoLivre) === itemKey(row.item))) throw Error('Este anúncio já recebeu um cadastro. Consulte novamente para evitar duplicatas.');
    const index = next.pendingProducts.findIndex(p => itemKey(p.item) === itemKey(row.item));
    if (row.base ? index < 0 || !same(next.pendingProducts[index], row.base) : index >= 0) throw Error('As pendências mudaram durante a revisão. Consulte novamente.');
    if (index < 0) next.pendingProducts.push(clone(row.proposal)); else next.pendingProducts[index] = clone(row.proposal);
   } else throw Error('Resultado inválido na seleção.');
  }
  if (next.products.length > 5000 || next.pendingProducts.length > 5000) throw Error('Selecione um lote menor: o catálogo aceita até 5.000 produtos e 5.000 pendências.');
  if (!validState(next) || [...catalogOwners(next)].some(id => id !== String(sellerId))) throw Error('A revisão produziria um catálogo inválido ou com dados de outra empresa. Nada foi salvo.');
  return next;
 }
 async function readCatalog({ sellerId, request, active = () => true, progress = () => {} }) {
  const ids = new Set(), pages = new Set(), items = new Map(); let cursor = null;
  do {
   if (!active()) return null;
   progress('Buscando todos os anúncios… ' + ids.size + ' identificado(s).');
   const page = await request('catalog-items', { query: cursor ? { cursor } : {} });
   if (!active()) return null;
   if (!page || !Array.isArray(page.itemIds) || !Array.isArray(page.items) || !Array.isArray(page.unavailableIds) || !Object.hasOwn(page, 'nextCursor') || page.nextCursor !== null && (typeof page.nextCursor !== 'string' || !page.nextCursor || page.nextCursor.length > 4096) || page.itemIds.length > 20 || new Set(page.itemIds).size !== page.itemIds.length || page.itemIds.some(id => !/^MLB\d{5,15}$/.test(id)) || page.items.some(item => !page.itemIds.includes(item.itemId)) || page.unavailableIds.some(id => !page.itemIds.includes(id))) throw Error('A listagem veio incompleta ou inválida. Refaça a consulta; nada foi salvo.');
   const fingerprint = page.itemIds.slice().sort().join(',');
   if (page.nextCursor !== null && (!fingerprint || pages.has(fingerprint))) throw Error('A listagem deixou de avançar. Refaça a consulta; nada foi salvo.');
   if (fingerprint) pages.add(fingerprint);
   for (const id of page.itemIds) ids.add(id);
   for (const item of page.items) {
    if (!validMlLink(item) || item.sellerId !== sellerId || items.has(item.itemId)) throw Error('A listagem retornou um anúncio inválido, repetido ou de outra conta. Nada foi salvo.');
    items.set(item.itemId, copyMlLink(item));
   }
   if (ids.size > MAX_ITEMS) throw Error('A conta excede 10.000 anúncios nesta consulta. Nada foi salvo.');
   cursor = page.nextCursor;
  } while (cursor !== null);
  return { ids, items };
 }
 async function discoverCatalog(options) {
  const { request, sellerId, active = () => true } = options, listed = await readCatalog(options);
  if (!listed || !active()) return null;
  const unavailable = [];
  for (const id of listed.ids) if (!listed.items.has(id)) {
   if (!active()) return null;
   try {
    const item = importedLink(await request('item', { query: { id } }), sellerId);
    if (!active()) return null;
    if (item.itemId !== id) throw Error('O anúncio retornado não corresponde à consulta.');
    listed.items.set(id, item);
   } catch (error) {
    if ([401, 409, 429].includes(error.status)) throw error;
    unavailable.push(id);
   }
  }
  return { items: [...listed.items.values()], total: listed.ids.size, unavailable };
 }
 function addDiscovered(data, items, sellerId) {
  const known = new Set([...(data.pendingProducts ?? []).map(p => itemKey(p.item)), ...data.products.filter(p => p.mercadoLivre).map(p => itemKey(p.mercadoLivre))]);
  const added = [];
  for (const item of items) {
   if (!validMlLink(item) || item.sellerId !== sellerId) throw Error('Um anúncio retornou dados inválidos ou pertence a outra conta.');
   if (!known.has(itemKey(item))) { added.push(pendingProduct(item, data.fees)); known.add(itemKey(item)); }
  }
  if (!added.length) return data;
  const next = { ...data, pendingProducts: [...(data.pendingProducts ?? []), ...added] };
  if (next.pendingProducts.length > 5000) throw Error('O catálogo atingiu o limite de 5.000 pendências. Conclua os cadastros antes de tentar novamente.');
  if (!validState(next) || [...catalogOwners(next)].some(id => id !== String(sellerId))) throw Error('Não foi possível adicionar os anúncios à empresa correta. Os cadastros foram preservados.');
  return next;
 }
 async function inspectCatalog({ data, sellerId, request, active = () => true, progress = () => {} }) {
  const listed = await readCatalog({ sellerId, request, active, progress });
  if (!listed || !active()) return null;
  const { ids } = listed;
  const rows = [], allIds = [...ids]; let index = 0, finished = 0, stopped = '';
  async function worker() {
   while (active() && !stopped && index < allIds.length) {
    const id = allIds[index++];
    try {
     const response = await request('item', { query: { id } });
     if (!active()) return;
     const item = importedLink(response, sellerId);
     if (item.itemId !== id) throw Error('O anúncio retornado não corresponde à consulta.');
     const products = data.products.filter(p => p.mercadoLivre && itemKey(p.mercadoLivre) === itemKey(item));
     if (!products.length) {
      const base = (data.pendingProducts ?? []).find(p => itemKey(p.item) === itemKey(item));
      rows.push({ id: 'pending:' + id, kind: 'pending', ready: true, item, base, proposal: pendingProduct(item, data.fees, base), note: item.variationCount ? 'Sem custo. Anúncio com ' + item.variationCount + ' variações: confira cada variação individualmente.' : 'Sem custo: será salvo nas pendências, sem calcular lucro.' });
     } else for (const product of products) {
      if (!active()) return;
      try {
       let pricing;
       if (item.variationCount) throw Error('Anúncio com variações: revisão individual necessária. Este cadastro será preservado.');
       if (product.mlPricing) pricing = (await request('pricing', { method: 'POST', body: savedAdsPricingInput(product) })).pricing;
       if (!active()) return;
       const proposal = proposedProduct(product, item, pricing, data.fees);
       rows.push({ id: 'product:' + product.id, kind: 'existing', ready: true, item, base: clone(product), proposal, note: product.mlPricing ? 'Atualiza o vínculo e as cotações oficiais. Dados internos e Ads preservados.' : 'Atualiza o vínculo e o preço atual. O modo manual e as taxas salvas são preservados.' });
      } catch (error) {
       if ([401, 409, 429].includes(error.status)) stopped = error.message;
       rows.push({ id: 'product:' + product.id, kind: 'existing', ready: false, item, base: clone(product), note: error.message });
      }
     }
    } catch (error) {
     if ([401, 409, 429].includes(error.status)) stopped = error.message;
     rows.push({ id: 'error:' + id, kind: 'error', ready: false, item: { itemId: id, sellerId, title: id }, note: error.message });
    } finally { finished++; if (active()) progress('Conferindo dados e cálculos… ' + finished + ' de ' + allIds.length + ' anúncios.'); }
   }
  }
  await Promise.all([worker(), worker()]);
  if (!active()) return null;
  for (const id of allIds.slice(index)) rows.push({ id: 'error:' + id, kind: 'error', ready: false, item: { itemId: id, sellerId, title: id }, note: stopped || 'Consulta não concluída; dados preservados.' });
  for (const product of data.products) if (product.mercadoLivre?.sellerId === sellerId && !ids.has(product.mercadoLivre.itemId)) rows.push({ id: 'product:' + product.id, kind: 'existing', ready: false, item: copyMlLink(product.mercadoLivre), base: clone(product), note: 'Este anúncio não apareceu na listagem da conta. O cadastro será preservado; confira sua situação no Mercado Livre.' });
  return { rows: rows.sort((a, b) => a.item.itemId.localeCompare(b.item.itemId) || a.id.localeCompare(b.id)), total: ids.size, stopped };
 }
 async function refreshCatalog({data,sellerId,request,active=()=>true,progress=()=>{},now=Date.now}) {
  const listed=await readCatalog({sellerId,request,active,progress});if(!listed||!active())return null;
  const products=[],pending=[],items=listed.items,failed=[];
  const obtain=async item=>{
   try {
    const response=await request('item',{query:{id:item.itemId}}),link=importedLink(response,sellerId);
    if(link.itemId!==item.itemId)throw Error('Anúncio incompatível com a consulta.');
    return ['closed','inactive'].includes(link.status)?ConduzMlDataRules.unavailable(link,now()):link;
   } catch(error){if(error.status===404)return ConduzMlDataRules.unavailable(item,now());if([401,403,409,429].includes(error.status))throw error;failed.push(item.itemId);return null;}
  };
  const bases=data.products.filter(p=>p.mercadoLivre?.sellerId===sellerId);
  for(const base of bases){
   if(!active())return null;progress('Renovando anúncios e referências oficiais… '+(products.length+failed.length+1)+' de '+bases.length+'.');
   const link=await obtain(base.mercadoLivre);if(!link)continue;
   const proposal={...clone(base),mercadoLivre:link};
   if(link.availability==='unavailable'){delete proposal.mlPricing;delete proposal.mlAds;}
   // Taxas e cotações de precificação são históricas; a consulta do preço atual não as sobrescreve.
   products.push({base:clone(base),proposal});
  }
  for(const base of data.pendingProducts??[]){
   if(base.item.sellerId!==sellerId)continue;if(!active())return null;
   let item=items.get(base.item.itemId);
   if(!item)item=await obtain(base.item);
   if(item){if(['closed','inactive'].includes(item.status))item=ConduzMlDataRules.unavailable(item,now());pending.push({base:clone(base),proposal:pendingProduct(item,data.fees,base)});}
  }
  return {products,pending,items:[...items.values()].filter(i=>!['closed','inactive'].includes(i.status)),failed};
 }
 function applyRefresh(data,result,sellerId){
  const next=addDiscovered(data,result.items,sellerId),updated={...next,products:next.products.slice(),pendingProducts:(next.pendingProducts??[]).slice()};let skipped=0;
  for(const [field,rows] of [['products',result.products],['pendingProducts',result.pending]])for(const row of rows){
   const i=updated[field].findIndex(p=>p.id===row.base.id);if(i>=0&&same(updated[field][i],row.base))updated[field][i]=clone(row.proposal);else skipped++;
  }
  if(!validState(updated)||[...catalogOwners(updated)].some(id=>id!==String(sellerId)))throw Error('A atualização contém dados incompatíveis. Os cadastros foram preservados.');
  return {data:updated,skipped};
 }
 const api = { inspectCatalog, applyReview, importedLink, proposedProduct, pendingProduct, discoverCatalog, addDiscovered,refreshCatalog,applyRefresh };
 globalThis.ConduzMlImport = api;
 if (typeof document === 'undefined' || !document.getElementById('ml-import-dialog')) return;

 const ui = id => document.getElementById(id);
 let version = 0, busy = false, seller = null, rows = [], selected = new Set(), page = 0, complete = false, pendingPage = 0;
 const isOpen = () => ui('ml-import-dialog').open;
 api.isReviewOpen = () => isOpen() || Boolean(globalThis.ConduzPendingCosts?.isOpen());
 api.isOpen = () => api.isReviewOpen() || Boolean(globalThis.ConduzMlPolicy?.isRefreshing());
 let autoOwner = null, autoVersion = 0, autoBusy = false, autoDone = false, autoTimer = null, autoResult = null, autoAttempts = 0;
 const autoStatus = text => { ui('ml-catalog-auto-status').textContent = text; };
 const canImport = () => globalThis.ConduzCatalog?.readyForImport(autoOwner) && !api.isOpen() && !kitEditing && !kitItems.size && !['product-dialog', 'restore-dialog', 'import-dialog', 'ads-reconcile-dialog', 'cloud-review-dialog', 'delete-dialog', 'kit-delete-dialog'].some(id => ui(id).open);
 function queueAuto(delay = 300) {
  if (autoTimer !== null || autoDone || !autoOwner || autoAttempts >= 3 && !autoResult) return;
  autoTimer = setTimeout(() => { autoTimer = null; syncNewProducts(); }, delay);
 }
 async function syncNewProducts() {
  if (autoBusy || autoDone || !autoOwner || !mlConnection.connected || mlConnection.account?.id !== autoOwner) return;
  if (!canImport()) { queueAuto(1500); return; }
  const generation = autoVersion, owner = autoOwner;
  const active = () => generation === autoVersion && mlConnection.connected && mlConnection.account?.id === owner;
  autoBusy = true;
  try {
   if (!autoResult) {
    autoAttempts++;
    const result = await discoverCatalog({ sellerId: owner, request: mlRequest, active, progress: text => { if (active()) autoStatus(text); } });
    if (!active()) return;
    autoResult = result;
   }
   if (!active() || !autoResult) return;
   if (!canImport()) { autoStatus('Catálogo consultado. Aguardando concluir a edição para adicionar os anúncios novos.'); queueAuto(1500); return; }
   const previous = state, next = addDiscovered(state, autoResult.items, owner), count = (next.pendingProducts?.length ?? 0) - (state.pendingProducts?.length ?? 0);
   if (next !== state) {
    state = next;
    if (!persist()) { state = previous; throw Error('Não foi possível gravar as pendências neste navegador. Os cadastros anteriores foram preservados.'); }
    render();
   }
   const unavailable = autoResult.unavailable.length, total = autoResult.total;
   autoStatus(total + ' anúncio(s) encontrado(s) · ' + count + ' novo(s) adicionado(s) como pendente(s) de custo. Cadastros existentes preservados.' + (unavailable ? ' ' + unavailable + ' anúncio(s) indisponível(is). ' + (autoAttempts < 3 ? 'Tentaremos novamente.' : 'Recarregue a página para tentar novamente.') : ' Confira a sincronização da empresa.'));
   autoDone = !unavailable;
   autoResult = null;
   if (unavailable) queueAuto(60000);
  } catch (error) {
   if (active()) {
    autoResult = null;
    autoStatus(error.message + (autoAttempts < 3 ? ' A importação automática tentará novamente.' : ' Recarregue a página para tentar novamente.') + ' Os cadastros existentes foram preservados.');
    queueAuto(60000);
   }
  } finally { if (generation === autoVersion) autoBusy = false; }
 }
 api.syncNewProducts = syncNewProducts;
 api.onCatalogReady = id => {
  if (!mlConnection.connected || mlConnection.account?.id !== id) return;
  if(globalThis.ConduzMlPolicy){globalThis.ConduzMlPolicy.catalogReady(id);return;}
  if (autoOwner !== id) { api.onDisconnect(); autoOwner = id; }
  queueAuto();
 };
 api.onDisconnect = () => {
  globalThis.ConduzMlPolicy?.disconnected();
  autoVersion++; clearTimeout(autoTimer); autoTimer = null; autoOwner = null; autoBusy = false; autoDone = false; autoResult = null; autoAttempts = 0;
  autoStatus('Os anúncios serão carregados automaticamente após concluir a entrada e confirmar o catálogo da empresa.');
 };
 globalThis.addEventListener?.('online', () => { autoAttempts = 0; queueAuto(); });
 const filtered = () => rows.filter(row => {
  const mode = ui('ml-import-filter').value, query = normalizeQuery(ui('ml-import-search').value.trim());
  return (mode === 'all' || mode === 'error' ? mode === 'all' || !row.ready : row.kind === mode) && normalizeQuery(row.item.title + ' ' + row.item.itemId + ' ' + (row.item.skus ?? []).join(' ') + ' ' + (row.base?.name ?? '')).includes(query);
 });
 const value = x => x === null || x === undefined ? 'Indisponível' : money(x);
 function calculations(product) {
  const current = saleResult(product, state.fees.ml, currentScenario(product));
  return '<div class="ml-import-current"><strong>Preço atual: ' + value(product.mercadoLivre.price) + '</strong><span>Lucro estimado por venda: ' + (current ? money(current.profit) + ' · ' + number(current.margin) + '%' : 'sem dados suficientes') + '</span></div><div class="ml-import-prices">' + Object.keys(SCENARIOS).map(scenario => {
   const result = calculate(product, state.fees[marketOf(scenario)], scenario);
   return '<div><strong>' + SCENARIOS[scenario] + '</strong><span>Sugestão: ' + (result ? money(result.price) : 'sem dados suficientes') + '</span><span>Lucro: ' + (result ? money(result.profit) + ' · ' + number(result.margin) + '%' : 'sem dados suficientes') + '</span></div>';
  }).join('') + '</div>';
 }
 function rowHTML(row) {
  const p = row.base, item = row.item, existing = row.kind === 'existing', label = !row.ready ? 'Consulta indisponível' : existing ? 'Cadastro existente' : p ? 'Pendência existente' : 'Novo · custo pendente';
  const differences = existing ? '<dl class="ml-import-differences"><div><dt>Nome interno / Mercado Livre</dt><dd>' + escapeHTML(p.name) + ' / ' + escapeHTML(item.title) + '</dd></div><div><dt>Categoria interna / Mercado Livre</dt><dd>' + escapeHTML(p.category) + ' / ' + escapeHTML(item.categoryName ?? item.categoryId ?? 'indisponível') + '</dd></div><div><dt>Peso interno / Mercado Livre</dt><dd>' + number(p.weight, 3) + ' kg / ' + (item.weight === null ? 'indisponível' : number(item.weight, 3) + ' kg') + '</dd></div><div><dt>Preço registrado / consultado</dt><dd>' + value(p.mercadoLivre.price) + ' / ' + value(item.price) + '</dd></div><div><dt>Dados preservados</dt><dd>Custo ' + money(p.cost) + ' · meta ' + number(p.margin) + '% · Ads ML ' + number(adsRate(p, 'ml')) + '% / Shopee ' + number(adsRate(p, 'shopee')) + '%</dd></div></dl>' : '<p>Preço anunciado: ' + value(item.price) + ' · ' + escapeHTML(item.categoryName ?? item.categoryId ?? 'Categoria indisponível') + '</p>';
  return '<article class="ml-import-row"><div class="ml-import-row-title"><label><input type="checkbox" data-import-row="' + escapeHTML(row.id) + '" ' + (selected.has(row.id) ? 'checked ' : '') + (row.ready ? '' : 'disabled ') + 'aria-label="Selecionar ' + escapeHTML(item.title) + '"><strong>' + escapeHTML(item.title) + '</strong></label><span class="ml-import-badge">' + label + '</span></div><p class="help">' + escapeHTML(item.itemId) + (item.skus?.length ? ' · SKU: ' + escapeHTML(item.skus.join(' · ')) : '') + '</p>' + differences + '<p class="help">' + escapeHTML(row.note) + '</p>' + (existing && row.ready ? calculations(row.proposal) : '<p class="help">' + (row.kind === 'pending' ? 'Lucro: sem dados suficientes. Informe o custo ao concluir o cadastro.' : 'Nenhuma atualização será salva para este resultado.') + '</p>') + '</article>';
 }
 function renderReview() {
  const result = filtered(); page = Math.min(page, Math.max(0, Math.ceil(result.length / PAGE_SIZE) - 1));
  ui('ml-import-rows').innerHTML = result.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(rowHTML).join('') || '<p class="help">' + (busy ? 'Aguarde a consulta.' : 'Nenhum resultado neste filtro.') + '</p>';
  ui('ml-import-page').textContent = result.length ? (page * PAGE_SIZE + 1) + '–' + Math.min((page + 1) * PAGE_SIZE, result.length) + ' de ' + result.length + ' · ' + selected.size + ' selecionado(s)' : '0 resultados';
  ui('ml-import-prev').disabled = page === 0; ui('ml-import-next').disabled = (page + 1) * PAGE_SIZE >= result.length;
  ui('ml-import-select').disabled = busy || !complete; ui('ml-import-clear').disabled = busy || !selected.size;
  ui('ml-import-save').disabled = busy || !complete || !selected.size || !mlConnection.connected || mlConnection.account?.id !== seller;
  ui('ml-import-save').textContent = 'Salvar selecionados' + (selected.size ? ' (' + selected.size + ')' : '');
 }
 function cancel() { version++; busy = false; complete = false; rows = []; selected.clear(); ui('ml-import-dialog').close(); }
 ui('ml-import-open').onclick = async () => {
  if (!mlConnection.connected) { toast('Conecte a conta da empresa no Mercado Livre para consultar o catálogo.'); return; }
  if (autoBusy || currentPricesBusy || mlAdsBusy || adsUi.busy || adsHistoryUi.busy) { toast('Aguarde a consulta automática em andamento e abra a revisão novamente.'); return; }
  version++; seller = mlConnection.account.id; rows = []; selected = new Set(); complete = false; busy = false; page = 0;
  ui('ml-import-search').value = ''; ui('ml-import-filter').value = 'all'; ui('ml-import-error').textContent = '';
  ui('ml-import-status').textContent = 'Consultando as atualizações para conferência. Os cadastros existentes só mudam após salvar a seleção.';
  ui('ml-import-account').textContent = 'Conta: ' + mlConnection.account.nickname + ' · ' + seller;
  renderReview(); ui('ml-import-dialog').showModal(); await loadReview();
 };
 async function loadReview() {
  if (busy || !mlConnection.connected || mlConnection.account?.id !== seller) return;
  const generation = ++version, baseline = clone(state), owner = seller;
  const active = () => generation === version && isOpen() && mlConnection.connected && mlConnection.account?.id === owner;
  busy = true; complete = false; rows = []; selected.clear(); ui('ml-import-error').textContent = ''; renderReview();
  try {
   const result = await inspectCatalog({ data: baseline, sellerId: owner, request: mlRequest, active, progress: text => { if (active()) ui('ml-import-status').textContent = text; } });
   if (!active() || !result) return;
   rows = result.rows; complete = true;
   const available = rows.filter(row => row.ready).length, pending = rows.filter(row => row.ready && row.kind === 'pending').length;
   ui('ml-import-status').textContent = result.total + ' anúncio(s) listado(s) · ' + available + ' resultado(s) disponível(is) · ' + pending + ' pendente(s) de custo · ' + rows.filter(row => !row.ready).length + ' indisponível(is). Marque os resultados que deseja salvar.';
   if (result.stopped) ui('ml-import-error').textContent = result.stopped + ' Os resultados sem consulta foram preservados e não podem ser selecionados.';
  } catch (error) { if (active()) ui('ml-import-error').textContent = error.message + ' Nenhuma alteração foi salva. Feche e abra a conferência para tentar novamente.'; }
  finally { if (generation === version) { busy = false; renderReview(); } }
 }
 ui('ml-import-save').onclick = () => {
  if (busy || !complete || !mlConnection.connected || mlConnection.account?.id !== seller) return;
  try {
   const next = applyReview(state, rows, selected, seller), previous = state, count = selected.size;
   state = next;
   if (!persist()) { state = previous; throw Error('Não foi possível gravar a revisão. Os cadastros anteriores foram preservados. Confira o armazenamento do navegador.'); }
   cancel(); render(); toast(count + ' resultado(s) salvo(s). Anúncios sem custo permanecem pendentes. Confira a sincronização da empresa.');
  } catch (error) { ui('ml-import-error').textContent = error.message; }
 };
 ui('ml-import-select').onclick = () => { for (const row of filtered()) if (row.ready) selected.add(row.id); renderReview(); };
 ui('ml-import-clear').onclick = () => { selected.clear(); renderReview(); };
 ui('ml-import-rows').onchange = e => { const id = e.target.dataset.importRow; if (!rows.some(row => row.id === id && row.ready)) return; if (e.target.checked) selected.add(id); else selected.delete(id); renderReview(); };
 for (const id of ['ml-import-search', 'ml-import-filter']) ui(id).oninput = () => { page = 0; renderReview(); };
 ui('ml-import-prev').onclick = () => { page--; renderReview(); }; ui('ml-import-next').onclick = () => { page++; renderReview(); };
 ui('ml-import-close').onclick = ui('ml-import-cancel').onclick = cancel;
 ui('ml-import-dialog').oncancel = e => { e.preventDefault(); cancel(); };

 function pendingRows() {
  const query = normalizeQuery(ui('ml-pending-search').value.trim());
  return (state.pendingProducts ?? []).filter(p => normalizeQuery(p.item.title + ' ' + p.item.itemId + ' ' + (p.item.skus ?? []).join(' ')).includes(query));
 }
 function renderPending() {
  const result = pendingRows(), total = state.pendingProducts?.length ?? 0;
  ui('ml-pending-panel').classList.toggle('hidden', !total);
  ui('ml-pending-count').textContent = total + ' anúncio(s) sem custo informado';
  pendingPage = Math.min(pendingPage, Math.max(0, Math.ceil(result.length / PAGE_SIZE) - 1));
  ui('ml-pending-list').innerHTML = result.slice(pendingPage * PAGE_SIZE, (pendingPage + 1) * PAGE_SIZE).map(p => {
   const fresh=!globalThis.ConduzMlDataRules||ConduzMlDataRules.fresh(p.item),closed=p.item.status==='closed',removed=p.item.availability==='unavailable'||closed;
   return '<article class="ml-pending-card"><span class="ml-import-badge">'+(closed?'Anúncio encerrado':removed?'Anúncio indisponível':fresh?'Custo pendente':'Aguardando atualização')+'</span><h3>' + escapeHTML(closed?'Anúncio encerrado':fresh?p.item.title:removed?'Anúncio indisponível no Mercado Livre':'Anúncio aguardando atualização') + '</h3><p>' + escapeHTML(p.item.itemId) + '</p><p>Preço anunciado: ' + (fresh?value(p.item.price):'Sem dados atuais') + '</p><p class="help">' + (fresh&&p.item.variationCount ? p.item.variationCount + ' variações: confira preço e custo da unidade escolhida.' : 'Custo e lucro: sem dados suficientes.') + '</p><button class="btn quiet" type="button" data-complete-pending="' + escapeHTML(p.id) + '" '+(removed?'disabled':'')+'>Concluir cadastro</button></article>';
  }).join('') || '<p class="help">Nenhuma pendência corresponde à busca.</p>';
  ui('ml-pending-page').textContent = result.length ? (pendingPage * PAGE_SIZE + 1) + '–' + Math.min((pendingPage + 1) * PAGE_SIZE, result.length) + ' de ' + result.length : '0 resultados';
  ui('ml-pending-prev').disabled = pendingPage === 0; ui('ml-pending-next').disabled = (pendingPage + 1) * PAGE_SIZE >= result.length;
 }
 api.renderPending = renderPending;
 ui('ml-pending-search').oninput = () => { pendingPage = 0; renderPending(); };
 ui('ml-pending-prev').onclick = () => { pendingPage--; renderPending(); }; ui('ml-pending-next').onclick = () => { pendingPage++; renderPending(); };
 ui('ml-pending-list').onclick = e => {
  const id = e.target.closest('button')?.dataset.completePending, pending = (state.pendingProducts ?? []).find(p => p.id === id);
  if (!pending) return;
  if (!mlConnection.connected || pending.item.sellerId !== mlConnection.account?.id) { toast('Conecte a conta desta pendência para concluir o cadastro.'); return; }
  if (state.products.some(p => p.mercadoLivre && itemKey(p.mercadoLivre) === itemKey(pending.item))) { toast('Este anúncio já possui cadastro. Confira o produto existente antes de continuar.'); return; }
  openProduct({ name: pending.item.title.slice(0, 120), category: pending.item.categoryName ?? pending.item.categoryId ?? 'Mercado Livre', cost: '', weight: pending.item.weight ?? '', margin: pending.margin, extra: 0, adsMl: 0, adsShopee: 0, mlShipping: pending.item.shippingQuote?.amount ?? 0, mercadoLivre: copyMlLink(pending.item), feeSnapshot: copyFees(pending.feeSnapshot) });
  ui('dialog-title').textContent = 'Concluir cadastro pendente'; ui('ml-auto-fees').checked = true;
  ui('ml-product-status').textContent = pending.item.variationCount ? 'Confira preço, peso e custo da variação escolhida. O anúncio tem várias variações e a referência de preço é do anúncio.' : 'Informe o custo de compra e confira peso, margem e impostos. A pendência será concluída somente ao salvar um cadastro válido.';
  renderAutoPricing(); scheduleOfficialPricing();
  importMlItem(pending.item.itemId);
 };
 renderPending();
})();
