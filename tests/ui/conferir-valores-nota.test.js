// Conferir pedidos (Itaquitinga): valores (unitário x quantidade), totais e comparação com a nota fiscal importada (XML).
const H = require('../lib/harness.js');
const T = 'itaquitinga-pe';
function seed() {
  const em = new Date(Date.now() - 3 * 864e5).toISOString();
  return {
    tenants: { [T]: { nome: 'Itaquitinga', ativo: true } },
    medicamentos: { m1: { nome: 'Dipirona 500mg comprimido', categoria: 'medicamento', estoqueAtual: 10, tenant_id: T } },
    entries: {},
    atas: {
      a1: { nome: 'Ata 001 - Fornecedor A', categoria: 'medicamento', tenant_id: T,
        itens: [
          { num: '1', descricao: 'Dipirona 500mg comprimido', medicamentoId: 'm1', qtdTeto: 1000, pedidoAcumulado: 600, vUnit: 0.1, unidade: 'CP' },
          { num: '2', descricao: 'Amoxicilina 250mg suspensão oral frasco', qtdTeto: 200, pedidoAcumulado: 100, vUnit: 5, unidade: 'FR' },
          { num: '3', descricao: 'Soro fisiológico 0,9% 500ml', qtdTeto: 500, pedidoAcumulado: 0, vUnit: 2, unidade: 'FR' }],
        historicoPedidos: [{ id: 'r1', em, deltas: [{ idx: 0, qtd: 500 }, { idx: 1, qtd: 100 }] }] }
    },
    users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, plantoes: {}, config: {}, reposicoes: {}, ubs_conferencias: {}
  };
}
const XML = `<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe Id="NFe123"><ide><nNF>445566</nNF><dhEmi>2026-11-18T10:00:00-03:00</dhEmi></ide><emit><xNome>Fornecedor A Ltda</xNome></emit>
<det nItem="1"><prod><cProd>1</cProd><xProd>DIPIRONA 500MG COMPRIMIDO</xProd><uCom>CP</uCom><qCom>400.0000</qCom><vUnCom>0.1200</vUnCom><vProd>48.00</vProd></prod></det>
<det nItem="2"><prod><cProd>2</cProd><xProd>AMOXICILINA 250MG SUSPENSAO ORAL FRASCO</xProd><uCom>FR</uCom><qCom>100.0000</qCom><vUnCom>5.0000</vUnCom><vProd>500.00</vProd></prod></det>
<det nItem="3"><prod><cProd>3</cProd><xProd>SORO FISIOLOGICO 0,9% 500ML</xProd><uCom>FR</uCom><qCom>20.0000</qCom><vUnCom>2.0000</vUnCom><vProd>40.00</vProd></prod></det>
<total><ICMSTot><vNF>588.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
const txt = (pg) => pg.evaluate(() => document.body.innerText);
(async () => {
  const { ok, fim } = H.verificador();
  const br = await H.launch();
  const user = { uid: 't1', name: 'Tec', role: 'tecnico' };
  const o = { store: seed(), uid: user.uid, tenant: T, user: Object.assign({ status: 'approved', tenant_id: T, homeTenant: T, color: '#1351B4', email: 'x@x', sessionTimeout: 12 }, user) };
  o.store.users[user.uid] = { name: user.name, role: user.role, status: 'approved', tenant_id: T };
  const { pg, errs } = await H.abrir(br, o);
  await pg.waitForSelector('[data-fc="seletor-local"],[data-fc="chip-local"]', { timeout: 15000 });
  await pg.click('[data-tour="nav-menu"]');
  await pg.click('.menu-drawer-item[data-tour="nav-previsao"]'); await pg.waitForTimeout(500);
  await pg.click('[data-fc="sub-chegada"]'); await pg.waitForTimeout(300);
  let t = await txt(pg);
  ok(t.includes('R$ 100,00') || t.includes('R$ 550,00'), 'o cartão do pedido mostra o valor total (500x0,10 + 100x5 = R$ 550,00)');
  await pg.click('[data-fc="cf-abrir"]'); await pg.waitForTimeout(200);
  t = await txt(pg);
  ok(t.includes('Pedido 500 × R$ 0,10 = R$ 50,00') && t.includes('Pedido 100 × R$ 5,00 = R$ 500,00'), 'cada item mostra pedido × valor unitário = total do item');
  ok(t.includes('Resumo da conferência') && t.includes('600 un.') && t.includes('R$ 550,00'), 'resumo mostra a quantidade total (600 un.) e o valor total do pedido');
  const ents = await pg.$$('[data-fc="cf-qtd"]');
  await ents[0].fill('300'); await ents[1].fill('80'); await pg.waitForTimeout(150);
  t = await txt(pg);
  ok(t.includes('Chegou agora: 300 × R$ 0,10 = R$ 30,00') && t.includes('Chegou agora: 80 × R$ 5,00 = R$ 400,00'), 'ao digitar, mostra quantidade x valor unitário = valor de cada item');
  ok(t.includes('faltam 200 (R$ 20,00') && t.includes('faltam 20 (R$ 100,00'), 'mostra quanto faltou em unidades e em reais');
  const resumo = await pg.textContent('[data-fc="cf-resumo"]');
  ok(/Chegou \(total\)\s*380 un\.\s*R\$ 430,00/.test(resumo) && /Faltou\s*220 un\.\s*R\$ 120,00/.test(resumo), 'resumo: chegou 380 un. (R$ 430,00) e faltou 220 un. (R$ 120,00)');
  // importar a nota (XML) e comparar
  await pg.setInputFiles('[data-fc="cf-nota-arq"]', { name: 'nota.xml', mimeType: 'text/xml', buffer: Buffer.from(XML) }); await pg.waitForTimeout(600);
  t = await txt(pg);
  ok(t.includes('Nota nº 445566') && t.includes('Fornecedor A Ltda') && t.includes('R$ 588,00'), 'lê a nota: número, fornecedor e total');
  ok(t.includes('Nota: 400 × R$ 0,12 = R$ 48,00') && t.includes('quantidade da nota (400) diferente do pedido (500)'), 'compara a quantidade da nota com o pedido (400 x 500)');
  ok(t.includes('preço da nota diferente da ata (R$ 0,10)'), 'avisa quando o preço da nota é diferente do preço da ata');
  ok(t.includes('nota diz 400, chegou 300'), 'compara a nota com o que chegou');
  ok(t.includes('Nota: 100 × R$ 5,00 = R$ 500,00') && t.includes('quantidade bate com o pedido'), 'item que bate com a nota');
  ok(!!(await pg.$('[data-fc="cf-nota-extras"]')) && t.includes('Soro fisiológico 0,9% 500ml'), 'item da nota que não está no pedido, mas é da ata, aparece como sugestão de extra');
  const r2 = await pg.textContent('[data-fc="cf-resumo"]');
  ok(/Total da nota \(itens do pedido\)\s*500 un\.\s*R\$ 548,00/.test(r2), 'resumo inclui o total da nota (500 un., R$ 548,00)');
  ok(t.includes('Nota × pedido') && t.includes('Nota × chegou'), 'resumo compara nota x pedido e nota x chegou');
  // preencher com a nota
  await pg.click('[data-fc="cf-nota-preencher"]'); await pg.waitForTimeout(150);
  const vals = await pg.evaluate(() => Array.from(document.querySelectorAll('[data-fc="cf-qtd"]')).map((i) => i.value));
  ok(vals.join() === '400,100', 'preencher "Chegou" com a nota usa as quantidades da nota');
  // adicionar o extra sugerido e registrar
  await pg.click('[data-fc="cf-nota-add-extra"]'); await pg.waitForTimeout(150);
  ok((await pg.$$('[data-fc="cf-extra-item"]')).length === 1, 'adicionar o extra da nota');
  await pg.click('[data-fc="cf-registrar"]'); await pg.waitForTimeout(300);
  // pergunta: chegou 400 de 500 não é excesso; extra pergunta se abate
  const btns = await pg.$$('button:has-text("Só registrar")');
  if (btns.length) { await btns[btns.length - 1].click(); await pg.waitForTimeout(500); }
  const a = await pg.evaluate(() => window.__store.atas.a1);
  const ch = a.historicoPedidos[0].conf && a.historicoPedidos[0].conf.chegadas[0];
  ok(ch && ch.nota && ch.nota.nNF === '445566' && ch.nota.valorTotal === 588 && ch.itens[0] === 400, 'a chegada registrada guarda a nota (nº e total) para consulta');
  t = await txt(pg);
  ok(errs.filter((e) => !e.includes('ERR_FAILED')).length === 0, 'sem erros JS ' + errs.join('|'));
  await pg.context().close();
  await fim(br);
})().catch((e) => { console.error(e); process.exit(2); });
