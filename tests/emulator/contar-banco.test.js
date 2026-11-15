// scripts/contar_banco.js (usado no teste de restauracao do backup) conta direito os documentos.
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8085';
const path = require('path');
const { execFileSync } = require('child_process');
const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.FC_PROJ });
const db = admin.firestore();
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FALHA ') + m); if (!c) falhas++; };
(async () => {
  await db.collection('medicamentos').doc('a').set({ nome: 'A' });
  await db.collection('medicamentos').doc('b').set({ nome: 'B' });
  await db.collection('entries').doc('x').set({ q: 1 });
  const saida = execFileSync(process.execPath, [path.resolve(__dirname, '..', '..', 'scripts', 'contar_banco.js'), '(default)'], {
    env: Object.assign({}, process.env, { GOOGLE_CLOUD_PROJECT: process.env.FC_PROJ, GCLOUD_PROJECT: process.env.FC_PROJ, FIREBASE_CONFIG: JSON.stringify({ projectId: process.env.FC_PROJ }), NODE_PATH: path.resolve(__dirname, '..', 'node_modules') }), encoding: 'utf8'
  });
  ok(/medicamentos\s+2/.test(saida) && /entries\s+1/.test(saida) && /TOTAL\s+3/.test(saida), 'conta 2 medicamentos + 1 lancamento = 3 documentos');
  console.log(falhas ? falhas + ' FALHAS' : 'TUDO OK');
  setTimeout(() => process.exit(falhas ? 1 : 0), 300);
})().catch((e) => { console.error(e); process.exit(2); });
