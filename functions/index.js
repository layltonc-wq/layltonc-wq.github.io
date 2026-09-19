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
