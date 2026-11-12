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

const ACOES = { info: acaoInfo, ubs: acaoUbs, enviar: acaoEnviar, consultar: acaoConsultar, corrigir: acaoCorrigir };

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

module.exports = { processar, hojeRecife, normProtocolo, LIM };
