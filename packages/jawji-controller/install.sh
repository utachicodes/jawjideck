#!/usr/bin/env bash
set -euo pipefail

CONTROLLER_VERSION="0.2.0"
REPO_URL="${JAWJI_REPO_URL:-https://github.com/utachicodes/jawjideck.git}"
REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"
INSTALL_DIR="/opt/jawji-controller"
SERVICE_USER="${SUDO_USER:-$(whoami)}"
CONTROLLER_PORT="${JAWJI_CONTROLLER_PORT:-48400}"
LICENSE_PUBLIC_KEY="${JAWJI_LICENSE_PUBLIC_KEY:-}"
SERVICE_NAME="jawji-controller"
CONF_FILE="/etc/jawji-controller.conf"

echo "================================"
echo "Jawji Controller Installer v${CONTROLLER_VERSION}"
echo "================================"

# Detect architecture (informational — Node/pnpm handle the actual build target)
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH="x64" ;;
  aarch64) ARCH="arm64" ;;
  armv7l)  ARCH="armv7" ;;
  armv6l)
    echo "Unsupported: armv6l (Raspberry Pi 1 / Zero / Compute Module 1)." >&2
    echo "Node.js >= 18, which this controller requires, no longer ships armv6" >&2
    echo "binaries, so the controller can't run on those boards." >&2
    echo "Use a Raspberry Pi 2+ (armv7l) or a Pi 4/5 (arm64) instead." >&2
    exit 1
    ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
echo "Detected: ${OS} ${ARCH}"

if [ "$(id -u)" -ne 0 ]; then
  echo "This installer needs sudo for package installs and the systemd unit. Re-run with sudo."
  exit 1
fi

# Resolve the service user. When run via `sudo bash` from SSH, SUDO_USER is the
# human who invoked sudo; when run directly as root it stays root. The service
# runs as this user so the controller's token lands in a normal user home and
# the `jawji` CLI can read it back.
if [ -z "${SERVICE_USER}" ] || [ "${SERVICE_USER}" = "root" ]; then
  SERVICE_USER="root"
  SERVICE_HOME="/root"
else
  SERVICE_HOME="$(getent passwd "${SERVICE_USER}" | cut -d: -f6)"
  if [ -z "${SERVICE_HOME}" ]; then
    echo "Warning: no home directory for user '${SERVICE_USER}' — falling back to root." >&2
    SERVICE_USER="root"
    SERVICE_HOME="/root"
  fi
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

# Clone or update the repo (idempotent: a second run updates in place and keeps
# the existing pairing token — auth.ts only writes a token when none exists).
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
BUILD_ENV=""
if [ -n "${LICENSE_PUBLIC_KEY}" ]; then
  BUILD_ENV="JAWJI_LICENSE_PUBLIC_KEY='${LICENSE_PUBLIC_KEY}'"
  echo "License key provided — paid features will be enabled after install."
else
  echo "No license key provided — core features work, paid features (AI, modules, cloud) require a key."
  echo "Set JAWJI_LICENSE_PUBLIC_KEY env var before re-running to enable paid features."
fi
BUILD_CMD="cd '${INSTALL_DIR}' && pnpm install --filter @jawji/jawji-controller... && pnpm --filter @jawji/jawji-controller... build"
if [ "${SERVICE_USER}" = "root" ]; then
  if [ -n "${BUILD_ENV}" ]; then
    bash -c "export ${BUILD_ENV}; ${BUILD_CMD}"
  else
    bash -c "${BUILD_CMD}"
  fi
else
  if ! command -v sudo &>/dev/null; then
    echo "sudo is required to build as user '${SERVICE_USER}' but is not installed." >&2
    echo "Install sudo, or run this installer as root (sudo -i bash install.sh)." >&2
    exit 1
  fi
  if [ -n "${BUILD_ENV}" ]; then
    sudo -u "${SERVICE_USER}" bash -c "export ${BUILD_ENV}; ${BUILD_CMD}"
  else
    sudo -u "${SERVICE_USER}" bash -c "${BUILD_CMD}"
  fi
