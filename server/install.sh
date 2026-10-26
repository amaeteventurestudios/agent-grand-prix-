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
# (http://<IP>) redirects to the main domain; with no domain set it serves the game itself.
read -r -a NAMES <<<"$(printf '%s' "${SITE_DOMAIN:-}" | tr ',' ' ')"
GAME='root * '"$WEB"'
	encode zstd gzip
	reverse_proxy /api/radio/* 127.0.0.1:8140
	reverse_proxy /api/me/* 127.0.0.1:8141
	reverse_proxy /auth/novenique/* 127.0.0.1:8141
	reverse_proxy /api/board/* 127.0.0.1:8142
	file_server
	header /assets/* Cache-Control "public, max-age=604800"
	header /vendor/* Cache-Control "public, max-age=604800"
	header /llms.txt Content-Type "text/plain; charset=utf-8"
	header /site.webmanifest Content-Type "application/manifest+json"'
{
  if [ ${#NAMES[@]} -gt 0 ]; then
    # one canonical address: the bare IP sends visitors (and crawlers) to the main domain
    printf ':80 {\n\tredir https://%s{uri} permanent\n}\n' "${NAMES[0]}"
    printf '%s {\n\t%s\n}\n' "${NAMES[0]}" "$GAME"
    for N in "${NAMES[@]:1}"; do printf '%s {\n\tredir https://%s{uri} permanent\n}\n' "$N" "${NAMES[0]}"; done
  else
    printf ':80 {\n\t%s\n}\n' "$GAME"
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
sudo rm -rf "$APP"/agent "$APP"/js "$APP"/server && sudo tar -xzf /tmp/app.tgz -C "$APP" && rm -f /tmp/app.tgz
sudo install -m 600 -o root -g root /tmp/agp.env /etc/agent-grand-prix.env && rm -f /tmp/agp.env
if [ ! -x "$NODE_DIR/bin/node" ]; then
  NARCH=$([ "$ARCH" = amd64 ] && echo x64 || echo arm64)
  curl -fsSL "https://nodejs.org/dist/$NODE_V/node-$NODE_V-linux-$NARCH.tar.xz" -o /tmp/node.tar.xz
  sudo mkdir -p "$NODE_DIR" && sudo tar -xJf /tmp/node.tar.xz -C "$NODE_DIR" --strip-components=1 && rm -f /tmp/node.tar.xz
fi
# the drivers' AI brain talks to Claude through Anthropic's SDK (MIT), installed beside the app
# and speaks through Kokoro (kokoro-js, Apache 2.0); its voice model downloads once into the service's state
SDK_V=1.3.0 KOKORO_V=1.2.1
if ! grep -qs "\"version\": \"$SDK_V\"" "$APP/node_modules/@anthropic-ai/sdk/package.json" || ! grep -qs "\"version\": \"$KOKORO_V\"" "$APP/node_modules/kokoro-js/package.json"; then
  sudo env PATH="$NODE_DIR/bin:$PATH" npm install --prefix "$APP" --no-save --no-audit --no-fund --omit=dev "@anthropic-ai/sdk@$SDK_V" "kokoro-js@$KOKORO_V" >/dev/null 2>&1 || echo 'Could not install the AI brain packages (drivers fall back to the rules brain and recorded clips)'
fi
# ---- team radio interpreter + drivers' AI brain (always runs; each part waits for its key) ----
sudo tee /etc/systemd/system/agp-radio.service >/dev/null <<UNIT
[Unit]
Description=Agent Grand Prix team radio interpreter
After=network-online.target
Wants=network-online.target
[Service]
EnvironmentFile=/etc/agent-grand-prix.env
ExecStart=$NODE_DIR/bin/node $APP/server/radio.mjs
WorkingDirectory=$APP
Environment=HF_CACHE=/var/lib/agp-radio/models
Restart=always
RestartSec=5
DynamicUser=yes
StateDirectory=agp-radio
[Install]
WantedBy=multi-user.target
UNIT
# ---- accounts (always runs; waits for the Novenique client secret) ----
# the service reads the account service's own secret from Novenique Core's client file, so no key
# is ever sent from GitHub; the game's save files live in its own state directory.
if [ -r /etc/novenique/clients/agp.env ]; then sudo chmod 0640 /etc/novenique/clients/agp.env 2>/dev/null || true; fi
sudo tee /etc/systemd/system/agp-accounts.service >/dev/null <<UNIT
[Unit]
Description=Agent Grand Prix accounts (Novenique Core)
After=network-online.target
Wants=network-online.target
[Service]
EnvironmentFile=/etc/agent-grand-prix.env
# Novenique Core puts this game's client id and secret here when Core is installed on this server
# (core/deploy/install.sh); until then the service runs and answers { accounts: false }.
EnvironmentFile=-/etc/novenique/clients/agp.env
ExecStart=$NODE_DIR/bin/node $APP/server/accounts.mjs
WorkingDirectory=$APP
Environment=SAVE_DIR=/var/lib/agp-accounts
Restart=always
RestartSec=5
DynamicUser=yes
StateDirectory=agp-accounts
[Install]
WantedBy=multi-user.target
UNIT

# ---- leaderboards (checks every submitted Daily by replaying it with the game's own engine) ----
sudo tee /etc/systemd/system/agp-board.service >/dev/null <<UNIT
[Unit]
Description=Agent Grand Prix leaderboards
After=network-online.target
Wants=network-online.target
[Service]
EnvironmentFile=/etc/agent-grand-prix.env
# the same client secret signs the session cookie the accounts service sets, so a board knows who you are
EnvironmentFile=-/etc/novenique/clients/agp.env
ExecStart=$NODE_DIR/bin/node $APP/server/leaders.mjs
WorkingDirectory=$APP
Environment=BOARD_DIR=/var/lib/agp-board
Restart=always
RestartSec=5
DynamicUser=yes
StateDirectory=agp-board
[Install]
WantedBy=multi-user.target
UNIT

if sudo grep -q '^WHATSAPP_AGENT_TOKEN=.\+' /etc/agent-grand-prix.env; then
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
sudo systemctl enable agp-radio >/dev/null; sudo systemctl restart agp-radio
if [ -f /etc/systemd/system/agent-grand-prix.service ]; then
  sudo systemctl enable agent-grand-prix >/dev/null; sudo systemctl restart agent-grand-prix
fi
sleep 3
sudo systemctl is-active caddy
sudo systemctl enable agp-accounts >/dev/null && sudo systemctl restart agp-accounts
sleep 1; curl -fsS http://127.0.0.1:8141/api/me/health && echo ' <- accounts (false until the Novenique secret is set)' || echo 'Accounts service not answering yet'
sudo systemctl enable agp-board >/dev/null && sudo systemctl restart agp-board
sleep 1; curl -fsS http://127.0.0.1:8142/api/board/health && echo ' <- leaderboards' || echo 'Leaderboard service not answering yet'
[ -f /etc/systemd/system/agent-grand-prix.service ] && sudo systemctl is-active agent-grand-prix || echo 'WhatsApp agent: waiting for its key'
curl -fsS -o /dev/null http://127.0.0.1/ && echo 'Website answers on the server'
curl -fsS http://127.0.0.1:8140/api/radio/health && echo ' <- team radio (interpreter = Jev, brain = drivers AI)' || echo 'Team radio interpreter not answering yet'
