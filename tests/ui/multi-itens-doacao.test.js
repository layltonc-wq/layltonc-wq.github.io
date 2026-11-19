// Permuta, Doação e Empréstimo com vários itens; doação também "feita" (sai do estoque). Vicência com Pedidos/Conferir pedidos.
const H = require('../lib/harness.js');
function seed(T) {
  const t0 = new Date(Date.now() - 10 * 864e5).toISOString();
  const en = (id, nome, lote, q) => ({ medicamentoId: id, medicamentoNome: nome, tipo: 'entrada', quantidade: q, lote, validade: '01/2030', criadoEm: t0, date: t0.slice(0, 10), tenant_id: T });
  return { tenants: { [T]: { nome: T, ativo: true } },
    medicamentos: { m1: { nome: 'Dipirona 500mg', categoria: 'medicamento', estoqueAtual: 50, tenant_id: T }, m2: { nome: 'Paracetamol 750mg', categoria: 'medicamento', estoqueAtual: 40, tenant_id: T } },
    entries: { e1: en('m1', 'Dipirona 500mg', 'L1', 50), e2: en('m2', 'Paracetamol 750mg', 'P1', 40) }, atas: {},
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {} };
}
async function abrir(br, T) {
  const user = { uid: 't1', name: 'Tec', role: 'tecnico' };
  const o = { store: seed(T), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  return H.abrir(br, o);
}
async function pick(pg, fc, termo, nome) {
  await pg.fill('[data-fc="' + fc + '"]', termo); await pg.waitForTimeout(200);
  await pg.click('[data-fc="pick"]:has-text("' + nome + '")'); await pg.waitForTimeout(150);
}
const confirmar = async (pg, rotulo) => { await pg.click('.modal-confirm button:has-text("' + rotulo + '"), [role="dialog"] button:has-text("' + rotulo + '")').catch(async () => { const b = await pg.$$('button:has-text("' + rotulo + '")'); await b[b.length - 1].click(); }); await pg.waitForTimeout(500); };
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  const { pg, errs } = await abrir(br, 'itaquitinga-pe');
  await pg.waitForSelector('[data-tour="nav-menu"]', { timeout: 15000 });
  await pg.click('.bnav-row [data-tour="nav-recebimento"]'); await pg.waitForTimeout(400);
  // ---- empréstimo com 2 itens
  await pg.click('[data-fc="modo-emprestimo"]'); await pg.waitForTimeout(200);
  await pg.fill('[data-fc="emp-parceiro"]', 'Hospital X');
  await pick(pg, 'emp-busca', 'dipi', 'Dipirona'); await pg.fill('[data-fc="emp-qtd"]', '5');
  await pg.click('[data-fc="emp-outro"]'); await pg.waitForTimeout(150);
  await pick(pg, 'emp-busca-1', 'parac', 'Paracetamol'); await pg.fill('[data-fc="emp-qtd-1"]', '7');
  await pg.click('[data-fc="emp-salvar"]'); await pg.waitForTimeout(300);
  await confirmar(pg, 'Emprestar');
  let t = await pg.evaluate(() => document.body.innerText);
  ok(t.includes('5x Dipirona') && t.includes('7x Paracetamol') && t.includes('Nos devem (2)'), 'empréstimo com 2 medicamentos vira 2 pendências em "Nos devem"');
  let st = await pg.evaluate(() => Object.values(window.__store.entries).filter((e) => e.entradaEspecial === 'emprestimo'));
  ok(st.length === 2 && st.every((e) => e.tipo === 'saida'), 'duas saídas de empréstimo gravadas');
  // ---- doação feita (2 itens)
  await pg.click('[data-fc="modo-doacao"]'); await pg.waitForTimeout(200);
  await pg.click('[data-fc="doa-sentido-feita"]'); await pg.waitForTimeout(100);
  ok(!(await pg.$('[data-fc="doa-0-lote"]')), 'doação feita não pede lote/validade');
  await pg.fill('[data-fc="origem"]', 'Hospital Y');
  await pick(pg, 'doa-busca-0', 'dipi', 'Dipirona'); await pg.fill('[data-fc="doa-qtd-0"]', '10');
  await pg.click('button:has-text("+ Outro item")'); await pg.waitForTimeout(150);
  await pick(pg, 'doa-busca-1', 'parac', 'Paracetamol'); await pg.fill('[data-fc="doa-qtd-1"]', '3');
  await pg.click('[data-fc="ent-salvar"]'); await pg.waitForTimeout(300);
  await confirmar(pg, 'Registrar');
  st = await pg.evaluate(() => Object.values(window.__store.entries).filter((e) => e.entradaEspecial === 'doacao'));
  ok(st.length === 2 && st.every((e) => e.tipo === 'saida' && e.doacaoFeita && e.parceiro === 'Hospital Y'), 'doação feita grava 2 saídas');
  // ---- doação recebida continua pedindo lote
  await pg.click('[data-fc="doa-sentido-recebida"]'); await pg.waitForTimeout(100);
  ok(!!(await pg.$('[data-fc="doa-0-lote"]')), 'doação recebida pede lote e validade');
  // ---- permuta 2 saídas e 2 entradas
  await pg.click('[data-fc="modo-permuta"]'); await pg.waitForTimeout(200);
  await pg.fill('[data-fc="origem"]', 'Hospital Z');
  await pick(pg, 'perm-sai-busca', 'dipi', 'Dipirona'); await pg.fill('[data-fc="perm-sai-qtd"]', '2');
  await pg.click('[data-fc="perm-sai-outro"]'); await pg.waitForTimeout(150);
  await pick(pg, 'perm-sai-busca-1', 'parac', 'Paracetamol'); await pg.fill('[data-fc="perm-sai-qtd-1"]', '2');
  await pick(pg, 'perm-ent-busca', 'dipi', 'Dipirona'); await pg.fill('[data-fc="perm-ent-qtd"]', '4'); await pg.click('[data-fc="perm-pend"]');
  await pg.click('[data-fc="perm-ent-outro"]'); await pg.waitForTimeout(150);
  await pick(pg, 'perm-ent-busca-1', 'parac', 'Paracetamol'); await pg.fill('[data-fc="perm-ent-qtd-1"]', '6'); await pg.click('[data-fc="perm-pend-1"]');
  await pg.click('[data-fc="ent-salvar"]'); await pg.waitForTimeout(300);
  await confirmar(pg, 'Registrar');
  st = await pg.evaluate(() => Object.values(window.__store.entries).filter((e) => e.entradaEspecial === 'permuta'));
  ok(st.filter((e) => e.tipo === 'saida').length === 2 && st.filter((e) => e.tipo === 'entrada').length === 2, 'permuta com 2 itens que saíram e 2 que chegaram');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await pg.context().close();
  // ---- Vicência: Pedidos e Conferir pedidos
  const v = await abrir(br, 'vicencia-pe');
  await v.pg.waitForSelector('[data-tour="nav-menu"]', { timeout: 15000 });
  await v.pg.click('[data-tour="nav-menu"]'); await v.pg.click('.menu-drawer-item[data-tour="nav-previsao"]'); await v.pg.waitForTimeout(500);
  ok(!!(await v.pg.$('[data-fc="sub-lista"]')) && !!(await v.pg.$('[data-fc="sub-chegada"]')), 'Vicência: abas Pedidos e Conferir pedidos aparecem');
  await v.pg.click('[data-fc="sub-chegada"]'); await v.pg.waitForTimeout(300);
  ok(v.errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'Vicência: sem erros JS ' + v.errs.join('|'));
  await v.pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
