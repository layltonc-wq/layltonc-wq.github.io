// Doação feita, permuta (o que saiu) e empréstimo (emprestamos): mostram o estoque e deixam escolher o lote que sai.
const H = require('../lib/harness.js');
const T = 'itaquitinga-pe';
function seed() {
  const t0 = new Date(Date.now() - 10 * 864e5).toISOString();
  const en = (lote, val, q) => ({ medicamentoId: 'm1', medicamentoNome: 'Dipirona 500mg', tipo: 'entrada', quantidade: q, lote, validade: val, criadoEm: t0, date: t0.slice(0, 10), tenant_id: T });
  return { tenants: { [T]: { nome: T, ativo: true } },
    medicamentos: { m1: { nome: 'Dipirona 500mg', categoria: 'medicamento', estoqueAtual: 60, tenant_id: T }, m2: { nome: 'Paracetamol 750mg', categoria: 'medicamento', estoqueAtual: 0, tenant_id: T } },
    entries: { e1: en('L1', '01/2028', 10), e2: en('L2', '01/2031', 50) }, atas: {},
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {} };
}
const confirmar = async (pg, rotulo) => { const b = await pg.$$('button:has-text("' + rotulo + '")'); await b[b.length - 1].dispatchEvent('click'); await pg.waitForTimeout(500); };
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  const user = { uid: 't1', name: 'Tec', role: 'tecnico' };
  const o = { store: seed(), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  const { pg, errs } = await H.abrir(br, o);
  await pg.waitForSelector('.bnav-row [data-tour="nav-recebimento"]', { timeout: 15000 });
  await pg.click('.bnav-row [data-tour="nav-recebimento"]'); await pg.waitForTimeout(400);
  const saidas = () => pg.evaluate(() => Object.values(window.__store.entries).filter((e) => e.tipo === 'saida' && e.entradaEspecial));
  // ---- empréstimo
  await pg.click('[data-fc="modo-emprestimo"]'); await pg.waitForTimeout(200);
  await pg.fill('[data-fc="emp-parceiro"]', 'Hospital X');
  await pg.fill('[data-fc="emp-busca"]', 'dipi'); await pg.waitForTimeout(250);
  ok((await pg.textContent('[data-fc="pick"]')).includes('estoque 60'), 'a busca mostra o estoque do medicamento (estoque 60)');
  await pg.click('[data-fc="pick"]'); await pg.waitForTimeout(250);
  ok((await pg.textContent('[data-fc="emp-estoque"]')).trim() === '60', 'depois de escolher, mostra "Em estoque: 60"');
  ok((await pg.textContent('[data-fc="emp-lotes"]')).includes('vence primeiro'), 'sem escolher, avisa que sai o lote que vence primeiro');
  await pg.click('[data-fc="emp-escolher"]'); await pg.waitForTimeout(150);
  ok((await pg.$$('[data-fc="emp-lote-op"]')).length === 2, 'lista os 2 lotes com saldo');
  await pg.click('[data-fc="emp-lote-op"]:has-text("L2")'); await pg.waitForTimeout(150);
  ok((await pg.textContent('[data-fc="emp-lotes"]')).includes('saindo do lote'), 'mostra qual lote vai sair');
  await pg.fill('[data-fc="emp-qtd"]', '5'); await pg.click('[data-fc="emp-salvar"]'); await pg.waitForTimeout(300); await confirmar(pg, 'Emprestar');
  let s = await saidas();
  ok(s.length === 1 && s[0].lote === 'L2' && s[0].quantidade === 5, 'empréstimo saiu do lote escolhido (L2), não do que vence primeiro');
  // quantidade maior que o lote escolhido
  await pg.fill('[data-fc="emp-parceiro"]', 'Hospital X');
  await pg.fill('[data-fc="emp-busca"]', 'dipi'); await pg.waitForTimeout(250); await pg.click('[data-fc="pick"]'); await pg.waitForTimeout(200);
  await pg.click('[data-fc="emp-escolher"]'); await pg.click('[data-fc="emp-lote-op"]:has-text("L1")'); await pg.waitForTimeout(150);
  await pg.fill('[data-fc="emp-qtd"]', '30'); await pg.click('[data-fc="emp-salvar"]'); await pg.waitForTimeout(400);
  ok(/o lote L1 tem só 10/.test(await pg.evaluate(() => document.body.innerText)), 'quantidade maior que o saldo do lote escolhido é recusada com aviso');
  // ---- doação feita
  await pg.click('[data-fc="modo-doacao"]'); await pg.click('[data-fc="doa-sentido-feita"]'); await pg.waitForTimeout(150);
  await pg.fill('[data-fc="origem"]', 'Hospital Y');
  await pg.fill('[data-fc="doa-busca-0"]', 'dipi'); await pg.waitForTimeout(250); await pg.click('[data-fc="pick"]'); await pg.waitForTimeout(200);
  ok((await pg.textContent('[data-fc="doa-0-estoque"]')).trim() === '55', 'doação: mostra o estoque atual (55)');
  await pg.click('[data-fc="doa-0-escolher"]'); await pg.click('[data-fc="doa-0-lote-op"]:has-text("L1")'); await pg.waitForTimeout(150);
  await pg.fill('[data-fc="doa-qtd-0"]', '4'); await pg.click('[data-fc="ent-salvar"]'); await pg.waitForTimeout(300); await confirmar(pg, 'Registrar');
  s = await saidas();
  ok(s.some((x) => x.entradaEspecial === 'doacao' && x.lote === 'L1' && x.quantidade === 4), 'doação saiu do lote escolhido (L1)');
  // ---- permuta
  await pg.click('[data-fc="modo-permuta"]'); await pg.waitForTimeout(200);
  await pg.fill('[data-fc="origem"]', 'Hospital Z');
  await pg.fill('[data-fc="perm-sai-busca"]', 'dipi'); await pg.waitForTimeout(250); await pg.click('[data-fc="pick"]'); await pg.waitForTimeout(200);
  await pg.click('[data-fc="perm-sai-escolher"]'); await pg.click('[data-fc="perm-sai-lote-op"]:has-text("L2")'); await pg.waitForTimeout(150);
  await pg.fill('[data-fc="perm-sai-qtd"]', '3');
  await pg.fill('[data-fc="perm-ent-busca"]', 'parac'); await pg.waitForTimeout(250); await pg.click('[data-fc="pick"]'); await pg.waitForTimeout(200);
  await pg.fill('[data-fc="perm-ent-qtd"]', '2'); await pg.click('[data-fc="perm-pend"]');
  await pg.click('[data-fc="ent-salvar"]'); await pg.waitForTimeout(300); await confirmar(pg, 'Registrar');
  s = await saidas();
  ok(s.some((x) => x.entradaEspecial === 'permuta' && x.lote === 'L2' && x.quantidade === 3), 'permuta: o item que saiu veio do lote escolhido (L2)');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
