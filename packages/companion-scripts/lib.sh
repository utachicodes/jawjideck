#!/usr/bin/env bash
# Shared install functions for Jawji companion provisioning. Sourced by
# install.sh, the one-script installer for every companion template
# (Telemetry Bridge, Video + Telemetry, Autonomous Mission Runner, Computer
# Vision Companion) via its basic/vision/ai profiles and WITH_* flags. Not
# meant to be run directly.

JAWJI_REPO_URL="${JAWJI_REPO_URL:-https://github.com/utachicodes/jawjideck.git}"
JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"
JAWJI_RAW_BASE="https://raw.githubusercontent.com/utachicodes/jawjideck/${JAWJI_REPO_BRANCH}"

# ── Jawji Controller ─────────────────────────────────────────────────────
install_controller() {
  echo "── Installing Jawji Controller ──"
  curl -fsSL "${JAWJI_RAW_BASE}/packages/jawji-controller/install.sh" | \
    JAWJI_REPO_URL="${JAWJI_REPO_URL}" JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH}" bash
}

# ── mavlink-router (built from source; no prebuilt arm64/armhf package) ──
install_mavlink_router() {
  local fc_dev="${FC_SERIAL_DEV:-/dev/serial0}"
  local fc_baud="${FC_BAUD:-57600}"
  local udp_port="${MAVROUTER_UDP_PORT:-14550}"
  local mavsdk_port="${MAVSDK_UDP_PORT:-}"

  echo "── Installing mavlink-router (${fc_dev} @ ${fc_baud} <-> UDP :${udp_port}) ──"
  apt-get install -y -qq git build-essential pkg-config ninja-build meson libsystemd-dev >/dev/null

  if ! command -v mavlink-routerd &>/dev/null; then
    local build_dir; build_dir="$(mktemp -d)"
    git clone --depth 1 https://github.com/mavlink-router/mavlink-router.git "${build_dir}"
    git -C "${build_dir}" submodule update --init --recursive
    meson setup "${build_dir}/build" "${build_dir}" >/dev/null
    ninja -C "${build_dir}/build" >/dev/null
    ninja -C "${build_dir}/build" install >/dev/null
    rm -rf "${build_dir}"
  fi

  mkdir -p /etc/mavlink-router
  {
    echo "[General]"
    echo "TcpServerPort = 5760"
    echo "ReportStats = false"
    echo ""
    echo "[UartEndpoint fc]"
    echo "Device = ${fc_dev}"
    echo "Baud = ${fc_baud}"
    echo ""
    echo "[UdpEndpoint gcs]"
    echo "Mode = Server"
    echo "Address = 0.0.0.0"
    echo "Port = ${udp_port}"
    if [ -n "${mavsdk_port}" ]; then
      echo ""
      echo "[UdpEndpoint mavsdk]"
      echo "Mode = Server"
      echo "Address = 127.0.0.1"
      echo "Port = ${mavsdk_port}"
    fi
  } > /etc/mavlink-router/main.conf

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
  echo "mavlink-router running: ${fc_dev} <-> UDP :${udp_port}$([ -n "${mavsdk_port}" ] && echo " (GCS) / :${mavsdk_port} (local MAVSDK)")"
}

# ── WiFi AP via NetworkManager (default on Raspberry Pi OS Bookworm+) ──
install_wifi_ap() {
  local ssid="${AP_SSID:-Jawji-$(hostname)}"
  local password="${AP_PASSWORD:-}"
  local iface="${AP_IFACE:-wlan0}"

  echo "── Setting up WiFi AP (${ssid} on ${iface}) ──"
  apt-get install -y -qq network-manager >/dev/null

  if ! command -v nmcli &>/dev/null; then
    echo "NetworkManager (nmcli) not found — skipping WiFi AP setup." >&2
    echo "On older Raspberry Pi OS (pre-Bookworm) you'll need hostapd + dnsmasq instead; not scripted here." >&2
    return 1
  fi

  if [ -z "${password}" ]; then
    password="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 12)"
    echo "No AP_PASSWORD given — generated one: ${password}"
  fi
  nmcli connection delete Jawji-Hotspot >/dev/null 2>&1 || true
  nmcli device wifi hotspot ifname "${iface}" con-name Jawji-Hotspot ssid "${ssid}" password "${password}"
  nmcli connection modify Jawji-Hotspot connection.autoconnect yes
  echo "WiFi AP up: SSID '${ssid}', password '${password}' (save this)"
}

