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

    // ===== TENANTS (cadastro das prefeituras — só leitura pra usuários logados, escrita só técnico) =====
    match /tenants/{id} {
      allow read: if logado();
      allow write: if ehTecnico();
    }

    // ===== USUÁRIOS ===== (users NÃO ganha filtro de tenant na leitura — precisa poder ler o próprio
    // doc ANTES de saber o tenant, pra função meuPerfil() funcionar. create SEMPRE nasce 'pending',
    // sem exceção — o "primeiro usuário vira gestor" automático foi removido (era a origem do bug
    // pré-existente do achado #11: a regra já exigia 'pending' sempre, e o create do isFirst tentava
    // gravar 'approved'). create também confere que o tenant_id aponta pra um tenant que existe e
    // está ativo, senão um link de convite com tenant_id errado/inventado nem chega a criar o doc.
    // update/delete: técnico aprova/gerencia usuário de QUALQUER prefeitura (é ele quem faz a
    // aprovação manual do primeiro gestor de uma prefeitura nova — ver runbook na seção 6); gestor
    // só da própria prefeitura (tenantOk).
    match /users/{userId} {
      allow read: if logado();
      allow create: if request.auth != null
                    && request.auth.uid == userId
                    && request.resource.data.status == 'pending'
                    && request.resource.data.tenant_id is string
                    && request.resource.data.tenant_id != ''
                    && exists(/databases/$(database)/documents/tenants/$(request.resource.data.tenant_id))
                    && get(/databases/$(database)/documents/tenants/$(request.resource.data.tenant_id)).data.ativo == true;
      allow update: if ehTecnico()
                    || (ehGestor() && tenantOk(resource.data))
                    || (logado()
                        && request.auth.uid == userId
                        && request.resource.data.role == resource.data.role
                        && request.resource.data.status == resource.data.status
                        && request.resource.data.tenant_id == resource.data.tenant_id);
      allow delete: if ehTecnico() || (ehGestor() && tenantOk(resource.data));
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
- `users` não filtra leitura por tenant — proposital: pra regra `userTenant()` funcionar em qualquer outra coleção, o Firestore precisa poder ler `users/{uid}` do próprio usuário logado sem cair numa dependência circular. (Isso não vaza dado sensível de outros tenants nessa coleção específica — é só nome/cargo/status; ainda assim, se quiser, dá pra travar mais a leitura de `users` só ao próprio doc + admins do mesmo tenant, mas isso complica a regra. Posso detalhar se você quiser essa camada extra.)
- **`users` é a única coleção onde `ehTecnico()` tem alcance cross-tenant** (`update`/`delete` sem exigir `tenantOk`) — de propósito, é o que permite você (técnico) aprovar o primeiro usuário de uma prefeitura nova sem já pertencer a ela (seção 6). Em todas as outras 23 coleções, `ehAdmin()` (gestor OU técnico) continua exigindo `tenantOk` — ou seja, o técnico de uma prefeitura NÃO enxerga nem edita medicamento, entrada, paciente etc. de outra prefeitura. Esse acesso extra fica restrito só ao cadastro de usuários, o mínimo necessário pra fazer o onboarding funcionar.
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

1. **Você cria o documento da prefeitura** em `tenants/{tenant_id}` — por enquanto direto no Console do Firebase (4 campos: `nome`, `uf`, `ativo:true`, `criadoEm`); dá pra construir uma telinha no app pra isso depois, mas não é bloqueante. Ex.: `tenants/itaquitinga-pe = {nome:"Itaquitinga", uf:"PE", ativo:true, criadoEm:...}`.
2. **Você mesmo se cadastra pelo link de convite dessa prefeitura**: `https://www.farmacontrol.app.br/?tenant=itaquitinga-pe`. Você confirmou que quer ser sempre a primeira conta de cada prefeitura nova — então é você quem entra pelo link, cria essa conta nova, e ela nasce `status:'pending'`, `tenant_id:'itaquitinga-pe'`, igual qualquer cadastro (não tem gestor automático, seção "Decisões já tomadas").
3. **Você aprova essa própria conta usando sua conta técnico original** (a de Vicência, que já existe e tem o poder cross-tenant explicado na pergunta anterior sua), na tela de Aprovar Contas (que pra técnico passa a mostrar pendências de todas as prefeituras, não só a de Vicência) — e define o cargo dela como `tecnico`, já que é você mesmo controlando Itaquitinga por enquanto.
4. **Com essa conta técnico de Itaquitinga em mãos, você vai aceitando e ajustando o cargo do pessoal de lá** conforme for cadastrando — exatamente como já faz hoje em Vicência: aprova, promove alguém a `gestor` quando fizer sentido, etc. A conta técnico de Itaquitinga já cuida da própria prefeitura sozinha a partir daí (ver nota abaixo sobre o alcance cross-tenant).
5. **Repete os passos 1-3 pra próxima prefeitura.** Nenhum deploy de código novo é necessário pra isso — é só cadastro de dado (`tenants`) + um link + uma aprovação sua.

Isso significa: **Vicência não precisa de nenhuma ação** quando Itaquitinga (ou qualquer prefeitura futura) entrar — ela já continua no mesmo link/URL de sempre, com os próprios dados intactos, sem saber que existe outra prefeitura no mesmo sistema.

### Sobre sua conta técnico ficar ativa durante os testes

Confirmando o que você pediu: **o cargo `tecnico` nunca é desativado nem expira** — não existe nada no plano que derrube ou limite essa conta com o tempo. Sua conta técnico de Vicência continua com acesso total aos dados de Vicência (igual hoje) durante toda a Fase 3, o que é justamente o que você vai usar pra testar cada coleção migrada. O único cuidado, que já vale pra tudo nesta migração: **antes de qualquer regra nova entrar em vigor, os documentos existentes (incluindo o `users` da sua própria conta) já precisam ter `tenant_id` gravado** (Passo 5 da Fase 3, seção 5) — senão até você tomaria "permission denied" no meio do processo. Isso já está previsto na ordem de execução, não é um risco novo.

⚠️ Uma correção pro que expliquei na resposta anterior: o poder cross-tenant (`ehTecnico()` sem `tenantOk` na regra de `users`, seção 3) hoje vale pra **qualquer conta com cargo `tecnico`, de qualquer prefeitura** — não é exclusivo da sua conta original de Vicência. Ou seja, a conta técnico de Itaquitinga que você criar no passo 3 **também** vai enxergar/aprovar usuários de Vicência e de qualquer outra prefeitura, não só da própria — porque é sua mesma pessoa por trás de todas, isso não é problema. Só fica registrado: se um dia repassar uma conta técnico local pra alguém de confiança que não seja você, essa pessoa também herda esse alcance cross-tenant sobre `users` de qualquer prefeitura. Se preferir travar isso só pra sua conta específica (por UID, não por cargo), me avisa que ajusto a regra antes da Fase 3.

---

## Pendências antes de eu seguir pra Fase 3

As decisões de produto já foram tomadas nesta sessão (seção "✅ Decisões já tomadas" no topo). ~~Domínio do link de convite~~ — confirmado: `www.farmacontrol.app.br`. O que falta antes de eu começar a mudar código de verdade:

1. **OK explícito no desenho do técnico com poder cross-tenant só sobre `users`** (seção 3, explicado logo abaixo do bloco de regras) — é a peça nova desta sessão que resolve o onboarding e o bug do achado #11 ao mesmo tempo; quero confirmar que faz sentido pra você antes de codificar em cima disso.
2. **Índices do Firestore** — ainda não recebi (Fase 1, seção 4 do `AUDIT_MULTITENANT.md`); não bloqueia o início da Fase 3 (o Firestore avisa no console do navegador quando falta um, com link pra criar), mas ajuda saber de antemão.

Fora isso, pode considerar o plano fechado. Assim que você confirmar o item 1 (ou disser "pode decidir você mesmo" de novo), sigo pra Fase 3 — que é quando o código de fato começa a mudar, coleção por coleção, com commit e teste depois de cada uma, começando pela ordem da seção 5.
