#!/bin/bash
# Troca o HOST_IP em .env e reinicia os serviços afetados.
# Uso: ./switch-host.sh <ip>
# Exemplos:
#   ./switch-host.sh 192.168.0.234   # rede local (em casa)
#   ./switch-host.sh 100.65.1.38     # Tailscale (fora de casa)
#   ./switch-host.sh 203.0.113.50    # IP público (datacenter)

set -e

IP="${1:-}"
if [ -z "$IP" ]; then
  CURRENT=$(grep -m1 "^NEXTAUTH_URL=" .env | sed 's|.*http://||;s|:.*||')
  echo "HOST_IP atual: ${CURRENT:-desconhecido}"
  echo "Uso: $0 <ip>"
  exit 1
fi

ENV_FILE="$(dirname "$0")/.env"

# Variáveis com IP único que precisam ser atualizadas
sed -i \
  -E "s|(NEXTAUTH_URL=http://)([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)(:.*)|\1${IP}\3|" \
  -E "s|(NEXT_PUBLIC_APP_BASE_URL=http://)([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)(:.*)|\1${IP}\3|" \
  -E "s|(CHECKOUT_RESULT_REDIRECT_BASE_URL=http://)([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)(:.*)|\1${IP}\3|" \
  -E "s|(NEXT_PUBLIC_API_BASE_URL=http://)([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)(:.*)|\1${IP}\3|" \
  -E "s|(OIDC_EXTERNAL_URL=http://)([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)(:.*)|\1${IP}\3|" \
  -E "s|(NEXT_PUBLIC_OIDC_AUTHORITY=http://)([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)(:.*)|\1${IP}\3|" \
  -E "s|(OIDC_ISSUER=http://)([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)(:.*)|\1${IP}\3|" \
  -E "s|(MINIO_PUBLIC_BASE_URL=http://)([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)(:.*)|\1${IP}\3|" \
  "$ENV_FILE"

echo "✓ .env atualizado para $IP"
echo ""
echo "Reiniciando serviços (frontend rebuild necessário para NEXT_PUBLIC_*)..."
COMPOSE="docker compose -f $(dirname "$0")/docker-compose.yml"
$COMPOSE up -d --build frontend
$COMPOSE restart keycloak backend
echo ""
echo "✓ Pronto. Acesse http://${IP}:3000"
