/* Catálogo compartilhado. Não altera fórmulas nem consultas dos marketplaces. */
(function () {
 'use strict';
 const copy = x => JSON.parse(JSON.stringify(x));
 function stable(x, ignoreDates = false) {
  if (Array.isArray(x)) return x.map(v => stable(v, ignoreDates));
  if (!x || typeof x !== 'object') return x;
  return Object.fromEntries(Object.keys(x).sort().filter(k => !ignoreDates || k !== 'fetchedAt').map(k => [k, stable(x[k], ignoreDates)]));
 }
 const equal = (a, b, ignoreDates = false) => JSON.stringify(stable(a, ignoreDates)) === JSON.stringify(stable(b, ignoreDates));
 function merge(base, local, remote, choices = {}) {
  const conflicts = [], data = { products: [], kits: [], fees: null };
  function choose(key, before, mine, theirs, label) {
   if (equal(mine, before)) return theirs;
   if (equal(theirs, before) || equal(mine, theirs)) return mine;
   // Datas de consulta diferentes não tornam números iguais em conflito financeiro.
   if (equal(mine, theirs, true)) return theirs;
   if (choices[key] === 'local') return mine;
   if (choices[key] === 'remote') return theirs;
   conflicts.push({ key, label, local: mine, remote: theirs });
   return theirs;
  }
  data.fees = choose('fees', base.fees, local.fees, remote.fees, 'Configurações de taxas');
  for (const type of ['products', 'kits']) {
   const maps = [base, local, remote].map(x => new Map(x[type].map(row => [row.id, row])));
   const ids = new Set([...maps[2].keys(), ...maps[1].keys(), ...maps[0].keys()]);
   for (const id of ids) {
    const [before, mine, theirs] = maps.map(m => m.get(id));
    const row = choose(type + ':' + id, before, mine, theirs, (mine ?? theirs ?? before).name);
    if (row !== undefined) data[type].push(row);
   }
  }
  return { data, conflicts };
 }
 globalThis.ConduzCatalogMerge = { merge, equal };
 if (typeof document === 'undefined' || !document.getElementById('cloud-catalog')) return;

 const ui = id => document.getElementById(id);
 let seller = null, meta = null, phase = 'off', busy = false, timer, review = null, reviewSnapshot = null, epoch = 0, activeSync = null, localProblem = false;
 const cacheKey = () => 'conduz.catalog.sync.v1.' + seller;
 const snapshot = () => {
  const data = backupData(state);
  return { products: data.products, kits: data.kits, fees: data.fees };
 };
 function saveMeta() { try { localStorage.setItem(cacheKey(), JSON.stringify(meta)); } catch { /* A versão confirmada permanece na nuvem. */ } }
 function status(message, pending = false) {
  ui('cloud-catalog-status').textContent = message + (localProblem ? ' A cópia local não pôde ser gravada; confira o armazenamento do navegador.' : '');
  ui('cloud-sync').disabled = !seller || ['off', 'review'].includes(phase) || busy;
  ui('cloud-review').classList.toggle('hidden', phase !== 'review');
  if (seller && phase !== 'off') ui('save-status').textContent = pending ? '● Alterações aguardando sincronização' : '● Catálogo compartilhado';
 }
 function localWrite() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); localProblem = false; return true; }
  catch { localProblem = true; return false; }
 }
 function valid(data) { return data && validState({ ...state, ...data }); }
 function apply(data) {
  if (!valid(data)) throw Error('O catálogo contém uma combinação inválida de produtos e kits. Confira as dependências antes de combinar.');
  state = { ...state, ...copy(data) }; localWrite(); render();
 }
 function editingDraft() { return Boolean(ui('product-dialog').open || ui('restore-dialog').open || ui('import-dialog').open || kitEditing || kitItems.size); }
 async function request(method = 'GET', body, revision) {
  const response = await fetch('/api/catalog', {
   method, credentials: 'same-origin', cache: 'no-store',
   headers: { ...(method === 'PUT' ? { 'Content-Type': 'application/json', 'X-Conduz-Action': 'catalog' } : {}), ...(revision > 0 ? { 'If-None-Match': '"' + revision + '"' } : {}) },
   ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000)
  });
  if (response.status === 304) return null;
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.message || 'Não foi possível sincronizar o catálogo.'), { status: response.status });
  if (method === 'GET' && (value.data !== null && !valid(value.data) || !Number.isSafeInteger(value.revision) || value.revision < 0)) throw Error('O catálogo compartilhado retornou dados incompatíveis. A cópia local foi preservada.');
  return value;
 }
 function beginReview(base, remote, revision, migration = false) {
  review = { base: copy(base), remote: copy(remote), revision, migration };
  phase = 'review'; status(migration ? 'Escolha como iniciar o catálogo compartilhado com os cadastros deste navegador.' : 'Há alterações simultâneas no mesmo cadastro. Clique em Revisar alterações.', true);
 }
 function openReview() {
  if (!review) return;
  reviewSnapshot = snapshot();
  const result = merge(review.base, reviewSnapshot, review.remote);
  ui('cloud-review-intro').textContent = review.migration
   ? 'Neste navegador: ' + reviewSnapshot.products.length + ' produto(s) e ' + reviewSnapshot.kits.length + ' kit(s). Na empresa: ' + review.remote.products.length + ' produto(s) e ' + review.remote.kits.length + ' kit(s). Combinar mantém cadastros distintos; nomes iguais com identificadores diferentes podem gerar duplicatas.'
   : 'As alterações em cadastros diferentes são combinadas. Para cada cadastro abaixo, escolha a versão que deve permanecer.';
  const describe = row => row === undefined ? 'Cadastro excluído' : row.cost !== undefined ? row.name + ' · custo ' + money(row.cost) + ' · meta ' + number(row.margin) + '% · Ads ML ' + number(adsRate(row, 'ml')) + '% / Shopee ' + number(adsRate(row, 'shopee')) + '%' : row.items ? row.name + ' · ' + row.items.length + ' componente(s) · meta ' + number(row.margin) + '%' : 'Configurações de taxas preservadas';
  ui('cloud-review-options').innerHTML = result.conflicts.map((c, i) => '<fieldset class="cloud-conflict"><legend>' + escapeHTML(c.label) + '</legend><label><input type="radio" name="cloud-choice-' + i + '" value="local" required> Minha edição: ' + escapeHTML(describe(c.local)) + '</label><label><input type="radio" name="cloud-choice-' + i + '" value="remote" required> Versão da empresa: ' + escapeHTML(describe(c.remote)) + '</label></fieldset>').join('');
  ui('cloud-use-remote').textContent = 'Usar somente o catálogo da empresa';
  ui('cloud-use-remote').classList.remove('hidden');
  ui('cloud-apply-merge').textContent = review.migration ? 'Combinar e sincronizar' : 'Salvar escolhas e sincronizar';
  ui('cloud-review-error').textContent = '';
  if (!ui('cloud-review-dialog').open) ui('cloud-review-dialog').showModal();
 }
 function queue() {
  if (!seller || phase !== 'ready') return;
  clearTimeout(timer); timer = setTimeout(() => sync(), 800);
 }
 async function sync() {
  if (busy || !seller || phase !== 'ready') return;
  busy = true; const account = seller, generation = epoch, task = {}; activeSync = task;
  try {
   const local = snapshot(), changed = !equal(local, meta.base);
   status(changed ? 'Salvando alterações na empresa…' : 'Conferindo catálogo compartilhado…', changed);
   const result = await request('GET', null, changed ? 0 : meta.revision);
   if (account !== seller || generation !== epoch) return;
   if (!result) { const pending = !equal(snapshot(), meta.base); status(pending ? 'Novas alterações locais aguardando sincronização.' : 'Catálogo sincronizado com a empresa.', pending); return; }
   const remote = result.data ?? { products: [], kits: [], fees: local.fees };
   // A revisão é calculada com o estado mais recente, inclusive mudanças durante a consulta.
   const live = snapshot(), combined = merge(meta.base, live, remote);
   if (combined.conflicts.length) { beginReview(meta.base, remote, result.revision); return; }
   if (!valid(combined.data)) { beginReview(meta.base, remote, result.revision); return; }
   if (editingDraft() && !equal(live, combined.data)) { status('Há uma atualização da empresa. Termine ou cancele o cadastro em edição para recebê-la.', !equal(live, meta.base)); return; }
   if (equal(combined.data, remote)) {
    apply(combined.data); meta = { revision: result.revision, base: copy(remote) }; saveMeta(); status('Catálogo sincronizado com a empresa.'); return;
   }
   const beforeWrite = snapshot();
   const saved = await request('PUT', { revision: result.revision, mutationId: crypto.randomUUID(), data: combined.data });
   if (account !== seller || generation !== epoch) return;
   meta = { revision: saved.revision, base: copy(combined.data) }; saveMeta();
   // Não substitui edições feitas enquanto a gravação estava em andamento.
   const rebased = merge(beforeWrite, snapshot(), combined.data);
   if (rebased.conflicts.length || !valid(rebased.data)) { beginReview(beforeWrite, combined.data, saved.revision); return; }
   apply(rebased.data);
   const pending = !equal(snapshot(), meta.base);
   status(pending ? 'Primeira gravação confirmada; salvando as alterações seguintes…' : 'Catálogo sincronizado com a empresa.', pending);
  } catch (error) {
   if (account !== seller || generation !== epoch) return;
   if (error.status === 401 || error.status === 403) { phase = 'off'; status(error.message + ' A cópia local foi mantida.', true); }
   else status(error.status === 409 ? 'Outro funcionário salvou uma alteração. Vamos conferir a nova versão.' : error.message + ' Alterações locais aguardam nova tentativa.', true);
  } finally {
   if (activeSync === task) busy = false;
   if (account === seller && generation === epoch && phase === 'ready') {
    ui('cloud-sync').disabled = false;
    if (!equal(snapshot(), meta.base)) { clearTimeout(timer); timer = setTimeout(() => sync(), 15000); }
   }
  }
 }
 async function connect(connection) {
  const generation = ++epoch;
  clearTimeout(timer); seller = null; meta = null; phase = 'off'; review = null; busy = false; activeSync = null;
  if (!connection.connected) { status('Conecte o Mercado Livre para acessar o catálogo da empresa.'); return; }
  try {
   const response = await fetch('/api/catalog/status', { credentials: 'same-origin', cache: 'no-store' });
   const configuration = response.ok ? await response.json() : null;
   if (generation !== epoch) return;
   if (!configuration?.configured) { status('Catálogo compartilhado aguardando configuração. Seus dados continuam salvos neste navegador.'); return; }
   seller = String(connection.account.id); const account = seller;
   const result = await request();
   if (seller !== account || generation !== epoch) return;
   let cached, localSourceValid = false;
   try { cached = JSON.parse(localStorage.getItem(cacheKey())); localSourceValid = validState(JSON.parse(localStorage.getItem(KEY))); } catch {}
   // Uma cópia local ausente ou corrompida não representa exclusão de toda a empresa.
   if (localSourceValid && cached && Number.isSafeInteger(cached.revision) && cached.revision <= result.revision && valid(cached.base)) {
    meta = cached; phase = 'ready'; await sync(); return;
   }
   const local = snapshot(), remote = result.data ?? { products: [], kits: [], fees: local.fees };
   if (local.products.length || local.kits.length) {
    // Não envia nem substitui cadastros locais antes da escolha inicial.
    beginReview({ products: [], kits: [], fees: remote.fees }, remote, result.revision, true); return;
   }
   apply(remote); meta = { revision: result.revision, base: copy(remote) }; saveMeta(); phase = 'ready'; status('Catálogo compartilhado carregado.');
  } catch (error) { if (generation === epoch) { phase = 'off'; status(error.message + ' A cópia local foi mantida.'); } }
 }
 function confirmReview(remoteOnly = false) {
  if (!review) return;
  if (!equal(snapshot(), reviewSnapshot)) { openReview(); ui('cloud-review-error').textContent = 'Os dados locais mudaram. Confira novamente as opções.'; return; }
  const initial = merge(review.base, reviewSnapshot, review.remote), choices = {};
  if (!remoteOnly) for (const [i, conflict] of initial.conflicts.entries()) {
   const value = ui('cloud-review-form').elements['cloud-choice-' + i]?.value;
   if (!value) { ui('cloud-review-error').textContent = 'Escolha uma versão para cada cadastro em conflito.'; return; }
   choices[conflict.key] = value;
  }
  const data = remoteOnly ? review.remote : merge(review.base, reviewSnapshot, review.remote, choices).data;
  if (!valid(data)) { ui('cloud-review-error').textContent = 'A escolha deixa um kit sem seus componentes. Confira as versões ou os produtos do kit.'; return; }
  try {
   // Guarda uma cópia anterior à primeira associação; não exige exportação manual.
   localStorage.setItem('conduz.catalog.before-sharing.' + seller, buildBackup(state));
   const base = copy(review.remote), revision = review.revision;
   apply(data); meta = { revision, base }; saveMeta(); review = null; phase = 'ready'; ui('cloud-review-dialog').close(); status('Escolha confirmada. Conferindo sincronização…', true); sync();
  } catch { ui('cloud-review-error').textContent = 'Não foi possível preservar a cópia local anterior. Libere espaço ou baixe um backup antes de continuar.'; }
 }
 ui('cloud-sync').onclick = () => sync();
 ui('cloud-review').onclick = openReview;
 ui('cloud-review-close').onclick = () => ui('cloud-review-dialog').close();
 ui('cloud-use-remote').onclick = () => confirmReview(true);
 ui('cloud-review-form').onsubmit = e => { e.preventDefault(); confirmReview(); };
 globalThis.ConduzCatalog = {
  connect,
  onLocalChange() { if (phase === 'ready') { status('Alteração salva neste navegador; aguardando sincronização.', true); queue(); } },
  disconnect() { epoch++; seller = null; phase = 'off'; meta = null; review = null; busy = false; activeSync = null; clearTimeout(timer); ui('cloud-review-dialog').close(); status('Conexão encerrada. A cópia local foi mantida.'); },
  sync
 };
 globalThis.addEventListener?.('online', () => sync());
 globalThis.addEventListener?.('focus', () => { if (!editingDraft()) sync(); });
 globalThis.setInterval?.(() => { if (!document.hidden && !editingDraft()) sync(); }, 60000);
 status('Conecte o Mercado Livre para acessar o catálogo da empresa.');
})();
