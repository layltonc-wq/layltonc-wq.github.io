// Ambiente de demonstracao (/demo/): escolha de perfil, dados ficticios, isolamento do sistema real e simulacoes.
const http = require('http');
const fs = require('fs');
const path = require('path');
const H = require('../lib/harness.js');
const ROOT = H.ROOT;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
  r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0);

async function nova(br, base, url) {
  const ctx = await br.newContext({ locale: 'pt-BR', viewport: { width: 420, height: 900 } });
  const pg = await ctx.newPage();
  const errs = [], externos = [];
  pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  const rp = H.reactPaths();
  const xl = path.join(path.dirname(require.resolve('xlsx/package.json')), 'dist', 'xlsx.full.min.js');
  await pg.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(base) || u.startsWith('data:')) return r.continue();
    if (/unpkg\.com\/react@/.test(u)) return r.fulfill({ path: rp.react, contentType: 'text/javascript' });
    if (/unpkg\.com\/react-dom@/.test(u)) return r.fulfill({ path: rp.reactDom, contentType: 'text/javascript' });
    if (/unpkg\.com\/xlsx@/.test(u)) return r.fulfill({ path: xl, contentType: 'text/javascript' });
    externos.push(u); r.abort();
  });
  await pg.goto(base + url);
  return { pg, errs, externos, ctx };
}
const txt = (pg) => pg.evaluate(() => document.body.innerText);

