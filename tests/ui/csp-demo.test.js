// A politica de seguranca de conteudo (CSP) de firebase.hosting.json NAO pode quebrar o app: serve a demonstracao
// com a CSP em modo OBRIGATORIO e confere que nada foi bloqueado. (O Firebase real so e testavel em producao;
// aqui garantimos scripts, estilos, fontes e bibliotecas.)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const H = require('../lib/harness.js');
const ROOT = H.ROOT;
execFileSync('python3', [path.join(ROOT, 'scripts', 'montar_site.py')], { stdio: 'pipe' });
const SITE = path.join(ROOT, '_site');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.hosting.json'), 'utf8')).hosting;
const globais = cfg.headers.find((h) => h.source === '**').headers;
const csp = globais.find((h) => h.key === 'Content-Security-Policy-Report-Only').value;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p);
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
  r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream', 'content-security-policy': csp }); fs.createReadStream(f).pipe(r);
}).listen(0);

(async () => {
  const { ok, fim } = H.verificador();
  const base = 'http://localhost:' + srv.address().port;
  const br = await H.launch();
  const ctx = await br.newContext({ locale: 'pt-BR', viewport: { width: 420, height: 900 } });
  const pg = await ctx.newPage();
  const bloqueios = [], erros = [];
  pg.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) bloqueios.push(t.slice(0, 220)); });
  pg.on('pageerror', (e) => erros.push(e.message));
  const rp = H.reactPaths();
  const xl = path.join(path.dirname(require.resolve('xlsx/package.json')), 'dist', 'xlsx.full.min.js');
  await pg.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(base) || u.startsWith('data:')) return r.continue();
    if (/unpkg\.com\/react@/.test(u)) return r.fulfill({ path: rp.react, contentType: 'text/javascript' });
    if (/unpkg\.com\/react-dom@/.test(u)) return r.fulfill({ path: rp.reactDom, contentType: 'text/javascript' });
    if (/unpkg\.com\/xlsx@/.test(u)) return r.fulfill({ path: xl, contentType: 'text/javascript' });
    r.abort();
  });
  await pg.goto(base + '/demo/');
  await pg.waitForSelector('[data-perfil]');
  await pg.click('[data-perfil="gestor"]');
  await pg.waitForSelector('[data-fc="seletor-local"]', { timeout: 15000 });
  for (const aba of ['estoque', 'ubs', 'transferencia', 'relatorio']) {
    await pg.click('[data-tour="nav-menu"]');
    await pg.click('[data-tour="nav-' + aba + '"]');
    await pg.waitForTimeout(500);
  }
  ok(true, 'demonstracao navegou por 4 telas com a CSP obrigatoria');
  ok(bloqueios.length === 0, 'a CSP nao bloqueou nada no app (' + bloqueios.length + ' bloqueios) ' + bloqueios.slice(0, 2).join(' | '));
  ok(erros.length === 0, 'sem erros JS ' + erros.join('|'));
  // paginas publicas das UBS tambem carregam sob a CSP
  const pg2 = await ctx.newPage(); const b2 = [];
  pg2.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) b2.push(m.text().slice(0, 200)); });
  await pg2.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); r.abort(); });
  await pg2.goto(base + '/ubs/?m=itaquitinga-pe'); await pg2.waitForTimeout(800);
  await pg2.goto(base + '/conferencia/?m=vicencia-pe'); await pg2.waitForTimeout(800);
  ok(b2.length === 0, 'paginas /ubs/ e /conferencia/ sob a CSP: sem bloqueios ' + b2.join('|'));
  srv.close();
  await fim(br);
})().catch((e) => { console.error(e); srv.close(); process.exit(2); });
