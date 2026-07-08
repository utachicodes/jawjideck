# Getting Started

## What Jawji is

Jawji is a ground control station (GCS) — the desktop app you use to configure a flight controller, plan and fly missions, monitor telemetry, and flash firmware. It's a modern Electron + React replacement for the legacy Mission Planner (a C#/.NET WinForms app that's been the de facto standard for years), built to talk to three different firmware families through their native protocols rather than one:

- **ArduPilot** (Copter, Plane, VTOL, Rover, Boat, Sub) over **MAVLink**
- **iNav** over **MSP**
- **Betaflight** over **MSP**

You don't pick which one up front — plug in a board and Jawji figures out the protocol and firmware automatically (see [What Happens on Connect](#what-happens-on-connect) below). That's the core design idea: one app, one connection panel, and the right configuration interface shows up regardless of what's actually on the other end of the cable.

## Download

Jawji currently ships pre-built releases for Windows only.

| Platform | Download |
|----------|----------|
| Windows | [Latest Release (.exe)](https://github.com/utachicodes/jawjideck/releases/latest) |

### Platform Notes

- **Windows** -- The app is unsigned. Windows Defender may show a SmartScreen warning on first launch. Click "More info" then "Run anyway".

The source is cross-platform (Electron/React) — contributors can build and run it from source on macOS or Linux.

## Connecting Your Flight Controller

Jawji supports three connection types: Serial (USB), TCP, and UDP. Which one you want depends on what's physically between you and the flight controller.

### Serial (USB)

This is the most common connection method for bench configuration — a direct USB cable, no wireless link in the middle.

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

Used for telemetry radios and remote connections — this is also what you'll use for a wireless bridge like an ESP32 running DroneBridge (see [[Companion Board]]).

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

Jawji remembers your last connection settings (port, baud rate, host, etc.) and restores them on next launch, so reconnecting to the same board is normally a single click.

## If the connection doesn't come up

- **No port appears in the dropdown (Serial).** Check the board is actually enumerating as a USB serial device — on Windows, look for it in Device Manager under "Ports (COM & LPT)". A missing driver (common on cheap/clone boards) is the usual cause.
- **Port appears but nothing happens after Connect.** Wrong baud rate is the most common cause when connecting over a wireless bridge rather than direct USB — the flight controller's serial port baud and the bridge's baud must match exactly (see the baud rate troubleshooting notes in [[Companion Board]] if you're going in over an ESP32 or telemetry radio).
- **Connects, then immediately drops.** Usually a second device (like another instance of Jawji, or the flight controller's own USB-native MAVLink port) already has the port open. Close anything else that might be talking to the board.
- **Firmware detected, but the wrong configuration UI shows up.** This shouldn't happen — if it does, it's worth filing as a bug, since protocol/firmware detection is meant to be automatic and correct.

## Navigation

The left sidebar contains all major sections:

| Icon | Section | Description |
|------|---------|-------------|
| Dashboard | Telemetry | Real-time attitude, GPS, battery, and sensor data |
| Map | Mission Planning | Waypoint editing, geofence, rally points |
| Fleet | Fleet | Roster of saved vehicles, one-click focus |
| Books | Mission Library | Browse and load saved missions |
| Sliders | Parameters | Vehicle configuration and tuning (see [[Configuration]]) |
| Wrench | MAVLink Inspector | Live message tree, graphing, filters |
| Chip | Firmware | Flash firmware to your board (see [[Firmware Flash]]) |
| Monitor | SITL Simulator | Run a simulated vehicle without hardware |
| Gear | Settings | App preferences and vehicle profiles |

Additional items appear when connected:
- **Calibration** -- Accelerometer and compass calibration wizards (any connection)
- **CLI Terminal** -- Direct CLI access (MSP connections only)
- **Companion** -- ESP32/Pi companion management (once unlocked in Settings)

## Where to go next

- New vehicle, never configured before? Start at [[Configuration]] for the tab-by-tab overview, then [[Tuning Presets]] for a fast, reasonable starting point before you touch individual PID/Rate values by hand.
- Want to fly a mission rather than just configure? Go straight to Mission Planning in the sidebar — waypoints, geofence, and rally points all live there.
- Setting up a wireless link (ESP32 bridge) or a Raspberry Pi companion computer? See [[Companion Board]].
- Something crashed or flew strangely and you want to know why? Load the `.bin` log under Flight Logs for automated health checks.
