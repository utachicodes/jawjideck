# Fleet Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Fleet view that shows live status (armed/mode/battery/position) for several vehicles at once, while every existing view keeps working exactly as today against a single "focused" vehicle.

**Architecture:** The existing single-vehicle connection (`currentTransport` in `ipc-handlers.ts`, all existing IPC handlers, all existing views) is untouched. A new, separate "Fleet Monitor" subsystem opens lightweight, read-only connections (MAVLink: HEARTBEAT/GLOBAL_POSITION_INT/SYS_STATUS only; MSP: low-rate MSP_STATUS_EX/RAW_GPS/ANALOG polling) to every roster vehicle that isn't currently focused. A saved roster (electron-store) persists vehicle connection info across restarts. The renderer's "Focus" action reuses the existing `connect`/`disconnect` IPC calls unchanged, then tells the fleet subsystem which vehicle is now focused so it can start/stop the right monitors.

**Tech Stack:** Electron main/renderer (existing), TypeScript, Zustand (renderer state), `electron-store` (roster persistence), `@jawji/comms` (`TcpTransport`, `UdpTransport`, `SerialTransport`), `@jawji/mavlink-ts` (`MAVLinkParser`, message deserializers), `@jawji/msp-ts` (`MSPParser`, `buildMspV1Request`, message deserializers), `react-leaflet` (fleet map), Vitest (tests).

## Global Constraints

- Fleet scope: 2-5 vehicles, network connections (TCP/UDP) for monitored (non-focused) vehicles. The focused vehicle can still be serial, exactly as today.
- Both MAVLink (ArduPilot) and MSP (Betaflight/iNav) vehicles are supported in the roster.
- Vehicles are added manually (no auto-discovery); the roster persists across app restarts but vehicles are not auto-reconnected on launch.
- Every existing view (Mission Planning, Parameters, Calibration, Firmware Flash, CLI, etc.) remains single-"focused"-vehicle only — do not make them fleet-aware.
- Do not refactor `currentTransport`/the core connection layer in `ipc-handlers.ts` to be vehicle-ID-keyed. The Fleet Monitor is a separate, additive subsystem.
- Live video streaming is explicitly out of scope (separate future spec).

---

## File Structure

**New files (main process):**
- `apps/desktop/src/main/fleet/fleet-roster.ts` — pure roster CRUD logic + electron-store persistence
- `apps/desktop/src/main/fleet/fleet-monitor.ts` — lightweight per-vehicle MAVLink/MSP connection + status parsing
- `apps/desktop/src/main/fleet/index.ts` — `registerFleetHandlers(mainWindow)`, wires IPC + monitor lifecycle
- `apps/desktop/src/main/fleet/__tests__/fleet-roster.test.ts`
- `apps/desktop/src/main/fleet/__tests__/fleet-monitor.test.ts`

**New files (renderer):**
- `apps/desktop/src/renderer/stores/fleet-store.ts` — Zustand store (roster, live status, focus orchestration)
- `apps/desktop/src/renderer/stores/fleet-store.test.ts`
- `apps/desktop/src/renderer/components/fleet/FleetMapPanel.tsx` — simplified Leaflet map, one marker per vehicle
- `apps/desktop/src/renderer/components/fleet/AddVehicleModal.tsx` — add/edit vehicle form
- `apps/desktop/src/renderer/components/fleet/FleetView.tsx` — top-level view assembling tiles + map + modal

