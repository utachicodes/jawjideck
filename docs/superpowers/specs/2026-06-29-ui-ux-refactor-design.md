# Jawji UI/UX Refactor — Design

**Status:** Approved (shape), pending spec review
**Date:** 2026-06-29
**Owner request:** "refactor the whole UI/UX — too much repetition (config pages duplicated per protocol, connection panel jargon), make the landing page, navigation, and visual design better."

## Problem

Three concrete, observed issues drove this:

1. **Config screens are implemented three times.** `mavlink-config/` (ArduPilot), `betaflight/BetaflightDashboard.tsx` (Betaflight/iNav via MSP), and `legacy-config/` (F3 boards via CLI) each have their own PID Tuning, Rates, Modes, and Servo/Mixer screens with near-identical UI bound to three different data backends. Any UI improvement today has to be made three times or it drifts.
2. **Connection panel speaks protocol jargon, not user intent.** [`ConnectionPanel.tsx`](../../../apps/desktop/src/renderer/components/connection/ConnectionPanel.tsx) (~1000 lines) labels things "Manual Connection," "Host," "Port," "Protocol" with TCP/UDP tabs — never says "connect to a drone over WiFi/radio" even though that's exactly what TCP/UDP mode is for. SITL launch, USB, and remote connection are all flattened into one screen with no clear hierarchy.
3. **Landing page and navigation don't reflect "vehicle first."** The default disconnected screen showed only a logo and generic tool shortcuts (already partly fixed this session via `LandingVehiclePanel`). The navigation rail is a flat list of 16 icons with no grouping by intent (fly vs. configure vs. tools).

A fourth, supporting finding: a design-token system already exists (`globals.css` `@layer components`: `.btn`, `.card`, `.input`, `.tab`, CSS-variable theming for dark/light/system) — it's just inconsistently used; many screens hand-roll buttons/cards instead of using it. The refactor extends this system rather than replacing it.

## Goals

- Collapse the 3× config duplication into one adaptive **Configure** experience.
- Rewrite the connection flow in plain language, organized by *how* you're connecting (cable / drone over network / simulator), with protocol detail demoted to "Advanced."
- Reorganize navigation into intent-based groups.
- Extend the landing page (vehicle panel already added) with a clear primary action and recent-connection shortcuts.
- Apply one consistent "Refined Control Room" visual language: dark, generous spacing, single accent (blue), clear type hierarchy — sharpening what exists rather than discarding it.

## Non-goals

- No protocol/firmware capability changes — every existing MAVLink param, MSP command, and CLI flow must keep working exactly as today. This is a UI/architecture refactor, not a feature change.
- No light-theme redesign beyond keeping the existing CSS-variable theming working (dark/light/system already exists and must keep working).
- No change to the underlying connection transport code (`@jawji/comms`, `connection-store.ts` IPC) — only the UI layer.

## Approach

Five independent phases, each shippable on its own so the app keeps working between them. Order matters: Phase 0 (design system) is consumed by every later phase, so it goes first.

### Phase 0 — Design system extension

Extend the existing `@layer components` system in `globals.css` rather than replacing it.

**New CSS primitives** (added alongside existing `.btn`/`.card`/`.input`):
- `.stat-card` — for the dense numeric readouts repeated across Telemetry, Configure tabs, and the landing vehicle panel (currently each screen hand-rolls its own stat box markup).
- `.section-header` — consistent eyebrow-label + title pattern (currently inlined as one-off `text-[10px] uppercase tracking-wider` spans in ~10+ files).

**New React primitives** (`components/ui/`):
- `<Tabs>` — wraps the existing `.tab-group`/`.tab`/`.tab-active` CSS classes in a controlled component (`items`, `active`, `onChange`). Today every screen with tabs (ConnectionPanel, ParametersView, mavlink-config tabs) reimplements the same `.map()` over a tuple with manual active-state classNames.
- `<StatCard>` — label + value + optional unit/trend, using `.stat-card`.
- `<SectionHeader>` — eyebrow + title + optional trailing action slot.

**Out of scope for Phase 0:** touching color tokens or the dark/light/system theme mechanism — it works, it's not part of the complaint.

**Risk:** low. Additive only; nothing is removed in this phase.

### Phase 1 — Connection flow rewrite

Replace `ConnectionPanel.tsx`'s flat tab structure with a three-way primary choice, each rendering a focused sub-panel:

| Today | Becomes |
|---|---|
| "Manual Connection" → Serial tab | **USB Cable** |
| "Manual Connection" → TCP/UDP tabs | **Remote Drone** (network: WiFi, telemetry radio bridge, companion computer) |
| "Quick Start" SITL card | **Simulator** |

**Remote Drone panel specifics:**
- Primary fields in plain language: "Address" (was Host), a single Connect button.
- Protocol (MAVLink/MSP), port number, and listen-vs-connect mode move under a collapsed **Advanced** disclosure — default-collapsed, remembers last-expanded state per session only (not persisted, to avoid surprising returning users with an unexpectedly-expanded advanced panel).
- MAVLink Signing keeps its existing collapsed-by-default treatment, unchanged behavior, restyled with Phase 0 primitives.
- Recent connections (`RecentConnectionsButton`) keep working identically — same data, just reachable from the renamed panel.

**USB Cable panel:** unchanged behavior (port dropdown, baud rate, rescan, driver assistant), restyled.

**Simulator panel:** the existing SITL quick-start card logic (ArduPilot vs iNav selection, download-if-needed, auto-connect retry) moves in verbatim — this is working, well-tested logic; only the surrounding chrome changes.

**State/logic preserved as-is:** `connectionMemory`, `applyRecent`, `handleSitlQuickStart`, `handleSitlConnect`, the auto-connect-retry effect, and the port-watch effects are unchanged — this phase touches JSX structure and copy, not the connection logic itself.

