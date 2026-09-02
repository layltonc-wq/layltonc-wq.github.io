# Auditoria Multi-Tenant — FarmaControl

> Gerado na FASE 1 (análise, nenhum código alterado). Branch: `claude/farmacontrol-multitenant-acia61`.
> Fonte: `index.html` (SPA único, 9.825 linhas, React sem build step + Firebase SDK v8, carregados via CDN).

## 0. Metodologia e limitações

- Toda a aplicação (frontend + acesso a dados) vive em um único arquivo `index.html`. Não há backend próprio, Cloud Functions, nem arquivo `firestore.rules`/`firestore.indexes.json` no repositório.
- O mapeamento de coleções e operações foi feito via análise estática (grep/regex) sobre `db.collection('...')` e os métodos encadeados (`.where`, `.get`, `.add`, `.update`, `.delete`, `.set`, `.doc`, `.onSnapshot`, `.orderBy`) nas linhas seguintes. Como o código é denso (muitas instruções por linha, funções inteiras em uma linha só), a coluna "Operações detectadas" reflete o bloco de código ao redor da chamada, não necessariamente uma cadeia única — use os números de linha para conferir o trecho exato.
- **Regras do Firestore**: não há arquivo de regras no repo. Preciso que você cole aqui (ou em outro arquivo) o conteúdo atual do Firestore Console → Regras dos dois projetos abaixo, para eu documentar o "ANTES" real. Por ora, a seção 3 lista apenas o que dá pra inferir do comportamento do app (mensagens de erro de permissão, etc.).
- **Índices do Firestore**: mesma limitação — preciso do conteúdo de Firestore Console → Índices, ou do arquivo `firestore.indexes.json` se você tiver um export.
- Há **dois projetos Firebase** configurados no app (linhas 332-333):
  - Produção: `app-farma-b21e2`
  - Teste/dev: `farmacontrol-dev-6a3e3`
  - A troca é feita manualmente numa tela de "Setup" (linha 552) que salva a config no `localStorage`. Isso é relevante: qualquer migração de regras/índices/dados precisa ser replicada nos dois projetos, e a instrução do prompt de "trabalhar na branch `testing`" provavelmente corresponde a apontar esse Setup para o projeto `farmacontrol-dev-6a3e3`.

## 1. Coleções Firestore

25 coleções distintas, 225 pontos de chamada `db.collection(...)` no total.

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
| `medications` | 2 | delete:1 doc:1 where:1 onSnapshot:1 | — | **Achado**: coleção diferente de `medicamentos` (nomes distintos!). Só 2 usos (linhas 3393, 9445), parece código legado/órfão usado apenas para "alerta de estoque baixo". Confirmar com Laylton se é lixo (bug) ou feature separada antes da FASE 2/3 — se for bug, mexer nela seria trabalho desperdiçado. |
| `_meta` | 2 | set:1 doc:2 where:1 onSnapshot:1 | doc fixo `entries_version`: `{v, at}` | **Achado**: contador global usado só para invalidar cache/refetch de `entries` no cliente (linhas 303, 9439). Não vaza dados (o refetch real ainda seria filtrado por tenant), mas em multi-tenant qualquer mudança de qualquer tenant dispara refetch em todos os outros clientes conectados — desperdício de leituras. Bom candidato a virar `_meta/entries_version_{tenant_id}`. |
| `conferencias` | 1 | doc:1 | doc = `todayStr()` | **Achado crítico**: mesmo padrão de `plantoes` — `doc(todayStr())` (linha 7004). Colisão de ID entre tenants no mesmo dia. |

## 2. Queries mapeadas (detalhe por linha)

Tabela completa (todas as 225 ocorrências, com número de linha, operações detectadas no bloco e argumentos de `.where()` quando existentes) está em anexo: `AUDIT_MULTITENANT_QUERIES.md` (gerado junto com este arquivo, mesmo diretório).

Resumo de quantas ocorrências já têm algum `.where()` hoje: **~24 de 225** (grep de `.where(` direto na linha da chamada), nenhuma delas filtrando por tenant/município/prefeitura — confirmando que **não existe nenhum isolamento multi-tenant hoje** (também não há nenhuma ocorrência de `tenant`, `municipio` ou `prefeitura` como campo de dado no código; a única ocorrência de "MUNICIPIO" é uma string de heurística de OCR, sem relação).

## 3. Regras do Firestore atuais

**Não disponível neste repositório.** Não há `firestore.rules` versionado. Para completar esta seção preciso que você:

1. Abra o Firebase Console dos dois projetos (`app-farma-b21e2` e `farmacontrol-dev-6a3e3`) → Firestore Database → Regras.
2. Cole o conteúdo aqui no chat, ou salve como `firestore.rules` na raiz do repo (ideal — assim passa a ser versionado e eu consigo comparar antes/depois automaticamente nas próximas fases).

Evidências indiretas encontradas no código:
- Linha 3269: mensagem de erro de UI já prevê regra faltando: *"as regras do Firestore podem estar faltando para a coleção 'config'"* — sinal de que as regras atuais podem estar incompletas/inconsistentes mesmo antes do multi-tenant.
- Não há nenhuma chamada a `firebase.auth().currentUser.getIdTokenResult()` nem uso de *custom claims* — ou seja, qualquer controle de acesso hoje é feito 100% por regras baseadas em `resource.data`/`get()` de `users/{uid}`, e/ou apenas na camada de UI (role check em JS), o que é fraco por si só (regras client-side não protegem o banco).

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

## 6. Pendências antes da FASE 2

- [ ] Laylton confirma que a lista de 25 coleções está completa (nada rodando fora do `index.html`, ex. Cloud Functions em outro repo?).
- [ ] Laylton cola as regras atuais do Firestore (produção e/ou dev) aqui ou como `firestore.rules`.
- [ ] Laylton cola os índices atuais (se houver algum manual).
- [ ] Confirmar destino do primeiro `tenant_id` de migração (o prompt sugere `"vicencia-pe"`).
- [ ] Esclarecer status da coleção `medications` (achado #5).
