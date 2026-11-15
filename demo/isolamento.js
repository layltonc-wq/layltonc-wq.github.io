/* Carregado PRIMEIRO na página de demonstração. Garante que a demonstração nunca mistura com o sistema real:
 *  - localStorage/sessionStorage passam a usar o prefixo "demo:" (o app real, no mesmo endereço, não enxerga nada daqui);
 *  - marca window.__fcDemo para o index.html desligar service worker, aviso de "ambiente de teste", etc.
 */
(function () {
  'use strict';
  window.__fcDemo = true;
  function envolver(real) {
    var P = 'demo:';
    var api = {
      getItem: function (k) { return real.getItem(P + k); },
      setItem: function (k, v) { real.setItem(P + k, String(v)); },
      removeItem: function (k) { real.removeItem(P + k); },
      clear: function () { Object.keys(real).filter(function (k) { return k.indexOf(P) === 0; }).forEach(function (k) { real.removeItem(k); }); },
      key: function (i) { var ks = Object.keys(real).filter(function (k) { return k.indexOf(P) === 0; }); return ks[i] ? ks[i].slice(P.length) : null; }
    };
    Object.defineProperty(api, 'length', { get: function () { return Object.keys(real).filter(function (k) { return k.indexOf(P) === 0; }).length; } });
    return api;
  }
  try {
    var ls = envolver(window.localStorage), ss = envolver(window.sessionStorage);
    Object.defineProperty(window, 'localStorage', { get: function () { return ls; }, configurable: true });
    Object.defineProperty(window, 'sessionStorage', { get: function () { return ss; }, configurable: true });
  } catch (e) { /* sem armazenamento: a demonstração segue em memória */ }
})();
