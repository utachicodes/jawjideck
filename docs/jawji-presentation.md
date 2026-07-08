# Jawji — What's New (v0.0.39)

## Wireless telemetry

**ESP32 + DroneBridge wireless MAVLink bridge — working end to end, no cable to the vehicle.**
- *How it works:* DroneBridge firmware on a cheap ESP32 reads whatever comes off the flight controller's UART and forwards it as UDP packets over WiFi, and back. Jawji just connects over plain UDP to the ESP32's IP, port 14550 — no new app code needed, it's the existing UDP connection path pointed at a wireless radio instead of a cable.
- *Why this matters:* it's the standard, well-proven pattern for untethering a ground station from the vehicle, and it proves Jawji's connection layer is truly transport-agnostic (same UI, same behavior, whether it's USB, a cable, or a radio link).
- *What got fixed to make it work:* wrong firmware assumed at first (iNav configures serial ports per-UART with per-function baud, not ArduPilot's global `SERIALx_PROTOCOL`), a UART port conflict (telemetry and the RC receiver were both flagged on the same physical pins — a UART can only carry one protocol), and DroneBridge itself reverting GPIO pin assignments after every reflash (fixed by reconfiguring through DroneBridge's own web UI instead of Jawji's mirrored copy of those settings).
- **Bug fixed in code, not just config:** MAVLink packets were flowing through completely unvalidated. The live-connection code path created the parser but never called `registerMessages()` on it, so every packet — valid or corrupted — skipped length/checksum checking entirely. USB rarely produces corrupted packets, so this went unnoticed; a lossy WiFi link is a different story, and a single truncated packet was enough to crash the app.

## Companion computers

**One-script installer:** `curl -fsSL https://jawji.space/install.sh | sudo bash`
- *How it works:* detects the hardware (Jetson via `/etc/nv_tegra_release`, Pi via `/proc/cpuinfo`, else generic Linux), then offers three profiles — Basic (agent + MAVLink), Vision (+ MediaMTX), AI (+ MAVSDK + YOLO) — instead of a checklist of individual packages. One shared `lib.sh` holds the actual install logic; the four original per-template scripts are now thin wrappers around it, so nothing that pointed at them broke.
- *Why:* most people know "I want video" or "I want autonomy," not which five specific Linux packages that requires. A profile is exactly that intent-to-components mapping.

**MediaMTX video relay** replaces the old single-purpose GStreamer UDP pipeline.
- *How it works:* MediaMTX is a real, actively-maintained media server — one camera source in, RTSP/RTMP/HLS/WebRTC all out simultaneously. QGroundControl, VLC, a browser, and Jawji can all watch the same feed at once.
- *Why:* it's not tied to drones at all — it already solves protocol conversion and multi-consumer distribution, things a bespoke pipeline would have to reinvent badly.
- **Jawji Agent now queries MediaMTX** for live stream status (active paths, real publisher connected or not, reader counts) through MediaMTX's own local API, and exposes that over the agent's existing authenticated REST API. First working piece of "agent orchestrates tools, doesn't reimplement them" — the same treatment is planned for mavlink-router and MAVSDK next.

**6 real bugs fixed in the Companion module**, found during a full audit of how it actually works:
1. Manual agent pairing (by IP address) was silently broken — the agent's `/api/v1/info` endpoint required a bearer token, but the desktop's probe called it with none, so it always got a 401. Fixed by exempting that one non-sensitive identity endpoint from auth, matching what the desktop already assumed.
2. A dead flash-dialog component (`CompanionStoreDialog.tsx`) with a stubbed, non-functional handler — confirmed orphaned (no imports anywhere) and removed.
3. A Companion Store template advertised a firmware (`esp32-mavlink-bridge`) that turned out to actually be an ESP8266 project, not ESP32 — no safe download source existed, so the template was removed rather than guessing at a URL that could brick hardware.
4. Saved pairing tokens are now actually used — app launch auto-reconnects to the last-paired agent with its encrypted saved token, instead of saving it and never reading it back.
5. A "Scan for agents" button was added to the connect form, wired to mDNS discovery that already existed in the backend but had no UI calling it.
6. mDNS naming mismatch fixed — the agent was publishing itself under different capitalization than the desktop was searching for.

## Camera panel

**WebRTC support**, alongside the original MJPEG path.
- *How it works:* a WHEP (WebRTC-HTTP Egress Protocol) client built from scratch using Electron/Chromium's native WebRTC APIs — no external library. Gathers ICE candidates locally, sends one HTTP POST with the offer, gets one answer back, renders to a `<video>` element. A protocol toggle in the connect form lets you pick MJPEG or WebRTC.
- *Why WebRTC:* far lower latency than MJPEG (often under 200ms vs. seconds), proper H.264/H.265 compression instead of raw JPEG frames, and it's what MediaMTX's Vision Companion profile now produces by default.
- *Caveat:* MJPEG stays the default — WebRTC is opt-in until it's seen more real-world testing.

## Website (jawji.space)

- New `/docs` section, `/software` download page, and `/cookies` policy — all live now.
- Removed stale references to Lua Graph Editor, a feature that was already removed from the app in a previous release but that the docs never caught up on.

## Release

**v0.0.39 is out — Windows and Linux (AppImage + .deb). macOS still coming.**
- *How:* the `linux` build target already existed in electron-builder's config but CI never actually built it — added a `build-linux` CI job alongside the existing Windows one.
- **Caught and fixed a release-pipeline bug live:** the workflow that dispatches the actual build had no `--ref` pin, so it silently used the repo's default branch instead of the branch this session's work (including the new Linux job) actually lived on. First build attempt came back Windows-only, missing everything above. Caught it before any wrong artifacts were uploaded, cancelled it, re-ran it pinned to the correct tag, and fixed the workflow permanently so future tags can't hit the same issue.

---

## If asked directly

- **Nothing companion-related has been tested against physical hardware yet** — code-reviewed and typechecked, not hardware-verified. The ESP32 wireless bridge is the one thing in this release that's been run for real, end to end.
