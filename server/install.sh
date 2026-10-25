#!/usr/bin/env bash
# Runs on the server (sent by the deploy workflow). Serves the website with Caddy (HTTPS by itself
# once a domain points here) and runs the WhatsApp agent, both as systemd services that restart on
# failure and on reboot.
set -euo pipefail
APP=/opt/agent-grand-prix WEB=/var/www/agent-grand-prix NODE_DIR=/opt/agp-node NODE_V=v22.11.0 CADDY_V=2.8.4
case "$(uname -m)" in aarch64|arm64) ARCH=arm64 ;; *) ARCH=amd64 ;; esac

# ---- website ----
if [ ! -x /usr/local/bin/caddy ]; then
  curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v$CADDY_V/caddy_${CADDY_V}_linux_$ARCH.tar.gz" -o /tmp/caddy.tgz
  sudo tar -xzf /tmp/caddy.tgz -C /usr/local/bin caddy && rm -f /tmp/caddy.tgz
fi
sudo mkdir -p "$WEB.new" && sudo tar -xzf /tmp/site.tgz -C "$WEB.new" && rm -f /tmp/site.tgz
sudo rm -rf "$WEB.old"; [ -d "$WEB" ] && sudo mv "$WEB" "$WEB.old"; sudo mv "$WEB.new" "$WEB"; sudo rm -rf "$WEB.old"
# One shared Caddy serves every project on this server. Each project drops its own file in
# /etc/caddy/sites/ (its domains + root), so adding Palasora or anything else never touches this one.
sudo mkdir -p /etc/caddy/sites
sudo tee /etc/caddy/Caddyfile >/dev/null <<'CADDY'
import /etc/caddy/sites/*.caddy
CADDY
# SITE_DOMAIN lists the game's names, main one first (agentgrandprix.com www.agentgrandprix.com):
# the first serves the game with HTTPS, the others send visitors to it. The bare IP address
# (http://<IP>) keeps serving the game too.
read -r -a NAMES <<<"$(printf '%s' "${SITE_DOMAIN:-}" | tr ',' ' ')"
GAME='root * '"$WEB"'
	encode zstd gzip
	file_server
	header /assets/* Cache-Control "public, max-age=604800"
	header /vendor/* Cache-Control "public, max-age=604800"'
{
  printf ':80 {\n\t%s\n}\n' "$GAME"
  if [ ${#NAMES[@]} -gt 0 ]; then
    printf '%s {\n\t%s\n}\n' "${NAMES[0]}" "$GAME"
    for N in "${NAMES[@]:1}"; do printf '%s {\n\tredir https://%s{uri} permanent\n}\n' "$N" "${NAMES[0]}"; done
  fi
} | sudo tee /etc/caddy/sites/agent-grand-prix.caddy >/dev/null
# The shared web server (replaces the first agp-web unit)
if [ -f /etc/systemd/system/agp-web.service ]; then
  sudo systemctl disable --now agp-web >/dev/null 2>&1 || true; sudo rm -f /etc/systemd/system/agp-web.service
fi
sudo tee /etc/systemd/system/caddy.service >/dev/null <<UNIT
[Unit]
Description=Web server for every site on this machine (Caddy)
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
AmbientCapabilities=CAP_NET_BIND_SERVICE
DynamicUser=yes
StateDirectory=caddy
Environment=XDG_DATA_HOME=/var/lib/caddy XDG_CONFIG_HOME=/var/lib/caddy
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
# Oracle's Ubuntu images block every port but SSH in the server's own firewall: let the web in
if command -v firewall-cmd >/dev/null && sudo firewall-cmd --state >/dev/null 2>&1; then
  sudo firewall-cmd --permanent --add-service=http --add-service=https >/dev/null && sudo firewall-cmd --reload >/dev/null
elif command -v iptables >/dev/null; then
  for P in 80 443; do
    sudo iptables -C INPUT -p tcp --dport $P -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport $P -j ACCEPT
  done
  command -v netfilter-persistent >/dev/null && sudo netfilter-persistent save >/dev/null 2>&1 || true
fi

# ---- WhatsApp agent (only once its key is set) ----
sudo mkdir -p "$APP"
sudo rm -rf "$APP"/agent "$APP"/js && sudo tar -xzf /tmp/app.tgz -C "$APP" && rm -f /tmp/app.tgz
sudo install -m 600 -o root -g root /tmp/agp.env /etc/agent-grand-prix.env && rm -f /tmp/agp.env
if sudo grep -q '^WHATSAPP_AGENT_TOKEN=.\+' /etc/agent-grand-prix.env; then
  if [ ! -x "$NODE_DIR/bin/node" ]; then
    NARCH=$([ "$ARCH" = amd64 ] && echo x64 || echo arm64)
    curl -fsSL "https://nodejs.org/dist/$NODE_V/node-$NODE_V-linux-$NARCH.tar.xz" -o /tmp/node.tar.xz
    sudo mkdir -p "$NODE_DIR" && sudo tar -xJf /tmp/node.tar.xz -C "$NODE_DIR" --strip-components=1 && rm -f /tmp/node.tar.xz
  fi
  sudo tee /etc/systemd/system/agent-grand-prix.service >/dev/null <<UNIT
[Unit]
Description=Agent Grand Prix WhatsApp agent
After=network-online.target
Wants=network-online.target
[Service]
EnvironmentFile=/etc/agent-grand-prix.env
ExecStart=$NODE_DIR/bin/node $APP/agent/whatsapp.mjs
WorkingDirectory=$APP
Restart=always
RestartSec=5
DynamicUser=yes
StateDirectory=agp
[Install]
WantedBy=multi-user.target
UNIT
fi

sudo systemctl daemon-reload
sudo /usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
sudo systemctl enable caddy >/dev/null
sudo systemctl is-active --quiet caddy && sudo systemctl reload caddy || sudo systemctl restart caddy
if [ -f /etc/systemd/system/agent-grand-prix.service ]; then
  sudo systemctl enable agent-grand-prix >/dev/null; sudo systemctl restart agent-grand-prix
fi
sleep 3
sudo systemctl is-active caddy
[ -f /etc/systemd/system/agent-grand-prix.service ] && sudo systemctl is-active agent-grand-prix || echo 'WhatsApp agent: waiting for its key'
curl -fsS -o /dev/null http://127.0.0.1/ && echo 'Website answers on the server'
