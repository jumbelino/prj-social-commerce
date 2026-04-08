#!/bin/bash
# Instala Docker + Docker Compose no Ubuntu 22.04 e clona o projeto.
# Executar como root ou com sudo na VM.
set -e

echo "==> Atualizando sistema..."
apt-get update -y
apt-get upgrade -y

echo "==> Instalando dependências..."
apt-get install -y ca-certificates curl gnupg git

echo "==> Instalando Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker

echo "==> Adicionando usuário atual ao grupo docker..."
usermod -aG docker "${SUDO_USER:-$USER}" || true

echo "==> Configurando firewall (UFW)..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "✓ Docker instalado: $(docker --version)"
echo "✓ Docker Compose: $(docker compose version)"
echo ""
echo "Próximo passo: clone o repositório e configure o .env"
echo "  git clone <URL_DO_REPO> /opt/canoa"
echo "  cd /opt/canoa/infra/prod"
echo "  cp .env.example .env && nano .env"
