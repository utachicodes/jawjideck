#!/usr/bin/env bash
# Jawji Companion: Computer Vision Companion (Jetson)
# YOLO object detection (GPU via TensorRT/CUDA already provided by JetPack),
# MAVSDK, a camera pipeline, and the Jawji Agent.
#
# Prerequisite: a Jetson Nano or Orin Nano already flashed and booted with
# NVIDIA JetPack (L4T) — this script does not (and cannot) install JetPack
# itself. It checks for it and exits if not found.
set -euo pipefail

MAVROUTER_UDP_PORT="${MAVROUTER_UDP_PORT:-14550}"
MAVSDK_UDP_PORT="${MAVSDK_UDP_PORT:-14540}"
FC_SERIAL_DEV="${FC_SERIAL_DEV:-/dev/ttyTHS1}"
FC_BAUD="${FC_BAUD:-57600}"
CV_DIR="${CV_DIR:-/opt/jawji-cv}"
SERVICE_USER="${SUDO_USER:-$(whoami)}"
WITH_ROS2="${WITH_ROS2:-0}"
JAWJI_REPO_URL="${JAWJI_REPO_URL:-https://github.com/utachicodes/jawjideck.git}"
JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash jetson-cv.sh" >&2
  exit 1
fi

echo "================================"
echo "Jawji Jetson CV Companion Installer"
echo "================================"

if [ ! -f /etc/nv_tegra_release ]; then
  echo "This doesn't look like a JetPack/L4T system (/etc/nv_tegra_release" >&2
  echo "not found). Flash your Jetson with JetPack first, then re-run this" >&2
  echo "script. Aborting." >&2
  exit 1
fi
echo "Detected L4T: $(cat /etc/nv_tegra_release)"

if ! command -v nvcc &>/dev/null && [ ! -d /usr/local/cuda ]; then
  echo "Warning: CUDA toolkit not found at /usr/local/cuda. YOLO inference" >&2
  echo "will fall back to CPU, which is far too slow for real-time use." >&2
fi

apt-get update -qq
apt-get install -y -qq git python3-pip python3-venv gstreamer1.0-tools \
  gstreamer1.0-plugins-good gstreamer1.0-plugins-bad build-essential \
  pkg-config ninja-build meson libsystemd-dev >/dev/null

# ── 1. Python environment: MAVSDK + Ultralytics YOLO ──
mkdir -p "${CV_DIR}/scripts"
python3 -m venv --system-site-packages "${CV_DIR}/venv"
"${CV_DIR}/venv/bin/pip" install --quiet --upgrade pip
"${CV_DIR}/venv/bin/pip" install --quiet mavsdk ultralytics opencv-python-headless

cat > "${CV_DIR}/scripts/detect.py" <<'PYEOF'
"""Example: run YOLO object detection on the CSI/USB camera and print
detections. GPU-accelerated automatically if a CUDA-enabled torch build is
present (Ultralytics picks it up on its own on Jetson). Doesn't connect to
the flight controller or command the vehicle — wire that up yourself once
you've confirmed detection works."""
import cv2
from ultralytics import YOLO

def main():
    model = YOLO("yolo11n.pt")  # downloads on first run
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise SystemExit("Could not open camera device 0")
    print("Running detection, Ctrl+C to stop...")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        results = model(frame, verbose=False)
        for r in results:
            for box in r.boxes:
                cls = model.names[int(box.cls[0])]
                conf = float(box.conf[0])
                print(f"{cls}: {conf:.2f}")

if __name__ == "__main__":
    main()
PYEOF

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${CV_DIR}"
echo "CV environment ready at ${CV_DIR} (example: ${CV_DIR}/scripts/detect.py)"

if [ "${WITH_ROS2}" = "1" ]; then
  echo "WITH_ROS2=1 set, but ROS2 install is not automated by this script —"
  echo "follow https://docs.ros.org/ for your JetPack's supported ROS2 distro."
fi

# ── 2. mavlink-router: FC serial -> UDP for GCS + MAVSDK ──
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
echo "mavlink-router running: ${FC_SERIAL_DEV} <-> UDP :${MAVROUTER_UDP_PORT} (GCS) / :${MAVSDK_UDP_PORT} (local MAVSDK)"

# ── 3. Jawji Agent ──
echo "Installing Jawji Agent..."
curl -fsSL "https://raw.githubusercontent.com/utachicodes/jawjideck/${JAWJI_REPO_BRANCH}/packages/jawji-agent/install.sh" | \
  JAWJI_REPO_URL="${JAWJI_REPO_URL}" JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH}" bash

echo ""
echo "================================"
echo "Jetson CV Companion setup complete."
echo "No detection/mission script runs automatically on boot — run"
echo "${CV_DIR}/scripts/detect.py manually to confirm it works first."
echo "================================"
