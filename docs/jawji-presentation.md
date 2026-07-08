# Jawji — Presentation Notes (v0.0.38)

Everything new this session, each covering how it works, why it was chosen, what bugs got fixed, and what's next.

---

## 1. ESP32 wireless MAVLink bridge (DroneBridge)

**How it works:** A SpeedyBee F405-WING flight controller (iNav 9.0.1) talks to Jawji entirely over WiFi via an ESP32 running DroneBridge firmware. DroneBridge reads whatever comes in on the ESP32's UART pins and forwards it out over WiFi as UDP packets, and vice versa. Jawji connects over plain UDP to the ESP32's IP on port 14550 (DroneBridge's standard MAVLink port). No cable to the vehicle at any point.

**Why it was chosen:** This is a well-known, well-supported pattern in the drone world — a cheap ESP32 as a serial-to-WiFi bridge instead of tethering a laptop to the vehicle. Jawji already supported connecting to any UDP endpoint, so no new app features were needed — just correctly configuring three independent systems (flight controller, ESP32, Jawji) to agree with each other.

**Bugs fixed (configuration, not code):**
- **Wrong firmware assumption** — the board was initially assumed to run ArduPilot, which configures serial ports differently (global `SERIALx_PROTOCOL` params) than iNav (per-UART, per-function baud rates for MSP/Telemetry/Peripherals).
- **UART port conflict** — UART1 was flagged as both MAVLink telemetry *and* the RC receiver input on the same pins. A UART can only carry one protocol; freeing it from receiver duty (no physical receiver was plugged in) fixed the "receiving bytes but failing to decode MAVLink" symptom.
- **GPIO pin persistence** — DroneBridge's settings reverted on reflash; reconfiguring through DroneBridge's own web UI (not Jawji's mirrored copy) made changes stick.

**Next steps:** None — this is fully working and demo-ready. Power the FC and ESP32 independently (LiPo for the FC, USB power bank or wall charger for the ESP32).

---

## 2. Two real code bugs, found and fixed

**How it works / what was wrong:**
- **MAVLink packets were flowing through completely unvalidated.** Jawji's MAVLink parser has built-in length/checksum validation, but the code path that creates a live connection never called `registerMessages()` on it — so every packet, valid or corrupted, was accepted with zero checking. A truncated `PARAM_VALUE` packet (far more likely over lossy WiFi than USB) was enough to crash the app.
- **A build helper only worked by accident.** A small helper in Jawji's module system was raw, uncompiled TypeScript loaded directly by Node — works on very recent Node (what the dev machine had), broke immediately on CI's pinned, older Node version.

**Why they matter:** The first is a real robustness issue that only shows up over unreliable links (WiFi, telemetry radios) — exactly the kind of connection this session's ESP32 work relies on. The second is a classic "works on my machine" bug that silently blocked releases from building in CI.

**Bugs fixed:** Both, permanently — validation is now properly wired up; the build helper is now plain, portable JavaScript.

**Next steps:** None.

---

## 3. Theme toggle animation

**How it works:** Switching dark/light/system now plays a circular wipe growing outward from the toggle button, paired with a small sun or moon icon that rises and fades — a sunrise/moonrise effect instead of an instant color swap.

**Why it was chosen:** Small polish detail that reads as considered rather than default. Safe, low-risk demo filler.

**Bugs fixed / Next steps:** N/A — pure addition, nothing broken by it.

---

## 4. Jawji Agent installer + companion provisioning scripts

**How it works:** Jawji Agent is a background service (`packages/jawji-agent`) that runs on a Raspberry Pi, independent of the flight controller connection, exposing the Pi's own system state to Jawji. Install via `curl -fsSL https://jawji.space/agent/install.sh | sudo bash`, which builds and installs it as a systemd service on port 48400. On first boot it generates a pairing token written to its log (read via `journalctl -u jawji-agent`) — you prove you have access to the Pi before Jawji will pair with it. Discovery is via mDNS (`_jawji-agent._tcp`), the same technology behind AirPlay/network-printer discovery. Once paired: live CPU/memory/disk, a process list, a remote terminal, and streaming logs.

Four additional provisioning scripts (`packages/companion-scripts/`) layer on top of the same agent installer: `pi-telemetry.sh` (mavlink-router + WiFi AP via NetworkManager), `pi-video.sh` (MJPEG for Jawji's Camera panel + a separate H.264 stream for external viewers like QGroundControl), `pi-autonomy.sh` (MAVSDK Python environment), `jetson-cv.sh` (YOLO object detection, requires JetPack already installed).

**Why these choices:** A pairing token printed to a log (rather than a QR code or Bluetooth pairing) needs no extra hardware or libraries and reuses access you already need to install the agent in the first place. mDNS avoids needing to know a Pi's IP on a DHCP network. The autonomy and Jetson scripts deliberately *don't* auto-run mission/detection scripts on boot — auto-arming or auto-flying without an operator present is a safety hazard, so only `mavlink-router` and the agent start automatically.

**Bugs fixed:** The installer was a non-functional stub (`# TODO: Download pre-built binary from releases`, never actually built or copied anything) that would install a systemd service pointing at a file that doesn't exist, under the wrong service name (`Jawji-agent` vs. the documented `jawji-agent`). Three inconsistent, all-dead install URLs were scattered across the Companion Dashboard UI, the setup guide, and the wiki. The four companion-scripts templates advertised install commands for scripts that didn't exist anywhere in the repo. All of this is now fixed and URL-verified (HTTP 200) end to end.

**Next steps:** Nothing has been run against physical Pi/Jetson hardware yet — code-complete and URL-verified, not hardware-tested. Say so if asked directly.

---

## 5. jawji.space: docs, download, and cookie-policy pages

**How it works:** `jawji.space` is a real, deployed Next.js app (`jawji-gcs` — not `jawji-gcs-v2`, a non-deploying fork that tripped us up once) on Railway, auto-deploying from `main`. Added: a `/docs` section (sidebar-navigated, sourced from the project's GitHub wiki, rendered via `react-markdown`, extended with pages for app features the wiki didn't cover — Telemetry, Fleet, Mission Planning, Area Editor, Mission Library, MAVLink Inspector, Flight Log Analysis, AI Setup, Motor Test, Offline Parameters); a `/software` download page pulling real Windows installer/portable links from the latest GitHub release; a `/cookies` policy page linked from the existing cookie-consent banner; and `/agent/install.sh` + `/companion/{script}` redirects so every `curl` command referenced elsewhere actually resolves.

**Why it was chosen:** The docs content mirrors the wiki structure so there's one source of truth conceptually, extended only where the wiki was genuinely behind the app. Every new page's content came from reading the actual component code, not guessing.

**Bugs fixed:** A stale Lua Graph Editor reference (that feature was removed from the app previously, docs never caught up) was found and removed from the nav, the wiki, and the site. Screenshot placeholder lines (`![TODO: screenshot ...]()`) that were never filled in got stripped across every page. The `/software` page logo wasn't wrapped in a link back to the homepage — fixed.

**Next steps:** Confirmed live and reachable (`/docs`, `/software`, `/cookies` all return 200) — safe to demo directly.

---

## 6. Leaflet map z-index leak

**How it works / what was wrong:** Fleet's "Add Vehicle" modal was rendering *behind* the Leaflet map next to it. Leaflet's own panes and controls use z-index values up to 1000, and `.leaflet-container` never established its own CSS stacking context, so those values escaped and beat the modal's `z-50`.

**Why this fix:** A one-line CSS fix (`isolation: isolate` on `.leaflet-container`) rather than just raising the modal's z-index further, because the bug is a latent issue in *every* map-plus-modal combination in the app, not just Fleet — fixing the root cause fixes all of them at once.

**Bugs fixed:** This one.

**Next steps:** None — worth a quick visual check next time a map+modal screen comes up, but the fix is general.

---

## 7. Companion module: full architecture audit

**How it works:** Companion is gated behind a Settings toggle (`companionUnlocked`, off by default). Once on, the Dashboard has three largely independent tabs: **Store** (a static catalog — only the 2 ESP32 DroneBridge templates actually flash anything, everything else is copy-paste instructions), **DroneBridge** (talks to an ESP32 over plain, unauthenticated HTTP — DroneBridge's own open REST API, plus a USB-serial boot-log reader that force-resets the chip via DTR/RTS to recover its WiFi config without joining the network), and **Dashboard** (talks to a Jawji Agent over an authenticated WebSocket + REST — a completely different protocol and device than DroneBridge). The ESP32 flashing pipeline is the most complete part of the whole system: auto-downloads `esptool`, auto-downloads and caches the right firmware release, flashes with live progress, then reads the freshly-flashed device's boot log to auto-fill its WiFi IP. Camera/video is *not* code-wired to Companion at all — the Camera panel is purely MAVLink-driven and has no idea whether a stream happens to come from a companion Pi; the connection is convention only.

**Why these choices:** Two protocols instead of one because DroneBridge and Jawji Agent sit at different trust levels — DroneBridge is a dumb, open serial-to-WiFi bridge with no business having auth, while Jawji Agent runs arbitrary code (terminal, file access, Docker) on a real Linux box and needs real auth. The Store being mostly instructions rather than automation is a reasonable scope boundary — genuinely automating a full Rpanion or BlueOS install isn't something Jawji should own.

**Bugs found (audited, not fixed this session):**
1. `CompanionStoreDialog.tsx` has a dead flash handler (`firmwarePath: ''`, literal `TODO` comment) — likely superseded by `CompanionStoreTab.tsx` but never removed.
2. `esp32-mavlink-bridge` template is listed but not flashable — no `FIRMWARE_SOURCES` entry.
3. Saved pairing tokens are encrypted and persisted but never read back — no auto-reconnect on launch.
4. mDNS discovery is fully wired in the main process but no UI ever calls it — no "Scan for agents" button exists.
5. **Real functional bug:** the agent's `authMiddleware` gates `/api/v1/info` behind a bearer token, but the desktop's manual-IP `probeAgent()` calls it with no `Authorization` header — manual agent probing likely always fails (401) against a real deployed agent.
6. mDNS service-type casing differs between publisher (`Jawji-agent`) and browser (`jawji-agent`) — probably harmless (DNS-SD is case-insensitive) but worth knowing.

**Next steps (priority order):**
1. Fix the `probeAgent()` auth mismatch (#5) — this one actually blocks a real user flow.
2. Delete or fix `CompanionStoreDialog.tsx`'s dead flash path.
3. Add a `FIRMWARE_SOURCES` entry for `esp32-mavlink-bridge`, or remove it from the catalog.
4. Wire `getSavedToken()` into auto-reconnect on launch.
5. Add a "Scan for agents" button using the already-implemented `companionDiscover`.
6. Once a physical Pi is available: run the full install → pairing → dashboard flow end to end, the way the ESP32 link was validated in §1 — everything here is code-reviewed, not hardware-tested.
