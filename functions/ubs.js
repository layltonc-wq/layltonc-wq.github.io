// Solicitações das UBS — parte pública (sem login). Tudo passa por aqui, no servidor: a página pública
// NUNCA toca o banco direto. As regras do Firestore bloqueiam qualquer acesso anônimo; esta função usa
// o acesso administrativo e faz as validações (período aberto, um envio por período, materiais permitidos,
// protocolo + UBS na consulta, limite de tentativas).
//
// Coleções (todas com tenant_id):
//   ubs/{id}                  { nome, ativa, materiais:[medicamentoId] }
//   ubs_periodos/{id}         { tipo:'semanal'|'mensal', nome, inicio:'AAAA-MM-DD', fim:'AAAA-MM-DD' }
//   ubs_envios/{tenant__ubs__periodo}  trava "um envio por período" (a gestora libera apagando este doc)
//   ubs_solicitacoes/{tenant__protocolo}
//   ubs_limites/{hash}        contadores de tentativas (só o servidor lê/escreve)

const crypto = require('crypto');

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
const LIM = {
  ipConsulta: { max: 40, janelaMs: 15 * 60 * 1000 },     // consultas por IP
  ipEnvio: { max: 20, janelaMs: 60 * 60 * 1000 },        // envios/correções por IP
  falhaUbs: { max: 10, janelaMs: 15 * 60 * 1000 },       // protocolos errados por UBS (trava a consulta daquela UBS)
  maxItens: 60,
  maxQtd: 99999,
};

class ErroUbs extends Error {
  constructor(codigo, mensagem, http) { super(mensagem); this.codigo = codigo; this.http = http || 400; }
}

function hash(s) { return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 40); }
function txt(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }
function txtLivre(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max); }

// Data de "hoje" em Pernambuco (UTC-3, sem horário de verão) no formato AAAA-MM-DD.
function hojeRecife(agora) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

function gerarProtocolo() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)];
  return 'UBS-' + s.slice(0, 4) + '-' + s.slice(4);
}
function normProtocolo(p) {
  const s = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = s.match(/^UBS([A-Z0-9]{8})$/);
  return m ? 'UBS-' + m[1].slice(0, 4) + '-' + m[1].slice(4) : '';
}

async function limitar(db, chave, cfg, agoraMs, soVerificar) {
  const ref = db.collection('ubs_limites').doc(hash(chave));
  return db.runTransaction(async (tx) => {
    const sn = await tx.get(ref);
    let n = 0, desde = agoraMs;
    if (sn.exists) {
      const d = sn.data();
      if (agoraMs - (d.desde || 0) < cfg.janelaMs) { n = d.n || 0; desde = d.desde; }
    }
    if (n >= cfg.max) return false;
    if (!soVerificar) tx.set(ref, { n: n + 1, desde, ate: desde + cfg.janelaMs });
    return true;
  });
}

async function carregarTenant(db, tenant) {
  const id = txt(tenant, 60);
  if (!/^[a-z0-9][a-z0-9-]{1,58}$/.test(id)) throw new ErroUbs('tenant_invalido', 'Link inválido.');
  const t = await db.collection('tenants').doc(id).get();
  if (!t.exists || t.data().ativo === false) throw new ErroUbs('tenant_invalido', 'Link inválido ou prefeitura desativada.', 404);
  return { id, nome: t.data().nome || '' };
}

async function carregarUbs(db, tenantId, ubsId) {
  const id = txt(ubsId, 60);
  if (!id) throw new ErroUbs('ubs_invalida', 'Escolha a sua UBS.');
  const sn = await db.collection('ubs').doc(id).get();
  if (!sn.exists || sn.data().tenant_id !== tenantId || sn.data().ativa === false) throw new ErroUbs('ubs_invalida', 'UBS não encontrada ou desativada.', 404);
  return { id, ...sn.data() };
}

