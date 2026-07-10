# Jawji — What's New

## The platform shape: licensing, subscriptions, and where everything sits

This was a design first; the licensing core, both products' activation flows, and the desktop UI that surfaces it are now built and wired end to end (code-level details below each section) — what's left is real-world verification of the sign-in round trip, not more architecture.

**The shape:** Jawji GCS (desktop and web) is the entry point everyone touches. Below it, gated by a shared licensing layer, sit two paid products: **jawji-orchestrator** (onboard autonomy, licensed per companion computer) and **Jawji Intelligence** (cloud AI, licensed per module/usage). One licensing mechanism serves both — jawji-gcs's `/api/licensing/*` API — rather than two separate activation systems.

**Why open-core, not a hard paywall on the GCS itself.** jawjideck is GPL-3.0. That's not incidental — the license's copyright holder confirmed they hold full authority over it and explicitly chose, when asked directly, to keep it GPL-3.0 going forward rather than relicense. GPL-3.0 source is freely buildable by anyone; a subscription check compiled into a GPL binary isn't an enforceable gate against someone willing to build from source and strip it out. So the model is **open-core**: the source stays free and self-buildable, but the *official product* — pre-built installers from jawji.space, the account system, sync between desktop and web, marketplace access, license activation — is what the $10/month subscription actually gates. In practice almost nobody self-builds to dodge a subscription for a professional tool; the friction of maintaining your own fork forever does the enforcement work a license key alone couldn't.

**Why jawji-orchestrator can be closed and per-device, unlike the GCS.** It's not a fork of Jawji — it's a separate program (published as its own private repo/npm package) that only talks to Jawji over local network APIs, so GPL's derivative-work rules don't reach it. A license binds to **the companion computer running Orchestrator** (via `/etc/machine-id`), not the flight controller — the earlier plan had this backwards. Orchestrator's identity is the box it's a process on, not the FC it happens to be talking to via MAVSDK at any given moment; binding to the FC's board UID instead would have broken a license every time someone swapped a flight controller without touching the companion computer at all, which is a normal maintenance event, not a licensing event.

**Why Jawji Intelligence can be a paid closed-source module.** Jawji's own LICENSE contains a "Marketplace Module Exception" under GPL Section 7 that was clearly written to anticipate exactly this: proprietary Modules are explicitly permitted, as long as they talk to Jawji only through the documented Module API, don't modify Jawji internals, and are distributed through an authorized marketplace. Intelligence, built as a real Module the same way the existing local AI Object Detection module already is, fits that exception cleanly with no legal ambiguity.

**Trial:** a new account gets a 14-day full-access trial automatically, no purchase needed to start.

**What happens if a license or subscription lapses mid-flight:** never interrupts something already running. For Orchestrator, the license is checked only at mission start — a mission already in progress always finishes even if the license expires mid-flight; the next mission is what gets blocked. The base subscription follows the same "don't corrupt an in-progress session" principle.

*Status: shipped. The licensing core (activation codes, HMAC-signed offline-cacheable entitlement tokens, trial auto-start, `/api/licensing/*`) lives in jawji-gcs; jawjideck desktop has a Licensing tab under Settings that signs in and surfaces it; jawji-orchestrator has its own CLI (`login` / `activate` / `whoami`) and refuses to `start()` without a valid license bound to its device. Not yet verified: the actual browser-based sign-in round trip end to end (deep link on desktop, localhost callback on orchestrator) — implemented and unit-tested, not field-tested.*

## Staying logged in

One Jawji account, shared between desktop and web, via the Firebase Auth project jawji-gcs already has running in production. Sign in once; a subscription or license purchased on one surface is visible and usable on the other immediately.

**Offline is a first-class requirement, not an edge case** — flight sites are frequently connectivity-dead, and neither the base app nor Orchestrator can hard-require a live network call to function. The backend side of this is built: `/api/licensing/entitlements` returns a signed token alongside the entitlement snapshot. **The client side isn't wired up yet** — desktop's Licensing tab currently does a live fetch every time and has no local token cache or offline verification path. Until that lands, losing connectivity means losing the ability to check entitlements on desktop, which is the exact failure mode this design was meant to avoid. Tracked as follow-up work, not done.

