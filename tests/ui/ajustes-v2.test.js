// Busca sem acento, ATB no Itaquitinga, cadastro de médicos (CRM) por prefeitura e quadrados clicáveis do Início.
const H = require('../lib/harness.js');
const T = 'itaquitinga-pe', V = 'vicencia-pe';
function seed() {
  const t0 = new Date(Date.now() - 3 * 864e5).toISOString();
  const hoje = new Date().toISOString();
  const en = (id, nome, q, tipo, t) => ({ medicamentoId: id, medicamentoNome: nome, tipo, quantidade: q, lote: 'L1', validade: '01/2030', criadoEm: t, date: t.slice(0, 10), tenant_id: T, local: 'caf' });
  return {
    tenants: { [T]: { nome: 'Itaquitinga', ativo: true }, [V]: { nome: 'Vicência', ativo: true } },
    medicamentos: { m1: { nome: 'Álcool 70%', categoria: 'medicamento', estoqueAtual: 50, tenant_id: T }, m2: { nome: 'Dipirona 500mg', categoria: 'medicamento', estoqueAtual: 5, estoqueMinimo: 20, tenant_id: T } },
    entries: { e1: en('m1', 'Álcool 70%', 50, 'entrada', t0), e2: en('m2', 'Dipirona 500mg', 5, 'entrada', t0), e3: en('m1', 'Álcool 70%', 1, 'saida', hoje) },
    medicos_crm: { d1: { nome: 'Dra. Ana Paula', crm: '12345-PE', tenant_id: T }, d2: { nome: 'Dr. Carlos', crm: '99999-PE', tenant_id: V } },
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {}, tratamentos_atb: {}
  };
}
async function abrir(br, user) {
  const o = { store: seed(), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  const { pg, errs } = await H.abrir(br, o);
  await pg.waitForSelector('[data-fc="seletor-local"],[data-fc="chip-local"]', { timeout: 15000 });
  return { pg, errs };
}
const txt = (pg) => pg.evaluate(() => document.body.innerText);
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  const { pg, errs } = await abrir(br, { uid: 't1', name: 'Tec', role: 'tecnico' });

  // 1) quadrados da tela inicial
  await pg.click('[data-fc="stat-vencimento"]'); await pg.waitForTimeout(300);
  ok((await pg.evaluate(() => document.querySelector('.tab-sw .on').innerText)).startsWith('Vencimentos'), 'quadrado "Vencimento" abre Estoque > Vencimentos');
  await pg.click('.bnav-row [data-tour="nav-dashboard"]'); await pg.waitForTimeout(200);
  await pg.click('[data-fc="stat-baixo"]'); await pg.waitForTimeout(300);
  ok((await pg.evaluate(() => document.querySelector('.tab-sw .on').innerText)).startsWith('Faltas'), 'quadrado "Estoque baixo" abre Estoque > Faltas');
  await pg.click('.bnav-row [data-tour="nav-dashboard"]'); await pg.waitForTimeout(200);
  await pg.click('[data-fc="stat-saidas"]'); await pg.waitForTimeout(300);
  ok(/Saídas registradas/i.test(await txt(pg)), 'quadrado "Saídas hoje" abre Saídas registradas');
  await pg.click('.bnav-row [data-tour="nav-dashboard"]'); await pg.waitForTimeout(200);
  await pg.click('[data-fc="stat-entradas"]'); await pg.waitForTimeout(300);
  ok(/Novo recebimento/.test(await txt(pg)), 'quadrado "Entradas hoje" abre Recebimento');

  // 2) busca sem acento na Saída
  await pg.click('.bnav-row [data-tour="nav-saida"]'); await pg.waitForTimeout(300);
  await pg.fill('input[placeholder="Digite o nome do medicamento..."]', 'alcool'); await pg.waitForTimeout(300);
  ok((await txt(pg)).includes('Álcool 70%'), 'Saída: "alcool" (sem acento) acha "Álcool 70%"');
  await pg.fill('input[placeholder="Digite o nome do medicamento..."]', 'ÁLCOOL'); await pg.waitForTimeout(300);
  ok((await txt(pg)).includes('Álcool 70%'), 'Saída: "ÁLCOOL" também acha');

  // 3) ATB no menu do Itaquitinga
  await pg.click('[data-tour="nav-menu"]');
  ok(await pg.evaluate(() => !!document.querySelector('.menu-drawer-item[data-tour="nav-antibiotico"]')), 'Itaquitinga: ATB aparece no menu');
  await pg.click('.menu-drawer-item[data-tour="nav-antibiotico"]'); await pg.waitForTimeout(500);
  ok(/ATB|antibi|Tratamento/i.test(await txt(pg)), 'Itaquitinga: a aba ATB abre');

  // 4) cadastro de médicos, só desta prefeitura
  await pg.click('[data-tour="nav-menu"]');
  await pg.click('.menu-drawer-item[data-tour="nav-medicos"]'); await pg.waitForTimeout(400);
  let t = await txt(pg);
  ok(t.includes('Dra. Ana Paula') && !t.includes('Dr. Carlos'), 'cadastro mostra só os médicos desta prefeitura (não o de Vicência)');
  await pg.fill('[data-fc="med-nome"]', 'Dr. João Silva'); await pg.fill('[data-fc="med-crm"]', '55555-PE');
  await pg.click('[data-fc="med-salvar"]'); await pg.waitForTimeout(400);
  const r = await pg.evaluate(() => Object.values(window.__store.medicos_crm).filter((x) => x.nome === 'Dr. João Silva')[0]);
  ok(r && r.crm === '55555-PE' && r.tenant_id === 'itaquitinga-pe', 'cadastrar grava nome, CRM e a prefeitura');
  await pg.fill('[data-fc="med-nome"]', 'Outro'); await pg.fill('[data-fc="med-crm"]', '55555-pe');
  await pg.click('[data-fc="med-salvar"]'); await pg.waitForTimeout(300);
  ok((await pg.textContent('[data-fc="med-erro"]')).includes('já está cadastrado'), 'CRM repetido é recusado');
  await pg.fill('[data-fc="med-busca"]', 'joao'); await pg.waitForTimeout(200);
  ok((await pg.$$('[data-fc="med-linha"]')).length === 1, 'busca de médico ignora acento (joao -> João)');

  // 5) sugestão de médico no ATB
  await pg.click('[data-tour="nav-menu"]');
  await pg.click('.menu-drawer-item[data-tour="nav-antibiotico"]'); await pg.waitForTimeout(400);
  const novo = await pg.$('button:has-text("Novo")');
  if (novo) { await novo.click(); await pg.waitForTimeout(300); }
  await pg.fill('[data-fc="medico-nome"]', 'ana'); await pg.waitForTimeout(250);
  ok(!!(await pg.$('[data-fc="medico-pick"]')), 'ATB: digitar "ana" sugere a médica cadastrada');
  await pg.click('[data-fc="medico-pick"]'); await pg.waitForTimeout(200);
  ok((await pg.inputValue('[data-fc="medico-crm"]')) === '12345-PE' && (await pg.inputValue('[data-fc="medico-nome"]')) === 'Dra. Ana Paula', 'escolher a sugestão preenche nome e CRM');
  await pg.fill('[data-fc="medico-crm"]', '9999'); await pg.waitForTimeout(250);
  ok(!(await pg.$('[data-fc="medico-pick"]')), 'CRM de Vicência (99999) não aparece como sugestão aqui');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
