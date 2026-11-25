// Conferir pedidos: EDITAR um pedido fechado e reimprimir sem 2ª via. (base: reimprimir) um pedido já fechado, em Itaquitinga (Ordem de Fornecimento) e Vicência (pedido padrão).
const H = require('../lib/harness.js');
function seed(T, comOF) {
  const em = new Date(Date.now() - 3 * 864e5).toISOString();
  const of = comOF ? { ordemFornecimento: 'atencao_basica' } : {};
  return { tenants: { [T]: { nome: T, ativo: true } },
    medicamentos: { m1: { nome: 'Dipirona 500mg comprimido', categoria: 'medicamento', estoqueAtual: 10, tenant_id: T }, m2: { nome: 'Amoxicilina 250mg', categoria: 'medicamento', estoqueAtual: 10, tenant_id: T } },
    entries: {},
    atas: { a1: { nome: 'Ata 001 - Fornecedor A', categoria: 'medicamento', tenant_id: T, ordemFornecimentoContador: 3,
      itens: [
        Object.assign({ num: '1', descricao: 'Dipirona 500mg comprimido', medicamentoId: 'm1', qtdTeto: 1000, pedidoAcumulado: 500, vUnit: 0.1, unidade: 'CP' }, of),
        Object.assign({ num: '2', descricao: 'Amoxicilina 250mg', medicamentoId: 'm2', qtdTeto: 200, pedidoAcumulado: 100, vUnit: 5, unidade: 'FR' }, of),
        Object.assign({ num: '3', descricao: 'Losartana 50mg', qtdTeto: 100, pedidoAcumulado: 0, vUnit: 2, unidade: 'CP' }, of)],
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
  for (const [T, comOF] of [['itaquitinga-pe', true], ['vicencia-pe', false]]) {
    const { pg, errs } = await abrir(br, T, comOF);
    ok(!!(await pg.$('[data-fc="cf-editar"]')), T + ': pedido sem chegada tem "Editar pedido"');
    await pg.click('[data-fc="cf-editar"]'); await pg.waitForTimeout(300);
    // passa do saldo: Dipirona teto 1000: pode até 1000
    await pg.fill('[data-fc="ed-qtd-0"]', '1100'); await pg.click('[data-fc="ed-salvar"]'); await pg.waitForTimeout(300);
    ok(!!(await pg.$('[data-fc="ed-erro"]')), T + ': não deixa passar do saldo da ata');
    await pg.fill('[data-fc="ed-qtd-0"]', '300'); await pg.fill('[data-fc="ed-qtd-1"]', '0');
    await pg.fill('[data-fc="ed-busca"]', 'losar'); await pg.click('[data-fc="ed-add-2"]'); await pg.fill('[data-fc="ed-qtd-2"]', '40');
    await pg.click('[data-fc="ed-salvar"]'); await pg.waitForTimeout(500);
    const ata = await pg.evaluate(() => window.__store.atas.a1);
    const r = ata.historicoPedidos[0];
    ok(r.deltas.length === 2 && r.deltas[0].idx === 0 && r.deltas[0].qtd === 300 && r.deltas[1].idx === 2 && r.deltas[1].qtd === 40, T + ': pedido salvo com 300 de Dipirona, Amoxicilina fora e 40 de Losartana');
    ok(ata.itens[0].pedidoAcumulado === 300 && ata.itens[1].pedidoAcumulado === 0 && ata.itens[2].pedidoAcumulado === 40, T + ': saldo da ata ajustado pela diferença');
    ok(ata.ordemFornecimentoContador === 3 && r.id === 'r1', T + ': não mexe no contador das OFs e o pedido continua o mesmo');
    await pg.evaluate(() => { window.__ultHtml = ''; });
    await pg.click('[data-fc="cf-editar"]'); await pg.waitForTimeout(300);
    ok((await pg.inputValue('[data-fc="ed-qtd-0"]')) === '300', T + ': ao reabrir mostra as quantidades novas');
    if (comOF) { await pg.fill('input[placeholder="Nome completo"]', 'Dra. Ana Lima').catch(() => {}); }
    await pg.click('[data-fc="ed-salvar-imp"]'); await pg.waitForTimeout(500);
    if (comOF && !(await pg.evaluate(() => window.__ultHtml))) {
      await pg.fill('input[placeholder="Nome completo"]', 'Dra. Ana Lima'); await pg.fill('input[placeholder="Número do CRF"]', '98765-PE');
      await pg.click('button:has-text("Continuar")'); await pg.waitForTimeout(600);
    }
    const h = await pg.evaluate(() => window.__ultHtml || '');
    ok(h.includes('Losartana 50mg') && !h.includes('Amoxicilina 250mg') && h.includes('>300<') && h.includes('>40<'), T + ': impressão com os itens editados');
    ok(!h.includes('2ª VIA'), T + ': sai sem "2ª VIA"');
    ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, T + ': sem erros JS ' + errs.join('|'));
    await pg.context().close();
  }
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