(async () => {
  const { ok, fim } = H.verificador();
  const port = srv.address().port, base = 'http://localhost:' + port;
  const br = await H.launch();

  // 1) escolha do perfil
  let { pg, errs, externos, ctx } = await nova(br, base, '/demo/');
  await pg.waitForSelector('[data-perfil]');
  ok((await pg.$$('[data-perfil]')).length === 4, 'a demonstracao abre pedindo o perfil (gestora, farmaceutica, CAF, Satelite)');
  ok(!(await pg.evaluate(() => !!window.__store)), 'antes de escolher, nenhum banco foi carregado');
  await pg.click('[data-perfil="gestor"]');
  await pg.waitForSelector('#fcd-tarja');
  await pg.waitForSelector('[data-fc="seletor-local"]', { timeout: 15000 });
  let t = await txt(pg);
  ok(t.includes('DEMONSTRAÇÃO — dados fictícios'), 'tarja "DEMONSTRAÇÃO — dados fictícios" aparece');
  // 2) isolamento do armazenamento
  const chaves = await pg.evaluate(() => { const f = document.createElement('iframe'); document.body.appendChild(f); const real = f.contentWindow.localStorage; const ks = Object.keys(real); const ss = Object.keys(f.contentWindow.sessionStorage); f.remove(); return { ks, ss }; });
  ok(chaves.ks.length > 0 && chaves.ks.every((k) => k.indexOf('demo:') === 0) && chaves.ss.every((k) => k.indexOf('demo:') === 0), 'tudo que a demonstracao guarda no navegador tem o prefixo "demo:" (nao mistura com o sistema real): ' + chaves.ks.join(','));
  ok(!chaves.ks.includes('fc_user'), 'nao grava o usuario no armazenamento do sistema real');
  // 3) dados fictícios no app real
  await pg.click('[data-tour="nav-menu"]');
  await pg.click('[data-tour="nav-estoque"]');
  await pg.waitForTimeout(500);
  t = await txt(pg);
  ok(/Dipirona 500mg comprimido/.test(t) && /produto\(s\)/.test(t), 'Estoque mostra o catalogo ficticio');
  const nCaf = parseInt((t.match(/(\d+) produto\(s\)/) || [])[1], 10);
  ok(nCaf >= 45, 'catalogo do CAF com ' + nCaf + ' produtos');
  await pg.click('[data-fc="local-satelite"]'); await pg.waitForTimeout(400);
  t = await txt(pg);
  const nSat = parseInt((t.match(/(\d+) produto\(s\)/) || [])[1], 10);
  ok(nSat > 5 && nSat < nCaf && !/Fórmula infantil/.test(t), 'Satelite tem estoque proprio, menor, e sem leite (' + nSat + ' produtos)');
  await pg.click('[data-fc="local-caf"]');
  // 4) solicitacoes das UBS (modulo) com pedidos ja em andamento
  await pg.click('[data-tour="nav-menu"]');
  await pg.click('[data-tour="nav-ubs"]'); await pg.waitForTimeout(400);
  t = await txt(pg);
  ok(t.includes('UBS-DEMO-0001') && t.includes('UBS Centro') && t.includes('Aguardando análise'), 'Solicitacoes das UBS ja traz pedidos de exemplo');
  // 5) simulacao: chega um pedido novo
  await pg.click('[data-demo="menu"]'); await pg.click('[data-demo="sim-ubs"]'); await pg.waitForTimeout(500);
  ok((await txt(pg)).includes('UBS-DEMO-100'), 'simular pedido de UBS: o pedido novo aparece na lista na hora');
  // 6) o que se faz fica na sessao e reiniciar volta ao original
  const antes = await pg.evaluate(() => Object.keys(window.__store.ubs_solicitacoes).length);
  await pg.reload(); await pg.waitForSelector('#fcd-tarja'); await pg.waitForTimeout(800);
  const depois = await pg.evaluate(() => Object.keys(window.__store.ubs_solicitacoes).length);
  ok(antes === depois && antes >= 5, 'recarregar a pagina mantem o que foi feito na sessao');
  await pg.click('[data-demo="menu"]'); await pg.click('[data-demo="reiniciar"]'); await pg.waitForSelector('#fcd-tarja'); await pg.waitForTimeout(800);
  ok(await pg.evaluate(() => Object.keys(window.__store.ubs_solicitacoes).length) === 4, 'reiniciar volta aos dados originais');
  const proibidos = externos.filter((u) => /(firestore\.googleapis|identitytoolkit|securetoken|firebaseio|cloudfunctions|firebasejs|run\.app)/.test(u));
  ok(proibidos.length === 0, 'a demonstracao nunca fala com o Firebase real (so bibliotecas e fontes): ' + proibidos.slice(0, 3).join(' | '));
  ok(errs.length === 0, 'gestora: sem erros JS ' + errs.join('|'));
  await ctx.close();

  // 7) farmaceutica: so consulta + pedidos/atas
  ({ pg, errs, ctx } = await nova(br, base, '/demo/'));
  await pg.waitForSelector('[data-perfil]');
  await pg.click('[data-perfil="farmaceutica"]');
  await pg.waitForSelector('[data-fc="chip-local"]', { timeout: 15000 });
  ok((await pg.textContent('[data-fc="chip-local"]')).includes('só consulta'), 'farmaceutica: chip "CAF · só consulta"');
  await pg.click('[data-tour="nav-menu"]');
  const itens = await pg.evaluate(() => Array.from(document.querySelectorAll('[data-tour^="nav-"]')).map((b) => b.getAttribute('data-tour').replace('nav-', '')));
  ok(itens.includes('previsao') && itens.includes('estoque') && !itens.includes('recebimento') && !itens.includes('transferencia'), 'farmaceutica: tem Previsao/Pedido e Estoque, sem movimentacao (' + itens.join(',') + ')');
  await pg.click('[data-tour="nav-previsao"]'); await pg.waitForTimeout(600);
  ok((await txt(pg)).includes('Gerenciar Atas'), 'farmaceutica abre Previsao/Pedido com as atas');
  await pg.click('text=Gerenciar Atas'); await pg.waitForTimeout(500);
  ok((await txt(pg)).includes('Ata 012/2026'), 'as atas de exemplo aparecem');
  ok(errs.length === 0, 'farmaceutica: sem erros JS ' + errs.join('|'));
  await ctx.close();

  // 8) satelite: so o estoque dele, pede reposicao
  ({ pg, errs, ctx } = await nova(br, base, '/demo/'));
  await pg.waitForSelector('[data-perfil]');
  await pg.click('[data-perfil="satelite"]');
  await pg.waitForSelector('[data-fc="chip-local"]', { timeout: 15000 });
  ok((await pg.textContent('[data-fc="chip-local"]')).trim() === 'Satélite', 'satelite: chip "Satélite" fixo');
  await pg.click('[data-tour="nav-menu"]');
  await pg.click('[data-tour="nav-transferencia"]'); await pg.waitForTimeout(400);
  await pg.click('[data-fc="sub-pedir"]'); await pg.waitForTimeout(300);
  t = await txt(pg);
  ok(t.includes('Meus pedidos') && t.includes('Aguardando o CAF'), 'satelite ve os pedidos de reposicao ja feitos');
  ok(errs.length === 0, 'satelite: sem erros JS ' + errs.join('|'));
  await ctx.close();

  srv.close();
  await fim(br);
})().catch((e) => { console.error(e); srv.close(); process.exit(2); });
