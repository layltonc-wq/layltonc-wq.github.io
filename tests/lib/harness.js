// Abre o FarmaControl REAL (app.js) no navegador com um Firebase simulado (demo/fake-firebase.js).
// Nada vai para a internet: qualquer pedido externo e bloqueado.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const FAKE_SRC = fs.readFileSync(path.join(ROOT, 'demo', 'fake-firebase.js'), 'utf8');

function launch() {
  return chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--lang=pt-BR'] });
}
function reactPaths() {
  const r = path.dirname(require.resolve('react/package.json')), d = path.dirname(require.resolve('react-dom/package.json'));
  return { react: path.join(r, 'umd', 'react.production.min.js'), reactDom: path.join(d, 'umd', 'react-dom.production.min.js') };
}
// Prepara a pagina (contexto novo, banco simulado e usuario logado). opts: {store, uid, tenant, user, hora}
async function preparar(browser, opts) {
  const ctx = await browser.newContext({ locale: 'pt-BR', viewport: { width: 420, height: 900 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  pg.on('dialog', (d) => d.accept());
  await pg.addInitScript(FAKE_SRC);
  await pg.addInitScript((o) => {
    FCFake.install({ store: o.store, uid: o.uid, tenant: o.tenant, user: o.user });
    try { localStorage.setItem('fc_user', JSON.stringify(o.user)); } catch (e) {}
    window.__fcEnv = 'prod';
    // os testes nao dependem do horario real (ex.: plantao so existe entre 8h e 20h)
    Date.prototype.getHours = function () { return o.hora == null ? 12 : o.hora; };
  }, opts);
  await pg.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('file://') || u.startsWith('data:')) return r.continue(); r.abort(); });
  return { pg, errs, ctx };
}
// Prepara e abre o app. Devolve {pg, errs}.
async function abrir(browser, opts) {
  const { pg, errs } = await preparar(browser, opts);
  const rp = reactPaths();
  await pg.goto('file://' + path.join(ROOT, 'tests', 'lib', 'blank.html'));
  await pg.addScriptTag({ path: rp.react });
  await pg.addScriptTag({ path: rp.reactDom });
  await pg.evaluate(() => { window.XLSX = { utils: { book_new() {}, aoa_to_sheet(r) { window.__rows = r; }, book_append_sheet() {} }, writeFile() { window.__xl = (window.__xl || 0) + 1; } }; });
  await pg.addScriptTag({ path: opts.appJs || path.join(ROOT, 'app.js') });
  await pg.waitForTimeout(opts.espera == null ? 1200 : opts.espera);
  return { pg, errs };
}
// Contador de verificacoes: ok(cond, mensagem); fim() encerra com codigo 0/1.
function verificador() {
  let falhas = 0;
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'FALHA ') + m); if (!c) falhas++; };
  const fim = async (br) => { console.log(falhas ? falhas + ' FALHAS' : 'TUDO OK'); if (br) await br.close(); setTimeout(() => process.exit(falhas ? 1 : 0), 300); };
  return { ok, fim, falhas: () => falhas };
}
module.exports = { ROOT, launch, preparar, abrir, reactPaths, verificador };
