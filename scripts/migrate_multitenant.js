// Script de migração — adiciona tenant_id aos documentos existentes (Fase 3, Passo 5 do plano).
//
// COMO RODAR (você, Laylton — isto não roda sozinho, e não roda daqui da sessão):
//   1. npm install firebase-admin  (na pasta onde salvar este arquivo, ou `npm install -g` se preferir)
//   2. No Console do Firebase: Configurações do projeto → Contas de serviço → "Gerar nova chave
//      privada" — baixa um .json. NÃO comite esse arquivo no git (é uma credencial).
//   3. Rode assim, sempre no projeto de TESTE primeiro (farmacontrol-dev-6a3e3):
//        GOOGLE_APPLICATION_CREDENTIALS=/caminho/da/chave.json node migrate_multitenant.js vicencia-pe
//      O primeiro argumento é o tenant_id a gravar em todo documento que ainda não tiver um.
//   4. Confirme no Console (Firestore Database) que os documentos ganharam o campo `tenant_id`.
//   5. Só depois, repita apontando pro projeto de PRODUÇÃO (app-farma-b21e2), com a chave de serviço
//      desse projeto.
//
// O script é seguro pra rodar mais de uma vez (idempotente): só grava tenant_id em documentos que
// ainda não têm o campo, então rodar de novo não sobrescreve nada.
//
// Coleções migradas por este script vão sendo adicionadas conforme cada uma é migrada no código
// (Fase 3, seção 5 do PLAN_MULTITENANT.md). Rode de novo a cada nova versão deste arquivo — ele só
// mexe no que ainda não tem tenant_id, então é seguro rodar incrementalmente.

const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

// Coleções simples: todo documento sem tenant_id recebe o tenant_id passado por argumento.
// (Ordem = mesma ordem da seção 5 do plano; vá descomentando/adicionando conforme migrar cada uma.)
const COLECOES_SIMPLES = [
  'users',
  'medicamentos',
  'atas', 'vinculos_nfe',
  'entries',
  'recebimentos', 'notas_fiscais', 'divergencias',
  'tratamentos_atb', 'pacientes_controlados', 'saidas_controladas',
  // 'pacientes_leite', 'retiradas_leite',
  // 'solicitacoes', 'alertas', 'avisos',
  // 'logs_acesso', 'logs_contas',
  // 'plantao_solicitacoes', 'plantao_convites',
];

async function migrarColecaoSimples(nome, tenantId) {
  const snap = await db.collection(nome).get();
  let migrados = 0;
  let batch = db.batch();
  let opsNoBatch = 0;
  for (const doc of snap.docs) {
    if (doc.data().tenant_id) continue; // já migrado, pula (idempotente)
    batch.update(doc.ref, { tenant_id: tenantId });
    opsNoBatch++;
    migrados++;
    if (opsNoBatch >= 400) { // limite do Firestore é 500 por batch; 400 dá margem
      await batch.commit();
      batch = db.batch();
      opsNoBatch = 0;
    }
  }
  if (opsNoBatch > 0) await batch.commit();
  console.log(`${nome}: ${migrados} documento(s) migrado(s) de ${snap.size} total.`);
}

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('Uso: node migrate_multitenant.js <tenant_id>  (ex.: vicencia-pe)');
    process.exit(1);
  }
  console.log(`Migrando pro tenant_id="${tenantId}"...`);

  // 0. Garante que o documento da prefeitura existe em tenants/{tenantId} (não sobrescreve se já existir).
  const tenantRef = db.collection('tenants').doc(tenantId);
  const tenantSnap = await tenantRef.get();
  if (!tenantSnap.exists) {
    console.log(`tenants/${tenantId} não existe ainda — criando com ativo:true (edite nome/uf depois no Console se quiser).`);
    await tenantRef.set({ nome: tenantId, uf: '', ativo: true, criadoEm: new Date().toISOString() });
  } else {
    console.log(`tenants/${tenantId} já existe, não mexi.`);
  }

  for (const nome of COLECOES_SIMPLES) {
    await migrarColecaoSimples(nome, tenantId);
  }

  console.log('Concluído. Confira no Console antes de publicar as regras novas.');
}

main().catch(function (e) { console.error(e); process.exit(1); });
