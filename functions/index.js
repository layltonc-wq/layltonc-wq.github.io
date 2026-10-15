// Runtime: Node.js 22 (migrado em 16/10/2026; o Node 20 é descontinuado em 30/10/2026).
// Cloud Function que mantém medicamentos/{id}.estoqueAtual sempre em dia, automaticamente,
// toda vez que um documento de entries é criado, editado ou apagado — não importa de qual tela
// do app veio a escrita. Isso substitui o cálculo "somar todo o histórico toda vez que o app
// abre" (lento com muitos dados) por um número já pronto, atualizado incrementalmente.
//
// REGRA DE NEGÓCIO (tem que bater exatamente com calcStockBruto() em index.html):
//   - entrada: soma a quantidade, EXCETO se divergenciaTipo === 'nota' (entrada fictícia de
//     divergência de nota fiscal, não é estoque real).
//   - saida: subtrai a quantidade, EXCETO se ficticioDiv (saída fictícia de divergência).
//   - qualquer outro tipo, ou sem medicamentoId: ignora.
//
// estoqueAtual guarda o valor BRUTO (pode ficar negativo) — o mesmo conceito de calcStockBruto()
// no app. Quem quiser o valor "pra mostrar" (nunca negativo) faz Math.max(0, estoqueAtual) no
// cliente — não precisa duplicar essa lógica aqui.

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');

initializeApp();
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

exports.atualizarEstoqueAtual = onDocumentWritten('entries/{entryId}', async (event) => {
  const antes = event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const depois = event.data.after && event.data.after.exists ? event.data.after.data() : null;

  const efeitoAntes = efeito(antes); // documento como estava — precisa ser REVERTIDO
  const efeitoDepois = efeito(depois); // documento como ficou — precisa ser APLICADO

  const ajustes = {}; // medicamentoId -> delta líquido
  if (efeitoAntes) ajustes[efeitoAntes.medicamentoId] = (ajustes[efeitoAntes.medicamentoId] || 0) - efeitoAntes.delta;
  if (efeitoDepois) ajustes[efeitoDepois.medicamentoId] = (ajustes[efeitoDepois.medicamentoId] || 0) + efeitoDepois.delta;

  const medicamentoIds = Object.keys(ajustes).filter(function (id) { return ajustes[id] !== 0; });
  if (medicamentoIds.length === 0) return;

  await Promise.all(medicamentoIds.map(async function (medicamentoId) {
    try {
      await db.collection('medicamentos').doc(medicamentoId).update({
        estoqueAtual: FieldValue.increment(ajustes[medicamentoId]),
      });
    } catch (e) {
      // Medicamento pode ter sido apagado com entradas/saídas órfãs ainda existindo — não deve
      // derrubar a função inteira nem as outras atualizações do mesmo evento.
      logger.error('Falha ao ajustar estoqueAtual de medicamentos/' + medicamentoId + ': ' + e.message, {
        medicamentoId: medicamentoId,
        delta: ajustes[medicamentoId],
        entryId: event.params.entryId,
      });
    }
  }));
});

// ===========================================================================================
// MULTI-PREFEITURA (16/10/2026)
// ===========================================================================================
// 1) trocarPrefeitura — callable. SÓ conta listada em super_admins/<uid> (você, criada à mão no Console) pode chamar. Troca a "marca"
//    tenant_id (custom claim) do token de login para a prefeitura escolhida (ou volta para a de origem com tenantId='home'). As
//    regras do Firestore leem essa marca (userTenant() em firestore.rules), então, depois de renovar o token, o app já enxerga os
//    dados da outra prefeitura SEM novo login. Cada troca fica registrada em logs_visitas (só o servidor escreve/lê).
// 2) sincronizarClaimUsuario — grava a marca tenant_id no login de cada usuário quando o cadastro é criado/alterado, para não
//    precisar mais rodar scripts/set_tenant_claims.js à mão a cada prefeitura nova. Ignora super admins (a marca deles é controlada
//    por trocarPrefeitura).
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');

async function ehSuperAdmin(uid) {
  const s = await db.collection('super_admins').doc(uid).get();
  return s.exists;
}

exports.trocarPrefeitura = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Faça login primeiro.');
  if (!(await ehSuperAdmin(uid))) throw new HttpsError('permission-denied', 'Só super administradores podem trocar de prefeitura.');
  const meu = await db.collection('users').doc(uid).get();
  const home = meu.exists ? (meu.data().tenant_id || null) : null;
  let alvo = String((request.data && request.data.tenantId) || '').trim();
  if (!alvo || alvo === 'home') alvo = home;
  if (!alvo) throw new HttpsError('failed-precondition', 'Sua conta não tem prefeitura de origem.');
  const t = await db.collection('tenants').doc(alvo).get();
  if (!t.exists || t.data().ativo !== true) throw new HttpsError('not-found', 'Prefeitura inexistente ou desativada.');
  const auth = getAuth();
  const rec = await auth.getUser(uid);
  const antes = (rec.customClaims || {}).tenant_id || home;
  await auth.setCustomUserClaims(uid, Object.assign({}, rec.customClaims || {}, { tenant_id: alvo }));
  await db.collection('logs_visitas').add({
    uid, nome: meu.exists ? (meu.data().name || '') : '', de: antes || null, para: alvo, origem: home,
    em: FieldValue.serverTimestamp(),
  });
  logger.info('trocarPrefeitura', { uid, de: antes, para: alvo });
  return { tenantId: alvo, home };
});

exports.sincronizarClaimUsuario = onDocumentWritten('users/{uid}', async (event) => {
  const depois = event.data.after && event.data.after.exists ? event.data.after.data() : null;
  if (!depois || !depois.tenant_id) return;
  const uid = event.params.uid;
  try {
    if (await ehSuperAdmin(uid)) return;
    const auth = getAuth();
    const rec = await auth.getUser(uid);
    const claims = rec.customClaims || {};
    if (claims.tenant_id === depois.tenant_id) return;
    await auth.setCustomUserClaims(uid, Object.assign({}, claims, { tenant_id: depois.tenant_id }));
    logger.info('claim tenant_id gravada', { uid, tenant_id: depois.tenant_id });
  } catch (e) {
    logger.error('Falha ao sincronizar claim de users/' + uid + ': ' + e.message);
  }
});
