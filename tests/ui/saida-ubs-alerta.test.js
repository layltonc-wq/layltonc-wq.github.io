// Vicencia: ao dar saida para UBS com lote vencido/vencendo, o sistema pede confirmacao; para SUS nao.
const H = require('../lib/harness.js');
const T = 'vicencia-pe';

function seed() {
  const t0 = new Date(Date.now() - 40 * 864e5).toISOString();
  return {
    tenants: { [T]: { nome: 'V', ativo: true } },
    medicamentos: { m1: { nome: 'Dipirona 500mg', categoria: 'medicamento', estoqueAtual: 100, tenant_id: T } },
    entries: { e0: { medicamentoId: 'm1', medicamentoNome: 'Dipirona 500mg', tipo: 'entrada', quantidade: 100, lote: 'L1', validade: '01/2020', criadoEm: t0, date: t0.slice(0, 10), tenant_id: T } },
    users: { u1: { name: 'A', role: 'tecnico', status: 'approved', tenant_id: T } },
    config: { ['destinos__' + T]: { destinos: null, ubs: [{ id: 'u0', nome: 'Joao Ramos', ativo: true }] } },
    plantoes: {}, reposicoes: {}, ubs_conferencias: {}
  };
}
async function rodar(br, destinoTexto, resposta) {
  const o = { store: seed(), uid: 'u1', tenant: T, user: { uid: 'u1', name: 'A', role: 'tecnico', status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 } };
  const { pg } = await H.abrir(br, o);
  const dialogos = [];
  pg.removeAllListeners('dialog');
  pg.on('dialog', (d) => { dialogos.push(d.message()); resposta === 'sim' ? d.accept() : d.dismiss(); });
  await pg.click('[data-tour="nav-saida"]');
  await pg.waitForTimeout(300);
  await pg.click('button:has-text("' + destinoTexto + '")>>nth=0');
  if (destinoTexto === 'UBS') await pg.selectOption('select', 'Joao Ramos');
  await pg.fill('input[placeholder="Digite o nome do medicamento..."]', 'Dipi');
  await pg.waitForTimeout(300);
  await pg.click('text=Dipirona 500mg >> nth=0');
  await pg.waitForTimeout(200);
  await pg.click('button:has-text("10") >> nth=0');
  await pg.click('button:has-text("Registrar saída para")');
  await pg.waitForTimeout(500);
  const saidas = await pg.evaluate(() => Object.values(window.__store.entries).filter((e) => e.tipo === 'saida'));
  await pg.context().close();
  return { dialogos, saidas };
}

(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  let r = await rodar(br, 'UBS', 'sim');
  ok(r.dialogos.length === 1 && r.dialogos[0].includes('VENCIDO') && r.dialogos[0].includes('lote L1'), 'saida para UBS com lote vencido pede confirmacao e cita o lote');
  ok(r.saidas.length === 1 && r.saidas[0].ubsNome === 'Joao Ramos', 'confirmando, a saida e registrada para a UBS');
  r = await rodar(br, 'UBS', 'nao');
  ok(r.dialogos.length === 1 && r.saidas.length === 0, 'recusando a confirmacao, nada e registrado');
  r = await rodar(br, 'SUS (usuário)', 'sim');
  ok(r.dialogos.length === 0 && r.saidas.length === 1, 'saida para SUS nao pede confirmacao');
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
