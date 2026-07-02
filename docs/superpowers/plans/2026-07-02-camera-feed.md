# Camera Feed (MJPEG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dockable "Camera" panel that shows the focused vehicle's MJPEG video stream, sourced from a manually-entered URL or MAVLink `VIDEO_STREAM_INFORMATION` auto-detection.

**Architecture:** A plain `<img>` tag renders the MJPEG stream — no new dependencies. MAVLink auto-detection reuses the existing message-dispatch pipeline in `ipc-handlers.ts` (the same place HEARTBEAT etc. are already handled) rather than a separate connection; the request-sending logic is extracted into its own small, testable module (`camera-feed-helpers.ts`), mirroring how `arming-helpers.ts` was extracted for the same reason. The panel joins the existing dockable-panel and detached-window systems using their established registration patterns.

**Tech Stack:** Electron main/renderer (existing), TypeScript, `@jawji/mavlink-ts` (`VIDEO_STREAM_INFORMATION_ID`, `deserializeVideoStreamInformation`, `serializeCommandLong`, `COMMAND_LONG_ID`/`COMMAND_LONG_CRC_EXTRA`), React, Vitest.

## Global Constraints

- MJPEG only this pass. RTSP is explicitly out of scope — do not add ffmpeg, hls.js, or any transcoding.
- Video shows the *focused* vehicle only. No fleet-tile thumbnails.
- The manually-entered stream URL is session-only component state — do not persist it to any store.
- MSP vehicles only get the manual-URL path (no auto-detection — MSP has no equivalent message).

---

## File Structure

**New files (main process):**
- `apps/desktop/src/main/camera-feed-helpers.ts` — pure, testable helper that builds and sends the `MAV_CMD_REQUEST_MESSAGE` request for `VIDEO_STREAM_INFORMATION`
- `apps/desktop/src/main/__tests__/camera-feed-helpers.test.ts`

**New files (renderer):**
- `apps/desktop/src/renderer/components/panels/CameraPanel.tsx`

**Modified files:**
- `apps/desktop/src/shared/ipc-channels.ts` — add `MAVLINK_REQUEST_VIDEO_STREAM_INFO`/`MAVLINK_VIDEO_STREAM_INFO` channels and a `VideoStreamInfo` type
- `apps/desktop/src/main/ipc-handlers.ts` — new `ipcMain.handle` for the request (using `camera-feed-helpers.ts`), plus one new `if (packet.msgid === VIDEO_STREAM_INFORMATION_ID)` block inside the existing `createMavlinkDataHandler` dispatch chain
- `apps/desktop/src/main/preload.ts` — expose `mavlinkRequestVideoStreamInfo` and `onVideoStreamInfo`
- `apps/desktop/src/renderer/components/panels/index.ts` — export `CameraPanel`, add `camera` to `PANEL_COMPONENTS`
- `apps/desktop/src/renderer/components/telemetry/TelemetryDashboard.tsx` — import `CameraPanel`, add to the `components` dockview registry and `PANEL_ID_TO_DETACHED`
- `apps/desktop/src/renderer/detached/component-registry.tsx` — add a `camera` entry
- `CHANGELOG.md`, `README.md`

---

### Task 1: Shared IPC channels and types

**Files:**
- Modify: `apps/desktop/src/shared/ipc-channels.ts`

**Interfaces:**
- Produces: `IPC_CHANNELS.MAVLINK_REQUEST_VIDEO_STREAM_INFO`, `IPC_CHANNELS.MAVLINK_VIDEO_STREAM_INFO`, `VideoStreamInfo` type — used by every later task.

- [ ] **Step 1: Add the channel constants**

Add next to the existing `MAVLINK_SET_MODE` constant:

```typescript
  MAVLINK_REQUEST_VIDEO_STREAM_INFO: 'mavlink:request-video-stream-info',
  MAVLINK_VIDEO_STREAM_INFO: 'mavlink:video-stream-info',
```

