#!/usr/bin/env bash
# Provisiona Ollama en una VM Oracle Cloud (Ubuntu), protegido por un token
# bearer sobre HTTP. Ollama queda SOLO en localhost; lo único expuesto es el
# proxy Caddy, que exige el token.
#
# Uso (en la VM):
#   OLLAMA_TOKEN="$(openssl rand -hex 32)" bash setup-ollama-oracle.sh
#   (guarda el token impreso al final: ese es tu OLLAMA_API_KEY en la app)
#
# Variables opcionales: PORT (def 11435), CHAT_MODEL, EMBED_MODEL
set -euo pipefail

TOKEN="${OLLAMA_TOKEN:?Define OLLAMA_TOKEN (p.ej. OLLAMA_TOKEN=\$(openssl rand -hex 32))}"
PORT="${PORT:-11435}"
CHAT_MODEL="${CHAT_MODEL:-qwen2.5:3b}"
EMBED_MODEL="${EMBED_MODEL:-nomic-embed-text}"

echo "==> Instalando Ollama (escucha en 127.0.0.1:11434, privado)"
curl -fsSL https://ollama.com/install.sh | sh
ollama pull "$CHAT_MODEL"
ollama pull "$EMBED_MODEL" || echo "(embeddings opcionales: el sistema cae a léxico)"

echo "==> Instalando Caddy"
sudo apt-get update -y
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -y
sudo apt-get install -y caddy

echo "==> Configurando proxy Caddy con token bearer (HTTP en :$PORT)"
# ':PORT' sin hostname => Caddy sirve HTTP plano (sin TLS).
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
:$PORT {
	@unauth not header Authorization "Bearer {\$OLLAMA_TOKEN}"
	respond @unauth 401
	reverse_proxy 127.0.0.1:11434
}
EOF

sudo mkdir -p /etc/systemd/system/caddy.service.d
sudo tee /etc/systemd/system/caddy.service.d/override.conf >/dev/null <<EOF
[Service]
Environment=OLLAMA_TOKEN=$TOKEN
EOF
sudo systemctl daemon-reload
sudo systemctl restart caddy

echo "==> Abriendo el firewall del SO para el puerto $PORT"
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$PORT" -j ACCEPT || true
sudo netfilter-persistent save 2>/dev/null || sudo bash -c 'iptables-save > /etc/iptables/rules.v4' || true

IP="$(curl -fsS ifconfig.me || echo '<IP-PUBLICA>')"
cat <<EOF

============================================================
 Listo. Ollama protegido por token, accesible por HTTP.

 Token (= OLLAMA_API_KEY en la app):
   $TOKEN

 Falta abrir el puerto $PORT en OCI:
   VCN → Security List/NSG → Ingress → TCP $PORT
   (ideal: limita el Source a la IP de tu app, no 0.0.0.0/0)

 Prueba:
   curl -H "Authorization: Bearer $TOKEN" http://$IP:$PORT/api/tags
   (sin el header debe responder 401)

 En la app (.env.local / Vercel):
   LLM_PROVIDER=ollama
   OLLAMA_BASE_URL=http://$IP:$PORT
   OLLAMA_API_KEY=$TOKEN
   OLLAMA_CHAT_MODEL=$CHAT_MODEL
   EMBEDDINGS_PROVIDER=ollama
   OLLAMA_EMBED_MODEL=$EMBED_MODEL
   EMBEDDING_DIMS=768
============================================================
EOF
