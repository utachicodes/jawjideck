# Getting Started

## Download

Jawji currently ships pre-built releases for Windows only.

| Platform | Download |
|----------|----------|
| Windows | [Latest Release (.exe)](https://github.com/utachicodes/jawjideck/releases/latest) |

### Platform Notes

- **Windows** -- The app is unsigned. Windows Defender may show a SmartScreen warning on first launch. Click "More info" then "Run anyway".

The source is cross-platform (Electron/React) — contributors can build and run it from source on macOS or Linux.

## Connecting Your Flight Controller

Jawji supports three connection types: Serial (USB), TCP, and UDP.

### Serial (USB)

This is the most common connection method for bench configuration.

1. Plug your flight controller into USB
2. Open the Connection panel (top-left)
3. Your board's serial port should appear in the port dropdown
4. Select the port and baud rate (115200 is the default for most boards)
5. Click **Connect**

### TCP

Used for SITL simulators and network connections.

1. Switch to the **TCP** tab in the Connection panel
2. Enter the host IP (default: `127.0.0.1` for local SITL)
3. Enter the port (default: `5760`)
4. Click **Connect**

### UDP

Used for telemetry radios and remote connections.

1. Switch to the **UDP** tab in the Connection panel
2. Choose a mode:
   - **Listen (Server)** -- Jawji listens for incoming packets on a local port (default: `14550`)
   - **Client (Connect)** -- Jawji sends to a remote device at a specified IP and port
3. Click **Connect**

## What Happens on Connect

Once Jawji receives a heartbeat from your flight controller:

1. **Protocol detection** -- Jawji identifies whether the board speaks MAVLink (ArduPilot) or MSP (Betaflight/iNav)
2. **Vehicle identification** -- Vehicle type (Copter, Plane, Rover, etc.), firmware variant, and version are read
3. **Parameter fetch** -- All parameters are downloaded from the flight controller
4. **UI routing** -- The configuration interface switches to the correct view for your firmware:
   - ArduPilot boards get the MAVLink configuration tabs
   - Modern iNav/Betaflight boards get the MSP configuration tabs
   - Legacy boards (iNav < 2.1, Betaflight < 4.0) get the CLI-powered GUI

Jawji remembers your last connection settings (port, baud rate, host, etc.) and restores them on next launch.

## Navigation

The left sidebar contains all major sections:

| Icon | Section | Description |
|------|---------|-------------|
| Dashboard | Telemetry | Real-time attitude, GPS, battery, and sensor data |
| Sliders | Parameters | Vehicle configuration and tuning (see [[Configuration]]) |
| Map | Mission Planning | Waypoint editing, geofence, rally points |
| Books | Mission Library | Browse and load saved missions |
| Gear | Settings | App preferences and vehicle profiles |
| Chip | Firmware | Flash firmware to your board (see [[Firmware Flash]]) |
| Screen | OSD Simulator | Preview MAX7456 OSD with bundled fonts |
| Grid | Lua Graph Editor | Visual Lua scripting (see [[Lua Graph Editor]]) |

Additional items appear when connected:
- **Calibration** -- Accelerometer and compass calibration wizards (any connection)
- **CLI Terminal** -- Direct CLI access (MSP connections only)

![TODO: screenshot of main interface with navigation rail]()