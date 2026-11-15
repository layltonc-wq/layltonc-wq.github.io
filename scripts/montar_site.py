#!/usr/bin/env python3
"""Monta a pasta _site/ com SOMENTE o que pode ficar público no site (lista de permitidos).

Código-fonte, regras do banco, funções, testes e scripts nunca entram aqui. A publicação no Firebase Hosting
(firebase.hosting.json, "public": "_site") envia apenas esta pasta, então um arquivo novo no repositório
NUNCA vira público por acidente: para entrar no site ele precisa ser adicionado a esta lista.

  python3 scripts/montar_site.py
"""
import os
import shutil
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SAIDA = os.path.join(RAIZ, '_site')

ARQUIVOS = ['index.html', 'app.js', 'sw.js', 'offline.html', 'manifest.webmanifest', 'CNAME']
PASTAS = ['apresentacao', 'assets', 'conferencia', 'demo', 'privacidade', 'termos', 'ubs']


def main():
    if os.path.isdir(SAIDA):
        shutil.rmtree(SAIDA)
    os.makedirs(SAIDA)
    for a in ARQUIVOS:
        origem = os.path.join(RAIZ, a)
        if os.path.exists(origem):
            shutil.copy2(origem, os.path.join(SAIDA, a))
        elif a != 'CNAME':
            print('ERRO: arquivo obrigatorio ausente: ' + a)
            sys.exit(1)
    for p in PASTAS:
        origem = os.path.join(RAIZ, p)
        if not os.path.isdir(origem):
            print('ERRO: pasta obrigatoria ausente: ' + p)
            sys.exit(1)
        shutil.copytree(origem, os.path.join(SAIDA, p), ignore=shutil.ignore_patterns('.*', '*.md', 'node_modules'))
    n = sum(len(f) for _, _, f in os.walk(SAIDA))
    print('_site montado com %d arquivos' % n)


if __name__ == '__main__':
    main()
