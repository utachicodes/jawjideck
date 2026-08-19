#!/usr/bin/env bash
# jawji — helper CLI for the Jawji Controller.
#
# Installed by packages/jawji-controller/install.sh to /usr/local/bin/jawji.
# Prints everything you need to connect this device to the Jawji desktop app.
# Deliberately dependency-light: bash + coreutils + systemctl + curl.
set -u

CONF="/etc/jawji-controller.conf"
[ -f "${CONF}" ] && . "${CONF}"

PORT="${JAWJI_CONTROLLER_PORT:-48400}"
INSTALL_DIR="${JAWJI_CONTROLLER_INSTALL_DIR:-/opt/jawji-controller}"
REPO_URL="${JAWJI_REPO_URL:-https://github.com/utachicodes/jawjideck.git}"
REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"
SERVICE_USER="${JAWJI_CONTROLLER_USER:-}"

if [ -z "${JAWJI_CONTROLLER_TOKEN_PATH:-}" ]; then
  if [ -n "${SERVICE_USER}" ] && [ "${SERVICE_USER}" != "root" ]; then
    JAWJI_CONTROLLER_TOKEN_PATH="$(getent passwd "${SERVICE_USER}" | cut -d: -f6)/.jawji-controller/token"
  else
    JAWJI_CONTROLLER_TOKEN_PATH="${HOME}/.jawji-controller/token"
  fi
fi
TOKEN_PATH="${JAWJI_CONTROLLER_TOKEN_PATH}"

SERVICE_NAME="jawji-controller"

# ── helpers ────────────────────────────────────────────────────────────────

rule() { printf '%*s\n' 72 '' | tr ' ' '='; }

list_ips() {
  if command -v hostname &>/dev/null && hostname -I 2>/dev/null | grep -q .; then
    hostname -I | tr ' ' '\n'
  elif command -v ip &>/dev/null; then
    ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1
  fi
}

primary_ip() {
  local ip; ip="$(list_ips | head -n1)"
  [ -n "${ip}" ] && echo "${ip}" || echo "localhost"
}

health() {
  curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/health" 2>/dev/null || echo "unreachable"
}

agent_info() {
  curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/api/v1/info" 2>/dev/null
}

field() {
  # field "protocolVersion" <json> — single-line curl JSON is expected
  sed -n "s/.*\"$1\": *\"\([^\"]*\)\".*/\1/p"
}

svc() {
  if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo &>/dev/null; then
      sudo systemctl "$@"
    else
      echo "Not running as root and no sudo available — cannot manage the service." >&2
      exit 1
    fi
  else
    systemctl "$@"
  fi
}

journal() {
  if [ "$(id -u)" -ne 0 ] && command -v sudo &>/dev/null; then
    sudo journalctl "$@"
  else
    journalctl "$@"
  fi
}

masked_token() {
  local tok="$1"
  if [ "${#tok}" -gt 8 ]; then
    echo "${tok:0:4}...${tok: -4}"
  else
    echo "********"
  fi
}

read_token() {
  if [ ! -f "${TOKEN_PATH}" ]; then
    echo "Token file not found at ${TOKEN_PATH}." >&2
    echo "Start the controller first (sudo jawji start), then retry." >&2
    exit 1
  fi
  cat "${TOKEN_PATH}"
}

# ── subcommands ────────────────────────────────────────────────────────────

cmd_help() {
  cat <<EOF
Jawji Controller helper — everything needed to connect this device to Jawji.

  sudo jawji status     service status + health check
  sudo jawji info       IPs, mDNS name, URL, protocol version
  sudo jawji token      pairing token (masked; --show for the full token)
  sudo jawji connect    the full "how to pair from the Jawji desktop app" steps
  sudo jawji health     quick health check
  sudo jawji license    show license status (paid features)
  sudo jawji logs       follow the controller logs (journalctl)
  sudo jawji start      start the controller service
  sudo jawji stop       stop the controller service
  sudo jawji restart    restart the controller service
  sudo jawji update     re-run the installer to update the controller
EOF
}

cmd_status() {
  rule
  echo "Jawji Controller status"
  rule
  svc status "${SERVICE_NAME}" --no-pager
  echo ""
  echo "Health: $(health)"
}

cmd_info() {
  local ip protocol agent host
  ip="$(primary_ip)"
  protocol="$(agent_info | field protocolVersion)"
  agent="$(agent_info | field agentVersion)"
  host="$(hostname)"

  rule
  echo "Jawji Controller info"
  rule
  echo "Hostname      : ${host}"
  echo "mDNS name     : ${host}.local  (advertised as jawji-controller-${host} on _jawji-controller._tcp)"
  echo "Controller URL: http://${ip}:${PORT}"
  if [ -n "${protocol}" ]; then
    echo "Protocol      : ${protocol}"
    echo "Agent version : ${agent}"
  else
    echo "Protocol      : (controller not reachable on port ${PORT})"
  fi
  echo ""
  echo "All addresses:"
  if [ -n "$(list_ips)" ]; then
    while IFS= read -r addr; do
      echo "    - http://${addr}:${PORT}"
    done <<< "$(list_ips)"
  else
    echo "    - (no non-loopback IPv4 detected)"
  fi
  echo ""
  echo "Token: run 'sudo jawji token'"
}

