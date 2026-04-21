# ArduDeck Alpha 30 Release Notes

**Video Overview:** <a href="https://youtu.be/EbCLNK7c2VQ?si=ZXYj52nbG8t9kFZg" target="_blank">Watch ArduDeck Alpha 30 on YouTube</a>

## Headline Features

### Flight Log Explorer

ArduDeck now parses DataFlash (.bin) logs natively with a full-featured log analysis suite:

- Full DataFlash binary parser with health checks and diagnostics
- Log Explorer with dockview panel layout and advanced field picker
- 3D Flight Path visualization - replay your flights in 3D space

![Health Report - battery, failsafe, vibration, GPS quality, flight modes, and compass diagnostics from a parsed DataFlash log](https://raw.githubusercontent.com/rubenCodeforges/ardudeck/master/screenshots/log-health-report.png)

![Log Explorer - 3D flight path colored by flight mode, vibration chart with time axis, and field picker sidebar](https://raw.githubusercontent.com/rubenCodeforges/ardudeck/master/screenshots/log-explorer-3d.png)

### Live Map Overlays - Weather Radar & Airspace

The telemetry and mission maps now support real-time overlays:

- Weather Radar - RainViewer integration with dynamic color schemes
- Airspace Zones - CTR, restricted, danger, and TMA zone polygons with color-coded legend (OpenAIP data)
- Aviation Tiles - OpenAIP tile layers
- Overlays work on both the telemetry map and mission planner map
- API keys are encrypted at rest

![Mission planner with airspace zones, altitude profile with terrain collision detection, and overlay layer selector](https://raw.githubusercontent.com/rubenCodeforges/ardudeck/master/screenshots/map-overlays-airspace.png)

### MAVLink Signing - Production-Ready

MAVLink 2 signing went from initial support to fully production-grade:

- Multi-key management - add, remove, and rotate signing keys
- Pre-connect configuration - set up signing before connecting
- MAVProxy compatibility - works seamlessly through proxy setups
- Fixed critical SHA256 computation and key-removal signing bugs

![MAVLink signing panel with passphrase entry, saved key list, and send-to-FC activation](https://raw.githubusercontent.com/rubenCodeforges/ardudeck/master/screenshots/mavlink-signing.png)

### Motor Test with Live Monitoring

New motor test tab for verifying motor order and direction before first flight:

- Physical frame layout diagram - see where each motor sits on your airframe
- Click any motor to spin it individually, or run sequence/all tests
- Live vibration, ESC temperature, RPM, voltage, and current monitoring during tests
- Safety guards for armed state
- Frame layout auto-detected from FRAME_CLASS and FRAME_TYPE parameters

![Motor Test - OCTA-X frame diagram with 8 motors, throttle and duration controls, vibration monitor, and ESC telemetry cards](https://raw.githubusercontent.com/rubenCodeforges/ardudeck/master/screenshots/motor-test.png)

### Companion Board Store & DroneBridge

Full companion board integration with a built-in firmware template store:

- Companion Board Store - browse pre-configured firmware templates for ESP32, Raspberry Pi, NVIDIA Jetson, and Orange Pi
- Templates organized by category (telemetry, autonomy, video, etc.) with USB flash support
- DroneBridge WiFi Telemetry, ESP-NOW Long Range, and MAVLink WiFi Bridge templates ready to flash
- DroneBridge USB serial reader - stream telemetry from DroneBridge-equipped companion computers
- Auto-detection and configuration of companion board connections
- Bridge auto-reconnects when ArduDeck restarts

![Companion Board Store - board selection with ESP32, Raspberry Pi, NVIDIA Jetson, and Orange Pi](https://raw.githubusercontent.com/rubenCodeforges/ardudeck/master/screenshots/companion-store.png)

![ESP32 templates - DroneBridge WiFi Telemetry, ESP-NOW Long Range, and MAVLink WiFi Bridge](https://raw.githubusercontent.com/rubenCodeforges/ardudeck/master/screenshots/companion-esp32-templates.png)

### Offline Map Tile Cache

Fly in the field with no internet:

- Region-based offline caching - select areas on the map and download tiles for offline use
- Visual region overlays showing cached areas
- Network status indicator - know when you are operating on cached data
- Cache refresh support to keep tiles up to date

---

## New Capabilities

### Offline Parameter Editing

Open, edit, and save .param files without connecting to a flight controller:

- Load any .param file directly from disk - full parameter list with search, grouping, and metadata
- Edit values, compare against other files, and save or save-as
- Vehicle type selector loads the correct parameter descriptions and validation
- Unsaved change indicator in the toolbar
- Seamlessly switch between offline editing and live FC connection

![Offline landing page - "Open Parameter File" prompt with feature overview](https://raw.githubusercontent.com/rubenCodeforges/ardudeck/master/screenshots/offline-params-landing.png)

![Offline parameter list - 1146 parameters loaded from file with toolbar, group filters, and regex search](https://raw.githubusercontent.com/rubenCodeforges/ardudeck/master/screenshots/offline-params-list.png)

### Prearm Checks & Flight Control Panels

- New prearm status panel showing all ArduPilot prearm checks with pass/fail indicators
- Flight control panels for in-flight actions

### ArduPilot SITL Integration

- Built-in Software-In-The-Loop simulation support - connect to SITL instances directly from ArduDeck for testing without hardware
- SITL simulator now available to all users
- Vehicle type, frame, release track, home location, and virtual RC control
- Windows support for Cygwin DLL downloads

![SITL Simulator - vehicle type selection, configuration, home location, running instance with virtual RC sliders](https://raw.githubusercontent.com/rubenCodeforges/ardudeck/master/screenshots/sitl-simulator.png)

### Critical Battery Failsafe

- New Critical Battery section in the Safety tab with configurable threshold and action presets

### Acceleration Limit Tuning

- ATC_ACCEL_x_MAX sliders added to the PID Tuning view - roll, pitch, and yaw acceleration limits with real-time adjustment

### Board-Linked Vehicle Profiles

- Profiles now store a board identifier - plug in a flight controller and ArduDeck loads the right profile automatically
- New board creates a blank profile instead of cloning the old one

### Heartbeat Watchdog

- Detects vehicle disconnect when heartbeats stop - critical fix for UDP connections where socket closure is not detected

### Messages Panel & Debug Console

- Messages panel on the connection screen shows MAVLink messages in real-time
- Debug console for protocol-level troubleshooting

### Regex Parameter Search

- The parameter list now supports full regex search - find parameters with patterns like `ATC_RAT_.*_P` or `BATT[12]_.*`

### Calibration Improvements

- Calibration now uses native MAVLink commands for ArduPilot instead of MSP fallback
- Option to save calibration to persistent storage on the flight controller
- Fixed calibration completion detection and bootloader save

### 3D Telemetry View

- Re-enabled the 3D telemetry view on the live telemetry screen

---

## Experimental

### AI-Assisted Log Analysis

> This feature is early and experimental. Results should be verified manually.

- AI can analyze parsed flight logs and suggest actionable parameter recommendations
- Recommendations can be applied or exported directly from the chat interface
- Includes reboot warnings where parameter changes require it
- Disclaimer dialog warns users about experimental nature

---

## Bug Fixes

| Issue | Fix |
|-------|-----|
| #13 | MAVLink signing - wrong CRC bytes after timestamp conversion |
| #15 | Calibration sending MSP commands to ArduPilot instead of MAVLink |
| #15 | Calibration completion and bootloader save not working correctly |
| #38 | New board cloned old profile instead of creating blank |
| #42 | Pixhawk flight modes showing raw numbers for Rover/Boat/Sub |
| #43 | False armed status during boot sequence |
| #49 | Readonly parameter flags missing from ArduPilot metadata |
| #50 | Low battery failsafe using wrong parameter names |
| #52 | INAV 6-point accelerometer calibration not saved |
| #53 | INAV flight mode names wrong |
| #56 | ELRS over MAVLink - added RC_CHANNELS_RAW fallback |
| #61 | Added MicoAir boards to firmware board list |
| #63 | MSP fallback on UDP/TCP crashed mavproxy |
| #64 | First parameter concatenated to header comment in .param files |
| #70 | SERVO_FUNCTION not accepting -1 (GPIO) |
| #73 | Map showing GPS MSL altitude instead of relative barometric altitude |
| #74 | Survey grid: altitude reference, overlap max, polygon editing, takeoff |
| #84 | Armed state cross-check too strict during boot, added transition logging |
| -- | Float params rounded to 6 significant digits on save |
| -- | macOS build failure during code signing |
| -- | Google Satellite set as default map layer |
| -- | ArduPilot SITL Cygwin DLL download on Windows |

---

## Quality & Polish

- UI refresh with cleaner layout across multiple views
- Removed preset selector cards from tuning tab
- Optimized screenshot capture
- Security hardening
