#!/usr/bin/env bash
# Endurece o banco (Firestore) de PRODUCAO contra perda de dados. Rode no Cloud Shell:
#
#   cd ~/layltonc-wq.github.io && bash scripts/seguranca_banco.sh
#
# O que faz (cada passo mostra o que vai acontecer e pede confirmacao antes de mudar algo):
#   1) liga a PROTECAO CONTRA EXCLUSAO do banco (ninguem apaga o banco por engano ou por conta invadida sem antes desligar a protecao);
#   2) confere/liga a RECUPERACAO PONTUAL (volta o banco a qualquer minuto dos ultimos 7 dias);
#   3) lista as agendas de backup e os backups existentes;
#   4) cria um "cofre" de exportacoes (bucket com versionamento, sem acesso publico e retencao de 30 dias)
#      e faz uma exportacao completa de hoje para la.
# Nada aqui apaga ou altera dados das prefeituras.
set -euo pipefail

PROJ="${1:-app-farma-b21e2}"
DB="(default)"
gcloud config set project "$PROJ" >/dev/null
LOCAL=$(gcloud firestore databases describe --database="$DB" --format='value(locationId)')
BUCKET="gs://${PROJ}-cofre-exportacoes"

echo "Projeto: $PROJ"
echo "Local do banco: $LOCAL"
echo

confirmar() { read -r -p "$1 [s/N] " r; [[ "$r" =~ ^[sS]$ ]]; }

echo "== 1) Protecao contra exclusao do banco"
if confirmar "Ligar a protecao contra exclusao?"; then
  gcloud firestore databases update --database="$DB" --delete-protection
  echo "Ligada."
else echo "Pulado."; fi
echo

echo "== 2) Recuperacao pontual (PITR)"
gcloud firestore databases describe --database="$DB" --format='value(pointInTimeRecoveryEnablement,deleteProtectionState)' || true
if confirmar "Garantir que a recuperacao pontual esta ligada?"; then
  gcloud firestore databases update --database="$DB" --enable-pitr || echo "(se disse que ja estava ligada, tudo certo)"
else echo "Pulado."; fi
echo

echo "== 3) Agendas de backup e backups existentes"
gcloud firestore backups schedules list --database="$DB" || true
gcloud firestore backups list --location="$LOCAL" || true
echo

echo "== 4) Cofre de exportacoes ($BUCKET)"
if ! gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1; then
  if confirmar "Criar o cofre $BUCKET (privado, versionado, retencao de 30 dias)?"; then
    gcloud storage buckets create "$BUCKET" --location="$LOCAL" --uniform-bucket-level-access --public-access-prevention
    gcloud storage buckets update "$BUCKET" --versioning --retention-period=30d
    echo "Cofre criado."
  else echo "Pulado."; fi
else echo "O cofre ja existe."; fi
if gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1; then
  if confirmar "Exportar o banco completo para o cofre agora?"; then
    gcloud firestore export "$BUCKET/exportacao-$(date +%F-%H%M)" --database="$DB"
    echo "Exportacao pedida. Acompanhe com: gcloud firestore operations list"
  fi
fi
echo
echo "Pronto. Resumo do banco:"
gcloud firestore databases describe --database="$DB" --format='yaml(name,locationId,pointInTimeRecoveryEnablement,deleteProtectionState)'
