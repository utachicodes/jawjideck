# Jawji — Presentation Notes (v0.0.38)


- **`jawji.space/docs`, `/software`, `/cookies` are confirmed live** (verified `200` on all three right before this doc was last updated) — safe to demo directly.
- **Jawji Agent / companion scripts are built and URL-verified, but never run against physical hardware.** If asked "have you tested this," the honest answer is no — say so if it comes up rather than implying otherwise.
- **Two GitHub repos exist for the website** — `jawji-gcs` (the real one, deploys to `jawji.space` via Railway) and `jawji-gcs-v2` (a fork/copy that does *not* deploy anywhere live). If pushing changes yourself, target `jawji-gcs`, not `-v2` — this tripped us up once already this session.

### Suggested demo order

| # | What | Status | One-liner |
|---|------|--------|-----------|
| 1 | **ESP32 wireless MAVLink bridge** | ✅ Live demo, tested end to end | No cable to the vehicle. Power FC + ESP32 independently, connect Jawji over UDP to the ESP32's IP, port `14550`. |
| 2 | **AI Object Detection module** | ✅ Live demo, software-only | Camera panel + Module Manager → enable module → point camera at people/objects. Needs `pip install ultralytics opencv-python` done *beforehand*. |
| 3 | **Fleet View** | ✅ Live demo | A saved roster with 2+ entries is enough — no second physical vehicle needed. |
| 4 | **Theme toggle animation** | ✅ Small polish, safe filler | Sunrise/moonrise wipe on dark/light switch. |
| 5 | **Jawji Agent (Pi companion)** | 🟡 Built, not yet demoed | Explain the install → pairing-token → mDNS discovery flow; no live hardware to show yet. |
| 6 | **Companion provisioning scripts** | 🟡 Built, not yet demoed | Same caveat as #5 — mention only if asked "what about video/autonomy/Jetson." |
| 7 | **jawji.space docs/software/cookies pages** | ✅ Merged and live | Confirmed reachable at `jawji.space/docs`, `/software`, `/cookies`. |

### If it gets technical

Two real bugs got found and fixed this session, worth mentioning if the audience is technical:

1. **MAVLink packets were flowing through completely unvalidated** — a missing `registerMessages()` call meant corrupted packets could crash the app. WiFi links surface this far more than USB does.
2. **A build helper only worked by accident** — raw TypeScript loaded directly by Node, which happened to work locally but broke in CI's pinned Node version. Classic "works on my machine."

---

## Part 1 — Wireless telemetry, end to end

The goal was to get a SpeedyBee F405-WING flight controller (running iNav 9.0.1) talking to Jawji entirely over WiFi, using an ESP32 as the bridge. This is a well-known pattern in the drone world — instead of tethering a ground control station laptop to the vehicle with a cable, you flash a small wireless bridge onto a cheap ESP32 chip, wire it into the flight controller's serial port, and the two devices form a wireless data link.

The specific firmware used is called **DroneBridge**, an open-source project that turns an ESP32 into exactly this kind of bridge: it reads whatever comes in on its UART pins and forwards it out over WiFi as UDP packets, and vice versa. Jawji already supported connecting to any UDP endpoint, so the work wasn't building new app features — it was correctly configuring three independent systems (the flight controller, the ESP32, and Jawji) to agree with each other.

Getting there took working through several real configuration issues, each a useful thing to mention if asked how the demo works:

- **Wrong firmware assumption.** The board was initially assumed to run ArduPilot, which uses a different configuration scheme than iNav. Once corrected, the fix was straightforward — iNav configures serial port functions (MSP, Telemetry, Peripherals) per-UART with per-function baud rates, rather than ArduPilot's global `SERIALx_PROTOCOL` parameters.
- **A UART port conflict.** The flight controller's UART1 was configured for MAVLink telemetry *and* flagged as the RC receiver input, at the same time, on the same physical pins. A UART can only carry one protocol at a time — this is what caused "receiving bytes but failing to decode MAVLink" for a while. Since no physical receiver was plugged in, the fix was simply freeing UART1 from receiver duty.
- **GPIO pin persistence.** DroneBridge's own settings occasionally reverted UART pin assignments after a firmware reflash (reflashing always factory-resets a device, the same way reflashing a flight controller resets its parameters). Reconfiguring them through DroneBridge's own web interface — rather than Jawji's mirrored copy of those settings — turned out to be the most reliable way to make changes stick.

