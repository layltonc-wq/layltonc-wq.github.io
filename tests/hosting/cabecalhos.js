// Roda DENTRO do emulador do Firebase Hosting (ver run.js): confere a configuracao de publicacao do site
// (firebase.hosting.json): o que NAO pode ficar publico, cabecalhos de seguranca e cache.
const base = 'http://127.0.0.1:' + (process.env.FC_HOSTING_PORT || '5000');
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FALHA ') + m); if (!c) falhas++; };
(async () => {
  const get = async (p) => { const r = await fetch(base + p, { redirect: 'manual' }); return { s: r.status, h: r.headers, t: r.status === 200 ? await r.text() : '' }; };
  for (const p of ['/', '/ubs/', '/conferencia/', '/demo/', '/apresentacao/', '/termos/', '/privacidade/', '/offline.html', '/app.js', '/sw.js', '/manifest.webmanifest']) {
    const r = await get(p); ok(r.s === 200, 'publica ' + p + ' (' + r.s + ')');
  }
  for (const p of ['/functions/index.js', '/firestore.rules', '/firebase.json', '/firebase.hosting.json', '/src/app.jsx', '/tests/package.json', '/scripts/build.sh', '/tests/run.js', '/README.md', '/.git/config']) {
    const r = await get(p); ok(r.s === 404, 'NAO publica ' + p + ' (' + r.s + ')');
  }
  const home = await get('/');
  ok((home.h.get('strict-transport-security') || '').includes('max-age=31536000'), 'HSTS ativo');
  ok(home.h.get('x-content-type-options') === 'nosniff', 'nosniff');
  ok(home.h.get('x-frame-options') === 'DENY', 'nao pode ser colocado dentro de outro site (clickjacking)');
  ok((home.h.get('referrer-policy') || '').includes('strict-origin'), 'referrer-policy');
  ok((home.h.get('permissions-policy') || '').includes('camera=(self)') && (home.h.get('permissions-policy') || '').includes('geolocation=()'), 'permissions-policy (camera so do proprio site)');
  ok((home.h.get('content-security-policy-report-only') || '').includes("frame-ancestors 'none'"), 'CSP em modo de observacao');
  ok((home.h.get('cache-control') || '').includes('no-cache'), 'pagina inicial nunca fica em cache (atualizacao imediata)');
  const sw = await get('/sw.js'); ok((sw.h.get('cache-control') || '').includes('no-cache'), 'service worker sem cache');
  const js = await get('/app.js'); ok((js.h.get('cache-control') || '').includes('immutable'), 'app.js com cache longo (o endereco muda a cada versao: ?v=hash)');
  const mf = await get('/manifest.webmanifest'); ok((mf.h.get('content-type') || '').includes('manifest+json'), 'manifesto com o tipo certo');
  const ubs = await get('/ubs/'); ok((ubs.h.get('cache-control') || '').includes('no-cache'), 'paginas publicas das UBS sem cache');
  const semBarra = await get('/ubs'); ok(semBarra.s === 301 || semBarra.s === 302, '/ubs redireciona para /ubs/ (' + semBarra.s + ')');
  console.log(falhas ? falhas + ' FALHAS' : 'TUDO OK');
  setTimeout(() => process.exit(falhas ? 1 : 0), 200);
})().catch((e) => { console.error(e); process.exit(2); });
