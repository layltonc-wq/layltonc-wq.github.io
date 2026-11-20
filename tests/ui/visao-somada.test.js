// Visão somada CAF + Satélite (Itaquitinga): só gestor/técnico (acesso aos dois locais), só consulta.
const H = require('../lib/harness.js');
const T = 'itaquitinga-pe';
function seed() {
  return { tenants: { [T]: { nome: 'Itaquitinga', ativo: true } },
    medicamentos: {
      m1: { nome: 'Dipirona 500mg', categoria: 'medicamento', estoqueAtual: 100, estoqueLocal: { satelite: 30 }, minEstoque: 20, tenant_id: T },
      m2: { nome: 'Álcool 70%', categoria: 'penso', estoqueAtual: 8, estoqueLocal: { satelite: 0 }, minEstoque: 10, tenant_id: T },
      m3: { nome: 'Amoxicilina 500mg', categoria: 'medicamento', estoqueAtual: 0, tenant_id: T } },
    entries: {}, atas: {}, users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {} };
}
async function abrir(br, role, acessoLocal) {
  const user = { uid: 't1', name: 'Fulana', role };
  const o = { store: seed(), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12, acessoLocal }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T, acessoLocal };
  return H.abrir(br, o);
}
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  let { pg, errs } = await abrir(br, 'tecnico');
  await pg.waitForSelector('[data-tour="nav-menu"]', { timeout: 15000 });
  await pg.click('[data-tour="nav-menu"]');
  ok(!!(await pg.$('.menu-drawer-item[data-tour="nav-visaosomada"]')), 'técnico vê "Estoque CAF + Satélite" no menu');
  await pg.click('.menu-drawer-item[data-tour="nav-visaosomada"]'); await pg.waitForTimeout(500);
  const linhas = await pg.$$eval('[data-fc="vs-linha"]', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
  ok(linhas.length === 2, 'por padrão mostra só itens com estoque (2 de 3)');
  ok(linhas.some((l) => /Dipirona/.test(l) && /70/.test(l) && /30/.test(l) && /100/.test(l)), 'Dipirona: CAF 70 + Satélite 30 = 100');
  ok(linhas.some((l) => /Álcool/.test(l) && /mínimo 10/.test(l)), 'Álcool aparece como no mínimo ou abaixo');
  const tot = await pg.textContent('[data-fc="vs-total"]');
  ok(/Total da lista \(2 itens\)\s*78\s*30\s*108/.test(tot.replace(/\s+/g, ' ').replace(/\) /, ')')) || /78.*30.*108/.test(tot.replace(/\s+/g, ' ')), 'total da lista: CAF 78, Satélite 30, soma 108');
  ok((await pg.textContent('[data-fc="vs-baixo"]')).trim() === '1', 'cartão "no mínimo ou abaixo" = 1');
  await pg.fill('[data-fc="vs-busca"]', 'alcool'); await pg.waitForTimeout(150);
  ok((await pg.$$('[data-fc="vs-linha"]')).length === 1, 'a busca ignora acento (alcool → Álcool)');
  await pg.fill('[data-fc="vs-busca"]', ''); await pg.click('[data-fc="vs-f-todos"]'); await pg.waitForTimeout(150);
  ok((await pg.$$('[data-fc="vs-linha"]')).length === 3, '"Todos" mostra também o item zerado');
  await pg.click('[data-fc="vs-f-baixo"]'); await pg.waitForTimeout(150);
  ok((await pg.$$('[data-fc="vs-linha"]')).length === 1, '"No mínimo ou abaixo" filtra');
  ok(!!(await pg.$('[data-fc="vs-excel"]')), 'tem o botão "Baixar Excel"');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await pg.context().close();
  // conta de um local só não vê
  ({ pg, errs } = await abrir(br, 'farmaceutico', 'caf'));
  await pg.waitForSelector('[data-tour="nav-menu"]', { timeout: 15000 });
  await pg.click('[data-tour="nav-menu"]');
  ok(!(await pg.$('.menu-drawer-item[data-tour="nav-visaosomada"]')), 'conta de um local só não vê a visão somada');
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
