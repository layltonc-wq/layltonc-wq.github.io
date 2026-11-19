// Aba Ajuda: tópicos novos e ajustes por prefeitura (Itaquitinga x Vicência).
const H = require('../lib/harness.js');
function seed(T) {
  return { tenants: { [T]: { nome: T, ativo: true } }, medicamentos: {}, entries: {}, atas: {},
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {} };
}
async function rodar(br, T, ok) {
  const user = { uid: 't1', name: 'Tec', role: 'tecnico' };
  const o = { store: seed(T), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  const { pg, errs } = await H.abrir(br, o);
  await pg.waitForSelector('[data-tour="nav-menu"]', { timeout: 15000 });
  await pg.click('[data-tour="nav-menu"]');
  await pg.click('.menu-drawer-item[data-tour="nav-ajuda"]'); await pg.waitForTimeout(400);
  const t = await pg.evaluate(() => document.body.innerText);
  return { t, errs, pg };
}
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  let r = await rodar(br, 'itaquitinga-pe', ok);
  ok(r.t.includes('Permuta, Doação e Empréstimos') && r.t.includes('Pedidos por ata e Conferir pedidos') && r.t.includes('CAF, Satélite, transferência e solicitação') && r.t.includes('Médicos (CRM)'), 'Itaquitinga: tópicos novos aparecem');
  ok(!r.t.includes('UBS: validades'), 'Itaquitinga: não mostra tópico de validades das UBS (sem destinos)');
  ok(r.errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'Itaquitinga: sem erros JS ' + r.errs.join('|'));
  await r.pg.context().close();
  r = await rodar(br, 'vicencia-pe', ok);
  ok(r.t.includes('Permuta, Doação e Empréstimos') && !r.t.includes('Pedidos por ata e Conferir pedidos') && !r.t.includes('CAF, Satélite'), 'Vicência: só os tópicos que valem para ela');
  ok(r.errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'Vicência: sem erros JS ' + r.errs.join('|'));
  await r.pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
