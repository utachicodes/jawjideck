# Jawji — What's New (v0.0.39)

## Wireless telemetry
- ESP32 + DroneBridge wireless MAVLink bridge working end to end — no cable to the vehicle. Connect over UDP to the ESP32's IP, port 14550.
- Fixed a real bug: MAVLink packets were flowing through completely unvalidated (crash risk on lossy WiFi links). Now properly checksummed/length-checked.

## Companion computers
- **One-script installer**: `curl -fsSL https://jawji.space/install.sh | sudo bash` — auto-detects Pi/Jetson/Linux, offers Basic / Vision / AI profiles, replaces installing 6 tools by hand.
- **MediaMTX video relay** replaces the old single-purpose GStreamer pipeline — one camera now serves RTSP/RTMP/HLS/WebRTC to QGroundControl, VLC, browsers, and Jawji at once.
- **Jawji Agent** now queries MediaMTX for live stream status (first step toward the agent orchestrating tools instead of reimplementing them).
- Fixed 6 real bugs in the Companion module: manual agent pairing was silently broken (auth mismatch, always 401'd), dead flash-dialog code removed, a non-existent firmware template removed, saved pairing tokens now actually auto-reconnect, mDNS "Scan for agents" button added, mDNS naming mismatch fixed.

## Camera panel
- **WebRTC support** added alongside MJPEG — low-latency playback via MediaMTX's WHEP endpoint, toggle in the connect form.

## Website (jawji.space)
- New `/docs` section, `/software` download page, `/cookies` policy — all live.
- Removed stale references to a feature (Lua Graph Editor) that was already removed from the app.

## Release
- **v0.0.39 is out — Windows and Linux (AppImage + .deb).** macOS still coming.
- Caught and fixed a release-pipeline bug live: the build was silently dispatching from the wrong git branch and would have shipped a Windows-only build missing everything above. Fixed before anything wrong went out.

---

## If it gets technical

- **DroneBridge fix, in short:** wrong firmware assumed at first (iNav, not ArduPilot — different serial config model), then a UART port conflict (telemetry + receiver on the same pins), then DroneBridge itself reverting GPIO settings after reflash.
- **Companion architecture, in short:** DroneBridge (ESP32) uses open HTTP, no auth needed — it's a dumb bridge. Jawji Agent (Pi/Jetson) uses authenticated WebSocket — it runs a real terminal, file access, Docker, so it needs real auth.
- **Nothing companion-related has been tested against physical hardware yet** — code-reviewed and typechecked, not hardware-verified. Say so if asked directly.
- **WebRTC caveat:** Jawji's Camera panel still defaults to MJPEG; WebRTC is opt-in until it's had more real-world testing.