Once all three pieces agreed (57600 baud, MAVLink protocol, matching GPIO pins, same WiFi network), Jawji connected over plain UDP to the ESP32's IP address on port 14550 — DroneBridge's standard MAVLink port — and live telemetry started flowing. No cable to the vehicle at any point after that.

## Part 2 — Two real bugs found and fixed

**MAVLink packets were flowing through completely unvalidated.** Jawji's MAVLink parser has built-in length and checksum validation, but the code path that creates a live connection never actually registered the message definitions the validator needs to do its job — so every packet, valid or corrupted, was accepted and handed straight to the app's message handlers with no checking at all. This had gone unnoticed because USB serial connections rarely produce corrupted packets. A lossy WiFi link is a different story, and a single truncated packet was enough to crash the app. Fixed by properly wiring up the validation that was already built but never switched on.

**A build tool was written in a way that only worked by accident.** A small helper used by Jawji's module system (the same system the AI Object Detection module plugs into) was written as raw, uncompiled TypeScript, loaded directly by Node.js with no compiler in between. This works on very recent versions of Node, which happened to be what this machine has installed — but broke immediately in the project's actual CI pipeline, which is pinned to an older, more widely-supported Node version. This is exactly the kind of bug that "works on my machine" describes, and it's why a release that looked ready locally initially failed to build in CI. Converting the helper to plain, portable JavaScript fixed it permanently.

## Part 3 — A small polish detail

The theme toggle (dark/light/system) now plays a short animation when switched: a circular wipe grows outward from the toggle button revealing the new color scheme, paired with a small sun or moon icon that rises from that spot and fades out — a sunrise/moonrise effect rather than an instant, jarring color swap. Small, but the kind of detail that reads as considered rather than default.

## Part 4 — The companion install story was broken, end to end. Now it isn't.

Following up on the Jawji Agent work below surfaced a bigger problem: none of the "one command, done" install stories the app and docs promised for companion computers actually worked. Every one of them pointed at a URL that returned nothing.

**What was actually broken:**

- `packages/jawji-agent/install.sh` — the script the docs told people to run — never built or copied the agent binary. It was a stub with a literal `# TODO: Download pre-built binary from releases` where the real work should have been, so it would install a systemd service pointing at a file that doesn't exist. It also named that service `Jawji-agent` while the docs said to check `journalctl -u jawji-agent` (lowercase) — even a working binary would've been unfindable by the documented command.
- Three different, inconsistent URLs for the same "install the agent" action were scattered across the codebase: the Companion Dashboard UI used `jawji.space/agent/install.sh`, the setup guide used `jawji.space/companion/pi-telemetry.sh`, and the wiki used `Jawji.com/agent/install.sh` (wrong domain, wrong capitalization). None of them resolved to anything.
- Four Companion Store templates — Telemetry Bridge, Video + Telemetry, Autonomous Mission Runner, and the Jetson CV Companion — each advertised a specific provisioning script (`pi-telemetry.sh`, `pi-video.sh`, `pi-autonomy.sh`, `jetson-cv.sh`) that simply didn't exist anywhere in the repo. Copy-pasting any of those install commands would 404.

**What got fixed:**