async function periodoAberto(db, tenantId, agora) {
  const hoje = hojeRecife(agora);
  const sn = await db.collection('ubs_periodos').where('tenant_id', '==', tenantId).get();
  const todos = sn.docs.map((d) => ({ id: d.id, ...d.data() }));
  const abertos = todos.filter((p) => p.inicio <= hoje && hoje <= p.fim).sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
  const proximos = todos.filter((p) => p.inicio > hoje).sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
  return { atual: abertos[0] || null, proximo: proximos[0] || null, hoje };
}

function publicoPeriodo(p) { return p ? { id: p.id, nome: p.nome || '', tipo: p.tipo || '', inicio: p.inicio, fim: p.fim } : null; }

async function nomesMateriais(db, tenantId, ids) {
  const out = {};
  const lista = Array.from(new Set(ids)).filter(Boolean);
  if (!lista.length) return out;
  const refs = lista.map((id) => db.collection('medicamentos').doc(id));
  const snaps = await db.getAll(...refs);
  snaps.forEach((s) => { if (s.exists && s.data().tenant_id === tenantId) out[s.id] = { nome: s.data().nome || '', unidade: s.data().unidade || '' }; });
  return out;
}

function validarItens(brutos, ubs, nomes, existentes) {
  if (!Array.isArray(brutos) || brutos.length === 0) throw new ErroUbs('sem_itens', 'Inclua pelo menos um material.');
  if (brutos.length > LIM.maxItens) throw new ErroUbs('itens_demais', 'Muitos itens. O máximo é ' + LIM.maxItens + '.');
  const permitidos = new Set(ubs.materiais || []);
  const vistos = new Set();
  const itens = [];
  brutos.forEach((b, i) => {
    const qtd = Number(b && b.qtd);
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > LIM.maxQtd) throw new ErroUbs('qtd_invalida', 'Quantidade inválida no item ' + (i + 1) + '.');
    const medId = txt(b.medId, 60);
    const obs = txtLivre(b.obs, 200);
    const antigo = existentes && b.id ? existentes.find((x) => x.id === b.id) : null;
    if (medId) {
      if (!permitidos.has(medId) || !nomes[medId]) throw new ErroUbs('material_nao_permitido', 'Um dos materiais não está liberado para a sua UBS.');
      if (vistos.has(medId)) throw new ErroUbs('item_repetido', 'Material repetido na lista: ' + nomes[medId].nome + '.');
      vistos.add(medId);
      itens.push({
        id: antigo ? antigo.id : 'i' + (itens.length + 1) + crypto.randomBytes(2).toString('hex'),
        medId, nome: nomes[medId].nome, qtdSolicitada: qtd, obs, foraDaLista: false, justificativa: '',
        qtdAprovada: antigo ? antigo.qtdAprovada : null, qtdSeparada: 0, obsFarm: antigo ? antigo.obsFarm || '' : '', decisao: '',
      });
    } else {
      const nome = txt(b.nome, 80), just = txtLivre(b.justificativa, 300);
      if (nome.length < 2) throw new ErroUbs('nome_invalido', 'Informe o nome do material fora da lista (item ' + (i + 1) + ').');
      if (just.length < 3) throw new ErroUbs('justificativa', 'Informe a justificativa do material "' + nome + '".');
      const chave = 'x:' + nome.toLowerCase();
      if (vistos.has(chave)) throw new ErroUbs('item_repetido', 'Material repetido na lista: ' + nome + '.');
      vistos.add(chave);
      itens.push({
        id: antigo ? antigo.id : 'i' + (itens.length + 1) + crypto.randomBytes(2).toString('hex'),
        medId: '', nome, qtdSolicitada: qtd, obs, foraDaLista: true, justificativa: just,
        qtdAprovada: antigo ? antigo.qtdAprovada : null, qtdSeparada: 0, obsFarm: antigo ? antigo.obsFarm || '' : '', decisao: antigo ? antigo.decisao || '' : '',
      });
    }
  });
  return itens;
}

// ---------- ações públicas ----------

