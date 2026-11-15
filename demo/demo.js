/* Orquestra a demonstração: escolha do perfil -> banco simulado com dados fictícios -> app real (app.js).
 * Tudo roda no navegador; nada vai para o banco da prefeitura. Recarregar a página mantém as mudanças da sessão;
 * "Reiniciar" volta ao começo.
 */
(function () {
  'use strict';
  var ARMAZ = 'store';
  var seed = window.FCDemoSeed, PERFIS = seed.PERFIS;
  function guardado(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function guardar(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function apagar(k) { try { window.localStorage.removeItem(k); } catch (e) {} }

  function el(tag, attrs, kids) {
    var e = document.createElement(tag); attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) { var v = attrs[k]; if (v == null || v === false) return; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); });
    (kids || []).forEach(function (c) { if (c != null && c !== false) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var CSS = '#fcd-esc{position:fixed;inset:0;z-index:30000;background:linear-gradient(160deg,#0A2D6E 0%,#1351B4 60%,#0C7B4A 100%);overflow:auto;display:flex;justify-content:center;padding:max(20px,env(safe-area-inset-top,0px)) 16px 40px;font-family:"Segoe UI",system-ui,sans-serif}' +
    '#fcd-esc .in{width:100%;max-width:520px;margin:auto}#fcd-esc .logo{width:56px;height:56px;border-radius:16px;background:#fff;color:#0A2D6E;font:900 22px Georgia,serif;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}' +
    '#fcd-esc h1{color:#fff;text-align:center;font-size:22px;margin:0 0 4px}#fcd-esc p.s{color:rgba(255,255,255,.8);text-align:center;margin:0 0 20px;font-size:14px;line-height:1.45}' +
    '#fcd-esc button.pf{display:block;width:100%;text-align:left;background:#fff;border:0;border-radius:16px;padding:14px 16px;margin-bottom:10px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.18)}' +
    '#fcd-esc button.pf b{display:block;font-size:15px;color:#0B1736}#fcd-esc button.pf span{font-size:12.5px;color:#475569;line-height:1.4}' +
    '#fcd-esc .nota{color:rgba(255,255,255,.75);font-size:12px;text-align:center;margin-top:14px;line-height:1.5}' +
    '#fcd-tarja{background:#F59E0B;color:#78350F;font:700 12.5px "Segoe UI",system-ui,sans-serif;text-align:center;padding:7px 12px;position:relative;z-index:10}' +
    '#fcd-btn{position:fixed;left:max(12px,env(safe-area-inset-left,0px));bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:20000;background:#0B1736;color:#fff;border:0;border-radius:99px;padding:10px 14px;font:700 12.5px "Segoe UI",system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.3);cursor:pointer}' +
    '#fcd-pan{position:fixed;left:max(12px,env(safe-area-inset-left,0px));bottom:calc(132px + env(safe-area-inset-bottom,0px));z-index:20000;background:#fff;color:#0B1736;border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.35);padding:12px;width:min(300px,calc(100vw - 24px));font:13px "Segoe UI",system-ui,sans-serif}' +
    '#fcd-pan h4{margin:0 0 8px;font-size:13px}#fcd-pan button{display:block;width:100%;text-align:left;border:1px solid #E2E8F0;background:#F8FAFC;border-radius:10px;padding:9px 11px;margin-bottom:6px;font:600 12.5px "Segoe UI",system-ui,sans-serif;color:#1E293B;cursor:pointer}' +
    '#fcd-pan button.sec{background:#fff}#fcd-pan hr{border:0;border-top:1px solid #E2E8F0;margin:8px 0}' +
    '#fcd-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(150px + env(safe-area-inset-bottom,0px));z-index:30001;background:#0B7A5F;color:#fff;border-radius:12px;padding:10px 16px;font:700 13px "Segoe UI",system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:90vw;text-align:center}';
  var st = el('style'); st.textContent = CSS; document.head.appendChild(st);

  function escolher() {
    var cards = Object.keys(PERFIS).map(function (k) { var p = PERFIS[k]; return el('button', { class: 'pf', type: 'button', 'data-perfil': k, onclick: function () { guardar('perfil', k); apagar(ARMAZ); location.reload(); } }, [el('b', { text: p.rotulo }), el('span', { text: p.desc })]); });
    document.body.appendChild(el('div', { id: 'fcd-esc' }, [el('div', { class: 'in' }, [el('div', { class: 'logo', text: 'FC' }), el('h1', { text: 'Demonstração do FarmaControl' }), el('p', { class: 's', text: 'Teste o sistema de verdade, com dados fictícios. Escolha quem você quer ser:' })].concat(cards).concat([el('div', { class: 'nota', text: 'Tudo o que você fizer aqui fica só neste aparelho e não altera nenhum dado real. Dá para trocar de perfil e reiniciar a qualquer momento.' })]))]));
  }
  function toast(t) { var x = el('div', { id: 'fcd-toast', text: t }); document.body.appendChild(x); setTimeout(function () { if (x.parentNode) x.parentNode.removeChild(x); }, 3500); }

  var perfilId = guardado('perfil');
  if (!perfilId || !PERFIS[perfilId]) { escolher(); return; }

  // ----- banco simulado (restaura a sessão ou cria dados novos) -----
  var base = null;
  try { var salvo = guardado(ARMAZ); if (salvo) base = { store: JSON.parse(salvo) }; } catch (e) { base = null; }
  var dados = seed.criar(perfilId);
  var store = base ? base.store : dados.store;
  var timer = null;
  function persistir() { clearTimeout(timer); timer = setTimeout(function () { try { guardar(ARMAZ, JSON.stringify(store)); } catch (e) {} }, 400); }
  var fb = window.FCFake.install({ store: store, uid: dados.user.uid, tenant: dados.tenant, user: dados.user, onChange: persistir, onSignOut: function () { apagar('perfil'); apagar(ARMAZ); setTimeout(function () { location.reload(); }, 50); } });
  // o usuário logado reflete sempre o perfil escolhido (cargo/local), mesmo ao restaurar a sessão
  store.users[dados.user.uid] = Object.assign({}, store.users[dados.user.uid] || {}, { name: dados.user.name, role: dados.user.role, status: 'approved', tenant_id: dados.tenant, acessoLocal: dados.user.acessoLocal, somenteLeitura: dados.user.somenteLeitura });
  guardar('fc_user', JSON.stringify(dados.user));
  try { guardar('fc_local', 'caf'); } catch (e) {}

  // ----- tarja e menu da demonstração -----
  document.body.insertBefore(el('div', { id: 'fcd-tarja', text: 'DEMONSTRAÇÃO — dados fictícios · você está como ' + PERFIS[perfilId].rotulo }), document.body.firstChild);
  var aberto = false, painel = null;
  function fecharPainel() { if (painel && painel.parentNode) painel.parentNode.removeChild(painel); painel = null; aberto = false; }
  var UB = seed.simular.UBS;
  function simularUbs() {
    var S = store, n = Object.keys(S.ubs_solicitacoes).length + 1, prot = 'UBS-DEMO-' + String(1000 + n);
    var meds = Object.keys(S.medicamentos).filter(function (k) { return S.medicamentos[k].categoria === 'medicamento'; });
    var escolha = [meds[1], meds[5], meds[12]].map(function (k, i) { var m = S.medicamentos[k]; return { id: 'x' + i, medId: k, nome: m.nome, qtdSolicitada: [120, 200, 300][i], obs: '', foraDaLista: false, justificativa: '', qtdAprovada: null, qtdSeparada: 0, obsFarm: '' }; });
    var agora = new Date().toISOString();
    window.__fakeDb.collection('ubs_solicitacoes').add({ tenant_id: dados.tenant, ubsId: 'ubs5', ubsNome: UB[4], periodoId: 'p1', periodoNome: 'Semana atual', periodoInicio: agora.slice(0, 10), periodoFim: agora.slice(0, 10), protocolo: prot, enfermeira: 'Enfermeira Cláudia (simulada)', itens: escolha, obs: 'Pedido simulado para a demonstração.', status: 'enviada', obsFarm: '', historico: [{ em: agora, acao: 'enviada', por: 'Enfermeira Cláudia', obs: '' }], criadoEm: agora, atualizadoEm: agora }).then(function () { toast('Chegou um pedido da ' + UB[4] + ' (' + prot + '). Veja em Solicitações das UBS.'); });
  }
  function simularRepo() {
    var S = store, ks = Object.keys(S.medicamentos).filter(function (k) { return S.medicamentos[k].categoria === 'medicamento'; });
    var agora = new Date().toISOString();
    var itens = [ks[3], ks[8]].map(function (k, i) { var m = S.medicamentos[k]; return { id: 's' + i + k, medId: k, nome: m.nome, qtdSolicitada: [150, 100][i], qtdTransferida: 0, obsCaf: '' }; });
    window.__fakeDb.collection('reposicoes').add({ tenant_id: dados.tenant, status: 'pendente', itens: itens, obs: '', solicitanteId: 'demo-sat', solicitanteNome: 'Auxiliar do Satélite (demonstração)', historico: [{ em: agora, acao: 'enviado', por: 'Satélite', obs: '' }], criadoEm: agora, atualizadoEm: agora, obsCaf: '' }).then(function () { toast('O Satélite pediu reposição ao CAF. Veja em Transferência.'); });
  }
  function abrirPainel() {
    if (aberto) { fecharPainel(); return; }
    aberto = true;
    var itens = [el('h4', { text: 'Menu da demonstração' }),
      el('button', { type: 'button', 'data-demo': 'sim-ubs', text: '📨 Simular: enfermeira de UBS envia um pedido', onclick: function () { fecharPainel(); simularUbs(); } }),
      el('button', { type: 'button', 'data-demo': 'sim-repo', text: '🔁 Simular: Satélite pede reposição ao CAF', onclick: function () { fecharPainel(); simularRepo(); } }),
      el('hr')];
    Object.keys(PERFIS).filter(function (k) { return k !== perfilId; }).forEach(function (k) { itens.push(el('button', { type: 'button', class: 'sec', 'data-demo': 'perfil-' + k, text: 'Entrar como ' + PERFIS[k].rotulo, onclick: function () { guardar('perfil', k); location.reload(); } })); });
    itens.push(el('hr'));
    itens.push(el('button', { type: 'button', class: 'sec', 'data-demo': 'reiniciar', text: '↺ Reiniciar a demonstração (dados originais)', onclick: function () { apagar(ARMAZ); location.reload(); } }));
    itens.push(el('button', { type: 'button', class: 'sec', 'data-demo': 'escolher', text: '← Escolher outro perfil do zero', onclick: function () { apagar('perfil'); apagar(ARMAZ); location.reload(); } }));
    painel = el('div', { id: 'fcd-pan' }, itens);
    document.body.appendChild(painel);
  }
  document.body.appendChild(el('button', { id: 'fcd-btn', type: 'button', 'data-demo': 'menu', text: '⋮ Demonstração', onclick: abrirPainel }));

  // ----- carrega o app real -----
  var s = document.createElement('script'); s.src = window.__fcAppSrc; document.body.appendChild(s);
})();
