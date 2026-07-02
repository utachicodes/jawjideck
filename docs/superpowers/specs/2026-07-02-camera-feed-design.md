# Camera Feed (MJPEG) — Design Spec

**Date:** 2026-07-02
**Status:** Approved for planning
**Scope:** Live MJPEG video display for the focused vehicle only, via manual URL entry or MAVLink auto-detection. RTSP/H.264 support is explicitly deferred (see Non-goals).

## Problem

Jawji has no way to display a drone's camera feed. The user wants to see live video from either a companion computer (Pi/Jetson/etc. already streaming video over the network) or a camera the flight controller itself advertises via MAVLink.

## Requirements (from brainstorming)

1. **Video source:** both — a manually-entered stream URL, and MAVLink auto-detection via `VIDEO_STREAM_INFORMATION`.
2. **Protocol:** MJPEG over HTTP only, this pass. The rendering layer is a plain `<img>` tag pointed at the stream URL — no ffmpeg, no transcoding, no native dependencies.
3. **Placement:** a new dockable "Camera" panel in the existing Telemetry Dashboard panel system (`components/panels/`), poppable via the existing detached-window framework, exactly like every other panel.
4. **Scope:** shows the *focused* vehicle's camera only. Fleet vehicles that aren't focused don't get video (matches the existing "focus to get the full toolset" pattern from fleet management).
5. **Persistence:** the manually-entered URL is session-only (component state), not saved to any store. This is a deliberate simplification, not an oversight — see Non-goals.

## Non-goals (explicitly out of scope)

- **RTSP/H.264 support.** Requires ffmpeg transcoding to be browser-viewable (real dependency + process management + latency trade-offs), which is a meaningfully bigger build than MJPEG. The panel's state is modeled so an `'rtsp'` stream type can be added later as a sibling case without reworking the panel (see Architecture), but no RTSP code is written in this pass.
- **Persisting the manual stream URL** per vehicle profile or across sessions. Re-entering it (or re-detecting via MAVLink) each session is an acceptable cost for this pass; persistence is a small, obvious follow-up if it turns out to matter.
- **Fleet tile thumbnails.** Video is only shown for the focused vehicle in the dedicated Camera panel. Showing a live thumbnail per fleet tile was explicitly deferred during brainstorming.
- **MSP/Betaflight camera support.** MSP has no standardized camera-stream-URI message equivalent to MAVLink's `VIDEO_STREAM_INFORMATION`; MSP vehicles only get the manual-URL path, not auto-detection.
- **Recording, snapshots, or any camera control (zoom/gimbal/trigger).** Display only.

## Architecture

### Data model

```typescript
// apps/desktop/src/renderer/components/panels/CameraPanel.tsx (component-local state, not a store)
type CameraStream =
  | { type: 'mjpeg'; url: string }
  | { type: 'none' };
```

Modeling this as a discriminated union (not a bare `url: string`) is the extension point: adding RTSP later means adding `{ type: 'rtsp'; url: string }` as a sibling and a new branch in the panel's render switch, without touching the `'mjpeg'` case or any other part of the panel.

### MAVLink auto-detection

- `apps/desktop/src/main/ipc-handlers.ts` already has one giant, central dispatch point for every incoming MAVLink message on the focused connection: a long chain of `if (packet.msgid === ...)` blocks inside `createMavlinkDataHandler` (e.g. `if (packet.msgid === 0) { /* HEARTBEAT */ ... }`). Add one more block there: `if (packet.msgid === VIDEO_STREAM_INFORMATION_ID)` (269, from `@jawji/mavlink-ts`) → deserialize with `deserializeVideoStreamInformation` (already generated, currently unused) → `safeSend(mainWindow, IPC_CHANNELS.MAVLINK_VIDEO_STREAM_INFO, { uri: info.uri })`. This is a passive listener, not a new connection or a separate parser — it rides the same pipeline every other telemetry message already goes through.
- A new `ipcMain.handle(IPC_CHANNELS.MAVLINK_REQUEST_VIDEO_STREAM_INFO, ...)` handler sends the request: build a `COMMAND_LONG` (`command: 512 /* MAV_CMD_REQUEST_MESSAGE */, param1: VIDEO_STREAM_INFORMATION_ID`) via `serializeCommandLong`, then `sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA)` + `currentTransport.write(...)` — the exact pattern already used by the existing arm/mode-change handlers in this file. `CameraPanel` calls this once on mount (MAVLink vehicles only).
- The panel shows a "Detected stream: `<uri>` — Use this" prompt alongside the manual-entry field when the broadcast arrives, rather than auto-switching, so a stale/wrong URI never silently hijacks what the user is already viewing.
- If no response arrives within a short timeout (5s) of sending the request, the panel simply falls back to manual entry with no error shown — many FCs don't send this message at all, and that's a normal, expected case, not a failure.

### Rendering

```tsx
{stream.type === 'mjpeg' && (
  <img
    src={stream.url}
    onError={() => setStreamError(true)}
    className="w-full h-full object-contain"
  />
)}
```

An `<img>` tag natively renders an MJPEG multipart stream frame-by-frame as it arrives — no library needed. `onError` fires if the connection drops or the URL is invalid/unreachable.

### Panel registration

- New file `apps/desktop/src/renderer/components/panels/CameraPanel.tsx`, registered in `apps/desktop/src/renderer/components/panels/index.ts` and the Telemetry Dashboard's dockview panel registry, following the exact same pattern as the existing attitude/battery/GPS panels.
- Registered in `apps/desktop/src/renderer/detached/component-registry.tsx` so it can be popped out to its own window, same as `flight-control`/`map`/etc. today.

## Error handling

- Invalid/unreachable manual URL: the `<img>`'s `onError` sets a "Stream unavailable" state with a **Retry** button (re-sets `src` to force a reconnect attempt) and an **Edit URL** action back to the input field. No crash, no blank silent panel.
- MAVLink auto-detect timeout: silent fallback to manual entry (see above) — this is the common case, not an error.
- Panel unmount/vehicle unfocus: the `<img>` element unmounts, which browsers handle by closing the underlying HTTP connection automatically — no explicit cleanup needed beyond React's normal unmount.

## Testing

- Unit test for the MAVLink auto-detect main-process handler: mock `sendMavlinkPacket`/transport the same way `arming-helpers.test.ts` and the fleet monitor tests do, verify it sends the correct `MAV_CMD_REQUEST_MESSAGE` payload and correctly deserializes a mocked `VIDEO_STREAM_INFORMATION` response into the broadcast payload.
- No renderer unit test for `CameraPanel` itself — it's a thin presentational component (`<img>` + a text input + a status branch) with no meaningful logic to isolate beyond what the main-process test already covers; this matches how `FleetMapPanel.tsx` was left without a dedicated test in the fleet-management pass.
- Manual verification: point the panel at a known-working public or local MJPEG test stream (e.g. a local `mjpg-streamer` instance or any `http://.../stream` MJPEG source) and confirm it renders; confirm "Stream unavailable" + Retry appears for a bad URL; confirm the panel pops out via the existing detach button.

## Open questions for the implementation plan

None outstanding — all requirements were resolved during brainstorming.