async function acaoInfo(db, b, ctx) {
  const t = await carregarTenant(db, b.tenant);
  const sn = await db.collection('ubs').where('tenant_id', '==', t.id).get();
  const ubs = sn.docs.map((d) => ({ id: d.id, nome: d.data().nome || '', ativa: d.data().ativa !== false })).filter((u) => u.ativa).sort((a, c) => a.nome.localeCompare(c.nome));
  const p = await periodoAberto(db, t.id, ctx.agora);
  return { municipio: t.nome, ubs: ubs.map((u) => ({ id: u.id, nome: u.nome })), periodo: publicoPeriodo(p.atual), proximoPeriodo: publicoPeriodo(p.proximo) };
}

async function acaoUbs(db, b, ctx) {
  const t = await carregarTenant(db, b.tenant);
  const ubs = await carregarUbs(db, t.id, b.ubsId);
  const p = await periodoAberto(db, t.id, ctx.agora);
  const nomes = await nomesMateriais(db, t.id, ubs.materiais || []);
  const materiais = Object.keys(nomes).map((id) => ({ id, nome: nomes[id].nome, unidade: nomes[id].unidade })).sort((a, c) => a.nome.localeCompare(c.nome));
  let jaEnviou = false;
  if (p.atual) jaEnviou = (await db.collection('ubs_envios').doc(`${t.id}__${ubs.id}__${p.atual.id}`).get()).exists;
  return { ubs: { id: ubs.id, nome: ubs.nome }, periodo: publicoPeriodo(p.atual), proximoPeriodo: publicoPeriodo(p.proximo), jaEnviou, materiais };
}

async function acaoEnviar(db, b, ctx) {
  if (!(await limitar(db, 'envio|' + ctx.ip, LIM.ipEnvio, ctx.agora.getTime()))) throw new ErroUbs('muitas_tentativas', 'Muitas tentativas. Aguarde um pouco e tente de novo.', 429);
  const t = await carregarTenant(db, b.tenant);
  const ubs = await carregarUbs(db, t.id, b.ubsId);
  const enfermeira = txt(b.nome, 80);
  if (enfermeira.length < 3) throw new ErroUbs('nome_invalido', 'Informe o seu nome.');
  const p = await periodoAberto(db, t.id, ctx.agora);
  if (!p.atual) throw new ErroUbs('fora_do_periodo', p.proximo ? 'Não há período de solicitação aberto. O próximo começa em ' + p.proximo.inicio.split('-').reverse().join('/') + '.' : 'Não há período de solicitação aberto no momento.', 403);
  const nomes = await nomesMateriais(db, t.id, (Array.isArray(b.itens) ? b.itens : []).map((i) => txt(i && i.medId, 60)));
  const itens = validarItens(b.itens, ubs, nomes, null);
  const agoraIso = ctx.agora.toISOString();
  const envioRef = db.collection('ubs_envios').doc(`${t.id}__${ubs.id}__${p.atual.id}`);
  for (let tent = 0; tent < 6; tent++) {
    const protocolo = gerarProtocolo();
    const solRef = db.collection('ubs_solicitacoes').doc(`${t.id}__${protocolo}`);
    const ok = await db.runTransaction(async (tx) => {
      const [e, s] = await Promise.all([tx.get(envioRef), tx.get(solRef)]);
      if (e.exists) throw new ErroUbs('ja_enviou', 'A sua UBS já enviou a solicitação deste período. Para enviar outra, peça à gestora para liberar um novo envio.', 409);
      if (s.exists) return false; // colisão de protocolo (muito rara): tenta outro
      tx.create(envioRef, { tenant_id: t.id, ubsId: ubs.id, periodoId: p.atual.id, protocolo, criadoEm: agoraIso });
      tx.create(solRef, {
        tenant_id: t.id, ubsId: ubs.id, ubsNome: ubs.nome, periodoId: p.atual.id, periodoNome: p.atual.nome || '',
        periodoInicio: p.atual.inicio, periodoFim: p.atual.fim, protocolo, enfermeira, itens,
        obs: txtLivre(b.obs, 500), status: 'enviada', obsFarm: '',
        historico: [{ em: agoraIso, acao: 'enviada', por: enfermeira, obs: '' }], criadoEm: agoraIso, atualizadoEm: agoraIso,
      });
      return true;
    });
    if (ok) return { protocolo, periodo: publicoPeriodo(p.atual), itens: itens.length };
  }
  throw new ErroUbs('erro_protocolo', 'Não foi possível gerar o protocolo. Tente de novo.', 500);
}

