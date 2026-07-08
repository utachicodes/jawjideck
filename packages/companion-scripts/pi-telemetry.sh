#!/usr/bin/env bash
# Jawji Companion: Telemetry Bridge
# mavlink-router + WiFi AP + Jawji Agent, as boot services on a Raspberry Pi.
# A thin wrapper around install.sh's 'basic' profile -- kept as its own URL
# for backward compatibility with the Telemetry Bridge template.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash pi-telemetry.sh" >&2
  exit 1
fi

JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"
curl -fsSL "https://raw.githubusercontent.com/utachicodes/jawjideck/${JAWJI_REPO_BRANCH}/packages/companion-scripts/install.sh" | \
  bash -s -- basic
