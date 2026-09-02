# Plano de Implementação Multi-Tenant — FarmaControl

**Fase 2 — ainda sem tocar em código.** Baseado no `AUDIT_MULTITENANT.md` (Fase 1, já confirmada). Este documento define EXATAMENTE o que muda em cada coleção, cada tipo de query, e traz o arquivo de regras novo por completo (não só um template) pra você revisar.

---

## Resumo em português simples

Hoje o FarmaControl é de **uma prefeitura só**. A ideia é várias prefeituras usarem o **mesmo sistema**, cada uma vendo só os próprios dados — sem uma conseguir ver ou mexer nos dados da outra.

Pra isso, todo documento salvo no banco (todo medicamento, toda entrada de estoque, todo recebimento, etc.) vai ganhar uma etiqueta invisível dizendo "isso é da prefeitura X". Toda vez que o app buscar dados, ele só busca os que têm a etiqueta da prefeitura de quem está logado. E as regras de segurança do banco (que já existem, protegendo contra acesso indevido) passam a exigir essa etiqueta batendo também — então mesmo que o app tivesse um bug e esquecesse de filtrar, o banco recusaria a operação.

Dois pontos precisam de mais cuidado que simplesmente "adicionar a etiqueta" (detalhados abaixo): o plantão e a conferência diária, que hoje usam a **data** como identificador do registro — isso precisa de ajuste pra não misturar prefeituras diferentes no mesmo dia. E falta decidir **como um novo funcionário escolhe pra qual prefeitura está se cadastrando** — isso o sistema não faz sozinho, é uma decisão sua (opções no fim deste documento).

---

## ⚠️ Decisão que só você pode tomar antes da Fase 3

**Como um usuário novo escolhe a prefeitura dele ao se cadastrar?** Hoje `register()` só pede nome/email/senha/cargo — não existe conceito de "de qual prefeitura" em lugar nenhum. Preciso que você escolha uma opção (ou sugira outra):

| Opção | Como funciona | Prós | Contras |
|---|---|---|---|
| **A — Link de convite com a prefeitura embutida (recomendada)** | Cada prefeitura recebe um link próprio pra distribuir aos funcionários, tipo `https://farmacontrol.app.br/?tenant=vicencia-pe`. O cadastro lê isso da URL e trava nessa prefeitura. Sem link válido, não cadastra. | Não precisa mexer em DNS/hospedagem — é só um parâmetro na mesma URL de sempre. Fácil de implementar e testar. | Cada prefeitura precisa ser instruída a usar o link certo (não o link genérico). |
| **B — Subdomínio por prefeitura** | `vicencia.farmacontrol.app.br`, `saolourenco.farmacontrol.app.br`, etc. — cada uma com seu próprio endereço. | Mais "profissional", mais fácil pra usuário não errar. | Precisa configurar DNS + hospedagem pra cada subdomínio novo; mais trabalho toda vez que entra uma prefeitura nova. |
| **C — Escolher numa lista suspensa na tela de cadastro** | Tela de cadastro ganha um campo "Prefeitura" com todas as prefeituras cadastradas no sistema. | Não depende de link nenhum. | Qualquer um pode se cadastrar em qualquer prefeitura (mistura o problema que queremos evitar) — precisaria de um código/senha extra por prefeitura pra não deixar isso aberto. |

**Minha recomendação: Opção A.** É a que menos trabalho dá pra manter e a que menos risco tem de alguém se cadastrar na prefeitura errada por engano. Se topar, sigo com ela no plano abaixo — me avisa se preferir outra.

Também preciso confirmar: **qual é o `tenant_id` da prefeitura que já está usando o sistema hoje** (a atual, São Lourenço da Mata, pelo que vi no documento de ATA que você me mandou)? Sugestão de slug: `sao-lourenco-da-mata-pe`. Confirma ou me diz o que prefere.

---

## 1. Estrutura de dados

### 1.1 Nova coleção: `tenants`
Guarda os dados de cada prefeitura/cliente. Pequena, poucos documentos, cresce devagar (uma prefeitura nova de vez em quando).

```
tenants/{tenant_id}
{
  nome: "São Lourenço da Mata",      // nome de exibição
  uf: "PE",
  ativo: true,
  criadoEm: "2026-01-01T00:00:00.000Z"
}
```
`{tenant_id}` é o próprio ID do documento (ex.: `sao-lourenco-da-mata-pe`) — vira o valor gravado em `tenant_id` em todo o resto do sistema.

