// Itaquitinga, Satelite: sem Judicial, aba "Solicitacao", textos com "a CAF", e toda saida e Emergencia (sem "usuario SUS").
const H = require('../lib/harness.js');
const T = 'itaquitinga-pe';

function seed() {
  const t0 = new Date(Date.now() - 5 * 864e5).toISOString();
  const en = (q, local) => ({ medicamentoId: 'm1', medicamentoNome: 'Dipirona 500mg', tipo: 'entrada', quantidade: q, lote: 'L1', validade: '01/2030', criadoEm: t0, date: t0.slice(0, 10), tenant_id: T, local });
  return {
    tenants: { [T]: { nome: 'Itaquitinga', ativo: true } },
    medicamentos: { m1: { nome: 'Dipirona 500mg', categoria: 'medicamento', estoqueAtual: 130, estoqueLocal: { satelite: 30 }, tenant_id: T } },
    entries: { e1: en(100, 'caf'), e2: en(30, 'satelite') },
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {}
  };
}
async function abrir(br, user) {
  const o = { store: seed(), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T, acessoLocal: user.acessoLocal || '', somenteLeitura: false };
  const { pg, errs } = await H.abrir(br, o);
  await pg.waitForSelector('[data-fc="seletor-local"],[data-fc="chip-local"]', { timeout: 15000 });
  return { pg, errs };
}
const txt = (pg) => pg.evaluate(() => document.body.innerText);
const barraInferior = (pg) => pg.evaluate(() => { const e = document.querySelector('.bnav-row'); return e ? e.innerText.replace(/\n/g, ' | ') : ''; });

(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();

  // administrador: no CAF tem Judicial; ao trocar para o Satelite vira Solicitacao
  let { pg, errs } = await abrir(br, { uid: 't1', name: 'Tec', role: 'tecnico' });
  let nav = await barraInferior(pg);
  ok(/Judicial/.test(nav) && !/Solicitação/.test(nav), 'CAF: barra inferior continua com Judicial (' + nav + ')');
  await pg.click('[data-fc="local-satelite"]'); await pg.waitForTimeout(300);
  nav = await barraInferior(pg);
  ok(!/Judicial/.test(nav) && /Solicitação/.test(nav), 'Satelite: sem Judicial e com "Solicitação" na barra inferior (' + nav + ')');
  await pg.click('.bnav-row [data-tour="nav-transferencia"]'); await pg.waitForTimeout(300);
  let t = await txt(pg);
  ok(/Solicitação/.test(t) && t.includes('Pedir à CAF') && t.includes('Devolver à CAF') && !/ ao CAF| do CAF|para o CAF/.test(t), 'Satelite: aba "Solicitação" com "Pedir à CAF" e "Devolver à CAF", sem "ao CAF"');
  ok(t.includes('Peça à CAF'), 'explica o que a aba faz');
  await pg.click('[data-fc="sub-transf"]'); await pg.waitForTimeout(200);
  t = await txt(pg);
  ok(/Devolver à CAF/.test(t) && t.includes('volta para a CAF') && t.includes('O histórico fica logo abaixo'), '"Devolver à CAF" explica que e uma devolucao de verdade e que o historico fica abaixo');
  // volta ao CAF: titulo Transferencia e destino SUS de volta
  await pg.click('[data-fc="local-caf"]'); await pg.waitForTimeout(300);
  await pg.click('[data-tour="nav-menu"]');
  await pg.click('.menu-drawer-item[data-tour="nav-transferencia"]'); await pg.waitForTimeout(300);
  t = await txt(pg);
  ok(t.includes('Transferência') && /Da CAF para o Satélite/.test(t) && t.includes('Pedidos do Satélite'), 'CAF: segue "Transferência" ("Da CAF para o Satélite") e "Pedidos do Satélite"');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'administrador: sem erros JS ' + errs.join('|'));
  await pg.context().close();

  // auxiliar do Satelite: saida so para Emergencia
  ({ pg, errs } = await abrir(br, { uid: 's1', name: 'Aux Sat', role: 'auxiliar', acessoLocal: 'satelite' }));
  nav = await barraInferior(pg);
  ok(/Solicitação/.test(nav) && !/Judicial|ATB/.test(nav), 'auxiliar do Satelite: barra com Solicitação (' + nav + ')');
  await pg.click('[data-tour="nav-menu"]');
  const itens = await pg.evaluate(() => Array.from(document.querySelectorAll('[data-tour^="nav-"]')).map((b) => b.getAttribute('data-tour').replace('nav-', '')));
  ok(itens.includes('antibiotico') && itens.includes('transferencia') && !itens.includes('pedidosjudiciais') && !itens.includes('leites'), 'menu do auxiliar do Satelite: ATB e Solicitação; sem Judicial/Leites (' + itens.join(',') + ')');
  await pg.evaluate(() => { document.querySelectorAll('.itaq-backdrop').forEach((b) => b.click()); });
  await pg.click('.bnav-row [data-tour="nav-saida"]'); await pg.waitForTimeout(400);
  t = await txt(pg);
  ok(!/SUS \(usuário\)/.test(t) && /Emergência/.test(t), 'Saida no Satelite: sem "SUS (usuário)"; so Emergência');
  await pg.fill('input[placeholder="Digite o nome do medicamento..."]', 'Dipi'); await pg.waitForTimeout(300);
  await pg.click('text=Dipirona 500mg >> nth=0'); await pg.waitForTimeout(200);
  await pg.click('button:has-text("10") >> nth=0');
  await pg.click('button:has-text("Registrar saída para")'); await pg.waitForTimeout(500);
  const saida = await pg.evaluate(() => Object.values(window.__store.entries).filter((e) => e.tipo === 'saida' && e.quantidade === 10)[0]);
  ok(saida && saida.destino === 'emergencia' && saida.local === 'satelite', 'a saida do Satelite grava destino Emergência e local Satélite');
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'auxiliar Satelite: sem erros JS ' + errs.join('|'));
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
