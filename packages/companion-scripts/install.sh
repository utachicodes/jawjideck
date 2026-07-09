#!/usr/bin/env bash
# Jawji Companion: one-script installer.
#
#   curl -fsSL https://jawji.space/install.sh | sudo bash
#   curl -fsSL https://jawji.space/install.sh | sudo bash -s -- vision
#   sudo WITH_CONTROLLER=1 WITH_MEDIAMTX=1 bash install.sh
#
# Replaces installing Docker/mavlink-router/NetworkManager/MediaMTX/MAVSDK/
# Jawji Controller one at a time with a single command that asks what you need
# (or takes a profile/flags non-interactively) and installs only that.
set -euo pipefail

JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"
JAWJI_RAW_BASE="https://raw.githubusercontent.com/utachicodes/jawjideck/${JAWJI_REPO_BRANCH}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: curl -fsSL https://jawji.space/install.sh | sudo bash" >&2
  exit 1
fi

# ── Load shared install functions ──────────────────────────────────────
LIB_TMP=""
if [ -f "$(dirname "$0")/lib.sh" ]; then
  # shellcheck source=./lib.sh
  source "$(dirname "$0")/lib.sh"
else
  LIB_TMP="$(mktemp)"
  curl -fsSL "${JAWJI_RAW_BASE}/packages/companion-scripts/lib.sh" -o "${LIB_TMP}"
  # shellcheck source=/dev/null
  source "${LIB_TMP}"
fi
cleanup() { [ -n "${LIB_TMP}" ] && rm -f "${LIB_TMP}"; }
trap cleanup EXIT

# ── Hardware detection ─────────────────────────────────────────────────
detect_hardware() {
  if [ -f /etc/nv_tegra_release ]; then
    echo "jetson"
  elif grep -qi "raspberry pi" /proc/cpuinfo 2>/dev/null || grep -qi "raspberry pi" /proc/device-tree/model 2>/dev/null; then
    echo "raspberry-pi"
  else
    echo "generic-linux"
  fi
}

HARDWARE="${HARDWARE:-$(detect_hardware)}"

# ── Profile / component selection ──────────────────────────────────────
# Three ways to choose what gets installed, in priority order:
#   1. A profile name as the first argument (basic | vision | ai)
#   2. WITH_* environment variables (1 = install, 0/unset = skip)
#   3. An interactive menu, if neither of the above was given and we have
#      a real terminal to prompt on (curl | bash has no stdin of its own,
#      so prompts read from /dev/tty explicitly)

PROFILE="${1:-}"

apply_profile() {
  case "$1" in
    basic)
      WITH_CONTROLLER=1 WITH_MAVLINK=1 WITH_MEDIAMTX=0 WITH_MJPG=0 WITH_MAVSDK=0 WITH_YOLO=0 WITH_WIFI_AP=1
      ;;
    vision)
      # Jawji's Camera panel only decodes MJPEG today, so the vision profile
      # installs mjpg-streamer alongside MediaMTX (RTSP/RTMP/HLS/WebRTC for
      # everything else) rather than MediaMTX alone.
      WITH_CONTROLLER=1 WITH_MAVLINK=1 WITH_MEDIAMTX=1 WITH_MJPG=1 WITH_MAVSDK=0 WITH_YOLO=0 WITH_WIFI_AP=1
      ;;
    ai)
      WITH_CONTROLLER=1 WITH_MAVLINK=1 WITH_MEDIAMTX=1 WITH_MJPG=0 WITH_MAVSDK=1 WITH_YOLO=1 WITH_WIFI_AP=1
      ;;
    *)
      echo "Unknown profile: $1 (expected basic, vision, or ai)" >&2
      exit 1
      ;;
  esac
}