async function buscarSolicitacao(db, b, ctx) {
  const t = await carregarTenant(db, b.tenant);
  const ubs = await carregarUbs(db, t.id, b.ubsId);
  const agoraMs = ctx.agora.getTime();
  if (!(await limitar(db, 'consulta|' + ctx.ip, LIM.ipConsulta, agoraMs))) throw new ErroUbs('muitas_tentativas', 'Muitas consultas. Aguarde alguns minutos e tente de novo.', 429);
  const chaveFalha = 'falha|' + t.id + '|' + ubs.id;
  if (!(await limitar(db, chaveFalha, LIM.falhaUbs, agoraMs, true))) throw new ErroUbs('muitas_tentativas', 'Consulta bloqueada por excesso de tentativas. Aguarde alguns minutos ou procure a farmácia.', 429);
  const protocolo = normProtocolo(b.protocolo);
  let achou = null;
  if (protocolo) {
    const sn = await db.collection('ubs_solicitacoes').where('tenant_id', '==', t.id).where('ubsId', '==', ubs.id).where('protocolo', '==', protocolo).limit(1).get();
    if (!sn.empty) achou = { ref: sn.docs[0].ref, id: sn.docs[0].id, ...sn.docs[0].data() };
  }
  if (!achou) {
    await limitar(db, chaveFalha, LIM.falhaUbs, agoraMs);
    throw new ErroUbs('nao_encontrada', 'Solicitação não encontrada. Confira a UBS e o número do protocolo.', 404);
  }
  return { t, ubs, sol: achou };
}

const COM_APROVACAO = ['aprovada', 'parcial', 'separada'];
function visaoPublica(sol) {
  const aprovado = COM_APROVACAO.indexOf(sol.status) >= 0;
  return {
    protocolo: sol.protocolo, status: sol.status, ubs: sol.ubsNome, periodo: sol.periodoNome || '', enviadaEm: sol.criadoEm, atualizadaEm: sol.atualizadoEm,
    enfermeira: sol.enfermeira, obs: sol.obs || '', obsFarm: sol.obsFarm || '', podeCorrigir: sol.status === 'devolvida',
    itens: (sol.itens || []).map((i) => ({
      id: i.id, medId: i.medId || '', nome: i.nome, foraDaLista: !!i.foraDaLista, justificativa: i.justificativa || '', obs: i.obs || '',
      qtdSolicitada: i.qtdSolicitada,
      qtdAprovada: aprovado && i.qtdAprovada != null ? i.qtdAprovada : null,
      qtdSeparada: aprovado ? i.qtdSeparada || 0 : null,
      qtdPendente: aprovado && i.qtdAprovada != null ? Math.max(0, i.qtdAprovada - (i.qtdSeparada || 0)) : null,
      obsFarm: i.obsFarm || '',
    })),
    historico: (sol.historico || []).filter((h) => ['enviada', 'devolvida', 'aprovada', 'cancelada', 'reenviada', 'separada', 'parcial'].indexOf(h.acao) >= 0)
      .map((h) => ({ em: h.em, acao: h.acao, obs: h.acao === 'enviada' || h.acao === 'reenviada' ? '' : h.obs || '' })),
  };
}

async function acaoConsultar(db, b, ctx) {
  const { sol } = await buscarSolicitacao(db, b, ctx);
  return { solicitacao: visaoPublica(sol) };
}