**How buying something actually works:** purchase and activation are two separate steps on purpose. Buying a license (the base subscription, an Orchestrator seat, an Intelligence module) produces a 13-character activation code; redeeming that code — possibly later, possibly on a different device — is what actually grants the entitlement. That split is what makes buying licenses in bulk for a fleet and handing out codes to installers work naturally, without needing a separate bulk-purchase system.

## Jawji Intelligence

A cloud-hosted AI layer, sold as a marketplace of models rather than one fixed feature. A base tier (`base-detection`) is free with any active or trialing subscription; additional models — starting with `custom-detection` — are separate modules a customer activates and pays for individually. Because it's cloud-hosted, licensing is just metered API access, not shipping binaries or gating something running on the vehicle — a much simpler enforcement problem than Orchestrator's.

**This replaces jawjideck's existing local AI Object Detection module**, not sit alongside it. Today that module runs YOLOv8 locally as a Python process with no cloud dependency at all — free, offline, but limited to whatever a local model can do. Jawji Intelligence becomes the one AI path going forward, which is a real, deliberate tradeoff: AI features move from "always works, no account, no connectivity needed" to "requires an account and, for anything beyond the base tier, a subscription and connectivity." That's not an accidental scope-creep, it's the explicit decision that makes an AI marketplace a real product instead of something bolted onto a feature that was already free. The local module hasn't actually been removed yet — that's still a real migration to do once Intelligence is worth switching to.

