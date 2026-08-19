# jawji-controller

[![CI](https://github.com/utachicodes/jawjideck/actions/workflows/ci.yml/badge.svg)](https://github.com/utachicodes/jawjideck/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](../../LICENSE)

A companion-board agent for ESP32, Raspberry Pi, Jetson, and Orange Pi. Exposes a small Express + WebSocket server with bearer-token auth and subnet restriction, polled by the Jawji desktop app's Agent Dashboard for real-time metrics, logs, and terminal access.

## Features

- **Real-time metrics** — CPU, RAM, temperature, disk, network, Docker containers
- **PTY terminal** — Full shell access from the desktop app
- **Service management** — Start, stop, restart, enable, disable systemd services
- **mDNS discovery** — Automatic network discovery via Bonjour/mDNS
- **File browsing** — Browse and download companion-board files
- **Docker integration** — Container status and management
- **MediaMTX relay** — Live video stream status for companion video feeds
- **Auto-setup** — On boot: detects flight controllers, installs mavlink-router, detects cameras, installs MediaMTX, configures the TCP/UDP bridge — everything needed to start flying
- **Install script** — One-command setup: `curl -fsSL https://jawji.space/install.sh | sudo bash`

## Auto-setup (flight controller + video + bridge)

On every boot, the controller automatically:

1. **Scans USB serial ports** (`/dev/ttyACM*`, `/dev/ttyUSB*`, `/dev/serial/by-id/*`) for connected flight controllers. Identifies driver type (CP210x, CH340, CDC ACM) and probes for MAVLink heartbeat responses.

2. **Installs and configures `mavlink-router`** if not already running. Bridges the FC's UART to `UDP:14550` (GCS endpoint) and `TCP:5760` (direct connection). Builds from source if no prebuilt binary exists.

3. **Detects cameras** (`/dev/video*`) and installs [MediaMTX](https://github.com/bluenviron/mediamtx) if a camera is found. Automatically publishes the camera feed to `RTSP:8554`, `WebRTC:8889`, `HLS:8888`.

4. **Configures the TCP/UDP bridge** so the desktop app can connect to the flight controller without any manual network setup.

### Auto-setup API endpoints

All endpoints require Bearer token authentication.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/setup` | GET | Full auto-setup status (FCs, mavlink, video, bridge) |
| `/api/v1/setup/rescan` | POST | Force re-scan for flight controllers |
| `/api/v1/setup/mavlink` | POST | Reconfigure mavlink-router (body: `fcDevice`, `fcBaud`, `udpPort`, `tcpPort`) |
| `/api/v1/setup/video` | POST | Reconfigure MediaMTX (body: `cameraDevice`, `rtspPort`, `webrtcPort`, `hlsPort`) |

### Input validation

All device paths, baud rates, and ports are validated before touching any config file or shell command:

- Device paths must match `/dev/ttyACM*`, `/dev/ttyUSB*`, `/dev/serial/by-id/*`, or `/dev/videoN`
- Baud rates must be a standard value: 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600
- Ports must be 1-65535
- Newlines and shell metacharacters are rejected to prevent config/systemd injection

## Setup

```bash
pnpm install
pnpm build
```

## Development

```bash
pnpm dev
```

## Testing

```bash
npx vitest run packages/jawji-controller
```

54 tests covering auth, files, metrics, processes, Docker, BlueOS, rate limiting, the license gate, FC detection, mavlink setup, MediaMTX setup, bridge, and input validation.

## Install script (v0.2.0)

The controller's install script accepts a license key:

```bash
# Core features only (free):
curl -fsSL https://jawji.space/install.sh | sudo bash

# With license key (paid features enabled):
JAWJI_LICENSE_PUBLIC_KEY=<key> curl -fsSL https://jawji.space/install.sh | sudo bash
```

The script:
- Builds the controller from source
- Injects the license key at build time (if provided)
- Passes the key to the systemd service for runtime verification
- Shows license status in the post-install summary

## CLI (`jawji`)

Installed to `/usr/local/bin/jawji` by the installer:

```bash
sudo jawji status      # service status + health check
sudo jawji info        # IPs, mDNS name, protocol version
sudo jawji token       # pairing token (--show for full)
sudo jawji connect     # how to pair from the desktop app
sudo jawji license     # show license status (paid features)
sudo jawji logs        # follow controller logs
sudo jawji start       # start the service
sudo jawji stop        # stop the service
sudo jawji restart     # restart the service
sudo jawji update      # re-run installer to update
```

## Device Security & Licensing

### Encrypted credentials

Controller credentials (API key, device tokens) are stored encrypted at rest using AES-256-GCM with a device-bound key derived from `/etc/machine-id` via scrypt. Legacy plaintext formats are automatically migrated on first read.

### License gate

Paid services (Intelligence modules, AI analysis, cloud sync, companion provisioning, orchestrator) are gated behind an Ed25519 entitlement-token check. The public key is embedded at build time; the token is verified locally, offline. No public key → all paid services denied (fail-closed).

```typescript
import { requirePaidService } from './licensing/gate';

// Throws LicenseGateError if not entitled
requirePaidService('ai-analysis', cachedToken);
```

### Build-time key injection

```bash
# Generate keypair
node tools/license-keys.mjs

# The prebuild script embeds JAWJI_LICENSE_PUBLIC_KEY into dist/generated/license-key.js
```

### Service mapping

| Service | Requires |
|---------|----------|
| `ai-analysis` | Active subscription |
| `cloud-sync` | Active subscription |
| `intelligence-modules` | Active subscription OR `intelligence-module` license |
| `companion-provisioning` | Active subscription |
| `orchestrator` | Active `orchestrator` license |

## Architecture

```
packages/jawji-controller/
├── src/
│   ├── index.ts              # Express + WebSocket server, startup, auto-setup
│   ├── config.ts             # Environment-based configuration
│   ├── auth.ts               # Pairing token generation + validation
│   ├── fc-detect.ts          # USB serial flight controller auto-detection
│   ├── mavlink-setup.ts      # mavlink-router install/configure/manage
│   ├── mediamtx-setup.ts     # MediaMTX install/configure/manage + camera detection
│   ├── mediamtx.ts           # MediaMTX status queries (existing)
│   ├── bridge.ts             # TCP/UDP bridge auto-configuration
│   ├── validation.ts         # Input validation (device paths, ports, baud rates)
│   ├── discovery.ts          # mDNS/Bonjour service registration
│   ├── metrics.ts            # System metrics collection
│   ├── processes.ts          # Process listing + kill
│   ├── services.ts           # systemd/OpenRC service management
│   ├── files.ts              # File browsing
│   ├── terminal.ts           # PTY terminal sessions
│   ├── docker.ts             # Docker container management
│   ├── blueos.ts             # BlueOS extension management
│   ├── network.ts            # Network interface info
│   ├── logs.ts               # System log tailing
│   ├── subnet.ts             # Subnet enforcement middleware
│   ├── rate-limit.ts         # API rate limiting
│   └── licensing/
│       └── gate.ts           # Ed25519 entitlement verification
├── install.sh                # One-command installer (v0.2.0)
└── package.json
```

## License

GPL-3.0 — see [LICENSE](../../LICENSE).
