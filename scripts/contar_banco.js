// Conta documentos das colecoes principais de um banco do Firestore (so leitura). Uso (dentro de functions/):
//   node ../scripts/contar_banco.js "(default)"          ou          node ../scripts/contar_banco.js teste-restauracao-20261115
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const banco = process.argv[2] || '(default)';
const COLECOES = ['tenants', 'users', 'medicamentos', 'entries', 'atas', 'recebimentos', 'notas_fiscais', 'ubs', 'ubs_solicitacoes', 'reposicoes', 'ubs_conferencias'];

(async () => {
  initializeApp();
  const db = banco === '(default)' ? getFirestore() : getFirestore(banco);
  let total = 0;
  for (const c of COLECOES) {
    const r = await db.collection(c).count().get();
    const n = r.data().count; total += n;
    console.log('  ' + c.padEnd(18) + String(n).padStart(8));
  }
  console.log('  ' + 'TOTAL'.padEnd(18) + String(total).padStart(8));
})().catch((e) => { console.error('Erro ao contar:', e.message); process.exit(1); });