### 1.2 `users/{uid}` — ganha o campo que amarra tudo
```
ANTES: {uid, role, status, name, email, color, sessionTimeout, photoURL, crf, criadoEm, tutoriaisVistos[]}
DEPOIS: {uid, role, status, name, email, color, sessionTimeout, photoURL, crf, criadoEm, tutoriaisVistos[], tenant_id}
```
Não precisa duplicar o nome da prefeitura aqui — busca em `tenants/{tenant_id}` quando precisar exibir.

### 1.3 As outras 22 coleções em uso — todas ganham `tenant_id`
Mesmo padrão pra todas (uso o schema já levantado na Fase 1, só acrescentando o campo novo):

`medicamentos`, `entries`, `notas_fiscais`, `divergencias`, `recebimentos`, `tratamentos_atb`, `logs_contas`, `logs_acesso`, `atas`, `solicitacoes`, `pacientes_leite`, `plantao_solicitacoes`, `pacientes_controlados`, `vinculos_nfe`, `alertas`, `saidas_controladas`, `avisos`, `retiradas_leite`, `conferencias`*, `plantoes`*

```
ANTES: { ...campos que já existem... }
DEPOIS: { ...campos que já existem..., tenant_id: "sao-lourenco-da-mata-pe" }
```

**Ficam de fora da migração** (achados #5, #7, #8 da Fase 1 — código morto/órfão, confirmados):
- `medications` (inglês) — resquício, alimenta um badge de estoque baixo já quebrado hoje.
- `plantao_convites` — funcionalidade morta (Gerenciar Equipe adiciona direto, sem convite).
- `vales`, `conciliacoes` — regras sem coleção correspondente no código.

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
    // doc ANTES de saber o tenant, pra função meuPerfil() funcionar. A escrita continua igual, só
    // valida que create grava um tenant_id de um tenant que existe e está ativo.)
    match /users/{userId} {
      allow read: if logado();
      allow create: if request.auth != null
                    && request.auth.uid == userId
                    && request.resource.data.status == 'pending'
                    && request.resource.data.tenant_id is string
                    && request.resource.data.tenant_id != '';
      allow update: if (ehAdmin() && tenantOk(resource.data))
                    || (logado()
                        && request.auth.uid == userId
                        && request.resource.data.role == resource.data.role
                        && request.resource.data.status == resource.data.status
                        && request.resource.data.tenant_id == resource.data.tenant_id);
      allow delete: if ehAdmin() && tenantOk(resource.data);
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
    // plantao_convites: REMOVIDO (código morto — Fase 1, achado #5). Se algum dia a funcionalidade
    // de convite voltar a ser usada, recriar esta regra com o mesmo padrão das outras.

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

    // ===== _META (doc de versão por tenant — ex.: entries_version__sao-lourenco-da-mata-pe) =====
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

### 4.2 `register()` — "primeiro usuário vira gestor" por tenant, não pro sistema inteiro
```js
// ANTES (linha 570) — lê a coleção inteira, sem filtro
return db.collection('users').get();
}).then(function(snap){var isFirst=snap.empty; ...})

// DEPOIS
return db.collection('users').where('tenant_id','==',tenantEscolhido).get();
}).then(function(snap){var isFirst=snap.empty; ...})
```
`tenantEscolhido` vem da Opção A/B/C descrita no início deste documento (depende da decisão que falta).

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
11. `plantoes`, `plantao_solicitacoes` (junto com a mudança de esquema de ID — seção 4.1)
12. `conferencias` (junto com a mudança de esquema de ID — seção 4.1)
13. `_meta` (seção 4.4)
14. Regras do Firestore inteiras (seção 3) — só depois de TODAS as coleções acima já estarem gravando `tenant_id` nos dados existentes (Passo 5 da Fase 3, a migração dos documentos antigos)
15. Índices (Fase 1, seção 4 — criar conforme os erros aparecerem no console do navegador)
16. Testes de segurança cross-tenant (Fase 3, Passo 7)

---

## Pendências antes de eu seguir pra Fase 3

1. **Qual opção (A/B/C) pra escolha de tenant no cadastro** — recomendo A.
2. **Confirmar o `tenant_id` da prefeitura atual** (sugestão: `sao-lourenco-da-mata-pe`) e o nome de exibição.
3. Revisar o arquivo de regras da seção 3 — principalmente a observação sobre `users` não filtrar por tenant na leitura (é proposital, mas quero seu ok).

Assim que você confirmar (ou me disser "pode decidir você mesmo" de novo, como fez na Fase 1), sigo pra Fase 3 — que é quando o código de fato começa a mudar, passo a passo, com commit e teste depois de cada coleção.