**Modified files:**
- `apps/desktop/src/shared/ipc-channels.ts` — add `FLEET_*` channel constants + `FleetVehicleEntry`/`FleetVehicleStatus` types
- `apps/desktop/src/main/ipc-handlers.ts` — one import + one `registerFleetHandlers(mainWindow)` call inside `setupIpcHandlers` (mirrors the existing `registerMspHandlers(mainWindow)` pattern)
- `apps/desktop/src/main/preload.ts` — expose fleet IPC methods on the `api` object
- `apps/desktop/src/renderer/stores/navigation-store.ts` — add `'fleet'` to `VIEW_IDS`
- `apps/desktop/src/renderer/components/navigation/NavigationRail.tsx` — add a "Fleet" nav item
- `apps/desktop/src/renderer/App.tsx` — import `FleetView`, add render case (both connected and disconnected branches, since fleet monitoring doesn't require a focused connection)
- `CHANGELOG.md` — Unreleased entry
- `README.md` — Features + Roadmap entries

---

### Task 1: Shared types and IPC channels

**Files:**
- Modify: `apps/desktop/src/shared/ipc-channels.ts`

**Interfaces:**
- Produces: `FleetVehicleEntry`, `FleetVehicleStatus` types; `IPC_CHANNELS.FLEET_GET_ROSTER`, `FLEET_ADD_VEHICLE`, `FLEET_UPDATE_VEHICLE`, `FLEET_REMOVE_VEHICLE`, `FLEET_SET_FOCUSED`, `FLEET_VEHICLE_STATUS` — used by every later task.

- [ ] **Step 1: Add the channel constants**

Open `apps/desktop/src/shared/ipc-channels.ts` and add a new block right after the existing `CONNECTION_STATE`/`GET_CONNECTION_STATE` block (around line 76-77):

```typescript
  // Fleet management
  FLEET_GET_ROSTER: 'fleet:get-roster',
  FLEET_ADD_VEHICLE: 'fleet:add-vehicle',
  FLEET_UPDATE_VEHICLE: 'fleet:update-vehicle',
  FLEET_REMOVE_VEHICLE: 'fleet:remove-vehicle',
  FLEET_SET_FOCUSED: 'fleet:set-focused',
  FLEET_VEHICLE_STATUS: 'fleet:vehicle-status',
```

- [ ] **Step 2: Add the shared types**

Add near `ConnectionState` (after its closing brace, around line 715+ — find the end of the `ConnectionState` interface and insert after it):

```typescript
/**
 * A vehicle entry in the fleet roster. `id` is a stable identifier
 * independent of connection details (a roster entry can be edited without
 * losing its identity/status history).
 */
export interface FleetVehicleEntry {
  id: string;
  name: string;
  protocol: 'mavlink' | 'msp';
  transportType: 'tcp' | 'udp' | 'serial';
  host?: string;
  port?: number;
  serialPath?: string;
  baudRate?: number;
}

/**
 * Live status for one fleet vehicle, as reported by the lightweight Fleet
 * Monitor. Intentionally minimal — this is an overview, not full telemetry.
 */
export interface FleetVehicleStatus {
  vehicleId: string;
  connected: boolean;
  armed: boolean;
  /** Raw MAVLink custom_mode number, or null for MSP/unknown. Not decoded to a friendly name — that requires vehicle-type context out of scope for this lightweight overview. */
  modeNumber: number | null;
  batteryPercent: number | null;
  batteryVoltage: number | null;
  lat: number | null;
  lon: number | null;
  lastSeenAt: number | null;
  error: string | null;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes with no new errors (nothing consumes these yet, so no other file changes needed).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/shared/ipc-channels.ts
git commit -m "Add fleet management IPC channels and shared types"
```

---

### Task 2: Fleet roster — persistence + pure CRUD logic

**Files:**
- Create: `apps/desktop/src/main/fleet/fleet-roster.ts`
- Test: `apps/desktop/src/main/fleet/__tests__/fleet-roster.test.ts`

**Interfaces:**
- Consumes: `FleetVehicleEntry` from `../../shared/ipc-channels.js`
- Produces: `validateNewEntry(entries: FleetVehicleEntry[], candidate: Omit<FleetVehicleEntry, 'id'>): string | null` (returns an error message, or `null` if valid), `getRoster(): FleetVehicleEntry[]`, `addVehicle(candidate: Omit<FleetVehicleEntry, 'id'>): FleetVehicleEntry`, `updateVehicle(id: string, patch: Partial<Omit<FleetVehicleEntry, 'id'>>): FleetVehicleEntry | null`, `removeVehicle(id: string): void` — all consumed by Task 5 (`fleet/index.ts`).

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/src/main/fleet/__tests__/fleet-roster.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { validateNewEntry, getRoster, addVehicle, updateVehicle, removeVehicle, _resetRosterForTests } from '../fleet-roster.js';
import type { FleetVehicleEntry } from '../../../shared/ipc-channels.js';

describe('fleet-roster', () => {
  beforeEach(() => {
    _resetRosterForTests();
  });

  it('starts with an empty roster', () => {
    expect(getRoster()).toEqual([]);
  });

  it('adds a vehicle and assigns a stable id', () => {
    const entry = addVehicle({ name: 'Drone 1', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 });
    expect(entry.id).toBeTruthy();
    expect(getRoster()).toEqual([entry]);
  });

  it('rejects a duplicate host+port for the same transport', () => {
    addVehicle({ name: 'Drone 1', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 });
    const error = validateNewEntry(getRoster(), { name: 'Drone 2', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 });
    expect(error).toMatch(/already/i);
  });

  it('rejects a duplicate serial path', () => {
    addVehicle({ name: 'Drone 1', protocol: 'msp', transportType: 'serial', serialPath: 'COM3', baudRate: 115200 });
    const error = validateNewEntry(getRoster(), { name: 'Drone 2', protocol: 'msp', transportType: 'serial', serialPath: 'COM3', baudRate: 115200 });
    expect(error).toMatch(/already/i);
  });

  it('allows a non-duplicate entry', () => {
    addVehicle({ name: 'Drone 1', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 });
    const error = validateNewEntry(getRoster(), { name: 'Drone 2', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14551 });
    expect(error).toBeNull();
  });

  it('updates a vehicle by id', () => {
    const entry = addVehicle({ name: 'Drone 1', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 });
    const updated = updateVehicle(entry.id, { name: 'Renamed' });
    expect(updated?.name).toBe('Renamed');
    expect(getRoster()[0]?.name).toBe('Renamed');
  });

  it('returns null when updating an unknown id', () => {
    expect(updateVehicle('nonexistent', { name: 'x' })).toBeNull();
  });

  it('removes a vehicle by id', () => {
    const entry = addVehicle({ name: 'Drone 1', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 });
    removeVehicle(entry.id);
    expect(getRoster()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/desktop && npx vitest run src/main/fleet/__tests__/fleet-roster.test.ts`
Expected: FAIL — `../fleet-roster.js` does not exist yet.

- [ ] **Step 3: Implement `fleet-roster.ts`**

Create `apps/desktop/src/main/fleet/fleet-roster.ts`:

```typescript
/**
 * Fleet Roster — persisted list of vehicles available for lightweight fleet
 * monitoring. Separate from the main connection layer entirely; this module
 * only tracks *which* vehicles exist and their connection info, not whether
 * they're currently connected.
 */

import Store from 'electron-store';
import { randomUUID } from 'node:crypto';
import type { FleetVehicleEntry } from '../../shared/ipc-channels.js';

interface FleetRosterSchema {
  vehicles: FleetVehicleEntry[];
}

const rosterStore = new Store<FleetRosterSchema>({
  name: 'fleet-roster',
  defaults: { vehicles: [] },
});

/**
 * Returns an error message if `candidate` would duplicate an existing
 * roster entry's connection endpoint, or `null` if it's valid to add.
 */
export function validateNewEntry(entries: FleetVehicleEntry[], candidate: Omit<FleetVehicleEntry, 'id'>): string | null {
  const duplicate = entries.some((e) => {
    if (e.transportType !== candidate.transportType) return false;
    if (candidate.transportType === 'serial') {
      return e.serialPath === candidate.serialPath;
    }
    return e.host === candidate.host && e.port === candidate.port;
  });
  if (duplicate) {
    return candidate.transportType === 'serial'
      ? `A vehicle on ${candidate.serialPath} is already in the roster`
      : `A vehicle at ${candidate.host}:${candidate.port} is already in the roster`;
  }
  return null;
}

export function getRoster(): FleetVehicleEntry[] {
  return rosterStore.get('vehicles', []);
}

export function addVehicle(candidate: Omit<FleetVehicleEntry, 'id'>): FleetVehicleEntry {
  const entry: FleetVehicleEntry = { ...candidate, id: randomUUID() };
  const vehicles = [...getRoster(), entry];
  rosterStore.set('vehicles', vehicles);
  return entry;
}

export function updateVehicle(id: string, patch: Partial<Omit<FleetVehicleEntry, 'id'>>): FleetVehicleEntry | null {
  const vehicles = getRoster();
  const idx = vehicles.findIndex((v) => v.id === id);
  if (idx === -1) return null;
  const updated: FleetVehicleEntry = { ...vehicles[idx]!, ...patch };
  const next = [...vehicles];
  next[idx] = updated;
  rosterStore.set('vehicles', next);
  return updated;
}

export function removeVehicle(id: string): void {
  rosterStore.set('vehicles', getRoster().filter((v) => v.id !== id));
}

/** Test-only: clear the roster. Not exported from the module's public API surface used by production code. */
export function _resetRosterForTests(): void {
  rosterStore.set('vehicles', []);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/desktop && npx vitest run src/main/fleet/__tests__/fleet-roster.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/fleet/fleet-roster.ts apps/desktop/src/main/fleet/__tests__/fleet-roster.test.ts
git commit -m "Add fleet roster persistence and CRUD logic"
```

---

### Task 3: Fleet Monitor — MAVLink lightweight connection

**Files:**
- Create: `apps/desktop/src/main/fleet/fleet-monitor.ts`
- Test: `apps/desktop/src/main/fleet/__tests__/fleet-monitor.test.ts`

**Interfaces:**
- Consumes: `FleetVehicleEntry`, `FleetVehicleStatus` from `../../shared/ipc-channels.js`; `TcpTransport`, `UdpTransport`, `SerialTransport` from `@jawji/comms`; `MAVLinkParser`, `HEARTBEAT_ID`, `deserializeHeartbeat`, `GLOBAL_POSITION_INT_ID`, `deserializeGlobalPositionInt`, `SYS_STATUS_ID`, `deserializeSysStatus` from `@jawji/mavlink-ts`.
- Produces: `startMonitor(entry: FleetVehicleEntry, onStatus: (status: FleetVehicleStatus) => void): FleetMonitorHandle`, where `interface FleetMonitorHandle { stop(): void }`. Consumed by Task 5.

This task covers the MAVLink half. Task 4 adds the MSP half to the same file.

- [ ] **Step 1: Write the failing test (MAVLink monitor)**

Create `apps/desktop/src/main/fleet/__tests__/fleet-monitor.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { startMonitor } from '../fleet-monitor.js';
import type { FleetVehicleEntry } from '../../../shared/ipc-channels.js';

// Minimal fake Transport: an EventEmitter with the subset of the Transport
// interface fleet-monitor.ts actually uses (open/close/write/on/off + isOpen).
class FakeTransport extends EventEmitter {
  isOpen = false;
  async open() { this.isOpen = true; this.emit('open'); }
  async close() { this.isOpen = false; this.emit('close'); }
  async write(_data: Uint8Array) { /* no-op for tests */ }
}

function buildMavlinkV2Packet(msgid: number, payload: Uint8Array, sysid = 1, compid = 1): Uint8Array {
  const header = new Uint8Array([0xfd, payload.length, 0, 0, 0, sysid, compid, msgid & 0xff, (msgid >> 8) & 0xff, (msgid >> 16) & 0xff]);
  const crc = new Uint8Array([0, 0]); // fleet-monitor.ts does not validate CRC (see Step 3 note)
  return new Uint8Array([...header, ...payload, ...crc]);
}

describe('startMonitor (MAVLink)', () => {
  it('reports armed status and position from HEARTBEAT + GLOBAL_POSITION_INT', async () => {
    const entry: FleetVehicleEntry = { id: 'v1', name: 'Test', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 };
    const fakeTransport = new FakeTransport();
    const statuses: unknown[] = [];

    const handle = startMonitor(entry, (status) => statuses.push(status), {
      createTransport: () => fakeTransport as never,
    });
    await new Promise((r) => setTimeout(r, 0)); // let open() resolve

    // HEARTBEAT: type=2(quad), autopilot=3(ardupilotmega), base_mode=0x80 (armed), custom_mode=4, system_status=4
    const hbPayload = new Uint8Array(9);
    new DataView(hbPayload.buffer).setUint32(0, 4, true); // custom_mode
    hbPayload[4] = 2; hbPayload[5] = 3; hbPayload[6] = 0x80; hbPayload[7] = 4; hbPayload[8] = 3;
    fakeTransport.emit('data', buildMavlinkV2Packet(0, hbPayload));

    // GLOBAL_POSITION_INT: lat=370000000 (37.0 deg), lon=-1220000000 (-122.0 deg)
    const posPayload = new Uint8Array(28);
    const posView = new DataView(posPayload.buffer);
    posView.setUint32(0, 1000, true);
    posView.setInt32(4, 370000000, true);
    posView.setInt32(8, -1220000000, true);
    fakeTransport.emit('data', buildMavlinkV2Packet(33, posPayload));

    await new Promise((r) => setTimeout(r, 0));

    expect(statuses.length).toBeGreaterThan(0);
    const last = statuses[statuses.length - 1] as { armed: boolean; modeNumber: number; lat: number; lon: number };
    expect(last.armed).toBe(true);
    expect(last.modeNumber).toBe(4);
    expect(last.lat).toBeCloseTo(37.0, 5);
    expect(last.lon).toBeCloseTo(-122.0, 5);

    handle.stop();
  });

  it('stop() closes the transport', async () => {
    const entry: FleetVehicleEntry = { id: 'v1', name: 'Test', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 };
    const fakeTransport = new FakeTransport();
    const closeSpy = vi.spyOn(fakeTransport, 'close');
    const handle = startMonitor(entry, () => {}, { createTransport: () => fakeTransport as never });
    await new Promise((r) => setTimeout(r, 0));
    handle.stop();
    expect(closeSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/desktop && npx vitest run src/main/fleet/__tests__/fleet-monitor.test.ts`
Expected: FAIL — `../fleet-monitor.js` does not exist yet.

- [ ] **Step 3: Implement the MAVLink half of `fleet-monitor.ts`**

Create `apps/desktop/src/main/fleet/fleet-monitor.ts`:

```typescript
/**
 * Fleet Monitor — lightweight, read-only status connection for one roster
 * vehicle that is NOT the currently-focused vehicle. Deliberately minimal:
 * it parses just enough (armed/mode/battery/position) for a fleet overview
 * tile, and does not touch parameters, missions, or commands. This is a
 * self-contained parser instance per vehicle — it does not share the main
 * connection's transport, mutex, or telemetry pipeline in ipc-handlers.ts.
 *
 * Note on MAVLink CRC: this parser does not register message CRC-extra
 * values, matching how the main connection's own MAVLinkParser is used
 * elsewhere in this codebase (see ipc-handlers.ts) — packets are accepted
 * based on msgid alone. This is a deliberate simplification appropriate for
 * a monitoring-only feed, not the full command/control connection.
 */

import { TcpTransport, UdpTransport, SerialTransport } from '@jawji/comms';
import type { Transport } from '@jawji/comms';
import {
  MAVLinkParser,
  HEARTBEAT_ID,
  deserializeHeartbeat,
  GLOBAL_POSITION_INT_ID,
  deserializeGlobalPositionInt,
  SYS_STATUS_ID,
  deserializeSysStatus,
} from '@jawji/mavlink-ts';
import { MSPParser, MSP, buildMspV1Request } from '@jawji/msp-ts';
import {
  deserializeStatus,
  deserializeRawGps,
  deserializeAnalog,
  isArmed as isMspArmed,
} from '@jawji/msp-ts';
import type { FleetVehicleEntry, FleetVehicleStatus } from '../../shared/ipc-channels.js';

export interface FleetMonitorHandle {
  stop(): void;
}

interface StartMonitorOptions {
  /** Test seam: inject a fake transport instead of constructing a real one. */
  createTransport?: (entry: FleetVehicleEntry) => Transport;
}

const MAV_MODE_FLAG_SAFETY_ARMED = 0x80;

function createRealTransport(entry: FleetVehicleEntry): Transport {
  if (entry.transportType === 'tcp') {
    return new TcpTransport({ host: entry.host!, port: entry.port! });
  }
  if (entry.transportType === 'udp') {
    return new UdpTransport({ remoteHost: entry.host, remotePort: entry.port, localPort: 0 });
  }
  return new SerialTransport(entry.serialPath!, { baudRate: entry.baudRate ?? 115200 });
}

function emptyStatus(vehicleId: string): FleetVehicleStatus {
  return {
    vehicleId,
    connected: false,
    armed: false,
    modeNumber: null,
    batteryPercent: null,
    batteryVoltage: null,
    lat: null,
    lon: null,
    lastSeenAt: null,
    error: null,
  };
}

export function startMonitor(
  entry: FleetVehicleEntry,
  onStatus: (status: FleetVehicleStatus) => void,
  options: StartMonitorOptions = {},
): FleetMonitorHandle {
  const transport = (options.createTransport ?? createRealTransport)(entry);
  let status = emptyStatus(entry.id);
  let stopped = false;
  let mspPollInterval: ReturnType<typeof setInterval> | null = null;

  const emit = (patch: Partial<FleetVehicleStatus>) => {
    if (stopped) return;
    status = { ...status, ...patch, lastSeenAt: Date.now() };
    onStatus(status);
  };

  if (entry.protocol === 'mavlink') {
    const parser = new MAVLinkParser();
    transport.on('data', (data: Uint8Array) => {
      parser.feed(data);
      let packet;
      while ((packet = parser.parseNext()) !== null) {
        if (packet.msgid === HEARTBEAT_ID) {
          const hb = deserializeHeartbeat(packet.payload);
          emit({ connected: true, armed: (hb.baseMode & MAV_MODE_FLAG_SAFETY_ARMED) !== 0, modeNumber: hb.customMode, error: null });
        } else if (packet.msgid === GLOBAL_POSITION_INT_ID) {
          const pos = deserializeGlobalPositionInt(packet.payload);
          emit({ connected: true, lat: pos.lat / 1e7, lon: pos.lon / 1e7 });
        } else if (packet.msgid === SYS_STATUS_ID) {
          const sys = deserializeSysStatus(packet.payload);
          emit({ connected: true, batteryVoltage: sys.voltageBattery / 1000, batteryPercent: sys.batteryRemaining >= 0 ? sys.batteryRemaining : null });
        }
      }
    });
  } else {
    startMspPolling();
  }

  transport.on('error', (err: Error) => {
    emit({ connected: false, error: err.message });
  });
  transport.on('close', () => {
    emit({ connected: false });
  });

  transport.open().catch((err: Error) => {
    emit({ connected: false, error: err.message });
  });

  function startMspPolling(): void {
    const parser = new MSPParser();
    let pending: { command: number; resolve: (payload: Uint8Array) => void; timeout: ReturnType<typeof setTimeout> } | null = null;

    transport.on('data', (data: Uint8Array) => {
      const packets = parser.parseSync(data);
      for (const packet of packets) {
        if (pending && packet.command === pending.command) {
          clearTimeout(pending.timeout);
          pending.resolve(packet.payload);
          pending = null;
        }
      }
    });

    const request = (command: number, timeoutMs = 500): Promise<Uint8Array> => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pending = null; reject(new Error('MSP request timed out')); }, timeoutMs);
        pending = { command, resolve, timeout };
        transport.write(buildMspV1Request(command)).catch((err: Error) => {
          clearTimeout(timeout);
          pending = null;
          reject(err);
        });
      });
    };

    const pollOnce = async () => {
      if (!transport.isOpen) return;
      try {
        const statusPayload = await request(MSP.STATUS_EX);
        const mspStatus = deserializeStatus(statusPayload);
        emit({ connected: true, armed: isMspArmed(mspStatus.flightModeFlags), modeNumber: null, error: null });
      } catch { /* one poll failing doesn't flip the tile to disconnected — transport 'close'/'error' events handle that */ }

      try {
        const gpsPayload = await request(MSP.RAW_GPS);
        const gps = deserializeRawGps(gpsPayload);
        emit({ connected: true, lat: gps.lat / 1e7, lon: gps.lon / 1e7 });
      } catch { /* ignore */ }

      try {
        const analogPayload = await request(MSP.ANALOG);
        const analog = deserializeAnalog(analogPayload);
        emit({ connected: true, batteryVoltage: analog.voltage, batteryPercent: null });
      } catch { /* ignore */ }
    };

    transport.on('open', () => {
      mspPollInterval = setInterval(pollOnce, 2000);
      pollOnce();
    });
  }

  return {
    stop() {
      stopped = true;
      if (mspPollInterval) clearInterval(mspPollInterval);
      transport.close().catch(() => { /* already closing/closed */ });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/desktop && npx vitest run src/main/fleet/__tests__/fleet-monitor.test.ts`
Expected: PASS (2 tests). If the HEARTBEAT/GLOBAL_POSITION_INT test fails on packet framing, double check `MAVLinkParser.feed()`/`parseNext()` against `packages/mavlink-ts/src/core/mavlink-parser.ts` — the test's `buildMavlinkV2Packet` helper must match the header layout `drainBuffer()` expects (magic, len, incompat, compat, seq, sysid, compid, msgid(3 bytes LE), payload, crc16).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/fleet/fleet-monitor.ts apps/desktop/src/main/fleet/__tests__/fleet-monitor.test.ts
git commit -m "Add fleet monitor: lightweight MAVLink + MSP status polling"
```

---

### Task 4: Fleet handlers — IPC wiring + monitor lifecycle

**Files:**
- Create: `apps/desktop/src/main/fleet/index.ts`
- Modify: `apps/desktop/src/main/ipc-handlers.ts`

**Interfaces:**
- Consumes: everything from Task 2 (`fleet-roster.ts`) and Task 3 (`fleet-monitor.ts`); `safeSend` and `getAllWindows` pattern already used in `ipc-handlers.ts` (see `apps/desktop/src/main/window-manager.ts`'s `getAllWindows()`).
- Produces: `registerFleetHandlers(mainWindow: BrowserWindow): void` — called once from `setupIpcHandlers`.

- [ ] **Step 1: Implement `apps/desktop/src/main/fleet/index.ts`**

```typescript
/**
 * Fleet management IPC wiring. Owns the set of active Fleet Monitor
 * connections — one per roster vehicle that is not currently focused.
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS, type FleetVehicleEntry } from '../../shared/ipc-channels.js';
import { getAllWindows } from '../window-manager.js';
import { getRoster, addVehicle, updateVehicle, removeVehicle, validateNewEntry } from './fleet-roster.js';
import { startMonitor, type FleetMonitorHandle } from './fleet-monitor.js';

const activeMonitors = new Map<string, FleetMonitorHandle>();
let focusedVehicleId: string | null = null;

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of getAllWindows()) {
    if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }
}

function stopMonitor(vehicleId: string): void {
  activeMonitors.get(vehicleId)?.stop();
  activeMonitors.delete(vehicleId);
}

function startMonitorFor(entry: FleetVehicleEntry): void {
  if (activeMonitors.has(entry.id)) return;
  const handle = startMonitor(entry, (status) => {
    broadcast(IPC_CHANNELS.FLEET_VEHICLE_STATUS, status);
  });
  activeMonitors.set(entry.id, handle);
}

/** Start monitors for every roster vehicle except the currently-focused one. */
function syncMonitors(): void {
  const roster = getRoster();
  const rosterIds = new Set(roster.map((v) => v.id));

  for (const id of activeMonitors.keys()) {
    if (!rosterIds.has(id)) stopMonitor(id);
  }
  for (const entry of roster) {
    if (entry.id === focusedVehicleId) {
      stopMonitor(entry.id);
    } else {
      startMonitorFor(entry);
    }
  }
}

export function registerFleetHandlers(_mainWindow: BrowserWindow): void {
  syncMonitors();

  ipcMain.handle(IPC_CHANNELS.FLEET_GET_ROSTER, async () => {
    return getRoster();
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_ADD_VEHICLE, async (_, candidate: Omit<FleetVehicleEntry, 'id'>) => {
    const error = validateNewEntry(getRoster(), candidate);
    if (error) return { success: false, error };
    const entry = addVehicle(candidate);
    syncMonitors();
    return { success: true, entry };
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_UPDATE_VEHICLE, async (_, id: string, patch: Partial<Omit<FleetVehicleEntry, 'id'>>) => {
    stopMonitor(id);
    const updated = updateVehicle(id, patch);
    syncMonitors();
    return updated;
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_REMOVE_VEHICLE, async (_, id: string) => {
    stopMonitor(id);
    removeVehicle(id);
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_SET_FOCUSED, async (_, vehicleId: string | null) => {
    focusedVehicleId = vehicleId;
    syncMonitors();
  });
}
```

- [ ] **Step 2: Wire it into `ipc-handlers.ts`**

Open `apps/desktop/src/main/ipc-handlers.ts`. Find this existing import (around line 111):

```typescript
import { registerMspHandlers, tryMspDetection, startMspTelemetry, stopMspTelemetry, cleanupMspConnection, exitCliModeIfActive, autoConfigureSitlPlatform, getMspVehicleType, resetSitlAutoConfig } from './msp/index.js';
```

Add a new import directly after it:

```typescript
import { registerFleetHandlers } from './fleet/index.js';
```

Find this existing call (around line 7755):

```typescript
  registerMspHandlers(mainWindow);
```

Add directly after it:

```typescript
  registerFleetHandlers(mainWindow);
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes with no errors. If `FleetVehicleEntry` isn't exported as a type from `ipc-channels.ts` in a way `fleet/index.ts` can import alongside `IPC_CHANNELS`, fix the import to `import { IPC_CHANNELS } from '../../shared/ipc-channels.js'; import type { FleetVehicleEntry } from '../../shared/ipc-channels.js';` (split value vs type import).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/fleet/index.ts apps/desktop/src/main/ipc-handlers.ts
git commit -m "Wire fleet IPC handlers and monitor lifecycle into main process"
```

---

### Task 5: Preload — expose fleet API to the renderer

**Files:**
- Modify: `apps/desktop/src/main/preload.ts`

**Interfaces:**
- Produces: `window.electronAPI.fleetGetRoster()`, `.fleetAddVehicle()`, `.fleetUpdateVehicle()`, `.fleetRemoveVehicle()`, `.fleetSetFocused()`, `.onFleetVehicleStatus()` — consumed by Task 6 (`fleet-store.ts`).

- [ ] **Step 1: Add the methods to the `api` object**

Open `apps/desktop/src/main/preload.ts`. Find the `getConnectionState` addition from earlier work (search for `IPC_CHANNELS.GET_CONNECTION_STATE`) and add the following block directly after it:

```typescript
  // Fleet management
  fleetGetRoster: (): Promise<FleetVehicleEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.FLEET_GET_ROSTER),

  fleetAddVehicle: (candidate: Omit<FleetVehicleEntry, 'id'>): Promise<{ success: boolean; error?: string; entry?: FleetVehicleEntry }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FLEET_ADD_VEHICLE, candidate),

  fleetUpdateVehicle: (id: string, patch: Partial<Omit<FleetVehicleEntry, 'id'>>): Promise<FleetVehicleEntry | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.FLEET_UPDATE_VEHICLE, id, patch),

  fleetRemoveVehicle: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.FLEET_REMOVE_VEHICLE, id),

  fleetSetFocused: (vehicleId: string | null): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.FLEET_SET_FOCUSED, vehicleId),

  onFleetVehicleStatus: (callback: (status: FleetVehicleStatus) => void) => {
    const handler = (_: unknown, status: FleetVehicleStatus) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.FLEET_VEHICLE_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FLEET_VEHICLE_STATUS, handler);
  },
```

- [ ] **Step 2: Add the type import**

At the top of `preload.ts`, find the existing import of `ConnectionState` from `../shared/ipc-channels.js` and add `FleetVehicleEntry, FleetVehicleStatus` to that same import list.

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes. `ElectronAPI` (defined as `export type ElectronAPI = typeof api;` at the bottom of `preload.ts`) now includes these methods automatically.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/preload.ts
git commit -m "Expose fleet management API to renderer via preload"
```

---

### Task 6: Renderer fleet store

**Files:**
- Create: `apps/desktop/src/renderer/stores/fleet-store.ts`
- Test: `apps/desktop/src/renderer/stores/fleet-store.test.ts`

**Interfaces:**
- Consumes: `window.electronAPI.fleetGetRoster/.fleetAddVehicle/.fleetUpdateVehicle/.fleetRemoveVehicle/.fleetSetFocused/.onFleetVehicleStatus`; `window.electronAPI.connect/.disconnect` (existing); `useConnectionStore` (existing, for reading current connection state during focus).
- Produces: `useFleetStore` with state `{ roster: FleetVehicleEntry[]; statusByVehicleId: Record<string, FleetVehicleStatus>; focusedVehicleId: string | null }` and actions `loadRoster()`, `addVehicle(candidate)`, `updateVehicle(id, patch)`, `removeVehicle(id)`, `focusVehicle(entry: FleetVehicleEntry, connectOptions: ConnectOptions)`, `subscribeToStatus()` (returns an unsubscribe function) — consumed by Task 9 (`FleetView.tsx`).

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/renderer/stores/fleet-store.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useFleetStore } from './fleet-store';

describe('fleet-store', () => {
  beforeEach(() => {
    useFleetStore.setState({ roster: [], statusByVehicleId: {}, focusedVehicleId: null });
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      fleetGetRoster: vi.fn().mockResolvedValue([{ id: 'v1', name: 'Drone 1', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 }]),
      fleetAddVehicle: vi.fn().mockResolvedValue({ success: true, entry: { id: 'v2', name: 'Drone 2', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14551 } }),
      fleetSetFocused: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(true),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('loads the roster from the main process', async () => {
    await useFleetStore.getState().loadRoster();
    expect(useFleetStore.getState().roster).toHaveLength(1);
    expect(useFleetStore.getState().roster[0]?.name).toBe('Drone 1');
  });

  it('adds a vehicle and appends it to the roster on success', async () => {
    const result = await useFleetStore.getState().addVehicle({ name: 'Drone 2', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14551 });
    expect(result.success).toBe(true);
    expect(useFleetStore.getState().roster.map((v) => v.id)).toContain('v2');
  });

  it('merges incoming status updates keyed by vehicleId', () => {
    useFleetStore.getState().applyStatus({ vehicleId: 'v1', connected: true, armed: false, modeNumber: 0, batteryPercent: 90, batteryVoltage: 12.4, lat: 1, lon: 2, lastSeenAt: Date.now(), error: null });
    expect(useFleetStore.getState().statusByVehicleId['v1']?.batteryPercent).toBe(90);
  });

  it('focusVehicle disconnects, connects to the new vehicle, and tells the main process which vehicle is focused', async () => {
    const entry = { id: 'v1', name: 'Drone 1', protocol: 'mavlink' as const, transportType: 'udp' as const, host: '127.0.0.1', port: 14550 };
    await useFleetStore.getState().focusVehicle(entry, { type: 'udp', udpMode: 'client', udpRemoteHost: '127.0.0.1', udpRemotePort: 14550 });
    const api = window.electronAPI as unknown as { disconnect: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; fleetSetFocused: ReturnType<typeof vi.fn> };
    expect(api.disconnect).toHaveBeenCalled();
    expect(api.connect).toHaveBeenCalledWith({ type: 'udp', udpMode: 'client', udpRemoteHost: '127.0.0.1', udpRemotePort: 14550 });
    expect(api.fleetSetFocused).toHaveBeenCalledWith('v1');
    expect(useFleetStore.getState().focusedVehicleId).toBe('v1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/desktop && npx vitest run src/renderer/stores/fleet-store.test.ts`
Expected: FAIL — `./fleet-store` does not exist yet.

- [ ] **Step 3: Implement `fleet-store.ts`**

Create `apps/desktop/src/renderer/stores/fleet-store.ts`:

```typescript
import { create } from 'zustand';
import type { FleetVehicleEntry, FleetVehicleStatus, ConnectOptions } from '../../shared/ipc-channels';

interface FleetStore {
  roster: FleetVehicleEntry[];
  statusByVehicleId: Record<string, FleetVehicleStatus>;
  focusedVehicleId: string | null;

  loadRoster: () => Promise<void>;
  addVehicle: (candidate: Omit<FleetVehicleEntry, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateVehicle: (id: string, patch: Partial<Omit<FleetVehicleEntry, 'id'>>) => Promise<void>;
  removeVehicle: (id: string) => Promise<void>;
  focusVehicle: (entry: FleetVehicleEntry, connectOptions: ConnectOptions) => Promise<boolean>;
  applyStatus: (status: FleetVehicleStatus) => void;
  subscribeToStatus: () => () => void;
}

export const useFleetStore = create<FleetStore>((set, get) => ({
  roster: [],
  statusByVehicleId: {},
  focusedVehicleId: null,

  loadRoster: async () => {
    const roster = await window.electronAPI.fleetGetRoster();
    set({ roster });
  },

  addVehicle: async (candidate) => {
    const result = await window.electronAPI.fleetAddVehicle(candidate);
    if (result.success && result.entry) {
      set({ roster: [...get().roster, result.entry] });
    }
    return result;
  },

  updateVehicle: async (id, patch) => {
    const updated = await window.electronAPI.fleetUpdateVehicle(id, patch);
    if (updated) {
      set({ roster: get().roster.map((v) => (v.id === id ? updated : v)) });
    }
  },

  removeVehicle: async (id) => {
    await window.electronAPI.fleetRemoveVehicle(id);
    const { [id]: _removed, ...rest } = get().statusByVehicleId;
    set({ roster: get().roster.filter((v) => v.id !== id), statusByVehicleId: rest });
  },

  focusVehicle: async (entry, connectOptions) => {
    await window.electronAPI.disconnect();
    const success = await window.electronAPI.connect(connectOptions);
    if (success) {
      await window.electronAPI.fleetSetFocused(entry.id);
      set({ focusedVehicleId: entry.id });
    }
    return success;
  },

  applyStatus: (status) => {
    set({ statusByVehicleId: { ...get().statusByVehicleId, [status.vehicleId]: status } });
  },

  subscribeToStatus: () => {
    return window.electronAPI.onFleetVehicleStatus((status) => {
      get().applyStatus(status);
    });
  },
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/desktop && npx vitest run src/renderer/stores/fleet-store.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/stores/fleet-store.ts apps/desktop/src/renderer/stores/fleet-store.test.ts
git commit -m "Add renderer fleet store with focus orchestration"
```

---

### Task 7: Fleet map panel

**Files:**
- Create: `apps/desktop/src/renderer/components/fleet/FleetMapPanel.tsx`

**Interfaces:**
- Consumes: `useFleetStore` (Task 6) for `roster` and `statusByVehicleId`.
- Produces: `FleetMapPanel` component — consumed by Task 9 (`FleetView.tsx`).

- [ ] **Step 1: Implement the component**

Create `apps/desktop/src/renderer/components/fleet/FleetMapPanel.tsx`:

```tsx
/**
 * FleetMapPanel — shows every roster vehicle with a known position as a
 * marker on a shared map. Deliberately minimal compared to MissionMapPanel:
 * no waypoints, no overlays, no drawing tools — just live vehicle positions.
 */

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useFleetStore } from '../../stores/fleet-store';

const VEHICLE_ICON = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export function FleetMapPanel() {
  const roster = useFleetStore((s) => s.roster);
  const statusByVehicleId = useFleetStore((s) => s.statusByVehicleId);

  const vehiclesWithPosition = roster
    .map((entry) => ({ entry, status: statusByVehicleId[entry.id] }))
    .filter((v) => v.status?.lat != null && v.status?.lon != null);

  const center: [number, number] = vehiclesWithPosition[0]
    ? [vehiclesWithPosition[0].status!.lat!, vehiclesWithPosition[0].status!.lon!]
    : [0, 0];

  return (
    <div className="h-full w-full">
      <MapContainer center={center} zoom={vehiclesWithPosition.length ? 15 : 2} className="h-full w-full">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        {vehiclesWithPosition.map(({ entry, status }) => (
          <Marker key={entry.id} position={[status!.lat!, status!.lon!]} icon={VEHICLE_ICON}>
            <Popup>{entry.name}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes. (No test for this step — it's a thin presentational component over already-tested store state; covered by the manual verification in Task 10.)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/fleet/FleetMapPanel.tsx
git commit -m "Add fleet map panel showing live vehicle positions"
```

---

### Task 8: Add/edit vehicle modal

**Files:**
- Create: `apps/desktop/src/renderer/components/fleet/AddVehicleModal.tsx`

**Interfaces:**
- Consumes: `useFleetStore` (Task 6) `addVehicle`/`updateVehicle`.
- Produces: `AddVehicleModal` component with props `{ editingEntry: FleetVehicleEntry | null; onClose: () => void }` — consumed by Task 9.

- [ ] **Step 1: Implement the component**

Create `apps/desktop/src/renderer/components/fleet/AddVehicleModal.tsx`:

```tsx
/**
 * AddVehicleModal — form for adding a vehicle to the fleet roster, or
 * editing an existing entry. Same connection fields as the main Connect
 * panel (protocol, transport, host/port or serial path/baud).
 */

import { useState } from 'react';
import { useFleetStore } from '../../stores/fleet-store';
import type { FleetVehicleEntry } from '../../../shared/ipc-channels';

interface AddVehicleModalProps {
  editingEntry: FleetVehicleEntry | null;
  onClose: () => void;
}

export function AddVehicleModal({ editingEntry, onClose }: AddVehicleModalProps) {
  const addVehicle = useFleetStore((s) => s.addVehicle);
  const updateVehicle = useFleetStore((s) => s.updateVehicle);

  const [name, setName] = useState(editingEntry?.name ?? '');
  const [protocol, setProtocol] = useState<'mavlink' | 'msp'>(editingEntry?.protocol ?? 'mavlink');
  const [transportType, setTransportType] = useState<'tcp' | 'udp' | 'serial'>(editingEntry?.transportType ?? 'udp');
  const [host, setHost] = useState(editingEntry?.host ?? '127.0.0.1');
  const [port, setPort] = useState(String(editingEntry?.port ?? 14550));
  const [serialPath, setSerialPath] = useState(editingEntry?.serialPath ?? '');
  const [baudRate, setBaudRate] = useState(String(editingEntry?.baudRate ?? 115200));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);

    const candidate = {
      name: name.trim() || 'Unnamed Vehicle',
      protocol,
      transportType,
      ...(transportType === 'serial'
        ? { serialPath, baudRate: Number(baudRate) }
        : { host, port: Number(port) }),
    };

    if (editingEntry) {
      await updateVehicle(editingEntry.id, candidate);
      setSaving(false);
      onClose();
      return;
    }

    const result = await addVehicle(candidate);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Failed to add vehicle');
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-surface-raised rounded-xl border border-subtle w-full max-w-md mx-4 overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-subtle">
          <h2 className="text-lg font-semibold text-content">{editingEntry ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-content-secondary">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-content-secondary">Protocol</span>
            <select value={protocol} onChange={(e) => setProtocol(e.target.value as 'mavlink' | 'msp')} className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content">
              <option value="mavlink">MAVLink (ArduPilot)</option>
              <option value="msp">MSP (Betaflight/iNav)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-content-secondary">Connection</span>
            <select value={transportType} onChange={(e) => setTransportType(e.target.value as 'tcp' | 'udp' | 'serial')} className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content">
              <option value="udp">UDP</option>
              <option value="tcp">TCP</option>
              <option value="serial">Serial</option>
            </select>
          </label>

          {transportType === 'serial' ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-content-secondary">Serial Port</span>
                <input value={serialPath} onChange={(e) => setSerialPath(e.target.value)} placeholder="COM3 or /dev/ttyUSB0" className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-content-secondary">Baud Rate</span>
                <input value={baudRate} onChange={(e) => setBaudRate(e.target.value)} className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content" />
              </label>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-content-secondary">Host</span>
                <input value={host} onChange={(e) => setHost(e.target.value)} className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-content-secondary">Port</span>
                <input value={port} onChange={(e) => setPort(e.target.value)} className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content" />
              </label>
            </>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-subtle flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-surface-raised hover:bg-surface text-content rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
            {saving ? 'Saving…' : editingEntry ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/fleet/AddVehicleModal.tsx
git commit -m "Add fleet vehicle add/edit modal"
```

---

### Task 9: Fleet view

**Files:**
- Create: `apps/desktop/src/renderer/components/fleet/FleetView.tsx`

**Interfaces:**
- Consumes: `useFleetStore` (Task 6), `FleetMapPanel` (Task 7), `AddVehicleModal` (Task 8), `useConnectionStore` (existing, to know which vehicle is currently focused/connected for the "Focused" badge and to build `ConnectOptions` when calling `focusVehicle`).
- Produces: `FleetView` component — consumed by Task 10 (`App.tsx`).

- [ ] **Step 1: Implement the component**

Create `apps/desktop/src/renderer/components/fleet/FleetView.tsx`:

```tsx
/**
 * FleetView — lightweight overview of every vehicle in the roster: status
 * tiles (armed/mode/battery/last-seen) plus a shared map. Focusing a
 * vehicle here hands it the main connection so every other view (Mission
 * Planning, Parameters, etc.) operates on it, exactly as today.
 */

import { useEffect, useState } from 'react';
import { useFleetStore } from '../../stores/fleet-store';
import { useConnectionStore } from '../../stores/connection-store';
import { FleetMapPanel } from './FleetMapPanel';
import { AddVehicleModal } from './AddVehicleModal';
import type { FleetVehicleEntry } from '../../../shared/ipc-channels';
import { Plus, Pencil, Trash2, Radio } from 'lucide-react';

function connectOptionsFor(entry: FleetVehicleEntry) {
  if (entry.transportType === 'serial') {
    return { type: 'serial' as const, port: entry.serialPath, baudRate: entry.baudRate, protocol: entry.protocol };
  }
  if (entry.transportType === 'tcp') {
    return { type: 'tcp' as const, host: entry.host, tcpPort: entry.port, protocol: entry.protocol };
  }
  return { type: 'udp' as const, udpMode: 'client' as const, udpRemoteHost: entry.host, udpRemotePort: entry.port, protocol: entry.protocol };
}

function VehicleTile({ entry, isFocused, onFocus, onEdit, onRemove }: {
  entry: FleetVehicleEntry;
  isFocused: boolean;
  onFocus: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const status = useFleetStore((s) => s.statusByVehicleId[entry.id]);
  const connected = isFocused || status?.connected;

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${isFocused ? 'border-blue-500/60 bg-blue-500/5' : 'border-subtle bg-surface'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : status?.error ? 'bg-red-400' : 'bg-content-tertiary'}`} />
          <span className="font-semibold text-content">{entry.name}</span>
          {isFocused && <span className="text-[10px] uppercase tracking-wide text-blue-400 font-bold">Focused</span>}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} title="Edit" className="p-1.5 rounded-lg text-content-tertiary hover:text-content hover:bg-surface-raised"><Pencil size={14} /></button>
          <button onClick={onRemove} title="Remove" className="p-1.5 rounded-lg text-content-tertiary hover:text-red-400 hover:bg-surface-raised"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="text-xs text-content-secondary">
        {entry.protocol.toUpperCase()} · {entry.transportType === 'serial' ? entry.serialPath : `${entry.host}:${entry.port}`}
      </div>

      {status?.error && <div className="text-xs text-red-400">{status.error}</div>}

      {!isFocused && status && (
        <div className="flex items-center gap-3 text-xs text-content-secondary">
          <span>{status.armed ? 'Armed' : 'Disarmed'}</span>
          {status.batteryVoltage != null && <span>{status.batteryVoltage.toFixed(1)}V</span>}
          {status.batteryPercent != null && <span>{status.batteryPercent}%</span>}
        </div>
      )}

      <button
        onClick={onFocus}
        disabled={isFocused}
        className="mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-40 disabled:cursor-not-allowed text-blue-300"
      >
        <Radio size={12} /> {isFocused ? 'Focused' : 'Focus'}
      </button>
    </div>
  );
}

export function FleetView() {
  const roster = useFleetStore((s) => s.roster);
  const loadRoster = useFleetStore((s) => s.loadRoster);
  const subscribeToStatus = useFleetStore((s) => s.subscribeToStatus);
  const focusVehicle = useFleetStore((s) => s.focusVehicle);
  const removeVehicle = useFleetStore((s) => s.removeVehicle);
  const focusedVehicleId = useFleetStore((s) => s.focusedVehicleId);
  const connectionState = useConnectionStore((s) => s.connectionState);

  const [modalEntry, setModalEntry] = useState<FleetVehicleEntry | null | 'new'>(null);

  useEffect(() => {
    loadRoster();
    const unsubscribe = subscribeToStatus();
    return unsubscribe;
  }, [loadRoster, subscribeToStatus]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
        <h1 className="text-lg font-semibold text-content">Fleet</h1>
        <button
          onClick={() => setModalEntry('new')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
        >
          <Plus size={14} /> Add Vehicle
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-96 overflow-y-auto p-4 flex flex-col gap-3 border-r border-subtle">
          {roster.length === 0 && (
            <p className="text-sm text-content-secondary p-4 text-center">No vehicles in the fleet yet. Add one to start monitoring it.</p>
          )}
          {roster.map((entry) => (
            <VehicleTile
              key={entry.id}
              entry={entry}
              isFocused={connectionState.isConnected && entry.id === focusedVehicleId}
              onFocus={() => focusVehicle(entry, connectOptionsFor(entry))}
              onEdit={() => setModalEntry(entry)}
              onRemove={() => removeVehicle(entry.id)}
            />
          ))}
        </div>

        <div className="flex-1">
          <FleetMapPanel />
        </div>
      </div>

      {modalEntry !== null && (
        <AddVehicleModal
          editingEntry={modalEntry === 'new' ? null : modalEntry}
          onClose={() => setModalEntry(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes. If `ConnectOptions`'s `type: 'udp'` variant doesn't accept a `protocol` field alongside `udpMode`/`udpRemoteHost`/`udpRemotePort`, check the exact `ConnectOptions` shape in `apps/desktop/src/shared/ipc-channels.ts` (quoted in Task 1) and adjust `connectOptionsFor` to match precisely — all fields used here (`type`, `host`, `tcpPort`, `port`, `baudRate`, `udpMode`, `udpRemoteHost`, `udpRemotePort`, `protocol`) already exist on that interface per Task 1's research.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/fleet/FleetView.tsx
git commit -m "Add fleet view: roster tiles, map, add/edit/remove, focus action"
```

---

### Task 10: Navigation wiring

**Files:**
- Modify: `apps/desktop/src/renderer/stores/navigation-store.ts`
- Modify: `apps/desktop/src/renderer/components/navigation/NavigationRail.tsx`
- Modify: `apps/desktop/src/renderer/App.tsx`

**Interfaces:**
- Consumes: `FleetView` from Task 9.
- Produces: nothing further consumed by later tasks — this is the final integration point.

- [ ] **Step 1: Add `'fleet'` to `VIEW_IDS`**

In `apps/desktop/src/renderer/stores/navigation-store.ts`, change:

```typescript
export const VIEW_IDS = [
  'telemetry', 'parameters', 'mission', 'library', 'settings', 'firmware', 'cli',
  'sitl', 'report', 'calibration', 'modules', 'companion',
  'logs', 'inspector',
] as const;
```

to:

```typescript
export const VIEW_IDS = [
  'telemetry', 'parameters', 'mission', 'library', 'settings', 'firmware', 'cli',
  'sitl', 'report', 'calibration', 'modules', 'companion',
  'logs', 'inspector', 'fleet',
] as const;
```

- [ ] **Step 2: Add the nav rail entry**

In `apps/desktop/src/renderer/components/navigation/NavigationRail.tsx`, add a new entry to the `primaryItems`/`NAV_ITEMS` array (place it near `'mission'`, since fleet and mission planning are both "fly" concerns):

```tsx
  {
    id: 'fleet',
    label: 'Fleet',
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-4-4" />
      </svg>
    ),
  },
```

- [ ] **Step 3: Add the render case in `App.tsx`**

In `apps/desktop/src/renderer/App.tsx`, add the import near the other view imports:

```typescript
import { FleetView } from './components/fleet/FleetView';
```

Add a case to the disconnected branch (fleet monitoring doesn't require a focused connection — you can view/manage the roster while disconnected):

```typescript
      if (currentView === 'fleet') {
        return <FleetView />;
      }
```

Add directly after the existing `if (currentView === 'inspector')` block inside `renderMainContent`'s disconnected branch, and also add a `case 'fleet': return <FleetView />;` to the connected branch's `switch (currentView)`, next to `case 'inspector':`.

- [ ] **Step 4: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes.

- [ ] **Step 5: Lint**

Run: `cd apps/desktop && npx eslint src/renderer/stores/navigation-store.ts src/renderer/components/navigation/NavigationRail.tsx src/renderer/App.tsx src/renderer/components/fleet/*.tsx src/renderer/stores/fleet-store.ts src/main/fleet/*.ts`
Expected: no new errors (pre-existing warnings elsewhere in `App.tsx` are fine, see prior sessions).

- [ ] **Step 6: Full build**

Run: `cd apps/desktop && npm run build`
Expected: succeeds.

- [ ] **Step 7: Manual verification**

1. Launch two SITL instances (or one SITL + `tools/mock-drone/mock_drone.py`) on different UDP ports (e.g. 14550 and 14560).
2. Open Jawji, navigate to the new **Fleet** nav item.
3. Add both vehicles via **Add Vehicle** (UDP, matching host/port).
4. Confirm both tiles show live armed/battery/position status without either being "focused."
5. Click **Focus** on one tile — confirm it connects (existing connect flow) and that Mission Planning / Parameters etc. now operate on it.
6. Click **Focus** on the other tile — confirm the first one disconnects from "focused" and resumes showing lightweight monitor status, and the second becomes focused.
7. Restart the app — confirm the roster persists (both vehicles still listed) but neither is auto-connected.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/renderer/stores/navigation-store.ts apps/desktop/src/renderer/components/navigation/NavigationRail.tsx apps/desktop/src/renderer/App.tsx
git commit -m "Add Fleet nav entry and view routing"
```

---

### Task 11: Docs

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: Add a CHANGELOG entry**

In `CHANGELOG.md`, under `## [Unreleased]`, add to (or create) an `### Added` section:

```markdown
- Fleet management: a new Fleet view lets you add multiple vehicles (MAVLink and MSP) to a saved roster and monitor live status (armed/mode/battery/position) for all of them at once over lightweight, read-only connections. Every other view (Mission Planning, Parameters, Calibration, Firmware Flash, CLI, etc.) continues to operate on a single "focused" vehicle exactly as before — click Focus on any fleet tile to make it the active connection.
```

- [ ] **Step 2: Add a README Features entry**

In `README.md`, add a new `### Fleet Management` subsection under `## Features` (near `### Mission Planning`):

```markdown
### Fleet Management
- **Multi-Vehicle Roster** - Add several MAVLink or MSP vehicles to a saved fleet, persisted across restarts
- **Live Status Overview** - Armed state, mode, battery, and position for every roster vehicle at once, over lightweight read-only connections
- **Shared Map** - See every fleet vehicle's live position on one map
- **Focus to Fly** - Promote any fleet vehicle to the main connection for full mission planning, parameter tuning, and control - exactly as today's single-vehicle workflow
```

- [ ] **Step 3: Update the Roadmap**

In `README.md`'s `### Completed` roadmap list, add:

```markdown
- **Fleet Management** - Multi-vehicle roster with live status monitoring and one-click focus to promote a vehicle to the main connection
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "Document fleet management in CHANGELOG and README"
```

---

## Self-Review Notes

- **Spec coverage:** every requirement from the design spec (multiple simultaneous connections, lightweight overview + focus, 2-5 vehicles/network, MAVLink+MSP, manual add + saved roster) is implemented across Tasks 1-10. Task 11 covers documentation.
- **Deliberate simplification flagged:** MAVLink mode is exposed as a raw `customMode` number, not decoded to a friendly name (that requires vehicle-type context out of scope for a lightweight overview) — called out explicitly in Task 1 and Task 3's code comments, not a silent gap.
- **Type consistency:** `FleetVehicleEntry`/`FleetVehicleStatus` (Task 1) are used identically in `fleet-roster.ts` (Task 2), `fleet-monitor.ts` (Task 3), `fleet/index.ts` (Task 4), `preload.ts` (Task 5), `fleet-store.ts` (Task 6), and both fleet components (Tasks 7-9) — `vehicleId`/`id` naming matches throughout (`FleetVehicleEntry.id` vs `FleetVehicleStatus.vehicleId`, deliberately named differently since one identifies a roster entry and the other identifies whose status a message carries).
