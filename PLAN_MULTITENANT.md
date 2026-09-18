# Plano de Implementação Multi-Tenant — FarmaControl

**Fase 2 — ainda sem tocar em código.** Baseado no `AUDIT_MULTITENANT.md` (Fase 1, já confirmada). Este documento define EXATAMENTE o que muda em cada coleção, cada tipo de query, e traz o arquivo de regras novo por completo (não só um template) pra você revisar.

> **Atualização desta sessão:** você confirmou que a prefeitura em produção hoje é **Vicência** (`tenant_id: "vicencia-pe"`) — a versão anterior deste documento citava "São Lourenço da Mata" por engano, já corrigido em todo o arquivo. Você também confirmou que **Itaquitinga** é a próxima prefeitura a entrar, ainda não está rodando nada, e pediu pra eu decidir o melhor caminho (deixando aberto pra outras prefeituras entrarem depois também) — as decisões que antes estavam em aberto já foram tomadas abaixo, com a lógica de cada uma explicada. A seção 6 (nova) é o passo a passo prático de como colocar Itaquitinga (e qualquer prefeitura futura) pra rodar.

---

## Resumo em português simples

Hoje o FarmaControl é de **uma prefeitura só** (Vicência). A ideia é várias prefeituras usarem o **mesmo sistema, no mesmo endereço de sempre**, cada uma vendo só os próprios dados — sem uma conseguir ver ou mexer nos dados da outra.

Pra isso, todo documento salvo no banco (todo medicamento, toda entrada de estoque, todo recebimento, etc.) vai ganhar uma etiqueta invisível dizendo "isso é da prefeitura X". Toda vez que o app buscar dados, ele só busca os que têm a etiqueta da prefeitura de quem está logado. E as regras de segurança do banco (que já existem, protegendo contra acesso indevido) passam a exigir essa etiqueta batendo também — então mesmo que o app tivesse um bug e esquecesse de filtrar, o banco recusaria a operação.

