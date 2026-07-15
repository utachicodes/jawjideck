#!/usr/bin/env bash
set -euo pipefail

CONTROLLER_VERSION="0.1.0"
REPO_URL="${JAWJI_REPO_URL:-https://github.com/utachicodes/jawjideck.git}"
REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"
INSTALL_DIR="/opt/jawji-controller"
SERVICE_USER="${SUDO_USER:-$(whoami)}"

echo "================================"
echo "Jawji Controller Installer v${CONTROLLER_VERSION}"
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

# Install deps and build the controller + its workspace dependencies (the
# trailing "..." on both the install and build filters matters: it pulls in
# @jawji/companion-types too, and pnpm builds matched packages in dependency
# order, so companion-types' dist/ exists before jawji-controller needs it).
echo "Installing dependencies and building jawji-controller (this can take a few minutes)..."
sudo -u "${SERVICE_USER}" bash -c "cd '${INSTALL_DIR}' && pnpm install --filter @jawji/jawji-controller... && pnpm --filter @jawji/jawji-controller... build"

CONTROLLER_ENTRY="${INSTALL_DIR}/packages/jawji-controller/dist/index.js"
if [ ! -f "$CONTROLLER_ENTRY" ]; then
  echo "Build did not produce ${CONTROLLER_ENTRY} — aborting."
  exit 1
fi

# Detect init system and install service
if command -v systemctl &>/dev/null; then
  echo "Detected systemd"
  cat > /etc/systemd/system/jawji-controller.service <<SVCEOF
[Unit]
Description=Jawji Companion Controller
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}/packages/jawji-controller
ExecStart=$(command -v node) ${CONTROLLER_ENTRY}
Restart=always
RestartSec=5
Environment=JAWJI_CONTROLLER_PORT=48400

[Install]
WantedBy=multi-user.target
SVCEOF
  systemctl daemon-reload
  systemctl enable jawji-controller
  systemctl restart jawji-controller
  echo "Service installed and started (systemd)"

elif command -v rc-update &>/dev/null; then
  echo "Detected OpenRC"
  cat > /etc/init.d/jawji-controller <<RCEOF
#!/sbin/openrc-run
name="jawji-controller"
description="Jawji Companion Controller"
command="$(command -v node)"
command_args="${CONTROLLER_ENTRY}"
command_user="${SERVICE_USER}"
command_background=true
pidfile="/run/\${RC_SVCNAME}.pid"
RCEOF
  chmod +x /etc/init.d/jawji-controller
  rc-update add jawji-controller default
  rc-service jawji-controller restart
  echo "Service installed and started (OpenRC)"

else
  echo "No systemd or OpenRC detected. Adding cron @reboot entry."
  (sudo -u "${SERVICE_USER}" crontab -l 2>/dev/null | grep -v jawji-controller; echo "@reboot $(command -v node) ${CONTROLLER_ENTRY}") | sudo -u "${SERVICE_USER}" crontab -
  nohup sudo -u "${SERVICE_USER}" node "${CONTROLLER_ENTRY}" &>/dev/null &
  echo "Controller started via cron fallback"
fi

# Read back the pairing token the controller just generated. It's written
# synchronously before the server starts listening, but give it a few
# seconds in case the service is still starting up.
SERVICE_HOME="$(getent passwd "${SERVICE_USER}" | cut -d: -f6)"
TOKEN=""
if [ -n "${JAWJI_CONTROLLER_TOKEN_PATH:-}" ] || [ -n "${SERVICE_HOME}" ]; then
  TOKEN_PATH="${JAWJI_CONTROLLER_TOKEN_PATH:-${SERVICE_HOME}/.jawji-controller/token}"
  for _ in $(seq 1 10); do
    if [ -f "${TOKEN_PATH}" ]; then
      TOKEN="$(cat "${TOKEN_PATH}")"
      break
    fi
    sleep 1
  done
fi

CONTROLLER_PORT="${JAWJI_CONTROLLER_PORT:-48400}"
CONTROLLER_IP="$(hostname -I | awk '{print $1}')"

echo ""
echo "================================"
echo "Installation complete!"
echo "Controller will start automatically on boot."
echo ""
echo "Controller: http://${CONTROLLER_IP}:${CONTROLLER_PORT}"
if [ -n "${TOKEN}" ]; then
  echo "Pairing token: ${TOKEN}"
  echo "Enter this IP and token in Jawji to connect."
else
  echo "Pairing token not ready yet -- fetch it with:"
  echo "  journalctl -u jawji-controller | grep 'Pairing token'"
fi
echo "================================"
