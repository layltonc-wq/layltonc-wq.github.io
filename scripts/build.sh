#!/usr/bin/env bash
# Compila src/app.jsx -> app.js (JSX pré-traduzido) e atualiza index.html.
# O código-fonte do app agora fica em src/app.jsx. Depois de QUALQUER mudança lá, rode:
#   bash scripts/build.sh
# e faça commit de src/app.jsx + app.js + index.html juntos.
# O script: (1) gera app.js, (2) coloca o hash do conteúdo em <script src="app.js?v=HASH">
# (garante que o navegador nunca use um app.js velho com um index.html novo) e
# (3) incrementa window.__FC_VERSION em index.html (dispara a auto-atualização nos aparelhos abertos).
set -euo pipefail
cd "$(dirname "$0")/.."
npx --yes esbuild@0.28.2 src/app.jsx --jsx=transform --target=es2020 --minify-whitespace --charset=utf8 --outfile=app.js --log-level=warning
HASH=$(sha1sum app.js | cut -c1-10)
python3 - "$HASH" <<'PY'
import re,sys,time
h=sys.argv[1]
s=open('index.html',encoding='utf-8').read()
s,n=re.subn(r'<script src="app\.js\?v=[^"]*"></script>','<script src="app.js?v=%s"></script>'%h,s)
assert n==1,'tag do app.js não encontrada em index.html'
s,n2=re.subn(r'window\.__FC_VERSION=\d+;','window.__FC_VERSION=%d;'%int(time.time()),s)
assert n2==1
open('index.html','w',encoding='utf-8').write(s)
print('app.js hash',h)
PY
