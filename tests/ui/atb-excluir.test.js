// ATB: gestor e técnico excluem um tratamento direto do cartão (sem marcar desistência); pop-up padrão; outros cargos não veem.
const H = require('../lib/harness.js');
const T = 'vicencia-pe';
function seed() {
  const hoje = new Date().toISOString().split('T')[0];
  return { tenants: { [T]: { nome: 'Vicência', ativo: true } },
    medicamentos: { m1: { nome: 'Ceftriaxona 1g ampola', categoria: 'injetavel', estoqueAtual: 20, tenant_id: T } }, entries: {}, atas: {},
    tratamentos_atb: {
      t1: { pacienteNome: 'Paciente Espera', status: 'espera', medicamentoId: 'm1', medicamentoNome: 'Ceftriaxona 1g ampola', dataInicio: hoje, doses: [], tenant_id: T, criadoEm: new Date().toISOString(), criadoPor: 'Tec' },
      t2: { pacienteNome: 'Paciente Tratamento', status: 'ativo', medicamentoId: 'm1', medicamentoNome: 'Ceftriaxona 1g ampola', dataInicio: hoje, diasTratamento: 5, dosesPorDia: 1, doses: [], tenant_id: T, criadoEm: new Date().toISOString(), criadoPor: 'Tec' } },
    medicos_crm: {}, users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {} };
}
async function abrir(br, role) {
  const user = { uid: 't1', name: 'Fulana', role };
  const o = { store: seed(), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role, status: 'approved', tenant_id: T };
  const r = await H.abrir(br, o);
  await r.pg.waitForSelector('.bnav-row [data-tour="nav-antibiotico"]', { timeout: 15000 });
  await r.pg.click('.bnav-row [data-tour="nav-antibiotico"]'); await r.pg.waitForTimeout(500);
  await r.pg.click('button:has-text("Todos")').catch(() => {}); await r.pg.waitForTimeout(300);
  return r;
}
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  for (const role of ['tecnico', 'gestor']) {
    const { pg, errs } = await abrir(br, role);
    const nativos = []; pg.on('dialog', (d) => { nativos.push(d.message()); d.accept().catch(() => {}); });
    const bts = await pg.$$('[data-fc="atb-excluir"]');
    ok(bts.length === 2, role + ': vê o botão "Excluir" em cada cartão (' + bts.length + ')');
    await bts[0].dispatchEvent('click'); await pg.waitForTimeout(300);
    const t = await pg.evaluate(() => document.body.innerText);
    ok(/Excluir o tratamento de/.test(t) && /não conta como desistência/.test(t) && nativos.length === 0, role + ': pede confirmação no pop-up do sistema, sem a caixa do navegador');
    const canc = await pg.$$('button:has-text("Cancelar")'); await canc[canc.length - 1].dispatchEvent('click'); await pg.waitForTimeout(300);
    ok(Object.keys(await pg.evaluate(() => window.__store.tratamentos_atb)).length === 2, role + ': cancelar mantém os dois tratamentos');
    await bts[0].dispatchEvent('click'); await pg.waitForTimeout(300);
    const conf = await pg.$$('button:has-text("Excluir")'); await conf[conf.length - 1].dispatchEvent('click'); await pg.waitForTimeout(500);
    const sobrou = await pg.evaluate(() => Object.values(window.__store.tratamentos_atb));
    ok(sobrou.length === 1 && sobrou.every((x) => x.status !== 'desistiu'), role + ': confirmar exclui um tratamento, sem marcar desistência');
    ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, role + ': sem erros JS ' + errs.join('|'));
    await pg.context().close();
  }
  const aux = await abrir(br, 'auxiliar');
  ok((await aux.pg.$$('[data-fc="atb-excluir"]')).length === 0, 'auxiliar não vê o botão de excluir');
  await aux.pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
