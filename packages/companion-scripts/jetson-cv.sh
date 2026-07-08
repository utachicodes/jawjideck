#!/usr/bin/env bash
# Jawji Companion: Computer Vision Companion (Jetson)
# A thin wrapper around install.sh's 'ai' profile -- kept as its own URL
# for backward compatibility with the Jetson CV Companion template.
#
# Prerequisite: a Jetson already flashed and booted with NVIDIA JetPack
# (L4T) -- this script does not (and cannot) install JetPack itself.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash jetson-cv.sh" >&2
  exit 1
fi

JAWJI_REPO_BRANCH="${JAWJI_REPO_BRANCH:-master}"
curl -fsSL "https://raw.githubusercontent.com/utachicodes/jawjideck/${JAWJI_REPO_BRANCH}/packages/companion-scripts/install.sh" | \
  bash -s -- ai
