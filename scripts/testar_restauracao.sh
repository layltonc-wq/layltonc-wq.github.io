#!/usr/bin/env bash
# TESTE DE RESTAURACAO do backup, sem tocar no banco de producao. Rode no Cloud Shell:
#
#   cd ~/layltonc-wq.github.io && bash scripts/testar_restauracao.sh
#
# O que faz:
#   1) pega o backup mais recente do banco de producao;
#   2) restaura esse backup em um banco NOVO e separado (teste-restauracao-AAAAMMDD) - o banco real nao e alterado;
#   3) conta os documentos principais do banco restaurado e do banco real, para comparar;
#   4) pergunta se pode apagar o banco de teste (so o de teste).
# Um backup que nunca foi restaurado nao e garantia: este teste prova que a recuperacao funciona.
set -euo pipefail

PROJ="${1:-app-farma-b21e2}"
gcloud config set project "$PROJ" >/dev/null
LOCAL=$(gcloud firestore databases describe --database="(default)" --format='value(locationId)')
DESTINO="teste-restauracao-$(date +%Y%m%d)"

BACKUP=$(gcloud firestore backups list --location="$LOCAL" --format='value(name)' --sort-by='~snapshotTime' --limit=1)
if [ -z "$BACKUP" ]; then echo "Nenhum backup encontrado em $LOCAL. Rode antes: bash scripts/seguranca_banco.sh"; exit 1; fi
echo "Backup mais recente: $BACKUP"
echo "Banco de teste que sera criado: $DESTINO"
read -r -p "Restaurar agora? (nao altera o banco real) [s/N] " r
[[ "$r" =~ ^[sS]$ ]] || { echo "Cancelado."; exit 0; }

gcloud firestore databases restore --source-backup="$BACKUP" --destination-database="$DESTINO"
echo "Restauracao pedida. Pode levar alguns minutos; aguardando..."
for i in $(seq 1 60); do
  if gcloud firestore databases describe --database="$DESTINO" >/dev/null 2>&1; then break; fi
  sleep 15
done

echo
echo "== Comparando (documentos nas colecoes principais) =="
cd "$(dirname "$0")/../functions"
if [ ! -d node_modules ]; then npm install --no-audit --no-fund >/dev/null; fi
export GOOGLE_CLOUD_PROJECT="$PROJ" GOOGLE_CLOUD_QUOTA_PROJECT="$PROJ"
echo "-- banco REAL"
node ../scripts/contar_banco.js "(default)"
echo "-- banco RESTAURADO ($DESTINO)"
node ../scripts/contar_banco.js "$DESTINO"
cd - >/dev/null

echo
echo "Se os numeros do restaurado forem parecidos com os do real (o backup tem algumas horas de atraso), a restauracao funciona."
read -r -p "Apagar o banco de TESTE $DESTINO agora? [s/N] " r
if [[ "$r" =~ ^[sS]$ ]]; then
  gcloud firestore databases delete --database="$DESTINO" --quiet
  echo "Banco de teste apagado."
else
  echo "Mantido. Para apagar depois: gcloud firestore databases delete --database=$DESTINO"
fi