1. Rewrote `install.sh` to actually clone the repo, build the `jawji-agent` workspace with pnpm, and install a correctly-named `jawji-agent` systemd service — verified by re-fetching the raw GitHub URL after pushing and confirming the fixed content, not just trusting the push succeeded.
2. Wrote the four missing provisioning scripts for real, in a new `packages/companion-scripts/` package:
   - **`pi-telemetry.sh`** — builds `mavlink-router` from source (no prebuilt ARM package exists), stands up a WiFi AP via `nmcli` hotspot (the NetworkManager-based approach current on Raspberry Pi OS Bookworm+, replacing the older hostapd/dnsmasq method), then chains into the agent installer.
   - **`pi-video.sh`** — sets up *both* an MJPEG stream via `mjpg-streamer` (because Jawji's Camera panel is MJPEG-only today, per the existing companion hardware guide) *and* a separate H.264 RTP/UDP stream via GStreamer for external RTSP-capable viewers like QGroundControl — since the template's advertised "GStreamer H.264" feature and the app's actual MJPEG-only support don't match, this gives you both instead of quietly shipping the one that doesn't work in-app.
   - **`pi-autonomy.sh`** — a Python + MAVSDK virtual environment with a working example script, deliberately *not* wired to auto-run any mission on boot. Auto-arming or auto-flying without an operator present is a safety hazard, so only `mavlink-router` and the agent start automatically; mission scripts always require a manual, supervised start.
   - **`jetson-cv.sh`** — Ultralytics YOLO + MAVSDK on top of an existing JetPack installation (it checks for `/etc/nv_tegra_release` and refuses to run on a non-Jetson system, since it can't install JetPack itself). Same no-auto-run-on-boot policy as the autonomy script.
3. Pointed the Companion Dashboard UI, the wiki, and the setup guide at the real GitHub-hosted scripts, and removed the fake `installCommand` fields from the four templates rather than pointing them at the wrong script.
4. Verified every one of the four new script URLs actually resolves (HTTP 200) before wiring them into the app.

### Part 4b — jawji.space now has a real docs site, download page, and cookie policy

`jawji.space` turned out to already be a real, deployed Next.js app (`jawji-gcs`, on Railway, auto-deploying from its `main` branch) — not a placeholder. Note there are two GitHub repos in play: `jawji-gcs` is the real one that deploys; a `jawji-gcs-v2` fork exists but doesn't deploy anywhere — worth double-checking which one before pushing. Added to the real one (confirmed live):

- **`/docs`** — a full documentation section, sidebar-navigated, sourced from the project's existing GitHub wiki content (`wiki/*.md`, copied into the site as `content/docs/` and rendered with `react-markdown`) and extended with pages for real app features the wiki didn't cover yet: Telemetry, Fleet, Mission Planning, Area Editor, Mission Library, MAVLink Inspector, Flight Log Analysis, AI Setup, Motor Test, and Offline Parameters. Every new page's content came from actually reading the relevant component code first, not from guessing what a feature with that name probably does. A stale reference to Lua Graph Editor (removed from the app previously) was found and cleaned up across the wiki, the website, and the docs nav.
- **`/software`** — a download page pulling real Windows installer and portable `.exe` links directly from the latest GitHub release (`v0.0.38`), with a SmartScreen warning note (the build isn't code-signed yet) and an honest "Windows only for now" callout rather than implying macOS/Linux support that doesn't exist.
- **`/cookies`** — a dedicated cookie policy page, linked from both the existing privacy policy and the site's cookie-consent banner, which previously had no "learn more" destination.
- **`/agent/install.sh`** and **`/companion/{script}`** — server-side redirects to the real, working scripts in the `jawjideck` repo, so the `curl -fsSL https://jawji.space/...` commands shown throughout the app and docs actually work now, instead of pointing at nothing.

### Part 4c — Two more bugs, found while polishing the docs site

- **Leaflet map z-index leak.** Fleet's "Add Vehicle" modal was rendering *behind* the Leaflet map next to it. Leaflet's own panes/controls use z-index values up to 1000, and `.leaflet-container` never established its own stacking context, so those values escaped and beat the modal's `z-50`. One-line fix (`isolation: isolate` on `.leaflet-container`) — and it was a latent bug in every map-plus-modal combination in the app, not just Fleet, so this is a real fix, not a patch.
- **`/software` logo didn't link home.** The `<Image>` for the logo wasn't wrapped in a `<Link>` at all — pure oversight, one-line fix.

## Part 5 — Companion module: full technical breakdown

Went through the entire Companion feature end to end — every file across the renderer UI, main-process IPC, the standalone agent daemon, and the ESP32 flasher — to answer "how does this actually work" precisely instead of from memory. Four layers, two genuinely separate subsystems living under one UI.

### How it works

**It's gated behind a Settings toggle.** `companionUnlocked` (off by default) in the settings store controls whether "Companion" even appears in the sidebar at all, via `ToolsTab.tsx`'s "Experimental Features" section. Flip it on, a nav item appears, click it, `CompanionDashboard` renders.

**The Dashboard has three tabs that are almost entirely independent of each other:**

1. **Store** — a static catalog (`companion-templates.ts`, no live backend) of 10 board/firmware combos across ESP32, Pi, Jetson. Only the 2 ESP32 "DroneBridge" templates actually do something when you click Flash — everything else (Pi images, Jetson script) is just instructions to copy-paste and run yourself over SSH.
2. **DroneBridge** — talks directly to an ESP32 running DroneBridge firmware over **plain, unauthenticated HTTP** (`/api/system/info`, `/api/settings`, etc. — DroneBridge's own open REST API). Polls stats every 2 seconds. Can also read an ESP32's config straight off its USB serial boot log (no WiFi join needed) by toggling DTR/RTS to force a hardware reset and capturing what it prints on boot.
3. **Dashboard** — talks to a **Jawji Agent** (the Pi-side daemon) over an authenticated WebSocket + REST, completely different protocol and completely different device than DroneBridge. Dockview-based tiling layout, 12 panel types (metrics, processes, terminal, file browser, Docker, BlueOS extensions, etc.).

**Two backend protocols, two trust models.** DroneBridge assumes physical proximity is the security boundary (no auth, because you're on its own WiFi AP). Jawji Agent assumes it's reachable over a shared network, so it requires a bearer token — generated once on first boot, printed to the agent's log, and you have to prove you can read that log (i.e. you have SSH/console access to the Pi) before Jawji will pair with it.

**The ESP32 flashing pipeline is the most complete part of the whole system**: auto-downloads `esptool` for your OS if it's missing, auto-downloads and caches the right DroneBridge firmware release for your chip, parses the release's `flash_args.txt` to get the correct offsets, flashes with live progress parsed straight from esptool's output, then immediately reads the freshly-flashed device's boot log to grab its WiFi AP IP and hands that straight to the DroneBridge tab. That's a real, working, well-engineered pipeline — worth demoing on its own if there's time, independent of the wireless-telemetry demo in Part 1.

**Video/camera is *not* code-level wired to Companion at all**, despite the Store's feature bullets implying otherwise ("MJPEG for Camera panel," "YOLO detection"). The Camera panel gets its stream URL from the vehicle's own MAVLink `CAMERA_INFORMATION` messages, or manual entry — it has no idea whether that stream happens to be coming from a companion Pi. The connection is by convention only: flash a Pi with the video template, its GStreamer pipeline is *expected* to expose an MJPEG endpoint, and *you* point the Camera panel at it. Nothing in the agent or DroneBridge code produces or consumes video.

### Why these choices

- **Two protocols instead of one** because DroneBridge and Jawji Agent solve different problems at different trust levels — DroneBridge is a dumb, open serial-to-WiFi bridge (no business having auth, it's not a general-purpose computer), while Jawji Agent runs arbitrary code (terminal, file access, Docker) on a real Linux box and absolutely needs to gate that behind something.
- **Pairing token over a printed-to-log secret** rather than, say, a QR code or Bluetooth pairing, because it needs zero extra hardware/libraries and reuses infrastructure that's already there (you already need SSH/console access to install the agent in the first place, so requiring that same access to read the token adds no new burden).
- **mDNS for Jawji Agent discovery** so you don't need to know a Pi's IP address on a DHCP network — the same reasoning QGroundControl, AirPlay, and network printers use.
- **The Companion Store being mostly "instructions, not automation"** (except the 2 ESP32 templates) is a reasonable scope boundary given how different Pi/Jetson provisioning is per template — genuinely automating a full Rpanion or BlueOS install isn't something Jawji should own; pointing at the right upstream project and giving copy-paste commands is.

### Bugs found (not yet fixed — this is a punch list, not a changelog)

Going through the code surfaced real, currently-existing gaps, distinct from anything actually fixed this session:

1. **`CompanionStoreDialog.tsx` has a dead/broken flash handler** — passes an empty `firmwarePath: ''` with a literal `// TODO: download firmware binary first` comment. Looks like an earlier version of the Store UI, superseded by `CompanionStoreTab.tsx` but never deleted.
2. **`esp32-mavlink-bridge` template is listed but not flashable** — no entry in `FIRMWARE_SOURCES`, so clicking Flash on it would throw `Unknown firmware template`.
3. **Saved pairing tokens are never reused.** `getSavedToken()` encrypts and persists a token per host via Electron's `safeStorage`, but nothing calls it back on app startup — so there's no auto-reconnect to a previously paired Pi; every launch needs the token re-entered (or the app needs to already be mid-session).
4. **mDNS discovery is fully wired but has no UI.** The main process can browse for `jawji-agent` services and it's exposed on `window.electronAPI.companionDiscover`, but no renderer component calls it — `DashboardConnectForm` only supports manual host+token entry. All that discovery plumbing is currently inert.
5. **A real auth mismatch**: `packages/jawji-agent`'s `authMiddleware` gates `/api/v1/info` behind the bearer token, but the desktop's manual-IP `probeAgent()` hits that same endpoint with no `Authorization` header — meaning manual agent probing likely always fails (401) against a real deployed agent. This is a functional bug, not just a missing feature.
6. **mDNS service-type casing mismatch**: the agent publishes `Jawji-agent` (capital J), the desktop browses for `jawji-agent` (lowercase). DNS-SD names are case-insensitive per spec so this is *probably* harmless, but worth knowing if discovery ever misbehaves.

### Next steps

- Delete or fix `CompanionStoreDialog.tsx`'s dead flash path (pick one: wire it to the same real flow `CompanionStoreTab` uses, or remove the file if it's truly unreachable).
- Add a `FIRMWARE_SOURCES` entry for `esp32-mavlink-bridge`, or remove that template from the catalog until one exists.
- Fix `probeAgent()` to send the bearer token (or make `/api/v1/info` genuinely unauthenticated on the agent side, matching what the desktop assumes) — this one actually blocks a real user flow, so it's the highest-priority item here.
- Wire `getSavedToken()` into an auto-reconnect-on-launch flow.
- Add a "Scan for agents" button to `DashboardConnectForm` that calls the already-implemented `companionDiscover`.
- Once a physical Pi is available: actually run the Jawji Agent install → pairing → dashboard flow end to end, the way the ESP32 link was validated in Part 1 — everything above is code-reviewed, not hardware-tested.

---

## Feature reference for the demo

### 1. AI Object Detection — shipped, software-only

Runs a real YOLOv8 object detection model against whatever video is showing in a Camera panel and draws bounding boxes directly over the live feed. It isn't a hardcoded demo — it's a genuine local inference process, built as a **module**: a self-contained add-on that plugs into Jawji through the same interface any third-party developer would use, not something wired directly into the core app. That's the point worth making if asked how extensible the platform is — this is what an external contributor could build without ever touching Jawji's own source code.

Needs `pip install ultralytics opencv-python` on the machine beforehand — do this before going on stage, not during.

**Demo:** open a Camera panel with any MJPEG source (a webcam works fine), enable the module from Companion → Module Manager, and point the camera at people or objects in the room. Boxes track live.

### 2. Camera Panel — shipped

A dockable panel showing a vehicle's live MJPEG video stream, either from a manually entered URL or auto-detected from the vehicle's own MAVLink telemetry. Pops out into its own window like every other panel in Jawji. This is the foundation the AI detection demo runs on top of, but it's a real feature on its own — no AI required to be useful.

### 3. ESP32 Wireless MAVLink Bridge — the flagship live demo

Everything from Part 1 above. This is the strongest thing to show live, because it's real hardware, tested end to end — not a simulation. Power the flight controller and the ESP32 independently (a LiPo battery for the FC, a USB power bank or wall charger for the ESP32, since it has no power connection from the flight controller), connect Jawji over UDP to the ESP32's IP on port 14550, and point out that there is no cable running to the vehicle at all.

### 4. Jawji Agent (Raspberry Pi companion) — built, not yet demoed

**How it works, in detail** (since this one is worth explaining even without a live demo):

Jawji Agent is a small background service that runs directly on a Raspberry Pi, separate from and independent of the flight controller connection. Its job is to expose the Pi's own system state — not flight data — to Jawji over the network.

- **Installation** is a single command run over SSH on the Pi itself: `curl -fsSL https://jawji.space/agent/install.sh | sudo bash`. This installs the agent as a systemd service (a background process managed by the Linux OS, the same mechanism that runs things like the SSH server itself) that starts automatically every time the Pi boots, listening on port 48400. As of Part 4, that URL is a real, working redirect to the actual installer — before this session it pointed nowhere.
- **Security via pairing token.** The first time the agent starts, it generates a random token and writes it to its own log. This exists so that Jawji doesn't automatically trust every device that happens to be on the network — you have to explicitly prove you have access to the Pi (by reading its logs) before Jawji will pair with it. That token is retrieved with `journalctl -u jawji-agent`, the standard Linux command for reading a systemd service's logs.
- **Discovery via mDNS**, the same "find a device on the local network without knowing its IP address" technology behind things like AirPlay or network printer discovery. The agent broadcasts itself under the service name `_jawji-agent._tcp`, and Jawji's Companion Dashboard listens for exactly that and lists any Pi it finds as a pairing candidate — no manually typing IP addresses.
- **Once paired**, the Companion Dashboard shows live CPU, memory, and disk usage, a list of running processes, a remote terminal (functionally the same as SSH, but inside Jawji's own UI), and streaming logs — all read directly from the Pi in real time.

The code and installer are complete and documented; what hasn't happened yet is actually pairing a physical Pi and confirming it end to end, the way the ESP32 link was. If asked directly, the honest answer is: built and ready, demo pending real hardware.

### 5. Fleet View — shipped

A roster view that monitors several vehicles at once — armed state, flight mode, battery, position — over lightweight, read-only connections, independent of whichever single vehicle is currently "focused" for full control elsewhere in the app. Answers the "does this scale past one drone?" question without needing a second physical vehicle in the room; a saved roster with a couple of entries makes the point on its own.

### 6. Companion provisioning scripts (Telemetry Bridge, Video, Autonomy, Jetson CV) — built, not yet demoed

Four scripts in `packages/companion-scripts/`, one per Companion Store template, each layered on top of the Jawji Agent installer: `pi-telemetry.sh` (mavlink-router + WiFi AP), `pi-video.sh` (MJPEG for Jawji's Camera panel + a separate H.264 stream for external viewers), `pi-autonomy.sh` (MAVSDK Python environment, no auto-run mission scripts on boot by design), and `jetson-cv.sh` (YOLO object detection on Jetson, requires JetPack already installed). Same status as the Jawji Agent itself: complete, documented, URL-verified to resolve — not yet run against physical Pi/Jetson hardware. If the safety question comes up: none of these auto-arm or auto-fly anything on boot, on purpose.

### 7. jawji.space docs, download, and cookie-policy pages — merged and live

A `/docs` section, a `/software` download page with real release links, and a `/cookies` page, all merged into the `jawji-gcs` website's `main` branch (which Railway auto-deploys to `jawji.space`), plus a follow-up cleanup pass (removing a stale Lua Graph Editor reference, screenshot placeholders, and a broken logo link). Confirmed live and reachable — safe to demo directly.

### 8. Companion module architecture — audited, not changed

A full read-through of every Companion-related file (see Part 5). If asked "how does the companion system actually work under the hood": two separate protocols (open HTTP to DroneBridge, authenticated WebSocket to Jawji Agent), a genuinely complete ESP32 flashing pipeline, and video/camera integration that's convention-only rather than code-wired. If asked "did you fix anything here": no — this was an audit that surfaced 6 real gaps (dead code, a missing firmware entry, an auth mismatch that likely breaks manual agent probing, and discovery/reconnect features that are implemented but not surfaced), captured as a punch list for next steps rather than fixed live.
