// Avisos por e-mail/WhatsApp (functions/avisos.js): mensagem, desligado, repetido, teto por hora, teste e falha de um canal.
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8085'; process.env.GCLOUD_PROJECT = process.env.FC_PROJ;
const admin = require('firebase-admin');
const avisos = require('../../functions/avisos.js');
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.FC_PROJ });
const db = admin.firestore();
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FALHA ') + m); if (!c) falhas++; };
(async () => {
  const emails = [], zaps = [];
  let zapFalha = false;
  const deps = (agora) => ({
    agora,
    nodemailer: { createTransport: () => ({ sendMail: async (m) => { emails.push(m); } }) },
    fetch: async (url) => { zaps.push(url); return zapFalha ? { ok: false, status: 500 } : { ok: true, status: 200 }; }
  });
  const t0 = new Date('2026-11-20T12:00:00Z');
  const erro = (n, t) => ({ mensagem: 'Falha número ' + n, origem: 'janela', tenant_id: t || 'vicencia-pe', versao: 'abc' });

  const m = avisos.montarMensagem('erro', erro(1));
  ok(m.texto.includes('Falha número 1') && m.texto.includes('vicencia-pe'), 'a mensagem de erro traz o texto e a prefeitura');
  ok(avisos.montarMensagem('chamado', { tipo: 'duvida', nome: 'Ana', texto: 'Preciso de ajuda', tenant_id: 'itaquitinga-pe' }).texto.includes('Preciso de ajuda'), 'a mensagem de chamado traz o texto');

  let r = await avisos.avisar(db, 'erro', erro(1), deps(t0));
  ok(!r.enviado && r.motivo === 'desligado', 'sem configuração, nada é enviado');

  await db.collection('config_avisos').doc('principal').set({ ativo: true, avisarErros: true, avisarChamados: true, emailPara: 'dest@x.com', emailDe: 'rem@gmail.com', emailSenha: 'abcd efgh ijkl mnop', whatsappFone: '+55 (81) 99999-0000', whatsappChave: '123456' });
  r = await avisos.avisar(db, 'erro', erro(1), deps(t0));
  ok(r.enviado && emails.length === 1 && zaps.length === 1, 'configurado: sai 1 e-mail e 1 WhatsApp');
  ok(emails[0].to === 'dest@x.com' && zaps[0].includes('phone=5581999990000') && zaps[0].includes('apikey=123456'), 'destinos corretos (telefone só com números)');
  const c1 = (await db.collection('config_avisos').doc('principal').get()).data();
  ok(c1.ultimoResultado && c1.ultimoResultado.email === 'ok' && c1.ultimoResultado.whatsapp === 'ok', 'o resultado do último envio fica guardado');

  r = await avisos.avisar(db, 'erro', erro(1), deps(new Date(t0.getTime() + 600000)));
  ok(!r.enviado && r.motivo === 'repetido' && emails.length === 1, 'o mesmo erro em 10 minutos não avisa de novo');
  r = await avisos.avisar(db, 'erro', erro(1, 'itaquitinga-pe'), deps(new Date(t0.getTime() + 600000)));
  ok(r.enviado, 'o mesmo texto em outra prefeitura avisa');
  r = await avisos.avisar(db, 'erro', erro(1), deps(new Date(t0.getTime() + 2 * 3600000)));
  ok(r.enviado, 'depois de 2 horas o mesmo erro avisa de novo');

  // teto por hora
  const base = new Date(t0.getTime() + 10 * 3600000);
  let env = 0;
  for (let i = 100; i < 120; i++) { const x = await avisos.avisar(db, 'erro', erro(i), deps(base)); if (x.enviado) env++; }
  ok(env === avisos.LIMITE_POR_HORA, 'teto de ' + avisos.LIMITE_POR_HORA + ' avisos por hora (enviou ' + env + ')');

  // chamado e teste ignoram o teto
  r = await avisos.avisar(db, 'chamado', { tipo: 'problema', nome: 'Ana', texto: 'Não consigo entrar', tenant_id: 'vicencia-pe' }, deps(base));
  ok(r.enviado, 'chamado de suporte sempre avisa');
  r = await avisos.avisar(db, 'erro', { teste: true, mensagem: 'Teste' }, deps(base));
  ok(r.enviado && emails[emails.length - 1].text.includes('teste de aviso'), 'o aviso de teste ignora o teto');

  // chave desligada
  await db.collection('config_avisos').doc('principal').set({ avisarErros: false }, { merge: true });
  r = await avisos.avisar(db, 'erro', erro(999), deps(new Date(base.getTime() + 5 * 3600000)));
  ok(!r.enviado && r.motivo === 'erros desligados', '"avisar erros" desligado não envia');
  await db.collection('config_avisos').doc('principal').set({ avisarErros: true }, { merge: true });

  // um canal falha, o outro continua
  zapFalha = true;
  r = await avisos.avisar(db, 'erro', erro(2000), deps(new Date(base.getTime() + 9 * 3600000)));
  ok(r.enviado && r.resultado.email === 'ok' && /^erro/.test(r.resultado.whatsapp), 'se o WhatsApp falha, o e-mail sai e o erro fica registrado');
  setTimeout(() => process.exit(falhas ? 1 : 0), 200);
})().catch((e) => { console.error(e); process.exit(1); });
