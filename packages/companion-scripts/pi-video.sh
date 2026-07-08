#!/usr/bin/env bash
# Jawji Companion: Video + Telemetry
# mjpg-streamer (Jawji's Camera panel today) + MediaMTX (RTSP/RTMP/HLS/WebRTC
# for everything else) + mavlink-router + WiFi AP + Jawji Agent.
# A thin wrapper around install.sh's 'vision' profile, plus mjpg-streamer
# for backward compatibility with the Video + Telemetry template.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash pi-video.sh" >&2
  exit 1
fi

JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"
JAWJI_RAW_BASE="https://raw.githubusercontent.com/utachicodes/jawjideck/${JAWJI_REPO_BRANCH}"

echo "IMPORTANT: Jawji's in-app Camera panel currently only decodes MJPEG"
echo "(plain <img> tag, no RTSP/WebRTC/HLS support yet). This installs both:"
echo "  - mjpg-streamer -> point Jawji's Camera panel at this"
echo "  - MediaMTX -> RTSP/RTMP/HLS/WebRTC for QGroundControl, browsers,"
echo "    VLC, etc., and the professional path once Jawji's Camera panel"
echo "    gains WebRTC/HLS support"
echo ""

curl -fsSL "${JAWJI_RAW_BASE}/packages/companion-scripts/install.sh" | \
  bash -s -- vision

LIB_TMP="$(mktemp)"
curl -fsSL "${JAWJI_RAW_BASE}/packages/companion-scripts/lib.sh" -o "${LIB_TMP}"
# shellcheck source=/dev/null
source "${LIB_TMP}"
install_mjpg_streamer
rm -f "${LIB_TMP}"
