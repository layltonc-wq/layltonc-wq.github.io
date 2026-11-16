// Itaquitinga: "Conferir chegada" - compara o que chegou com o que foi pedido; o que não chega e é encerrado volta ao saldo da ata.
const H = require('../lib/harness.js');
const T = 'itaquitinga-pe';
function seed() {
  const em = new Date(Date.now() - 3 * 864e5).toISOString();
  return {
    tenants: { [T]: { nome: 'Itaquitinga', ativo: true } },
    medicamentos: { m1: { nome: 'Dipirona 500mg comprimido', categoria: 'medicamento', estoqueAtual: 10, tenant_id: T }, m2: { nome: 'Amoxicilina 250mg', categoria: 'medicamento', estoqueAtual: 10, tenant_id: T } },
    entries: {},
    atas: {
      a1: { nome: 'Ata 001 - Fornecedor A', categoria: 'medicamento', tenant_id: T,
        itens: [
          { num: '1', descricao: 'Dipirona 500mg comprimido', medicamentoId: 'm1', qtdTeto: 1000, pedidoAcumulado: 500, vUnit: 0.1, unidade: 'CP' },
          { num: '2', descricao: 'Amoxicilina 250mg', medicamentoId: 'm2', qtdTeto: 200, pedidoAcumulado: 100, vUnit: 5, unidade: 'FR' }],
        historicoPedidos: [{ id: 'r1', em, deltas: [{ idx: 0, qtd: 500 }, { idx: 1, qtd: 100 }] }] }
    },
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {}
  };
}
const txt = (pg) => pg.evaluate(() => document.body.innerText);
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  const user = { uid: 't1', name: 'Tec', role: 'tecnico' };
  const o = { store: seed(), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  const { pg, errs } = await H.abrir(br, o);
  await pg.waitForSelector('[data-fc="seletor-local"],[data-fc="chip-local"]', { timeout: 15000 });
  await pg.click('[data-tour="nav-menu"]');
  await pg.click('.menu-drawer-item[data-tour="nav-previsao"]'); await pg.waitForTimeout(500);
  await pg.click('[data-fc="sub-chegada"]'); await pg.waitForTimeout(300);
  let t = await txt(pg);
  ok(t.includes('Pendentes (1)') && t.includes('Aguardando chegada') && t.includes('chegaram 0 de 600'), 'mostra o pedido fechado esperando chegada');
  await pg.click('[data-fc="cf-abrir"]'); await pg.waitForTimeout(200);
  ok((await pg.$$('[data-fc="cf-item"]')).length === 2, 'abre os 2 itens do pedido');
  const ents = await pg.$$('[data-fc="cf-qtd"]');
  await ents[0].fill('300'); await ents[1].fill('100'); await pg.waitForTimeout(150);
  t = await txt(pg);
  ok(t.includes('faltam 200') && t.includes('bate com o pedido'), 'mostra a diferença de cada item na hora (faltam 200 / bate)');
  await pg.click('[data-fc="cf-registrar"]'); await pg.waitForTimeout(500);
  let a = await pg.evaluate(() => window.__store.atas.a1);
  ok(a.historicoPedidos[0].conf.chegadas.length === 1 && a.itens[0].pedidoAcumulado === 500, 'registra a chegada parcial sem mexer no saldo da ata');
  t = await txt(pg);
  ok(t.includes('Em andamento') && t.includes('chegaram 400 de 600'), 'o pedido fica "Em andamento" (entrega parcial)');
  // segunda chegada com excesso: 250 quando faltam 200 -> pergunta; o teste aceita (abater)
  await pg.click('[data-fc="cf-abrir"]'); await pg.waitForTimeout(200);
  const e2 = await pg.$$('[data-fc="cf-qtd"]');
  await e2[0].fill('250'); await pg.waitForTimeout(100);
  ok((await txt(pg)).includes('chegou 50 a mais'), 'avisa quando chega a mais');
  await pg.click('[data-fc="cf-registrar"]'); await pg.waitForTimeout(500); await (async()=>{await pg.waitForTimeout(250);await pg.locator('button:has-text("Abater do saldo")').last().click();await pg.waitForTimeout(400);})();
  a = await pg.evaluate(() => window.__store.atas.a1);
  ok(a.itens[0].pedidoAcumulado === 550 && a.historicoPedidos[0].conf.excessos[0] === 50, 'excesso aceito abate 50 a mais do saldo (500 -> 550)');
  t = await txt(pg);
  ok(a.historicoPedidos[0].conf.status === 'encerrado' && (await pg.$('[data-fc="cf-f-feitos"]')) && t.includes('Pendentes (0)') && t.includes('Conferidos (1)'), 'tudo chegou: pedido vai para "Conferidos"');
  // desfazer pedido ja conferido nao deve devolver duas vezes (usa a conta liquida)
  // segundo cenario: encerrar com falta
  await pg.evaluate(async () => { const s = JSON.parse(JSON.stringify(window.__store.atas.a1)); s.historicoPedidos.push({ id: 'r2', em: new Date().toISOString(), deltas: [{ idx: 0, qtd: 100 }] }); s.itens[0].pedidoAcumulado += 100; await window.__fakeDb.collection('atas').doc('a1').update({ itens: s.itens, historicoPedidos: s.historicoPedidos }); });
  await pg.click('[data-fc="sub-lista"]'); await pg.click('[data-fc="sub-chegada"]'); await pg.waitForTimeout(400);
  await pg.click('[data-fc="cf-f-pend"]'); await pg.waitForTimeout(200);
  ok((await txt(pg)).includes('Pendentes (1)'), 'novo pedido fechado aparece como pendente');
  await pg.click('[data-fc="cf-abrir"]'); await pg.waitForTimeout(200);
  await (await pg.$('[data-fc="cf-qtd"]')).fill('40');
  await pg.click('[data-fc="cf-registrar"]'); await pg.waitForTimeout(400);
  await pg.click('[data-fc="cf-abrir"]'); await pg.waitForTimeout(200);
  await pg.click('[data-fc="cf-encerrar"]'); await pg.waitForTimeout(500); await (async()=>{await pg.waitForTimeout(250);await pg.locator('button:has-text("Encerrar")').last().click();await pg.waitForTimeout(400);})();
  a = await pg.evaluate(() => window.__store.atas.a1);
  ok(a.itens[0].pedidoAcumulado === 590 && a.historicoPedidos[1].conf.devolvidos[0] === 60 && a.historicoPedidos[1].conf.status === 'encerrado', 'encerrar devolve ao saldo o que não chegou (60: 650 -> 590)');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