async function acaoCorrigir(db, b, ctx) {
  if (!(await limitar(db, 'envio|' + ctx.ip, LIM.ipEnvio, ctx.agora.getTime()))) throw new ErroUbs('muitas_tentativas', 'Muitas tentativas. Aguarde um pouco e tente de novo.', 429);
  const { t, ubs, sol } = await buscarSolicitacao(db, b, ctx);
  if (sol.status !== 'devolvida') throw new ErroUbs('nao_devolvida', 'Esta solicitação não está aguardando correção.', 409);
  const nomes = await nomesMateriais(db, t.id, (Array.isArray(b.itens) ? b.itens : []).map((i) => txt(i && i.medId, 60)));
  const itens = validarItens(b.itens, ubs, nomes, sol.itens);
  const nome = txt(b.nome, 80) || sol.enfermeira;
  const agoraIso = ctx.agora.toISOString();
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(sol.ref);
    if (!cur.exists || cur.data().status !== 'devolvida') throw new ErroUbs('nao_devolvida', 'Esta solicitação não está aguardando correção.', 409);
    const hist = (cur.data().historico || []).concat([{ em: agoraIso, acao: 'reenviada', por: nome, obs: '' }]);
    tx.update(sol.ref, { itens, obs: txtLivre(b.obs, 500), status: 'enviada', enfermeira: nome, historico: hist, atualizadoEm: agoraIso });
  });
  return { protocolo: sol.protocolo, status: 'enviada' };
}


// ===================================================================================================================
// CONFERÊNCIA DAS UBS (Vicência): as enfermeiras (sem login) informam o que ainda têm de cada medicamento enviado pela
// farmácia, com lote e validade. Serve para acompanhar o que está vencendo nas UBS. Só funciona se a farmácia ativou o link
// (config/ubsconf__<tenant> com ativo=true); se houver "codigo" nessa ficha, ele é exigido (compartilhado com as enfermeiras).
// As UBS vêm da lista do app (config/destinos__<tenant>.ubs; sem ela, a lista padrão). Nada de estoque da farmácia é exposto:
// só o que foi ENVIADO para a UBS escolhida (nome, lote, validade, quantidade enviada).
// ===================================================================================================================
const UBS_PADRAO_CONF = ['João Ramos','Com. Cristã','Chã dos M.','Agrovila','Angélicas','Usina Barra','Nova Vic. 3','Murupé','Borracha','Mãe Rainha','Trigueiros','Turiaçú','Anexo Maltex','Anexo Barra','Imbú'];
const LIM_CONF = { falhaCodigo: { max: 10, janelaMs: 15 * 60 * 1000 }, maxItens: 300, maxExtras: 40 };

function loteNorm(l) { return String(l == null ? '' : l).trim().replace(/\s+/g, ' ').toUpperCase(); }
// "MM/AAAA" a partir de "MM/AA", "MM/AAAA" ou "DD/MM/AAAA" ('' se inválida)
function validadeNorm(v) {
  const s = String(v == null ? '' : v).trim(); if (!s) return '';
  const p = s.split('/'); let mes, ano;
  if (p.length === 3) { mes = parseInt(p[1], 10); ano = parseInt(p[2], 10); }
  else if (p.length === 2) { mes = parseInt(p[0], 10); ano = parseInt(p[1], 10); }
  else return '';
  if (isNaN(mes) || isNaN(ano) || mes < 1 || mes > 12) return '';
  if (ano < 100) ano += ano <= 50 ? 2000 : 1900;
  if (ano < 2000 || ano > 2100) return '';
  return (mes < 10 ? '0' + mes : '' + mes) + '/' + ano;
}
function chaveItem(medId, lote, validade) { return String(medId || '') + '|' + loteNorm(lote) + '|' + validadeNorm(validade); }

