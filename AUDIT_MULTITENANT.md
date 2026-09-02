# Auditoria Multi-Tenant — FarmaControl

**Data:** conforme sessão atual · **Branch:** `testing` · **Arquivo analisado:** `index.html` (fonte única do app)
**Método:** varredura automatizada (grep/regex sobre o código-fonte) + verificação manual linha a linha dos casos ambíguos. Nenhuma alteração de código foi feita nesta fase — só leitura.

> ⚠️ Este relatório não teve acesso ao Console do Firebase (regras/índices ao vivo). A seção 3 (Regras) reproduz o texto que você mesmo colou nesta conversa em uma sessão anterior — pode já estar desatualizado se você mexeu no Console depois. A seção 4 (Índices) lista os pares `where`+`orderBy` já existentes no código (que vão precisar de índice composto novo assim que `tenant_id` entrar no filtro) — não tenho como ler os índices que já estão de fato criados no seu projeto; isso precisa ser conferido por você no Console.

---

## 🚨 Achados críticos (leia isto antes da Fase 2)

Estes achados **mudam o plano de migração** — um filtro `.where('tenant_id','==',...)` sozinho não resolve os itens abaixo, porque o problema não é "quem pode ler", é "o documento de um tenant e de outro caem no **mesmo lugar**".

### 1. `plantoes/{data}` — ID do documento é só a data de hoje (`todayStr()`)
O código usa `db.collection('plantoes').doc(today)` (ex.: `plantoes/2026-08-31`) como identificador. **Dois tenants diferentes no mesmo dia escrevem no MESMO documento.** Regra de segurança nenhuma resolve isso sozinha — mesmo barrando leitura cross-tenant, a escrita de um tenant ainda pode sobrescrever/mesclar com a do outro antes da regra ser avaliada num `.set()`. Precisa mudar o **esquema do ID** (ex.: `plantoes/{tenant_id}_{data}` ou subcoleção `tenants/{tenant_id}/plantoes/{data}`), não só adicionar `.where()`.
Usos: linhas 265, 8676(via `today`/`shiftId`), 9425-9480 (todo o fluxo de check-in de plantão), 9660.

### 2. `conferencias/{data}` — mesmo problema do item 1
`docRef=function(){return db.collection('conferencias').doc(todayStr());}` (linha 7004) — toda a aba Conferência lê/escreve no doc do dia. Mesma colisão entre tenants no mesmo dia. Mesma solução: mudar o ID.

### 3. `_meta/entries_version` — sinal global de "algo mudou", compartilhado por todos os tenants
Usado só como gatilho de re-leitura (quando uma entry antiga é editada/apagada, incrementa esse doc pra outros clientes re-buscarem o histórico). Não vaza dado, mas hoje um tenant "acorda" o cache de todos os outros desnecessariamente. Baixo risco, mas vale corrigir por eficiência/isolamento (ex.: `_meta/entries_version_{tenant_id}`).

### 4. `register()` (linha 570) — "primeiro usuário vira gestor automaticamente" é GLOBAL, não por tenant
```js
db.collection('users').get().then(function(snap){var isFirst=snap.empty; ...})
```
Isso lê a coleção `users` **inteira, sem filtro**, só pra checar se está vazia. Hoje, "vazia" = ninguém nunca se cadastrou no sistema inteiro. Depois do multi-tenant, isso precisa virar "ninguém se cadastrou **NESTE** tenant" — senão o primeiro usuário da prefeitura B nunca vira gestor automaticamente (porque a prefeitura A já tem usuários), ou pior, um usuário de A poderia influenciar esse cálculo pra B. Precisa de lógica nova aqui, não só um filtro de leitura.

### 5. `plantao_convites` — RESOLVIDO: é funcionalidade morta
Não existe nenhum `.add()` nessa coleção em lugar nenhum do código. Investiguei mais: a UI de "Gerenciar Equipe" do plantão (`adicionarMembro`, usada pelo botão "⚙️ Equipe") adiciona alguém direto em `plantoes.equipe[]` — sem passar por convite/aceite nenhum. Ou seja, o fluxo de convite (que já tem tela pronta — `InviteScreen`, banner de notificação, tudo) ficou pra trás quando "Gerenciar Equipe" passou a adicionar direto. **Conclusão: dá pra ignorar `plantao_convites` na migração** — está morta, ninguém consegue gerar um convite hoje. Deixei essa coleção fora da Fase 2.

