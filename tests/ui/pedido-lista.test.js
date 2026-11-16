// Itaquitinga: aba "Pedidos" - todas as atas com itens/saldo/valor unitário (só leitura); digita-se a quantidade, "Finalizar pedido" filtra, fecha por ata ou todos.
const H = require('../lib/harness.js');
const T = 'itaquitinga-pe';
function seed() {
  return {
    tenants: { [T]: { nome: 'Itaquitinga', ativo: true } },
    medicamentos: {
      m1: { nome: 'Dipirona 500mg comprimido', categoria: 'medicamento', estoqueAtual: 10, tenant_id: T },
      m2: { nome: 'Amoxicilina 250mg suspensão', categoria: 'medicamento', estoqueAtual: 10, tenant_id: T }
    },
    entries: {},
    atas: {
      a1: { nome: 'Ata 001 - Fornecedor A', categoria: 'medicamento', tenant_id: T, itens: [
        { num: '1', descricao: 'Dipirona 500mg comprimido', medicamentoId: 'm1', qtdTeto: 1000, pedidoAcumulado: 400, vUnit: 0.1, unidade: 'CP' },
        { num: '2', descricao: 'Soro fisiológico 500ml', qtdTeto: 500, pedidoAcumulado: 0, vUnit: 2, unidade: 'FR' }] },
      a2: { nome: 'Ata 002 - Fornecedor B', categoria: 'medicamento', tenant_id: T, itens: [
        { num: '1', descricao: 'Dipirona 500mg comprimido', medicamentoId: 'm1', qtdTeto: 300, pedidoAcumulado: 0, vUnit: 0.12, unidade: 'CP' },
        { num: '2', descricao: 'Amoxicilina 250mg suspensão', medicamentoId: 'm2', qtdTeto: 200, pedidoAcumulado: 0, vUnit: 5, unidade: 'FR' }] }
    },
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {}
  };
}
const txt = (pg) => pg.evaluate(() => document.body.innerText);
const cartao = (nome) => (nome2) => null;
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  const user = { uid: 't1', name: 'Tec', role: 'tecnico' };
  const o = { store: seed(), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  const { pg, errs } = await H.abrir(br, o);
  await pg.waitForSelector('[data-fc="seletor-local"],[data-fc="chip-local"]', { timeout: 15000 });
  await pg.click('[data-tour="nav-menu"]');
  await pg.click('.menu-drawer-item[data-tour="nav-previsao"]'); await pg.waitForTimeout(600);
  let t = await txt(pg);
  ok((await pg.$$('[data-fc="lp-tela"]')).length === 1 && (await pg.$$('[data-fc="lp-ata"]')).length === 2, 'abre direto em "Pedidos" com todas as atas');
  ok(!(await pg.$('[data-fc="lp-texto"]')) && t.includes('🧾 Pedidos') || t.includes('Pedidos'), 'a parte de colar lista foi retirada');
  const abrirAta = async (nome) => pg.evaluate((n) => { Array.from(document.querySelectorAll('[data-fc="lp-ata"]')).find((c) => c.innerText.includes(n)).querySelector('[data-fc="lp-ata-cab"]').click(); }, nome);
  await abrirAta('Ata 001'); await pg.waitForTimeout(200);
  t = await txt(pg);
  ok(t.includes('Dipirona 500mg comprimido') && t.includes('Saldo 600') && t.includes('V. unit. R$ 0,10'), 'a ata mostra item, saldo (600) e valor unitário');
  ok((await pg.$$('[data-fc="lp-vunit"]')).length >= 2 && !(await pg.$('input[data-fc="lp-vunit"]')), 'valor unitário é só texto (não editável)');
  // pesquisa dentro da ata
  await pg.fill('[data-fc="lp-busca-ata"]', 'soro'); await pg.waitForTimeout(150);
  ok((await pg.$$('[data-fc="lp-item"]')).length === 1, 'a lupa da ata filtra os itens (soro)');
  await pg.fill('[data-fc="lp-busca-ata"]', '');
  // digitar quantidades
  const digitar = (nomeAta, nomeItem, v) => pg.evaluate(([n, i, val]) => {
    const c = Array.from(document.querySelectorAll('[data-fc="lp-ata"]')).find((x) => x.innerText.includes(n));
    const it = Array.from(c.querySelectorAll('[data-fc="lp-item"]')).find((x) => x.innerText.includes(i));
    const inp = it.querySelector('[data-fc="lp-qtd"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(inp, val); inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, [nomeAta, nomeItem, v]);
  await digitar('Ata 001', 'Dipirona', '200'); await pg.waitForTimeout(150);
  await abrirAta('Ata 002'); await pg.waitForTimeout(200);
  await digitar('Ata 002', 'Amoxicilina', '50'); await pg.waitForTimeout(150);
  await digitar('Ata 002', 'Dipirona', '5000'); await pg.waitForTimeout(150);
  ok((await txt(pg)).includes('passa do saldo'), 'avisa quando passa do saldo');
  await digitar('Ata 002', 'Dipirona', '100'); await pg.waitForTimeout(150);
  t = await txt(pg);
  ok(/2 ata\(s\) · 3 item\(ns\)/.test(t), 'rodapé soma atas e itens escolhidos');
  // finalizar -> só atas com itens, só itens escolhidos
  await pg.click('[data-fc="lp-finalizar"]'); await pg.waitForTimeout(300);
  ok((await pg.$$('[data-fc="lp-ata"]')).length === 2 && (await pg.$$('[data-fc="lp-item"]')).length === 3, 'Finalizar pedido mostra só as atas e itens escolhidos (3 itens)');
  t = await txt(pg);
  ok(!t.includes('Soro fisiológico'), 'itens não escolhidos ficam escondidos na revisão');
  await pg.evaluate(() => { Array.from(document.querySelectorAll('[data-fc="lp-ata"]')).find((c) => c.innerText.includes('Ata 001')).querySelector('[data-fc="lp-todos"]').click(); });
  await pg.waitForTimeout(200);
  ok((await txt(pg)).includes('Soro fisiológico'), '"Ver todos os itens da ata" mostra o resto');
  // fechar todos
  await pg.click('[data-fc="lp-fechar-todos"]'); await pg.waitForTimeout(400);
  await pg.locator('button:has-text("Fechar pedido")').last().click();
  await pg.waitForTimeout(800);
  const atas = await pg.evaluate(() => window.__store.atas);
  ok(atas.a1.itens[0].pedidoAcumulado === 600 && atas.a2.itens[0].pedidoAcumulado === 100 && atas.a2.itens[1].pedidoAcumulado === 50, 'Fechar todos desconta o saldo de cada ata');
  ok((atas.a1.historicoPedidos || []).length === 1 && (atas.a2.historicoPedidos || []).length === 1, 'cada ata ganhou seu registro de pedido (para conferir/desfazer)');
  t = await txt(pg);
  ok(!(await pg.$('[data-fc="lp-voltar"]')) && (await pg.$$('[data-fc="lp-ata"]')).length === 2, 'depois de fechar volta para a lista de todas as atas');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
