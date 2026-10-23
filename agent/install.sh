#!/usr/bin/env bash
# Runs on the server (sent by the deploy workflow). Installs Node if needed, unpacks the app and
# runs it as a systemd service that restarts on failure and on reboot.
set -euo pipefail
APP=/opt/agent-grand-prix NODE_DIR=/opt/agp-node NODE_V=v22.11.0
sudo mkdir -p "$APP"
if [ ! -x "$NODE_DIR/bin/node" ]; then
  case "$(uname -m)" in aarch64|arm64) ARCH=arm64 ;; *) ARCH=x64 ;; esac
  curl -fsSL "https://nodejs.org/dist/$NODE_V/node-$NODE_V-linux-$ARCH.tar.xz" -o /tmp/node.tar.xz
  sudo mkdir -p "$NODE_DIR" && sudo tar -xJf /tmp/node.tar.xz -C "$NODE_DIR" --strip-components=1
fi
sudo rm -rf "$APP"/agent "$APP"/js && sudo tar -xzf /tmp/agp-app.tgz -C "$APP"
sudo install -m 600 -o root -g root /tmp/agp.env /etc/agent-grand-prix.env && rm -f /tmp/agp.env /tmp/agp-app.tgz
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
sudo systemctl daemon-reload
sudo systemctl enable agent-grand-prix >/dev/null
sudo systemctl restart agent-grand-prix
sleep 3
sudo systemctl is-active agent-grand-prix && sudo journalctl -u agent-grand-prix -n 5 --no-pager
