# Jawji — What's New

## Onboard autonomy (new, separate project)

**jawji-orchestrator** — a new standalone package, published as its own GitHub repo and npm package instead of living in this monorepo.
- *Why separate:* it's built for a genuinely different consumer than Jawji desktop — someone running fully autonomous missions on a companion computer, with no GCS necessarily connected at all. It runs standalone, with its own direct MAVSDK connection to the flight controller.
- *How it works:* ships a `VisionAssistMode` framework with one mode so far, `LandingZoneCheckMode` — on entering LAND mode it holds the vehicle, grabs a camera frame, asks an integrator-supplied vision-language model whether the site looks safe, and if not, holds and waits for an external confirm before repositioning (gated by default, not unattended-autonomous, matching this project's existing stance against arming or flying without an operator present).
- *A real correction made along the way:* initially assumed MAVSDK had an official Node.js client on npm. It doesn't — verified directly against the `mavlink` GitHub org (official clients exist for Python, Swift, and Java only) and the npm registry (the `mavsdk` package name doesn't exist). Corrected the design to generate a gRPC client from MAVSDK's own public `.proto` definitions instead, using a pure JavaScript gRPC library with no native addon, which matters for cross-compiling to Jetson or Pi.
- *Status:* the package is built, tested (16 unit tests, all passing), and published with CI green. Not yet wired into Jawji desktop or Jawji Agent — tracked as a follow-up in the Roadmap.

## Companion computers

**Companion Store templates now call the one-script installer directly**, closing a gap from last release.
- *What changed:* the four per-template scripts (`pi-telemetry.sh`, `pi-video.sh`, `pi-autonomy.sh`, `jetson-cv.sh`) described last release as "thin wrappers kept for backward compatibility" turned out to be pure overhead. Three did nothing but call `install.sh` with fixed arguments, and the fourth's one real difference, installing `mjpg-streamer` alongside MediaMTX, is now just a `WITH_MJPG` flag built into `install.sh`'s `vision` profile itself. All four wrapper scripts are deleted; the Companion Store's install commands now call `install.sh` directly with the matching profile or flags.
- *Verified, not just assumed:* pulled the live `jawji.space/install.sh` and diffed it byte for byte against the repo copy to confirm the deployed script actually matches, ran the installer's profile logic standalone to confirm all four component sets are unchanged from before the consolidation, and re-typechecked the desktop app after repointing the Store's install commands.

**A real crash bug found and fixed in Jawji Agent**, while verifying the installer end to end.
- *The bug:* if `journalctl` isn't available (any non-systemd companion board, and the installer explicitly supports `generic-linux`), the agent crashed entirely, not just its log-tailing feature. `spawn()` reports a missing binary asynchronously through the child process's `'error'` event, not a thrown exception, so the existing try/catch never caught it — an unhandled `'error'` event took the whole process down, REST API and WebSocket and mDNS discovery included.
- *Caught how:* actually ran the built agent locally rather than only reading the code. It printed its pairing token, served real metrics over the WebSocket, was discoverable over mDNS, then crashed the instant log tailing kicked in.
- *Fixed:* proper `'error'` handlers with a `journalctl` to `tail` to warning fallback chain, verified by rerunning the same local test and confirming the process now survives.

## MAVLink signing

**A misleading log message fixed.** "Vehicle requires MAVLink signing but no key is configured... before connecting" read like a hard requirement, but nothing in the connection code actually blocks on it; the heartbeat handshake and telemetry flow proceed regardless. Downgraded to an informational note that the connection continues without signing, instead of implying the user needs to act first.

## Website & docs (jawji.space)

- Companion setup guide (`docs/guides/companion-hardware-setup.md`) and the wiki's Companion Board page rewritten to lead with the one-script installer's profile and flag reference instead of the old fully manual walkthrough.
- New wiki section documenting jawji-orchestrator, and a new README entry linking to it as a related project.

## Release

**v0.0.40.**

---

## If asked directly

- jawji-orchestrator has not been tested against a real `mavsdk_server` or a real flight controller. Its unit tests use mocked adapters throughout — this is genuinely new, unverified-on-hardware code.
- jawji-orchestrator's landing-candidate coordinate conversion, turning the vision model's 2D pixel point into a real GPS offset, is explicitly a placeholder in this first version. It needs real camera intrinsics, altitude, and gimbal angle projection before it is production safe, and is documented as such directly in the code.