// Estimativa do que ainda está na UBS. Mesma regra do painel do app:
//  - com conferência (a mais recente da UBS): saldo declarado + o que foi enviado DEPOIS dela;
//  - sem conferência daquele lote: tudo o que foi enviado (suposição conservadora: ainda está lá).
// envios: [{medId,nome,lote,validade,qtd,em}]  conf: {criadoEm,itens:[{medId,nome,lote,validade,qtd,origem}]} ou null
function estimarUbs(envios, conf) {
  const mapa = {};
  envios.forEach(function (e) {
    const k = chaveItem(e.medId, e.lote, e.validade);
    const o = mapa[k] || (mapa[k] = { key: k, medId: e.medId, nome: e.nome, lote: String(e.lote || '').trim(), validade: validadeNorm(e.validade), enviado: 0, ultimoEnvio: '', envios: [] });
    o.enviado += Number(e.qtd) || 0; o.envios.push({ qtd: Number(e.qtd) || 0, em: e.em || '' });
    if ((e.em || '') > o.ultimoEnvio) o.ultimoEnvio = e.em || '';
  });
  const decl = {};
  if (conf && Array.isArray(conf.itens)) conf.itens.forEach(function (i) { decl[chaveItem(i.medId, i.lote, i.validade)] = i; });
  const linhas = Object.keys(mapa).map(function (k) {
    const o = mapa[k]; const d = decl[k];
    let est, fonte;
    if (d && conf) { est = Math.max(0, Number(d.qtd) || 0) + o.envios.filter(function (x) { return x.em > conf.criadoEm; }).reduce(function (t, x) { return t + x.qtd; }, 0); fonte = 'declarado'; }
    else { est = o.enviado; fonte = 'estimado'; }
    return { key: k, medId: o.medId, nome: o.nome, lote: o.lote, validade: o.validade, enviado: o.enviado, ultimoEnvio: o.ultimoEnvio, estimado: est, fonte: fonte, declaradoEm: d && conf ? conf.criadoEm : '' };
  });
  // itens que a UBS declarou e que não têm envio registrado (sobra de antes do sistema, por exemplo)
  if (conf && Array.isArray(conf.itens)) conf.itens.forEach(function (i) {
    const k = chaveItem(i.medId, i.lote, i.validade);
    if (!mapa[k] && (Number(i.qtd) || 0) > 0) linhas.push({ key: k, medId: i.medId || '', nome: i.nome, lote: String(i.lote || '').trim(), validade: validadeNorm(i.validade), enviado: 0, ultimoEnvio: '', estimado: Number(i.qtd) || 0, fonte: 'declarado', declaradoEm: conf.criadoEm, semEnvio: true });
  });
  return linhas;
}

async function carregarConfConf(db, tenantId) {
  const sn = await db.collection('config').doc('ubsconf__' + tenantId).get();
  if (!sn.exists || sn.data().ativo !== true) throw new ErroUbs('conf_inativa', 'A conferência das UBS não está ativada. Procure a farmácia.', 403);
  return sn.data();
}
async function listaUbsConf(db, tenantId) {
  const sn = await db.collection('config').doc('destinos__' + tenantId).get();
  const arr = sn.exists && Array.isArray(sn.data().ubs) ? sn.data().ubs : null;
  const base = arr ? arr.filter(function (u) { return u && u.nome; }).map(function (u) { return { id: String(u.id || u.nome), nome: String(u.nome), ativo: u.ativo !== false }; })
    : UBS_PADRAO_CONF.map(function (n, i) { return { id: 'u' + i, nome: n, ativo: true }; });
  return base.filter(function (u) { return u.ativo; });
}
async function checarCodigo(db, cfg, b, ctx) {
  const cod = String(cfg.codigo || '').trim();
  if (!cod) return true;
  const tentado = String(b.codigo == null ? '' : b.codigo).trim();
  if (!tentado) return false;
  if (!(await limitar(db, 'codigo|' + ctx.ip, LIM_CONF.falhaCodigo, ctx.agora.getTime(), true))) throw new ErroUbs('muitas_tentativas', 'Muitas tentativas de código. Aguarde alguns minutos.', 429);
  const ok = crypto.timingSafeEqual(crypto.createHash('sha256').update(cod).digest(), crypto.createHash('sha256').update(tentado).digest());
  if (!ok) { await limitar(db, 'codigo|' + ctx.ip, LIM_CONF.falhaCodigo, ctx.agora.getTime()); throw new ErroUbs('codigo_invalido', 'Código incorreto.', 403); }
  return true;
}
async function ubsEscolhida(db, tenantId, ubsId) {
  const lista = await listaUbsConf(db, tenantId);
  const alvo = lista.filter(function (u) { return u.id === String(ubsId) || u.nome === String(ubsId); })[0];
  if (!alvo) throw new ErroUbs('ubs_invalida', 'UBS não encontrada.', 404);
  return alvo;
}
async function itensDaUbs(db, tenantId, ubsNome) {
  const sn = await db.collection('entries').where('tenant_id', '==', tenantId).where('destino', '==', 'ubs').where('ubsNome', '==', ubsNome).get();
  const envios = [];
  sn.forEach(function (d) { const e = d.data(); if (e.tipo !== 'saida' || e.ficticioDiv || e.descarte || !e.medicamentoId) return; envios.push({ medId: e.medicamentoId, nome: e.medicamentoNome || '', lote: e.lote || '', validade: e.validade || '', qtd: Number(e.quantidade) || 0, em: e.criadoEm || '' }); });
  const cs = await db.collection('ubs_conferencias').where('tenant_id', '==', tenantId).where('ubsNome', '==', ubsNome).get();
  let conf = null; cs.forEach(function (d) { const c = d.data(); if (!conf || String(c.criadoEm) > String(conf.criadoEm)) conf = c; });
  return { linhas: estimarUbs(envios, conf), conf: conf };
}

