#!/usr/bin/env bash
# Jawji Companion: Video + Telemetry
# mjpg-streamer (for Jawji's in-app Camera panel, MJPEG-only today) +
# a GStreamer H.264/RTP pipeline (for external RTSP/H.264 viewers) +
# mavlink-router + WiFi AP + Jawji Agent.
set -euo pipefail

FC_SERIAL_DEV="${FC_SERIAL_DEV:-/dev/serial0}"
FC_BAUD="${FC_BAUD:-57600}"
MAVROUTER_UDP_PORT="${MAVROUTER_UDP_PORT:-14550}"
AP_SSID="${AP_SSID:-Jawji-$(hostname)}"
AP_PASSWORD="${AP_PASSWORD:-}"
AP_IFACE="${AP_IFACE:-wlan0}"
CAMERA_DEVICE="${CAMERA_DEVICE:-/dev/video0}"
MJPEG_PORT="${MJPEG_PORT:-8080}"
H264_UDP_PORT="${H264_UDP_PORT:-5600}"
H264_UDP_HOST="${H264_UDP_HOST:-127.0.0.1}"
JAWJI_REPO_URL="${JAWJI_REPO_URL:-https://github.com/utachicodes/jawjideck.git}"
JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash pi-video.sh" >&2
  exit 1
fi

echo "================================"
echo "Jawji Video + Telemetry Installer"
echo "================================"
echo ""
echo "IMPORTANT: Jawji's in-app Camera panel currently only decodes MJPEG"
echo "(plain <img> tag, no RTSP/H.264 support yet). This script sets up:"
echo "  - mjpg-streamer on :${MJPEG_PORT}  -> point Jawji's Camera panel at this"
echo "  - a raw H.264 RTP/UDP stream on :${H264_UDP_PORT} -> for QGroundControl,"
echo "    ffplay, or other RTSP/H.264-capable viewers, not Jawji itself yet"
echo ""

apt-get update -qq
apt-get install -y -qq git build-essential pkg-config ninja-build meson \
  cmake libjpeg-dev imagemagick libv4l-dev gstreamer1.0-tools \
  gstreamer1.0-plugins-good gstreamer1.0-plugins-bad network-manager >/dev/null

# ── 1. mjpg-streamer (drives Jawji's Camera panel today) ──
if ! command -v mjpg_streamer &>/dev/null; then
  echo "Building mjpg-streamer..."
  BUILD_DIR="$(mktemp -d)"
  git clone --depth 1 https://github.com/jacksonliam/mjpg-streamer.git "${BUILD_DIR}"
  (cd "${BUILD_DIR}/mjpg-streamer-experimental" && make >/dev/null && make install >/dev/null)
  rm -rf "${BUILD_DIR}"
else
  echo "mjpg-streamer already installed, skipping build."
fi

cat > /etc/systemd/system/jawji-mjpg-streamer.service <<SVCEOF
[Unit]
Description=Jawji MJPEG camera stream (for Camera panel)
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/mjpg_streamer -i "input_uvc.so -d ${CAMERA_DEVICE} -r 1280x720 -f 30" -o "output_http.so -p ${MJPEG_PORT} -w /usr/local/share/mjpg-streamer/www"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable jawji-mjpg-streamer >/dev/null
systemctl restart jawji-mjpg-streamer || echo "mjpg-streamer failed to start — check ${CAMERA_DEVICE} exists (libcamera-only setups need a v4l2loopback bridge first, see docs/guides/companion-hardware-setup.md)." >&2
echo "MJPEG stream (if camera detected): http://$(hostname -I | awk '{print $1}'):${MJPEG_PORT}/?action=stream"

# ── 2. GStreamer H.264/RTP pipeline (for external RTSP/H.264 tools) ──
cat > /etc/systemd/system/jawji-gst-h264.service <<SVCEOF
[Unit]
Description=Jawji H.264 RTP/UDP camera stream (external viewers)
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/gst-launch-1.0 -e v4l2src device=${CAMERA_DEVICE} ! video/x-raw,width=1280,height=720,framerate=30/1 ! videoconvert ! x264enc tune=zerolatency bitrate=2000 speed-preset=ultrafast ! rtph264pay config-interval=1 pt=96 ! udpsink host=${H264_UDP_HOST} port=${H264_UDP_PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable jawji-gst-h264 >/dev/null
systemctl restart jawji-gst-h264 || echo "GStreamer H.264 pipeline failed to start — check ${CAMERA_DEVICE} and that it supports x264enc's input format." >&2
echo "H.264 RTP stream: udp://${H264_UDP_HOST}:${H264_UDP_PORT} (view with: ffplay udp://${H264_UDP_HOST}:${H264_UDP_PORT})"

# ── 3. mavlink-router + WiFi AP (shared with pi-telemetry.sh) ──
curl -fsSL "https://raw.githubusercontent.com/utachicodes/jawjideck/${JAWJI_REPO_BRANCH}/packages/companion-scripts/pi-telemetry.sh" | \
  FC_SERIAL_DEV="${FC_SERIAL_DEV}" FC_BAUD="${FC_BAUD}" MAVROUTER_UDP_PORT="${MAVROUTER_UDP_PORT}" \
  AP_SSID="${AP_SSID}" AP_PASSWORD="${AP_PASSWORD}" AP_IFACE="${AP_IFACE}" \
  JAWJI_REPO_URL="${JAWJI_REPO_URL}" JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH}" bash

echo ""
echo "================================"
echo "Video + Telemetry setup complete."
echo "================================"
