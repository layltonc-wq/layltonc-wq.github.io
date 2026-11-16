// Conferir pedidos (item extra vindo da ata), cadastrar medicamento na permuta, avisos padrão, farmacêutica (só consulta) fazendo pedidos.
const H = require('../lib/harness.js');
const T = 'itaquitinga-pe';
function seed() {
  const em = new Date(Date.now() - 2 * 864e5).toISOString();
  const t0 = new Date(Date.now() - 9 * 864e5).toISOString();
  return {
    tenants: { [T]: { nome: 'Itaquitinga', ativo: true } },
    medicamentos: { m1: { nome: 'Dipirona 500mg', categoria: 'medicamento', estoqueAtual: 50, tenant_id: T } },
    entries: { e1: { medicamentoId: 'm1', medicamentoNome: 'Dipirona 500mg', tipo: 'entrada', quantidade: 50, lote: 'L1', validade: '01/2030', criadoEm: t0, date: t0.slice(0, 10), tenant_id: T, local: 'caf' } },
    atas: {
      a1: { nome: 'Ata 001 - Fornecedor A', categoria: 'medicamento', tenant_id: T,
        itens: [
          { num: '1', descricao: 'Dipirona 500mg comprimido', medicamentoId: 'm1', qtdTeto: 1000, pedidoAcumulado: 100, vUnit: 0.1, unidade: 'CP' },
          { num: '2', descricao: 'Soro fisiológico 500ml', qtdTeto: 500, pedidoAcumulado: 0, vUnit: 2, unidade: 'FR' }],
        historicoPedidos: [{ id: 'r1', em, deltas: [{ idx: 0, qtd: 100 }] }] }
    },
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {}
  };
}
async function abrir(br, u, extra) {
  const o = { store: seed(), uid: u.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, u) };
  o.store.users[u.uid] = Object.assign({ name: u.name, role: u.role, status: 'approved', tenant_id: T }, extra || {});
  const { pg, errs } = await H.abrir(br, o);
  await pg.waitForSelector('[data-fc="seletor-local"],[data-fc="chip-local"]', { timeout: 15000 });
  return { pg, errs };
}
const txt = (pg) => pg.evaluate(() => document.body.innerText);
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();

  // ---- gestor: conferir pedidos com item extra da ata
  let { pg, errs } = await abrir(br, { uid: 't1', name: 'Tec', role: 'tecnico' });
  await pg.click('[data-tour="nav-menu"]');
  await pg.click('.menu-drawer-item[data-tour="nav-previsao"]'); await pg.waitForTimeout(500);
  ok((await txt(pg)).includes('Conferir pedidos') && !(await txt(pg)).includes('Conferir chegada'), 'a aba agora se chama "Conferir pedidos"');
  await pg.click('[data-fc="sub-chegada"]'); await pg.waitForTimeout(300);
  await pg.click('[data-fc="cf-abrir"]'); await pg.waitForTimeout(200);
  await pg.fill('[data-fc="cf-extra-busca"]', 'soro'); await pg.waitForTimeout(150);
  ok((await pg.$$('[data-fc="cf-extra-cand"]')).length === 1, 'busca do item extra puxa direto da ata (Soro)');
  await pg.click('[data-fc="cf-extra-add"]'); await pg.waitForTimeout(150);
  await pg.fill('[data-fc="cf-extra-qtd"]', '30');
  await (await pg.$('[data-fc="cf-qtd"]')).fill('100'); await pg.waitForTimeout(100);
  await pg.click('[data-fc="cf-registrar"]'); await pg.waitForTimeout(500); await (async()=>{await pg.waitForTimeout(250);await pg.locator('button:has-text("Abater do saldo")').last().click();await pg.waitForTimeout(400);})();
  const a = await pg.evaluate(() => window.__store.atas.a1);
  const ch = a.historicoPedidos[0].conf.chegadas[0];
  ok(ch.extras && ch.extras[1] === 30 && a.itens[1].pedidoAcumulado === 30 && a.historicoPedidos[0].conf.extrasAbatidos[1] === 30, 'item extra (Soro, 30) registrado e abatido do saldo da ata (0 -> 30)');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'conferir: sem erros JS ' + errs.join('|'));

  // ---- permuta: cadastrar medicamento que não existe + avisos no padrão
  await pg.click('.bnav-row [data-tour="nav-recebimento"]'); await pg.waitForTimeout(300);
  await pg.click('[data-fc="modo-permuta"]'); await pg.waitForTimeout(200);
  await pg.fill('[data-fc="perm-ent-busca"]', 'Medicamento Novo XYZ'); await pg.waitForTimeout(200);
  await pg.click('[data-fc="cadastrar-med"]'); await pg.waitForTimeout(150);
  await pg.click('[data-fc="novo-med-salvar"]'); await pg.waitForTimeout(500);
  const novo = await pg.evaluate(() => Object.values(window.__store.medicamentos).filter((m) => m.nome === 'Medicamento Novo XYZ')[0]);
  ok(novo && novo.tenant_id === 'itaquitinga-pe' && novo.categoria === 'medicamento', 'permuta: cadastrou o medicamento novo na prefeitura');
  ok(!!(await pg.$('[data-fc="perm-ent-qtd"]')), 'e já ficou selecionado como item que chegou');
  // empréstimo: aviso padrão
  await pg.click('[data-fc="modo-emprestimo"]'); await pg.waitForTimeout(200);
  await pg.click('[data-fc="emp-tipo-recebido"]');
  await pg.fill('[data-fc="emp-parceiro"]', 'Hospital Y'); await pg.fill('[data-fc="emp-busca"]', 'dipi'); await pg.click('[data-fc="pick"]');
  await pg.fill('[data-fc="emp-qtd"]', '5'); await pg.click('[data-fc="emp-pend"]');
  await pg.click('[data-fc="emp-salvar"]'); await pg.waitForTimeout(500);
  ok((await pg.getAttribute('[data-fc="ent-ok"]', 'class')) === 'ok', 'aviso de sucesso do empréstimo usa o padrão do sistema (classe "ok")');
  const rotulos = await pg.evaluate(() => Array.from(document.querySelectorAll('[data-fc^="modo-"]')).map((b) => b.innerText).join('|'));
  ok(!/[\u{1F000}-\u{1FFFF}]/u.test(rotulos), 'botões Permuta/Doação/Empréstimos sem emoji fora do padrão: ' + rotulos);
  await pg.context().close();

  // ---- farmacêutica (só consulta) consegue fazer pedido
  ({ pg, errs } = await abrir(br, { uid: 'f1', name: 'Farm', role: 'farmaceutico', acessoLocal: 'caf', somenteLeitura: true }, { acessoLocal: 'caf', somenteLeitura: true }));
  await pg.click('.bnav-row [data-tour="nav-previsao"]'); await pg.waitForTimeout(500);
  await pg.click('[data-fc="lp-cat-cab"]'); await pg.waitForTimeout(200);
  await pg.evaluate(() => document.querySelector('[data-fc="lp-ata-cab"]').click()); await pg.waitForTimeout(200);
  await pg.evaluate(() => { const i = document.querySelector('[data-fc="lp-qtd"]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, '40'); i.dispatchEvent(new Event('input', { bubbles: true })); });
  await pg.waitForTimeout(150);
  await pg.click('[data-fc="lp-finalizar"]'); await pg.waitForTimeout(250);
  await pg.click('[data-fc="lp-fechar-todos"]'); await pg.waitForTimeout(300);
  await pg.locator('button:has-text("Fechar pedido")').last().click(); await pg.waitForTimeout(700);
  const a2 = await pg.evaluate(() => window.__store.atas.a1);
  ok(a2.itens[0].pedidoAcumulado === 140, 'farmacêutica (só consulta) fecha pedido: saldo da ata descontado (100 -> 140)');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'farmacêutica: sem erros JS ' + errs.join('|'));
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