fi

CONTROLLER_ENTRY="${INSTALL_DIR}/packages/jawji-controller/dist/index.js"
if [ ! -f "$CONTROLLER_ENTRY" ]; then
  echo "Build did not produce ${CONTROLLER_ENTRY} — aborting." >&2
  exit 1
fi

# Detect init system and install service
if command -v systemctl &>/dev/null; then
  echo "Detected systemd"
  cat > /etc/systemd/system/${SERVICE_NAME}.service <<SVCEOF
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
Environment=JAWJI_CONTROLLER_PORT=${CONTROLLER_PORT}
Environment=JAWJI_LICENSE_PUBLIC_KEY=${LICENSE_PUBLIC_KEY}

[Install]
WantedBy=multi-user.target
SVCEOF
  systemctl daemon-reload
  systemctl enable ${SERVICE_NAME}
  systemctl restart ${SERVICE_NAME}
  echo "Service installed and started (systemd)"

elif command -v rc-update &>/dev/null; then
  echo "Detected OpenRC"
  cat > /etc/init.d/${SERVICE_NAME} <<RCEOF
#!/sbin/openrc-run
name="${SERVICE_NAME}"
description="Jawji Companion Controller"
command="$(command -v node)"
command_args="${CONTROLLER_ENTRY}"
command_user="${SERVICE_USER}"
command_background=true
pidfile="/run/\${RC_SVCNAME}.pid"
RCEOF
  chmod +x /etc/init.d/${SERVICE_NAME}
  rc-update add ${SERVICE_NAME} default
  rc-service ${SERVICE_NAME} restart
  echo "Service installed and started (OpenRC)"

else
  echo "No systemd or OpenRC detected. Adding cron @reboot entry."
  CRON_LINE="@reboot $(command -v node) ${CONTROLLER_ENTRY}"
  if [ "${SERVICE_USER}" = "root" ]; then
    (crontab -l 2>/dev/null | grep -v ${SERVICE_NAME}; echo "${CRON_LINE}") | crontab -
    nohup node "${CONTROLLER_ENTRY}" &>/dev/null &
  else
    if ! command -v sudo &>/dev/null; then
      echo "sudo is required to start the controller as user '${SERVICE_USER}'." >&2
      exit 1
    fi
    (sudo -u "${SERVICE_USER}" crontab -l 2>/dev/null | grep -v ${SERVICE_NAME}; echo "${CRON_LINE}") | sudo -u "${SERVICE_USER}" crontab -
    nohup sudo -u "${SERVICE_USER}" node "${CONTROLLER_ENTRY}" &>/dev/null &
  fi
  echo "Controller started via cron fallback"
fi

# Install the `jawji` helper CLI (print connection details / manage the service)
CLI_SRC="${INSTALL_DIR}/packages/companion-scripts/jawji-cli.sh"
if [ -f "${CLI_SRC}" ]; then
  install -m 0755 "${CLI_SRC}" /usr/local/bin/jawji
  echo "Installed the 'jawji' helper CLI to /usr/local/bin/jawji"
else
  echo "Warning: jawji-cli.sh not found in repo — skipping the 'jawji' CLI." >&2
fi

# Save the install parameters so `jawji` can find the token, service, and
# installer without needing to re-resolve anything at runtime.
cat > "${CONF_FILE}" <<CONFEOF
JAWJI_CONTROLLER_USER="${SERVICE_USER}"
JAWJI_CONTROLLER_TOKEN_PATH="${SERVICE_HOME}/.jawji-controller/token"
JAWJI_CONTROLLER_PORT="${CONTROLLER_PORT}"
JAWJI_CONTROLLER_VERSION="${CONTROLLER_VERSION}"
JAWJI_CONTROLLER_INSTALL_DIR="${INSTALL_DIR}"
JAWJI_LICENSE_PUBLIC_KEY="${LICENSE_PUBLIC_KEY}"
JAWJI_REPO_URL="${REPO_URL}"
JAWJI_REPO_BRANCH="${REPO_BRANCH}"
CONFEOF