# ── mjpg-streamer: drives Jawji's Camera panel today (MJPEG-only) ──
install_mjpg_streamer() {
  local camera_dev="${CAMERA_DEVICE:-/dev/video0}"
  local mjpeg_port="${MJPEG_PORT:-8080}"

  echo "── Installing mjpg-streamer (Jawji Camera panel, MJPEG on :${mjpeg_port}) ──"
  apt-get install -y -qq git build-essential cmake libjpeg-dev imagemagick libv4l-dev >/dev/null

  if ! command -v mjpg_streamer &>/dev/null; then
    local build_dir; build_dir="$(mktemp -d)"
    git clone --depth 1 https://github.com/jacksonliam/mjpg-streamer.git "${build_dir}"
    (cd "${build_dir}/mjpg-streamer-experimental" && make >/dev/null && make install >/dev/null)
    rm -rf "${build_dir}"
  fi

  cat > /etc/systemd/system/jawji-mjpg-streamer.service <<SVCEOF
[Unit]
Description=Jawji MJPEG camera stream (for Camera panel)
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/mjpg_streamer -i "input_uvc.so -d ${camera_dev} -r 1280x720 -f 30" -o "output_http.so -p ${mjpeg_port} -w /usr/local/share/mjpg-streamer/www"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

  systemctl daemon-reload
  systemctl enable jawji-mjpg-streamer >/dev/null
  systemctl restart jawji-mjpg-streamer || echo "mjpg-streamer failed to start — check ${camera_dev} exists." >&2
  echo "MJPEG stream (if camera detected): http://$(hostname -I | awk '{print $1}'):${mjpeg_port}/?action=stream"
}

# ── MediaMTX: single media server, RTSP in / RTSP+RTMP+HLS+WebRTC out ──
install_mediamtx() {
  local camera_dev="${CAMERA_DEVICE:-/dev/video0}"
  local rtsp_port="${MEDIAMTX_RTSP_PORT:-8554}"
  local webrtc_port="${MEDIAMTX_WEBRTC_PORT:-8889}"
  local hls_port="${MEDIAMTX_HLS_PORT:-8888}"
  local publish_camera="${MEDIAMTX_PUBLISH_CAMERA:-1}"

  echo "── Installing MediaMTX (RTSP :${rtsp_port}, WebRTC :${webrtc_port}, HLS :${hls_port}) ──"

  local arch; arch="$(uname -m)"
  case "${arch}" in
    x86_64) arch=amd64 ;;
    aarch64) arch=arm64 ;;
    armv7l) arch=armv7 ;;
    armv6l) arch=armv6 ;;
    *) echo "Unsupported architecture for MediaMTX: ${arch}" >&2; return 1 ;;
  esac

  local version
  version="$(curl -fsSL https://api.github.com/repos/bluenviron/mediamtx/releases/latest | grep -o '"tag_name": *"[^"]*"' | head -1 | sed 's/.*"\(v[^"]*\)"/\1/')"
  if [ -z "${version}" ]; then
    echo "Could not determine latest MediaMTX version from the GitHub API (rate-limited?)." >&2
    return 1
  fi

  local asset="mediamtx_${version}_linux_${arch}.tar.gz"
  local tmp; tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/bluenviron/mediamtx/releases/download/${version}/${asset}" -o "${tmp}/mediamtx.tar.gz"
  tar -xzf "${tmp}/mediamtx.tar.gz" -C "${tmp}"
  install -m 755 "${tmp}/mediamtx" /usr/local/bin/mediamtx
  mkdir -p /etc/mediamtx
  [ -f /etc/mediamtx/mediamtx.yml ] || install -m 644 "${tmp}/mediamtx.yml" /etc/mediamtx/mediamtx.yml
  rm -rf "${tmp}"

  # Overwrite with a Jawji-specific config: RTSP/RTMP/HLS/WebRTC all on,
  # a single "camera" path that anything (ffmpeg, a real IP camera, etc.)
  # can publish into.
  cat > /etc/mediamtx/mediamtx.yml <<YAMLEOF
# Jawji companion MediaMTX config
# API bound to localhost only -- Jawji Controller queries it locally (paths,
# publisher/reader counts) to expose real stream status, not just
# "is the process running". Not exposed to the network.
api: yes
apiAddress: 127.0.0.1:9997
rtsp: yes
rtspAddress: :${rtsp_port}
rtmp: yes
rtmpAddress: :1935
hls: yes
hlsAddress: :${hls_port}
hlsVariant: lowLatency
hlsSegmentCount: 2
hlsSegmentDuration: 200ms
webrtc: yes
webrtcAddress: :${webrtc_port}
webrtcICEServers2:
  - url: stun:stun.l.google.com:19302
logLevel: info
logDestinations: [stdout]

paths:
  camera:
YAMLEOF

  cat > /etc/systemd/system/mediamtx.service <<SVCEOF