cmd_token() {
  local tok
  if ! tok="$(read_token)"; then exit 1; fi
  if [ "${1:-}" = "--show" ] || [ "${1:-}" = "-s" ]; then
    echo "${tok}"
    echo "Treat this as a secret — anyone with it can control this device."
  else
    echo "$(masked_token "${tok}")"
    echo "Run 'sudo jawji token --show' to print the full token."
  fi
}

cmd_health() {
  local h; h="$(health)"
  echo "Health endpoint (http://127.0.0.1:${PORT}/health): ${h}"
  if [ "${h}" = '{"status":"ok"}' ]; then
    echo "Status: OK — the controller is running and healthy."
  else
    echo "Status: UNREACHABLE — is the controller running? Try 'sudo jawji status'."
  fi
}

cmd_license() {
  local key="${JAWJI_LICENSE_PUBLIC_KEY:-}"
  rule
  echo "Jawji Controller license status"
  rule
  if [ -n "${key}" ]; then
    echo "  License key: Embedded (paid features enabled)"
    echo "  Key prefix : ${key:0:20}..."
  else
    echo "  License key: Not set (core features only)"
    echo ""
    echo "  Paid features (AI analysis, Intelligence modules, cloud sync,"
    echo "  companion provisioning, orchestrator) require a license key."
    echo ""
    echo "  To enable, re-install with:"
    echo "    JAWJI_LICENSE_PUBLIC_KEY=<key> curl -fsSL https://jawji.space/install.sh | sudo bash"
  fi
  echo ""
  rule
}

cmd_connect() {
  local ip tok
  ip="$(primary_ip)"
  if ! tok="$(read_token)"; then exit 1; fi
  local host; host="$(hostname)"

  rule
  echo "Connect this device to the Jawji desktop app"
  rule
  echo "  1. Open Jawji and go to the Companion Dashboard."
  echo "  2. Click 'Scan for controllers' — this device should appear as:"
  echo "       ${host}.local  (mDNS, advertised on _jawji-controller._tcp)"
  echo "     ...or add it manually by address."
  echo "  3. Address: ${ip}:${PORT}   (or ${host}.local:${PORT})"
  echo "  4. Pairing token (keep it secret):"
  echo "       ${tok}"
  echo "  5. Paste the token, click Connect, and you're paired."
  echo ""
  echo "Health check:  curl http://${ip}:${PORT}/health"
  echo "Logs:          sudo jawji logs   (or: sudo journalctl -u ${SERVICE_NAME} -f)"
  echo "Status:        sudo jawji status (or: systemctl status ${SERVICE_NAME})"
  echo "Update:        sudo jawji update (or: curl -fsSL https://jawji.space/install.sh | sudo bash)"
  echo ""
  echo "Use 'sudo jawji token --show' to print just the token."
  rule
}

cmd_logs() {
  journal -u "${SERVICE_NAME}" -n 100 --no-pager -f
}

cmd_start()   { svc start "${SERVICE_NAME}"; }
cmd_stop()    { svc stop "${SERVICE_NAME}"; }
cmd_restart() { svc restart "${SERVICE_NAME}"; }

cmd_update() {
  local installer="${INSTALL_DIR}/packages/jawji-controller/install.sh"
  if [ "$(id -u)" -ne 0 ] && ! command -v sudo &>/dev/null; then
    echo "Not running as root and no sudo available — cannot run the installer." >&2
    exit 1
  fi
  if [ -f "${installer}" ]; then
    echo "Re-running the controller installer (${installer})..."
    if [ "$(id -u)" -ne 0 ]; then sudo bash "${installer}"; else bash "${installer}"; fi
  else
    echo "Installer not found at ${installer} — downloading the latest..."
    local url="https://raw.githubusercontent.com/utachicodes/jawjideck/${REPO_BRANCH}/packages/jawji-controller/install.sh"
    if [ "$(id -u)" -ne 0 ]; then
      curl -fsSL "${url}" | sudo bash
    else
      curl -fsSL "${url}" | bash
    fi
  fi
}

# ── dispatch ───────────────────────────────────────────────────────────────

case "${1:-}" in
  status)   shift; cmd_status "$@" ;;
  info)     shift; cmd_info "$@" ;;
  token)    shift; cmd_token "$@" ;;
  connect)  shift; cmd_connect "$@" ;;
  license)  shift; cmd_license "$@" ;;
  health)   shift; cmd_health "$@" ;;
  logs)     shift; cmd_logs "$@" ;;
  start)    shift; cmd_start "$@" ;;
  stop)     shift; cmd_stop "$@" ;;
  restart)  shift; cmd_restart "$@" ;;
  update)   shift; cmd_update "$@" ;;
  help|-h|--help|"") cmd_help ;;
  *)
    echo "Unknown command: $1" >&2
    cmd_help
    exit 1
    ;;
esac
