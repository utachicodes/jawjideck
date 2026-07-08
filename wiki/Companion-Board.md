# Companion Board Support

Jawji includes tools for setting up and managing companion computers. The companion view is organized into three tabs: **Store**, **DroneBridge**, and **Dashboard**.

> Enable the companion view in **Settings > Experimental Features > Companion Board Support**.

## One-Script Installer (recommended)

The fastest way to set up a Raspberry Pi, Jetson, or generic Linux companion computer:

```bash
curl -fsSL https://jawji.space/install.sh | sudo bash
```

It detects the hardware automatically and offers three profiles instead of a checklist of individual packages:

| Profile | Installs |
|---|---|
| **Basic Companion** | Jawji Agent + MAVLink telemetry (mavlink-router) + WiFi AP |
| **Vision Companion** | + MediaMTX (RTSP/RTMP/HLS/WebRTC video relay) |
| **AI Companion** | + MAVSDK + YOLO object detection (Jetson only) |

Pass a profile directly (`install.sh vision`), set `WITH_*` environment variables for scripting, or answer the interactive prompts if you run it without either.

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

Pi and Jetson templates run the install scripts described above over SSH — either the one-script installer with a profile, or (for backward compatibility) the original per-template scripts like `pi-telemetry.sh`, `pi-video.sh`, `pi-autonomy.sh`, and `jetson-cv.sh`, which are now thin wrappers around the same install profiles.

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
