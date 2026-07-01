# Fleet Management — Design Spec

**Date:** 2026-07-01
**Status:** Approved for planning
**Scope:** Fleet management only. Live video streaming from drone cameras is an explicitly separate, future spec — not covered here.

## Problem

Jawji connects to exactly one vehicle at a time. There is no way to see or manage multiple drones at once. The user wants a fleet view that shows several vehicles' live status simultaneously, while still being able to get the full single-vehicle toolset (mission planning, parameters, calibration, firmware, CLI, etc.) for whichever one they're actively flying/configuring.

## Requirements (from brainstorming)

1. **Multiple simultaneous connections**, not just a saved-profile switcher — several vehicles show live status at once.
2. **Lightweight fleet overview + focus one vehicle.** The fleet view is a monitoring/basic-command surface (status, map, arm/disarm, mode, RTL). Every other existing view (Mission Planning, Parameters, Calibration, Firmware Flash, CLI, etc.) continues to operate on a single "focused" vehicle exactly as it does today — those views do not become multi-vehicle-aware.
3. **Scale:** small fleets, 2-5 vehicles, network connections only (TCP/UDP) for the non-focused fleet vehicles. (The focused vehicle can still be serial, exactly as today.)
4. **Protocol scope:** both MAVLink (ArduPilot) and MSP (Betaflight/iNav) vehicles are supported in the fleet.
5. **Adding vehicles:** manual add via a form (same connection fields as today's Connect panel), saved to a persistent roster that survives app restarts.

## Non-goals (explicitly out of scope)

- Live video streaming (separate future spec).
- Full multi-vehicle depth in Mission Planning, Parameters, Calibration, Firmware Flash, CLI, or any other existing view — those remain single-"focused"-vehicle only.
- Auto-discovery (UDP broadcast heartbeat scanning) — vehicles are added manually.
- Simultaneous *full-control* connections (arming/mission upload/parameter writes) to more than one vehicle at a time. Only the focused vehicle gets full command access; other roster vehicles are monitor-only until focused.
- Refactoring the core single-vehicle connection layer (`currentTransport` in `ipc-handlers.ts`) to be vehicle-ID-keyed. That would be the "purer" architecture for future full multi-vehicle depth, but given requirement 2 (lightweight overview only) and the size/risk of that file (~8,000+ lines, every command handler assumes one active transport), it is not justified now. This can be revisited if fleet requirements grow toward per-vehicle mission/parameter work.

## Architecture

### Two connection tiers

1. **Focused connection (unchanged).** Exactly today's system: `currentTransport`, `ConnectionPanel`, all existing IPC handlers, `connection-store`, `telemetry-store`, every view that depends on them. Zero changes to this code path's internals.
2. **Fleet Monitor (new).** For every roster entry that is *not* the currently focused vehicle, the main process opens a minimal, read-only connection:
   - **MAVLink:** open the vehicle's TCP/UDP endpoint, parse only `HEARTBEAT`, `GLOBAL_POSITION_INT` (or `GPS_RAW_INT`), and `SYS_STATUS`/battery fields. No parameter, mission, or command handling.
   - **MSP:** open TCP/serial, poll `MSP_STATUS` (or `MSP2_INAV_STATUS`), `MSP_RAW_GPS`, `MSP_ANALOG` at a low rate (1-2 Hz). No mode-range/parameter/mission polling.

   This deliberately reuses as little of the existing protocol-parsing machinery as possible — it's a narrow, self-contained parser, not a second instance of the full MSP/MAVLink handler stack. Keeping it separate is what avoids touching `ipc-handlers.ts`.

### Roster persistence

- New electron-store-backed roster (same pattern as today's saved layouts/settings), living in the main process.
- Roster entry shape:
  ```ts
  interface FleetVehicleEntry {
    id: string;             // stable UUID, independent of connection details
    name: string;           // user-given label
    protocol: 'mavlink' | 'msp';
    transport: 'tcp' | 'udp' | 'serial';
    host?: string;          // tcp/udp
    port?: number;          // tcp/udp
    serialPath?: string;    // serial
    baudRate?: number;      // serial
  }
  ```
- CRUD (add/edit/remove) happens from the Fleet view. Roster survives app restart; vehicles are not auto-reconnected on launch — the user reconnects from the Fleet view (matches how the existing single-connection flow behaves today, no auto-reconnect-all).

### Focus / unfocus lifecycle

- **Focusing** a roster vehicle: main process (a) closes that entry's Fleet Monitor connection if open, (b) calls the *existing, unchanged* connect flow with that entry's connection params — identical to using the sidebar `ConnectionPanel` today. If a different vehicle was already focused, it is disconnected first via the existing disconnect flow.
- **Un-focusing** (switching focus away, or disconnecting): if the vehicle that was focused is still in the roster, the main process reopens a Fleet Monitor connection for it so it keeps showing status in the fleet view.
- Net effect: "Focus" in the Fleet view is just a convenience wrapper around the connect/disconnect calls that already exist — no new command surface is added for controlling a vehicle.

### IPC surface (new, additive only)

- `FLEET_GET_ROSTER` / `FLEET_ADD_VEHICLE` / `FLEET_UPDATE_VEHICLE` / `FLEET_REMOVE_VEHICLE` — roster CRUD.
- `FLEET_FOCUS_VEHICLE` — triggers the focus/unfocus lifecycle described above.
- `FLEET_VEHICLE_STATUS` (broadcast) — pushes `{ vehicleId, status }` for each monitored (non-focused) vehicle at low rate; `status` = `{ connected, armed, mode, batteryPercent, batteryVoltage, lat, lon, alt, lastSeenAt, error? }`.

No existing IPC channel changes.

### Renderer

- New `fleet-store.ts` (Zustand): roster list, per-vehicle live status map (keyed by `id`), loading/error state per entry, actions mirroring the IPC surface above.
- New `FleetView.tsx` (new nav rail entry, "Fleet"): grid of vehicle tiles (name, status dot, armed/mode/battery, last-seen) + a shared Leaflet map showing every vehicle with live position (reusing map patterns already used in `MissionMapPanel`, simplified — no waypoints/overlays, just vehicle markers). Each tile has:
  - **Focus** button → promotes that vehicle to the main connection (existing views now operate on it).
  - **Edit** / **Remove** for roster management.
  - **Add Vehicle** button opens a form with the same fields as today's Connect panel.
- The currently-focused vehicle also appears in the Fleet view (highlighted/pinned) so the full roster is visible in one place, but its live data comes from the existing `telemetry-store`/`connection-store`, not from the Fleet Monitor.

## Error handling

- A roster entry that fails to connect (unreachable host, wrong port, refused connection) shows an error state on its tile (red dot + short message) with a retry action. It does not affect other tiles or the focused vehicle.
- Adding a duplicate entry (same protocol + host + port, or same serial path) is rejected with an inline validation error.
- Focusing a vehicle that then fails to connect: the previous vehicle is already disconnected by that point (same behavior as today's Connect panel when switching connections) — the user sees the normal disconnected/error state and can retry from the roster, same as reconnecting manually today. This matches existing UX rather than inventing new fallback behavior.

## Testing

- Unit tests for `fleet-store` roster CRUD and status-map updates.
- Unit tests for the Fleet Monitor's connection lifecycle in the main process (open lightweight connection → parse heartbeat/GPS/battery → close on removal or on focus), using the same mocked-transport pattern as `apps/desktop/src/main/__tests__/arming-helpers.test.ts`.
- Manual verification: run 2-3 SITL instances on different UDP ports (or a mix of SITL + the existing `tools/mock-drone/mock_drone.py`), add them to the roster, confirm all tiles update live, confirm focusing/un-focusing correctly hands off the main connection, and confirm every existing view (Mission Planning, Parameters, etc.) continues to work unchanged against the focused vehicle.

## Open questions for the implementation plan

None outstanding — all requirements were resolved during brainstorming. The one architectural trade-off (lightweight monitor vs. full vehicle-ID-keyed refactor) is documented above as a deliberate choice, not a gap.