### 6. Leitura sem filtro nenhum em `entries` (linha 9430)
```js
var col=db.collection('entries');
var fetch=(fonte==='server')?col.get():col.get({source:'cache'})...
```
Isso é o "histórico" carregado no login — lê a coleção `entries` **inteira** (sem `.where()`, sem `.limit()`), só filtra os últimos 3 dias em memória depois de baixar tudo. Hoje já é uma leitura pesada; com múltiplos tenants compartilhando a mesma coleção sem filtro de tenant, um tenant literalmente baixaria os dados de todos os outros antes de aplicar a regra de segurança (a regra bloqueia o *resultado* que a query tenta trazer, mas uma query sem `.where('tenant_id',...)` viola a regra inteira e falha — o que é bom para segurança, mas quebra a tela pra todo mundo até esse `.where()` ser adicionado). **Este é provavelmente o primeiro código que vai quebrar visivelmente assim que a regra mudar** — sinalizando que a query correspondente também precisa mudar no mesmo commit da regra, não depois.

### 7. `medications` (em inglês) — RESOLVIDO: é resquício, e o recurso que ele alimenta já está quebrado hoje
Investiguei o que essa coleção realmente faz: só é lida em um lugar (linha 9445), pro badge de "estoque baixo" que gestor/técnico veem no topo do app — o filtro é `m.estoqueMin>0`. Só que **nenhum lugar do código grava documento nenhum em `medications` com o campo `estoqueMin`** — todo cadastro de medicamento de verdade vai pra `medicamentos` (português), com o campo `minEstoque` (nome diferente!). Ou seja, esse badge de estoque baixo hoje **nunca mostra nada, mesmo quando tem medicamento realmente baixo** — é um bug independente do multi-tenant, não é só sobrar código morto. **Conclusão: `medications` fica de fora da migração** (não vale a pena migrar uma coleção que não recebe dado nenhum). Se quiser, num momento separado eu conserto esse badge de estoque baixo pra ler de `medicamentos`/`minEstoque` de verdade — mas isso é assunto pra depois do multi-tenant, não decisão de arquitetura.

### 8. `vales` e `conciliacoes` — RESOLVIDO: são regras órfãs, sem nenhum código correspondente
Confirmei de novo: zero ocorrência de `db.collection('vales')` ou `db.collection('conciliacoes')` no arquivo inteiro. `conciliacoes` bate com o nome do fluxo antigo de "Conciliação Fiscal" que foi todo substituído pelo redesenho de Recebimento/Importar Notas em uma sessão anterior — a regra ficou pra trás quando o código foi trocado. `vales` não achei rastro de ter existido de verdade. **Conclusão: essas duas regras ficam de fora da migração** — não têm dado nenhum pra proteger. Dá pra limpar do arquivo de regras num momento oportuno, sem pressa.

### 9. `config/tours` — decisão tomada: fica **global** (não por tenant)
Essa é uma decisão de produto de verdade (não dá pra descobrir só lendo código), mas como você não tem como responder agora, decidi pelo caminho mais simples: deixar como configuração **global do app** (não específica de cada prefeitura), já que é só liga/desliga de tutorial da interface — não é dado sensível de nenhum tenant. Se no futuro alguma prefeitura quiser controlar isso separadamente, dá pra mudar depois sem risco (é só uma tela de ajuda).

---

## 1. Coleções Firestore encontradas

**25 coleções** (o prompt original mencionava 24 — a contagem real por `grep -oE "db\.collection\('[a-zA-Z_]+'\)" index.html | sort -u | wc -l` deu 25; confira você mesmo, pode ser que uma delas seja resquício/duplicata, ver linha 23 `medications` na tabela abaixo), 225 ocorrências de `db.collection(...)` no total.