prompt_menu() {
  local tty=/dev/tty
  if [ ! -e "${tty}" ] || [ ! -r "${tty}" ]; then
    echo "No profile given and no terminal to prompt on (running via a pipe" >&2
    echo "with no TTY). Defaulting to the 'basic' profile. Pass a profile" >&2
    echo "explicitly to choose otherwise, e.g.:" >&2
    echo "  curl -fsSL https://jawji.space/install.sh | sudo bash -s -- vision" >&2
    apply_profile basic
    return
  fi

  echo "What do you want on this ${HARDWARE}?" > "${tty}"
  echo "  1) Basic Companion   -- Jawji Controller + MAVLink telemetry" > "${tty}"
  echo "  2) Vision Companion  -- + MediaMTX video streaming" > "${tty}"
  echo "  3) AI Companion      -- + MAVSDK + YOLO object detection (Jetson only)" > "${tty}"
  echo "  4) Custom            -- pick components individually" > "${tty}"
  read -r -p "Choice [1-4]: " choice < "${tty}"

  case "${choice}" in
    1) apply_profile basic ;;
    2) apply_profile vision ;;
    3) apply_profile ai ;;
    4)
      read -r -p "Jawji Controller? [Y/n] " a < "${tty}"; WITH_CONTROLLER=$([ "${a}" = "n" ] && echo 0 || echo 1)
      read -r -p "MAVLink telemetry (mavlink-router)? [Y/n] " b < "${tty}"; WITH_MAVLINK=$([ "${b}" = "n" ] && echo 0 || echo 1)
      read -r -p "Video streaming (MediaMTX)? [y/N] " c < "${tty}"; WITH_MEDIAMTX=$([ "${c}" = "y" ] && echo 1 || echo 0)
      read -r -p "MJPEG stream for Jawji's Camera panel (mjpg-streamer)? [y/N] " c2 < "${tty}"; WITH_MJPG=$([ "${c2}" = "y" ] && echo 1 || echo 0)
      read -r -p "MAVSDK autonomy environment? [y/N] " d < "${tty}"; WITH_MAVSDK=$([ "${d}" = "y" ] && echo 1 || echo 0)
      read -r -p "Object detection (Jetson only)? [y/N] " e < "${tty}"; WITH_YOLO=$([ "${e}" = "y" ] && echo 1 || echo 0)
      read -r -p "WiFi access point? [Y/n] " f < "${tty}"; WITH_WIFI_AP=$([ "${f}" = "n" ] && echo 0 || echo 1)
      ;;
    *)
      echo "Unrecognized choice, defaulting to Basic Companion." > "${tty}"
      apply_profile basic
      ;;
  esac
}

if [ -n "${PROFILE}" ]; then
  apply_profile "${PROFILE}"
elif [ -z "${WITH_CONTROLLER:-}${WITH_MAVLINK:-}${WITH_MEDIAMTX:-}${WITH_MJPG:-}${WITH_MAVSDK:-}${WITH_YOLO:-}" ]; then
  prompt_menu
fi

WITH_CONTROLLER="${WITH_CONTROLLER:-0}"
WITH_MAVLINK="${WITH_MAVLINK:-0}"
WITH_MEDIAMTX="${WITH_MEDIAMTX:-0}"
WITH_MJPG="${WITH_MJPG:-0}"
WITH_MAVSDK="${WITH_MAVSDK:-0}"
WITH_YOLO="${WITH_YOLO:-0}"
WITH_WIFI_AP="${WITH_WIFI_AP:-0}"

if [ "${WITH_YOLO}" = "1" ] && [ "${HARDWARE}" != "jetson" ]; then
  echo "Object detection (YOLO) needs a Jetson with JetPack -- this looks" >&2
  echo "like ${HARDWARE}, skipping that component." >&2
  WITH_YOLO=0
fi

echo "================================"
echo "Jawji Companion Installer"
echo "================================"
echo "Hardware: ${HARDWARE}"
echo "Installing: $( [ "${WITH_CONTROLLER}" = 1 ] && echo -n 'Jawji Controller ' )$( [ "${WITH_MAVLINK}" = 1 ] && echo -n 'mavlink-router ' )$( [ "${WITH_WIFI_AP}" = 1 ] && echo -n 'WiFi-AP ' )$( [ "${WITH_MEDIAMTX}" = 1 ] && echo -n 'MediaMTX ' )$( [ "${WITH_MJPG}" = 1 ] && echo -n 'mjpg-streamer ' )$( [ "${WITH_MAVSDK}" = 1 ] && echo -n 'MAVSDK ' )$( [ "${WITH_YOLO}" = 1 ] && echo -n 'YOLO ' )"
echo ""

apt-get update -qq

[ "${WITH_MAVLINK}" = "1" ] && install_mavlink_router
[ "${WITH_WIFI_AP}" = "1" ] && install_wifi_ap
[ "${WITH_MEDIAMTX}" = "1" ] && install_mediamtx
[ "${WITH_MJPG}" = "1" ] && install_mjpg_streamer
[ "${WITH_MAVSDK}" = "1" ] && install_mavsdk
[ "${WITH_YOLO}" = "1" ] && install_yolo
# Controller last: it's the one thing every profile has, and it's a good final
# "everything above worked, here's your pairing token" note to end on.
[ "${WITH_CONTROLLER}" = "1" ] && install_controller

echo ""
echo "================================"
echo "Jawji Companion setup complete."
echo "================================"
