# AI Computer-Vision Module — Design Spec

**Date:** 2026-07-02
**Status:** Approved for planning
**Scope:** A real, working AI/computer-vision module (object detection) built on the existing module system, plus the small amount of new host infrastructure it needs to draw results on the live Camera panel.

## Problem

The user wants the Module Manager to support AI functionality — specifically computer vision that runs against the drone's live video feed (the MJPEG Camera panel added in v0.0.37). The existing module system (`packages/module-sdk`, `ModuleRuntime`, PTY capability) is architecturally ready for this, but has two gaps:

1. **No way for a module to know the camera stream URL.** The Camera panel's stream URL is private component state — nothing else in the app can read it.
2. **No way for a module to draw on top of the video.** The module system's only UI mount point (`floatingOverlay`) is a generic, panel-position-unaware overlay — it has no idea where the Camera panel is on screen, so pixel-aligned bounding boxes aren't possible through it.

## Requirements (from brainstorming)

1. Inference runs as a **Python process spawned via the module's existing PTY permission** — not in-browser JS/WASM. This gives access to the real Python CV ecosystem (this pass: YOLOv8 via `ultralytics`), at the cost of requiring Python + dependencies on the machine running Jawji.
2. Detection results are drawn as **bounding boxes directly on the live video**, not a separate list panel.
3. This ships as a **real, complete module** following the existing `packages/create-jawji-module` template/manifest pattern — not a special-cased built-in feature.

## Non-goals (explicitly out of scope)

- **In-browser/WASM inference** (TensorFlow.js or similar). Deliberately not built — Python via PTY was the chosen direction and gives more capability for less new infrastructure.
- **RTSP/H.264 support.** The module reads whatever URL the Camera panel is already using, which remains MJPEG-only per the existing Camera panel limitation.
- **Marketplace distribution / license-gating of this specific module.** The existing module system supports license-gated marketplace bundles, but this module ships as a working local example (installed like the existing template pattern), not published through that pipeline. Marketplace publishing is a separate, later concern if desired.
- **Gimbal control, gaze-following, or any vehicle-command integration** based on detections (e.g. "loiter on detected person"). Detection display only.
- **Multi-model / pluggable model selection UI.** One concrete model (YOLOv8n, COCO 80-class) ships as a real, useful default. A settings UI to swap models is a natural, obvious follow-up, not built now.
- **GPU acceleration setup.** The module runs whatever `ultralytics`/PyTorch backend is installed on the user's machine (CPU by default); it doesn't configure CUDA or any accelerator.

## Architecture

### New shared infrastructure (small, in the app itself — not module-specific)

1. **`apps/desktop/src/renderer/stores/camera-store.ts`** (new): a small Zustand store holding:
   - `streamUrl: string | null` — the Camera panel's currently-active MJPEG URL
   - `detections: CameraDetection[]` — normalized bounding boxes to render as overlay
   - Actions: `setStreamUrl`, `setDetections`, `clearDetections`

   ```typescript
   export interface CameraDetection {
     label: string;
     confidence: number;
     /** Normalized 0-1, relative to the source video frame, NOT screen pixels. */
     x1: number; y1: number; x2: number; y2: number;
   }
   ```

2. **`CameraPanel.tsx` modified** (the existing panel, unchanged in spirit — still just an `<img>` for the video):
   - On `handleUseUrl`, also calls `useCameraStore.getState().setStreamUrl(url)` so the store reflects whatever's actually being displayed.
   - Renders an absolutely-positioned `<svg>` overlay on top of the `<img>`, subscribed to `useCameraStore((s) => s.detections)`.
   - **Alignment math (the actual hard part):** the `<img>` uses `object-contain`, so its rendered content may be letterboxed within its element box if the stream's aspect ratio doesn't match the panel's. The overlay computes the actual rendered content rect (accounting for letterboxing) from the `<img>`'s natural dimensions (`naturalWidth`/`naturalHeight`, available once the image has loaded a frame) and its element bounding rect, then maps each detection's normalized `[x1,y1,x2,y2]` into that rect. This keeps boxes pixel-aligned with the video regardless of panel size/aspect ratio.
   - On unmount or when the stream URL changes away, clears `streamUrl` and `detections` in the store so a stale module doesn't draw boxes over the wrong feed.

3. **`RendererHostApi` extended** (in `packages/module-sdk`) with a new `camera` namespace, mirroring the existing `telemetry`/`connection` namespaces:
   ```typescript
   camera: {
     getStreamUrl(): string | null;
     subscribe(listener: (url: string | null) => void): () => void;
     setDetections(detections: CameraDetection[]): void;
   };
   ```
   Implemented in `module-host-renderer.ts` by wrapping `useCameraStore`, following the exact existing pattern used for `telemetry`/`connection`.

