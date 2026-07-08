#!/usr/bin/env bash
# Jawji Companion: Autonomous Mission Runner
# Python + MAVSDK environment, mavlink-router, example mission scripts,
# and the Jawji Agent. Boot services start mavlink-router and the agent only —
# NOT any mission script, since auto-arming/flying on boot without an operator
# present would be a safety hazard. You run mission scripts by hand (or wire
# your own supervised trigger) once the environment is ready.
set -euo pipefail

FC_SERIAL_DEV="${FC_SERIAL_DEV:-/dev/serial0}"
FC_BAUD="${FC_BAUD:-57600}"
MAVROUTER_UDP_PORT="${MAVROUTER_UDP_PORT:-14550}"
MAVSDK_UDP_PORT="${MAVSDK_UDP_PORT:-14540}"
AUTONOMY_DIR="${AUTONOMY_DIR:-/opt/jawji-autonomy}"
SERVICE_USER="${SUDO_USER:-$(whoami)}"
JAWJI_REPO_URL="${JAWJI_REPO_URL:-https://github.com/utachicodes/jawjideck.git}"
JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash pi-autonomy.sh" >&2
  exit 1
fi

echo "================================"
echo "Jawji Autonomous Mission Runner Installer"
echo "================================"

apt-get update -qq
apt-get install -y -qq git build-essential pkg-config ninja-build meson \
  python3 python3-venv python3-pip libsystemd-dev >/dev/null

# ── 1. mavlink-router: FC serial -> UDP for both the GCS and MAVSDK locally ──
if ! command -v mavlink-routerd &>/dev/null; then
  echo "Building mavlink-router..."
  BUILD_DIR="$(mktemp -d)"
  git clone --depth 1 https://github.com/mavlink-router/mavlink-router.git "${BUILD_DIR}"
  git -C "${BUILD_DIR}" submodule update --init --recursive
  meson setup "${BUILD_DIR}/build" "${BUILD_DIR}" >/dev/null
  ninja -C "${BUILD_DIR}/build" >/dev/null
  ninja -C "${BUILD_DIR}/build" install >/dev/null
  rm -rf "${BUILD_DIR}"
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

[UdpEndpoint mavsdk]
Mode = Server
Address = 127.0.0.1
Port = ${MAVSDK_UDP_PORT}
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

# ── 2. Python + MAVSDK environment ──
mkdir -p "${AUTONOMY_DIR}/scripts"
python3 -m venv "${AUTONOMY_DIR}/venv"
"${AUTONOMY_DIR}/venv/bin/pip" install --quiet --upgrade pip
"${AUTONOMY_DIR}/venv/bin/pip" install --quiet mavsdk

cat > "${AUTONOMY_DIR}/scripts/position_check.py" <<'PYEOF'
"""Example: connect and print live position telemetry. Read-only — safe to
run any time, doesn't arm or move the vehicle. Use this as a starting point
for your own mission logic (e.g. gate an action on distance-to-fence)."""
import asyncio
from mavsdk import System

async def main():
    drone = System()
    await drone.connect(system_address="udp://:14540")
    print("Waiting for vehicle connection...")
    async for state in drone.core.connection_state():
        if state.is_connected:
            print("Connected.")
            break
    async for position in drone.telemetry.position():
        print(f"lat={position.latitude_deg:.6f} lon={position.longitude_deg:.6f} "
              f"rel_alt={position.relative_altitude_m:.1f}m")

if __name__ == "__main__":
    asyncio.run(main())
PYEOF

cat > "${AUTONOMY_DIR}/scripts/README.md" <<'MDEOF'
# Jawji Autonomy Scripts

`geofence_check.py` is a read-only example — connects and prints state,
doesn't arm or command the vehicle. Use it to confirm the MAVSDK connection
works, then build your own mission logic from there.

Run manually:
    /opt/jawji-autonomy/venv/bin/python /opt/jawji-autonomy/scripts/your_script.py

There is deliberately no boot-time service that runs mission scripts
automatically — arming/flying without an operator present is a safety
hazard. Wire up your own supervised trigger (a physical switch, an
authenticated remote command, etc.) if you want unattended-but-controlled
starts.
MDEOF

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${AUTONOMY_DIR}"
echo "MAVSDK environment ready at ${AUTONOMY_DIR} (connect to udp://:${MAVSDK_UDP_PORT})"
echo "Example script: ${AUTONOMY_DIR}/scripts/position_check.py"

# ── 3. Jawji Agent ──
echo "Installing Jawji Agent..."
curl -fsSL "https://raw.githubusercontent.com/utachicodes/jawjideck/${JAWJI_REPO_BRANCH}/packages/jawji-agent/install.sh" | \
  JAWJI_REPO_URL="${JAWJI_REPO_URL}" JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH}" bash

echo ""
echo "================================"
echo "Autonomy environment setup complete."
echo "No mission script runs automatically on boot (by design — see"
echo "${AUTONOMY_DIR}/scripts/README.md)."
echo "================================"
