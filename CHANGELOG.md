# Changelog

All notable changes to Jawji are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

Every pull request must add an entry here (see [Unreleased](#unreleased)) — CI rejects PRs that don't touch this file. Releases before this file was introduced are documented on the [GitHub Releases](https://github.com/utachicodes/jawjideck/releases) page.

## [Unreleased]

### Added
- AI Object Detection module: a real, working module (not a demo) that runs YOLOv8 object detection against the Camera panel's live MJPEG feed and draws bounding boxes directly on the video. Built on the existing module system's PTY permission (spawns a local Python process) — required two small, reusable additions to that system: a `camera` namespace on the module host API (so a module can read the active stream URL and push detection results) and a "local install" path in Module Manager for sideloading locally-built modules outside the marketplace/license flow. Requires `pip install ultralytics opencv-python` on the machine running Jawji; see `modules/ai-object-detection/README.md`.
- New guide: `docs/guides/companion-hardware-setup.md` — a complete, step-by-step walkthrough for pairing Jawji with an ESP32 wireless telemetry bridge and a Raspberry Pi companion computer (metrics, camera, and depth camera), tested against a ground robot but equally applicable to a flying vehicle. No app code changes were required for any of this — every piece documented here uses functionality that already existed (the Companion Store's ESP32/Pi flashing templates, the DroneBridge tab, the Jawji Agent pairing flow, and the Camera panel added in v0.0.37); the guide exists because that functionality had no end-to-end documentation connecting the pieces together. Covers, in order:
  - **Part 1 — ESP32 as a wireless MAVLink bridge (DroneBridge).** Flashing DroneBridge WiFi Telemetry onto the ESP32 via Companion Dashboard → Store, reading back its AP SSID/password/IP/baud rate/GPIO pins over USB after flashing, the exact 3-wire UART hookup to the flight controller (TX→RX, RX→TX, GND→GND) with a note that Jawji has no per-FC-model wiring wizard so GPIO pins may need manual adjustment in the DroneBridge Settings panel, joining the ESP32's AP, verifying live RSSI/throughput/client stats in the DroneBridge tab, and finally connecting Jawji's normal Connect panel to the ESP32 over TCP/UDP so arm/disarm/mode/mission all work exactly as they would over USB.
  - **Part 2 — Raspberry Pi companion computer (Jawji Agent).** The one-line install script (`curl -fsSL https://jawji.space/companion/pi-telemetry.sh | bash`) versus building `packages/jawji-agent` locally, retrieving the auto-generated pairing token via `journalctl -u jawji-agent`, and pairing through the Companion Dashboard's mDNS auto-discovery (`_jawji-agent._tcp`) to get live CPU/memory/disk metrics, a process list, remote terminal, and log streaming from the Pi.
  - **Part 3 — Pi camera feed in the Camera panel.** An explicit call-out that the built-in "Video + Telemetry" companion template streams H.264 over GStreamer/RTSP, which the Camera panel (MJPEG-only as of v0.0.37) cannot display — so the guide routes around it with a manual `mjpg-streamer` install instead, with separate exact commands for a USB UVC webcam versus the Pi Camera Module's legacy stack, plus a note on bridging the newer `libcamera` stack to a V4L2 loopback device when the legacy `input_raspicam.so` driver can't see the camera. Ends with the exact `http://<pi-ip>:8080/?action=stream` URL format the Camera panel expects.
  - **Part 4 — Intel RealSense depth camera feed.** Confirms zero new Jawji code is needed here either — a colorized depth image is just another MJPEG stream. Provides a complete, ready-to-run `depth_stream.py` (pyrealsense2 + OpenCV + Flask) that grabs raw 16-bit depth frames, colorizes them with `COLORMAP_JET` (near=red, far=blue), and serves them as MJPEG on port 8081 so it can run alongside the Part 3 color stream on port 8080; instructions for adding a second Camera panel instance (dockview supports multiple instances of the same panel type) pointed at the depth stream; and an explicit scope boundary noting this delivers a visual colorized preview only, not queryable per-pixel distance values — real depth-value readout (e.g. distance-at-cursor) would need a small data channel alongside the video and is called out as future scope, not built speculatively now.
  - A **"Putting it all together"** section describing the four services running simultaneously and independently (MAVLink over the ESP32's DroneBridge port, Jawji Agent on port 48400, color camera MJPEG on port 8080, depth camera MJPEG on port 8081 — no port conflicts) and a **troubleshooting table** covering the specific failure modes for each part (wrong AP IP, swapped UART wires, mDNS blocked on managed/guest networks, stream port/firewall issues, `pyrealsense2` wheel install failures, and depth-image colorization scaling).

### Removed
- `apps/web` and `vercel.json`. The web app had a recurring, unresolved Vercel deployment issue (a dashboard Output Directory override silently fighting `vercel.json`'s `outputDirectory` setting) and is no longer part of the project.

## [0.0.37] - 2026-07-02

### Added
- Camera feed panel: a new dockable "Camera" panel displays the focused vehicle's MJPEG video stream, via a manually-entered URL or MAVLink `VIDEO_STREAM_INFORMATION` auto-detection. Poppable to its own window like every other telemetry panel. RTSP/H.264 is not yet supported.
- Fleet management: a new Fleet view lets you add multiple vehicles (MAVLink and MSP) to a saved roster and monitor live status (armed/mode/battery/position) for all of them at once over lightweight, read-only connections. Every other view (Mission Planning, Parameters, Calibration, Firmware Flash, CLI, etc.) continues to operate on a single "focused" vehicle exactly as before — click Focus on any fleet tile to make it the active connection.
- Keyboard and joystick RC control, available for both MAVLink and MSP vehicles, selectable from a mutually-exclusive KB/JOY toggle in the header (previously the two could be active simultaneously and would fight over the same RC channels).
- Receiver-config auto-detect for MSP vehicles: on connect, Jawji now reads `MSP_RX_CONFIG` and shows a one-click "Fix" chip in the flight strip if the flight controller's receiver isn't set to MSP — without this, GCS-simulated stick input (joystick/keyboard) never reaches the motors even though arming and telemetry work fine.
- `getConnectionState` IPC call so detached (pop-out) windows can pull the current connection snapshot on open, instead of only listening for future state-change broadcasts.

### Fixed
- **Joystick RC control was a complete no-op** — the gamepad→RC-send interval had `gamepad.axes` in its `useEffect` dependency array; since that array is a new reference every animation frame (~60Hz), the interval was torn down and recreated before its 50ms tick could ever fire. Fixed by reading live axis values through a ref instead.
- MSP RC channel order (`RX_MAP`) was fetched from the flight controller but never applied when sending stick input back — always assumed Roll/Pitch/Throttle/Yaw order regardless of the board's actual configured order. Now remapped before every `MSP_SET_RAW_RC` send.
- Detached "Flight Control" pop-out window showed "Connect device" forever if opened after a connection was already established, since it only listened for future connection-state broadcasts.
- Type mismatch in the MAVLink arm/pre-arm RC override helper (`arming-helpers.ts` declared `Buffer` where the real signature returns `Uint8Array`).

### Changed
- Keyboard-control toggle moved from the bottom flight strip to the header, next to ARM/DISARM, decluttering the bottom bar; the flight strip now only shows live key/axis indicators while a mode is active.

### Removed
- OSD Simulator view and all supporting components/store/fonts.
- Lua Graph Editor view and its editor-only components (kept the shared graph-node renderer and types still used by the Lua script installer's read-only graph preview).

## [0.0.36] - 2026-06-29

### Added
- MATHIR cognitive memory MCP server integration (19 tools for agent memory).
- Auto-release GitHub Action: pushing a `v*` tag now creates a GitHub Release with changelog notes and triggers the build workflow.
- Architecture documentation (`docs/architecture/README.md`) covering monorepo structure, data flow, and view registry.
- Getting started guide (`docs/guides/getting-started.md`).
- Mock drone tool (`tools/mock-drone/`) for exercising the GCS without real hardware.
- Settings view reorganized into tabs (Display, Vehicle, Tools, About) with a dedicated ArduPilot flight stats panel, circular gauges, weather widget, and OpenAIP key input.
- Dashboard landing panels for recent connections and vehicle status; vehicle-type icon set (multicopter, fixed-wing, VTOL) with a shared vehicle-type map.
- New shared UI primitives: `OnboardingWizard`, `SectionHeader`, `StatCard`, `Tabs`.

### Removed
- Betaflight dashboard components, superseded by the reorganized settings/dashboard views.

### Fixed
- New vehicle profiles now use the actual detected vehicle type (from MAVLink heartbeat) instead of defaulting to "copter". Profile name uses real board name instead of "New Board".
- Vehicle profiles auto-populate specs (battery capacity, cell count, motor count, stall speed) from drone parameters after connection. Diff notification shown when drone values differ from profile.

## [0.0.35] - 2026-06-26

### Added
- Manual stick control (RC_CHANNELS_OVERRIDE) for MAVLink/ArduPilot vehicles in the Flight Control panel — previously only MSP (Betaflight/iNav) vehicles had GCS-driven joystick/throttle control. Opt-in toggle; never starts automatically.
- Bug report issue template, auto-labeled `bug`, aligned with the in-app `.jawjireport` flow.
- `[[wiki link]]` validator (`tools/check-wiki-links.mjs`), wired into the Links CI workflow — `lychee` doesn't understand GitHub's Gollum-style `[[Page Name]]` links.

### Fixed
- Broken wiki links: missing `MAVLink Signing` page (now written), and stale repo URLs in the wiki sidebar footer.
- Windows portable build: `artifactName` had no token distinguishing the NSIS installer from the portable target, so both built to the same filename and the portable .exe silently never made it into releases (confirmed missing from the v0.0.34 release too).
- ArduPilot SITL macOS binary downloads were 404ing: `GITHUB_RELEASES_URL` in `ardupilot-sitl-downloader.ts` pointed at a GitHub repo that doesn't exist. Corrected to the repo that actually hosts the `sitl-v*` releases.
- Two more stale `rubenCodeforges/Jawji` URLs (nonexistent repo) in `wiki/Getting-Started.md`'s download table — corrected and trimmed to Windows-only, matching the rest of this release.
- Links CI: `jawji.com`, `raspberrypi.com`, and `adlerblix.de` were failing (403/415) from bot/WAF protection, not because the links are actually broken — set a realistic User-Agent and accept 403/415 as a fallback.

## [0.0.34] - 2026-06-25

### Changed
- Release pipeline now builds and publishes Windows only; macOS and Linux build jobs removed from CI.
- README updated to reflect Windows-only distribution and document the project architecture.

### Added
- `CHANGELOG.md` with a required-update CI check on pull requests.
- Security CI: secret scanning, CodeQL, and dependency audit.
- Markdown link checker for README and wiki docs.

### Fixed
- DFU scan breaking normal board connect.
- DFU post-flash reconnect.
- Release pipeline: Linux executable case mismatch and macOS-blocks-all-uploads.
