// Balanço: sempre exige lote (existente escolhido na lista ou lote novo com lote+validade). Nunca cria "sem lote".
const H = require('../lib/harness.js');
const T = 'vicencia-pe';
function seed() {
  const t0 = new Date(Date.now() - 10 * 864e5).toISOString();
  const en = (lote, val, q) => ({ medicamentoId: 'm1', medicamentoNome: 'Dipirona 500mg', tipo: 'entrada', quantidade: q, lote, validade: val, criadoEm: t0, date: t0.slice(0, 10), tenant_id: T });
  return { tenants: { [T]: { nome: 'Vicência', ativo: true } },
    medicamentos: { m1: { nome: 'Dipirona 500mg', categoria: 'medicamento', estoqueAtual: 60, tenant_id: T } },
    entries: { e1: en('L1', '01/2028', 10), e2: en('L2', '01/2031', 50) }, atas: {},
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {} };
}
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  const user = { uid: 't1', name: 'Tec', role: 'tecnico' };
  const o = { store: seed(), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  const { pg, errs } = await H.abrir(br, o);
  const clk = (s) => pg.locator(s).first().dispatchEvent('click');
  const dlg = []; pg.on('dialog', (d) => { dlg.push(d.message()); d.accept().catch(() => {}); });
  await pg.waitForSelector('[data-tour="nav-menu"]', { timeout: 15000 });
  await pg.click('[data-tour="nav-menu"]'); await pg.click('.menu-drawer-item[data-tour="nav-estoque"]'); await pg.waitForTimeout(500);
  const abrir = async () => { await clk('button[title="Balanço"]'); await pg.waitForTimeout(300); };
  const novas = () => pg.evaluate(() => Object.values(window.__store.entries).filter((e) => e.isAjuste));
  await abrir();
  ok(!!(await pg.$('[data-fc="balanco-lotes"]')), 'o balanço pede o lote');
  ok((await pg.$$('[data-fc="balanco-lote"]')).length === 2 && !!(await pg.$('[data-fc="balanco-lote-novo"]')), 'mostra os 2 lotes e a opção "Lote novo"; não há opção "todos os lotes"');
  ok(await pg.evaluate(() => { const i = document.querySelector('input[placeholder="Escolha o lote primeiro"]'); return !!i && i.disabled; }), 'sem escolher o lote, a quantidade fica bloqueada');
  ok(await pg.evaluate(() => Array.from(document.querySelectorAll('button')).some((b) => b.textContent.includes('Confirmar Balanço') && b.disabled)), '"Confirmar Balanço" fica bloqueado sem lote');
  // lote existente
  await clk('[data-fc="balanco-lote"]:has-text("L2")'); await pg.waitForTimeout(150);
  await pg.fill('input[placeholder="Digite a quantidade correta"]', '45');
  await pg.fill('textarea', 'Contagem'); await clk('button:has-text("Confirmar Balanço")'); await pg.waitForTimeout(500);
  let aj = await novas();
  ok(aj.length === 1 && aj[0].lote === 'L2' && aj[0].tipo === 'saida' && aj[0].quantidade === 5, 'balanço do lote L2 (50 → 45) grava saída de 5 NO LOTE L2');
  // lote novo exige lote e validade
  await abrir();
  await clk('[data-fc="balanco-lote-novo"]'); await pg.waitForTimeout(150);
  await pg.fill('input[placeholder="Digite a quantidade correta"]', '8'); await pg.fill('textarea', 'Achado');
  await clk('button:has-text("Confirmar Balanço")'); await pg.waitForTimeout(300);
  ok(dlg.some((d) => /validade|lote/i.test(d)) && (await novas()).length === 1, 'lote novo sem lote/validade é recusado');
  await pg.fill('[data-fc="balanco-novo-lote"]', 'L3'); await pg.fill('[data-fc="balanco-novo-val"]', '052032');
  await clk('button:has-text("Confirmar Balanço")'); await pg.waitForTimeout(500);
  aj = await novas();
  const n3 = aj.filter((e) => e.lote === 'L3');
  ok(n3.length === 1 && n3[0].tipo === 'entrada' && n3[0].quantidade === 8 && n3[0].validade === '05/2032', 'lote novo L3 grava entrada de 8 com lote e validade');
  // lote novo repetindo um existente é recusado
  await abrir();
  await clk('[data-fc="balanco-lote-novo"]'); await pg.waitForTimeout(150);
  await pg.fill('input[placeholder="Digite a quantidade correta"]', '3'); await pg.fill('textarea', 'x');
  await pg.fill('[data-fc="balanco-novo-lote"]', 'l1'); await pg.fill('[data-fc="balanco-novo-val"]', '012028');
  dlg.length = 0; await clk('button:has-text("Confirmar Balanço")'); await pg.waitForTimeout(300);
  ok(dlg.some((d) => /já existe/.test(d)), 'lote novo com o mesmo número de um existente é recusado');
  ok((await novas()).every((e) => e.lote), 'nenhum ajuste ficou sem lote');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
