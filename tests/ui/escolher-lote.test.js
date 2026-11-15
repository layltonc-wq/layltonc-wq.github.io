// Saída: escolher o lote é opcional (padrão continua sendo o que vence primeiro). Vale para Itaquitinga e Vicência.
const H = require('../lib/harness.js');
function seed(T) {
  const t0 = new Date(Date.now() - 10 * 864e5).toISOString();
  const en = (lote, val, q) => ({ medicamentoId: 'm1', medicamentoNome: 'Dipirona 500mg', tipo: 'entrada', quantidade: q, lote, validade: val, criadoEm: t0, date: t0.slice(0, 10), tenant_id: T });
  return {
    tenants: { [T]: { nome: T, ativo: true } },
    medicamentos: { m1: { nome: 'Dipirona 500mg', categoria: 'medicamento', estoqueAtual: 60, tenant_id: T } },
    entries: { e1: en('L1', '01/2028', 10), e2: en('L2', '01/2031', 50) },
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {}
  };
}
async function rodar(br, T, ok) {
  const user = { uid: 't1', name: 'Tec', role: 'tecnico' };
  const o = { store: seed(T), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  const { pg, errs } = await H.abrir(br, o);
  await pg.waitForSelector('.bnav-row [data-tour="nav-saida"]', { timeout: 15000 });
  await pg.click('.bnav-row [data-tour="nav-saida"]'); await pg.waitForTimeout(300);
  await pg.fill('input[placeholder="Digite o nome do medicamento..."]', 'dipi'); await pg.waitForTimeout(250);
  await pg.click('text=Dipirona 500mg >> nth=0'); await pg.waitForTimeout(200);
  const lt = () => pg.evaluate(() => Array.from(document.querySelectorAll('input.inp')).filter((i) => i.placeholder === 'Ex: ABC1234')[0].value);
  ok((await lt()) === 'L1', T + ': por padrão já vem o lote que vence primeiro (L1)');
  ok(!(await pg.$('[data-fc="lote-op"]')), T + ': a lista de lotes fica escondida até pedir');
  await pg.click('[data-fc="escolher-lote-btn"]'); await pg.waitForTimeout(150);
  ok((await pg.$$('[data-fc="lote-op"]')).length === 2, T + ': "Escolher o lote" mostra os 2 lotes com saldo');
  await pg.click('[data-fc="lote-op"]:has-text("L2")'); await pg.waitForTimeout(150);
  ok((await lt()) === 'L2', T + ': escolher o L2 preenche o lote');
  await pg.fill('input[placeholder="Ou outra quantidade..."]', '5');
  await pg.click('button:has-text("Registrar saída para")'); await pg.waitForTimeout(500);
  const s = await pg.evaluate(() => Object.values(window.__store.entries).filter((e) => e.tipo === 'saida'));
  ok(s.length === 1 && s[0].lote === 'L2' && s[0].quantidade === 5, T + ': a saída de 5 saiu do lote L2 (escolhido)');
  // sem escolher: vence primeiro
  await pg.fill('input[placeholder="Digite o nome do medicamento..."]', 'dipi'); await pg.waitForTimeout(250);
  await pg.click('text=Dipirona 500mg >> nth=0'); await pg.waitForTimeout(200);
  await pg.fill('input[placeholder="Ou outra quantidade..."]', '3');
  await pg.click('button:has-text("Registrar saída para")'); await pg.waitForTimeout(500);
  const s2 = await pg.evaluate(() => Object.values(window.__store.entries).filter((e) => e.tipo === 'saida' && e.quantidade === 3));
  ok(s2.length === 1 && s2[0].lote === 'L1', T + ': sem escolher, sai do lote que vence primeiro (L1)');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, T + ': sem erros JS ' + errs.join('|'));
  await pg.context().close();
}
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  await rodar(br, 'itaquitinga-pe', ok);
  await rodar(br, 'vicencia-pe', ok);
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
