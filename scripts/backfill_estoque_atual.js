// Script de backfill — calcula, UMA VEZ, o estoqueAtual correto de cada medicamento a partir de
// todo o histórico de entries já existente, e grava isso em medicamentos/{id}.estoqueAtual.
//
// A partir daí, a Cloud Function atualizarEstoqueAtual (functions/index.js) mantém esse número em
// dia sozinha, incrementalmente — este script só precisa rodar UMA VEZ por tenant, para "zerar o
// relógio" a partir do histórico existente. Rodar de novo depois é seguro (idempotente: recalcula
// do zero e sobrescreve, sempre chegando no mesmo resultado correto), mas não é necessário no dia
// a dia — só use de novo se desconfiar de alguma divergência.
//
// IMPORTANTE: rode isso DEPOIS de fazer o deploy da Cloud Function (senão, assim que alguém
// registrar uma entrada/saída nova depois do backfill mas antes da função existir, esse
// lançamento não seria contabilizado).
//
// COMO RODAR (mesmo padrão dos outros scripts):
//   GOOGLE_APPLICATION_CREDENTIALS=/caminho/da/chave.json node backfill_estoque_atual.js <tenant_id>
//   Rode primeiro no projeto de TESTE (farmacontrol-dev-6a3e3), confirme os valores, depois em PRODUÇÃO.

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

function efeito(doc) {
  if (!doc || !doc.medicamentoId) return null;
  if (doc.tipo === 'entrada') {
    if (doc.divergenciaTipo === 'nota') return null;
    return { medicamentoId: doc.medicamentoId, delta: Number(doc.quantidade) || 0 };
  }
  if (doc.tipo === 'saida') {
    if (doc.ficticioDiv) return null;
    return { medicamentoId: doc.medicamentoId, delta: -(Number(doc.quantidade) || 0) };
  }
  return null;
}

async function calcularEstoquePorMedicamento(tenantId) {
  const totais = {};
  let ultimoDoc = null;
  const PAGINA = 2000;
  let total = 0;
  while (true) {
    let q = db.collection('entries').where('tenant_id', '==', tenantId).orderBy('__name__').limit(PAGINA);
    if (ultimoDoc) q = q.startAfter(ultimoDoc);
    const snap = await q.get();
    if (snap.empty) break;
    total += snap.size;
    snap.docs.forEach(function (doc) {
      const ef = efeito(doc.data());
      if (!ef) return;
      totais[ef.medicamentoId] = (totais[ef.medicamentoId] || 0) + ef.delta;
    });
    ultimoDoc = snap.docs[snap.docs.length - 1];
    console.log(`  ... ${total} entries processadas até agora`);
    if (snap.size < PAGINA) break;
  }
  return totais;
}

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('Uso: node backfill_estoque_atual.js <tenant_id>  (ex.: vicencia-pe)');
    process.exit(1);
  }
  console.log(`Calculando estoqueAtual pra tenant_id="${tenantId}" a partir do histórico de entries...`);
  const totais = await calcularEstoquePorMedicamento(tenantId);
  console.log(`Histórico processado. ${Object.keys(totais).length} medicamento(s) com movimentação.`);

  const medsSnap = await db.collection('medicamentos').where('tenant_id', '==', tenantId).get();
  console.log(`${medsSnap.size} medicamento(s) cadastrado(s) nesse tenant.`);

  let batch = db.batch();
  let opsNoBatch = 0;
  let gravados = 0;
  for (const doc of medsSnap.docs) {
    const valor = totais[doc.id] || 0;
    batch.update(doc.ref, { estoqueAtual: valor });
    opsNoBatch++;
    gravados++;
    if (opsNoBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsNoBatch = 0;
    }
  }
  if (opsNoBatch > 0) await batch.commit();

  console.log(`\nConcluído. estoqueAtual gravado em ${gravados} medicamento(s).`);
  console.log('Confira alguns valores no Console antes de considerar isso "fonte da verdade" no app.');
}

main().catch(function (e) { console.error(e); process.exit(1); });