- [ ] **Step 2: Add the type**

Add near the `FleetVehicleStatus` interface (or any other simple exported interface):

```typescript
/** A MAVLink-advertised video stream, as reported by VIDEO_STREAM_INFORMATION. */
export interface VideoStreamInfo {
  uri: string;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes (nothing consumes these yet).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/shared/ipc-channels.ts
git commit -m "Add camera feed IPC channels and VideoStreamInfo type"
```

---

### Task 2: Extract a testable helper for requesting VIDEO_STREAM_INFORMATION

**Files:**
- Create: `apps/desktop/src/main/camera-feed-helpers.ts`
- Test: `apps/desktop/src/main/__tests__/camera-feed-helpers.test.ts`

**Interfaces:**
- Produces: `requestVideoStreamInfo(options: RequestVideoStreamInfoOptions): Promise<void>` — consumed by Task 3.

This mirrors `apps/desktop/src/main/arming-helpers.ts` exactly (same dependency-injection shape: caller passes in `sendMavlinkPacket` and `writePacket` so the packet-building logic can be unit tested without a real transport). Read that file first if unfamiliar with the pattern — it's short.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/main/__tests__/camera-feed-helpers.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { requestVideoStreamInfo } from '../camera-feed-helpers.js';

describe('requestVideoStreamInfo', () => {
  it('sends a single MAV_CMD_REQUEST_MESSAGE COMMAND_LONG for VIDEO_STREAM_INFORMATION', async () => {
    const writePacket = vi.fn().mockResolvedValue(undefined);
    const sendMavlinkPacket = vi.fn().mockResolvedValue(Buffer.from('packet'));

    await requestVideoStreamInfo({
      sendMavlinkPacket,
      writePacket,
      targetSystem: 1,
      targetComponent: 1,
    });

    expect(sendMavlinkPacket).toHaveBeenCalledTimes(1);
    expect(writePacket).toHaveBeenCalledTimes(1);
    expect(writePacket).toHaveBeenCalledWith(Buffer.from('packet'));
  });

  it('defaults targetSystem/targetComponent to 1 when omitted', async () => {
    const writePacket = vi.fn().mockResolvedValue(undefined);
    const sendMavlinkPacket = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));

    await requestVideoStreamInfo({ sendMavlinkPacket, writePacket });

    expect(sendMavlinkPacket).toHaveBeenCalledTimes(1);
    // First arg is COMMAND_LONG_ID (76); just verify it was called with 3 args (msgid, payload, crcExtra)
    expect(sendMavlinkPacket.mock.calls[0]).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && npx vitest run src/main/__tests__/camera-feed-helpers.test.ts`
Expected: FAIL — `../camera-feed-helpers.js` does not exist yet.

- [ ] **Step 3: Implement `camera-feed-helpers.ts`**

Create `apps/desktop/src/main/camera-feed-helpers.ts`:

```typescript
import {
  serializeCommandLong,
  COMMAND_LONG_ID,
  COMMAND_LONG_CRC_EXTRA,
  VIDEO_STREAM_INFORMATION_ID,
} from '@jawji/mavlink-ts';

const MAV_CMD_REQUEST_MESSAGE = 512;

interface RequestVideoStreamInfoOptions {
  sendMavlinkPacket: (id: number, payload: Uint8Array, crcExtra: number) => Promise<Uint8Array>;
  writePacket: (packet: Uint8Array) => Promise<void>;
  targetSystem?: number;
  targetComponent?: number;
}

/**
 * Sends MAV_CMD_REQUEST_MESSAGE asking the vehicle to emit VIDEO_STREAM_INFORMATION.
 * Fire-and-forget from the caller's perspective — the response (if the FC sends
 * one) arrives asynchronously through the normal MAVLink data pipeline, not as
 * a return value here.
 */
export async function requestVideoStreamInfo({
  sendMavlinkPacket,
  writePacket,
  targetSystem = 1,
  targetComponent = 1,
}: RequestVideoStreamInfoOptions): Promise<void> {
  const payload = serializeCommandLong({
    targetSystem,
    targetComponent,
    command: MAV_CMD_REQUEST_MESSAGE,
    confirmation: 0,
    param1: VIDEO_STREAM_INFORMATION_ID,
    param2: 0,
    param3: 0,
    param4: 0,
    param5: 0,
    param6: 0,
    param7: 0,
  });

  const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA);
  await writePacket(packet);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/desktop && npx vitest run src/main/__tests__/camera-feed-helpers.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes. If `serializeCommandLong`'s parameter names don't exactly match (`targetSystem`/`targetComponent`/`command`/`confirmation`/`param1`-`param7`), check the exact shape already used in `apps/desktop/src/main/ipc-handlers.ts`'s `MAVLINK_SET_MODE` handler (search for `serializeCommandLong({` — it's called with this exact same field set for `MAV_CMD_DO_SET_MODE`) and match it precisely.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/camera-feed-helpers.ts apps/desktop/src/main/__tests__/camera-feed-helpers.test.ts
git commit -m "Add testable helper for requesting VIDEO_STREAM_INFORMATION"
```

---

### Task 3: Wire the request handler and response dispatch into ipc-handlers.ts

**Files:**
- Modify: `apps/desktop/src/main/ipc-handlers.ts`

**Interfaces:**
- Consumes: `requestVideoStreamInfo` (Task 2), existing `sendMavlinkPacket`/`currentTransport`/`safeSend`/`connectionState` locals already in scope inside `setupIpcHandlers`, existing `createMavlinkDataHandler` dispatch chain.
- Produces: the `MAVLINK_REQUEST_VIDEO_STREAM_INFO` handler and `MAVLINK_VIDEO_STREAM_INFO` broadcast — consumed by Task 4 (preload) and Task 5 (renderer panel).

- [ ] **Step 1: Import the helper and the mavlink-ts symbols needed for dispatch**

Near the top of `ipc-handlers.ts`, find the existing `import { registerFleetHandlers } from './fleet/index.js';` line (added in the fleet-management work) and add directly after it:

```typescript
import { requestVideoStreamInfo } from './camera-feed-helpers.js';
```

Find the big `@jawji/mavlink-ts` import block used elsewhere in the file (search for `HEARTBEAT_ID,` — it's part of a large named-import list already covering many message IDs) and add `VIDEO_STREAM_INFORMATION_ID, deserializeVideoStreamInformation,` to that same list.

- [ ] **Step 2: Add the request handler**

Find the `IPC_CHANNELS.MAVLINK_SET_MODE` handler (search for `ipcMain.handle(IPC_CHANNELS.MAVLINK_SET_MODE`) and add a new handler directly after its closing `});`:

```typescript
  ipcMain.handle(IPC_CHANNELS.MAVLINK_REQUEST_VIDEO_STREAM_INFO, async (): Promise<boolean> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return false;
    }
    try {
      await requestVideoStreamInfo({
        sendMavlinkPacket,
        writePacket: async (packet) => { await currentTransport!.write(packet); connectionState.packetsSent++; },
        targetSystem: connectionState.systemId ?? 1,
      });
      sendLog(mainWindow, 'debug', 'Sent MAV_CMD_REQUEST_MESSAGE for VIDEO_STREAM_INFORMATION');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to request video stream info', message);
      return false;
    }
  });