async function acaoConfInfo(db, b, ctx) {
  const t = await carregarTenant(db, b.tenant);
  const cfg = await carregarConfConf(db, t.id);
  const exige = !!String(cfg.codigo || '').trim();
  const liberado = await checarCodigo(db, cfg, b, ctx);
  if (!liberado) return { municipio: t.nome, exigeCodigo: true, liberado: false, ubs: [] };
  const lista = await listaUbsConf(db, t.id);
  return { municipio: t.nome, exigeCodigo: exige, liberado: true, ubs: lista.map(function (u) { return { id: u.id, nome: u.nome }; }).sort(function (x, y) { return x.nome.localeCompare(y.nome); }) };
}
async function acaoConfItens(db, b, ctx) {
  if (!(await limitar(db, 'confitens|' + ctx.ip, LIM.ipConsulta, ctx.agora.getTime()))) throw new ErroUbs('muitas_tentativas', 'Muitas consultas. Aguarde alguns minutos.', 429);
  const t = await carregarTenant(db, b.tenant);
  const cfg = await carregarConfConf(db, t.id);
  if (!(await checarCodigo(db, cfg, b, ctx))) throw new ErroUbs('codigo_invalido', 'Informe o código de acesso.', 403);
  const ubs = await ubsEscolhida(db, t.id, b.ubsId);
  const r = await itensDaUbs(db, t.id, ubs.nome);
  const itens = r.linhas.filter(function (l) { return !l.semEnvio && l.estimado > 0; })
    .sort(function (x, y) { const a = validadeOrd(x.validade), c = validadeOrd(y.validade); return a - c || x.nome.localeCompare(y.nome); })
    .slice(0, LIM_CONF.maxItens)
    .map(function (l) { return { key: l.key, nome: l.nome, lote: l.lote, validade: l.validade, enviado: l.enviado, ultimoEnvio: l.ultimoEnvio, estimado: l.estimado, fonte: l.fonte }; });
  return { ubs: { id: ubs.id, nome: ubs.nome }, itens: itens, ultimaConferencia: r.conf ? r.conf.criadoEm : '' };
}
function validadeOrd(v) { const m = String(v || '').split('/'); return m.length === 2 ? parseInt(m[1], 10) * 12 + parseInt(m[0], 10) : 9e9; }
async function acaoConfEnviar(db, b, ctx) {
  if (!(await limitar(db, 'envio|' + ctx.ip, LIM.ipEnvio, ctx.agora.getTime()))) throw new ErroUbs('muitas_tentativas', 'Muitas tentativas. Aguarde um pouco e tente de novo.', 429);
  const t = await carregarTenant(db, b.tenant);
  const cfg = await carregarConfConf(db, t.id);
  if (!(await checarCodigo(db, cfg, b, ctx))) throw new ErroUbs('codigo_invalido', 'Informe o código de acesso.', 403);
  const ubs = await ubsEscolhida(db, t.id, b.ubsId);
  const enfermeira = txt(b.nome, 80);
  if (enfermeira.length < 3) throw new ErroUbs('nome_invalido', 'Informe o seu nome.');
  const r = await itensDaUbs(db, t.id, ubs.nome);
  const conhecidos = {}; r.linhas.forEach(function (l) { conhecidos[l.key] = l; });
  const itens = []; const vistos = {};
  (Array.isArray(b.itens) ? b.itens : []).slice(0, LIM_CONF.maxItens).forEach(function (i) {
    const l = conhecidos[String(i && i.key)];
    if (!l) throw new ErroUbs('item_invalido', 'Um dos itens não pertence a esta UBS. Atualize a página e tente de novo.');
    const q = Number(i.qtd);
    if (!Number.isInteger(q) || q < 0 || q > LIM.maxQtd) throw new ErroUbs('qtd_invalida', 'Quantidade inválida em "' + l.nome + '".');
    if (vistos[l.key]) return; vistos[l.key] = 1;
    itens.push({ medId: l.medId, nome: l.nome, lote: l.lote, validade: l.validade, qtd: q, enviado: l.enviado, origem: 'lista' });
  });
  (Array.isArray(b.extras) ? b.extras : []).slice(0, LIM_CONF.maxExtras).forEach(function (x) {
    const nome = txt(x && x.nome, 80); const q = Number(x && x.qtd);
    if (nome.length < 2) throw new ErroUbs('nome_invalido', 'Informe o nome do medicamento que não está na lista.');
    if (!Number.isInteger(q) || q < 0 || q > LIM.maxQtd) throw new ErroUbs('qtd_invalida', 'Quantidade inválida em "' + nome + '".');
    const val = validadeNorm(x.validade);
    if (txt(x.validade, 12) && !val) throw new ErroUbs('validade_invalida', 'Validade inválida em "' + nome + '". Use MM/AAAA.');
    itens.push({ medId: '', nome: nome, lote: txt(x.lote, 40), validade: val, qtd: q, enviado: 0, origem: 'extra' });
  });
  if (!itens.length) throw new ErroUbs('sem_itens', 'Informe a quantidade de pelo menos um item.');
  const agoraIso = ctx.agora.toISOString();
  const ref = await db.collection('ubs_conferencias').add({ tenant_id: t.id, ubsId: ubs.id, ubsNome: ubs.nome, enfermeira: enfermeira, itens: itens, obs: txtLivre(b.obs, 500), criadoEm: agoraIso });
  return { id: ref.id, itens: itens.length, em: agoraIso };
}

