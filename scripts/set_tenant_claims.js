// Script de performance — grava tenant_id como CUSTOM CLAIM na conta de login (Firebase Auth) de
// cada usuário, a partir do que já está em users/{uid}.tenant_id no Firestore.
//
// POR QUE ISSO EXISTE: a regra de segurança do Firestore precisava, até agora, ler o documento
// users/{uid} do banco pra saber a prefeitura de quem está fazendo a leitura (userTenant() fazia
// um get() a cada verificação). Em coleções grandes (ex.: entries, com ~19 mil documentos em
// produção), isso deixava consultas MUITO lentas. Com o tenant_id gravado direto na conta de
// login (custom claim), a regra passa a ler isso de graça, sem nenhuma consulta extra ao banco —
// não importa o tamanho da coleção.
//
// COMO RODAR (mesmo padrão do migrate_multitenant.js — Cloud Shell ou seu computador):
//   1. npm install firebase-admin  (se ainda não tiver rodado antes nessa pasta)
//   2. GOOGLE_APPLICATION_CREDENTIALS=/caminho/da/chave.json node set_tenant_claims.js
//   3. Rode primeiro no projeto de TESTE (farmacontrol-dev-6a3e3), confirme, depois em PRODUÇÃO.
//
// Idempotente: pode rodar de novo a qualquer momento (ex.: depois de aprovar/criar conta nova) —
// só grava a claim de quem ainda não tem, ou cuja claim estiver desatualizada em relação ao
// Firestore. Não apaga nem altera nenhum dado do Firestore, só metadados da conta de login.

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const auth = getAuth();

async function main() {
  const snap = await db.collection('users').get();
  let atualizados = 0, jaCertos = 0, semTenant = 0, erros = 0;
  for (const doc of snap.docs) {
    const uid = doc.id;
    const tenantId = doc.data().tenant_id;
    if (!tenantId) { semTenant++; console.log(`users/${uid}: sem tenant_id no Firestore, pulei.`); continue; }
    try {
      const userRecord = await auth.getUser(uid);
      const claims = userRecord.customClaims || {};
      if (claims.tenant_id === tenantId) { jaCertos++; continue; }
      await auth.setCustomUserClaims(uid, Object.assign({}, claims, { tenant_id: tenantId }));
      atualizados++;
      console.log(`users/${uid}: claim tenant_id="${tenantId}" gravada.`);
    } catch (e) {
      erros++;
      console.error(`users/${uid}: ERRO — ${e.message} (provavelmente a conta de login não existe mais no Authentication; o doc do Firestore ficou órfão)`);
    }
  }
  console.log(`\nConcluído. ${atualizados} conta(s) atualizada(s), ${jaCertos} já estavam certas, ${semTenant} sem tenant_id, ${erros} erro(s).`);
  console.log('IMPORTANTE: quem já está logado precisa recarregar a página (ou a própria auto-atualização do app já força isso) pra pegar a claim nova — o token de login antigo, já em uso, não tem essa informação até ser renovado.');
}

main().catch(function (e) { console.error(e); process.exit(1); });
