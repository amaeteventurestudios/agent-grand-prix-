#!/usr/bin/env bash
# One SpacetimeDB for every game on this server (see spacetime/README.md). Safe to run again: it installs once,
# then only publishes module updates. Run by .github/workflows/spacetime.yml with the modules in /tmp/stdb-modules.
set -euo pipefail
GAMES="${GAMES:-agp palasora}"
PORT=3010
ROOT=/stdb
NODE_DIR=/opt/agp-node
SITE="${STDB_SITE:-spacetime.129-146-26-28.sslip.io}"

# 1. the program, its own system user, data in /stdb
if ! id spacetimedb >/dev/null 2>&1; then sudo useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin spacetimedb; fi
sudo mkdir -p "$ROOT" && sudo chown -R spacetimedb:spacetimedb "$ROOT"
if [ ! -x "$ROOT/spacetime" ]; then
  curl -sSf https://install.spacetimedb.com -o /tmp/stdb-install.sh
  sudo -u spacetimedb HOME="$ROOT" sh /tmp/stdb-install.sh --root-dir "$ROOT" --yes
fi

# 2. a service that only listens on this machine; Caddy decides what the outside can reach
sudo tee /etc/systemd/system/spacetimedb.service >/dev/null <<UNIT
[Unit]
Description=SpacetimeDB (one server, a database per game)
After=network.target
[Service]
ExecStart=$ROOT/spacetime --root-dir=$ROOT start --listen-addr=127.0.0.1:$PORT
Restart=always
User=spacetimedb
Environment=HOME=$ROOT
WorkingDirectory=$ROOT
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now spacetimedb
sudo systemctl restart spacetimedb
for i in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/v1/ping" >/dev/null && break; sleep 1; done

# 3. the owner: this server's own login publishes every game's database, so it owns them all
ST() { sudo -u spacetimedb HOME="$ROOT" PATH="$NODE_DIR/bin:$PATH" "$ROOT/spacetime" --root-dir="$ROOT" "$@"; }
ST server add --url "http://127.0.0.1:$PORT" --no-fingerprint home 2>/dev/null || true
ST server set-default home
ST login --server-issued-login home >/dev/null

# 4. publish each game into its own database (updates keep the data)
for g in $GAMES; do
  sudo rm -rf "$ROOT/modules/$g" && sudo mkdir -p "$ROOT/modules" && sudo cp -r "/tmp/stdb-modules/$g" "$ROOT/modules/$g"
  sudo chown -R spacetimedb:spacetimedb "$ROOT/modules"
  ( cd "$ROOT/modules/$g" && sudo -u spacetimedb HOME="$ROOT" PATH="$NODE_DIR/bin:$PATH" npm install --silent --no-audit --no-fund --ignore-scripts )
  ST publish --server home --module-path "$ROOT/modules/$g" --yes "$g"
done

# 5. outside access: only a game's live connection and new player identities. Publishing, SQL and deletes stay local.
sudo mkdir -p /etc/caddy/sites
sudo tee /etc/caddy/sites/spacetime.caddy >/dev/null <<CADDY
$SITE {
	@open path_regexp open ^/v1/(identity(/.*)?|database/[a-z0-9-]+/subscribe|ping)$
	handle @open {
		reverse_proxy 127.0.0.1:$PORT
	}
	respond 403
}
CADDY
sudo caddy validate --config /etc/caddy/Caddyfile >/dev/null && sudo systemctl reload caddy

echo "== SpacetimeDB $(ST --version 2>/dev/null | head -1)"
for g in $GAMES; do echo "== $g"; ST sql --server home "$g" "SELECT * FROM $( [ "$g" = agp ] && echo lobby || echo pulse )" || true; done