*Status: the plumbing is real, the AI is not. jawji-gcs has the module catalog, `hasModuleAccess` gating (mirrored exactly in desktop's own access check), and `/api/intelligence/*` routes; jawjideck desktop's Licensing tab lists the catalog with per-module buy/access state. But `lib/server/intelligence/inference-provider.ts` is a stub — there is no real model behind `/api/intelligence/infer` yet, and no in-app UI actually calls it. Buying a module today gets you a license, not a working detector.*

## Web and desktop: one platform, two surfaces

Same account, same interface philosophy, deliberately different capability. Desktop is the complete product — everything, including serial/USB connections, firmware flashing, and the SITL simulator, none of which a browser can do. Web gets the rest: mission planning, telemetry, parameters, PID tuning, the camera panel, companion dashboard, and fleet management, all over TCP/UDP/WebSocket connections to a vehicle or companion board rather than direct hardware access. The two are meant to feel like the same product at different zoom levels, not two different apps that happen to share a logo — someone moving from web to desktop (or the reverse) shouldn't have to relearn where anything is.

*Status: not started. jawji-gcs currently runs on a different backend entirely (AWS IoT Core/MQTT telemetry, Socket.IO, Firebase auth already in place) than jawjideck's direct MAVLink-over-TCP/UDP model — reconciling those is real, separate architecture work, sequenced after the licensing core since licensing is the shared dependency everything else needs first.*

## Onboard autonomy

**jawji-orchestrator** — a standalone package, its own GitHub repo and npm package, not living in this monorepo.
- *Why separate:* built for a genuinely different consumer than Jawji desktop — someone running fully autonomous missions on a companion computer, with no GCS necessarily connected at all. It runs standalone, with its own direct MAVSDK connection to the flight controller.
- *How it works:* ships a `VisionAssistMode` framework with one mode so far, `LandingZoneCheckMode` — on entering LAND mode it holds the vehicle, grabs a camera frame, asks a vision-language model whether the site looks safe, and if not, holds and waits for an external confirm before repositioning (gated by default, not unattended-autonomous).
- *Built-in Miril support:* `createMirilVlmClient()` targets the OpenAI-compatible chat completions format that `llama-server`, vLLM, and SGLang all implement for [Miril-Drone-2B-1](https://huggingface.co/MirilAI/Miril-Drone-2B-1) — verified there's no single canonical Miril HTTP protocol before picking that target. The package still doesn't bundle or run a model itself; you point it at your own server.
- *GPS-denied navigation: researched, not built.* Verified MAVSDK's `mocap` service (`SetVisionPositionEstimate`) is real by reading the actual proto rather than assuming, and wrote up why a captioning VLM is the wrong tool for visual place recognition specifically — that's a different problem needing real embeddings or feature matching, not scene description. Deliberately didn't write code that would push position estimates into a flight controller without proper review.
- *A real correction made along the way:* initially assumed MAVSDK had an official Node.js client on npm. It doesn't — verified directly against the `mavlink` GitHub org (official clients exist for Python, Swift, and Java only) and the npm registry. Corrected the design to generate a gRPC client from MAVSDK's own public `.proto` definitions instead, using a pure JavaScript gRPC library with no native addon, which matters for cross-compiling to Jetson or Pi.
- *Licensing:* now closed-source (`UNLICENSED`, private repo, `@jawji/orchestrator` on the public npm registry) with a real enforcement path — a bundled CLI (`login` / `activate` / `whoami`), binding to the companion computer's `/etc/machine-id` per the correction above, and `createOrchestrator({ license })` refusing to `start()` without an active license bound to that device. Opt-in via config, so existing integrations that don't pass `license` are unaffected.
- *Status:* the package is built and tested (28 unit tests, all passing, including the new licensing logic) with CI green. The sign-in round trip (browser → localhost callback → stored credential) hasn't been run against a real deployment yet.

## Jawji Controller (renamed from Jawji Agent)

Renamed across the entire product this cycle — `packages/jawji-agent` → `packages/jawji-controller`, the npm package, the systemd/OpenRC service, the mDNS discovery type, every `JAWJI_AGENT_*` environment variable, the companion installer's `WITH_AGENT` flag, and every UI string, doc, and wiki page that named it. jawji.space's install-script route follows the same rename. Confirmed nothing was deployed in the field yet before doing a clean rename with no backward-compatibility shim.

Caught and fixed a real crash bug while verifying the rename end to end: if `journalctl` isn't available (any non-systemd companion board — the installer explicitly supports `generic-linux`), the controller used to crash entirely, not just its log-tailing feature. `spawn()` reports a missing binary asynchronously through the child process's `'error'` event, not a thrown exception, so the existing try/catch never caught it. Fixed with proper `'error'` handlers and a `journalctl` → `tail` → warning fallback chain, verified by actually running the built controller locally and confirming it survives.

## Companion computers

**Companion Store templates now call the one-script installer directly**, closing a gap from last release.
- *What changed:* the four per-template scripts (`pi-telemetry.sh`, `pi-video.sh`, `pi-autonomy.sh`, `jetson-cv.sh`) described last release as "thin wrappers kept for backward compatibility" turned out to be pure overhead. Three did nothing but call `install.sh` with fixed arguments, and the fourth's one real difference, installing `mjpg-streamer` alongside MediaMTX, is now just a `WITH_MJPG` flag built into `install.sh`'s `vision` profile itself. All four wrapper scripts are deleted; the Companion Store's install commands now call `install.sh` directly with the matching profile or flags.
- *Verified, not just assumed:* pulled the live `jawji.space/install.sh` and diffed it byte for byte against the repo copy to confirm the deployed script actually matches, ran the installer's profile logic standalone to confirm all four component sets are unchanged from before the consolidation, and re-typechecked the desktop app after repointing the Store's install commands.

## MAVLink signing

**A misleading log message fixed.** "Vehicle requires MAVLink signing but no key is configured... before connecting" read like a hard requirement, but nothing in the connection code actually blocks on it; the heartbeat handshake and telemetry flow proceed regardless. Downgraded to an informational note that the connection continues without signing, instead of implying the user needs to act first.

## Website & docs (jawji.space)

- Companion setup guide (`docs/guides/companion-hardware-setup.md`) and the wiki's Companion Board page rewritten to lead with the one-script installer's profile and flag reference instead of the old fully manual walkthrough, and updated for the Jawji Controller rename.
- New wiki section documenting jawji-orchestrator, including its Miril support and the GPS-denied research, and a new README entry linking to it as a related project.

## Release

**v0.0.40.**

---

## If asked directly

- **The licensing/subscription platform described above is a design, not code.** Nothing about accounts, subscriptions, licenses, or activation codes exists in either jawjideck or jawji-gcs yet. The spec is written and approved; implementation hasn't started.
- **Jawji Intelligence replacing the local AI module is a deliberate, real tradeoff**, not a strict upgrade — today's AI detection works offline with no account; the planned replacement requires both. Worth being upfront about that if asked, not just presenting it as more capable and leaving out what it costs.
- jawji-orchestrator has not been tested against a real `mavsdk_server` or a real flight controller. Its unit tests use mocked adapters throughout — this is genuinely new, unverified-on-hardware code.
- jawji-orchestrator's landing-candidate coordinate conversion, turning the vision model's 2D pixel point into a real GPS offset, is explicitly a placeholder in this first version. It needs real camera intrinsics, altitude, and gimbal angle projection before it is production safe, and is documented as such directly in the code.