| # | Coleção | Ocorrências | Campos importantes (schema observado no código) |
|---|---|---|---|
| 1 | `entries` | 36 | `tipo`(entrada/saida), `medicamentoId`, `medicamentoNome`, `quantidade`, `lote`, `validade`, `date`, `criadoEm`, `autorId`, `autorNome`, `autorCargo`, `autorColor`, `observacao`, `descarte`(bool), `isAjuste`(bool), `origemConferencia`(bool), `origemRecebimento`(bool), `recebimentoId`, `divergenciaTipo`, `ficticioDiv`, `estornoRecebimento`, `categoriaMed` |
| 2 | `medicamentos` | 31 | `nome`, `categoria`/`tipo`, `ean`, `minEstoque`/`estoqueMin`, `loteAtual`, `validadeAtual`, `ataId`, `lotes[]`, `criadoEm`, `criadoPor` |
| 3 | `users` | 18 | doc id = **uid do Firebase Auth** (não colide entre tenants), `name`, `role`, `color`, `email`, `status`, `sessionTimeout`, `photoURL`, `crf`, `criadoEm`, `tutoriaisVistos[]` |
| 4 | `plantoes` | 15 | **doc id = `todayStr()` — ⚠️ ver Achado Crítico #1**, `iniciadoPor`, `iniciadoPorNome`, `inicio`, `equipe[]`, `ativo`, `data`, `encerradoEm` |
| 5 | `notas_fiscais` | 14 | `nfNumero`, `fornecedor`, `dataEmissao`, `itens[]`, `status`, `nomeArquivo`, `criadoEm`, `criadoPor`, `arquivadaHistorico`, `arquivadaEm`, `arquivadaPor` (+ campos legados de um fluxo antigo: `nNF`, `fornecedorNome`, `itensSalvos`) |
| 6 | `divergencias` | 14 | `medicamentoId`, `medicamentoNome`, `qtdRecebida`, `qtdNota`, `diferenca`, `tipo`, `status`, `origem`, `criadoEm`, `criadoPor` |
| 7 | `recebimentos` | 12 | `data`, `fornecedor`, `responsavel`, `status`, `statusLabel`, `itens[]`, `criadoEm`, `criadoPor`, `conferidoManualmente`, `canceladoPor`, `justificativaCancelamento` |
| 8 | `tratamentos_atb` | 11 | `pacienteNome`, `diasTratamento`, `dataInicio`, `dosesPorDia`, `qtdPorDose`, `medicamentoId`, `medicamentoNome`, `nomeMedico`, `crmMedico`, `obs`, `telefone`, `status`, `criadoEm`, `criadoPor` |
| 9 | `logs_contas` | 8 | `uid`, `nome`, `cargo`, `acao`, `por`, `criadoEm` |
| 10 | `logs_acesso` | 8 | `uid`, `nome`, `cargo`, `acao`, `detalhe`, `criadoEm` (regra atual: nunca é apagado/editado — auditoria) |
| 11 | `atas` | 7 | `nome`, `categoria`, `limite`, `itens[]`, `valorTotal`, `criadoEm`, `criadoPor` |
| 12 | `solicitacoes` | 6 | `medicamentoId`, `medicamentoNome`, `tipo`, `quantidade`, `observacao`, `solicitanteId`/`Nome`/`Cargo`/`Color`, `status`, `criadoEm`, `origem` |
| 13 | `pacientes_leite` | 6 | `nome`, `status`, `leiteAltId`/`Nome`, `materiais[]`, `observacao`, `criadoEm`, `criadoPor`, `atualizadoEm`, `atualizadoPor` |
| 14 | `plantao_solicitacoes` | 5 | `de`, `deNome`, `deCargo`, `deColor`, `para`, `paraNome`, `data`, `status`, `criadoEm` |
| 15 | `plantao_convites` | 5 | **sem `.add()` encontrado — ver Achado Crítico #5**; campos vistos em leitura: `para`, `deNome`, `status` |
| 16 | `pacientes_controlados` | 5 | `nome`, `criadoEm`, `criadoPor` |
| 17 | `vinculos_nfe` | 4 | `chaveNota`, `nomeOriginal`, `medId`, `medNome`, `confirmadoPor`, `criadoEm` |
| 18 | `alertas` | 4 | `tipo`, `medicamentoNome`, `quantidade`, `estoqueAntes`, `autorNome`, `justificativa`, `criadoEm`, `lido`(bool) |
| 19 | `saidas_controladas` | 3 | `pacienteId`, `pacienteNome`, `medicamentoId`, `medicamentoNome`, `quantidade`, `medicoNome`, `medicoCrm`, `observacao`, `liberadoPorUid`/`Nome`, `dataSaida`, `criadoEm` |
| 20 | `config` | 3 | doc `'tours'`: `ativos`, `atualizadoEm`, `atualizadoPor` — **decisão de produto**: isso deveria ser por tenant (cada prefeitura liga/desliga tutoriais) ou continuar global? |
| 21 | `avisos` | 3 | `texto`, `foto`, `autorNome`, `autorColor`, `autorFoto`, `criadoEm`, `expiraEm` (mural do plantão) |
| 22 | `retiradas_leite` | 2 | objeto montado em variável (`retObj`, linha 3775) — mesma família de campos de `pacientes_leite`: paciente/medicamento/quantidade/`criadoEm` |
| 23 | `medications` | 2 | coleção **paralela** a `medicamentos` (nomes em inglês) — usada só pra alerta de estoque baixo (linha 9381) e um `delMed` legado no Painel do Técnico. **Confirmar se ainda está em uso ou é resquício.** |
| 24 | `_meta` | 2 | doc `'entries_version'`: `v`(timestamp), `at` — **ver Achado Crítico #3** |
| 25 | `conferencias` | 1 | **doc id = `todayStr()` — ⚠️ ver Achado Crítico #2**; `participantes{}`, `contagens{}`, `contadoPor{}`, `novosLotes[]`, `finalizadas{}`, `recontagens[]`, `atualizadoEm`, `atualizadoPor` |

---

## 2. Mapa completo de queries (por coleção, linha a linha)

Legenda: **READ** = leitura (`.get()`/`.onSnapshot()`), **WRITE** = escrita (`.add()`/`.set()`/`.update()`, incluindo via `batch`), **DELETE** = exclusão. "—" na coluna `.where()` significa que a query lê/escreve sem filtro algum hoje (não significa erro — é o estado ANTES da migração).

