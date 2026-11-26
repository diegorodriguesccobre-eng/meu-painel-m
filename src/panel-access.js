/* Entrada pelo OAuth existente. Apelido e função são identificações autodeclaradas. */
(function () {
 'use strict';
 const ui = id => document.getElementById(id);
 if (!ui('access-screen')) return;
 const roles = { colaborador: 'Colaborador', administrador: 'ADM', dono: 'Dono', analista: 'Analista' };
 let expiryTimer;
 const permitted = c => Boolean(c?.connected && (c.accessRequired === false || c.accessGranted && c.profile));
 function gate(open) {
  ui('access-screen').classList.toggle('hidden', open);
  ui('app-shell').classList.toggle('hidden', !open);
  ui('app-shell').inert = !open;
  ui('app-shell').setAttribute('aria-hidden', String(!open));
  if (!open) {
   if (typeof setSidebarOpen === 'function') setSidebarOpen(false, false);
   for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  }
 }
 function acceptConnection(connection) {
  clearTimeout(expiryTimer);
  const connected = Boolean(connection.connected), allowed = permitted(connection);
  ui('access-connect').disabled = !connection.configured;
  ui('access-connect').classList.toggle('hidden', connected);
  ui('access-change-account').classList.toggle('hidden', !connected);
  ui('access-identification').disabled = !connected;
  ui('access-proceed').disabled = !connected;
  ui('access-account').textContent = connected ? 'Conta conectada: ' + connection.account.nickname : connection.configured ? 'Entre com a conta do Mercado Livre da sua empresa.' : 'Conferindo a conexão do painel…';
  if (!allowed) { gate(false); ui('access-session').textContent = ''; ui('access-terms').checked = false; ui('access-privacy').checked = false; }
  if (connected && connection.profile) {
   ui('access-nickname').value = connection.profile.nickname;
   ui('access-role').value = connection.profile.role;
  }
  if (allowed && connection.expiresAt) expiryTimer = setTimeout(() => {
   mlConnection.connected = false; mlConnection.accessGranted = false;
   globalThis.ConduzCatalog?.disconnect(); renderMlConnection('Sua sessão expirou. Entre novamente.');
   ui('access-error').textContent = 'Sua sessão expirou. Entre novamente para continuar.';
  }, Math.max(0, Date.parse(connection.expiresAt) - Date.now()));
  return allowed;
 }
 function enterPanel(connection) {
  if (!permitted(connection) || String(connection.account?.id) !== activeCatalogAccount) return false;
  gate(true);
  const p = connection.profile;
  ui('access-session').textContent = p ? p.nickname + ' · ' + roles[p.role] : 'Conta da empresa';
  ui('access-error').textContent = '';
  return true;
 }
 async function signOut() {
  ui('access-error').textContent = '';
  try {
   await mlRequest('disconnect', { method: 'POST' });
   globalThis.ConduzCatalog?.disconnect(); mlLookupVersion++; mlAdsEpoch++; resetMlCatalog(); resetKitEditor();
   mlConnection = { configured: true, connected: false, account: null }; renderMlConnection();
   ui('access-form').reset(); ui('access-terms').checked = false; ui('access-privacy').checked = false;
   ui('access-nickname').value = ''; ui('access-role').value = '';
   ui('access-connect').focus();
  } catch (error) { ui('access-error').textContent = error.message; toast(error.message); }
 }
 globalThis.ConduzAccess = { acceptConnection, enterPanel, showError: text => { ui('access-error').textContent = text; } };
 ui('access-connect').onclick = () => connectMercadoLivre();
 ui('access-change-account').onclick = ui('access-signout').onclick = signOut;
 ui('access-form').onsubmit = async e => {
  e.preventDefault();
  if (!mlConnection.connected) { ui('access-error').textContent = 'Entre no Mercado Livre antes de prosseguir.'; return; }
  if (!ui('access-form').reportValidity()) return;
  ui('access-proceed').disabled = true; ui('access-proceed').textContent = 'Entrando…'; ui('access-error').textContent = '';
  try {
   await mlRequest('access', { method: 'POST', body: { nickname: ui('access-nickname').value.trim(), role: ui('access-role').value,
    acceptedTerms: ui('access-terms').checked, acceptedPrivacy: ui('access-privacy').checked,
    termsVersion: mlConnection.policyVersion, privacyVersion: mlConnection.policyVersion } });
   await initializeMercadoLivre();
  } catch (error) { ui('access-error').textContent = error.message; }
  finally { ui('access-proceed').disabled = !mlConnection.connected; ui('access-proceed').textContent = 'Prosseguir'; }
 };
 gate(false);
})();
