# Testes automáticos do FarmaControl

Rodam sozinhos no GitHub a cada pull request (arquivo `.github/workflows/testes.yml`). Para rodar na sua máquina:

```
cd tests
npm install
npx playwright install chromium     # só na primeira vez
npm test
```

`npm run test:estatico` faz só as verificações rápidas (segundos). `npm run test:ui` roda só os testes com navegador.

## O que é verificado

| Grupo | O que cobre |
|---|---|
| `static/` | `app.js` e `index.html` estão em dia com `src/app.jsx` (se não: rode `bash scripts/build.sh`), sintaxe das funções e das páginas públicas, manifesto do app instalável |
| `emulator/` | **Regras do banco** (quem lê/grava o quê, isolamento entre prefeituras, CAF × Satélite, só consulta), **funções** (estoque por local, API pública das UBS e da conferência) e as **páginas públicas** (`/ubs/`, `/conferencia/`) falando com a função de verdade, tudo no emulador do Firestore (nenhum dado real) |
| `ui/` | O **app inteiro** (`app.js` real) no navegador com um banco simulado (`demo/fake-firebase.js`): Solicitações das UBS, CAF e Satélite, permuta/doação/reposição, validades nas UBS, app instalável e a garantia de que **Vicência continua igual** |

Nada aqui toca em produção: os testes usam o emulador do Firestore (projeto `demo-*`) e um Firebase simulado, e o navegador bloqueia qualquer acesso à internet.

## Quando um teste falha

O executor mostra as linhas `FALHA ...` com o que era esperado. Se a mudança foi de propósito (ex.: um texto novo), ajuste o teste correspondente na mesma mudança.

## Escrevendo um teste novo

- Regras/funções: copie um arquivo de `emulator/` (cada um recebe um projeto próprio em `process.env.FC_PROJ`).
- Telas: copie um de `ui/`; `lib/harness.js` abre o app com o usuário e os dados que você montar em `store`.
