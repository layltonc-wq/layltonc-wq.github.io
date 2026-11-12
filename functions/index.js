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
    return { medicamentoId: doc.medicamentoId, delta: Number(doc.quantidade) || 0, sat: doc.local === 'satelite' };
  }
  if (doc.tipo === 'saida') {
    if (doc.ficticioDiv) return null;
    return { medicamentoId: doc.medicamentoId, delta: -(Number(doc.quantidade) || 0), sat: doc.local === 'satelite' };
  }
  return null;
}

exports.atualizarEstoqueAtual = onDocumentWritten('entries/{entryId}', async (event) => {
  const antes = event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const depois = event.data.after && event.data.after.exists ? event.data.after.data() : null;

  const efeitoAntes = efeito(antes); // documento como estava — precisa ser REVERTIDO
  const efeitoDepois = efeito(depois); // documento como ficou — precisa ser APLICADO

  // ESTOQUES SEPARADOS (CAF / Satélite): estoqueAtual continua sendo o TOTAL da prefeitura (como sempre foi); estoqueLocal.satelite
  // guarda só a parte do Satélite. O estoque do CAF é "total − satélite" (lançamento sem campo local conta como CAF).
  const ajustes = {}; // medicamentoId -> delta líquido (total)
  const ajustesSat = {}; // medicamentoId -> delta líquido só do Satélite
  if (efeitoAntes) {
    ajustes[efeitoAntes.medicamentoId] = (ajustes[efeitoAntes.medicamentoId] || 0) - efeitoAntes.delta;
    if (efeitoAntes.sat) ajustesSat[efeitoAntes.medicamentoId] = (ajustesSat[efeitoAntes.medicamentoId] || 0) - efeitoAntes.delta;
  }
  if (efeitoDepois) {
    ajustes[efeitoDepois.medicamentoId] = (ajustes[efeitoDepois.medicamentoId] || 0) + efeitoDepois.delta;
    if (efeitoDepois.sat) ajustesSat[efeitoDepois.medicamentoId] = (ajustesSat[efeitoDepois.medicamentoId] || 0) + efeitoDepois.delta;
  }

  const medicamentoIds = Object.keys(ajustes).filter(function (id) { return ajustes[id] !== 0 || (ajustesSat[id] || 0) !== 0; });
  if (medicamentoIds.length === 0) return;

  await Promise.all(medicamentoIds.map(async function (medicamentoId) {
    try {
      const upd = { estoqueAtual: FieldValue.increment(ajustes[medicamentoId]) };
      if ((ajustesSat[medicamentoId] || 0) !== 0) upd['estoqueLocal.satelite'] = FieldValue.increment(ajustesSat[medicamentoId]);
      await db.collection('medicamentos').doc(medicamentoId).update(upd);
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
    // 'ativo' = conta aprovada. As regras do Firestore (membro()) só liberam os dados do município para quem
    // tem ativo=true; conta pendente, recusada ou inativa fica de fora (ativo=false).
    const ativo = depois.status === undefined || depois.status === 'approved' || depois.status === 'ativo';
    if (claims.tenant_id === depois.tenant_id && claims.ativo === ativo) return;
    await auth.setCustomUserClaims(uid, Object.assign({}, claims, { tenant_id: depois.tenant_id, ativo: ativo }));
    logger.info('claims gravadas', { uid, tenant_id: depois.tenant_id, ativo });
  } catch (e) {
    logger.error('Falha ao sincronizar claim de users/' + uid + ': ' + e.message);
  }
});

// ---- Solicitações das UBS (link público, sem login) ----
// Toda a lógica está em ubs.js. A página pública /ubs/ só fala com esta função; nunca com o banco.
const { onRequest } = require('firebase-functions/v2/https');
const ubs = require('./ubs');
exports.ubsApi = onRequest(
  { region: 'southamerica-east1', invoker: 'public', cors: ['https://www.farmacontrol.app.br', 'https://farmacontrol.app.br', 'https://farmacontrol-dev-6a3e3.web.app'], maxInstances: 10, memory: '256MiB' },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.status(405).json({ ok: false, erro: 'Método não permitido.' }); return; }
    const ip = String((req.headers['x-forwarded-for'] || req.ip || '')).split(',')[0].trim() || 'sem-ip';
    const r = await ubs.processar(db, req.body, { ip, agora: new Date() });
    res.status(r.status).json(r.json);
  }
);
