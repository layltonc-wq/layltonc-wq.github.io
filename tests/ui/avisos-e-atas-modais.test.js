// (1) Gerenciar Atas usa os pop-ups do sistema (nada de confirm/alert do navegador); (2) Administração: tela de avisos por e-mail/WhatsApp.
const H = require('../lib/harness.js');
const T = 'itaquitinga-pe';
function seed() {
  return { tenants: { [T]: { nome: 'Itaquitinga', ativo: true } },
    medicamentos: { m1: { nome: 'Dipirona 500mg', categoria: 'medicamento', estoqueAtual: 10, tenant_id: T } }, entries: {},
    atas: { a1: { nome: 'Ata 001 - Fornecedor A', categoria: 'medicamento', tenant_id: T, itens: [
      { num: '1', descricao: 'Dipirona 500mg comprimido', medicamentoId: 'm1', qtdTeto: 1000, pedidoAcumulado: 600, vUnit: 0.1, unidade: 'CP' },
      { num: '2', descricao: 'Amoxicilina 250mg', qtdTeto: 200, pedidoAcumulado: 100, vUnit: 5, unidade: 'FR' }] } },
    super_admins: { t1: { ok: true } }, config_avisos: {}, erros_app: {}, chamados_suporte: {},
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {} };
}
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  const user = { uid: 't1', name: 'Tec', role: 'tecnico' };
  const o = { store: seed(), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  const { pg, errs } = await H.abrir(br, o);
  const nativos = []; pg.on('dialog', (d) => { nativos.push(d.message()); d.accept().catch(() => {}); });
  await pg.waitForSelector('[data-tour="nav-menu"]', { timeout: 15000 });
  const irMenu = async (id) => { await pg.click('[data-tour="nav-menu"]'); await pg.click('.menu-drawer-item[data-tour="nav-' + id + '"]'); await pg.waitForTimeout(500); };
  // ---- Atas: zerar pedido acumulado de um item usa o modal
  await irMenu('previsao');
  await pg.click('button.pill:has-text("Gerenciar Atas")'); await pg.waitForTimeout(400);
  const textoAta = await pg.evaluate(() => document.body.innerText);
  ok(textoAta.includes('Ata 001'), 'Gerenciar Atas lista a ata');
  const botoes = await pg.$$('button:has-text("🗑️")');
  if (botoes.length) {
    await botoes[0].dispatchEvent('click'); await pg.waitForTimeout(300);
    ok(nativos.length === 0, 'excluir ata não abre a caixa do navegador');
    ok(await pg.evaluate(() => /Excluir a ata/.test(document.body.innerText)), 'excluir ata mostra o pop-up do sistema');
    const nao = await pg.$$('button:has-text("Cancelar")'); if (nao.length) await nao[nao.length - 1].dispatchEvent('click');
    await pg.waitForTimeout(200);
    ok(!!(await pg.evaluate(() => window.__store.atas.a1)), 'cancelar mantém a ata');
  } else ok(false, 'botão Excluir da ata encontrado');
  // ---- Administração: avisos
  await irMenu('superadmin');
  await pg.click('button:has-text("Suporte: chamados e erros")'); await pg.waitForTimeout(300);
  ok(!!(await pg.$('[data-fc="avisos-config"]')), 'Administração mostra a configuração dos avisos');
  ok(await pg.evaluate(() => document.querySelector('[data-fc="aviso-testar"]').disabled), 'o teste fica bloqueado enquanto os avisos estão desligados');
  await pg.check('[data-fc="aviso-ativo"]');
  await pg.fill('[data-fc="aviso-emailPara"]', 'eu@exemplo.com'); await pg.fill('[data-fc="aviso-emailDe"]', 'conta@gmail.com'); await pg.fill('[data-fc="aviso-emailSenha"]', 'abcd efgh ijkl mnop');
  await pg.fill('[data-fc="aviso-whatsappFone"]', '+55 81 99999-0000'); await pg.fill('[data-fc="aviso-whatsappChave"]', '123456');
  await pg.click('[data-fc="aviso-salvar"]'); await pg.waitForTimeout(400);
  const cfg = await pg.evaluate(() => window.__store.config_avisos.principal);
  ok(cfg && cfg.ativo === true && cfg.emailPara === 'eu@exemplo.com' && cfg.whatsappChave === '123456' && cfg.avisarErros === true, 'salvar grava a configuração');
  await pg.click('[data-fc="aviso-testar"]'); await pg.waitForTimeout(400);
  const teste = await pg.evaluate(() => Object.values(window.__store.erros_app).filter((e) => e.teste === true));
  ok(teste.length === 1 && /Teste de aviso/.test(teste[0].mensagem), 'o botão de teste cria o erro de teste');
  ok(nativos.length === 0, 'nenhuma caixa nativa do navegador apareceu');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
