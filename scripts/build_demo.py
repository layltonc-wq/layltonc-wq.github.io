#!/usr/bin/env python3
"""Gera demo/index.html a partir do index.html (a página do app).

A demonstração é o app REAL rodando com um banco simulado dentro do navegador (ver demo/). Para ela nunca ficar
desatualizada em relação ao app, a página é derivada do index.html a cada build (scripts/build.sh chama este script).

  python3 scripts/build_demo.py          gera/atualiza demo/index.html
  python3 scripts/build_demo.py --check  só confere se demo/index.html está em dia (sai com erro se não estiver)
"""
import os
import re
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def gerar():
    s = open(os.path.join(RAIZ, 'index.html'), encoding='utf-8').read()

    def uma_vez(padrao, novo, nome, flags=0):
        nonlocal s
        s, n = re.subn(padrao, lambda m: novo, s, count=1, flags=flags)
        assert n == 1, 'build_demo: trecho nao encontrado em index.html: ' + nome

    # 1) isolamento do armazenamento ANTES de qualquer outro script
    uma_vez(r'(<meta charset="UTF-8"\s*/?>)', '\\1\n<script src="isolamento.js"></script>\n<meta name="robots" content="noindex">'.replace('\\1', '<meta charset="UTF-8"/>'), 'meta charset')
    # 2) sem manifesto/instalacao: a demonstracao nao deve virar o "app" instalado
    uma_vez(r'<link rel="manifest" href="/manifest.webmanifest">\n', '', 'manifest')
    uma_vez(r'<title>FarmaControl</title>', '<title>FarmaControl — Demonstração</title>', 'title')
    # 3) Firebase de mentirinha no lugar do real
    uma_vez(r'<script src="https://www\.gstatic\.com/firebasejs/[^"]*firebase-app-compat\.js"></script>\n<script src="https://www\.gstatic\.com/firebasejs/[^"]*firebase-auth-compat\.js"></script>\n<script src="https://www\.gstatic\.com/firebasejs/[^"]*firebase-firestore-compat\.js"></script>',
            '<script src="fake-firebase.js"></script>\n<script src="seed.js"></script>', 'scripts do firebase')
    # 4) aviso de "ambiente de teste" nao se aplica
    uma_vez(r"if\(window\.__fcEnv === 'dev'\) \{", "if(window.__fcEnv === 'dev' && !window.__fcDemo) {", 'banner dev')
    # 5) o app (app.js) so carrega depois da escolha do perfil (demo.js)
    s, n = re.subn(r'<script src="app\.js\?v=([^"]*)"></script>', lambda m: '<script>window.__fcAppSrc="../app.js?v=%s";</script>\n<script src="demo.js"></script>' % m.group(1), s, count=1)
    assert n == 1, 'build_demo: tag do app.js nao encontrada'
    return s


if __name__ == '__main__':
    novo = gerar()
    destino = os.path.join(RAIZ, 'demo', 'index.html')
    if '--check' in sys.argv:
        atual = open(destino, encoding='utf-8').read() if os.path.exists(destino) else ''
        if atual != novo:
            print('demo/index.html esta desatualizado: rode "bash scripts/build.sh" (ou python3 scripts/build_demo.py) e faca commit')
            sys.exit(1)
        print('demo/index.html em dia')
    else:
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        open(destino, 'w', encoding='utf-8').write(novo)
        print('demo/index.html gerado')