This is the entire piece of "new infrastructure" — everything else is a module using existing capabilities (PTY, data storage, mount points aren't even needed here since the overlay lives in `CameraPanel` itself, not `floatingOverlay`).

### The AI module itself

New module at `modules/ai-object-detection/` (following the `create-jawji-module` template layout), **renderer-only** (no `main.js` entry needed — PTY spawning is available directly from `RendererHostApi.pty`, which internally delegates to the main process via IPC; the module doesn't need its own main-process code for this feature).

`module.json`:
```json
{
  "manifestVersion": 1,
  "slug": "jawji.builtin.ai-object-detection",
  "name": "AI Object Detection",
  "version": "0.1.0",
  "entry": { "renderer": "renderer.js" },
  "mountPoints": [],
  "permissions": ["pty"]
}
```

`src/renderer/index.tsx` (`activate(host)`):
1. Read `host.camera.getStreamUrl()`; if null, subscribe and wait for one (a stream must be configured in the Camera panel before detection can start — this module doesn't configure the stream itself).
2. Once a URL is available, spawn the Python inference process: `host.pty.create({ shell: 'python3', args: ['detect.py', '--stream-url', url], cwd: <module's own directory> })`. The `detect.py` script ships inside the module bundle.
3. On `host.pty.onData(id, ...)`, parse each line of stdout as a JSON array of detections (see contract below), map to `CameraDetection[]`, call `host.camera.setDetections(...)`.
4. If the stream URL changes (via the subscription from step 1), kill the old PTY session and restart with the new URL.
5. On `deactivate()`, kill the PTY session and clear detections.

`detect.py` (ships in the module bundle):
```python
import sys
import json
import argparse
import cv2
from ultralytics import YOLO

parser = argparse.ArgumentParser()
parser.add_argument('--stream-url', required=True)
args = parser.parse_args()

model = YOLO('yolov8n.pt')  # auto-downloads on first run if not cached
cap = cv2.VideoCapture(args.stream_url)  # OpenCV reads MJPEG-over-HTTP natively

while True:
    ok, frame = cap.read()
    if not ok:
        continue
    h, w = frame.shape[:2]
    results = model(frame, verbose=False)[0]

    detections = []
    for box in results.boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        detections.append({
            'label': model.names[int(box.cls[0])],
            'confidence': float(box.conf[0]),
            'x1': x1 / w, 'y1': y1 / h, 'x2': x2 / w, 'y2': y2 / h,
        })

    print(json.dumps(detections), flush=True)
```

**Wire contract between `detect.py` and the module's renderer code:** one JSON array per stdout line, each element `{label, confidence, x1, y1, x2, y2}` with `x1..y2` normalized 0-1 relative to the frame `detect.py` itself decoded (so alignment in `CameraPanel` is always correct regardless of what resolution Python happens to be processing at).

**Model & dependencies:** the module's `README` (not auto-installed by Jawji) tells the user to `pip install ultralytics opencv-python` before use — this pass does not attempt to auto-provision Python dependencies. `ultralytics` downloads `yolov8n.pt` (~6MB) automatically on first run if not already cached locally.

## Error handling

- **No Python / missing dependencies:** `detect.py` fails to start or errors immediately; the PTY's `onExit` handler surfaces this via `host.log('error', ...)`. The module does not currently surface this to the user via UI (no toast/panel) — logged only, visible in Jawji's debug console. A user-facing error surface is a reasonable follow-up, not built now (matches the "no marketplace/settings UI" non-goal — this module is intentionally minimal).
- **Stream URL not yet configured:** the module waits (subscribed) rather than erroring — this is a normal startup state, not a failure.
- **Stream drops mid-session:** `cv2.VideoCapture.read()` returns `ok=False`; `detect.py`'s loop just retries reads rather than crashing (OpenCV will pick the stream back up if it resumes). No detections are emitted while the stream is down, so old boxes simply stop updating (they are not actively cleared — a `CameraDetection[]` staleness timeout is a reasonable future improvement, not built now).
- **`CameraPanel` unmounted while the module is still running:** the module keeps running and calling `setDetections`, but nothing renders them (no consumer). This is harmless — reopening the Camera panel picks the live detections back up from the store immediately.

## Testing

- Unit tests for the alignment math (the letterboxing/`object-contain` coordinate mapping) in `CameraPanel.tsx` — this is the one piece of genuinely trick geometry and the most likely place for an off-by-one/scaling bug. Extract it into a small pure function (e.g. `mapDetectionToOverlayRect(detection, imgNaturalSize, imgElementRect): { left, top, width, height }`) so it's testable without rendering.
- Unit tests for `camera-store.ts` (plain Zustand store — CRUD-style tests, same pattern as `fleet-store.test.ts`).
- No automated test for `detect.py` itself (it's a thin script wrapping `ultralytics`/OpenCV, both already well-tested upstream libraries) or for the PTY spawn/parse loop in the module's `activate()` (thin glue code, consistent with how `CameraPanel.tsx` itself has no dedicated test per the v0.0.37 camera-feed work).
- Manual verification: point the Camera panel at a live MJPEG stream (e.g. the `mjpg-streamer` setup from `docs/guides/companion-hardware-setup.md`) with the module active, confirm boxes appear and track detected objects (a person walking into frame is an easy real-world test), confirm boxes stay aligned when resizing the Camera panel or popping it out to a detached window.

## Open questions for the implementation plan

None outstanding — all requirements were resolved during brainstorming. The two real technical risks (letterboxing alignment math, and PTY-based Python process lifecycle management) are both called out explicitly above with a concrete approach, not left vague.
