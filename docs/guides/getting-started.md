# Getting Started

## Prerequisites

- **Node.js** 20+
- **pnpm** 9+
- **Python 3.x** (for SITL and build scripts)

## Setup

```bash
git clone https://github.com/utachicodes/jawjideck.git
cd jawjideck
pnpm install
pnpm build
pnpm dev
```

## First Connect

1. Plug in your flight controller via USB
2. Jawji auto-detects the serial port
3. Click **Connect** in the Connection panel
4. Telemetry panels populate with live data

## SITL (No Hardware Required)

1. Go to **Connection → Simulator**
2. Choose **ArduPilot** or **iNav**
3. Click to download and launch
4. Jawji connects automatically when the simulator starts

## Building for Production

```bash
pnpm package
```

Output: `apps/desktop/release/` (Windows NSIS installer + portable .exe)