```

- [ ] **Step 3: Add the response dispatch**

Inside `createMavlinkDataHandler` (search for `if (packet.msgid === 0) {` — the HEARTBEAT handling block), add a new sibling block anywhere after it in the same `for await (const packet of mavlinkParser.parse(chunk))` loop:

```typescript
            // Handle VIDEO_STREAM_INFORMATION (msgid 269) — response to our
            // MAV_CMD_REQUEST_MESSAGE request in MAVLINK_REQUEST_VIDEO_STREAM_INFO.
            if (packet.msgid === VIDEO_STREAM_INFORMATION_ID) {
              const info = deserializeVideoStreamInformation(packet.payload);
              if (info.uri) {
                safeSend(mainWindow, IPC_CHANNELS.MAVLINK_VIDEO_STREAM_INFO, { uri: info.uri });
              }
            }
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes. If `deserializeVideoStreamInformation`'s return type doesn't have a `uri` field under that exact name, check `packages/mavlink-ts/src/generated/messages/video-stream-information.ts` for the actual field name and adjust.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc-handlers.ts
git commit -m "Wire VIDEO_STREAM_INFORMATION request/response into MAVLink pipeline"
```

---

### Task 4: Preload — expose the camera feed API

**Files:**
- Modify: `apps/desktop/src/main/preload.ts`

**Interfaces:**
- Produces: `window.electronAPI.mavlinkRequestVideoStreamInfo()`, `.onVideoStreamInfo()` — consumed by Task 5.

- [ ] **Step 1: Add the type import**

In the existing large `ipc-channels.js` type import in `preload.ts`, add `type VideoStreamInfo` to the list.

- [ ] **Step 2: Add the methods**

Find the fleet `onFleetVehicleStatus` addition (search for `IPC_CHANNELS.FLEET_VEHICLE_STATUS`) and add directly after it:

```typescript
  mavlinkRequestVideoStreamInfo: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MAVLINK_REQUEST_VIDEO_STREAM_INFO),

  onVideoStreamInfo: (callback: (info: VideoStreamInfo) => void) => {
    const handler = (_: unknown, info: VideoStreamInfo) => callback(info);
    ipcRenderer.on(IPC_CHANNELS.MAVLINK_VIDEO_STREAM_INFO, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MAVLINK_VIDEO_STREAM_INFO, handler);
  },
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/preload.ts
git commit -m "Expose camera feed API to renderer via preload"
```

---

### Task 5: Camera panel component

**Files:**
- Create: `apps/desktop/src/renderer/components/panels/CameraPanel.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.mavlinkRequestVideoStreamInfo/.onVideoStreamInfo` (Task 4), `useConnectionStore` (existing, to know the focused vehicle's protocol).
- Produces: `CameraPanel` component — consumed by Task 6.

- [ ] **Step 1: Implement the component**

Create `apps/desktop/src/renderer/components/panels/CameraPanel.tsx`:

```tsx
/**
 * CameraPanel — displays the focused vehicle's MJPEG video feed. The stream
 * source is either a manually-entered URL or a MAVLink-advertised one
 * (VIDEO_STREAM_INFORMATION, requested on mount for MAVLink vehicles).
 *
 * MJPEG-only by design: an MJPEG multipart stream renders natively in a
 * plain <img> tag, frame by frame, with no decoding library needed. RTSP/
 * H.264 support would need ffmpeg transcoding and is a deliberately separate
 * future addition — see docs/superpowers/specs/2026-07-02-camera-feed-design.md.
 */

