#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER="root@62.238.3.136"
SSH="ssh -i $HOME/.ssh/id_ed25519 -o IdentitiesOnly=yes"

echo "→ Construyendo frontend..."
cd "$ROOT_DIR/frontend"
npm run build

echo "→ Sincronizando backend (sin tocar uploads)..."
rsync -az --delete --chown=apps:apps -e "$SSH" \
  --exclude='uploads/' \
  --exclude='node_modules/' \
  --exclude='.env' \
  --exclude='tests/' \
  "$ROOT_DIR/backend/" $SERVER:/home/apps/diandra/backend/

echo "→ Sincronizando frontend dist..."
rsync -az --delete --chown=apps:apps -e "$SSH" \
  "$ROOT_DIR/frontend/dist/" $SERVER:/home/apps/diandra/frontend/dist/

echo "→ Instalando dependencias y reiniciando..."
$SSH $SERVER "cd /home/apps/diandra/backend && sudo -u apps npm install --omit=dev --silent && sudo -u apps pm2 restart diandra-backend"

echo "→ Verificando..."
sleep 2
$SSH $SERVER "sudo -u apps pm2 show diandra-backend | grep -E 'status|restarts'"
curl -fsS http://62.238.3.136:8098/api/health && echo

echo "✓ Deploy completado"