Três pontos precisam de mais cuidado que simplesmente "adicionar a etiqueta" (detalhados abaixo): o plantão e a conferência diária, que hoje usam a **data** como identificador do registro — isso precisa de ajuste pra não misturar prefeituras diferentes no mesmo dia; e como o **primeiro usuário de uma prefeitura nova** vira gestor (hoje isso é automático e global, e tem inclusive um bug de regra já existente, independente do multi-tenant — ver `AUDIT_MULTITENANT.md` achado #11).

---

## ✅ Decisões já tomadas nesta sessão (você pode revisar, mas não estou mais esperando resposta pra seguir)

### Como um usuário novo escolhe a prefeitura dele ao se cadastrar → **Opção A: link de convite com a prefeitura embutida**

Cada prefeitura recebe um link próprio pra distribuir aos funcionários, tipo `https://www.farmacontrol.app.br/?tenant=itaquitinga-pe`. O cadastro lê isso da URL e trava nessa prefeitura; sem link válido (ou com um `tenant_id` que não existe/está inativo), não cadastra. Essa foi a opção mais simples e com menor risco de alguém se cadastrar na prefeitura errada, então segui com ela — as duas alternativas descartadas (subdomínio por prefeitura, ou lista suspensa na tela de cadastro) exigiam mais infraestrutura ou abriam brecha de qualquer um escolher qualquer prefeitura.

Você confirmou o domínio: `https://www.farmacontrol.app.br/` é a URL real de Vicência hoje — uso ela nos exemplos de link de convite a partir daqui. (Fica só uma curiosidade técnica, sem ação necessária: não achei um arquivo `CNAME` neste repositório amarrando esse domínio ao GitHub Pages — o domínio deve estar configurado direto nas Settings → Pages do GitHub, ou o site roda por trás de outro serviço tipo Cloudflare/Netlify na frente do GitHub Pages. Não muda nada no plano, só registrando.)

### Como o primeiro usuário de uma prefeitura nova vira gestor → **abandonar o "automático", o técnico aprova manualmente**

Hoje `register()` verifica se `users` está vazia pra decidir se quem está se cadastrando vira `gestor` (`status:'approved'`) direto, sem aprovação de ninguém. Isso já tem um bug de regra (achado #11 da auditoria: a regra de `create` sempre exigiu `status=='pending'`, então essa criação "automática" já deveria falhar hoje — só nunca aconteceu de novo porque `users` nunca mais ficou vazia desde a primeira vez).

Ao invés de tentar reproduzir esse "primeiro usuário vira gestor" por tenant dentro da regra do Firestore (o Firestore não faz contagem/agregação em regra de segurança — a única forma seria uma segunda leitura condicional arriscada e frágil), decidi **remover esse mecanismo automático por completo**: todo cadastro novo sempre nasce `status:'pending'`, de qualquer prefeitura, sem exceção — a regra fica mais simples e sem o bug. Quem aprova o **primeiro** usuário de uma prefeitura nova (e o promove a `gestor`) é o **técnico** (você), manualmente, na tela de Aprovar Contas — que passa a poder ver/aprovar pendências de **qualquer** prefeitura, não só da sua própria (é uma mudança de regra pequena, seção 3). Depois desse primeiro gestor aprovado, ele aprova o resto da equipe da própria prefeitura normalmente, do jeito que já funciona hoje.

Isso resolve o bug pré-existente de graça e dá um ponto de controle humano na entrada de cada prefeitura nova — natural, já que é você mesmo quem está onboardando Itaquitinga agora. Ver seção 6 pro passo a passo completo.

---

## 1. Estrutura de dados

### 1.1 Nova coleção: `tenants`
Guarda os dados de cada prefeitura/cliente. Pequena, poucos documentos, cresce devagar (uma prefeitura nova de vez em quando).

```
tenants/{tenant_id}
{
  nome: "Vicência",      // nome de exibição
  uf: "PE",
  ativo: true,
  criadoEm: "2026-01-01T00:00:00.000Z"
}
```
`{tenant_id}` é o próprio ID do documento (ex.: `vicencia-pe`, e futuramente `itaquitinga-pe`) — vira o valor gravado em `tenant_id` em todo o resto do sistema.

### 1.1b Nova coleção: `super_admins` (Opção 2 — poder cross-tenant por conta, não por cargo)
Lista pequena de UIDs com acesso cross-tenant sobre `users`/`tenants` (seção 3). Sem escrita liberada pelo app (`allow write: if false`) — só você mesmo cadastra/remove um UID aqui, direto no Console do Firebase.

```
super_admins/{uid}
{
  ativo: true   // conteúdo não importa de verdade — a regra só checa se o doc existe
}
```
`{uid}` é o UID do Firebase Auth da sua conta original de Vicência (acha em Authentication → Users, no Console — a mesma que você já usa hoje pra logar). Nenhum outro campo é lido pela regra; pode ficar só `{ativo:true}` ou até vazio.

### 1.2 `users/{uid}` — ganha o campo que amarra tudo
```
ANTES: {uid, role, status, name, email, color, sessionTimeout, photoURL, crf, criadoEm, tutoriaisVistos[]}
DEPOIS: {uid, role, status, name, email, color, sessionTimeout, photoURL, crf, criadoEm, tutoriaisVistos[], tenant_id}
```
Não precisa duplicar o nome da prefeitura aqui — busca em `tenants/{tenant_id}` quando precisar exibir.

### 1.3 As outras 23 coleções em uso — todas ganham `tenant_id`
Mesmo padrão pra todas (uso o schema já levantado na Fase 1, só acrescentando o campo novo):

`medicamentos`, `entries`, `notas_fiscais`, `divergencias`, `recebimentos`, `tratamentos_atb`, `logs_contas`, `logs_acesso`, `atas`, `solicitacoes`, `pacientes_leite`, `plantao_solicitacoes`, `plantao_convites`, `pacientes_controlados`, `vinculos_nfe`, `alertas`, `saidas_controladas`, `avisos`, `retiradas_leite`, `conferencias`*, `plantoes`*

```
ANTES: { ...campos que já existem... }
DEPOIS: { ...campos que já existem..., tenant_id: "vicencia-pe" }
```

`plantao_convites` entrou na lista nesta revisão: apesar de nenhum `.add()` criar convite novo hoje (achado #10 da auditoria), a leitura/UI (banner de notificação, botões aceitar/recusar) continua rodando pra todo usuário — migrar como as demais evita que essa parte (hoje inofensiva) passe a tomar erro de permissão à toa depois que a regra endurecer.

**Ficam de fora da migração** (achados #7, #8 da Fase 1 — código morto/órfão, confirmados):
- `medications` (inglês) — resquício, alimenta um badge de estoque baixo já quebrado hoje (bug préexistente, fora do escopo do multi-tenant).
- `vales`, `conciliacoes` — regras sem coleção correspondente no código nenhum lugar.

**Fica global, sem `tenant_id`** (achado #9, decisão já tomada):
- `config` — configuração da interface (tutoriais), não é dado de nenhuma prefeitura.

**Casos especiais** (ver seção 4 — não é só adicionar campo):
- `plantoes`* e `conferencias`* — além do campo `tenant_id`, o **ID do documento** também precisa mudar (hoje é só a data, o que colide entre prefeituras no mesmo dia).
- `_meta` — o doc `entries_version` vira um por prefeitura (`entries_version__{tenant_id}`), em vez de global.

---

## 2. Padrão de queries — como cada tipo de operação muda

### 2.1 Helper no frontend (novo, uma função só, usada em todo lugar)
Este código não usa arrow function/`const` porque o resto do arquivo não usa (mantendo o estilo já existente). Também não criei uma função "buscar usuário atual do nada" porque **o `user` já é passado como prop/parâmetro em toda função e componente do app** (é assim que `user.role` já é lido em centenas de lugares) — então o padrão certo aqui é ler `user.tenant_id` direto, do mesmo jeito. Um helper pequeno só pra deixar isso padronizado e fácil de achar:

```js
// perto das outras funções globais pequenas (ex.: perto de function can(role,a){...})
function tenantDe(user){return (user&&user.tenant_id)||null;}
```

### 2.2 Toda LEITURA (`.onSnapshot()` / `.get()`) ganha um `.where()` a mais
```js
// ANTES
db.collection('medicamentos').onSnapshot(function(s){...});

// DEPOIS
db.collection('medicamentos').where('tenant_id','==',tenantDe(user)).onSnapshot(function(s){...});
```
Quando já existe um `.where()`, o novo entra ANTES dos outros (convenção, não é regra técnica — Firestore não liga pra ordem):
```js
// ANTES
db.collection('divergencias').where('status','==','pendente').orderBy('criadoEm','desc').limit(200)

// DEPOIS
db.collection('divergencias').where('tenant_id','==',tenantDe(user)).where('status','==','pendente').orderBy('criadoEm','desc').limit(200)
```

### 2.3 Toda ESCRITA NOVA (`.add()` / `.set()` de documento novo) ganha o campo no objeto
```js
// ANTES
db.collection('medicamentos').add({nome:newNome.trim(),ean:newEan.trim(),minEstoque:0,criadoEm:new Date().toISOString()});

// DEPOIS
db.collection('medicamentos').add({nome:newNome.trim(),ean:newEan.trim(),minEstoque:0,criadoEm:new Date().toISOString(),tenant_id:tenantDe(user)});
```

### 2.4 `.update()` em documento existente — NÃO muda (o campo já está lá desde a criação)
```js
// SEM MUDANÇA — já filtra por doc.id, que já pertence a um tenant só
db.collection('medicamentos').doc(id).update({...});
```
A regra do Firestore é quem garante que só dá pra atualizar um doc do seu próprio tenant (ver seção 3). Não precisa (e não deve) reescrever `tenant_id` num update — ele nunca muda depois de criado.

### 2.5 `.delete()` — mesma lógica do update, sem mudança no código
A regra cuida da proteção.

### 2.6 `batch.set()` / `batch.update()` / `batch.delete()` — mesmas regras 2.3–2.5, só que o objeto/patch é montado antes e passado pro batch
```js
// ANTES (ex.: linha 8189, criação de divergência)
batch.set(db.collection('divergencias').doc(),{medicamentoId:...,tipo:'quantidade',status:'pendente',criadoEm:now,criadoPor:user.name||''});

// DEPOIS
batch.set(db.collection('divergencias').doc(),{medicamentoId:...,tipo:'quantidade',status:'pendente',criadoEm:now,criadoPor:user.name||'',tenant_id:tenantDe(user)});
```

**Este padrão (2.2–2.6) se aplica nas 225 ocorrências mapeadas na Fase 1**, coleção por coleção, na ordem que a Fase 3 vai seguir (definida na seção 5 deste documento).

---

## 3. Regras do Firestore — arquivo completo (não é só template, é o arquivo pronto pra revisar)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function logado() { return request.auth != null; }
    function meuPerfil() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data; }
    function ehGestor() { return logado() && meuPerfil().role == 'gestor'; }
    function ehTecnico() { return logado() && meuPerfil().role == 'tecnico'; }
    function ehAdmin() { return ehGestor() || ehTecnico(); }
    // NOVO: tenant do usuário logado — todas as regras abaixo comparam com isso.
    function userTenant() { return meuPerfil().tenant_id; }
    // NOVO: dono do documento (create) tem que já vir com o tenant certo, senão a escrita é recusada.
    function tenantOk(data) { return data.tenant_id == userTenant(); }
    // NOVO (Opção 2, escolhida): poder cross-tenant travado por CONTA específica, não por cargo —
    // só quem tiver um doc em super_admins/{uid} (você cria isso manualmente no Console, é uma
    // lista pequena de UIDs de confiança, não um cargo). Nenhuma conta técnico local de nenhuma
    // prefeitura ganha isso por padrão, mesmo que você promova alguém a 'tecnico' numa cidade nova.
    function ehSuperAdmin() { return logado() && exists(/databases/$(database)/documents/super_admins/$(request.auth.uid)); }

    // ===== SUPER_ADMINS (lista de contas com poder cross-tenant — só leitura de si mesmo, escrita
    // NENHUMA pelo app: só você mesmo edita essa coleção direto no Console do Firebase, de propósito,
    // pra não existir nenhum caminho no código capaz de se auto-promover.) =====
    match /super_admins/{uid} {
      allow read: if logado() && request.auth.uid == uid;
      allow write: if false;
    }

    // ===== TENANTS (cadastro das prefeituras — só leitura pra usuários logados, escrita só super admin) =====
    match /tenants/{id} {
      allow read: if logado();
      allow write: if ehSuperAdmin();
    }

    // ===== USUÁRIOS ===== (leitura segue o padrão normal — mesmo tenant, ou super admin. Um get()
    // dentro de uma regra, tipo o que meuPerfil() faz, NÃO é reavaliado pelas regras de novo — o
    // Firestore trata isso com acesso interno, sem risco de dependência circular. Por isso dá pra
    // exigir tenantOk até na leitura do PRÓPRIO doc do usuário, sem quebrar nada: ele sempre bate
    // com o próprio tenant, trivialmente.
    // create SEMPRE nasce 'pending', sem exceção — o "primeiro usuário vira gestor" automático foi
    // removido (era a origem do bug pré-existente do achado #11: a regra já exigia 'pending' sempre,
    // e o create do isFirst tentava gravar 'approved'). create também confere que o tenant_id aponta
    // pra um tenant que existe e está ativo, senão um link de convite com tenant_id errado/inventado
    // nem chega a criar o doc.
    // update/delete: super admin aprova/gerencia usuário de QUALQUER prefeitura (é quem faz a
    // aprovação manual do primeiro usuário de uma prefeitura nova — ver runbook na seção 6, por
    // enquanto direto no Console); gestor OU técnico só da própria prefeitura (tenantOk).
    match /users/{userId} {
      allow read: if logado() && (ehSuperAdmin() || resource.data.tenant_id == userTenant());
      allow create: if request.auth != null
                    && request.auth.uid == userId
                    && request.resource.data.status == 'pending'
                    && request.resource.data.tenant_id is string
                    && request.resource.data.tenant_id != ''
                    && exists(/databases/$(database)/documents/tenants/$(request.resource.data.tenant_id))
                    && get(/databases/$(database)/documents/tenants/$(request.resource.data.tenant_id)).data.ativo == true;
      allow update: if ehSuperAdmin()
                    || (ehAdmin() && tenantOk(resource.data))
                    || (logado()
                        && request.auth.uid == userId
                        && request.resource.data.role == resource.data.role
                        && request.resource.data.status == resource.data.status
                        && request.resource.data.tenant_id == resource.data.tenant_id);
      allow delete: if ehSuperAdmin() || (ehAdmin() && tenantOk(resource.data));
    }

    // ===== MEDICAMENTOS =====
    match /medicamentos/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
      allow delete: if ehAdmin() && resource.data.tenant_id == userTenant();
    }

    // ===== ENTRADAS E SAÍDAS =====
    match /entries/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
      allow delete: if logado() && resource.data.tenant_id == userTenant();
    }

    // ===== CONFERÊNCIA =====
    match /conferencias/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
    }

    // ===== ATB =====
    match /tratamentos_atb/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
      allow delete: if ehAdmin() && resource.data.tenant_id == userTenant();
    }

    // ===== LEITES =====
    match /pacientes_leite/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
      allow delete: if ehAdmin() && resource.data.tenant_id == userTenant();
    }
    match /retiradas_leite/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if false;
      allow delete: if ehTecnico() && resource.data.tenant_id == userTenant();
    }

    // ===== CONTROLADOS (Morfina/Tramal) =====
    match /pacientes_controlados/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
      allow delete: if ehAdmin() && resource.data.tenant_id == userTenant();
    }
    match /saidas_controladas/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update, delete: if false;
    }

    // ===== PLANTÃO ===== (o ID do documento muda de esquema — ver seção 4 — mas a regra em si é igual às outras)
    match /plantoes/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
    }
    match /plantao_solicitacoes/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
    }
    // plantao_convites: sem .add() no código hoje (achado #10), mas a leitura/UI segue ativa —
    // mantida no padrão normal em vez de removida, pra não mudar comportamento observável à toa.
    match /plantao_convites/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
    }

    // ===== MURAL E ALERTAS =====
    match /avisos/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
      allow delete: if logado() && resource.data.tenant_id == userTenant();
    }
    match /alertas/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
      allow delete: if ehAdmin() && resource.data.tenant_id == userTenant();
    }

    // ===== SOLICITAÇÕES =====
    match /solicitacoes/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
    }

    // ===== NOTAS FISCAIS =====
    match /notas_fiscais/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
      allow delete: if ehAdmin() && resource.data.tenant_id == userTenant();
    }
    match /vinculos_nfe/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
      allow delete: if ehAdmin() && resource.data.tenant_id == userTenant();
    }

    // ===== ATAS =====
    match /atas/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
      allow delete: if ehAdmin() && resource.data.tenant_id == userTenant();
    }

    // ===== DIVERGÊNCIAS =====
    match /divergencias/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
      allow delete: if ehAdmin() && resource.data.tenant_id == userTenant();
    }
    // vales: REMOVIDO (Fase 1, achado #8 — sem coleção correspondente no código).

    // ===== LOGS (auditoria — nunca apagáveis) =====
    match /logs_acesso/{id} {
      allow read: if ehAdmin() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update, delete: if false;
    }
    match /logs_contas/{id} {
      allow read: if ehAdmin() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update, delete: if false;
    }

    // ===== _META (doc de versão por tenant — ex.: entries_version__vicencia-pe) =====
    match /_meta/{doc} {
      allow read: if logado();
      allow write: if logado();
    }

    // ===== CONFIG (global — não é dado de tenant, Fase 1 achado #9) =====
    match /config/{docId} {
      allow read: if logado();
      allow write: if logado();
    }

    // ===== RECEBIMENTOS =====
    match /recebimentos/{id} {
      allow read: if logado() && resource.data.tenant_id == userTenant();
      allow create: if logado() && tenantOk(request.resource.data);
      allow update: if logado() && resource.data.tenant_id == userTenant() && tenantOk(request.resource.data);
      allow delete: if ehAdmin() && resource.data.tenant_id == userTenant() && resource.data.status == 'cancelado';
    }
    // conciliacoes: REMOVIDO (Fase 1, achado #8 — sem coleção correspondente no código).

  }
}
```

**O que mudou estruturalmente em relação ao padrão do seu rascunho original:**
- Toda regra de `create` agora também confere que o documento **sendo criado** já vem com o `tenant_id` certo (`tenantOk(request.resource.data)`), não só que quem tá logado pertence a algum tenant — sem isso, um usuário mal-intencionado (ou um bug no app) poderia criar um documento marcado com o `tenant_id` de OUTRA prefeitura.
- **Correção em relação a uma versão anterior deste documento**: eu tinha escrito que `users` precisava ficar sem filtro de tenant na leitura, pra não cair numa "dependência circular" com `meuPerfil()`. Reconferindo com mais calma: isso estava errado — um `get()`/`exists()` chamado de DENTRO de uma regra (como `meuPerfil()` faz) nunca é reavaliado pelas regras de novo, o Firestore usa acesso interno pra isso. Ou seja, dá pra exigir `resource.data.tenant_id == userTenant()` até na leitura do próprio doc do usuário, sem quebrar nada (bate trivialmente, é o próprio tenant) — e isso fecha um vazamento real que a versão anterior deixava aberto: sem esse filtro, qualquer usuário logado de qualquer prefeitura conseguiria listar a coleção `users` inteira (nome, cargo, e-mail, status de todo mundo, de todas as prefeituras) direto pelo DevTools do navegador, sem passar pela tela do app. Com o filtro, isso só é possível pra quem está em `super_admins`.
- **`users` é a única coleção com alcance cross-tenant, e só pra quem estiver em `super_admins`** (`update`/`delete` sem exigir `tenantOk`) — de propósito, é o que permite você aprovar o primeiro usuário de uma prefeitura nova sem já pertencer a ela (seção 6). Isso é uma CONTA específica (seu UID), não um CARGO — nenhuma conta `tecnico` de nenhuma prefeitura ganha isso automaticamente, nem a sua original de Vicência, a menos que o UID dela esteja em `super_admins/{uid}`. Em todas as outras 24 coleções (as 23 operacionais + a própria `users` pra quem não é super admin), `ehAdmin()` (gestor OU técnico) continua exigindo `tenantOk` — ou seja, mesmo um técnico local de uma prefeitura NÃO enxerga nem edita medicamento, entrada, paciente etc. de outra prefeitura, e nem aprova usuário de outra prefeitura, a não ser que também esteja em `super_admins`.
- **`super_admins/{uid}` não tem nenhuma escrita liberada pelo app** (`allow write: if false`) — de propósito, pra não existir NENHUM caminho no código (nem um bug, nem alguém mal-intencionado) capaz de se auto-promover a super admin. Só você, direto no Console do Firebase, adiciona ou remove um UID dessa coleção (documento vazio ou `{ativo:true}` já basta, o conteúdo não importa — só a existência do doc é checada). Isso também trava a escrita em `tenants` (criar/editar/desativar prefeitura), que virou `ehSuperAdmin()` em vez de `ehTecnico()` pela mesma lógica.
- `create` de `users` também confere que o `tenant_id` do documento aponta pra um `tenants/{id}` que existe e tem `ativo:true` — um link de convite com `tenant_id` inventado ou de uma prefeitura desativada nem chega a criar o cadastro.

---

## 4. Casos especiais (fora do padrão genérico)

### 4.1 `plantoes` e `conferencias` — mudar o esquema do ID do documento
```js
// ANTES
db.collection('plantoes').doc(today)          // colide entre tenants no mesmo dia
db.collection('conferencias').doc(todayStr())  // idem