[Unit]
Description=MediaMTX media server
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/mediamtx /etc/mediamtx/mediamtx.yml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

  systemctl daemon-reload
  systemctl enable mediamtx >/dev/null
  systemctl restart mediamtx
  echo "MediaMTX running. RTSP :${rtsp_port}, HLS :${hls_port}, WebRTC :${webrtc_port}."

  if [ "${publish_camera}" = "1" ]; then
    apt-get install -y -qq ffmpeg >/dev/null
    cat > /etc/systemd/system/jawji-camera-publish.service <<SVCEOF
[Unit]
Description=Publish ${camera_dev} into MediaMTX
After=mediamtx.service
Requires=mediamtx.service

[Service]
Type=simple
ExecStart=/usr/bin/ffmpeg -f v4l2 -framerate 30 -video_size 1280x720 -i ${camera_dev} -c:v libx264 -preset ultrafast -tune zerolatency -f rtsp rtsp://127.0.0.1:${rtsp_port}/camera
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF
    systemctl daemon-reload
    systemctl enable jawji-camera-publish >/dev/null
    systemctl restart jawji-camera-publish || echo "Camera publish failed to start — check ${camera_dev} exists and isn't already in use." >&2
    echo "Camera publishing into MediaMTX at rtsp://<pi-ip>:${rtsp_port}/camera"
    echo "  -> WebRTC: http://<pi-ip>:${webrtc_port}/camera"
    echo "  -> HLS:    http://<pi-ip>:${hls_port}/camera"
    echo ""
    echo "NOTE: most USB webcams only allow one process to open ${camera_dev} at"
    echo "a time. If you also enabled mjpg-streamer, only one of the two will"
    echo "actually get the camera -- don't run both against the same device"
    echo "unless you know your camera/driver supports concurrent opens."
  fi
}

# ── MAVSDK Python environment (autonomy) ──
install_mavsdk() {
  local dir="${AUTONOMY_DIR:-/opt/jawji-autonomy}"
  local service_user="${SUDO_USER:-$(whoami)}"

  echo "── Installing MAVSDK Python environment (${dir}) ──"
  apt-get install -y -qq python3 python3-venv python3-pip >/dev/null

  mkdir -p "${dir}/scripts"
  python3 -m venv "${dir}/venv"
  "${dir}/venv/bin/pip" install --quiet --upgrade pip
  "${dir}/venv/bin/pip" install --quiet mavsdk

  cat > "${dir}/scripts/position_check.py" <<'PYEOF'
"""Example: connect and print live position telemetry. Read-only -- safe to
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

  cat > "${dir}/scripts/README.md" <<'MDEOF'
# Jawji Autonomy Scripts

`position_check.py` is a read-only example -- connects and prints state,
doesn't arm or command the vehicle. Use it to confirm the MAVSDK connection
works, then build your own mission logic from there.

Run manually:
    /opt/jawji-autonomy/venv/bin/python /opt/jawji-autonomy/scripts/your_script.py

There is deliberately no boot-time service that runs mission scripts
automatically -- arming/flying without an operator present is a safety
hazard. Wire up your own supervised trigger (a physical switch, an
authenticated remote command, etc.) if you want unattended-but-controlled
starts.
MDEOF

  chown -R "${service_user}:${service_user}" "${dir}"
  echo "MAVSDK environment ready at ${dir} (connect to udp://:${MAVSDK_UDP_PORT:-14540})"
  echo "Example script: ${dir}/scripts/position_check.py"
}

# ── Ultralytics YOLO (Jetson only) ──
install_yolo() {
  local dir="${CV_DIR:-/opt/jawji-cv}"
  local service_user="${SUDO_USER:-$(whoami)}"

  if [ ! -f /etc/nv_tegra_release ]; then
    echo "This doesn't look like a JetPack/L4T system (/etc/nv_tegra_release" >&2
    echo "not found) -- skipping YOLO install. Flash JetPack first." >&2
    return 1
  fi

  echo "── Installing Ultralytics YOLO (${dir}) ──"
  apt-get install -y -qq python3-pip python3-venv >/dev/null

  mkdir -p "${dir}/scripts"
  python3 -m venv --system-site-packages "${dir}/venv"
  "${dir}/venv/bin/pip" install --quiet --upgrade pip
  "${dir}/venv/bin/pip" install --quiet mavsdk ultralytics opencv-python-headless

  cat > "${dir}/scripts/detect.py" <<'PYEOF'
"""Example: run YOLO object detection on the CSI/USB camera and print
detections. GPU-accelerated automatically if a CUDA-enabled torch build is
present (Ultralytics picks it up on its own on Jetson). Doesn't connect to
the flight controller or command the vehicle -- wire that up yourself once
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

  chown -R "${service_user}:${service_user}" "${dir}"
  echo "CV environment ready at ${dir} (example: ${dir}/scripts/detect.py)"
}
