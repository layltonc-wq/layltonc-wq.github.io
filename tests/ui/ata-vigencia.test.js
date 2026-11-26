// Gerenciar Atas: dia da licitação + vigência da ata, com aviso de "próxima de vencer" (90 dias) e "vencida".
const H = require('../lib/harness.js');
const T = 'itaquitinga-pe';
const iso = (d) => { const x = new Date(Date.now() + d * 864e5); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
function seed() {
  const it = [{ num: '1', descricao: 'Dipirona 500mg', qtdTeto: 100, pedidoAcumulado: 0, vUnit: 1, unidade: 'CP' }];
  return { tenants: { [T]: { nome: 'Itaquitinga', ativo: true } }, medicamentos: {}, entries: {},
    atas: {
      a1: { nome: 'Ata Longa', categoria: 'medicamento', tenant_id: T, itens: it, vigenciaAte: iso(300) },
      a2: { nome: 'Ata Proxima', categoria: 'medicamento', tenant_id: T, itens: it, dataLicitacao: iso(-300), vigenciaAte: iso(30) },
      a3: { nome: 'Ata Vencida', categoria: 'medicamento', tenant_id: T, itens: it, vigenciaAte: iso(-5) },
      a4: { nome: 'Ata Sem Data', categoria: 'medicamento', tenant_id: T, itens: it } },
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {} };
}
// abre o editor da ata pelo nome (percorre os botões Editar e confere o campo Nome)
async function editar(pg, nome) {
  for (const b of await pg.$$('button:has-text("✏️ Editar")')) {
    await b.click(); await pg.waitForTimeout(250);
    if (!(await pg.$('[data-fc="ata-licitacao"]'))) continue;
    const n = await pg.$eval('input[placeholder="Ex: MEDIAL 2025"]', (e) => e.value);
    if (n === nome) return true;
    await pg.click('button:has-text("✖ Cancelar")'); await pg.waitForTimeout(200);
  }
  return false;
}
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  const user = { uid: 't1', name: 'Tec', role: 'tecnico' };
  const o = { store: seed(), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  const { pg, errs } = await H.abrir(br, o);
  await pg.waitForSelector('[data-tour="nav-menu"]', { timeout: 15000 });
  await pg.click('[data-tour="nav-menu"]'); await pg.click('.menu-drawer-item[data-tour="nav-previsao"]'); await pg.waitForTimeout(500);
  await pg.click('button.pill:has-text("Gerenciar Atas")'); await pg.waitForTimeout(400);
  const ban = await pg.$eval('[data-fc="atas-vig-banner"]', (e) => e.innerText).catch(() => '');
  ok(ban.includes('Ata Proxima') && ban.includes('Ata Vencida') && !ban.includes('Ata Longa') && !ban.includes('Sem Data'), 'aviso no topo lista só a ata próxima de vencer e a vencida');
  ok(/Ata Vencida[^]*venceu em/.test(ban) && /Ata Proxima[^]*faltam 30 dia/.test(ban), 'aviso mostra "venceu" e "faltam 30 dias"');
  const txt = await pg.evaluate(() => document.body.innerText);
  ok(txt.includes('Vence em 30 dia') && txt.includes('Vencida há 5 dia'), 'cartões mostram "Vence em 30 dias" e "Vencida há 5 dias"');
  ok(txt.includes('Vigente até'), 'cartão mostra a data de vigência');
  ok(await editar(pg, 'Ata Sem Data'), 'abre o editor da ata sem datas');
  await pg.fill('[data-fc="ata-licitacao"]', iso(-10)); await pg.fill('[data-fc="ata-vigencia"]', iso(400));
  await pg.click('button:has-text("✅ Salvar")'); await pg.waitForTimeout(600);
  const a4 = await pg.evaluate(() => window.__store.atas.a4);
  ok(a4.dataLicitacao === iso(-10) && a4.vigenciaAte === iso(400), 'salva o dia da licitação e a vigência');
  ok(!(await pg.$eval('[data-fc="atas-vig-banner"]', (e) => e.innerText)).includes('Ata Sem Data'), 'ata com vigência longa não entra no aviso');
  ok(await editar(pg, 'Ata Longa'), 'abre o editor da outra ata');
  await pg.fill('[data-fc="ata-licitacao"]', iso(100)); await pg.fill('[data-fc="ata-vigencia"]', iso(50));
  await pg.click('button:has-text("✅ Salvar")'); await pg.waitForTimeout(500);
  ok((await pg.evaluate(() => window.__store.atas.a1.vigenciaAte)) === iso(300), 'validade antes da licitação é recusada (não grava)');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
