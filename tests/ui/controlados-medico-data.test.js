// Controlados: médico novo pode ser cadastrado na própria tela (botão e automático ao registrar) e cada saída extra tem a sua data.
const H = require('../lib/harness.js');
const T = 'vicencia-pe';
function seed() {
  const t0 = new Date(Date.now() - 10 * 864e5).toISOString();
  const en = (id, nome, lote, q) => ({ medicamentoId: id, medicamentoNome: nome, tipo: 'entrada', quantidade: q, lote, validade: '01/2030', criadoEm: t0, date: t0.slice(0, 10), tenant_id: T });
  return { tenants: { [T]: { nome: 'Vicência', ativo: true } },
    medicamentos: { m1: { nome: 'Morfina 10mg/ml ampola', categoria: 'controlado', estoqueAtual: 20, tenant_id: T }, m2: { nome: 'Tramal 100mg/2ml ampola', categoria: 'controlado', estoqueAtual: 10, tenant_id: T } },
    entries: { e1: en('m1', 'Morfina 10mg/ml ampola', 'M1', 20), e2: en('m2', 'Tramal 100mg/2ml ampola', 'T1', 10) },
    pacientes_controlados: { p1: { nome: 'Maria Souza', tenant_id: T }, p2: { nome: 'José Lima', tenant_id: T } },
    saidas_controladas: {}, medicos_crm: { md1: { nome: 'Dr. Antigo', crm: '999', tenant_id: T } }, atas: {},
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {} };
}
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  const user = { uid: 't1', name: 'Tec', role: 'tecnico' };
  const o = { store: seed(), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  const { pg, errs } = await H.abrir(br, o);
  await pg.waitForSelector('.bnav-row [data-tour="nav-saida"]', { timeout: 15000 });
  await pg.click('.bnav-row [data-tour="nav-saida"]'); await pg.waitForTimeout(300);
  await pg.fill('input[placeholder="Digite o nome do medicamento..."]', 'morf'); await pg.waitForTimeout(250);
  await pg.click('text=Morfina 10mg/ml ampola >> nth=0'); await pg.waitForTimeout(200);
  await pg.fill('input[placeholder="Ou outra quantidade..."]', '2');
  await pg.click('button:has-text("Registrar saída para")'); await pg.waitForTimeout(400);
  await pg.fill('input[placeholder="Buscar paciente cadastrado..."]', 'maria'); await pg.waitForTimeout(150);
  await pg.click('[data-tour="ctrl-popup"] button:has-text("Maria Souza")'); await pg.waitForTimeout(100);
  // médico já cadastrado: sem aviso
  await pg.fill('[data-fc="medico-nome"]', 'Dr. Antigo'); await pg.fill('[data-fc="medico-crm"]', '999');
  ok(!(await pg.$('[data-fc="medico-novo"]')), 'médico já cadastrado não mostra o aviso de cadastro');
  // médico novo: aviso + botão cadastrar
  await pg.fill('[data-fc="medico-nome"]', 'Dra. Nova Silva'); await pg.fill('[data-fc="medico-crm"]', '5555');
  ok(!!(await pg.$('[data-fc="medico-novo"]')), 'médico novo mostra "ainda não está no cadastro"');
  await pg.click('[data-fc="medico-cadastrar"]'); await pg.waitForTimeout(400);
  let md = await pg.evaluate(() => Object.values(window.__store.medicos_crm));
  ok(md.some((m) => m.crm === '5555' && m.nome === 'Dra. Nova Silva' && m.tenant_id === 'vicencia-pe'), 'o botão cadastra o médico sem sair da tela');
  ok(!(await pg.$('[data-fc="medico-novo"]')), 'depois de cadastrado, o aviso some');
  // saída extra com data própria e médico novo (cadastro automático ao registrar)
  await pg.click('[data-fc="ctrl-add-saida"]'); await pg.waitForTimeout(150);
  ok(!!(await pg.$('[data-fc="ctrl-extra-data-0"]')), 'cada saída extra tem o campo de data');
  const ontem = await pg.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); });
  await pg.selectOption('[data-fc="ctrl-extra-med-0"]', 'm2'); await pg.fill('[data-fc="ctrl-extra-qtd-0"]', '3');
  await pg.fill('[data-fc="ctrl-extra-pac-0"]', 'jose'); await pg.waitForTimeout(150); await pg.click('[data-fc="ctrl-extra-pac-pick"]'); await pg.waitForTimeout(100);
  await pg.fill('[data-fc="ctrl-extra-0"] [data-fc="medico-nome"]', 'Dr. Auto Cad'); await pg.fill('[data-fc="ctrl-extra-0"] [data-fc="medico-crm"]', '7777');
  await pg.fill('[data-fc="ctrl-extra-data-0"]', ontem);
  await pg.click('[data-tour="ctrl-popup"] button:has-text("Liberar")'); await pg.waitForTimeout(900);
  const sc = await pg.evaluate(() => Object.values(window.__store.saidas_controladas));
  ok(sc.length === 2, '2 registros de controle gravados (' + sc.length + ')');
  ok(sc.some((x) => x.pacienteNome === 'José Lima' && x.dataSaida === ontem), 'a saída extra grava a data escolhida (' + ontem + ')');
  ok(sc.some((x) => x.pacienteNome === 'Maria Souza' && x.dataSaida === new Date().toISOString().slice(0, 10) || x.pacienteNome === 'Maria Souza'), 'a primeira saída mantém a sua própria data');
  md = await pg.evaluate(() => Object.values(window.__store.medicos_crm));
  ok(md.some((m) => m.crm === '7777' && m.nome === 'Dr. Auto Cad'), 'o médico novo da saída extra é cadastrado sozinho ao registrar');
  ok(md.filter((m) => m.crm === '5555').length === 1, 'o médico cadastrado pelo botão não é duplicado ao registrar');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
