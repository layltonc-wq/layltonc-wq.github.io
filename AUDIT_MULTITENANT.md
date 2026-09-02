# Auditoria Multi-Tenant — FarmaControl

> Gerado na FASE 1 (análise, nenhum código alterado). Branch: `claude/farmacontrol-multitenant-acia61`.
> Fonte: `index.html` (SPA único, 9.825 linhas, React sem build step + Firebase SDK v8, carregados via CDN).

## 0. Metodologia e limitações

- Toda a aplicação (frontend + acesso a dados) vive em um único arquivo `index.html`. Não há backend próprio nem Cloud Functions. O repositório não tinha `firestore.rules`/`firestore.indexes.json` versionado até esta auditoria — as regras foram recebidas do Laylton e agora estão em `firestore.rules` (ver seção 3); os índices ainda não (ver seção 4).
- O mapeamento de coleções e operações foi feito via análise estática (grep/regex) sobre `db.collection('...')` e os métodos encadeados (`.where`, `.get`, `.add`, `.update`, `.delete`, `.set`, `.doc`, `.onSnapshot`, `.orderBy`) nas linhas seguintes. Como o código é denso (muitas instruções por linha, funções inteiras em uma linha só), a coluna "Operações detectadas" reflete o bloco de código ao redor da chamada, não necessariamente uma cadeia única — use os números de linha para conferir o trecho exato.
- **Regras do Firestore**: recebidas do Laylton e versionadas em `firestore.rules` (raiz do repo). Analisadas na íntegra na seção 3.
- **Índices do Firestore**: ainda não recebidas. Preciso do conteúdo de Firestore Console → Índices, ou do arquivo `firestore.indexes.json` se houver um export, para completar a seção 4.
- Há **dois projetos Firebase** configurados no app (linhas 332-333):
  - Produção: `app-farma-b21e2`
  - Teste/dev: `farmacontrol-dev-6a3e3`
  - A troca é feita manualmente numa tela de "Setup" (linha 552) que salva a config no `localStorage`. Isso é relevante: qualquer migração de regras/índices/dados precisa ser replicada nos dois projetos, e a instrução do prompt de "trabalhar na branch `testing`" provavelmente corresponde a apontar esse Setup para o projeto `farmacontrol-dev-6a3e3`.

## 1. Coleções Firestore

