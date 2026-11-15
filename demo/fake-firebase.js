/* Firebase "de mentirinha", 100% dentro do navegador (sem rede, sem banco real).
 *
 * Serve a dois usos:
 *  1) Ambiente de demonstração (demo/): o FarmaControl roda de verdade, mas lê e grava aqui, nunca no banco da prefeitura.
 *  2) Testes automáticos (tests/): rodam o app inteiro contra este banco simulado.
 *
 * Implementa só o que o app usa: Firestore (collection/doc/where/orderBy/limit/startAfter/get/onSnapshot/add/set/update/
 * delete/batch/runTransaction, FieldValue.*) e Auth (usuário fixo). Também simula a Cloud Function que mantém
 * medicamentos.estoqueAtual e estoqueLocal.satelite a cada lançamento (mesma regra de functions/index.js).
 *
 * Uso: FCFake.install({store, uid, tenant, onChange(store)})  -> define window.firebase
 */
(function () {
  'use strict';
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  var OP = '__fcop';

  function install(o) {
    var S = o.store || {};
    var seq = 0, listeners = [], pending = false;
    function col(n) { return S[n] || (S[n] = {}); }
    function notify() {
      if (o.onChange) { try { o.onChange(S); } catch (e) {} }
      listeners.slice().forEach(function (l) { l.run(); });
    }
    function novoId() { seq++; return 'd' + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 5); }

    // ----- Cloud Function simulada (mesma regra de functions/index.js) -----
    function efeito(d) {
      if (!d || !d.medicamentoId) return null;
      var sat = d.local === 'satelite';
      if (d.tipo === 'entrada') { if (d.divergenciaTipo === 'nota') return null; return { id: d.medicamentoId, delta: Number(d.quantidade) || 0, sat: sat }; }
      if (d.tipo === 'saida') { if (d.ficticioDiv) return null; return { id: d.medicamentoId, delta: -(Number(d.quantidade) || 0), sat: sat }; }
      return null;
    }
    function fnEntry(antes, depois) {
      if (o.semFuncoes) return;
      var m = col('medicamentos');
      [[efeito(antes), -1], [efeito(depois), 1]].forEach(function (p) {
        var e = p[0], s = p[1]; if (!e) return;
        var d = m[e.id]; if (!d) return;
        d.estoqueAtual = (d.estoqueAtual || 0) + s * e.delta;
        if (e.sat) { d.estoqueLocal = d.estoqueLocal || {}; d.estoqueLocal.satelite = (d.estoqueLocal.satelite || 0) + s * e.delta; }
      });
    }

    // ----- FieldValue -----
    function aplicarCampo(doc, path, val) {
      var ps = path.split('.'), c = doc;
      for (var i = 0; i < ps.length - 1; i++) { if (typeof c[ps[i]] !== 'object' || c[ps[i]] === null) c[ps[i]] = {}; c = c[ps[i]]; }
      var k = ps[ps.length - 1];
      if (val && typeof val === 'object' && val[OP]) {
        var t = val[OP];
        if (t === 'inc') c[k] = (Number(c[k]) || 0) + val.n;
        else if (t === 'del') delete c[k];
        else if (t === 'ts') c[k] = val.v;
        else if (t === 'au') { var a = Array.isArray(c[k]) ? c[k] : []; val.items.forEach(function (it) { if (!a.some(function (x) { return JSON.stringify(x) === JSON.stringify(it); })) a.push(it); }); c[k] = a; }
        else if (t === 'ar') { var b = Array.isArray(c[k]) ? c[k] : []; c[k] = b.filter(function (x) { return !val.items.some(function (it) { return JSON.stringify(x) === JSON.stringify(it); }); }); }
      } else c[k] = clone(val);
    }
    function limpar(u) { // valores comuns são copiados; operações de campo ficam como estão
      var r = {}; Object.keys(u).forEach(function (k) { var v = u[k]; r[k] = (v && typeof v === 'object' && v[OP]) ? v : clone(v); }); return r;
    }
    function setDoc(n, id, data, merge) {
      var c = col(n), antes = c[id] ? clone(c[id]) : null;
      if (merge && c[id]) Object.keys(data).forEach(function (k) { aplicarCampo(c[id], k, data[k]); });
      else { c[id] = {}; Object.keys(data).forEach(function (k) { aplicarCampo(c[id], k, data[k]); }); }
      if (n === 'entries') fnEntry(antes, c[id]);
    }
    function updDoc(n, id, data) {
      var c = col(n); if (!c[id]) throw new Error('No document to update: ' + n + '/' + id);
      var antes = clone(c[id]);
      Object.keys(data).forEach(function (k) { aplicarCampo(c[id], k, data[k]); });
      if (n === 'entries') fnEntry(antes, c[id]);
    }
    function delDoc(n, id) { var c = col(n), antes = c[id] ? clone(c[id]) : null; delete c[id]; if (n === 'entries') fnEntry(antes, null); }

    // ----- referências -----
    function snapDoc(n, id) {
      var d = col(n)[id];
      return { id: id, exists: !!d, data: function () { return d ? clone(d) : undefined; }, get: function (f) { return d ? d[f] : undefined; }, ref: refDoc(n, id), metadata: { fromCache: false, hasPendingWrites: false } };
    }
    function refDoc(n, id) {
      var r = {
        id: id, path: n + '/' + id, parent: { id: n },
        get: function () { return Promise.resolve(snapDoc(n, id)); },
        onSnapshot: function (cb) { var l = { run: function () { cb(snapDoc(n, id)); } }; listeners.push(l); setTimeout(function () { l.run(); }, 0); return function () { listeners = listeners.filter(function (x) { return x !== l; }); }; },
        update: function (u) { try { updDoc(n, id, limpar(u)); } catch (e) { return Promise.reject(e); } notify(); return Promise.resolve(); },
        set: function (u, opt) { setDoc(n, id, limpar(u), !!(opt && opt.merge)); notify(); return Promise.resolve(); },
        delete: function () { delDoc(n, id); notify(); return Promise.resolve(); }
      };
      return r;
    }
    function query(n, q) {
      var o2 = {
        where: function (f, op, v) { return query(n, Object.assign({}, q, { f: (q.f || []).concat([[f, op, v]]) })); },
        orderBy: function (f, dir) { return query(n, Object.assign({}, q, { ord: f, dir: dir || 'asc' })); },
        limit: function (x) { return query(n, Object.assign({}, q, { lim: x })); },
        startAfter: function (x) { return query(n, Object.assign({}, q, { after: x })); },
        _snap: function () {
          var ids = Object.keys(col(n)).filter(function (id) {
            return (q.f || []).every(function (c) {
              var f = c[0], op = c[1], v = c[2]; var x = f === '__name__' ? id : col(n)[id][f];
              if (op === '==') return x === v; if (op === '>=') return x !== undefined && x >= v; if (op === '>') return x !== undefined && x > v;
              if (op === '<=') return x !== undefined && x <= v; if (op === '<') return x !== undefined && x < v;
              if (op === 'in') return v.indexOf(x) >= 0; if (op === 'array-contains') return Array.isArray(x) && x.indexOf(v) >= 0; return true;
            });
          });
          var campo = q.ord && q.ord !== '__name__' ? q.ord : null;
          ids.sort(function (a, b) { if (!campo) return a < b ? -1 : a > b ? 1 : 0; var x = col(n)[a][campo], y = col(n)[b][campo]; return x < y ? -1 : x > y ? 1 : (a < b ? -1 : 1); });
          if (q.dir === 'desc') ids.reverse();
          if (q.after) { var i = ids.indexOf(q.after.id); if (i >= 0) ids = ids.slice(i + 1); }
          ids = ids.slice(0, q.lim || 1e9);
          var docs = ids.map(function (id) { return snapDoc(n, id); });
          return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (fn) { docs.forEach(fn); }, docChanges: function () { return docs.map(function (d) { return { type: 'added', doc: d }; }); }, metadata: { fromCache: false, hasPendingWrites: false } };
        },
        get: function () { return Promise.resolve(o2._snap()); },
        onSnapshot: function (cb) { var l = { run: function () { cb(o2._snap()); } }; listeners.push(l); setTimeout(function () { l.run(); }, 0); return function () { listeners = listeners.filter(function (x) { return x !== l; }); }; },
        add: function (d) { var id = novoId(); setDoc(n, id, limpar(d), false); notify(); return Promise.resolve(refDoc(n, id)); },
        doc: function (id) { return refDoc(n, id || novoId()); }
      };
      return o2;
    }
    var fdb = {
      settings: function () {}, enablePersistence: function () { return Promise.resolve(); }, clearPersistence: function () { return Promise.resolve(); },
      collection: function (n) { return query(n, {}); },
      batch: function () {
        var ops = [];
        return {
          set: function (r, d, opt) { ops.push(function () { setDoc(r.parent.id, r.id, limpar(d), !!(opt && opt.merge)); }); return this; },
          update: function (r, d) { ops.push(function () { updDoc(r.parent.id, r.id, limpar(d)); }); return this; },
          delete: function (r) { ops.push(function () { delDoc(r.parent.id, r.id); }); return this; },
          commit: function () { try { ops.forEach(function (f) { f(); }); } catch (e) { return Promise.reject(e); } notify(); return Promise.resolve(); }
        };
      },
      runTransaction: function (fn) {
        var tx = { get: function (r) { return r.get(); }, set: function (r, d, opt) { setDoc(r.parent.id, r.id, limpar(d), !!(opt && opt.merge)); return tx; }, update: function (r, d) { updDoc(r.parent.id, r.id, limpar(d)); return tx; }, delete: function (r) { delDoc(r.parent.id, r.id); return tx; } };
        return Promise.resolve(fn(tx)).then(function (v) { notify(); return v; });
      }
    };
    var fu = {
      uid: o.uid, email: (o.user && o.user.email) || 'demo@example.com', displayName: (o.user && o.user.name) || '',
      getIdToken: function () { return Promise.resolve('demo'); },
      getIdTokenResult: function () { return Promise.resolve({ claims: { tenant_id: o.tenant } }); }
    };
    var fauth = {
      currentUser: fu,
      onAuthStateChanged: function (cb) { setTimeout(function () { cb(fu); }, 0); return function () {}; },
      onIdTokenChanged: function (cb) { setTimeout(function () { cb(fu); }, 0); return function () {}; },
      signOut: function () { if (o.onSignOut) o.onSignOut(); return Promise.resolve(); },
      signInWithEmailAndPassword: function () { return Promise.resolve({ user: fu }); },
      createUserWithEmailAndPassword: function () { return Promise.resolve({ user: fu }); },
      sendPasswordResetEmail: function () { return Promise.resolve(); }
    };
    var fb = {
      apps: [],
      initializeApp: function (c) { fb.apps.push({ options: c, delete: function () {} }); return fb.apps[fb.apps.length - 1]; },
      app: function () { return fb.apps[0]; },
      firestore: Object.assign(function () { return fdb; }, {
        FieldValue: {
          increment: function (n) { var v = {}; v[OP] = 'inc'; v.n = n; return v; },
          arrayUnion: function () { var v = {}; v[OP] = 'au'; v.items = Array.prototype.slice.call(arguments); return v; },
          arrayRemove: function () { var v = {}; v[OP] = 'ar'; v.items = Array.prototype.slice.call(arguments); return v; },
          delete: function () { var v = {}; v[OP] = 'del'; return v; },
          serverTimestamp: function () { var v = {}; v[OP] = 'ts'; v.v = new Date().toISOString(); return v; }
        },
        CACHE_SIZE_UNLIMITED: -1
      }),
      auth: function () { return fauth; }
    };
    window.firebase = fb; window.__fakeDb = fdb; window.__store = S; window.__notify = notify;
    window.__ls = { get length() { return listeners.length; }, forEach: function (f) { listeners.forEach(f); } };
    return { store: S, notify: notify, db: fdb };
  }
  window.FCFake = { install: install };
})();