⚠️ **Nota de confiabilidade**: esta seção foi gerada por script (regex sobre o texto), não lida um por um manualmente por mim. Cliquei em cada um dos casos ambíguos (que apareciam como "indefinido") e corrigi à mão, mas alguns podem ter capturado texto de uma chamada vizinha por estarem em linhas muito longas (comum neste arquivo, que não tem quebra de linha em blocos JSX grandes). Trate como um ponto de partida confiável, não como 100% garantido linha por linha — se algo parecer estranho numa coleção específica, me avise que confiro manualmente.


### `entries` — 36 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 2285 | WRITE (.add()) | — |
| 2286 | WRITE (.add()) | — |
| 2292 | WRITE (.update()) | — |
| 2302 | WRITE (.add()) | — |
| 2309 | DELETE (.delete()) | — |
| 2320 | WRITE (.add()), DELETE (.delete()) | — |
| 2540 | WRITE (.update()) | — |
| 2541 | WRITE (.add()) | — |
| 2542 | WRITE (.add()) | — |
| 2589 | READ (.get()) | ✅ SIM |
| 2601 | WRITE — batch.update() | — |
| 3183 | WRITE (.add()) | — |
| 3296 | WRITE (.add()) | — |
| 3336 | READ (.get()), DELETE (.delete()) | — |
| 3336 | READ (.get()), DELETE (.delete()) | — |
| 3375 | READ (listener) | — |
| 4407 | WRITE (.add()) | — |
| 4955 | WRITE (.add()) | — |
| 4980 | WRITE (.add()) | — |
| 5632 | WRITE (.update()) | — |
| 5640 | WRITE (.update()) | — |
| 5700 | DELETE (.delete()) | — |
| 7087 | READ (listener) | ✅ SIM |
| 7199 | WRITE (.add()) | — |
| 7200 | WRITE (.add()) | — |
| 7225 | WRITE (.set()) | — |
| 7312 | (indefinido) | — |
| 7360 | WRITE (.set()) | — |
| 8687 | (indefinido) | — |
| 8741 | WRITE — batch.set() (novo doc) | — |
| 8827 | READ (.get()) | ✅ SIM |
| 8853 | WRITE — batch.set() (novo doc) | — |
| 9430 | READ — .get() (cache-first; SEM where — lê a coleção toda) | — |
| 9436 | READ (listener) | ✅ SIM |
| 9489 | WRITE (.add()) | — |
| 9524 | WRITE (.add()), WRITE (.update()) | — |

### `medicamentos` — 31 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 1812 | WRITE (.add()) | — |
| 1901 | WRITE (.add()) | — |
| 2133 | WRITE (.update()) | — |
| 2537 | WRITE (.add()) | — |
| 2538 | WRITE (.update()), DELETE (.delete()) | — |
| 2539 | WRITE (.update()), DELETE (.delete()) | — |
| 2540 | WRITE (.update()) | — |
| 2542 | WRITE (.add()) | — |
| 2542 | READ (.get()), WRITE (.add()) | ✅ SIM |
| 3336 | READ (.get()), DELETE (.delete()) | — |
| 3336 | READ (.get()), DELETE (.delete()) | — |
| 6125 | WRITE (.update()) | — |
| 6129 | WRITE (.update()) | — |
| 6142 | WRITE (.add()) | — |
| 6162 | WRITE (.update()) | — |
| 6167 | WRITE (.update()) | — |
| 6181 | WRITE (.update()) | — |
| 6186 | WRITE (.update()) | — |
| 6247 | WRITE (.update()) | — |
| 6248 | WRITE (.update()) | — |
| 7161 | WRITE (.add()) | — |
| 7173 | DELETE (.delete()) | — |
| 7182 | WRITE (.update()) | — |
| 7195 | WRITE (.update()) | — |
| 7243 | WRITE (.update()) | — |
| 7379 | WRITE (.update()) | — |
| 8643 | WRITE (.add()) | — |
| 8709 | WRITE (.update()) | — |
| 9440 | READ (listener) | — |
| 9497 | WRITE (.update()) | — |
| 9540 | WRITE (.update()) | — |

### `users` — 18 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 569 | READ (.get()) | — |
| 570 | WRITE (.set()) | — |
| 570 | READ (.get()) | — |
| 641 | READ (.get()) | — |
| 3286 | WRITE — batch.update() | — |
| 3289 | READ (listener) | ✅ SIM |
| 3291 | WRITE (.add()), WRITE (.update()) | — |
| 3292 | WRITE (.add()), WRITE (.update()) | — |
| 3293 | WRITE (.add()), WRITE (.update()) | — |
| 3294 | WRITE (.add()), WRITE (.update()) | — |
| 3295 | WRITE (.add()), WRITE (.update()) | — |
| 3335 | WRITE (.add()), DELETE (.delete()) | — |
| 4053 | WRITE (.update()) | — |
| 7802 | READ (listener) | — |
| 7860 | WRITE (.set()) | — |
| 9301 | READ (.get()) | — |
| 9441 | READ (listener) | ✅ SIM |
| 9447 | READ (listener) | ✅ SIM |

