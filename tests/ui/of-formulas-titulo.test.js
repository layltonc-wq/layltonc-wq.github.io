// Ordem de Fornecimento de fórmulas: título "Fórmulas Nutricionais". (base: reimprimir (2ª via) um pedido já fechado, em Itaquitinga (Ordem de Fornecimento) e Vicência (pedido padrão).
const H = require('../lib/harness.js');
function seed(T, comOF) {
  const em = new Date(Date.now() - 3 * 864e5).toISOString();
  const of = comOF ? { ordemFornecimento: 'recurso_proprio' } : {};
  return { tenants: { [T]: { nome: T, ativo: true } },
    medicamentos: { m1: { nome: 'Dipirona 500mg comprimido', categoria: 'medicamento', estoqueAtual: 10, tenant_id: T }, m2: { nome: 'Amoxicilina 250mg', categoria: 'medicamento', estoqueAtual: 10, tenant_id: T } },
    entries: {},
    atas: { a1: { nome: 'Ata Fórmulas Nutricionais', categoria: 'leite', tenant_id: T, ordemFornecimentoContador: 3,
      itens: [
        Object.assign({ num: '1', descricao: 'Dipirona 500mg comprimido', medicamentoId: 'm1', qtdTeto: 1000, pedidoAcumulado: 500, vUnit: 0.1, unidade: 'CP' }, of),
        Object.assign({ num: '2', descricao: 'Amoxicilina 250mg', medicamentoId: 'm2', qtdTeto: 200, pedidoAcumulado: 100, vUnit: 5, unidade: 'FR' }, of)],
      historicoPedidos: [{ id: 'r1', em, deltas: [{ idx: 0, qtd: 500 }, { idx: 1, qtd: 100 }] }] } },
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {} };
}
async function abrir(br, T, comOF) {
  const user = { uid: 't1', name: 'Fulana Silva', role: 'tecnico' };
  const o = { store: seed(T, comOF), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  const r = await H.abrir(br, o);
  await r.pg.waitForSelector('[data-tour="nav-menu"]', { timeout: 15000 });
  await r.pg.evaluate(() => { const ap = Node.prototype.appendChild; Node.prototype.appendChild = function (n) { const x = ap.call(this, n); if (n && n.tagName === 'IFRAME') { const d = n.contentWindow.document; const w = d.write.bind(d); d.write = function (h) { if (typeof h === 'string' && (h.indexOf('Ordem de Fornecimento') >= 0 || h.indexOf('PEDIDO N') >= 0)) window.__ultHtml = h; return w(h); }; } return x; }; });
  await r.pg.click('[data-tour="nav-menu"]'); await r.pg.click('.menu-drawer-item[data-tour="nav-previsao"]'); await r.pg.waitForTimeout(500);
  await r.pg.click('[data-fc="sub-chegada"]'); await r.pg.waitForTimeout(400);
  return r;
}
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  const { pg, errs } = await abrir(br, 'itaquitinga-pe', true);
  await pg.click('[data-fc="cf-reimprimir"]'); await pg.waitForTimeout(300);
  await pg.fill('input[placeholder="Nome completo"]', 'Dra. Ana Lima'); await pg.fill('input[placeholder="Número do CRF"]', '98765-PE');
  await pg.click('button:has-text("Continuar")'); await pg.waitForTimeout(600);
  const h = await pg.evaluate(() => window.__ultHtml || '');
  ok(/Ordem de Fornecimento — FÓRMULAS NUTRICIONAIS - RECURSO PRÓPRIO/.test(h) && !/MEDICAMENTOS - RECURSO/.test(h), 'OF de ata de fórmulas sai como "Fórmulas Nutricionais - Recurso Próprio"');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS');
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
