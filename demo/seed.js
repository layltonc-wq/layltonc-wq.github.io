/* Dados FICTÍCIOS da demonstração (Itaquitinga). Nada aqui vem de banco real: nomes de pessoas, UBS, lotes e
 * quantidades são inventados para apresentar o sistema. As datas são relativas a "hoje", então a demonstração
 * sempre parece atual (lotes vencendo, pedidos desta semana, etc.). Gerador determinístico: mesma semente, mesmos dados.
 */
(function () {
  'use strict';
  var TENANT = 'itaquitinga-pe';

  function rng(seed) { // mulberry32
    var a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function iso(diasAtras, hora) { var d = new Date(); d.setDate(d.getDate() - diasAtras); d.setHours(hora == null ? 9 : hora, Math.floor((hora || 9) * 7) % 60, 0, 0); return d.toISOString(); }
  function ymd(diasAtras) { var d = new Date(); d.setDate(d.getDate() - diasAtras); return d.toISOString().slice(0, 10); }
  function mesAno(diasAFrente) { var d = new Date(); d.setDate(d.getDate() + diasAFrente); return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); }
  function valMes(offsetMeses) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offsetMeses); return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); }
  function dataLocal(diasAFrente) { var d = new Date(); d.setDate(d.getDate() + diasAFrente); return d.toLocaleDateString('en-CA'); }

  // [nome, categoria, mínimo, saída média por semana (CAF), estoque inicial]
  var MEDS = [
    ['Dipirona 500mg comprimido', 'medicamento', 600, 260, 3200], ['Dipirona 500mg/ml gotas 10ml', 'medicamento', 120, 40, 520],
    ['Paracetamol 750mg comprimido', 'medicamento', 600, 300, 3600], ['Paracetamol 200mg/ml gotas 15ml', 'medicamento', 100, 35, 420],
    ['Ibuprofeno 600mg comprimido', 'medicamento', 300, 110, 1500], ['Diclofenaco sódico 50mg comprimido', 'medicamento', 300, 90, 1200],
    ['Amoxicilina 500mg cápsula', 'medicamento', 400, 160, 2100], ['Amoxicilina 250mg/5ml suspensão', 'medicamento', 80, 25, 260],
    ['Azitromicina 500mg comprimido', 'medicamento', 200, 60, 700], ['Cefalexina 500mg cápsula', 'medicamento', 300, 90, 1100],
    ['Losartana potássica 50mg comprimido', 'medicamento', 1500, 520, 7800], ['Captopril 25mg comprimido', 'medicamento', 1000, 330, 5200],
    ['Enalapril 10mg comprimido', 'medicamento', 1000, 300, 4800], ['Hidroclorotiazida 25mg comprimido', 'medicamento', 1200, 380, 5600],
    ['Atenolol 50mg comprimido', 'medicamento', 600, 190, 2800], ['Anlodipino 5mg comprimido', 'medicamento', 800, 260, 3900],
    ['Metformina 850mg comprimido', 'medicamento', 1500, 540, 8000], ['Glibenclamida 5mg comprimido', 'medicamento', 600, 200, 3000],
    ['Sinvastatina 20mg comprimido', 'medicamento', 800, 270, 4000], ['Omeprazol 20mg cápsula', 'medicamento', 1000, 340, 5200],
    ['Prednisona 20mg comprimido', 'medicamento', 200, 70, 900], ['Loratadina 10mg comprimido', 'medicamento', 300, 100, 1300],
    ['Salbutamol 100mcg aerossol', 'medicamento', 60, 18, 190], ['Fluconazol 150mg cápsula', 'medicamento', 100, 30, 380],
    ['Metronidazol 250mg comprimido', 'medicamento', 300, 90, 1100], ['Albendazol 400mg comprimido', 'medicamento', 150, 45, 600],
    ['Sulfato ferroso 40mg comprimido', 'medicamento', 600, 190, 2600], ['Ácido fólico 5mg comprimido', 'medicamento', 500, 150, 2200],
    ['Furosemida 40mg comprimido', 'medicamento', 400, 120, 1700], ['Cloridrato de metoclopramida 10mg comprimido', 'medicamento', 200, 55, 800],
    ['Ceftriaxona 1g injetável', 'injetavel', 80, 28, 320], ['Dexametasona 4mg/ml ampola', 'injetavel', 100, 30, 380],
    ['Dipirona 500mg/ml ampola', 'injetavel', 150, 55, 700], ['Diclofenaco 75mg/3ml ampola', 'injetavel', 100, 32, 420],
    ['Ondansetrona 4mg/2ml ampola', 'injetavel', 60, 20, 240], ['Insulina NPH 100UI/ml frasco', 'injetavel', 40, 12, 160],
    ['Insulina regular 100UI/ml frasco', 'injetavel', 30, 9, 110],
    ['Gaze estéril 7,5x7,5cm pacote', 'penso', 300, 110, 1400], ['Esparadrapo 10cm x 4,5m', 'penso', 60, 14, 160],
    ['Luva de procedimento M caixa', 'penso', 80, 22, 260], ['Seringa descartável 5ml', 'penso', 400, 120, 1500],
    ['Seringa descartável 10ml', 'penso', 200, 55, 700], ['Agulha 25x7', 'penso', 400, 110, 1500],
    ['Soro fisiológico 0,9% 500ml', 'penso', 120, 40, 520], ['Atadura de crepom 10cm', 'penso', 150, 38, 480],
    ['Álcool 70% 1 litro', 'penso', 80, 24, 300], ['Algodão hidrófilo 500g', 'penso', 40, 9, 110],
    ['Fórmula infantil 1 (0 a 6 meses) 400g', 'leite', 40, 10, 130], ['Fórmula infantil 2 (6 a 12 meses) 400g', 'leite', 40, 9, 120]
  ];
  var UBS = ['UBS Centro', 'UBS Alto do Cruzeiro', 'UBS Sítio Novo', 'UBS Vila Esperança', 'UBS Zona Rural'];
  var PERFIS = {
    gestor: { uid: 'demo-gestora', name: 'Gestora (demonstração)', role: 'gestor', acessoLocal: '', somenteLeitura: false, cor: '#1351B4', rotulo: 'Gestora', desc: 'Vê tudo, escolhe entre CAF e Satélite, aprova contas e analisa pedidos.' },
    farmaceutica: { uid: 'demo-farm', name: 'Farmacêutica (demonstração)', role: 'farmaceutico', acessoLocal: 'caf', somenteLeitura: true, cor: '#7B1FA2', rotulo: 'Farmacêutica', desc: 'Só consulta o estoque do CAF e faz Previsão/Pedido e atas.' },
    caf: { uid: 'demo-caf', name: 'Auxiliar do CAF (demonstração)', role: 'auxiliar', acessoLocal: 'caf', somenteLeitura: false, cor: '#0C7B4A', rotulo: 'Auxiliar do CAF', desc: 'Dá saída, recebe e transfere no estoque do CAF.' },
    satelite: { uid: 'demo-sat', name: 'Auxiliar do Satélite (demonstração)', role: 'auxiliar', acessoLocal: 'satelite', somenteLeitura: false, cor: '#E65100', rotulo: 'Auxiliar do Satélite', desc: 'Vê só o estoque do Satélite e pede reposição à CAF.' }
  };

  function criar(perfilId) {
    var perfil = PERFIS[perfilId] || PERFIS.gestor;
    var R = rng(20261114);
    var S = { tenants: {}, medicamentos: {}, entries: {}, users: {}, ubs: {}, ubs_periodos: {}, ubs_solicitacoes: {}, ubs_envios: {}, reposicoes: {}, atas: {}, config: {}, plantoes: {}, alertas: {}, avisos: {}, logs_acesso: {}, recebimentos: {}, notas_fiscais: {}, ubs_conferencias: {} };
    S.tenants[TENANT] = { nome: 'Itaquitinga', ativo: true };
    var seq = 0;
    function id(p) { seq++; return p + seq.toString(36) + Math.floor(R() * 1e6).toString(36); }
    function lancar(med, tipo, qtd, lote, validade, quando, extra) {
      var e = Object.assign({ medicamentoId: med.id, medicamentoNome: med.nome, tipo: tipo, quantidade: qtd, lote: lote, validade: validade, criadoEm: quando.iso, date: quando.iso.slice(0, 10), autorId: 'demo-caf', autorNome: 'Auxiliar do CAF (demonstração)', autorCargo: 'auxiliar', tenant_id: TENANT }, extra || {});
      S.entries[id('e')] = e;
      var d = S.medicamentos[med.id];
      var delta = tipo === 'entrada' ? qtd : -qtd;
      d.estoqueAtual += delta;
      if (e.local === 'satelite') { d.estoqueLocal = d.estoqueLocal || {}; d.estoqueLocal.satelite = (d.estoqueLocal.satelite || 0) + delta; }
    }
    var meds = MEDS.map(function (m, i) {
      var mid = 'med' + (i + 1);
      S.medicamentos[mid] = { nome: m[0], categoria: m[1], minEstoque: m[2], estoqueAtual: 0, criadoEm: iso(120), tenant_id: TENANT };
      return { id: mid, nome: m[0], cat: m[1], min: m[2], semana: m[3], inicial: m[4], i: i };
    });
    // ----- movimentos do CAF: entrada inicial (2 lotes), consumo semanal ao longo de 10 semanas -----
    var validadesCurtas = { 3: 0, 27: 0, 8: 1, 21: 1, 14: 2, 33: 2, 44: -1 }; // lotes vencendo logo (índice -> meses à frente; -1 = já vencido)
    meds.forEach(function (m) {
      var loteA = 'L' + (1000 + m.i * 7) + 'A', loteB = 'L' + (2000 + m.i * 7) + 'B';
      var dias = validadesCurtas[m.i];
      var valA = dias != null ? valMes(dias) : mesAno(300 + Math.floor(R() * 500));
      var valB = mesAno(520 + Math.floor(R() * 400));
      m.valB = valB;
      var qA = Math.round(m.inicial * 0.45), qB = Math.round(m.inicial * 0.55);
      var consumoTotal = 0;
      lancar(m, 'entrada', qA + Math.round(m.semana * 10 * 0.55), loteA, valA, { iso: iso(75, 8) }, { origemRecebimento: true });
      lancar(m, 'entrada', qB + Math.round(m.semana * 10 * 0.45), loteB, valB, { iso: iso(40, 9) }, { origemRecebimento: true });
      for (var sem = 9; sem >= 0; sem--) {
        var qtdSemana = Math.max(1, Math.round(m.semana * (0.75 + R() * 0.5)));
        var partes = Math.min(3, Math.max(1, Math.round(qtdSemana / 60)));
        for (var p = 0; p < partes; p++) {
          var q = Math.max(1, Math.round(qtdSemana / partes));
          var dia = sem * 7 + Math.floor(R() * 6);
          var loteUsado = dia > 45 ? loteA : (R() < 0.5 ? loteA : loteB);
          var valUsada = loteUsado === loteA ? valA : valB;
          consumoTotal += q;
          lancar(m, 'saida', q, loteUsado, valUsada, { iso: iso(dia, 8 + Math.floor(R() * 9)) }, { destino: R() < 0.93 ? 'sus' : 'emergencia', destinoNome: '' });
        }
      }
    });
    // estoque final de alguns itens (abaixo do mínimo e um zerado), espalhando a diferença em várias saídas antigas
    function ajustar(i, fator) {
      var m = meds[i], d = S.medicamentos[m.id];
      var alvo = Math.round(m.min * fator), dif = d.estoqueAtual - alvo;
      var lote = 'L' + (1000 + m.i * 7) + 'A';
      if (dif > 0) { var partes = 7, resto = dif; for (var k = 0; k < partes; k++) { var q = k === partes - 1 ? resto : Math.floor(dif / partes); resto -= q; if (q > 0) lancar(m, 'saida', q, lote, valMes(dias(m.i)), { iso: iso(2 + k * 4, 10 + (k % 5)) }, { destino: 'sus', destinoNome: '' }); } }
      else if (dif < 0) lancar(m, 'entrada', -dif, lote, valMes(dias(m.i)), { iso: iso(3, 9) }, { origemRecebimento: true });
    }
    function dias(i) { return validadesCurtas[i] != null ? validadesCurtas[i] : 14; }
    ajustar(6, 0.7); ajustar(10, 0.9); ajustar(22, 0.5); ajustar(31, 0.4); ajustar(40, 0.6); ajustar(47, 0.0);
    // ----- Satélite: recebe do CAF por transferência e dispensa -----
    var daSat = [0, 2, 4, 6, 10, 11, 12, 14, 16, 17, 19, 21, 23, 24, 25, 26, 32, 34, 36, 37, 38, 39, 41, 46];
    daSat.forEach(function (i) {
      var m = meds[i], d = S.medicamentos[m.id];
      var q = Math.max(5, Math.min(Math.round(m.semana * 2.2), Math.floor(d.estoqueAtual * 0.12)));
      if (q < 5 || d.estoqueAtual < q) return;
      var lote = 'L' + (2000 + m.i * 7) + 'B', val = m.valB;
      var base = { destino: 'transferencia', destinoNome: 'Transferência', transferencia: true, observacao: 'Transferência CAF → Satélite' };
      lancar(m, 'saida', q, lote, val, { iso: iso(14, 10) }, Object.assign({}, base, { local: 'caf' }));
      lancar(m, 'entrada', q, lote, val, { iso: iso(14, 10) }, Object.assign({}, base, { local: 'satelite' }));
      var gasto = Math.round(q * (0.25 + R() * 0.35));
      for (var k = 0; k < 4; k++) lancar(m, 'saida', Math.max(1, Math.round(gasto / 4)), lote, val, { iso: iso(1 + k * 3, 9 + k) }, { destino: 'emergencia', destinoNome: '', local: 'satelite', autorId: 'demo-sat', autorNome: 'Auxiliar do Satélite (demonstração)' });
    });
    // ----- pessoas (fictícias) -----
    Object.keys(PERFIS).forEach(function (k) { var p = PERFIS[k]; S.users[p.uid] = { name: p.name, role: p.role, status: 'approved', tenant_id: TENANT, color: p.cor, email: p.uid + '@demo.invalid', acessoLocal: p.acessoLocal, somenteLeitura: p.somenteLeitura, sessionTimeout: 12, crf: p.role === 'farmaceutico' ? 'CRF-PE 00000' : '', criadoEm: iso(90) }; });
    S.users['demo-pend1'] = { name: 'Nova funcionária (aguardando aprovação)', role: 'auxiliar', status: 'pending', tenant_id: TENANT, color: '#00838F', email: 'pendente@demo.invalid', criadoEm: iso(1) };
    // ----- UBS, períodos e solicitações (módulo Solicitações das UBS) -----
    var ubsIds = [];
    UBS.forEach(function (n, i) {
      var uid = 'ubs' + (i + 1); ubsIds.push(uid);
      var permitidos = meds.filter(function (m) { return m.cat !== 'leite' && (m.i + i) % 3 !== 2; }).map(function (m) { return m.id; });
      S.ubs[uid] = { nome: n, ativa: true, materiais: permitidos, tenant_id: TENANT };
    });
    S.ubs_periodos.p0 = { nome: 'Semana anterior', tipo: 'semanal', inicio: dataLocal(-13 - 0), fim: dataLocal(-7), tenant_id: TENANT };
    S.ubs_periodos.p0.inicio = dataLocal(-13); S.ubs_periodos.p0.fim = dataLocal(-7);
    S.ubs_periodos.p1 = { nome: 'Semana atual', tipo: 'semanal', inicio: dataLocal(-2), fim: dataLocal(4), tenant_id: TENANT };
    function item(i, med, nome, q, extra) { return Object.assign({ id: 'i' + i, medId: med ? med.id : '', nome: nome || (med && med.nome) || '', qtdSolicitada: q, obs: '', foraDaLista: !med, justificativa: '', qtdAprovada: null, qtdSeparada: 0, obsFarm: '' }, extra || {}); }
    function solic(prot, ubsIdx, status, itens, extra) {
      var criado = (extra && extra.criado) || iso(1, 10);
      S.ubs_solicitacoes['sol-' + prot] = Object.assign({ tenant_id: TENANT, ubsId: ubsIds[ubsIdx], ubsNome: UBS[ubsIdx], periodoId: 'p1', periodoNome: 'Semana atual', periodoInicio: dataLocal(-2), periodoFim: dataLocal(4), protocolo: prot, enfermeira: ['Enfermeira Teresa', 'Enfermeira Júlia', 'Enfermeiro Marcos', 'Enfermeira Aline', 'Enfermeira Rosa'][ubsIdx], itens: itens, obs: '', status: status, obsFarm: '', historico: [{ em: criado, acao: 'enviada', por: 'Enfermeira', obs: '' }], criadoEm: criado, atualizadoEm: criado }, extra || {});
      S.ubs_envios[TENANT + '__' + ubsIds[ubsIdx] + '__p1'] = { tenant_id: TENANT, ubsId: ubsIds[ubsIdx], periodoId: 'p1', protocolo: prot, criadoEm: criado };
    }
    solic('UBS-DEMO-0001', 0, 'enviada', [item(1, meds[0], null, 400), item(2, meds[10], null, 600), item(3, meds[36], null, 80), item(4, null, 'Fita para medir glicemia', 6, { justificativa: 'Pacientes diabéticos da área' })]);
    solic('UBS-DEMO-0002', 1, 'enviada', [item(1, meds[2], null, 500), item(2, meds[16], null, 900), item(3, meds[22], null, 30)]);
    solic('UBS-DEMO-0003', 2, 'aprovada', [item(1, meds[1], null, 60, { qtdAprovada: 60 }), item(2, meds[19], null, 300, { qtdAprovada: 250, obsFarm: 'Ajustado pelo estoque' })], { obsFarm: 'Ajustei o omeprazol conforme o estoque.', historico: [{ em: iso(1, 10), acao: 'enviada', por: 'Enfermeira', obs: '' }, { em: iso(1, 15), acao: 'aprovada', por: 'Gestora (demonstração)', obs: 'Ajustei o omeprazol conforme o estoque.' }] });
    solic('UBS-DEMO-0004', 3, 'devolvida', [item(1, meds[4], null, 5000)], { obsFarm: 'Quantidade muito acima do consumo. Reduza e reenvie.' });
    // ----- pedidos de reposição do Satélite à CAF -----
    function repo(status, itens, extra) { S.reposicoes[id('rep')] = Object.assign({ tenant_id: TENANT, status: status, itens: itens, obs: '', solicitanteId: 'demo-sat', solicitanteNome: 'Auxiliar do Satélite (demonstração)', historico: [{ em: iso(2, 9), acao: 'enviado', por: 'Satélite', obs: '' }], criadoEm: iso(2, 9), atualizadoEm: iso(2, 9), obsCaf: '' }, extra || {}); }
    function ri(i, med, q, t) { return { id: 'r' + i + med.id, medId: med.id, nome: med.nome, qtdSolicitada: q, qtdTransferida: t || 0, obsCaf: '' }; }
    repo('pendente', [ri(1, meds[0], 200), ri(2, meds[16], 400), ri(3, meds[36], 40)]);
    repo('parcial', [ri(4, meds[10], 300, 150), ri(5, meds[12], 200, 200)], { criadoEm: iso(5, 11), atualizadoEm: iso(4, 14) });
    repo('atendida', [ri(6, meds[2], 150, 150)], { criadoEm: iso(9, 9), atualizadoEm: iso(8, 10) });
    // ----- atas de registro de preços (para Previsão / Pedido) -----
    function ata(nome, cat, lista) { var vt = 0; var its = lista.map(function (x, n) { var m = meds[x[0]]; var v = x[2]; vt += v * x[1]; return { num: String(n + 1), descricao: m.nome, marca: x[3] || 'Genérico', qtdTeto: x[1], unidade: 'UN', vUnit: v, pedidoAcumulado: x[4] || 0, medicamentoId: m.id, ordemFornecimento: '', catmat: '' }; }); S.atas[id('ata')] = { nome: nome, categoria: cat, limite: 0, valorTotal: Math.round(vt * 100) / 100, itens: its, criadoEm: iso(80), criadoPor: 'Gestora (demonstração)', tenant_id: TENANT }; }
    ata('Ata 012/2026 — Medicamentos básicos', 'medicamento', [[0, 40000, 0.09, 'Genérico', 12000], [2, 45000, 0.11, 'Genérico', 15000], [10, 90000, 0.07, 'Genérico', 30000], [11, 60000, 0.06, 'Genérico', 18000], [16, 100000, 0.1, 'Genérico', 40000], [19, 60000, 0.12, 'Genérico', 20000], [6, 25000, 0.35, 'Genérico', 6000]]);
    ata('Ata 027/2026 — Material médico-hospitalar', 'penso', [[36, 20000, 0.14, 'Descarpack', 4000], [37, 8000, 0.19, 'Descarpack', 2000], [40, 6000, 1.9, 'Cremer', 1200], [43, 12000, 0.5, 'Missner', 3000]]);
    // ----- avisos e configurações -----
    S.avisos[id('av')] = { texto: 'Bem-vindo à demonstração do FarmaControl! Todos os dados são fictícios.', autorNome: 'Gestora (demonstração)', autorColor: '#1351B4', criadoEm: iso(0, 7), expiraEm: new Date(Date.now() + 864e5 * 365).toISOString(), tenant_id: TENANT };
    var user = { uid: perfil.uid, name: perfil.name, role: perfil.role, color: perfil.cor, email: perfil.uid + '@demo.invalid', status: 'approved', tenant_id: TENANT, homeTenant: TENANT, isSuper: false, sessionTimeout: 12, photoURL: '', crf: '', acessoLocal: perfil.acessoLocal, somenteLeitura: perfil.somenteLeitura };
    return { store: S, user: user, tenant: TENANT };
  }
  window.FCDemoSeed = { criar: criar, PERFIS: PERFIS, TENANT: TENANT, simular: { UBS: UBS } };
})();