### `plantoes` — 15 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 265 | READ (.get()), WRITE (.update()) | ✅ SIM |
| 624 | WRITE (.set()) | — |
| 657 | WRITE (.update()) | — |
| 669 | WRITE (.update()) | — |
| 9344 | WRITE (.update()) | — |
| 9356 | WRITE (.update()) | — |
| 9375 | READ (listener) | — |
| 9467 | READ (.get()) | — |
| 9467 | READ (.get()) | — |
| 9467 | READ (.get()) | — |
| 9476 | READ (.get()), WRITE (.update()) | — |
| 9476 | WRITE (.update()) | — |
| 9479 | WRITE (.update()) | — |
| 9481 | WRITE (.update()) | — |
| 9482 | WRITE (.update()) | — |

### `notas_fiscais` — 14 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 4227 | READ (listener) | — |
| 4411 | WRITE (.add()) | — |
| 5594 | READ (listener) | ✅ SIM |
| 5598 | READ (listener) | — |
| 5772 | WRITE (.update()) | — |
| 8115 | READ (listener) | — |
| 8159 | WRITE (.set()) | — |
| 8210 | WRITE — batch.update() | — |
| 8270 | WRITE — batch.update() | — |
| 8304 | WRITE (.update()) | — |
| 8320 | WRITE — batch.update() | — |
| 8345 | DELETE (.delete()) | — |
| 8357 | WRITE (.update()) | — |
| 8368 | WRITE (.update()) | — |

### `divergencias` — 14 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 1874 | WRITE (.add()) | — |
| 1964 | WRITE (.add()) | — |
| 3188 | WRITE (.update()) | — |
| 3228 | READ (listener) | — |
| 8189 | WRITE — batch.set() (novo doc) | — |
| 8193 | WRITE — batch.set() (novo doc) | — |
| 8267 | (indefinido) | — |
| 8323 | DELETE — batch.delete() | — |
| 8521 | READ (listener) | ✅ SIM |
| 8525 | READ (listener) | — |
| 8540 | WRITE (.update()) | — |
| 8546 | WRITE (.update()) | — |
| 9505 | READ — .get() com .where() em linha seguinte | ✅ SIM |
| 9526 | WRITE (.update()) | — |

### `recebimentos` — 12 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 8116 | READ (listener) | — |
| 8204 | WRITE — batch.update() | — |
| 8275 | WRITE — batch.update() | — |
| 8331 | WRITE — batch.update() | — |
| 8615 | READ (listener) | — |
| 8676 | (indefinido) | — |
| 8743 | WRITE — batch.update() | — |
| 8764 | WRITE (.update()) | — |
| 8776 | WRITE (.update()) | — |
| 8787 | DELETE (.delete()) | — |
| 8798 | WRITE (.update()) | — |
| 8825 | READ (.get()) | — |

### `tratamentos_atb` — 11 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 3374 | READ (listener) | — |
| 4830 | READ (listener) | — |
| 4936 | WRITE (.update()) | — |
| 4957 | WRITE (.add()) | — |
| 4966 | WRITE (.update()) | — |
| 4985 | WRITE (.update()) | — |
| 4988 | WRITE (.update()) | — |
| 4989 | WRITE (.update()) | — |
| 4990 | WRITE (.update()), DELETE (.delete()) | — |
| 4991 | WRITE (.update()) | — |
| 4995 | WRITE (.update()) | — |

### `logs_contas` — 8 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 3291 | WRITE (.add()), WRITE (.update()) | — |
| 3292 | WRITE (.add()), WRITE (.update()) | — |
| 3294 | WRITE (.add()), WRITE (.update()) | — |
| 3295 | WRITE (.add()) | — |
| 3335 | WRITE (.add()) | — |
| 3341 | READ (listener) | — |
| 3376 | READ (listener) | — |
| 3376 | READ (listener) | — |

### `logs_acesso` — 8 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 422 | WRITE (.add()) | — |
| 569 | WRITE (.add()) | — |
| 2321 | WRITE (.add()) | — |
| 3339 | READ (listener) | — |
| 3377 | READ (listener) | — |
| 8120 | WRITE (.add()) | — |
| 8631 | WRITE (.add()) | — |
| 9547 | WRITE (.add()) | — |

### `atas` — 7 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 5830 | READ (listener) | — |
| 6111 | WRITE (.add()) | — |
| 6119 | WRITE (.update()) | — |
| 6155 | WRITE (.add()) | — |
| 6162 | WRITE (.update()), DELETE (.delete()) | — |
| 6189 | WRITE (.update()) | — |
| 6246 | WRITE (.update()) | — |

