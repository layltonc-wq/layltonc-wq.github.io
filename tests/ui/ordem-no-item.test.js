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
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  const user = { uid: 't1', name: 'Tec', role: 'tecnico' };
  const st = seed();
  st.atas.a1.itens[1].ordemFornecimento = 'hospital';
  st.atas.a1.itens[0].ordemFornecimento = 'atencao_basica';
  const o = { store: st, uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  const { pg, errs } = await H.abrir(br, o);
  await pg.waitForSelector('[data-fc="seletor-local"],[data-fc="chip-local"]', { timeout: 15000 });
  await pg.click('[data-tour="nav-menu"]');
  await pg.click('.menu-drawer-item[data-tour="nav-previsao"]'); await pg.waitForTimeout(600);
  await pg.click('[data-fc="lp-cat-cab"]'); await pg.waitForTimeout(200);
  await pg.evaluate(() => { Array.from(document.querySelectorAll('[data-fc="lp-ata"]')).find((c) => c.innerText.includes('Ata 001')).querySelector('[data-fc="lp-ata-cab"]').click(); });
  await pg.waitForTimeout(200);
  const sels = await pg.$$('[data-fc="lp-of"]');
  ok(sels.length === 2, 'cada item da ata mostra o seletor de Ordem de Fornecimento');
  ok((await sels[1].inputValue()) === 'hospital' && (await sels[0].inputValue()) === 'atencao_basica', 'mostra a ordem já definida e deixa vazio o que falta');
  await sels[0].selectOption('hospital_controlado'); await pg.waitForTimeout(300);
  const atas = await pg.evaluate(() => window.__store.atas);
  ok(atas.a1.itens[0].ordemFornecimento === 'hospital_controlado', 'escolher no item grava a ordem na ata');
  ok(atas.a1.itens[1].ordemFornecimento === 'hospital' && atas.a1.itens[0].qtdTeto === 1000, 'não altera os outros itens/campos');
  ok((await pg.$$('[data-fc="lp-of"]'))[0] && (await (await pg.$$('[data-fc="lp-of"]'))[0].inputValue()) === 'hospital_controlado', 'o seletor mostra o valor salvo');
  const tp = await pg.$('[data-fc="lp-tipo"]');
  ok(!!tp, 'a ata mostra o seletor do título da ordem (Medicamentos/Injetáveis/...)');
  await tp.selectOption('INJETÁVEIS'); await pg.waitForTimeout(300);
  ok((await pg.evaluate(() => window.__store.atas.a1.tipoOrdem)) === 'INJETÁVEIS', 'escolher o tipo grava na ata');
  const setQ = (i, v) => pg.evaluate(([i, v]) => { const c = Array.from(document.querySelectorAll('[data-fc="lp-ata"]')).find((x) => x.innerText.includes('Ata 001')); const inp = c.querySelectorAll('[data-fc="lp-qtd"]')[i]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); }, [i, v]);
  await setQ(0, '10'); await setQ(1, '20'); await pg.waitForTimeout(200);
  await pg.click('[data-fc="lp-finalizar"]'); await pg.waitForTimeout(300);
  ok((await pg.$$('[data-fc="lp-grupo-of"]')).length === 2, 'Finalizar separa os itens em blocos por Ordem de Fornecimento');
  const sel2 = await pg.$$('[data-fc="lp-tipo-of"]');
  await sel2[1].selectOption('INJETÁVEIS'); await pg.waitForTimeout(300);
  const a1 = await pg.evaluate(() => window.__store.atas.a1);
  ok(Object.values(a1.tipoOrdemPorOf || {}).join() === 'INJETÁVEIS' && Object.keys(a1.tipoOrdemPorOf).length === 1, 'título escolhido por bloco grava só naquela ordem');
  ok((await txt(pg)).includes('INJETÁVEIS - '), 'o bloco mostra o título novo');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