// DEPOIS
db.collection('plantoes').doc(tenantDe(user)+'__'+today)
db.collection('conferencias').doc(tenantDe(user)+'__'+todayStr())
```
Isso muda em ~20 lugares no código (todo lugar que hoje monta `today`/`todayStr()` como ID direto — listados na Fase 1, achados #1 e #2). O campo `tenant_id` dentro do documento (seção 1.3) continua existindo também, é redundante com o ID mas mantém consistência com o resto do sistema e simplifica a regra.

### 4.2 `register()` — remove o "primeiro usuário vira gestor" automático; lê o tenant da URL (Opção A)
```js
// ANTES (linha 570) — lê a coleção inteira sem filtro, só pra decidir se aprova como gestor sozinho
auth.createUserWithEmailAndPassword(email,pass).then(function(c){var uid=c.user.uid;
  return c.user.getIdToken(true).then(function(){return db.collection('users').get();})
  .then(function(snap){var isFirst=snap.empty;
    var ud={name:name,role:isFirst?'gestor':role,...,status:isFirst?'approved':'pending',...};
    return db.collection('users').doc(uid).set(ud)...

// DEPOIS — tenant_id vem de ?tenant= na URL (lido uma vez no carregamento da tela de login/cadastro,
// igual o resto do app já lê outros parâmetros); sem isFirst, sem leitura de users nenhuma, sempre 'pending'
auth.createUserWithEmailAndPassword(email,pass).then(function(c){var uid=c.user.uid;
  return c.user.getIdToken(true).then(function(){
    var ud={name:name,role:role,color:color,email:email,status:'pending',tenant_id:tenantDaURL,
      criadoEm:new Date().toISOString(),sessionTimeout:12,photoURL:'',crf:role==='farmaceutico'?crf.trim():''};
    return db.collection('users').doc(uid).set(ud)...
```
Se `tenantDaURL` estiver vazio/ausente (alguém abriu a tela de cadastro sem link de convite), a tela de cadastro mostra um erro e nem tenta criar a conta — evita o cadastro "sem prefeitura" que a regra do Firestore ia recusar mesmo assim, só que com uma mensagem melhor pro usuário. `tenantDaURL` fica guardado (ex. `sessionStorage`) entre o carregamento da página e o clique em "Cadastrar", já que o React aqui não usa router — é só ler `new URLSearchParams(location.search).get('tenant')` uma vez.

### 4.3 `entries` — leitura do histórico completo (linha 9430) ganha filtro
```js
// ANTES
var col=db.collection('entries');

// DEPOIS
var col=db.collection('entries').where('tenant_id','==',tenantDe(user));
```
Simples, mas **importante fazer isso no MESMO commit que a regra de `entries` for trocada** (achado #6 da Fase 1) — senão a tela de início quebra assim que a regra entra em vigor.

### 4.4 `_meta/entries_version` — vira um documento por tenant
```js
// ANTES
db.collection('_meta').doc('entries_version').set({v:Date.now(),at:...},{merge:true})

// DEPOIS
db.collection('_meta').doc('entries_version__'+tenantDe(user)).set({v:Date.now(),at:...},{merge:true})
```
E o listener correspondente (que hoje escuta sempre o mesmo doc fixo) passa a escutar o doc do tenant do usuário logado.

---

## 5. Ordem de execução recomendada para a Fase 3

Do mais simples/isolado pro mais arriscado, testando depois de cada um (a Fase 3 detalha o passo a passo; aqui é só a ordem das coleções):

0. **Manual, seu (fora do código)**: cadastrar seu UID em `super_admins/{seu-uid}` no Console do Firebase — antes das regras novas entrarem em vigor, senão ninguém tem o poder cross-tenant no primeiro momento.
1. `tenants` (nova, cria a base)
2. `users` (adiciona `tenant_id` aos usuários existentes — todo o resto depende disso)
3. `medicamentos` (mais simples, poucas dependências)
4. `atas`, `vinculos_nfe` (dependem de medicamentos, mas isoladas do fluxo de estoque)
5. `entries` (a mais usada — 36 ocorrências — fazer com calma, é o coração do sistema)
6. `recebimentos`, `notas_fiscais`, `divergencias` (o módulo de Recebimento/Conciliação inteiro, interligado — fazer as três juntas)
7. `tratamentos_atb`, `pacientes_controlados`, `saidas_controladas` (módulo de controlados)
8. `pacientes_leite`, `retiradas_leite` (módulo de leites)
9. `solicitacoes`, `alertas`, `avisos` (módulos menores, independentes)
10. `logs_acesso`, `logs_contas` (auditoria — baixo risco, ninguém depende de leitura em tempo real)
11. `plantoes`, `plantao_solicitacoes`, `plantao_convites` (junto com a mudança de esquema de ID — seção 4.1)
12. `conferencias` (junto com a mudança de esquema de ID — seção 4.1)
13. `_meta` (seção 4.4)
14. Regras do Firestore inteiras (seção 3) — só depois de TODAS as coleções acima já estarem gravando `tenant_id` nos dados existentes (Passo 5 da Fase 3, a migração dos documentos antigos)
15. Índices (Fase 1, seção 4 — criar conforme os erros aparecerem no console do navegador)
16. Testes de segurança cross-tenant (Fase 3, Passo 7)

---

## 6. Runbook: colocando uma prefeitura nova pra funcionar (ex.: Itaquitinga)

Isso é o que responde diretamente sua pergunta — "qual o melhor caminho pra desmembrar e, quem sabe, adicionar outras prefeituras também". Depois que a Fase 3 estiver implantada (regras + código com `tenant_id`), colocar uma prefeitura nova pra rodar vira uma rotina de poucos passos, sem precisar mexer em código de novo:

1. **Você cria o documento da prefeitura** em `tenants/{tenant_id}` — direto no Console do Firebase, com sua conta `super_admin` (4 campos: `nome`, `uf`, `ativo:true`, `criadoEm`); dá pra construir uma telinha no app pra isso depois, mas não é bloqueante. Ex.: `tenants/itaquitinga-pe = {nome:"Itaquitinga", uf:"PE", ativo:true, criadoEm:...}`.
2. **Você mesmo se cadastra pelo link de convite dessa prefeitura**: `https://www.farmacontrol.app.br/?tenant=itaquitinga-pe`. Você confirmou que quer ser sempre a primeira conta de cada prefeitura nova — então é você quem entra pelo link, cria essa conta nova, e ela nasce `status:'pending'`, `tenant_id:'itaquitinga-pe'`, igual qualquer cadastro (não tem gestor automático, seção "Decisões já tomadas").
3. **Você aprova essa própria conta direto no Console do Firebase** (Firestore Database → coleção `users` → o documento com o UID da conta nova → edita o campo `status` pra `"approved"` e `role` pra `"tecnico"`). A tela de "Aprovar Contas" do próprio app continua mostrando só a prefeitura de quem está logado (mesmo padrão de todas as outras telas) — dar pra ela essa visão cross-tenant é uma extensão de UI que dá pra construir depois, não é bloqueante: como isso só acontece uma vez por prefeitura nova, o Console resolve bem por enquanto.
4. **Com essa conta técnico de Itaquitinga em mãos, você vai aceitando e ajustando o cargo do pessoal de lá** conforme for cadastrando — exatamente como já faz hoje em Vicência: aprova, promove alguém a `gestor` quando fizer sentido, etc. Essa conta técnico de Itaquitinga cuida só da própria prefeitura — com a Opção 2, ela **não** enxerga nem aprova usuário de Vicência nem de nenhuma outra prefeitura (só a conta `super_admins` original faz isso). Se precisar aprovar alguém de outra prefeitura de novo, você troca pra sua conta `super_admin` original.
5. **Repete os passos 1-3 pra próxima prefeitura.** Nenhum deploy de código novo é necessário pra isso — é só cadastro de dado (`tenants` + `super_admins`, se quiser repetir o padrão) + um link + uma aprovação sua.

Isso significa: **Vicência não precisa de nenhuma ação** quando Itaquitinga (ou qualquer prefeitura futura) entrar — ela já continua no mesmo link/URL de sempre, com os próprios dados intactos, sem saber que existe outra prefeitura no mesmo sistema.

### Sobre sua conta ficar ativa durante os testes (e a Opção 2 que você escolheu)

Confirmando o que você pediu: **nada no plano desativa ou expira sua conta** — nem por cargo, nem por tempo. Sua conta original de Vicência continua com acesso total aos dados de Vicência durante toda a Fase 3 (é o que você vai usar pra testar cada coleção migrada), e ganha o poder extra cross-tenant assim que o UID dela for cadastrado em `super_admins` (passo 0 da Fase 3, abaixo). O único cuidado, que já vale pra tudo nesta migração: **antes de qualquer regra nova entrar em vigor, os documentos existentes (incluindo o `users` da sua própria conta) já precisam ter `tenant_id` gravado** (Passo 5 da Fase 3, seção 5) — senão até você tomaria "permission denied" no meio do processo. Isso já está previsto na ordem de execução, não é um risco novo.

**Implementei a Opção 2** (que você escolheu): o poder cross-tenant agora é por **conta específica** (`super_admins/{uid}`), não por cargo `tecnico`. Isso muda um detalhe importante do runbook acima: a conta técnico que você cria pra cada prefeitura nova (passo 3-4) **não** herda esse poder automaticamente — só a conta cujo UID está em `super_admins` (a sua original) consegue aprovar usuário de qualquer prefeitura. Pra evitar confusão no dia a dia: sempre que for aprovar o primeiro usuário de uma prefeitura nova, entre com a conta que você sabe que está em `super_admins` (a original de Vicência), não com uma conta técnico local que você tenha criado numa prefeitura.

---

## Pendências antes de eu seguir pra Fase 3

~~Domínio do link de convite~~ — confirmado: `www.farmacontrol.app.br`. ~~Desenho do poder cross-tenant~~ — confirmado: Opção 2 (`super_admins` por conta, seção 3). Não há mais nenhuma decisão de produto em aberto.

**Único item que segue pendente, e não bloqueia o início:** **Índices do Firestore** — ainda não recebi (Fase 1, seção 4 do `AUDIT_MULTITENANT.md`); o Firestore avisa no console do navegador quando falta um, com link pra criar, então dá pra ir resolvendo durante a Fase 3 mesmo.

**Plano fechado — Fase 3 começa nesta sessão.** Ver `AUDIT_MULTITENANT.md`, seção final ("Checagem final antes da Fase 3"), pra como a verificação e a execução vão funcionar na prática dado que eu não tenho acesso ao Console/projeto Firebase real.
