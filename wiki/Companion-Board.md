# Companion Board Support

Jawji includes tools for setting up and managing companion computers. The companion view is organized into three tabs: **Store**, **DroneBridge**, and **Dashboard**.

> Enable the companion view in **Settings > Experimental Features > Companion Board Support**.

## One-Script Installer (recommended)

The fastest way to set up a Raspberry Pi, Jetson, or generic Linux companion computer — SSH into the board and run:

```bash
curl -fsSL https://jawji.space/install.sh | sudo bash
```

### What it does

1. **Detects the hardware** automatically — Jetson (via `/etc/nv_tegra_release`), Raspberry Pi (via `/proc/cpuinfo` / `/proc/device-tree/model`), or falls back to generic Linux.
2. **Asks what you want** with an interactive menu (see below for non-interactive use), then installs only that — no manual `apt install` checklist.
3. **Prints a pairing token** at the end if the Jawji Agent was installed. Copy it (or just click **Scan for agents** in the [Dashboard tab](#connecting) — mDNS finds it automatically).

Everything it installs runs as a `systemd` service with `Restart=always`, so it survives reboots and crashes without you doing anything else.

### Profiles

Three profiles cover the common cases; pick one instead of answering a checklist:

| Profile | Installs |
|---|---|
| **Basic Companion** | Jawji Agent + MAVLink telemetry (mavlink-router) + WiFi AP |
| **Vision Companion** | + MediaMTX (RTSP/RTMP/HLS/WebRTC) + mjpg-streamer (for Jawji's Camera panel today) |
| **AI Companion** | + MediaMTX + MAVSDK + YOLO object detection (Jetson only — silently skipped elsewhere) |

Pass a profile as the first argument to skip the menu:

```bash
curl -fsSL https://jawji.space/install.sh | sudo bash -s -- basic
curl -fsSL https://jawji.space/install.sh | sudo bash -s -- vision
curl -fsSL https://jawji.space/install.sh | sudo bash -s -- ai
```

This is exactly what the Store tab's templates do under the hood — Telemetry Bridge runs `-- basic`, Video + Telemetry runs `-- vision`, Computer Vision Companion runs `-- ai`. Copy the command straight from a template card if you'd rather not type it yourself.

### Custom component combinations

If none of the three profiles fit, set `WITH_*` environment variables directly instead of a profile — `sudo` needs them passed inline (`sudo VAR=1 command`, not `VAR=1 sudo command`, since `sudo` resets the environment otherwise):

```bash
curl -fsSL https://jawji.space/install.sh | \
  sudo WITH_AGENT=1 WITH_MAVLINK=1 WITH_MAVSDK=1 WITH_YOLO=0 WITH_WIFI_AP=0 WITH_MEDIAMTX=0 bash
```

| Variable | Component |
|---|---|
| `WITH_AGENT` | Jawji Agent (metrics, terminal, file browser, mDNS pairing) |
| `WITH_MAVLINK` | mavlink-router (FC serial ↔ UDP :14550) |
| `WITH_WIFI_AP` | WiFi access point via NetworkManager |
| `WITH_MEDIAMTX` | MediaMTX media server (RTSP/RTMP/HLS/WebRTC) |
| `WITH_MJPG` | mjpg-streamer (MJPEG, for Jawji's Camera panel today) |
| `WITH_MAVSDK` | MAVSDK Python environment + example script |
| `WITH_YOLO` | Ultralytics YOLO object detection (Jetson/JetPack only) |

Any variable left unset defaults to `0` (skip). The command above is the Autonomous Mission Runner template's exact configuration — Agent + telemetry + MAVSDK, no WiFi AP, no video.

### Non-interactive / scripted use

`curl | bash` has no terminal of its own to prompt on. If you don't pass a profile or any `WITH_*` variable, the script checks for a real TTY (`/dev/tty`) to ask interactively; if there isn't one (e.g. driven from another script, CI, or Jawji's Store tab over SSH), it defaults to the **Basic Companion** profile and prints a note telling you how to choose explicitly next time. Always pass a profile or `WITH_*` flags when scripting this — don't rely on the interactive fallback.

### Re-running / updating

The script is safe to re-run — each `install_*` step checks whether its binary/service already exists before rebuilding, and systemd units are rewritten and restarted idempotently. Re-run it with a different profile or flags to add components to an already-provisioned board; it won't remove anything you added previously that isn't part of the new selection.

### Troubleshooting

- **"Run with sudo"** — the script needs root for package installs and systemd units; re-run with `sudo`.
- **MediaMTX version lookup fails** — `install_mediamtx` queries the GitHub API for the latest release; if the board has no internet access (or GitHub rate-limits you), that step fails with a clear message and the rest of the install continues.
- **Camera not found** — `mjpg-streamer`/MediaMTX's camera-publish service will start but immediately fail if `/dev/video0` doesn't exist; check `CAMERA_DEVICE` if your camera is on a different path, e.g. `curl -fsSL https://jawji.space/install.sh | sudo CAMERA_DEVICE=/dev/video1 bash -s -- vision`.
- **YOLO skipped** — object detection needs a Jetson with JetPack (`/etc/nv_tegra_release`); on anything else the script prints a warning and skips it rather than failing the whole install.

## Store Tab

Browse pre-configured templates for popular companion boards. The store is the default tab and works without any connection.

### Supported Boards

| Board Family | Templates | Flash Method |
|-------------|-----------|--------------|
| ESP32 | DroneBridge WiFi, DroneBridge ESP-NOW | USB Flash (esptool) |
| Raspberry Pi | Telemetry Bridge, Video + Telemetry, Rpanion Server, BlueOS, Autonomous Runner, OpenHD | SD Card Image / Install Script |
| NVIDIA Jetson | Computer Vision Companion | Install Script (SSH) |
| Orange Pi | (coming soon) | - |

### ESP32 Flashing

Flash ESP32 boards directly from Jawji via USB:

1. Select a template (e.g., DroneBridge WiFi)
2. Connect your ESP32 via USB
3. Select the serial port and click **Detect** to identify the chip
4. Click **Flash Firmware**

esptool is downloaded automatically on first use (~25 MB standalone binary from [espressif/esptool](https://github.com/espressif/esptool) releases). No Python installation required.

> **Tip:** If the flash fails to connect, hold the **BOOT** button on your ESP32 while clicking Flash.

### Raspberry Pi / Jetson Setup

Pi and Jetson templates run the one-script installer described above over SSH, each with the profile or flags matching that template (e.g. Telemetry Bridge runs `install.sh -- basic`, Video + Telemetry runs `install.sh -- vision`). The per-template wrapper scripts (`pi-telemetry.sh`, `pi-video.sh`, `pi-autonomy.sh`, `jetson-cv.sh`) that used to exist purely to give each template its own URL have been removed now that the Store copies the installer command with the profile baked in directly.

### Video streaming (MediaMTX)

The Video + Telemetry template installs [MediaMTX](https://github.com/bluenviron/mediamtx), a real multi-protocol media server — one camera source can serve RTSP, RTMP, HLS, and WebRTC simultaneously, watchable from QGroundControl, VLC, a browser, or Jawji itself. Jawji's Camera panel supports both:

- **MJPEG** — the original path, a plain `<img>` multipart stream, no configuration beyond a URL
- **WebRTC** — low-latency H.264/H.265 via MediaMTX's WHEP endpoint (`http://<host>:8889/<path>/whep`), select "WebRTC" in the Camera panel's protocol toggle and enter the base URL (`/whep` is appended automatically)

`mjpg-streamer` still installs alongside MediaMTX for now — most USB webcams only allow one process to hold the camera device open at a time, so pick whichever protocol you actually want to use if you're on a single-camera setup.

## DroneBridge Tab

Monitor and configure DroneBridge ESP32 devices on your network.

### Status Panel
- Auto-detects DroneBridge devices via network scan
- Manual IP probe for devices on different subnets
- Shows firmware version, chip model, MAC address, WiFi signal strength
- Live throughput metrics: serial RX bytes, MAVLink messages, connected clients

### Settings Panel
- **WiFi** - SSID, password, channel, mode (AP/Station), antenna selection
- **Serial** - Baud rate, protocol, GPIO pin mapping (TX/RX/RTS/CTS)
- **Network** - AP IP, static IP, gateway, netmask, UDP client settings
- **Advanced** - Packet size, timeouts, LTM config, RSSI format
- Save and reboot with automatic reconnection

## Dashboard Tab

Full companion computer management when the Jawji Agent is installed.

### Panels

| Panel | Description |
|-------|-------------|
| Status | Connection state, hostname, OS, uptime |
| System Metrics | Real-time CPU, RAM, temperature graphs |
| Network | Interfaces, IP addresses, routing, DNS |
| Processes | Running processes with CPU/RAM usage |
| Logs | Scrollable log viewer (colored by level) |
| Terminal | Remote shell (no SSH client needed) |
| File Browser | Remote file manager |
| Services | systemd service management |
| Containers | Docker container management |
| Extensions | Third-party extension manager |

### Layouts

The dashboard uses a dockview-based layout system:
- **Presets** - Overview, Debug, Manage
- **Custom Layouts** - Save and load your own panel arrangements
- **Add Panel** - Add any panel to the current layout
- Auto-saves layout changes

### Connecting

1. Install the Jawji Agent — either as part of the [one-script installer](#one-script-installer-recommended) above, or on its own:
   ```
   curl -fsSL https://jawji.space/agent/install.sh | sudo bash
   ```
2. Note the pairing token shown after installation (`journalctl -u jawji-agent`)
3. In the Dashboard tab, either click **Scan for agents** to find it via mDNS on your local network, or enter the companion's IP and token manually
4. Click **Connect**

Once paired, Jawji remembers the connection — closing and reopening the app automatically reconnects to the last-paired agent using its saved (encrypted) token, no need to re-enter it every time.

The agent provides real-time metrics, terminal access, and service management over a secure WebSocket connection.

## Onboard Autonomy (jawji-orchestrator)

For companion computers that need to make a decision without a GCS connected at all, Jawji Agent and the Companion Dashboard are not the right tool - both assume something is watching on the other end. [jawji-orchestrator](https://github.com/utachicodes/jawji-orchestrator) is a separate, independently published package (`@jawji/orchestrator` on npm) built for that case: it runs standalone on the companion computer, with its own direct MAVSDK connection to the flight controller, and works correctly whether or not Jawji is connected.

Its first mode, `LandingZoneCheckMode`, holds the vehicle when it enters LAND mode, captures a camera frame, and asks an integrator-supplied vision-language model whether the site looks safe. If not, it holds and waits for an external confirm before repositioning, by default - it does not act on an unsafe verdict unattended unless that is explicitly configured.

The vision-language model is pluggable - `VlmClient` is a generic image-and-prompt-in, JSON-out interface, with a built-in client for [Miril-Drone-2B-1](https://huggingface.co/MirilAI/Miril-Drone-2B-1), a model fine-tuned for aerial imagery, served over any OpenAI-compatible endpoint (`llama-server`, vLLM, SGLang). jawji-orchestrator does not bundle or run a model itself; you still need to stand one up separately and point the client at it.

This package is not yet wired into Jawji desktop or Jawji Agent, so its advisories are not currently visible in the Companion Dashboard. See its own README for the full architecture, its local status API, and a researched (not yet implemented) design for GPS-denied landmark-based navigation.