const ACOES = { confInfo: acaoConfInfo, confItens: acaoConfItens, confEnviar: acaoConfEnviar, info: acaoInfo, ubs: acaoUbs, enviar: acaoEnviar, consultar: acaoConsultar, corrigir: acaoCorrigir };

// Entrada única (usada pela função HTTP e pelos testes). Nunca devolve detalhes internos de erro.
async function processar(db, body, ctx) {
  try {
    const b = body && typeof body === 'object' ? body : {};
    const fn = ACOES[String(b.acao || '')];
    if (!fn) throw new ErroUbs('acao_invalida', 'Pedido inválido.');
    const c = { ip: ctx && ctx.ip ? String(ctx.ip) : 'sem-ip', agora: (ctx && ctx.agora) || new Date() };
    return { status: 200, json: { ok: true, ...(await fn(db, b, c)) } };
  } catch (e) {
    if (e instanceof ErroUbs) return { status: e.http, json: { ok: false, codigo: e.codigo, erro: e.message } };
    console.error('ubsApi erro', e && e.message);
    return { status: 500, json: { ok: false, codigo: 'erro_interno', erro: 'Erro inesperado. Tente de novo em instantes.' } };
  }
}

module.exports = { processar, hojeRecife, normProtocolo, LIM, estimarUbs, validadeNorm, chaveItem };
