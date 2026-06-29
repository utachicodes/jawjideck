# Architecture

Jawji is a pnpm monorepo built around an Electron main/renderer split.

## Monorepo Structure

```
ardudeck/
├── apps/desktop/           # Electron app (main + renderer)
├── packages/mavlink-ts/    # MAVLink v1/v2 protocol definitions
├── packages/msp-ts/        # MSP v1/v2 protocol (Betaflight/iNav)
├── packages/jawji-agent/   # Companion board agent (ESP32/RPi/Jetson)
├── packages/module-sdk/    # SDK for third-party modules
└── tools/                  # Build scripts, CI helpers
```

## Data Flow

```
Flight Controller
  → Serial/TCP/UDP link
  → Main process parser (mavlink-ts / msp-ts)
  → IPC event (preload.ts)
  → Renderer Zustand stores (telemetry-store, flight-control-store)
  → Dashboard panels (dockview-react)
```

Manual control flows in reverse: renderer store → IPC → main process → serial/TCP/UDP → vehicle.

## Key Technologies

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 28 |
| UI framework | React 18 + TypeScript |
| State management | Zustand |
| Panel layout | dockview-react |
| Maps | Leaflet (2D) + MapLibre (3D) |
| Protocols | MAVLink v1/v2, MSP v1/v2 |
| Build | pnpm monorepo + electron-builder |
| Styling | Tailwind CSS with CSS custom properties for theming |

## Renderer Architecture

The renderer uses a view-based routing system managed by `navigation-store`. The `App.tsx` component renders:

1. **AppShell** — header with logo, version, arm/disarm, connection status
2. **NavigationRail** — left sidebar for view switching
3. **ConnectionPanel** — inline connection form (USB/TCP/UDP/SITL)
4. **Main content** — switches between views based on `currentView`

### View Registry

| View ID | Component | Description |
|---------|-----------|-------------|
| `telemetry` | TelemetryDashboard | Dockable panel layout with 16 panel types |
| `mission` | MissionPlanningView | Waypoint editor, survey planner, altitude profile |
| `parameters` | ParametersView | Full parameter list with search/edit/write |
| `settings` | SettingsView | Vehicle profiles, display, mission defaults |
| `firmware` | FirmwareFlashView | Flash ArduPilot/Betaflight/iNav firmware |
| `cli` | CliView | Terminal for legacy board configuration |
| `sitl` | SitlView | Software-in-the-loop simulator |
| `osd` | OsdView | OSD element preview |
| `calibration` | CalibrationView | Accelerometer/compass calibration |
| `lua-graph` | LuaGraphView | Visual Lua script editor |
| `companion` | CompanionDashboard | ESP32/RPi/Jetson management |
| `logs` | LogsView | DataFlash log analysis |
| `inspector` | MavlinkInspectorView | Raw MAVLink packet inspector |

## Telemetry Panels

The `TelemetryDashboard` uses dockview-react for a fully customizable panel layout:

- Attitude, Altitude, Speed, Battery, GPS, Position, Velocity
- Flight Mode, Flight Control (arm/disarm, mode switch, joystick)
- Map (2D/3D), Messages, Preflight Check
- Waypoint Table, Altitude Profile (mission monitoring)
- SITL Environment, SITL Failure panels

Panels can be rearranged, popped out to native Electron windows, and layouts saved/loaded.

## Theming

Dark/light/system themes use CSS custom properties defined in `globals.css`. Tailwind classes reference these tokens (`bg-surface`, `text-content`, `border-subtle`, etc.). Light mode has extensive accent color corrections for contrast.
