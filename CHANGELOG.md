# Changelog

All notable changes to Jawji are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

Every pull request must add an entry here (see [Unreleased](#unreleased)) — CI rejects PRs that don't touch this file. Releases before this file was introduced are documented on the [GitHub Releases](https://github.com/utachicodes/jawjideck/releases) page.

## [Unreleased]

### Changed
- **Renamed `jawji-agent` to `jawji-controller`** across the entire product: `packages/jawji-agent` → `packages/jawji-controller`, the npm package (`@jawji/jawji-controller`), the systemd/OpenRC service, the mDNS discovery type (`_jawji-controller._tcp`), all `JAWJI_AGENT_*` environment variables (now `JAWJI_CONTROLLER_*`), the companion installer's `WITH_AGENT` flag (now `WITH_CONTROLLER`), and every UI string, doc, and wiki page that referenced the old name. jawji.space's `/agent/install.sh` route becomes `/controller/install.sh` to match (tracked separately in the jawji-gcs repo). Also fixed a pre-existing mixed-case bug (`.Jawji-agent` token directory and `Jawji-agent` protected-process default were inconsistent with the lowercase service/mDNS names used everywhere else) while renaming. Confirmed nothing was deployed in the field yet, so this is a clean rename with no backward-compatibility shim.

### Added
- **Design spec for a licensing and payments core** (`docs/superpowers/specs/2026-07-09-licensing-payments-core-design.md`), the shared backend that will gate the official Jawji product experience going forward. jawjideck stays GPL-3.0 — the source remains free to build — under an open-core model where the subscription gates the *official* product (pre-built installers, account/sync between desktop and web, marketplace access, license activation) rather than the source itself. The same purchase-code-redeem mechanism is designed to be reused across the base subscription, jawji-orchestrator licenses, and future Jawji Intelligence modules. Design only in this release — no licensing code has shipped yet.
- **Licensing & Payments Core, Jawji Intelligence API, and a new MAVLink bridge shipped in jawji-gcs** (separate repo, [github.com/utachicodes/jawji-gcs](https://github.com/utachicodes/jawji-gcs)): activation-code generation/redemption, HMAC-signed offline-cacheable entitlement tokens, a manual `PaymentProvider` implementation, Firebase Admin Realtime Database wiring, and `/api/licensing/*` + `/api/intelligence/*` routes per the design spec above. Also adds a real MAVLink v1/v2 parser (frame parsing, reference CRC-16, HEARTBEAT codec) and a Socket.IO-based `mavlink:connect`/`mavlink:disconnect` bridge so jawji-gcs can talk directly to a vehicle over TCP/UDP, mirroring jawjideck's desktop connection model.

### Fixed
- **Two vulnerabilities found in a self-conducted security review of the jawji-gcs licensing/MAVLink work above, before it was pushed:** (1) the manual payment webhook read its HMAC signature but never verified it, letting anyone mint themselves an unredeemed license by POSTing a crafted body to `/api/licensing/webhook` — now verified with `timingSafeEqual` and fails closed if `MANUAL_PAYMENT_WEBHOOK_SECRET` is unset or the signature is wrong. (2) the new MAVLink bridge's `mavlink:connect` handler passed client-supplied `host`/`port` straight into a server-side TCP/UDP socket with no validation, letting any authenticated (even free-trial) user make the server probe loopback, link-local, and cloud-metadata addresses (`169.254.169.254`) — now resolved and checked against a blocklist (`lib/server/mavlink/host-validation.ts`) before connecting, while still allowing the RFC1918 ranges drones normally sit on.

## [0.0.40] - 2026-07-09

### Added
- **jawji-orchestrator**, a new standalone package published separately at [github.com/utachicodes/jawji-orchestrator](https://github.com/utachicodes/jawji-orchestrator) (`@jawji/orchestrator` on npm). Runs on a companion computer as its own process with a direct MAVSDK connection to the flight controller, independent of whether a Jawji GCS is connected at all. Ships a `VisionAssistMode` framework with a first mode, `LandingZoneCheckMode`: on entering LAND mode it holds the vehicle, captures a frame, asks an integrator-supplied vision-language model whether the site is safe, and if not, gates any repositioning behind an external confirm by default (`confirmPolicy: 'gated'`) rather than acting unattended. There is no official MAVSDK Node.js client on npm — verified directly against the `mavlink` GitHub org and the npm registry before building this — so the package generates its own gRPC client from the official `mavlink/MAVSDK-Proto` definitions using `@grpc/grpc-js` (pure JavaScript, no native addon, which matters for cross-compiling to Jetson/Pi ARM). Not yet wired into Jawji desktop or `jawji-agent`; this release only ships the standalone package.

### Changed
- **Companion Store templates now call the one-script installer directly.** Telemetry Bridge, Video + Telemetry, Autonomous Mission Runner, and Computer Vision Companion each used to point at their own per-template wrapper script (`pi-telemetry.sh`, `pi-video.sh`, `pi-autonomy.sh`, `jetson-cv.sh`) that did nothing but call `install.sh` with fixed args. They now call `curl -fsSL https://jawji.space/install.sh | sudo bash -s -- <profile>` (or the equivalent `WITH_*` flags for Autonomous Mission Runner's non-profile combination) directly. `pi-video.sh`'s one genuinely unique step — installing `mjpg-streamer` alongside MediaMTX, since Jawji's Camera panel only decodes MJPEG today — is now a `WITH_MJPG` flag built into `install.sh`'s `vision` profile itself, so nothing was lost in the consolidation.
- `docs/guides/companion-hardware-setup.md` and `wiki/Companion-Board.md` (both published to jawji.space's `/docs` section) rewritten to lead with the one-script installer and its profile/`WITH_*` reference, instead of the old fully-manual `apt install mjpg-streamer` walkthrough.

### Removed
- `packages/companion-scripts/pi-telemetry.sh`, `pi-video.sh`, `pi-autonomy.sh`, `jetson-cv.sh` — superseded by calling `install.sh` directly (see above); nothing else in the app referenced these filenames.

### Fixed
- **MAVLink signing log falsely implied the connection was blocked.** "Vehicle requires MAVLink signing but no key is configured... before connecting" read as a hard requirement, but nothing in the connection path actually gates on it — the heartbeat handshake and telemetry flow proceed regardless. Downgraded to an `info`-level note that the connection continues without signing.
- **Jawji Agent crashed entirely if `journalctl`/`tail` was missing.** `spawn()` reports a missing binary asynchronously via the child process's `'error'` event, not a synchronous throw, so the existing try/catch around log tailing never caught it — an unhandled `'error'` event took down the whole agent process (REST API, WebSocket, and mDNS discovery included), not just log tailing. Affects any companion board without `journalctl` (the installer explicitly supports non-systemd `generic-linux`). Now falls back from `journalctl` to `tail` to a warning instead of crashing.

## [0.0.39] - 2026-07-08

### Added
- **Linux release.** Pre-built AppImage and .deb packages, built and uploaded automatically by a new `build-linux` CI job — the `linux` target in electron-builder's config existed already but was never actually built by CI until now. macOS remains not-yet-published; the source already builds there from source.
- **WebRTC camera support.** The Camera panel now supports MediaMTX's WHEP endpoint (`http://host:8889/<path>/whep`) alongside the original MJPEG path, via a protocol toggle in the connect form. Implemented as a non-trickle-ICE WHEP client (gathers all ICE candidates locally, sends one offer, gets one answer back) rendering to a `<video>` element — no external WebRTC library needed, just the browser APIs Electron/Chromium already provides.
- **One-script companion installer.** `curl -fsSL https://jawji.space/install.sh | sudo bash` replaces installing Docker/mavlink-router/NetworkManager/MediaMTX/MAVSDK/Jawji Agent one at a time. Detects hardware (Jetson/Raspberry Pi/generic Linux) and offers three profiles — Basic (agent + MAVLink), Vision (+ MediaMTX), AI (+ MAVSDK + YOLO, Jetson only) — selectable via argument, `WITH_*` env vars, or an interactive menu. The four original per-template scripts (`pi-telemetry.sh`, `pi-video.sh`, `pi-autonomy.sh`, `jetson-cv.sh`) are now thin wrappers around the same shared install functions (`packages/companion-scripts/lib.sh`), kept for backward compatibility with existing Companion Store templates.
- **MediaMTX video relay.** Replaces the previous ad hoc single-purpose GStreamer UDP pipeline in the Video + Telemetry companion template with a real, actively-maintained multi-protocol media server (RTSP/RTMP/HLS/WebRTC) — one camera source can now serve QGroundControl, a browser, VLC, and Jawji simultaneously. `mjpg-streamer` still installs alongside it as the bridge for Jawji's current MJPEG-only default.
- **Jawji Agent as orchestrator (first piece).** The agent now queries MediaMTX's own local API (bound to localhost, never network-exposed) for real stream status — active paths, whether a publisher is genuinely connected, reader counts — and exposes it over its existing authenticated REST API (`GET /api/v1/mediamtx`), the same pattern already used for services, processes, and Docker containers.
- **"Scan for agents"** button in the Companion Dashboard's connect form, using the mDNS discovery IPC that already existed in the main process but had no UI calling it.
- **Automatic reconnect** to the last-paired Jawji Agent on app launch, using its encrypted saved pairing token — previously the token was saved but never read back.
- Companion documentation (`wiki/Companion-Board.md`, `wiki/Getting-Started.md`) and jawji.space's `/docs` section updated for all of the above, plus a `/software` page listing real per-platform download links pulled from the release, and a `/cookies` policy page.

### Fixed
- **A real functional bug in Companion Agent discovery:** the agent's `/api/v1/info` endpoint was gated behind `authMiddleware`, but the desktop's manual-IP probe (`probeAgent()`) called it with no `Authorization` header — meaning manually pairing with an agent by IP address always failed with a 401 against a real deployed agent. `/api/v1/info` is now genuinely exempt from auth, matching what the desktop always assumed (it only returns non-sensitive identity info: hostname, OS, versions).
- **DroneBridge wireless MAVLink bridge**, end to end: corrected an initial wrong-firmware assumption (the flight controller runs iNav, which configures serial ports per-UART rather than ArduPilot's global `SERIALx_PROTOCOL`), a UART port conflict where UART1 was flagged as both MAVLink telemetry and the RC receiver input simultaneously, and DroneBridge GPIO settings reverting after reflash (fixed by reconfiguring through DroneBridge's own web UI rather than Jawji's mirrored settings).
- **MAVLink packets were flowing through completely unvalidated** on live connections: `MAVLinkParser` was instantiated but `registerMessages()` was never called, so every packet — valid or corrupted — bypassed length/checksum validation entirely. A truncated `PARAM_VALUE` packet (far more likely over a lossy WiFi link than USB) was enough to crash the app. Malformed packets are now dropped instead of crashing message handlers.
- A build helper in the module system was raw, uncompiled TypeScript loaded directly by Node — worked on recent local Node versions, broke on CI's pinned older version. Converted to plain, portable JavaScript.
- Removed `CompanionStoreDialog.tsx`: confirmed orphaned (no imports anywhere), its flash handler was a stub passing an empty firmware path with a literal TODO comment. Superseded by `CompanionStoreTab.tsx`.
- Removed the `esp32-mavlink-bridge` Companion Store template: its cited upstream project (`mavesp8266`) turned out to actually be an ESP8266 project distributing individual `.bin` files, not a GitHub-release zip matching the ESP32 flasher's expected structure — no verified firmware source existed to wire up safely.
- Fixed mDNS service-type casing mismatch between the agent (was publishing `Jawji-agent`) and the desktop (browsing for `jawji-agent`).
- Fixed a Leaflet z-index leak where Fleet's "Add Vehicle" modal rendered behind the map next to it — a latent bug in every map-plus-modal combination in the app, not just Fleet, fixed at the root (`isolation: isolate` on `.leaflet-container`) rather than patched locally.
- Companion install URLs were dead across the app: `packages/jawji-agent/install.sh` was a non-functional stub, three different inconsistent URLs pointed at nothing (Companion Dashboard UI, setup guide, wiki), and four companion-scripts templates advertised install commands for scripts that didn't exist. All now point at real, URL-verified scripts.
- Broken `/software` page logo (wasn't wrapped in a link back to the homepage) on jawji.space.
- Removed a stale Lua Graph Editor reference from the docs/wiki nav — that feature was removed from the app in a previous release, but the documentation never caught up.

## [0.0.38] - 2026-07-07

### Added
- AI Object Detection module: a real, working module (not a demo) that runs YOLOv8 object detection against the Camera panel's live MJPEG feed and draws bounding boxes directly on the video. Built on the existing module system's PTY permission (spawns a local Python process) — required two small, reusable additions to that system: a `camera` namespace on the module host API (so a module can read the active stream URL and push detection results) and a "local install" path in Module Manager for sideloading locally-built modules outside the marketplace/license flow. Requires `pip install ultralytics opencv-python` on the machine running Jawji; see `modules/ai-object-detection/README.md`.
- New guide: `docs/guides/companion-hardware-setup.md` — a complete, step-by-step walkthrough for pairing Jawji with an ESP32 wireless telemetry bridge and a Raspberry Pi companion computer (metrics, camera, and depth camera), tested against a ground robot but equally applicable to a flying vehicle. No app code changes were required for any of this — every piece documented here uses functionality that already existed (the Companion Store's ESP32/Pi flashing templates, the DroneBridge tab, the Jawji Agent pairing flow, and the Camera panel added in v0.0.37); the guide exists because that functionality had no end-to-end documentation connecting the pieces together. Covers, in order:
  - **Part 1 — ESP32 as a wireless MAVLink bridge (DroneBridge).** Flashing DroneBridge WiFi Telemetry onto the ESP32 via Companion Dashboard → Store, reading back its AP SSID/password/IP/baud rate/GPIO pins over USB after flashing, the exact 3-wire UART hookup to the flight controller (TX→RX, RX→TX, GND→GND) with a note that Jawji has no per-FC-model wiring wizard so GPIO pins may need manual adjustment in the DroneBridge Settings panel, joining the ESP32's AP, verifying live RSSI/throughput/client stats in the DroneBridge tab, and finally connecting Jawji's normal Connect panel to the ESP32 over TCP/UDP so arm/disarm/mode/mission all work exactly as they would over USB.
  - **Part 2 — Raspberry Pi companion computer (Jawji Agent).** The one-line install script (`curl -fsSL https://jawji.space/companion/pi-telemetry.sh | bash`) versus building `packages/jawji-agent` locally, retrieving the auto-generated pairing token via `journalctl -u jawji-agent`, and pairing through the Companion Dashboard's mDNS auto-discovery (`_jawji-agent._tcp`) to get live CPU/memory/disk metrics, a process list, remote terminal, and log streaming from the Pi.
  - **Part 3 — Pi camera feed in the Camera panel.** An explicit call-out that the built-in "Video + Telemetry" companion template streams H.264 over GStreamer/RTSP, which the Camera panel (MJPEG-only as of v0.0.37) cannot display — so the guide routes around it with a manual `mjpg-streamer` install instead, with separate exact commands for a USB UVC webcam versus the Pi Camera Module's legacy stack, plus a note on bridging the newer `libcamera` stack to a V4L2 loopback device when the legacy `input_raspicam.so` driver can't see the camera. Ends with the exact `http://<pi-ip>:8080/?action=stream` URL format the Camera panel expects.
  - **Part 4 — Intel RealSense depth camera feed.** Confirms zero new Jawji code is needed here either — a colorized depth image is just another MJPEG stream. Provides a complete, ready-to-run `depth_stream.py` (pyrealsense2 + OpenCV + Flask) that grabs raw 16-bit depth frames, colorizes them with `COLORMAP_JET` (near=red, far=blue), and serves them as MJPEG on port 8081 so it can run alongside the Part 3 color stream on port 8080; instructions for adding a second Camera panel instance (dockview supports multiple instances of the same panel type) pointed at the depth stream; and an explicit scope boundary noting this delivers a visual colorized preview only, not queryable per-pixel distance values — real depth-value readout (e.g. distance-at-cursor) would need a small data channel alongside the video and is called out as future scope, not built speculatively now.
  - A **"Putting it all together"** section describing the four services running simultaneously and independently (MAVLink over the ESP32's DroneBridge port, Jawji Agent on port 48400, color camera MJPEG on port 8080, depth camera MJPEG on port 8081 — no port conflicts) and a **troubleshooting table** covering the specific failure modes for each part (wrong AP IP, swapped UART wires, mDNS blocked on managed/guest networks, stream port/firewall issues, `pyrealsense2` wheel install failures, and depth-image colorization scaling).

### Fixed
- MAVLink packet validation (length + CRC) was silently disabled on both live-connection code paths: `MAVLinkParser` was instantiated but `registerMessages()` was never called on it, so every packet — valid or corrupted — took the parser's "unknown message" fallback and was queued without any validation. Surfaced as an uncaught crash in `deserializeParamValue` when a truncated `PARAM_VALUE` packet (far more likely over a lossy WiFi/UDP link, e.g. an ESP32 DroneBridge bridge, than over USB serial) reached the handler with a too-short payload. Malformed packets are now dropped instead of crashing message handlers.

### Removed
- `apps/web` and `vercel.json`. The web app had a recurring, unresolved Vercel deployment issue (a dashboard Output Directory override silently fighting `vercel.json`'s `outputDirectory` setting) and is no longer part of the project.

### Security
- Bumped `ws` to `8.21.0` (was `8.19.0`) — patches a memory-exhaustion DoS from tiny WebSocket fragments (GHSA-96hv-2xvq-fx4p).
- Pinned `fast-uri` to `^3.1.2` via a pnpm override (was resolving to `3.1.0` through `electron-store` → `conf` → `ajv`) — patches a path-traversal/host-confusion pair of advisories (GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc).
- Remaining high/critical advisories from `pnpm audit` are all in build-time-only tooling (`tools/mavlink-generator`'s `fast-xml-parser`/`minimatch`) or the Pi-side companion agent's Docker client (`jawji-agent`'s `dockerode` → `protobufjs`/`@grpc/grpc-js`/`systeminformation`), none of which ship inside the desktop app — tracked as the existing backlog documented in `.github/workflows/security.yml`.

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
