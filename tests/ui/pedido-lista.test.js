// Itaquitinga: "Pedido por lista" (previsão/pedido) - lista de faltas separada por ata, saldo, fechar por ata e "fechar todos".
const H = require('../lib/harness.js');
const T = 'itaquitinga-pe';
function seed() {
  const t0 = new Date(Date.now() - 20 * 864e5).toISOString();
  const en = (id, nome, q) => ({ medicamentoId: id, medicamentoNome: nome, tipo: 'entrada', quantidade: q, lote: 'L1', validade: '01/2030', criadoEm: t0, date: t0.slice(0, 10), tenant_id: T, local: 'caf' });
  return {
    tenants: { [T]: { nome: 'Itaquitinga', ativo: true } },
    medicamentos: {
      m1: { nome: 'Dipirona 500mg comprimido', categoria: 'medicamento', estoqueAtual: 10, tenant_id: T },
      m2: { nome: 'Amoxicilina 250mg suspensão', categoria: 'medicamento', estoqueAtual: 10, tenant_id: T },
      m3: { nome: 'Omeprazol 20mg cápsula', categoria: 'medicamento', estoqueAtual: 10, tenant_id: T }
    },
    entries: { e1: en('m1', 'Dipirona 500mg comprimido', 10), e2: en('m2', 'Amoxicilina 250mg suspensão', 10), e3: en('m3', 'Omeprazol 20mg cápsula', 10) },
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
async function abrir(br) {
  const user = { uid: 't1', name: 'Tec', role: 'tecnico' };
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
  const { pg, errs } = await abrir(br);
  await pg.click('[data-tour="nav-menu"]');
  await pg.click('.menu-drawer-item[data-tour="nav-previsao"]'); await pg.waitForTimeout(600);
  ok((await pg.$$('[data-fc="lp-tela"]')).length === 1, 'Itaquitinga abre direto no "Pedido por lista"');

  await pg.fill('[data-fc="lp-texto"]', 'Dipirona 500mg 200\nAmoxicilina 250 - 50\n100 Omeprazol\nxyz coisa 5');
  await pg.click('[data-fc="lp-ler"]'); await pg.waitForTimeout(400);
  let t = await txt(pg);
  const cards = await pg.$$('[data-fc="lp-ata"]');
  ok(cards.length === 2, 'a lista foi separada em 2 cartões de ata (' + cards.length + ')');
  ok(t.includes('Ata 001 - Fornecedor A') && t.includes('Ata 002 - Fornecedor B'), 'cada ata aparece com seu nome');
  const qtdsA = await pg.evaluate(() => Array.from(document.querySelectorAll('[data-fc="lp-ata"]')[0].querySelectorAll('[data-fc="lp-qtd"]')).map((i) => i.value));
  ok(qtdsA.join() === '200', 'Dipirona 200 foi para a ata de maior saldo (A): ' + qtdsA.join());
  ok(t.includes('saldo 600') && t.includes('Também está em') && t.includes('Ata 002 - Fornecedor B · saldo 300'), 'mostra saldo e avisa que a Dipirona também está em outra ata');
  ok(!!(await pg.$('[data-fc="lp-semata"]')) && t.includes('Omeprazol'), 'Omeprazol (sem ata) vai para o bloco "Sem ata"');
  ok(!!(await pg.$('[data-fc="lp-pend"]')) && t.includes('xyz coisa 5'), 'linha não reconhecida fica para conferir');
  // trocar a Dipirona de ata
  await pg.click('[data-fc="lp-mover"]'); await pg.waitForTimeout(300);
  const nomesB = await pg.evaluate(() => document.querySelectorAll('[data-fc="lp-ata"]')[1] ? document.querySelectorAll('[data-fc="lp-ata"]')[1].innerText : '');
  ok(nomesB.includes('Dipirona') || (await pg.evaluate(() => Array.from(document.querySelectorAll('[data-fc="lp-ata"]')).some((c) => c.innerText.includes('Ata 002') && c.innerText.includes('Dipirona')))), 'mover a Dipirona para a outra ata funciona');
  await pg.waitForTimeout(200);
  // ver mais itens da ata: tira a Amoxicilina da ata B, abre "ver mais" e adiciona de volta
  const cardB = () => Array.from(document.querySelectorAll('[data-fc="lp-ata"]')).find((c) => c.innerText.includes('Ata 002'));
  await pg.evaluate(() => { const c = Array.from(document.querySelectorAll('[data-fc="lp-ata"]')).find((x) => x.innerText.includes('Ata 002')); const it = Array.from(c.querySelectorAll('[data-fc="lp-item"]')).find((x) => x.innerText.includes('Amoxicilina')); it.querySelector('[data-fc="lp-remover"]').click(); });
  await pg.waitForTimeout(200);
  await pg.evaluate(() => { Array.from(document.querySelectorAll('[data-fc="lp-ata"]')).find((x) => x.innerText.includes('Ata 002')).querySelector('[data-fc="lp-mais"]').click(); });
  await pg.waitForTimeout(200);
  ok((await pg.evaluate(() => Array.from(document.querySelectorAll('[data-fc="lp-resto"]')).map((x) => x.innerText).join('|'))).includes('Amoxicilina'), '"Ver mais itens desta ata" mostra os itens da ata que ainda não estão no pedido');
  await pg.evaluate(() => { Array.from(document.querySelectorAll('[data-fc="lp-ata"]')).find((x) => x.innerText.includes('Ata 002')).querySelector('[data-fc="lp-resto"] button').click(); });
  await pg.waitForTimeout(200);
  await pg.evaluate(() => { const c = Array.from(document.querySelectorAll('[data-fc="lp-ata"]')).find((x) => x.innerText.includes('Ata 002')); const it = Array.from(c.querySelectorAll('[data-fc="lp-item"]')).find((x) => x.innerText.includes('Amoxicilina')); it.querySelector('[data-fc="lp-qtd"]').focus(); });
  await pg.keyboard.type('50'); await pg.waitForTimeout(200);
  // aviso de passar do saldo
  await pg.evaluate(() => { const c = Array.from(document.querySelectorAll('[data-fc="lp-ata"]')).find((x) => x.innerText.includes('Ata 002')); const i = c.querySelector('[data-fc="lp-qtd"]'); i.focus(); });
  await pg.keyboard.press('Control+A'); await pg.keyboard.type('5000'); await pg.waitForTimeout(200);
  ok((await txt(pg)).includes('passa do saldo'), 'avisa quando a quantidade passa do saldo da ata');
  await pg.keyboard.press('Control+A'); await pg.keyboard.type('100'); await pg.waitForTimeout(200);

  // busca por medicamento mostra as atas onde está
  await pg.fill('[data-fc="lp-busca"]', 'amoxi'); await pg.waitForTimeout(250);
  ok(!!(await pg.$('[data-fc="lp-add"]')), 'busca por medicamento mostra a ata onde ele está');
  await pg.fill('[data-fc="lp-busca"]', '');
  ok((await pg.$$('[data-fc="lp-item"]')).length >= 2, 'itens listados nos cartões');

  // fechar todos
  await pg.click('[data-fc="lp-fechar-todos"]'); await pg.waitForTimeout(400);
  const confirma = await pg.$('button:has-text("Fechar pedido")');
  if (confirma) await confirma.click();
  await pg.waitForTimeout(800);
  const atas = await pg.evaluate(() => window.__store.atas);
  const ped = (a, id) => atas[a].itens.filter((i) => i.medicamentoId === id)[0].pedidoAcumulado;
  ok(ped('a2', 'm1') === 100 && ped('a2', 'm2') === 50, 'Fechar todos desconta do saldo de cada ata (A2: dipirona 100, amoxicilina 50)');
  ok(ped('a1', 'm1') === 400 && (atas.a2.historicoPedidos || []).length === 1, 'a ata que não tinha pedido não mudou; histórico gravado para desfazer');
  t = await txt(pg);
  ok(!(await pg.$('[data-fc="lp-ata"]')), 'depois de fechar, as atas saem da lista (sobra só o que ficou sem ata)');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
