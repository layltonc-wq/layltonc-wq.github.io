#!/usr/bin/env node
// Executor dos testes do FarmaControl.   Uso (dentro de tests/):   npm test
//   npm run test:estatico   so as verificacoes rapidas
//   npm run test:ui         so os testes com navegador (sem emulador)
// Etapas: (1) estaticas  (2) emulador do Firestore: regras, funcoes e paginas publicas  (3) o app inteiro no navegador.
// Variaveis: PW_CHROMIUM = caminho de um Chromium ja instalado (opcional; no CI o Playwright baixa o dele).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const TESTES = __dirname;
const arg = process.argv[2] || '';
const env = Object.assign({}, process.env, { NODE_PATH: path.join(TESTES, 'node_modules') });

function listar(dir) { return fs.readdirSync(path.join(TESTES, dir)).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join(dir, f)); }
const resultados = [];
function rodar(rotulo, arquivo, extraEnv) {
  const t0 = Date.now();
  const proj = 'demo-' + path.basename(arquivo, '.test.js').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 40);
  const r = spawnSync(process.execPath, [path.join(TESTES, arquivo)], { cwd: TESTES, env: Object.assign({}, env, { FC_PROJ: proj }, extraEnv || {}), encoding: 'utf8', timeout: 240000 });
  const saida = (r.stdout || '') + (r.stderr || '');
  const falhas = (saida.match(/^FALHA /gm) || []).length;
  const bons = (saida.match(/^OK  /gm) || []).length;
  const passou = r.status === 0 && falhas === 0;
  resultados.push({ rotulo, passou, bons, falhas, seg: Math.round((Date.now() - t0) / 1000) });
  console.log((passou ? '✔ ' : '✘ ') + rotulo + '  (' + bons + ' verificacoes, ' + Math.round((Date.now() - t0) / 1000) + 's)');
  if (!passou) { console.log(saida.split('\n').filter((l) => !/^OK  /.test(l)).join('\n').slice(-3000)); }
}

if (process.argv.includes('--filho-emulador')) {
  // roda dentro do "firebase emulators:exec": uma sessao do emulador para todos os testes de emulador
  listar('emulator').forEach((f) => rodar(f, f));
  const ruins = resultados.filter((x) => !x.passou).length;
  process.exit(ruins ? 1 : 0);
}

console.log('== Verificacoes estaticas');
if (arg !== '--so-ui') rodar('static/verificar.js', 'static/verificar.js');
let emuOk = true;
if (!arg) {
  console.log('\n== Emulador do Firestore (regras, funcoes, paginas publicas)');
  const bin = path.join(TESTES, 'node_modules', '.bin', 'firebase');
  const r = spawnSync(bin, ['emulators:exec', '--config', 'firebase.json', '--only', 'firestore', '--project', 'demo-fc', 'node run.js --filho-emulador'], { cwd: TESTES, env, stdio: 'inherit', timeout: 600000 });
  emuOk = r.status === 0;
  resultados.push({ rotulo: 'emulador (todos)', passou: emuOk });
}
if (arg !== '--so-estatico') {
  console.log('\n== App inteiro no navegador (banco simulado)');
  listar('ui').forEach((f) => rodar(f, f));
}
const ruins = resultados.filter((x) => !x.passou);
console.log('\n' + (ruins.length ? '✘ ' + ruins.length + ' grupo(s) com falha: ' + ruins.map((x) => x.rotulo).join(', ') : '✔ TODOS OS TESTES PASSARAM'));
process.exit(ruins.length ? 1 : 0);