25 coleções distintas usadas no código (225 pontos de chamada `db.collection(...)` no total), **+ 2 coleções que só existem nas regras do Firestore** (`vales`, `conciliacoes` — sem nenhum uso em `index.html`, ver achado #10) = 27 `match` no `firestore.rules`, todos cruzados 1:1 com o código onde aplicável (nenhuma coleção usada no código ficou sem regra correspondente).

| Coleção | Ocorrências | Operações (contagem agregada) | Campos observados | Observação |
|---|---|---|---|---|
| `entries` | 36 | add:16 update:13 doc:24 delete:8 where:8 get:8 onSnapshot:6 set:5 orderBy:1 | `medicamentoId, medicamentoNome, ean, tipo(entrada/saida), quantidade, lote, validade, observacao, criadoEm, date, autorId, autorNome, autorCargo, autorColor, isAjuste, ficticioDiv, divergenciaTipo` | Coleção mais usada; movimentações de estoque. Ligada a `medicamentos` por `medicamentoId`. |
| `medicamentos` | 31 | add:13 update:20 doc:21 where:7 get:8 delete:7 onSnapshot:3 | `nome, ean, categoria/tipo, minEstoque/estoqueMin, criadoEm, criadoPor, ataId` | Cadastro de medicamentos/itens. |
| `users` | 18 | get:6 add:9 set:4 doc:15 where:4 update:8 onSnapshot:6 delete:1 | `uid(=doc id), name, role(gestor/farmaceutico/auxiliar/tecnico/diarista), color, email, status(pending/approved/rejected/inativo), criadoEm, sessionTimeout, photoURL, crf, tutoriaisVistos[]` | **Achado crítico**: `register()` (linha 570) faz `db.collection('users').get()` para checar `snap.empty` — "primeiro usuário do sistema" vira `gestor` automaticamente. Em multi-tenant isso precisa virar "primeiro usuário **do tenant**", senão só o primeiro tenant criado ganha um gestor automático. |
| `plantoes` | 15 | where:6 get:6 update:10 set:1 doc:14 onSnapshot:1 add:5 | `iniciadoPor, iniciadoPorNome, inicio, equipe[], ativo, data` | **Achado crítico**: documento usa `doc(today)` — ID = data (`YYYY-MM-DD`, linha 624). Em multi-tenant, dois tenants com plantão no mesmo dia colidem no mesmo doc ID. Precisa virar `doc(tenant_id + '_' + today)` ou subcoleção por tenant. |
| `notas_fiscais` | 14 | onSnapshot:4 orderBy:3 add:2 where:1 update:7 doc:9 set:2 delete:2 | `nNF, dataEmissao, fornecedorNome, fornecedorCNPJ, chaveAcesso, vTotal, itensSalvos[], importadoPor, criadoEm, nomeArquivo, tipo` | |
| `divergencias` | 14 | add:2 update:6 doc:8 onSnapshot:3 orderBy:3 set:2 delete:1 where:2 get:1 | (objeto composto dinamicamente — ver linhas 1874, 1964) | |
| `recebimentos` | 12 | add:1 onSnapshot:2 orderBy:2 update:7 doc:9 set:1 delete:1 where:1 get:1 | `itens[], status, statusLabel, criadoEm` (+ payload de nota fiscal) | |
| `tratamentos_atb` | 11 | onSnapshot:2 orderBy:2 update:8 doc:8 add:1 delete:4 | `pacienteNome, diasTratamento, dataInicio, dosesPorDia, qtdPorDose, medicamentoId, medicamentoNome, nomeMedico, crmMedico, obs, telefone, doses[], status, criadoPor, criadoEm` | Dados de pacientes (sensível — reforça necessidade de isolamento). |
| `logs_contas` | 8 | add:5 update:4 doc:7 get:1 delete:3 onSnapshot:4 orderBy:2 | `uid, nome, cargo, acao, por, criadoEm` | Log de auditoria de contas (aprovação/rejeição/exclusão de usuários). |
| `logs_acesso` | 8 | add:6 get:1 set:1 doc:2 onSnapshot:2 delete:1 orderBy:1 | `uid, nome, cargo, acao, detalhe, criadoEm` | Log de auditoria de acesso (login, cadastro de paciente etc). |
| `atas` | 7 | onSnapshot:1 add:2 update:6 doc:6 delete:2 | `nome, categoria, limite, valorTotal, itens[], criadoEm, criadoPor` | |
| `solicitacoes` | 6 | where:2 add:4 update:3 doc:3 onSnapshot:2 | `medicamentoId, medicamentoNome, tipo, quantidade, observacao, solicitanteId, solicitanteNome, solicitanteCargo, solicitanteColor, status, criadoEm, origem` | |
| `pacientes_leite` | 6 | onSnapshot:1 orderBy:1 add:2 update:3 doc:5 delete:2 | (objeto `obj` composto — ver linha 3706) | Dados de pacientes (sensível). |
| `plantao_solicitacoes` | 5 | where:3 onSnapshot:1 get:2 add:4 update:4 doc:4 | `de, deNome, deCargo, deColor, para, paraNome, data, status, criadoEm` | Fluxo "de usuário X para usuário Y" — precisa garantir que ambos pertencem ao mesmo tenant. |
| `plantao_convites` | 5 | where:4 onSnapshot:1 get:3 doc:4 add:2 update:3 | (similar a `plantao_solicitacoes`) | Mesmo cuidado cross-tenant do item acima. |
| `pacientes_controlados` | 5 | onSnapshot:2 add:2 orderBy:1 delete:1 doc:1 | `nome, criadoEm, criadoPor` | Dados de pacientes (sensível). |
| `vinculos_nfe` | 4 | onSnapshot:1 where:1 get:1 add:2 update:3 doc:3 | `chaveNota, nomeOriginal, medId, medNome, confirmadoPor, criadoEm` | |
| `alertas` | 4 | add:2 where:2 update:2 doc:2 onSnapshot:2 | `tipo, medicamentoNome, quantidade, estoqueAntes, autorNome, justificativa, criadoEm, lido` | |
| `saidas_controladas` | 3 | where:1 get:1 add:1 onSnapshot:1 orderBy:1 | `payload` dinâmico (ver linha 1642) | |
| `config` | 3 | set:2 doc:3 onSnapshot:2 | doc fixo `tours`: `{ativos:{...}, atualizadoEm, atualizadoPor}` | Config global de tutoriais. Decidir na FASE 2 se vira per-tenant ou continua global. |
| `avisos` | 3 | add:2 delete:3 doc:3 onSnapshot:1 | `texto, foto, autorNome, autorColor, autorFoto, criadoEm, expiraEm` | Mural de avisos. |
| `retiradas_leite` | 2 | onSnapshot:1 orderBy:1 add:1 | `retObj` dinâmico (ver linha 3791) | |
| `medications` | 2 | delete:1 doc:1 where:1 onSnapshot:1 | — | **Achado**: coleção diferente de `medicamentos` (nomes distintos!). Só 2 usos (linhas 3393, 9445), parece código legado/órfão usado apenas para "alerta de estoque baixo". Tem regra própria idêntica à de `medicamentos` em `firestore.rules` (não é regra órfã — a rule foi criada de propósito). Confirmar com Laylton se é lixo (bug) ou feature separada antes da FASE 2/3 — se for bug, mexer nela seria trabalho desperdiçado. |
| `vales` | 0 | — | — | **Achado**: existe `match /vales/{id}` em `firestore.rules` mas nenhuma chamada a `db.collection('vales')` em `index.html`. Regra órfã (feature descontinuada) ou feature que vive fora deste repo — confirmar (achado #10). |
| `conciliacoes` | 0 | — | — | **Achado**: mesmo caso de `vales` — `match /conciliacoes/{id}` existe nas regras, sem uso no código. Não confundir com a aba de UI chamada "conciliacao" dentro do fluxo de `notas_fiscais`/`recebimentos` (linha 8586), que é só um rótulo de tela, não esta coleção. Confirmar (achado #10). |
| `_meta` | 2 | set:1 doc:2 where:1 onSnapshot:1 | doc fixo `entries_version`: `{v, at}` | **Achado**: contador global usado só para invalidar cache/refetch de `entries` no cliente (linhas 303, 9439). Não vaza dados (o refetch real ainda seria filtrado por tenant), mas em multi-tenant qualquer mudança de qualquer tenant dispara refetch em todos os outros clientes conectados — desperdício de leituras. Bom candidato a virar `_meta/entries_version_{tenant_id}`. |
| `conferencias` | 1 | doc:1 | doc = `todayStr()` | **Achado crítico**: mesmo padrão de `plantoes` — `doc(todayStr())` (linha 7004). Colisão de ID entre tenants no mesmo dia. |

## 2. Queries mapeadas (detalhe por linha)

Tabela completa (todas as 225 ocorrências, com número de linha, operações detectadas no bloco e argumentos de `.where()` quando existentes) está em anexo: `AUDIT_MULTITENANT_QUERIES.md` (gerado junto com este arquivo, mesmo diretório).

Resumo de quantas ocorrências já têm algum `.where()` hoje: **~24 de 225** (grep de `.where(` direto na linha da chamada), nenhuma delas filtrando por tenant/município/prefeitura — confirmando que **não existe nenhum isolamento multi-tenant hoje** (também não há nenhuma ocorrência de `tenant`, `municipio` ou `prefeitura` como campo de dado no código; a única ocorrência de "MUNICIPIO" é uma string de heurística de OCR, sem relação).

## 3. Regras do Firestore atuais

Recebidas do Laylton em 2026-09-02 e versionadas em `firestore.rules` na raiz do repo (fonte única a partir de agora — comparar antes/depois nas próximas fases a partir desse arquivo). Resumo por coleção:

| Coleção (rule) | read | create | update | delete |
|---|---|---|---|---|
| `users` | logado | próprio uid, status=='pending' | admin, OU próprio uid sem mudar role/status | admin |
| `medications` | logado | logado | logado | admin |
| `medicamentos` | logado | logado | logado | admin |
| `entries` | logado | logado | logado | logado |
| `conferencias` | logado | logado (write) | logado (write) | logado (write) |
| `tratamentos_atb` | logado | logado | logado | admin |
| `pacientes_leite` | logado | logado | logado | admin |
| `retiradas_leite` | logado | logado | **false** | técnico |
| `pacientes_controlados` | logado | logado | logado | admin |
| `saidas_controladas` | logado | logado | **false** | **false** |
| `plantoes` | logado | logado (write) | logado (write) | logado (write) |
| `plantao_solicitacoes` | logado | logado (write) | logado (write) | logado (write) |
| `plantao_convites` | logado | logado (write) | logado (write) | logado (write) |
| `avisos` | logado | logado | logado | logado |
| `alertas` | logado | logado | logado | admin |
| `solicitacoes` | logado | logado (write) | logado (write) | logado (write) |
| `notas_fiscais` | logado | logado | logado | admin |
| `vinculos_nfe` | logado | logado | logado | admin |
| `atas` | logado | logado | logado | admin |
| `divergencias` | logado | logado | logado | admin |
| `vales` ⚠️ | logado | logado | logado | admin |
| `logs_acesso` | **admin** | logado | **false** | **false** |
| `logs_contas` | **admin** | logado | **false** | **false** |
| `_meta` | logado | logado (write) | logado (write) | logado (write) |
| `config` | logado | logado (write) | logado (write) | logado (write) |
| `recebimentos` | logado | logado | logado | admin **e** `resource.data.status=='cancelado'` |
| `conciliacoes` ⚠️ | logado | logado | logado | **false** |

⚠️ = coleção com regra própria mas **sem nenhum uso no código** (ver achado #10).

Padrão geral: hoje **qualquer usuário logado (de qualquer cargo) lê e escreve praticamente tudo**; o único filtro é `logado()` (via `get()` do próprio doc em `users/{uid}`) ou `ehAdmin()` (`role in ['gestor','tecnico']`) para exclusões e leitura de logs. **Nenhuma regra hoje depende de nenhum outro campo do documento além de `status` (em `recebimentos`)** — ou seja, o padrão `resource.data.tenant_id == userTenant()` proposto no prompt original é uma adição limpa, não uma reescrita: cada `allow` listado acima só precisa ganhar um `&&` a mais.

Achados específicos da leitura das regras (incorporados na numeração da seção 5, itens 10-13):

- Sem *custom claims* — todo controle de acesso é via `get(/databases/.../users/$(uid)).data`, então o padrão `userTenant()` sugerido no prompt (mais um `get()`) é consistente com o estilo já usado.
- Linha 3269 do `index.html` já tem uma mensagem de erro de UI prevendo regra faltando para `config` ("as regras do Firestore podem estar faltando para a coleção 'config'") — na prática a regra existe (`match /config/{docId}`), então essa mensagem parece ser só uma proteção defensiva no client, não um sinal de bug real.

## 4. Índices do Firestore atuais

**Não disponível neste repositório.** Preciso do export de Firestore Console → Índices (ou `firestore.indexes.json`) para listar aqui.

Sinal indireto: há 15 usos de `.orderBy()` combinados com `.where()` em algumas coleções (`divergencias`, `notas_fiscais`, `logs_contas`, `logs_acesso`, `tratamentos_atb`, `pacientes_leite`, `retiradas_leite`, `saidas_controladas`) — ao adicionar `.where('tenant_id','==',...)` nessas queries, o Firestore vai exigir índices compostos novos (`tenant_id` + campo do `orderBy`). Isso deve entrar no plano da FASE 2 como trabalho esperado, não como bug.

## 5. Achados que impactam o plano (FASE 2)

1. **Users**: campo hoje é `name`, não `nome` (o prompt original usa `nome` — ajustar nomenclatura no plano).
2. **"Primeiro usuário vira gestor"** (linha 570) é uma checagem global (`users` inteira), precisa ser por tenant.
3. **IDs de documento colidem entre tenants** em `plantoes` (`doc(today)`) e `conferencias` (`doc(todayStr())`).
4. **`config/tours`** e **`_meta/entries_version`** são documentos únicos globais — decidir se viram per-tenant (provavelmente sim para `entries_version` por eficiência; `config/tours` pode ficar global sem risco de segurança, é só preferência de UI).
5. **Coleção `medications`** parece órfã/duplicada de `medicamentos` — confirmar antes de gastar esforço migrando-a.
6. **Fluxos cross-usuário** (`plantao_solicitacoes`, `plantao_convites`, o "para"/"de" de alertas) precisam validar que ambas as pontas pertencem ao mesmo tenant, não só filtrar por `tenant_id` na leitura.
7. **Coleções com dados de pacientes** (`pacientes_leite`, `pacientes_controlados`, `tratamentos_atb`) são as mais sensíveis para vazamento cross-tenant — prioridade alta nos testes de segurança da FASE 4.
8. **Sem custom claims**: todo o controle de acesso via regras hoje depende de `get(/databases/.../users/$(uid))`. O padrão `userTenant()` sugerido no prompt (outro `get()`) é consistente com esse estilo já usado, mas soma +1 leitura de doc por avaliação de regra — aceitável no volume desta app, só registrando.
9. **Dois projetos Firebase** (prod/dev) — qualquer mudança de regras/índices precisa ser aplicada nos dois, e testada primeiro em `farmacontrol-dev-6a3e3`.
10. **Duas coleções só existem nas regras, não no código**: `vales` e `conciliacoes` têm `match` completo em `firestore.rules` mas **zero** ocorrência de `db.collection('vales')` ou `db.collection('conciliacoes')` em `index.html` (nem variações do texto "vale"/"conciliac" fora do rótulo de UI `'conciliacao'`, que é só o nome de uma aba dentro do fluxo de `notas_fiscais`/`recebimentos`, não uma coleção). Ou é uma feature descontinuada (regra órfã, sem risco) ou uma feature que existe em outro lugar (outro arquivo/branch não presente neste repo). **Preciso que confirme antes da FASE 2** — se for descontinuada, pode ser ignorada no plano; se for usada em outro lugar, preciso saber onde para incluir no escopo.
11. **Bug pré-existente encontrado (independente do multi-tenant, mas relevante pro plano)**: em `register()` (linha 570), quando `users` está vazia (`isFirst`), o client tenta criar o doc já com `status:'approved'`. A regra de `create` em `users/{userId}` exige `request.resource.data.status == 'pending'` **sempre**, sem exceção para o primeiro usuário — ou seja, essa criação deveria falhar com "permission denied" hoje. Isso não trava o app em produção porque, uma vez que `users` deixa de estar vazia (que é o caso normal), o branch `isFirst` nunca mais é exercitado — mas **vai voltar a acontecer em todo tenant novo**, exatamente o mecanismo de "primeiro usuário vira gestor" que o multi-tenant depende (achado #2). A regra precisa ganhar uma condição explícita para permitir `status=='approved'` quando for o primeiro usuário do tenant (ex.: checando que não existe nenhum outro doc `users` com aquele `tenant_id`), e isso deve entrar como correção no plano da FASE 2, não só o wrap de `tenant_id`.
12. **Sem Cloud Functions, sem Firebase Storage, sem `collectionGroup`, sem outros provedores de auth.** Fotos (`fotoMural`, `photoURL`) são salvas como *data URL* base64 direto nos documentos Firestore (`readAsDataURL`, linha 546), não no Storage — então não existe `storage.rules` pra atualizar. Autenticação é só e-mail/senha (`signInWithEmailAndPassword`/`createUserWithEmailAndPassword`), sem *custom claims*. Isso simplifica o escopo: a migração multi-tenant é **só** Firestore (regras + queries + doc IDs), sem superfície extra em Storage ou Functions.
13. `db.batch()` é usado 13 vezes (linhas 2600, 3285, 3336×4, 7223, 7310, 7358, 8158, 8181, 8264, 8318, 8675, 8734, 8847) — cada escrita dentro de um batch continua avaliada individualmente pelas regras da sua própria coleção, então nada muda estruturalmente no plano, só reforça que todo `tenant_id` gravado num batch precisa ser o mesmo em todos os docs do batch (senão a regra barra a escrita inteira).

## 6. Pendências antes da FASE 2

- [x] Laylton colou as regras atuais do Firestore → salvas em `firestore.rules` e analisadas na seção 3.
- [ ] Laylton confirma que a lista de 25 coleções está completa (nada rodando fora do `index.html`, ex. Cloud Functions em outro repo — improvável dado o achado #12, mas confirmar).
- [ ] Laylton cola os índices atuais do Firestore Console → Índices (produção e/ou dev), ou confirma que não há índices compostos manuais além dos automáticos de campo único.
- [ ] Confirmar destino do primeiro `tenant_id` de migração (o prompt sugere `"vicencia-pe"`).
- [ ] Esclarecer status da coleção `medications` (achado #5).
- [ ] Esclarecer status de `vales` e `conciliacoes` (achado #10).
