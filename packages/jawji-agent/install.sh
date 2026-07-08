#!/usr/bin/env bash
set -euo pipefail

AGENT_VERSION="0.1.0"
REPO_URL="${JAWJI_REPO_URL:-https://github.com/utachicodes/jawjideck.git}"
REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"
INSTALL_DIR="/opt/jawji-agent"
SERVICE_USER="${SUDO_USER:-$(whoami)}"

echo "================================"
echo "Jawji Agent Installer v${AGENT_VERSION}"
echo "================================"

# Detect architecture (informational — Node/pnpm handle the actual build target)
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  ARCH="x64" ;;
  aarch64) ARCH="arm64" ;;
  armv7l)  ARCH="armv7" ;;
  *)       echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
echo "Detected: ${OS} ${ARCH}"

if [ "$(id -u)" -ne 0 ]; then
  echo "This installer needs sudo for package installs and the systemd unit. Re-run with sudo."
  exit 1
fi

# Install build prerequisites
if command -v apt-get &>/dev/null; then
  echo "Installing prerequisites (build-essential, python3, git, curl)..."
  apt-get update -qq
  apt-get install -y -qq build-essential python3 git curl >/dev/null
fi

if ! command -v node &>/dev/null; then
  echo "Installing Node.js LTS..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

if ! command -v pnpm &>/dev/null; then
  echo "Installing pnpm..."
  npm install -g pnpm >/dev/null
fi

# Clone or update the repo
if [ -d "${INSTALL_DIR}/.git" ]; then
  echo "Updating existing checkout at ${INSTALL_DIR}..."
  git -C "${INSTALL_DIR}" fetch --depth 1 origin "${REPO_BRANCH}"
  git -C "${INSTALL_DIR}" reset --hard "origin/${REPO_BRANCH}"
else
  echo "Cloning ${REPO_URL} (${REPO_BRANCH}) to ${INSTALL_DIR}..."
  rm -rf "${INSTALL_DIR}"
  git clone --depth 1 --branch "${REPO_BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}"

# Install deps and build just the agent + its workspace dependencies
echo "Installing dependencies and building jawji-agent (this can take a few minutes)..."
sudo -u "${SERVICE_USER}" bash -c "cd '${INSTALL_DIR}' && pnpm install --filter @jawji/jawji-agent... && pnpm --filter @jawji/jawji-agent build"

AGENT_ENTRY="${INSTALL_DIR}/packages/jawji-agent/dist/index.js"
if [ ! -f "$AGENT_ENTRY" ]; then
  echo "Build did not produce ${AGENT_ENTRY} — aborting."
  exit 1
fi

# Detect init system and install service
if command -v systemctl &>/dev/null; then
  echo "Detected systemd"
  cat > /etc/systemd/system/jawji-agent.service <<SVCEOF
[Unit]
Description=Jawji Companion Agent
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}/packages/jawji-agent
ExecStart=$(command -v node) ${AGENT_ENTRY}
Restart=always
RestartSec=5
Environment=JAWJI_AGENT_PORT=48400

[Install]
WantedBy=multi-user.target
SVCEOF
  systemctl daemon-reload
  systemctl enable jawji-agent
  systemctl restart jawji-agent
  echo "Service installed and started (systemd)"

elif command -v rc-update &>/dev/null; then
  echo "Detected OpenRC"
  cat > /etc/init.d/jawji-agent <<RCEOF
#!/sbin/openrc-run
name="jawji-agent"
description="Jawji Companion Agent"
command="$(command -v node)"
command_args="${AGENT_ENTRY}"
command_user="${SERVICE_USER}"
command_background=true
pidfile="/run/\${RC_SVCNAME}.pid"
RCEOF
  chmod +x /etc/init.d/jawji-agent
  rc-update add jawji-agent default
  rc-service jawji-agent restart
  echo "Service installed and started (OpenRC)"

else
  echo "No systemd or OpenRC detected. Adding cron @reboot entry."
  (sudo -u "${SERVICE_USER}" crontab -l 2>/dev/null | grep -v jawji-agent; echo "@reboot $(command -v node) ${AGENT_ENTRY}") | sudo -u "${SERVICE_USER}" crontab -
  nohup sudo -u "${SERVICE_USER}" node "${AGENT_ENTRY}" &>/dev/null &
  echo "Agent started via cron fallback"
fi

echo ""
echo "================================"
echo "Installation complete!"
echo "Agent will start automatically on boot."
echo ""
echo "To see your pairing token:"
echo "  journalctl -u jawji-agent | grep 'Pairing token'"
echo "================================"
