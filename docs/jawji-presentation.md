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

**Bugs fixed (all 6, follow-up session):**
1. **`probeAgent()` auth mismatch (the real one).** `/api/v1/info` is now defined before `authMiddleware` mounts, so it's genuinely unauthenticated — matches what the desktop's manual-IP probe always assumed. Manual agent probing actually works now.
2. **`CompanionStoreDialog.tsx` deleted.** Confirmed orphaned (no imports anywhere in the codebase) before removing it — its flash handler was a stub with an empty `firmwarePath` and a literal `TODO`.
3. **`esp32-mavlink-bridge` template removed**, not patched. Its cited project (`mavesp8266`) turned out to actually be an ESP8266 project (individual `.bin` files from ArduPilot's firmware server), not a GitHub-release zip matching the ESP32 flasher's expected chip-directory structure — no verified firmware source existed to wire up safely, so the honest fix was removing the template rather than guessing at a download URL that could brick real hardware.
4. **Saved pairing tokens now get used.** The last host+port a user successfully paired with is persisted alongside the token; on app launch, a fire-and-forget reconnect attempt fires automatically if both exist. Silent on failure (agent offline, IP changed) — same manual-reconnect fallback as before this existed.
5. **"Scan for agents" button added** to `DashboardConnectForm`, wired to the mDNS discovery IPC that already existed in the main process but had no UI calling it. Results show as clickable host:port rows that prefill the connect form.
6. **mDNS casing fixed** — agent now publishes `jawji-agent` (lowercase), matching what the desktop was already browsing for.

**Next steps:** Run the full install → pairing → dashboard flow end to end against a physical Pi once one's available — everything above is code-reviewed and typechecked, not hardware-tested.

## 8. The "one script" installer + MediaMTX architecture

**How it works:** A single command now replaces the "install Docker, mavlink-router, NetworkManager, MediaMTX, MAVSDK, Jawji Agent, configure each, enable services, reboot" checklist:

```
curl -fsSL https://jawji.space/install.sh | sudo bash
```

It detects the hardware (Jetson via `/etc/nv_tegra_release`, Pi via `/proc/cpuinfo`, else generic Linux), then offers three profiles instead of a component shopping list:

| Profile | Installs |
|---|---|
| **Basic Companion** | Jawji Agent + MAVLink telemetry + WiFi AP |
| **Vision Companion** | + MediaMTX (RTSP/RTMP/HLS/WebRTC) |
| **AI Companion** | + MAVSDK + YOLO object detection (Jetson only) |

A profile can be given as an argument (`install.sh vision`), via `WITH_*` environment variables for scripting, or picked from an interactive menu — reading prompts from `/dev/tty` explicitly, since `curl | bash` has no stdin of its own to read from otherwise. The actual install logic lives in one shared `lib.sh`, sourced by both `install.sh` and the four original per-template scripts (kept as thin wrappers — `pi-telemetry.sh` is now three lines that just call `install.sh basic` — so the existing Companion Store templates don't break).

**MediaMTX** (a real, actively maintained project — `bluenviron/mediamtx`, ~30k+ stars, "nginx for video") replaces the ad hoc single-purpose GStreamer UDP pipeline the video template used before. One camera source (a local camera published in via `ffmpeg`) can now serve RTSP, RTMP, HLS, and WebRTC simultaneously — QGroundControl, a browser, VLC, and (once it supports WebRTC/HLS) Jawji itself, all watching the same stream. `mjpg-streamer` stays installed alongside it, because Jawji's Camera panel is still MJPEG-only today — that's the real bridge until the panel gets a WebRTC/HLS player. The script is upfront about the real constraint this creates: most USB webcams only let one process hold `/dev/video0` open at a time, so running both against the same physical camera will contend rather than both working.

**Jawji Agent as orchestrator (first piece).** Rather than the agent implementing video streaming itself, it queries MediaMTX's own local API (bound to `127.0.0.1:9997`, never network-exposed) for real stream status — active paths, whether a publisher is genuinely connected, reader counts — and exposes that through its existing authenticated REST API (`GET /api/v1/mediamtx`), the same pattern it already uses for services, processes, and Docker containers. This is a working proof of concept of the "agent manages dedicated tools, doesn't reinvent them" architecture, for one component.

**Why these choices:**
- **Profiles over a checkbox list** because most people know "I want video" or "I want autonomy," not which five specific packages that requires — the mapping from intent to components is exactly what a profile is for.
- **MediaMTX over building a custom pipeline** because it's not tied to drones at all — it's a general media server that already solves protocol conversion, recording, and multi-consumer distribution, all things a bespoke GStreamer pipeline would have to reinvent badly.
- **Agent queries MediaMTX's API rather than re-implementing status tracking** because MediaMTX already knows its own state authoritatively — parsing that is strictly more honest than the agent guessing from `systemctl is-active` alone (which only tells you the process is running, not that a camera is actually publishing).
- **Keeping the four original per-template scripts as wrappers** rather than deleting them, because the existing Companion Store templates' `installCommand` fields already point at those exact URLs — breaking them would be the same "advertised command 404s" bug fixed earlier in this session, just self-inflicted this time.

**Next steps:**
1. Build a WebRTC or HLS player component for Jawji's Camera panel — this is the piece that actually closes the loop and makes MediaMTX's output watchable inside Jawji itself, not just via external tools. (Notably, the *other* Jawji product — the web-based `jawji-gcs` at jawji.space — already has this built, `mediamtx-player.tsx`, on an unmerged branch. Porting the approach, not necessarily the code, is a reasonable starting point.)
2. Extend agent-as-orchestrator to `mavlink-router` and MAVSDK the same way it now covers MediaMTX — richer status than "is the systemd service running" (e.g. mavlink-router's actual connected-endpoint count).
3. Hardware-test the new `install.sh` end to end on a real Pi and a real Jetson, same caveat as everything else companion-related this session: code-reviewed and syntax-checked, not yet run against physical hardware.
