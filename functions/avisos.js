'use strict';
// Avisos por e-mail e WhatsApp quando o app registra um erro (erros_app) ou alguém abre um chamado (chamados_suporte).
// A configuração fica em config_avisos/principal (só o administrador do FarmaControl lê e grava; ver firestore.rules):
//   { ativo, avisarErros, avisarChamados, emailPara, emailDe, emailSenha, whatsappFone, whatsappChave }
//   - e-mail: Gmail com "senha de app" (nodemailer);  - WhatsApp: CallMeBot (gratuito; a chave vem do próprio bot).
// Proteções: o mesmo erro (mesma prefeitura + mesma mensagem) só avisa 1 vez por hora e há um teto de avisos por hora,
// para uma falha em massa não encher o celular de mensagens. O botão "Enviar aviso de teste" ignora essas proteções.

const LIMITE_POR_HORA = 10;
const JANELA_REPETIDO_MS = 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;

function corta(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function montarMensagem(tipo, d) {
  d = d || {};
  const onde = d.tenant_id ? ' · ' + d.tenant_id : '';
  if (d.teste) {
    return { assunto: 'FarmaControl: teste de aviso', texto: 'Teste de aviso do FarmaControl: se você recebeu esta mensagem, os avisos estão funcionando.' };
  }
  if (tipo === 'chamado') {
    const quem = d.nome || d.userName || d.uid || 'alguém';
    return {
      assunto: 'FarmaControl: novo chamado' + onde,
      texto: 'Novo chamado de suporte' + onde + '\nTipo: ' + (d.tipo || '—') + '\nDe: ' + corta(quem, 60) + '\n' + corta(d.texto, 400)
    };
  }
  return {
    assunto: 'FarmaControl: erro no app' + onde,
    texto: 'Erro no FarmaControl' + onde + '\n' + corta(d.mensagem, 250) + (d.origem ? '\nOrigem: ' + corta(d.origem, 40) : '') + (d.tela ? '\nTela: ' + corta(d.tela, 40) : '') + (d.versao ? '\nVersão: ' + corta(d.versao, 30) : '')
  };
}

function assinatura(d) { return (String(d.tenant_id || '') + '|' + String(d.mensagem || '').slice(0, 80)).toLowerCase(); }

// Decide se este aviso pode sair agora e já registra no controle (transação, para duas falhas simultâneas não furarem o teto).
async function podeAvisar(db, tipo, d, agora) {
  if (d.teste || tipo === 'chamado') return { enviar: true };
  const ref = db.collection('avisos_estado').doc('erros');
  const ms = agora.getTime();
  return db.runTransaction(async (tx) => {
    const sn = await tx.get(ref);
    const est = sn.exists ? sn.data() : {};
    const vistos = Object.assign({}, est.vistos || {});
    const enviados = (est.enviados || []).filter((t) => ms - t < HORA_MS);
    Object.keys(vistos).forEach((k) => { if (ms - vistos[k] > JANELA_REPETIDO_MS) delete vistos[k]; });
    const sig = assinatura(d);
    if (vistos[sig]) return { enviar: false, motivo: 'repetido' };
    if (enviados.length >= LIMITE_POR_HORA) return { enviar: false, motivo: 'limite' };
    vistos[sig] = ms; enviados.push(ms);
    tx.set(ref, { vistos, enviados });
    return { enviar: true };
  });
}

async function enviarEmail(cfg, msg, deps) {
  if (!cfg.emailPara || !cfg.emailDe || !cfg.emailSenha) return 'não configurado';
  const nodemailer = (deps && deps.nodemailer) || require('nodemailer');
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user: cfg.emailDe, pass: String(cfg.emailSenha).replace(/\s+/g, '') } });
  await t.sendMail({ from: '"FarmaControl" <' + cfg.emailDe + '>', to: cfg.emailPara, subject: msg.assunto, text: msg.texto });
  return 'ok';
}

async function enviarWhatsapp(cfg, msg, deps) {
  if (!cfg.whatsappFone || !cfg.whatsappChave) return 'não configurado';
  const f = (deps && deps.fetch) || fetch;
  const fone = String(cfg.whatsappFone).replace(/[^0-9]/g, '');
  const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(fone) + '&text=' + encodeURIComponent(msg.texto) + '&apikey=' + encodeURIComponent(String(cfg.whatsappChave).trim());
  const r = await f(url);
  if (!r.ok) throw new Error('WhatsApp respondeu ' + r.status);
  return 'ok';
}

// Ponto de entrada das funções. `deps` serve para os testes (db, agora, nodemailer, fetch, logger).
async function avisar(db, tipo, d, deps) {
  deps = deps || {};
  const log = deps.logger || { info() {}, warn() {} };
  const agora = deps.agora || new Date();
  const cfgRef = db.collection('config_avisos').doc('principal');
  const cs = await cfgRef.get();
  const cfg = cs.exists ? cs.data() : null;
  if (!cfg || !cfg.ativo) return { enviado: false, motivo: 'desligado' };
  if (!d.teste && tipo === 'erro' && cfg.avisarErros === false) return { enviado: false, motivo: 'erros desligados' };
  if (!d.teste && tipo === 'chamado' && cfg.avisarChamados === false) return { enviado: false, motivo: 'chamados desligados' };
  const pode = await podeAvisar(db, tipo, d, agora);
  if (!pode.enviar) { log.info('aviso não enviado: ' + pode.motivo); return { enviado: false, motivo: pode.motivo }; }
  const msg = montarMensagem(tipo, d);
  const res = { em: agora.toISOString(), teste: !!d.teste };
  try { res.email = await enviarEmail(cfg, msg, deps); } catch (e) { res.email = 'erro: ' + corta(e && e.message, 120); log.warn('aviso e-mail falhou', e); }
  try { res.whatsapp = await enviarWhatsapp(cfg, msg, deps); } catch (e) { res.whatsapp = 'erro: ' + corta(e && e.message, 120); log.warn('aviso WhatsApp falhou', e); }
  await cfgRef.set({ ultimoResultado: res }, { merge: true });
  return { enviado: true, resultado: res };
}

module.exports = { avisar, montarMensagem, podeAvisar, enviarEmail, enviarWhatsapp, assinatura, LIMITE_POR_HORA };