**File impact:** `ConnectionPanel.tsx` splits into `ConnectionPanel.tsx` (mode switcher shell) + `panels/UsbCablePanel.tsx` + `panels/RemoteDronePanel.tsx` + `panels/SimulatorPanel.tsx`, each receiving only the state/handlers it needs as props (no new global state).

### Phase 2 — Unified Configure view

This is the highest-value, highest-risk phase. Goal: one `configure` view replacing the three protocol-specific implementations, organized as tabs (PID Tuning, Rates, Modes, Servo/Outputs, Receiver, Safety, Sensors, Battery — exact tab set per vehicle/protocol, since e.g. Receiver doesn't apply to all).

**Architecture — adapter pattern:**
- Each tab is one shared React component (e.g. `<PidTuningTab>`) that receives a small **adapter interface** (e.g. `PidTuningAdapter { getValues(), setValue(key, value), ranges, isReadOnly }`), not raw store hooks.
- Three adapter implementations: `mavlinkAdapter` (wraps `useParameterStore`), `mspAdapter` (wraps the Betaflight/iNav MSP store), `legacyAdapter` (wraps the CLI-based legacy-config store).
- The Configure view picks the adapter based on `connectionState.protocol` / detected board, same way `ConnectionPanel`/`App.tsx` already branch on protocol today.

**Migration order** (de-risks by tackling the most-duplicated, lowest-protocol-specific-logic tab first): Rates → Modes → Servo/Outputs → PID Tuning → Receiver/Safety/Sensors/Battery (these last four are more ArduPilot-specific already and may stay closer to their current MAVLink-only form, adapted rather than tri-protocol from day one).

**What does NOT get unified in this phase:** Firmware Flash, Calibration, OSD Simulator, Lua Graph Editor, CLI Terminal — these are already single-implementation (not duplicated 3×) and out of scope.

**Explicit risk:** this phase touches the most state and is most likely to surface protocol-specific edge cases (e.g. iNav's platform-type-change flow, ArduPilot's VTOL dual-PID controller switch). Plan to migrate one tab, verify against all three protocols, then proceed — not a big-bang rewrite.

### Phase 3 — Navigation reorganization

Group `NavigationRail.tsx`'s flat list into three labeled clusters (rail stays icon-only/tooltip as today — grouping is via spacing + the existing separator mechanism, already partially present via `NAV_GROUPS`):

- **Fly:** Telemetry, Mission Planning, Mission Library
- **Configure:** Configure (new unified view), Calibration, Parameters (kept separate from Configure — Parameters is the raw 800+ param table/search, a different job than the curated Configure tabs)
- **Tools:** Firmware, SITL, OSD, Lua Graph, CLI, Inspector, Companion, Logs

Settings, theme toggle, and Report Bug stay pinned at the bottom, unchanged. `NAV_GROUPS` already exists as a `Record<ViewId, number>` — this phase mostly relabels/reassigns those numbers and confirms separators render at the new boundaries; it's a small, low-risk change once Phase 2 has produced a `configure` view id to point at.

### Phase 4 — Landing page completion

Builds on `LandingVehiclePanel` (already shipped this session). Adds:
- A clear single primary CTA below the vehicle panel: "Connect" (opens the Phase 1 connection flow) — currently the landing page has no explicit connect action, relying on the always-visible sidebar.
- Recent-connections quick-list (reuses `connectionMemory.recentConnections`, same data Phase 1's `RecentConnectionsButton` reads) so returning users can reconnect in one click from the landing page itself, not just from inside the connection panel.
- Restyle the existing tool quick-link cards with Phase 0 primitives.

### Phase 5 — Visual sweep

Apply Phase 0 primitives to remaining screens that currently hand-roll cards/buttons/tabs outside the three areas above (Settings, Telemetry dashboard, Mission Planning toolbar, etc.). This is a mechanical pass, file-by-file, no behavior change — lowest risk, can be done incrementally/opportunistically rather than as one big sweep.

## Error handling / edge cases carried forward unchanged

- Connection failures, driver-missing detection (`DriverAssistant`), and the waiting-for-heartbeat state — same logic, Phase 1 only restyles their presentation.
- Vehicle-type mismatch dialog (profile vs. connected FC) — unaffected by any phase.
- Configure adapter must surface protocol capability gaps explicitly (e.g. if Betaflight has no equivalent for some ArduPilot-only field, the adapter returns `undefined`/`unsupported` and the shared tab hides that field) rather than showing a broken/empty control.

## Testing approach

- Phases 0, 3, 4, 5 are structural/visual — verified by manual run-through (`/run` skill) of each affected screen in both light and dark theme, connected and disconnected.
- Phase 1 verified against all three connection modes (USB serial to a real or virtual board, TCP to SITL, UDP listen/client) plus the existing auto-reconnect-after-SITL-launch flow.
- Phase 2 is the only phase needing protocol-matrix verification: each migrated tab checked against an ArduPilot SITL session, a Betaflight/iNav MSP session (real board or equivalent), and one legacy CLI board if available, before moving to the next tab.

## Decomposition into separate implementation plans

Per the size of this work, each phase gets its own implementation plan (via `writing-plans`) rather than one combined plan:
1. Phase 0 — Design system extension
2. Phase 1 — Connection flow rewrite
3. Phase 2 — Unified Configure view (likely split further into per-tab sub-plans given its size and risk)
4. Phase 3 — Navigation reorganization
5. Phase 4 — Landing page completion
6. Phase 5 — Visual sweep

This spec covers the overall shape and rationale; phase-specific plans will cover concrete file-level steps.
