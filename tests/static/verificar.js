// Verificacoes estaticas (rapidas, sem navegador nem emulador):
//  1) app.js e index.html estao em dia com src/app.jsx (ninguem esqueceu de rodar scripts/build.sh);
//  2) sintaxe das funcoes e dos scripts das paginas publicas;
//  3) arquivos de configuracao validos (manifesto do app instalavel, firebase.json).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FALHA ') + m); if (!c) falhas++; };

// 1) compilado em dia
const esbuild = path.join(ROOT, 'tests', 'node_modules', '.bin', 'esbuild');
const tmp = path.join(require('os').tmpdir(), 'fc-app-check-' + process.pid + '.js');
try {
  execFileSync(esbuild, [path.join(ROOT, 'src', 'app.jsx'), '--jsx=transform', '--target=es2020', '--minify-whitespace', '--charset=utf8', '--outfile=' + tmp, '--log-level=warning'], { stdio: 'pipe' });
  const novo = fs.readFileSync(tmp);
  const atual = fs.readFileSync(path.join(ROOT, 'app.js'));
  ok(Buffer.compare(novo, atual) === 0, 'app.js e o resultado exato de src/app.jsx (se falhar: rode "bash scripts/build.sh" e faca commit do app.js e do index.html)');
  const hash = crypto.createHash('sha1').update(atual).digest('hex').slice(0, 10);
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = idx.match(/<script src="app\.js\?v=([^"]*)"><\/script>/);
  ok(!!m && m[1] === hash, 'index.html aponta para o app.js atual (hash ' + hash + ')');
} catch (e) {
  ok(false, 'compilar src/app.jsx: ' + (e.stderr ? e.stderr.toString().slice(0, 400) : e.message));
} finally { try { fs.unlinkSync(tmp); } catch (e) {} }

// 2) sintaxe
['functions/index.js', 'functions/ubs.js'].forEach((f) => {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); ok(true, 'sintaxe de ' + f); }
  catch (e) { ok(false, 'sintaxe de ' + f + ': ' + String(e.stderr).slice(0, 300)); }
});
['ubs/index.html', 'conferencia/index.html', 'offline.html', 'index.html'].forEach((f) => {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const blocos = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  let bom = true;
  blocos.forEach((b) => { try { new Function(b); } catch (e) { bom = false; ok(false, 'script inline de ' + f + ': ' + e.message); } });
  if (bom) ok(true, 'scripts inline de ' + f + ' (' + blocos.length + ')');
});

// 2b) a demonstracao (demo/index.html) e derivada do index.html: precisa estar em dia
try {
  execFileSync('python3', [path.join(ROOT, 'scripts', 'build_demo.py'), '--check'], { stdio: 'pipe' });
  ok(true, 'demo/index.html esta em dia com o index.html');
} catch (e) { ok(false, 'demo/index.html desatualizado: rode "bash scripts/build.sh" e faca commit. ' + String(e.stdout || '').trim()); }

// 2c) scripts de seguranca do banco (shell) e arquivos de publicacao
['scripts/seguranca_banco.sh', 'scripts/testar_restauracao.sh', 'scripts/build.sh'].forEach((f) => {
  try { execFileSync('bash', ['-n', path.join(ROOT, f)], { stdio: 'pipe' }); ok(true, 'sintaxe de ' + f); }
  catch (e) { ok(false, 'sintaxe de ' + f + ': ' + String(e.stderr).slice(0, 200)); }
});
try { JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.hosting.json'), 'utf8')); ok(true, 'firebase.hosting.json valido'); } catch (e) { ok(false, 'firebase.hosting.json: ' + e.message); }

// 3) configuracao
try {
  const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  ok(mf.display === 'standalone' && mf.icons.every((i) => fs.existsSync(path.join(ROOT, i.src))), 'manifesto do app instalavel e icones existem');
} catch (e) { ok(false, 'manifest.webmanifest: ' + e.message); }
try { JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')); ok(true, 'firebase.json valido'); } catch (e) { ok(false, 'firebase.json: ' + e.message); }
const regras = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
ok(/rules_version/.test(regras) && /service cloud\.firestore/.test(regras), 'firestore.rules tem o cabecalho esperado');

console.log(falhas ? falhas + ' FALHAS' : 'TUDO OK');
process.exit(falhas ? 1 : 0);
