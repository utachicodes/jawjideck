#!/usr/bin/env bash
# Jawji Companion: Autonomous Mission Runner
# A thin wrapper around install.sh's 'ai' profile minus YOLO (Pi hardware
# has no GPU for it) -- kept as its own URL for backward compatibility
# with the Autonomous Mission Runner template.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash pi-autonomy.sh" >&2
  exit 1
fi

JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"
curl -fsSL "https://raw.githubusercontent.com/utachicodes/jawjideck/${JAWJI_REPO_BRANCH}/packages/companion-scripts/install.sh" | \
  WITH_AGENT=1 WITH_MAVLINK=1 WITH_WIFI_AP=0 WITH_MEDIAMTX=0 WITH_MAVSDK=1 WITH_YOLO=0 bash