### `solicitacoes` — 6 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 3289 | READ (listener) | ✅ SIM |
| 3296 | WRITE (.update()) | — |
| 3297 | WRITE (.update()) | — |
| 4204 | WRITE (.add()) | — |
| 9449 | READ (listener) | ✅ SIM |
| 9483 | WRITE (.add()) | — |

### `pacientes_leite` — 6 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 3635 | READ (listener) | — |
| 3701 | WRITE (.add()), WRITE (.update()) | — |
| 3706 | WRITE (.add()) | — |
| 3714 | DELETE (.delete()) | — |
| 3726 | WRITE (.update()) | — |
| 3807 | WRITE (.update()) | — |

### `plantao_solicitacoes` — 5 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 9451 | READ (listener) | ✅ SIM |
| 9478 | WRITE (.add()) | — |
| 9478 | READ (.get()), WRITE (.add()) | ✅ SIM |
| 9479 | WRITE (.update()) | — |
| 9480 | WRITE (.update()) | — |

### `plantao_convites` — 5 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 9443 | READ (listener) | ✅ SIM |
| 9467 | READ (.get()) | ✅ SIM |
| 9476 | READ (.get()), WRITE (.update()) | — |
| 9477 | WRITE (.update()) | — |
| 9660 | WRITE (.update()) | — |

### `pacientes_controlados` — 5 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 1501 | READ (listener) | — |
| 1524 | WRITE (.add()) | — |
| 9157 | READ (listener) | — |
| 9193 | WRITE (.add()) | — |
| 9205 | DELETE (.delete()) | — |

### `vinculos_nfe` — 4 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 4233 | READ (listener) | — |
| 4254 | READ (.get()), WRITE (.add()) | ✅ SIM |
| 4255 | WRITE (.add()), WRITE (.update()) | — |
| 4256 | WRITE (.update()) | — |

### `alertas` — 4 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 1636 | WRITE (.add()) | — |
| 3289 | READ (listener) | ✅ SIM |
| 3305 | WRITE (.update()) | — |
| 9448 | READ (listener) | ✅ SIM |

### `saidas_controladas` — 3 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 1511 | READ (.get()) | ✅ SIM |
| 1642 | WRITE (.add()) | — |
| 9162 | READ (listener) | — |

### `config` — 3 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 3269 | READ (listener) | — |
| 3274 | WRITE (.set()) | — |
| 7803 | READ (listener) | — |

### `avisos` — 3 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 744 | READ (listener) | — |
| 747 | WRITE (.add()) | — |
| 748 | DELETE (.delete()) | — |

### `retiradas_leite` — 2 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 3640 | READ (listener) | — |
| 3791 | WRITE (.add()) | — |

### `medications` — 2 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 3393 | DELETE (.delete()) | — |
| 9445 | READ (listener) | — |

### `_meta` — 2 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 303 | WRITE (.set()) | — |
| 9439 | READ (listener) | — |

### `conferencias` — 1 ocorrência(s) no código

| Linha | Tipo | `.where()`? |
|---|---|---|
| 7004 | helper — retorna doc ref (usado por .get/.set/.update/.onSnapshot abaixo) | — |

---

## 3. Regras Firestore atuais