# Read back the pairing token the controller just generated. It's written
# synchronously before the server starts listening, but give it a few
# seconds in case the service is still starting up.
TOKEN=""
TOKEN_PATH="${SERVICE_HOME}/.jawji-controller/token"
for _ in $(seq 1 10); do
  if [ -f "${TOKEN_PATH}" ]; then
    TOKEN="$(cat "${TOKEN_PATH}")"
    break
  fi
  sleep 1
done

# ── Summary (printed on fresh installs AND updates) ────────────────────────

list_ips() {
  if command -v hostname &>/dev/null && hostname -I 2>/dev/null | grep -q .; then
    hostname -I | tr ' ' '\n'
  elif command -v ip &>/dev/null; then
    ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1
  fi
}

print_summary() {
  local host; host="$(hostname)"
  local primary_ip; primary_ip="$(list_ips | head -n1)"
  [ -n "${primary_ip}" ] || primary_ip="<ip>"

  echo ""
  echo "================================================================"
  echo "Jawji Controller v${CONTROLLER_VERSION} is installed and running."
  echo "It starts automatically on boot."
  echo ""
  echo "  Controller URLs (every non-loopback IPv4):"
  if [ -n "$(list_ips)" ]; then
    while IFS= read -r addr; do
      echo "    - http://${addr}:${CONTROLLER_PORT}"
    done <<< "$(list_ips)"
  else
    echo "    - (no non-loopback IPv4 detected — check your network)"
  fi
  echo ""
  echo "  mDNS hostname : ${host}.local"
  echo "  mDNS service  : jawji-controller-${host} on _jawji-controller._tcp"
  echo ""
  if [ -n "${TOKEN}" ]; then
    echo "  Pairing token : ${TOKEN}"
    echo "    ^ Keep this secret — anyone with it can control this device."
  else
    echo "  Pairing token : (not ready yet — fetch it with: sudo jawji token --show)"
  fi
  echo ""
  echo "  Health check  : curl http://${primary_ip}:${CONTROLLER_PORT}/health"
  echo "                   expected: {\"status\":\"ok\"}"
  echo ""
  echo "  Connect from the Jawji desktop app:"
  echo "    1. Open Jawji -> Companion Dashboard"
  echo "    2. Scan for controllers (or add by address: ${primary_ip})"
  echo "    3. Paste the pairing token above and click Connect"
  echo ""
  echo "  On this device, run 'sudo jawji connect' any time to see these steps again."
  echo ""
  echo "  Useful commands:"
  echo "    sudo jawji status       service status + health check"
  echo "    sudo jawji info         IPs, mDNS name, protocol version"
  echo "    sudo jawji token        show the pairing token"
  echo "    sudo jawji logs         follow the controller logs"
  echo "    sudo jawji restart      restart the controller"
  echo "    sudo jawji update       update the controller"
  echo ""
  echo "  System-level:"
  echo "    systemctl status ${SERVICE_NAME}"
  echo "    sudo journalctl -u ${SERVICE_NAME} -f"
  echo ""
  echo "  Reinstall / update:"
  echo "    curl -fsSL https://jawji.space/install.sh | sudo bash"
  echo ""
  if [ -n "${LICENSE_PUBLIC_KEY}" ]; then
    echo "  License: Active (paid features enabled)"
  else
    echo "  License: None (core features only — AI, modules, cloud require a key)"
    echo "    To enable: JAWJI_LICENSE_PUBLIC_KEY=<key> curl -fsSL https://jawji.space/install.sh | sudo bash"
  fi
  echo "================================================================"
}

print_summary
