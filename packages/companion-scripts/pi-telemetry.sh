#!/usr/bin/env bash
# Jawji Companion: Telemetry Bridge
# mavlink-router + WiFi AP + Jawji Agent, as boot services on a Raspberry Pi.
set -euo pipefail

FC_SERIAL_DEV="${FC_SERIAL_DEV:-/dev/serial0}"
FC_BAUD="${FC_BAUD:-57600}"
MAVROUTER_UDP_PORT="${MAVROUTER_UDP_PORT:-14550}"
AP_SSID="${AP_SSID:-Jawji-$(hostname)}"
AP_PASSWORD="${AP_PASSWORD:-}"
AP_IFACE="${AP_IFACE:-wlan0}"
JAWJI_REPO_URL="${JAWJI_REPO_URL:-https://github.com/utachicodes/jawjideck.git}"
JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash pi-telemetry.sh" >&2
  exit 1
fi

echo "================================"
echo "Jawji Telemetry Bridge Installer"
echo "================================"
echo "FC serial device: ${FC_SERIAL_DEV} @ ${FC_BAUD} baud"
echo "mavlink-router UDP broadcast port: ${MAVROUTER_UDP_PORT}"
echo ""
echo "Override any of FC_SERIAL_DEV, FC_BAUD, MAVROUTER_UDP_PORT, AP_SSID,"
echo "AP_PASSWORD, AP_IFACE as environment variables if the defaults don't fit."
echo ""

apt-get update -qq
apt-get install -y -qq git build-essential pkg-config ninja-build meson \
  python3 python3-pip libsystemd-dev network-manager >/dev/null

# ── 1. mavlink-router (built from source — no prebuilt package for arm64/armhf) ──
if ! command -v mavlink-routerd &>/dev/null; then
  echo "Building mavlink-router..."
  BUILD_DIR="$(mktemp -d)"
  git clone --depth 1 https://github.com/mavlink-router/mavlink-router.git "${BUILD_DIR}"
  git -C "${BUILD_DIR}" submodule update --init --recursive
  meson setup "${BUILD_DIR}/build" "${BUILD_DIR}" >/dev/null
  ninja -C "${BUILD_DIR}/build" >/dev/null
  ninja -C "${BUILD_DIR}/build" install >/dev/null
  rm -rf "${BUILD_DIR}"
else
  echo "mavlink-router already installed, skipping build."
fi

mkdir -p /etc/mavlink-router
cat > /etc/mavlink-router/main.conf <<CONF
[General]
TcpServerPort = 5760
ReportStats = false

[UartEndpoint fc]
Device = ${FC_SERIAL_DEV}
Baud = ${FC_BAUD}

[UdpEndpoint gcs]
Mode = Server
Address = 0.0.0.0
Port = ${MAVROUTER_UDP_PORT}
CONF

cat > /etc/systemd/system/mavlink-router.service <<SVCEOF
[Unit]
Description=mavlink-router
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/mavlink-routerd -c /etc/mavlink-router/main.conf
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable mavlink-router >/dev/null
systemctl restart mavlink-router
echo "mavlink-router running: FC serial <-> UDP :${MAVROUTER_UDP_PORT} (any GCS on the AP can connect)"

# ── 2. WiFi access point via NetworkManager (default on Raspberry Pi OS Bookworm+) ──
if command -v nmcli &>/dev/null; then
  if [ -z "${AP_PASSWORD}" ]; then
    AP_PASSWORD="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 12)"
    echo "No AP_PASSWORD given — generated one: ${AP_PASSWORD}"
  fi
  nmcli connection delete Jawji-Hotspot >/dev/null 2>&1 || true
  nmcli device wifi hotspot ifname "${AP_IFACE}" con-name Jawji-Hotspot ssid "${AP_SSID}" password "${AP_PASSWORD}"
  nmcli connection modify Jawji-Hotspot connection.autoconnect yes
  echo "WiFi AP up: SSID '${AP_SSID}', password '${AP_PASSWORD}' (save this)"
else
  echo "NetworkManager (nmcli) not found — skipping WiFi AP setup." >&2
  echo "On older Raspberry Pi OS (pre-Bookworm) you'll need hostapd + dnsmasq instead; not scripted here." >&2
fi

# ── 3. Jawji Agent ──
echo "Installing Jawji Agent..."
curl -fsSL "https://raw.githubusercontent.com/utachicodes/jawjideck/${JAWJI_REPO_BRANCH}/packages/jawji-agent/install.sh" | \
  JAWJI_REPO_URL="${JAWJI_REPO_URL}" JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH}" bash

echo ""
echo "================================"
echo "Telemetry Bridge setup complete."
echo "Connect your GCS to this Pi's AP, then UDP :${MAVROUTER_UDP_PORT}."
echo "Jawji Agent pairing token: journalctl -u jawji-agent | grep 'Pairing token'"
echo "================================"
