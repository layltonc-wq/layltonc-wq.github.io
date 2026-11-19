// Controlados (Morfina/Tramal): várias saídas (outros pacientes/médicos/medicamentos) liberadas de uma vez no mesmo popup.
const H = require('../lib/harness.js');
const T = 'vicencia-pe';
function seed() {
  const t0 = new Date(Date.now() - 10 * 864e5).toISOString();
  const en = (id, nome, lote, q) => ({ medicamentoId: id, medicamentoNome: nome, tipo: 'entrada', quantidade: q, lote, validade: '01/2030', criadoEm: t0, date: t0.slice(0, 10), tenant_id: T });
  return { tenants: { [T]: { nome: 'Vicência', ativo: true } },
    medicamentos: { m1: { nome: 'Morfina 10mg/ml ampola', categoria: 'controlado', estoqueAtual: 20, tenant_id: T }, m2: { nome: 'Tramal 100mg/2ml ampola', categoria: 'controlado', estoqueAtual: 10, tenant_id: T } },
    entries: { e1: en('m1', 'Morfina 10mg/ml ampola', 'M1', 20), e2: en('m2', 'Tramal 100mg/2ml ampola', 'T1', 10) },
    pacientes_controlados: { p1: { nome: 'Maria Souza', tenant_id: T }, p2: { nome: 'José Lima', tenant_id: T } },
    saidas_controladas: {}, medicos_crm: {}, atas: {},
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
  ok(!!(await pg.$('[data-tour="ctrl-popup"]')), 'abre o popup de controlado');
  ok(!!(await pg.$('[data-fc="ctrl-add-saida"]')), 'tem o botão "Adicionar outra saída"');
  // primeira saída: Maria
  await pg.fill('input[placeholder="Buscar paciente cadastrado..."]', 'maria'); await pg.waitForTimeout(150);
  await pg.click('[data-tour="ctrl-popup"] button:has-text("Maria Souza")'); await pg.waitForTimeout(100);
  await pg.fill('[data-fc="medico-nome"]', 'Dr. Paulo'); await pg.fill('[data-fc="medico-crm"]', '12345');
  // extras
  await pg.click('[data-fc="ctrl-add-saida"]'); await pg.waitForTimeout(150);
  ok((await pg.inputValue('[data-fc="ctrl-extra-0"] [data-fc="medico-nome"]')) === 'Dr. Paulo', 'a saída extra já vem com o médico e CRM da primeira');
  await pg.selectOption('[data-fc="ctrl-extra-med-0"]', 'm1'); await pg.fill('[data-fc="ctrl-extra-qtd-0"]', '3');
  await pg.fill('[data-fc="ctrl-extra-pac-0"]', 'jose'); await pg.waitForTimeout(150);
  await pg.click('[data-fc="ctrl-extra-pac-pick"]'); await pg.waitForTimeout(100);
  await pg.click('[data-fc="ctrl-add-saida"]'); await pg.waitForTimeout(150);
  await pg.selectOption('[data-fc="ctrl-extra-med-1"]', 'm2'); await pg.fill('[data-fc="ctrl-extra-qtd-1"]', '4');
  await pg.fill('[data-fc="ctrl-extra-pac-1"]', 'Ana Nova'); await pg.waitForTimeout(150);
  await pg.click('[data-fc="ctrl-extra-pac-novo-1"]'); await pg.waitForTimeout(300);
  await pg.fill('[data-fc="ctrl-extra-1"] [data-fc="medico-nome"]', 'Dra. Clara'); await pg.fill('[data-fc="ctrl-extra-1"] [data-fc="medico-crm"]', '777');
  const rotulo = await pg.textContent('[data-tour="ctrl-popup"] button:has-text("Liberar")');
  ok(rotulo.includes('3 saídas'), 'o botão mostra "Liberar 3 saídas"');
  await pg.click('[data-tour="ctrl-popup"] button:has-text("Liberar")'); await pg.waitForTimeout(900);
  const s = await pg.evaluate(() => ({ sc: Object.values(window.__store.saidas_controladas), en: Object.values(window.__store.entries).filter((e) => e.tipo === 'saida') }));
  ok(s.sc.length === 3, '3 registros de controle gravados (' + s.sc.length + ')');
  ok(s.sc.some((x) => x.pacienteNome === 'José Lima' && x.medicamentoNome.startsWith('Morfina') && x.quantidade === 3 && x.medicoNome === 'Dr. Paulo'), 'José recebeu 3 de Morfina, com o médico/CRM');
  ok(s.sc.some((x) => x.pacienteNome === 'Ana Nova' && x.medicamentoNome.startsWith('Tramal') && x.quantidade === 4 && x.medicoCrm === '777'), 'Ana (nova) recebeu 4 de Tramal com outro médico');
  const sai = (n) => s.en.filter((e) => e.medicamentoNome.startsWith(n)).reduce((a, e) => a + e.quantidade, 0);
  ok(sai('Morfina') === 5 && sai('Tramal') === 4, 'estoque baixou: Morfina 2+3=5 e Tramal 4');
  ok(!(await pg.$('[data-tour="ctrl-popup"]')), 'popup fechou depois de liberar');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