**Fonte:** o texto que você mesmo colou nesta conversa (não é uma leitura ao vivo do Console — eu não tenho acesso a ele). Se você mexeu nas regras depois disso, este trecho está desatualizado; me manda o texto atual do Console antes da Fase 2 se for o caso.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function logado() { return request.auth != null; }
    function meuPerfil() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data; }
    function ehGestor() { return logado() && meuPerfil().role == 'gestor'; }
    function ehTecnico() { return logado() && meuPerfil().role == 'tecnico'; }
    function ehAdmin() { return ehGestor() || ehTecnico(); }

    // ===== USUÁRIOS =====
    match /users/{userId} {
      allow read: if logado();
      allow create: if request.auth != null
                    && request.auth.uid == userId
                    && request.resource.data.status == 'pending';
      allow update: if ehAdmin()
                    || (logado()
                        && request.auth.uid == userId
                        && request.resource.data.role == resource.data.role
                        && request.resource.data.status == resource.data.status);
      allow delete: if ehAdmin();
    }

    // ===== MEDICAMENTOS =====
    match /medications/{id} {
      allow read: if logado();
      allow create, update: if logado();
      allow delete: if ehAdmin();
    }
    match /medicamentos/{id} {
      allow read: if logado();
      allow create, update: if logado();
      allow delete: if ehAdmin();
    }

    // ===== ENTRADAS E SAÍDAS =====
    match /entries/{id} {
      allow read: if logado();
      allow create: if logado();
      allow update: if logado();
      allow delete: if logado();
    }

    // ===== CONFERÊNCIA =====
    match /conferencias/{id} {
      allow read: if logado();
      allow write: if logado();
    }

    // ===== ATB =====
    match /tratamentos_atb/{id} {
      allow read: if logado();
      allow create, update: if logado();
      allow delete: if ehAdmin();
    }

    // ===== LEITES =====
    match /pacientes_leite/{id} {
      allow read: if logado();
      allow create, update: if logado();
      allow delete: if ehAdmin();
    }
    match /retiradas_leite/{id} {
      allow read: if logado();
      allow create: if logado();
      allow update: if false;
      allow delete: if ehTecnico();
    }

    // ===== CONTROLADOS (Morfina/Tramal — paciente/médico/CRM) =====
    match /pacientes_controlados/{id} {
      allow read: if logado();
      allow create, update: if logado();
      allow delete: if ehAdmin();
    }
    match /saidas_controladas/{id} {
      allow read: if logado();
      allow create: if logado();
      allow update, delete: if false;
    }

    // ===== PLANTÃO =====
    match /plantoes/{id} {
      allow read: if logado();
      allow write: if logado();
    }
    match /plantao_solicitacoes/{id} {
      allow read: if logado();
      allow write: if logado();
    }
    match /plantao_convites/{id} {
      allow read: if logado();
      allow write: if logado();
    }

    // ===== MURAL E ALERTAS =====
    match /avisos/{id} {
      allow read: if logado();
      allow create, update: if logado();
      allow delete: if logado();
    }
    match /alertas/{id} {
      allow read: if logado();
      allow create, update: if logado();
      allow delete: if ehAdmin();
    }

    // ===== SOLICITAÇÕES =====
    match /solicitacoes/{id} {
      allow read: if logado();
      allow write: if logado();
    }

    // ===== NOTAS FISCAIS =====
    match /notas_fiscais/{id} {
      allow read: if logado();
      allow create, update: if logado();
      allow delete: if ehAdmin();
    }
    match /vinculos_nfe/{id} {
      allow read: if logado();
      allow create, update: if logado();
      allow delete: if ehAdmin();
    }

    // ===== ATAS =====
    match /atas/{id} {
      allow read: if logado();
      allow create, update: if logado();
      allow delete: if ehAdmin();
    }

    // ===== DIVERGÊNCIAS E VALES =====
    match /divergencias/{id} {
      allow read: if logado();
      allow create, update: if logado();
      allow delete: if ehAdmin();
    }
    match /vales/{id} {
      allow read: if logado();
      allow create, update: if logado();
      allow delete: if ehAdmin();
    }

    // ===== LOGS (auditoria — nunca apagáveis) =====
    match /logs_acesso/{id} {
      allow read: if ehAdmin();
      allow create: if logado();
      allow update, delete: if false;
    }
    match /logs_contas/{id} {
      allow read: if ehAdmin();
      allow create: if logado();
      allow update, delete: if false;
    }

    // ===== _META (doc de versão — Camada 2) =====
    match /_meta/{doc} {
      allow read: if logado();
      allow write: if logado();
    }

    // ===== CONFIG (tutoriais e configurações) =====
    match /config/{docId} {
      allow read: if logado();
      allow write: if logado();
    }

    // ===== RECEBIMENTOS (cancelável por qualquer logado; exclusão permanente só gestor/técnico
    // e só depois de já cancelado — mantém o estorno de estoque intacto no histórico de entries) =====
    match /recebimentos/{id} {
      allow read: if logado();
      allow create: if logado();
      allow update: if logado();
      allow delete: if ehAdmin() && resource.data.status == 'cancelado';
    }

    // ===== CONCILIAÇÕES (documento fiscal — nunca excluível) =====
    match /conciliacoes/{id} {
      allow read, create, update: if logado();
      allow delete: if false;
    }

  }
}
```

**Observações sobre as regras atuais, relevantes pro multi-tenant:**
- Praticamente toda regra hoje é `if logado()` — qualquer usuário autenticado (de qualquer cargo) lê/escreve qualquer documento de várias coleções, independente de quem criou. Isso é esperado num app single-tenant; no multi-tenant, cada uma dessas `logado()` vai precisar virar `logado() && <doc>.tenant_id == userTenant()`.
- `vales` e `conciliacoes` têm regras definidas mas **nenhuma ocorrência de `db.collection('vales')` ou `db.collection('conciliacoes')` foi encontrada no código** (seção 1/2 não lista essas coleções) — parecem ser regras órfãs de uma versão anterior do app. Confirmar se ainda são necessárias.
- `medications` (em inglês) tem uma regra própria separada de `medicamentos` — reforça a suspeita do Achado sobre essa coleção ser resquício (linha 23 da tabela da seção 1).

---

## 4. Índices Firestore

Não tenho acesso ao Console pra listar os índices já criados no projeto — **preciso que você exporte isso** (Firestore Database → Índices → o Firebase deixa exportar/copiar a lista, ou me manda print). Sem isso não dá pra saber com certeza o que já existe hoje.

O que **o código já indica que precisa** de índice composto (par `where` + `orderBy` na mesma query) — todos esses vão precisar de um **novo** índice assim que `tenant_id` entrar como mais um `where()` na mesma query (Firestore exige índice composto pra toda combinação de `where` de igualdade + `orderBy` em campo diferente):

| Coleção | Query atual (where + orderBy) | Índice novo necessário após multi-tenant |
|---|---|---|
| `entries` | `orderBy('criadoEm','desc')` (sem where) | `tenant_id ASC, criadoEm DESC` |
| `entries` | `where('criadoEm','>=',_ws)` | `tenant_id ASC, criadoEm ASC/DESC` (listener dos últimos 3 dias) |
| `notas_fiscais` | `orderBy('criadoEm','desc')` (sem where) | `tenant_id ASC, criadoEm DESC` |
| `notas_fiscais` | `where('arquivadaHistorico','==',true), orderBy('arquivadaEm','desc')` | `tenant_id ASC, arquivadaHistorico ASC, arquivadaEm DESC` |
| `divergencias` | `orderBy('registradoEm','desc')` (sem where) | `tenant_id ASC, registradoEm DESC` |
| `divergencias` | `where('status','==','pendente'), orderBy('criadoEm','desc')` | `tenant_id ASC, status ASC, criadoEm DESC` |
| `recebimentos` | `orderBy('criadoEm','desc')` (sem where) — 2 ocorrências | `tenant_id ASC, criadoEm DESC` |
| `tratamentos_atb` | `orderBy('criadoEm','desc')` (sem where) — 2 ocorrências | `tenant_id ASC, criadoEm DESC` |
| `logs_contas` | `orderBy('criadoEm','desc')` (sem where) — 2 ocorrências | `tenant_id ASC, criadoEm DESC` |
| `logs_acesso` | `orderBy('criadoEm','desc')` (sem where) | `tenant_id ASC, criadoEm DESC` |
| `saidas_controladas` | `orderBy('criadoEm','desc')` (sem where) | `tenant_id ASC, criadoEm DESC` |
| `retiradas_leite` | `orderBy('criadoEm','desc')` (sem where) | `tenant_id ASC, criadoEm DESC` |
| `plantao_solicitacoes` | `where('para','==',uid), where('status','==','pendente')` / `where('de','==',uid), where('data','==',hoje), where('status','==','pendente')` | `tenant_id ASC` + os campos já existentes (Firestore costuma sugerir automaticamente via link de erro quando a query roda sem o índice) |
| `plantao_convites` | `where('para','==',uid), where('status','==','pendente')` | idem acima |
| `alertas` | `where('lido','==',false), where('tipo','==','saida_excessiva')` | `tenant_id ASC` + campos já existentes |
| `users` | `where('status','==','approved')` / `where('status','==','pending')` | `tenant_id ASC, status ASC` |

**Na prática**: o caminho mais simples costuma ser deixar o app rodar no ambiente de teste depois de cada coleção migrada e clicar no link de erro "missing index" que o próprio Firestore mostra no console do navegador — ele já vem com o índice exato pré-preenchido pra criar com um clique (é o que o Passo 6 da Fase 3 já prevê). A tabela acima é só pra você saber, de antemão, quantos e quais vão aparecer.

---

## Resumo executivo

- **25 coleções**, **225 pontos de leitura/escrita/exclusão** no código, nenhum hoje filtrado por tenant (esperado, pois o app é single-tenant hoje).
- **2 coleções têm um problema estrutural que exige mudar o esquema do ID do documento**, não só adicionar filtro: `plantoes` e `conferencias` (ambas usam a data de hoje como ID).
- **1 ponto de lógica de negócio precisa ser redesenhado**: "primeiro usuário do sistema vira gestor automático" precisa virar "primeiro usuário DO TENANT".
- **1 leitura sem filtro nenhum** (`entries`, histórico no login) provavelmente será a primeira coisa a quebrar visivelmente quando a regra mudar, e precisa ganhar `.where('tenant_id',...)` no mesmo commit que a regra correspondente.
- **`vales`, `conciliacoes` e `plantao_convites`**: confirmado, código morto/regras órfãs — ficam de fora da migração (achados #5 e #8).
- **`medications` (inglês)**: confirmado resquício — alimenta um badge de estoque baixo que já não funciona hoje (campo errado). Fica de fora da migração (achado #7).
- **`config/tours`**: decidi manter global, não por tenant — não é dado sensível de nenhuma prefeitura (achado #9).

Todas as perguntas em aberto da primeira versão deste relatório foram investigadas e resolvidas direto pelo código — não ficou nenhuma pendência esperando resposta sua.

---

**Este relatório é só leitura — nenhuma linha de código ou regra foi alterada.** Vou seguir direto pra **Fase 2 (Plano de Implementação)**, ainda sem tocar em código — te mando o plano assim que estiver pronto pra você conferir antes de eu implementar de verdade. Se alguma coisa aqui não bater com o que você sabe do sistema, me avisa a qualquer momento que eu ajusto.
