// Service worker do FarmaControl — propositalmente MÍNIMO.
// Serve só para o navegador reconhecer o app como instalável e para mostrar uma tela amigável quando
// o aparelho está sem internet. NÃO guarda o app em cache: o FarmaControl se atualiza sozinho
// (window.__FC_VERSION em index.html) e um cache aqui poderia prender aparelhos numa versão velha.
// Se um dia for preciso remover: apague este arquivo e o registro em index.html; os aparelhos
// desregistram sozinhos no próximo acesso (ver o bloco de registro).
var VERSAO = 'fc-offline-1';
var OFFLINE_URL = '/offline.html';
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) { return c.add(new Request(OFFLINE_URL, { cache: 'reload' })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSAO; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.mode !== 'navigate') return; // tudo o mais segue direto para a rede, como sempre
  e.respondWith(fetch(r).catch(function () { return caches.match(OFFLINE_URL); }));
});