import { useEffect, useState } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { Video, RefreshCw } from 'lucide-react';

type CameraStream =
  | { type: 'mjpeg'; url: string }
  | { type: 'none' };

export function CameraPanel() {
  const connectionState = useConnectionStore((s) => s.connectionState);
  const isMavlink = connectionState?.protocol === 'mavlink';

  const [stream, setStream] = useState<CameraStream>({ type: 'none' });
  const [urlInput, setUrlInput] = useState('');
  const [detectedUri, setDetectedUri] = useState<string | null>(null);
  const [streamError, setStreamError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Request MAVLink auto-detection once per mount, for MAVLink vehicles only.
  useEffect(() => {
    if (!isMavlink || !connectionState.isConnected) return;
    window.electronAPI.mavlinkRequestVideoStreamInfo?.().catch(() => undefined);
  }, [isMavlink, connectionState.isConnected]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onVideoStreamInfo?.((info) => {
      setDetectedUri(info.uri);
    });
    return unsubscribe;
  }, []);

  const handleUseUrl = (url: string) => {
    setStreamError(false);
    setStream({ type: 'mjpeg', url });
  };

  const handleRetry = () => {
    setStreamError(false);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="h-full w-full bg-black flex flex-col relative">
      {stream.type === 'mjpeg' && !streamError && (
        <img
          key={reloadKey}
          src={stream.url}
          onError={() => setStreamError(true)}
          className="w-full h-full object-contain"
          alt="Vehicle camera feed"
        />
      )}

      {(stream.type === 'none' || streamError) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <Video className="w-10 h-10 text-content-tertiary" />

          {streamError && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-red-400">Stream unavailable</p>
              <button
                onClick={handleRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface text-content text-xs"
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}

          {detectedUri && (
            <button
              onClick={() => handleUseUrl(detectedUri)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium max-w-full truncate"
              title={detectedUri}
            >
              Detected stream: {detectedUri} — Use this
            </button>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); if (urlInput.trim()) handleUseUrl(urlInput.trim()); }}
            className="flex items-center gap-2 w-full max-w-xs"
          >
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="http://host:port/stream"
              className="flex-1 px-2 py-1.5 rounded-lg bg-surface-raised border border-subtle text-content text-xs"
            />
            <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-surface text-content text-xs">
              Go
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes. (No dedicated unit test for this component — it's a thin presentational component with an `<img>`, a text input, and a status branch; the meaningful logic it depends on, `requestVideoStreamInfo`, is already unit-tested in Task 2. This matches how `FleetMapPanel.tsx` was left without a dedicated test in the fleet-management pass.)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/panels/CameraPanel.tsx
git commit -m "Add CameraPanel: MJPEG display with manual URL and MAVLink auto-detect"
```

---

### Task 6: Register the panel (dockable + detached)

**Files:**
- Modify: `apps/desktop/src/renderer/components/panels/index.ts`
- Modify: `apps/desktop/src/renderer/components/telemetry/TelemetryDashboard.tsx`
- Modify: `apps/desktop/src/renderer/detached/component-registry.tsx`

**Interfaces:**
- Consumes: `CameraPanel` (Task 5).
- Produces: nothing further consumed by later tasks — final integration point.

- [ ] **Step 1: Export from the panels barrel and register in `PANEL_COMPONENTS`**

In `apps/desktop/src/renderer/components/panels/index.ts`, add:

```typescript
export { CameraPanel } from './CameraPanel';
```

And add to the `PANEL_COMPONENTS` object:

```typescript
  camera: { component: 'CameraPanel', title: 'Camera' },
```

- [ ] **Step 2: Register in the dockview component map and detach mapping**

In `apps/desktop/src/renderer/components/telemetry/TelemetryDashboard.tsx`:

Add `CameraPanel,` to the import list from `'../panels'`.

Add to the `components` registry:

```typescript
  CameraPanel: () => <PanelWrapper component={CameraPanel} />,
```

Add to `PANEL_ID_TO_DETACHED`:

```typescript
  camera: { componentId: 'camera', defaultBounds: { width: 640, height: 480 } },
```

- [ ] **Step 3: Register in the detached component registry**

In `apps/desktop/src/renderer/detached/component-registry.tsx`, add the import:

```typescript
import { CameraPanel } from '../components/panels/CameraPanel';
```

And add to `COMPONENT_REGISTRY`:

```typescript
  camera: { Component: CameraPanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 640, height: 480 } },
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes.

- [ ] **Step 5: Lint**

Run: `cd apps/desktop && npx eslint src/renderer/components/panels/CameraPanel.tsx src/renderer/components/panels/index.ts src/renderer/components/telemetry/TelemetryDashboard.tsx src/renderer/detached/component-registry.tsx src/main/camera-feed-helpers.ts src/main/ipc-handlers.ts src/main/preload.ts src/shared/ipc-channels.ts`
Expected: no new errors.

- [ ] **Step 6: Full test suite**

Run: `cd apps/desktop && npx vitest run`
Expected: all tests pass, including the 2 new `camera-feed-helpers.test.ts` tests, with no regressions elsewhere.

- [ ] **Step 7: Full build**

Run: `cd apps/desktop && npm run build`
Expected: succeeds.

- [ ] **Step 8: Manual verification**

1. Launch the app, connect to any vehicle (SITL or `tools/mock-drone/mock_drone.py`).
2. Open the Telemetry Dashboard, use "Add Panel" and add **Camera**.
3. Point a local MJPEG source at the panel (e.g. run `mjpg-streamer` or any `http://.../stream` MJPEG test source) via the URL field — confirm it renders.
4. Enter a bad/unreachable URL — confirm "Stream unavailable" + Retry appears, and Retry actually re-attempts.
5. Pop the panel out via the existing detach button — confirm it renders correctly in its own window.
6. If testing against a MAVLink FC/SITL that actually implements `VIDEO_STREAM_INFORMATION` — confirm the "Detected stream" prompt appears and works. (Most SITL setups won't implement this; a missing prompt with no error is the expected, correct behavior per the spec.)

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/renderer/components/panels/index.ts apps/desktop/src/renderer/components/telemetry/TelemetryDashboard.tsx apps/desktop/src/renderer/detached/component-registry.tsx
git commit -m "Register Camera panel in dockview and detached-window systems"
```

---

### Task 7: Docs

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: CHANGELOG entry**

Under `## [Unreleased]` → `### Added`:

```markdown
- Camera feed panel: a new dockable "Camera" panel displays the focused vehicle's MJPEG video stream, via a manually-entered URL or MAVLink `VIDEO_STREAM_INFORMATION` auto-detection. Poppable to its own window like every other telemetry panel. RTSP/H.264 is not yet supported.
```

- [ ] **Step 2: README Features entry**

Add under `## Features`, near `### Fleet Management`:

```markdown
### Camera Feed
- **MJPEG Video Panel** - Dockable panel showing the focused vehicle's live camera feed
- **Manual or Auto-Detected** - Paste a stream URL directly, or let Jawji request it from the flight controller via MAVLink `VIDEO_STREAM_INFORMATION`
- **Pop-Out Support** - Detach the camera feed to its own window like any other telemetry panel
```

- [ ] **Step 3: Roadmap entry**

Add to `### Completed`:

```markdown
- **Camera Feed Panel** - MJPEG video display with manual URL entry and MAVLink stream auto-detection
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "Document camera feed panel in CHANGELOG and README"
```

---

## Self-Review Notes

- **Spec coverage:** manual URL entry, MAVLink auto-detection, MJPEG-only rendering, dockable+detachable panel placement, focused-vehicle-only scope, and session-only URL persistence are all implemented across Tasks 1-6. Task 7 covers documentation.
- **Deliberate gap flagged, not hidden:** the `VIDEO_STREAM_INFORMATION` response dispatch (Task 3, Step 3) has no dedicated unit test, because it's a 5-line addition inside `ipc-handlers.ts`'s existing monolithic `createMavlinkDataHandler` closure, which has no per-branch tests anywhere else in the codebase either (HEARTBEAT, SYS_STATUS, etc. handling in that same function isn't unit-tested). The *testable* logic — building and sending the request — is extracted into `camera-feed-helpers.ts` and covered by Task 2's tests, mirroring exactly how `arming-helpers.ts` was extracted for the same reason.
- **Type consistency:** `VideoStreamInfo` (Task 1) is used identically in the preload broadcast (Task 4) and `CameraPanel.tsx`'s `onVideoStreamInfo` callback (Task 5). `requestVideoStreamInfo`'s options shape (Task 2) matches exactly how it's called in Task 3's IPC handler.
