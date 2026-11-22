// Comprovante em PDF (impressão) de doação, permuta e empréstimo, com o logo e o cabeçalho da prefeitura.
const H = require('../lib/harness.js');
function seed(T, nomeTenant) {
  const t0 = new Date(Date.now() - 10 * 864e5).toISOString();
  const en = (id, nome, lote, q) => ({ medicamentoId: id, medicamentoNome: nome, tipo: 'entrada', quantidade: q, lote, validade: '01/2030', criadoEm: t0, date: t0.slice(0, 10), tenant_id: T });
  return { tenants: { [T]: { nome: nomeTenant || T, ativo: true } },
    medicamentos: { m1: { nome: 'Dipirona 500mg', categoria: 'medicamento', estoqueAtual: 50, tenant_id: T }, m2: { nome: 'Paracetamol 750mg', categoria: 'medicamento', estoqueAtual: 40, tenant_id: T } },
    entries: { e1: en('m1', 'Dipirona 500mg', 'L1', 50), e2: en('m2', 'Paracetamol 750mg', 'P1', 40) }, atas: {},
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {} };
}
async function pick(pg, fc, termo, nome) {
  await pg.fill('[data-fc="' + fc + '"]', termo); await pg.waitForTimeout(200);
  await pg.click('[data-fc="pick"]:has-text("' + nome + '")'); await pg.waitForTimeout(150);
}
const confirmar = async (pg, rotulo) => { const b = await pg.$$('button:has-text("' + rotulo + '")'); await b[b.length - 1].dispatchEvent('click'); await pg.waitForTimeout(500); };
async function rodar(br, T, ok, orgTxt, role, cargo) {
  const user = { uid: 't1', name: 'Fulana Silva', role: role, crf: '12345-PE' };
  const o = { store: seed(T, orgTxt), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T, crf: user.crf };
  const { pg, errs } = await H.abrir(br, o);
  await pg.waitForSelector('[data-tour="nav-menu"]', { timeout: 15000 });
  await pg.evaluate(() => { const ap = Node.prototype.appendChild; Node.prototype.appendChild = function (n) { const r = ap.call(this, n); if (n && n.tagName === 'IFRAME') { const d = n.contentWindow.document; const w = d.write.bind(d); d.write = function (h) { if (typeof h === 'string' && h.indexOf('<title>Comprovante') >= 0) window.__ultHtml = h; return w(h); }; } return r; }; });
  await pg.click('.bnav-row [data-tour="nav-recebimento"]'); await pg.waitForTimeout(500);
  const html = () => pg.evaluate(() => window.__ultHtml || '');
  // ---- doação feita
  await pg.click('[data-fc="modo-doacao"]'); await pg.click('[data-fc="doa-sentido-feita"]'); await pg.waitForTimeout(150);
  await pg.fill('[data-fc="origem"]', 'Hospital Y');
  await pick(pg, 'doa-busca-0', 'dipi', 'Dipirona'); await pg.fill('[data-fc="doa-qtd-0"]', '10');
  await pg.click('button:has-text("+ Outro item")'); await pg.waitForTimeout(150);
  await pick(pg, 'doa-busca-1', 'parac', 'Paracetamol'); await pg.fill('[data-fc="doa-qtd-1"]', '3');
  await pg.click('[data-fc="ent-salvar"]'); await pg.waitForTimeout(300); await confirmar(pg, 'Registrar');
  ok(!!(await pg.$('[data-fc="imprimir-comprovante"]')), T + ': aparece "Imprimir comprovante" depois de registrar a doação');
  await pg.click('[data-fc="imprimir-comprovante"]'); await pg.waitForTimeout(400);
  let h = await html();
  ok(h.includes('Comprovante de Doação Realizada') && h.includes('Hospital Y') && h.includes('Dipirona 500mg') && h.includes('Paracetamol 750mg') && h.includes('L1'), T + ': comprovante da doação com parceiro, itens e lote');
  ok(h.includes(orgTxt) && /<img src="data:image/.test(h), T + ': traz o cabeçalho e o logo da prefeitura (' + orgTxt + ')');
  ok(/TOTAL/.test(h) && /<tfoot><tr><td colspan="4">TOTAL[^<]*<\/td><td class="num">13<\/td>/.test(h), T + ': soma o total (13 unidades)');
  ok(h.includes('>' + cargo) && !/COORDENADOR/.test(h), T + ': assina com o cargo real de quem imprime (' + cargo + '), não o de coordenador');
  ok(/Nº <b>DOF-\d{8}-[0-9A-F]{4}<\/b>/.test(h) && h.includes('Data da assinatura'), T + ': traz número do documento e campo de data da assinatura');
  if (role === 'farmaceutico') ok(h.includes('CRF 12345-PE'), T + ': mostra o CRF da farmacêutica');
  // ---- permuta
  await pg.click('[data-fc="modo-permuta"]'); await pg.waitForTimeout(200);
  await pg.fill('[data-fc="origem"]', 'Hospital Z');
  await pick(pg, 'perm-sai-busca', 'dipi', 'Dipirona'); await pg.fill('[data-fc="perm-sai-qtd"]', '2');
  await pick(pg, 'perm-ent-busca', 'parac', 'Paracetamol'); await pg.fill('[data-fc="perm-ent-qtd"]', '4'); await pg.click('[data-fc="perm-pend"]');
  await pg.click('[data-fc="ent-salvar"]'); await pg.waitForTimeout(300); await confirmar(pg, 'Registrar');
  await pg.click('[data-fc="imprimir-comprovante"]'); await pg.waitForTimeout(400);
  h = await html();
  if (process.env.DUMP && T === 'itaquitinga-pe') require('fs').writeFileSync(process.env.DUMP, h);
  ok(h.includes('Comprovante de Permuta') && h.includes('Saiu da farmácia') && h.includes('Entrou na farmácia') && h.includes('pendente'), T + ': comprovante da permuta com o que saiu, o que entrou e lote pendente');
  // ---- empréstimo
  await pg.click('[data-fc="modo-emprestimo"]'); await pg.waitForTimeout(200);
  await pg.fill('[data-fc="emp-parceiro"]', 'Hospital X');
  await pick(pg, 'emp-busca', 'dipi', 'Dipirona'); await pg.fill('[data-fc="emp-qtd"]', '5');
  await pg.click('[data-fc="emp-salvar"]'); await pg.waitForTimeout(300); await confirmar(pg, 'Emprestar');
  await pg.click('[data-fc="imprimir-comprovante"]'); await pg.waitForTimeout(400);
  h = await html();
  ok(h.includes('Comprovante de Empréstimo — Saída') && h.includes('Emprestado a') && h.includes('Hospital X'), T + ': comprovante do empréstimo');
  await pg.evaluate(() => { window.__ultHtml = ''; });
  await pg.click('[data-fc^="emp-imprimir-"]'); await pg.waitForTimeout(400);
  ok((await html()).includes('Comprovante de Empréstimo — Saída'), T + ': dá para reimprimir pela lista "Nos devem"');
  // ---- histórico de doação/permuta
  await pg.click('[data-fc="modo-permuta"]'); await pg.waitForTimeout(300);
  await pg.evaluate(() => { window.__ultHtml = ''; });
  const re = await pg.$$('[data-fc="reimprimir-mov"]');
  ok(re.length > 0, T + ': o histórico tem o botão Imprimir em cada lançamento');
  await re[0].dispatchEvent('click'); await pg.waitForTimeout(400);
  ok((await html()).includes('<title>Comprovante'), T + ': reimpressão pelo histórico funciona');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, T + ': sem erros JS ' + errs.join('|'));
  await pg.context().close();
}
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  await rodar(br, 'itaquitinga-pe', ok, 'Prefeitura Municipal de Itaquitinga', 'farmaceutico', 'Farmacêutico');
  await rodar(br, 'vicencia-pe', ok, 'Fundo Municipal de Saúde de Vicência', 'tecnico', 'Técnico');
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
