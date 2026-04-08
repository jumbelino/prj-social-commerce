#!/bin/bash
# Atualiza e reinicia todos os serviços de produção.
# Uso: ./deploy.sh
set -e

COMPOSE="docker compose -f $(dirname "$0")/docker-compose.yml"

echo "==> Puxando atualizações do git..."
git -C "$(dirname "$0")/../.." pull

echo "==> Rebuild e restart dos serviços..."
$COMPOSE up -d --build

echo ""
echo "✓ Deploy concluído. Status:"
$COMPOSE ps
