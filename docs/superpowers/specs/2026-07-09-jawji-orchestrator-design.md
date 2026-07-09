# jawji-orchestrator — Design Spec

**Date:** 2026-07-09
**Status:** Approved for planning
**Scope:** A standalone, independently-published npm package for onboard vision-assisted autonomy on a companion computer, with landing-zone-check as its first mode. Jawji desktop observes and confirms via jawji-controller; it does not host or drive the orchestrator.

## Problem

A third party is building an autonomous drone and wants their companion board (Jetson/Pi) to run its own onboard decision logic, independent of whether a GCS operator is connected. The first concrete use case: when the vehicle reaches a landing point, ask a vision-language model (e.g. Miril-Drone-2B-1) whether the site looks safe, and if not, propose a safer nearby spot.

This is explicitly not a Jawji desktop app feature. The desktop app should be able to see and, when connected, confirm what the orchestrator is doing, but the orchestrator must work correctly with no GCS connected at all — that is the entire point of it being a separate, standalone, publishable package.

## Requirements (from brainstorming)

1. **Separate repo and package.** `utachicodes/jawji-orchestrator` on GitHub, published to npm as `@jawji/orchestrator`, versioned independently with semver. Not a workspace package of this monorepo — `apps/desktop` (and any other consumer) depends on a real published version.
2. **Runs standalone on a companion board**, as its own process, with its own direct connection to the flight controller. It does not require Jawji desktop to be running or connected.
3. **General framework, landing-check first.** The package exposes a `VisionAssistMode` extension point so future modes (survey/inspection auto-tagging, live operator Q&A, first-response situational awareness) can be added without re-architecting. Only `LandingZoneCheckMode` ships in this pass.
4. **Vehicle connection via MAVSDK.** There is no official MAVSDK Node.js/TypeScript client published to npm (confirmed against the `mavlink` GitHub org, which only maintains Python, Swift, and Java clients). This package generates its own gRPC client from the official `mavlink/MAVSDK-Proto` definitions, using `@grpc/grpc-js` (pure JavaScript, no native addon) against a local `mavsdk_server`, matching the `mavsdk_server` this project's own `install.sh` `ai`/autonomy profile already provisions on the companion (`packages/companion-scripts/lib.sh`'s `install_mavsdk`). No raw MAVLink parsing in this package — `@jawji/mavlink-ts` is a private workspace-only package (confirmed not published to the public npm registry) and would need its own separate publishing effort to be usable here, which is out of scope.
5. **VLM client is injected, not hardcoded.** The package calls out to a configurable HTTP endpoint for image-and-prompt-in, JSON-out. It is not coupled to Miril specifically, so it stays reusable for other vision-language backends.
6. **Confirm-gate policy is configurable, defaults to gated.** By default, an unsafe-landing verdict blocks (holds the vehicle) until an external confirm/reject is received through the package's own local API. A fully-autonomous mode (act without waiting) is supported but must be explicitly opted into by the integrator — this mirrors this project's existing stance against unattended autonomous action by default (see `packages/companion-scripts/lib.sh`'s `install_mavsdk` comment: "arming/flying without an operator present is a safety hazard").
7. **Local-only status/confirm HTTP API.** Bound to `127.0.0.1`, matching the pattern already used by MediaMTX's own API in this project's companion setup (`api: yes` / `apiAddress: 127.0.0.1:9997` in `install_mediamtx`). Not directly network-exposed; nothing outside the companion board can reach it without going through something else.
8. **Jawji observes via jawji-controller, never talks to the orchestrator directly.** `jawji-controller` (already running on the same companion board in real deployments) gets a new module that polls the orchestrator's local status endpoint and relays operator confirm/reject actions back to it, mirroring the existing `mediamtx.ts` module exactly. Jawji desktop only ever talks to `jawji-controller`'s existing authenticated REST/WS API.
9. **README requirements** (explicit from the brainstorming conversation): no emojis anywhere, no em dashes anywhere, includes badges (license, npm version, build status at minimum), and documents how all the pieces (orchestrator, mavsdk_server, VLM endpoint, jawji-controller, Jawji desktop) fit together end to end.

## Non-goals (explicitly out of scope for this pass)

- **Any code changes to `apps/desktop` or `jawji-controller` in the `jawji-orchestrator` repo itself.** Those live in this monorepo and are a separate, later piece of work once the orchestrator package exists and has a real API surface to integrate against.
- **Publishing `@jawji/mavlink-ts` to the public npm registry.** Confirmed not currently published; making it public is a separate decision with its own scope (semver commitments, API stability guarantees) not undertaken here.
- **Modes beyond `LandingZoneCheckMode`.** Survey/inspection auto-tagging, live operator Q&A, and first-response situational awareness are named as future modes the `VisionAssistMode` interface should accommodate, but none are implemented in this pass.
- **Any bundled VLM server setup (llama-server, vLLM, etc.).** The package calls an injected HTTP endpoint; standing up that endpoint (e.g. the Pi 5 GGUF/llama-server path discussed earlier) is the integrator's responsibility, not this package's.
- **A timeout-based fallback action on unanswered confirms.** The agreed default is hold indefinitely, relying on the flight controller's own existing failsafes (battery/RC loss) as the safety net.

## Architecture

### Repository and package layout

```
jawji-orchestrator/
  src/
    modes/
      vision-assist-mode.ts      # VisionAssistMode interface
      landing-zone-check.ts      # LandingZoneCheckMode implementation
    adapters/
      mavsdk-adapter.ts          # vehicle control/telemetry via MAVSDK
      vlm-client.ts              # injected VLM HTTP client interface + default HTTP impl
    server/
      status-server.ts           # localhost-only HTTP server: status push, confirm receive
    orchestrator.ts               # wires a mode + adapters + server together, exposes start()/stop()
    types.ts                      # shared types: OrchestratorConfig, AdvisoryStatus, ConfirmDecision, etc.
    index.ts                      # public package entrypoint
  test/
    landing-zone-check.test.ts    # state machine tests with mocked adapters
    status-server.test.ts
  README.md
  LICENSE
  package.json
  tsconfig.json
```

### Core interfaces

```typescript
// modes/vision-assist-mode.ts
interface VisionAssistMode<TContext = unknown> {
  readonly id: string;
  shouldTrigger(vehicleState: VehicleState): boolean;
  onTriggered(ctx: OrchestratorContext): Promise<TContext>;
  evaluate(image: Buffer, ctx: TContext): Promise<ModeVerdict>;
  onDecision(decision: ConfirmDecision, ctx: TContext): Promise<void>;
}

type ModeVerdict =
  | { status: 'safe' }
  | { status: 'unsafe'; candidate?: { lat: number; lon: number; description: string } }
  | { status: 'unknown'; reason: string }; // VLM/camera failure - treated as unsafe for gating purposes
```

```typescript
// orchestrator.ts
interface OrchestratorContext {
  vehicle: VehicleAdapter;   // hold(), gotoLocation(coords), resumeMission(), getTelemetry()
  camera: CameraSource;      // captureFrame(): Promise<Buffer>
  vlm: VlmClient;            // query(image, prompt): Promise<unknown> (injected)
}

interface OrchestratorConfig {
  mavsdkServerAddress: string;      // e.g. 'localhost:50051'
  vlmClient: VlmClient;             // caller provides the concrete implementation
  cameraSource: CameraSource;
  modes: VisionAssistMode[];
  confirmPolicy: 'gated' | 'autonomous';  // default: 'gated'
  statusServerPort: number;         // default: 48500, localhost-bound only
}
```

Port 48500 is chosen to sit next to `jawji-controller`'s own 48400 default, avoiding the ports this project's companion services already use (5760 mavlink-router TCP, 8080 mjpg-streamer, 8554/8888/8889 MediaMTX, 9997 MediaMTX's own localhost API, 14550 MAVLink UDP, 50051 mavsdk_server's default gRPC port).

The `VehicleAdapter` wraps the MAVSDK Node.js client's `Action`, `Telemetry`, and `Offboard`/`Mission` plugins behind a small, purpose-specific interface — the rest of the package (modes, tests) never imports `mavsdk` directly, only this adapter's interface. This is what makes the state machine testable without a real `mavsdk_server`.

### Confirm-gate mechanics

When a mode's `evaluate()` returns `unsafe` (or `unknown`) and `confirmPolicy` is `'gated'`:

1. Orchestrator writes the verdict to its in-memory status, exposed at `GET /status` on the local HTTP server.
2. It blocks (the vehicle stays in the mode's hold, e.g. MAVSDK `Action.hold()`) awaiting `POST /confirm` with a `ConfirmDecision` body.
3. On receiving a decision, it calls `mode.onDecision(decision, ctx)`, which drives the actual next vehicle action (goto candidate and re-evaluate, or resume original landing).
4. If `confirmPolicy` is `'autonomous'`, step 2 is skipped entirely — the mode's default decision (defined per-mode; for `LandingZoneCheckMode`, this would be documented explicitly as "reposition to the candidate automatically") runs immediately instead.

### jawji-controller integration (separate repo, tracked as follow-up work)

Not built in the `jawji-orchestrator` repo itself, but the local HTTP API's shape (`GET /status`, `POST /confirm`) is designed so a future `jawji-controller` module can poll and relay it exactly like the existing `mediamtx.ts` module does for MediaMTX's own local API — same localhost-only-API-behind-an-authenticated-proxy pattern already established in this project.

## Data flow (landing-zone-check mode, gated policy)

1. Orchestrator's MAVSDK telemetry subscription sees the vehicle enter a landing state (mode `shouldTrigger` returns true) and calls `vehicle.hold()`.
2. `camera.captureFrame()` grabs a frame from whatever local source is configured.
3. `vlm.query(image, prompt)` is called with the `operational_coordinate_v2`-style prompt.
4. If the verdict is `safe`, the mode calls `vehicle.resumeMission()` and the orchestrator returns to idle, watching for the next trigger.
5. If `unsafe`/`unknown`, the confirm-gate mechanics above take over: status is exposed locally, vehicle holds, orchestrator waits for `POST /confirm`.
6. A confirm with a candidate accepted triggers `vehicle.gotoLocation(candidate)`, then loops back to step 2 to re-evaluate the new position (bounded to a maximum of 3 re-evaluation attempts per landing trigger).
7. After 3 unsuccessful attempts, the mode reports `no safe alternative found` in its status and holds indefinitely for manual intervention — no automatic fallback action.

## Error handling

- `mavsdk_server` unreachable at startup: the orchestrator fails to start and logs the connection error clearly. No fallback vehicle-connection path is attempted.
- VLM query fails or times out: treated as `{ status: 'unknown', reason: ... }`, which is gated exactly like `unsafe` — never treated as `safe` by default. Assuming safety on an inference failure would defeat the purpose of the check.
- Camera frame capture fails: same treatment as a VLM failure.
- Local status/confirm HTTP server fails to bind its port at startup: the orchestrator fails to start rather than running with no way for anything to confirm a gated decision.

## Testing

- The state machine (`LandingZoneCheckMode`, confirm-gate logic in `orchestrator.ts`) is unit-tested with mocked `VehicleAdapter`, `CameraSource`, and `VlmClient` implementations — no real `mavsdk_server` or hardware required, following the same mock-based approach as this project's own `packages/jawji-controller` vitest suite (`auth.test.ts`, `metrics.test.ts`, etc.).
- The local HTTP status/confirm server is tested directly with real HTTP requests against a running instance in the test process (supertest-style), independent of the vehicle/VLM mocks.
- Integration testing (manual, not part of CI for this pass): run against ArduPilot SITL plus a stub VLM HTTP endpoint returning canned JSON, to exercise the full trigger to hold to advisory to confirm to reposition loop without real hardware.

## README requirements

The published package's README must:

- Contain no emojis anywhere in the document.
- Contain no em dashes anywhere in the document (use commas, periods, or parentheses instead).
- Include badges near the top: npm version, license, and build status at minimum.
- Document, in order: what the package is and is not (standalone onboard autonomy, not a Jawji desktop feature), how it connects to the vehicle (MAVSDK, `mavsdk_server` prerequisite), how the VLM client is configured (it is injected, with a minimal working example), how the confirm-gate policy works and how to wire an external confirm channel to it, the shape of the local status/confirm HTTP API, and how this fits into a companion board's install (referencing this project's `ai` autonomy profile as the environment it is designed to run alongside, without implying a hard dependency on Jawji itself).
