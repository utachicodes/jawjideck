# AI Computer-Vision Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a real, working AI object-detection module (Python/YOLOv8 via the module system's PTY permission) that draws bounding boxes directly on the live Camera panel, plus the small host-API and local-install infrastructure it needs.

**Architecture:** Two small, reusable extensions to the existing module system (a `camera` namespace + `moduleDir` on `RendererHostApi`, and a "local install" path that bypasses the marketplace/license flow for locally-built modules), a shared `camera-store` that lets `CameraPanel` and any module agree on the active stream URL and detection overlay, and a renderer-only module that spawns Python via the existing PTY capability. Nothing about the core connection/telemetry/mission code paths changes.

**Tech Stack:** TypeScript/React (existing), Zustand, Electron IPC (existing patterns), Python 3 + `ultralytics` (YOLOv8) + `opencv-python` (new, external to the repo — installed by the module's own README instructions, not auto-provisioned), esbuild (existing module build tooling), Vitest.

## Global Constraints

- Inference runs as a Python process via the module's existing `pty` permission — no in-browser/WASM inference.
- Detections render as bounding boxes drawn inside `CameraPanel` itself, not the generic `floatingOverlay` mount point (which has no knowledge of panel position/size).
- This module is not published through the marketplace/license pipeline. It's installed via a new "local install" flow, which is itself small, reusable infrastructure (useful for any locally-built module in development), not a one-off hack.
- No GPU setup, no model-swapping UI, no vehicle-command integration from detections, no auto-provisioning of Python/pip dependencies. All out of scope per the design spec.

---

## File Structure

**New files (module-sdk / shared host API):**
- Modify: `packages/module-sdk/src/host-types.ts` — add `CameraDetection`, extend `RendererHostApi` with `camera` and `moduleDir`

**New files (main process):**
- Modify: `apps/desktop/src/main/modules/module-manager.ts` — add `installLocalModule(sourceDir)`
- Modify: `apps/desktop/src/main/modules/module-ipc.ts` — add `MODULE_INSTALL_LOCAL` handler
- Modify: `apps/desktop/src/shared/ipc-channels.ts` — add the channel constant
- Modify: `apps/desktop/src/main/preload.ts` — expose `moduleInstallLocal`
- Test: `apps/desktop/src/main/modules/__tests__/module-manager-local-install.test.ts`

**New files (renderer):**
- Create: `apps/desktop/src/renderer/stores/camera-store.ts`
- Test: `apps/desktop/src/renderer/stores/camera-store.test.ts`
- Create: `apps/desktop/src/renderer/components/panels/camera-overlay-math.ts` (the pure alignment function, extracted so it's testable without rendering)
- Test: `apps/desktop/src/renderer/components/panels/camera-overlay-math.test.ts`
- Modify: `apps/desktop/src/renderer/components/panels/CameraPanel.tsx` — publish `streamUrl`, render the detection overlay
- Modify: `apps/desktop/src/renderer/modules/module-host-renderer.ts` — implement `camera` namespace, accept `moduleDir`
- Modify: `apps/desktop/src/renderer/modules/ModuleRuntime.tsx` — pass `rec.installPath` through as `moduleDir`
- Modify: `apps/desktop/src/renderer/stores/module-store.ts` — add `installLocal` action
- Modify: `apps/desktop/src/renderer/components/modules/ModuleManagerView.tsx` — add "Install from folder (dev)" button

**New files (the module itself, outside `apps/desktop`):**
- Create: `modules/ai-object-detection/module.json`
- Create: `modules/ai-object-detection/package.json`
- Create: `modules/ai-object-detection/tsconfig.json`
- Create: `modules/ai-object-detection/esbuild.config.mjs`
- Create: `modules/ai-object-detection/src/renderer/index.tsx`
- Create: `modules/ai-object-detection/src/detect.py`
- Create: `modules/ai-object-detection/README.md`

**Modified files (docs):**
- `CHANGELOG.md`, `README.md`, `docs/guides/companion-hardware-setup.md` (a short cross-reference, since a robot's camera feed from that guide is exactly what this module would run against).

---

### Task 1: Extend the module SDK's host API types

**Files:**
- Modify: `packages/module-sdk/src/host-types.ts`

**Interfaces:**
- Produces: `CameraDetection` type, `RendererHostApi.camera`, `RendererHostApi.moduleDir` — consumed by every later renderer task and by the module itself.

- [ ] **Step 1: Add the type and extend the interface**

In `packages/module-sdk/src/host-types.ts`, add near the top (after the `PtyCreateOptions` interface):

```typescript
export interface CameraDetection {
  label: string;
  confidence: number;
  /** Normalized 0-1, relative to the source video frame — NOT screen pixels. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
```

Then add to `RendererHostApi` (after the `params` block, before `pty`):

```typescript
  camera: {
    getStreamUrl(): string | null;
    subscribe(listener: (url: string | null) => void): () => void;
    setDetections(detections: CameraDetection[]): void;
  };
```

And add one field near the top of `RendererHostApi`, right after `moduleSlug: string;`:

```typescript
  /** Absolute filesystem path to this module's own extracted directory — use as `cwd` for `pty.create()` when the module ships its own scripts (e.g. a Python inference script). */
  moduleDir: string;
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/module-sdk && npx tsc --noEmit`
Expected: passes (nothing consumes the new fields yet in this package).

- [ ] **Step 3: Commit**

```bash
git add packages/module-sdk/src/host-types.ts
git commit -m "Add camera namespace and moduleDir to RendererHostApi"
```

---

### Task 2: Camera store

**Files:**
- Create: `apps/desktop/src/renderer/stores/camera-store.ts`
- Test: `apps/desktop/src/renderer/stores/camera-store.test.ts`

**Interfaces:**
- Consumes: `CameraDetection` from `@jawji/module-sdk`.
- Produces: `useCameraStore` with `{ streamUrl: string | null; detections: CameraDetection[] }` and actions `setStreamUrl`, `setDetections`, `clearDetections` — consumed by Task 3 (overlay math), Task 4 (`CameraPanel`), and Task 5 (`module-host-renderer.ts`).

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/renderer/stores/camera-store.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { useCameraStore } from './camera-store';

describe('camera-store', () => {
  beforeEach(() => {
    useCameraStore.setState({ streamUrl: null, detections: [] });
  });

  it('starts with no stream and no detections', () => {
    expect(useCameraStore.getState().streamUrl).toBeNull();
    expect(useCameraStore.getState().detections).toEqual([]);
  });

  it('sets the stream URL', () => {
    useCameraStore.getState().setStreamUrl('http://192.168.1.50:8080/?action=stream');
    expect(useCameraStore.getState().streamUrl).toBe('http://192.168.1.50:8080/?action=stream');
  });

  it('sets detections', () => {
    const detections = [{ label: 'person', confidence: 0.92, x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.6 }];
    useCameraStore.getState().setDetections(detections);
    expect(useCameraStore.getState().detections).toEqual(detections);
  });

  it('clears detections without touching streamUrl', () => {
    useCameraStore.getState().setStreamUrl('http://x/stream');
    useCameraStore.getState().setDetections([{ label: 'car', confidence: 0.8, x1: 0, y1: 0, x2: 1, y2: 1 }]);
    useCameraStore.getState().clearDetections();
    expect(useCameraStore.getState().detections).toEqual([]);
    expect(useCameraStore.getState().streamUrl).toBe('http://x/stream');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && npx vitest run src/renderer/stores/camera-store.test.ts`
Expected: FAIL — `./camera-store` does not exist yet.

- [ ] **Step 3: Implement `camera-store.ts`**

Create `apps/desktop/src/renderer/stores/camera-store.ts`:

```typescript
import { create } from 'zustand';
import type { CameraDetection } from '@jawji/module-sdk';

interface CameraStore {
  streamUrl: string | null;
  detections: CameraDetection[];

  setStreamUrl: (url: string | null) => void;
  setDetections: (detections: CameraDetection[]) => void;
  clearDetections: () => void;
}

export const useCameraStore = create<CameraStore>((set) => ({
  streamUrl: null,
  detections: [],

  setStreamUrl: (url) => set({ streamUrl: url }),
  setDetections: (detections) => set({ detections }),
  clearDetections: () => set({ detections: [] }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/desktop && npx vitest run src/renderer/stores/camera-store.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/stores/camera-store.ts apps/desktop/src/renderer/stores/camera-store.test.ts
git commit -m "Add camera store for stream URL and detection overlay state"
```

---

### Task 3: Overlay alignment math (the trickiest piece — extracted and tested in isolation)

**Files:**
- Create: `apps/desktop/src/renderer/components/panels/camera-overlay-math.ts`
- Test: `apps/desktop/src/renderer/components/panels/camera-overlay-math.test.ts`

**Interfaces:**
- Consumes: `CameraDetection` from `@jawji/module-sdk`.
- Produces: `mapDetectionToOverlayRect(detection, naturalSize, elementRect): OverlayRect` where `interface OverlayRect { left: number; top: number; width: number; height: number }` (all in pixels, relative to the `<img>` element's own top-left corner) — consumed by Task 4.

The `<img>` in `CameraPanel` uses `object-contain`, so the actual rendered video content may be letterboxed (pillarboxed/letterboxed bars) within the element's box if the stream's aspect ratio doesn't match the element's. This function computes where the real video content rect sits inside the element, then maps a detection's normalized `[x1,y1,x2,y2]` (0-1, relative to the source frame) into pixel coordinates within that content rect.

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/src/renderer/components/panels/camera-overlay-math.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { mapDetectionToOverlayRect } from './camera-overlay-math';

describe('mapDetectionToOverlayRect', () => {
  it('maps a detection with no letterboxing (matching aspect ratios)', () => {
    // 16:9 frame in a 16:9 element — content fills the element exactly.
    const detection = { label: 'person', confidence: 0.9, x1: 0.25, y1: 0.25, x2: 0.75, y2: 0.75 };
    const naturalSize = { width: 1280, height: 720 };
    const elementRect = { width: 640, height: 360 };

    const result = mapDetectionToOverlayRect(detection, naturalSize, elementRect);

    expect(result.left).toBeCloseTo(160, 1); // 0.25 * 640
    expect(result.top).toBeCloseTo(90, 1);   // 0.25 * 360
    expect(result.width).toBeCloseTo(320, 1); // 0.5 * 640
    expect(result.height).toBeCloseTo(180, 1); // 0.5 * 360
  });

  it('accounts for horizontal letterboxing (tall element, wide frame)', () => {
    // 16:9 frame (1280x720) inside a taller-than-wide 400x400 element:
    // content renders at 400x225, vertically centered, with bars top/bottom.
    const detection = { label: 'car', confidence: 0.8, x1: 0, y1: 0, x2: 1, y2: 1 };
    const naturalSize = { width: 1280, height: 720 };
    const elementRect = { width: 400, height: 400 };

    const result = mapDetectionToOverlayRect(detection, naturalSize, elementRect);

    expect(result.width).toBeCloseTo(400, 1);
    expect(result.height).toBeCloseTo(225, 1);
    expect(result.left).toBeCloseTo(0, 1);
    expect(result.top).toBeCloseTo(87.5, 1); // (400 - 225) / 2
  });

  it('accounts for vertical letterboxing (wide element, tall-relative frame)', () => {
    // 4:3 frame (640x480) inside a very wide 800x300 element:
    // content renders at 400x300, horizontally centered, with bars left/right.
    const detection = { label: 'box', confidence: 0.7, x1: 0, y1: 0, x2: 1, y2: 1 };
    const naturalSize = { width: 640, height: 480 };
    const elementRect = { width: 800, height: 300 };

    const result = mapDetectionToOverlayRect(detection, naturalSize, elementRect);

    expect(result.width).toBeCloseTo(400, 1);
    expect(result.height).toBeCloseTo(300, 1);
    expect(result.left).toBeCloseTo(200, 1); // (800 - 400) / 2
    expect(result.top).toBeCloseTo(0, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/desktop && npx vitest run src/renderer/components/panels/camera-overlay-math.test.ts`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement `camera-overlay-math.ts`**

Create `apps/desktop/src/renderer/components/panels/camera-overlay-math.ts`:

```typescript
import type { CameraDetection } from '@jawji/module-sdk';

export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

/**
 * Maps a normalized detection box (0-1, relative to the source video frame)
 * into pixel coordinates relative to the top-left of an `<img>` element that
 * displays that frame with `object-contain` (which letterboxes/pillarboxes
 * when the frame's aspect ratio doesn't match the element's).
 */
export function mapDetectionToOverlayRect(
  detection: CameraDetection,
  naturalSize: Size,
  elementRect: Size,
): OverlayRect {
  const frameAspect = naturalSize.width / naturalSize.height;
  const elementAspect = elementRect.width / elementRect.height;

  let contentWidth: number;
  let contentHeight: number;

  if (frameAspect > elementAspect) {
    // Frame is relatively wider than the element -> full width, letterboxed top/bottom.
    contentWidth = elementRect.width;
    contentHeight = elementRect.width / frameAspect;
  } else {
    // Frame is relatively taller than the element -> full height, pillarboxed left/right.
    contentHeight = elementRect.height;
    contentWidth = elementRect.height * frameAspect;
  }

  const offsetX = (elementRect.width - contentWidth) / 2;
  const offsetY = (elementRect.height - contentHeight) / 2;

  return {
    left: offsetX + detection.x1 * contentWidth,
    top: offsetY + detection.y1 * contentHeight,
    width: (detection.x2 - detection.x1) * contentWidth,
    height: (detection.y2 - detection.y1) * contentHeight,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/desktop && npx vitest run src/renderer/components/panels/camera-overlay-math.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/components/panels/camera-overlay-math.ts apps/desktop/src/renderer/components/panels/camera-overlay-math.test.ts
git commit -m "Add camera overlay alignment math (handles object-contain letterboxing)"
```

---

### Task 4: Wire the overlay into CameraPanel

**Files:**
- Modify: `apps/desktop/src/renderer/components/panels/CameraPanel.tsx`

**Interfaces:**
- Consumes: `useCameraStore` (Task 2), `mapDetectionToOverlayRect` (Task 3).
- Produces: nothing new consumed elsewhere — this is where the pieces become visible.

- [ ] **Step 1: Add the store wiring and overlay rendering**

Open `apps/desktop/src/renderer/components/panels/CameraPanel.tsx`. Add the import:

```typescript
import { useCameraStore } from '../../stores/camera-store';
import { mapDetectionToOverlayRect } from './camera-overlay-math';
```

Inside the `CameraPanel` component, add:

```typescript
  const detections = useCameraStore((s) => s.detections);
  const setStoreStreamUrl = useCameraStore((s) => s.setStreamUrl);
  const clearStoreDetections = useCameraStore((s) => s.clearDetections);
  const imgRef = useRef<HTMLImageElement>(null);
  const [overlayTick, setOverlayTick] = useState(0); // forces re-measure on resize/load
```

(Add `useRef` to the existing `import { useEffect, useState } from 'react';` line — change it to `import { useEffect, useRef, useState } from 'react';`.)

Modify `handleUseUrl` to also publish to the store:

```typescript
  const handleUseUrl = (url: string) => {
    setStreamError(false);
    setStream({ type: 'mjpeg', url });
    setStoreStreamUrl(url);
  };
```

Add a cleanup effect (clears the store when this panel instance unmounts, so a stale module doesn't keep drawing boxes over nothing):

```typescript
  useEffect(() => {
    return () => {
      setStoreStreamUrl(null);
      clearStoreDetections();
    };
  }, [setStoreStreamUrl, clearStoreDetections]);
```

Add a `ResizeObserver` so the overlay re-measures when the panel is resized or popped out:

```typescript
  useEffect(() => {
    if (!imgRef.current) return;
    const observer = new ResizeObserver(() => setOverlayTick((t) => t + 1));
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [stream.type]);
```

Now update the `<img>` render to attach the ref and an `onLoad` handler (so `naturalWidth`/`naturalHeight` are available), and add the overlay `<svg>` as a sibling immediately after it:

```tsx
      {stream.type === 'mjpeg' && !streamError && (
        <div className="relative w-full h-full">
          <img
            ref={imgRef}
            key={reloadKey}
            src={stream.url}
            onError={() => setStreamError(true)}
            onLoad={() => setOverlayTick((t) => t + 1)}
            className="w-full h-full object-contain"
            alt="Vehicle camera feed"
          />
          {imgRef.current?.naturalWidth ? (
            <svg
              key={overlayTick}
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              {detections.map((d, i) => {
                const rect = mapDetectionToOverlayRect(
                  d,
                  { width: imgRef.current!.naturalWidth, height: imgRef.current!.naturalHeight },
                  { width: imgRef.current!.clientWidth, height: imgRef.current!.clientHeight },
                );
                return (
                  <g key={i}>
                    <rect
                      x={rect.left} y={rect.top} width={rect.width} height={rect.height}
                      fill="none" stroke="#22d3ee" strokeWidth={2}
                    />
                    <text
                      x={rect.left} y={Math.max(12, rect.top - 4)}
                      fill="#22d3ee" fontSize={12} fontFamily="monospace"
                    >
                      {d.label} {(d.confidence * 100).toFixed(0)}%
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : null}
        </div>
      )}
```

This replaces the existing bare `<img>` element in the `stream.type === 'mjpeg' && !streamError` branch — keep everything else in the file (the "stream unavailable"/URL-entry branch below it) unchanged.

- [ ] **Step 2: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/panels/CameraPanel.tsx
git commit -m "Render detection overlay on the Camera panel's video feed"
```

---

### Task 5: Implement `camera` and `moduleDir` in the renderer host API

**Files:**
- Modify: `apps/desktop/src/renderer/modules/module-host-renderer.ts`
- Modify: `apps/desktop/src/renderer/modules/ModuleRuntime.tsx`

**Interfaces:**
- Consumes: `useCameraStore` (Task 2), `RendererHostApi.camera`/`.moduleDir` (Task 1).
- Produces: a fully working `host.camera` and `host.moduleDir` for any module — consumed by Task 9 (the actual AI module).

- [ ] **Step 1: Extend `createRendererHostApi`**

In `apps/desktop/src/renderer/modules/module-host-renderer.ts`, add the import:

```typescript
import { useCameraStore } from '../stores/camera-store';
```

Change the function signature to accept `moduleDir`:

```typescript
export function createRendererHostApi(
  slug: string,
  register: RegisterFn,
  moduleDir: string,
): RendererHostApi {
  return {
    moduleSlug: slug,
    moduleDir,
```

Add the `camera` block (after `params`, before `pty`, matching where it was added to the type in Task 1):

```typescript
    camera: {
      getStreamUrl: () => useCameraStore.getState().streamUrl,
      subscribe: (listener) =>
        useCameraStore.subscribe((s) => listener(s.streamUrl)),
      setDetections: (detections) => useCameraStore.getState().setDetections(detections),
    },
```

- [ ] **Step 2: Pass `installPath` through from `ModuleRuntime.tsx`**

In `apps/desktop/src/renderer/modules/ModuleRuntime.tsx`, find:

```typescript
            const host = createRendererHostApi(rec.slug, register);
```

Change to:

```typescript
            const host = createRendererHostApi(rec.slug, register, rec.installPath);
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/modules/module-host-renderer.ts apps/desktop/src/renderer/modules/ModuleRuntime.tsx
git commit -m "Implement host.camera and host.moduleDir for modules"
```

---

### Task 6: Local module install (main process)

**Files:**
- Modify: `apps/desktop/src/main/modules/module-manager.ts`
- Test: `apps/desktop/src/main/modules/__tests__/module-manager-local-install.test.ts`

**Interfaces:**
- Produces: `installLocalModule(sourceDir: string): Promise<InstalledModule>` — consumed by Task 7.

This mirrors the existing `activateLicense` bundle-extraction path exactly (read `module.json`, place files at `<userData>/modules/<slug>/extracted/`, add an `InstalledModule` record to the store) but copies from a local directory instead of downloading/unzipping a marketplace bundle, and skips license verification entirely.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/main/modules/__tests__/module-manager-local-install.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const userDataDir = await mkdtemp(join(tmpdir(), 'jawji-test-userdata-'));

vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'userData' ? userDataDir : tmpdir()) },
}));

// module-manager.ts constructs an electron-store Store at module load time,
// which requires a live Electron app context outside of one — same issue and
// same fix as fleet-roster.test.ts (see apps/desktop/src/main/fleet/__tests__/fleet-roster.test.ts).
vi.mock('electron-store', () => {
  class FakeStore<T extends Record<string, unknown>> {
    private data: Partial<T>;
    constructor(options: { defaults?: T }) {
      this.data = (options.defaults ?? {}) as Partial<T>;
    }
    get<K extends keyof T>(key: K, fallback?: T[K]): T[K] {
      return (this.data[key] ?? fallback) as T[K];
    }
    set<K extends keyof T>(key: K, value: T[K]): void {
      this.data[key] = value;
    }
  }
  return { default: FakeStore };
});

const { installLocalModule } = await import('../module-manager.js');

describe('installLocalModule', () => {
  let sourceDir: string;

  beforeEach(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), 'jawji-test-module-src-'));
    await writeFile(
      join(sourceDir, 'module.json'),
      JSON.stringify({
        manifestVersion: 1,
        slug: 'jawji.test.local-module',
        name: 'Local Test Module',
        version: '0.0.1',
        entry: { renderer: 'renderer.js' },
        mountPoints: [],
        permissions: [],
      }),
    );
    await writeFile(join(sourceDir, 'renderer.js'), 'export function activate() {}');
  });

  it('copies the source directory to <userData>/modules/<slug>/extracted and registers it', async () => {
    const record = await installLocalModule(sourceDir);

    expect(record.slug).toBe('jawji.test.local-module');
    expect(record.name).toBe('Local Test Module');
    expect(record.version).toBe('0.0.1');
    expect(record.licenseKey).toBe('local-dev');
    expect(record.activatable).toBeFalsy();
    expect(record.installPath).toBeTruthy();

    const copiedManifest = await readFile(join(record.installPath!, 'module.json'), 'utf-8');
    expect(JSON.parse(copiedManifest).slug).toBe('jawji.test.local-module');
    const copiedRenderer = await readFile(join(record.installPath!, 'renderer.js'), 'utf-8');
    expect(copiedRenderer).toContain('activate');
  });

  it('rejects a directory with no valid module.json', async () => {
    const badDir = await mkdtemp(join(tmpdir(), 'jawji-test-bad-'));
    await writeFile(join(badDir, 'module.json'), '{not valid json');
    await expect(installLocalModule(badDir)).rejects.toThrow();
    await rm(badDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && npx vitest run src/main/modules/__tests__/module-manager-local-install.test.ts`
Expected: FAIL — `installLocalModule` is not exported yet.

- [ ] **Step 3: Implement `installLocalModule`**

Open `apps/desktop/src/main/modules/module-manager.ts`. Add to the imports at the top:

```typescript
import { cp } from 'node:fs/promises';
```

(alongside the existing `import { readFile, rm } from 'node:fs/promises';` — combine into one import statement: `import { readFile, rm, cp } from 'node:fs/promises';`)

Add the function anywhere after `activateLicense` (e.g. right after its closing brace, before `removeLicense`):

```typescript
/**
 * Install a module directly from a local directory (its built `dist/`
 * output), bypassing the marketplace/license flow entirely. For locally
 * developed modules — not part of the marketplace pipeline.
 */
export async function installLocalModule(sourceDir: string): Promise<InstalledModule> {
  const manifestRaw = await readFile(join(sourceDir, 'module.json'), 'utf-8');
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestRaw);
  } catch {
    throw new Error(`${sourceDir}/module.json is not valid JSON`);
  }
  const parsed = parseModuleManifest(manifestJson);
  if (!parsed.ok) {
    throw new Error(`Invalid manifest in ${sourceDir}: ${parsed.error}`);
  }
  const manifest = parsed.manifest;

  const installPath = join(app.getPath('userData'), 'modules', manifest.slug, 'extracted');
  await rm(installPath, { recursive: true, force: true });
  await cp(sourceDir, installPath, { recursive: true });

  const record: InstalledModule = {
    slug: manifest.slug,
    name: manifest.name,
    version: manifest.version,
    installedAt: new Date().toISOString(),
    licenseKey: 'local-dev',
    licenseType: 'perpetual',
    bundleName: null,
    installPath,
    manifestVersion: manifest.manifestVersion,
  };

  const currentModules = store.get('modules');
  store.set('modules', [...currentModules.filter((m) => m.slug !== manifest.slug), record]);

  return record;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/desktop && npx vitest run src/main/modules/__tests__/module-manager-local-install.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/modules/module-manager.ts apps/desktop/src/main/modules/__tests__/module-manager-local-install.test.ts
git commit -m "Add installLocalModule for sideloading locally-built modules"
```

---

### Task 7: Wire local install through IPC and preload

**Files:**
- Modify: `apps/desktop/src/shared/ipc-channels.ts`
- Modify: `apps/desktop/src/main/modules/module-ipc.ts`
- Modify: `apps/desktop/src/main/preload.ts`

**Interfaces:**
- Consumes: `installLocalModule` (Task 6).
- Produces: `window.electronAPI.moduleInstallLocal()` — consumed by Task 8.

- [ ] **Step 1: Add the IPC channel**

In `apps/desktop/src/shared/ipc-channels.ts`, find `MODULE_ACTIVATE: 'module:activate',` and add directly after it:

```typescript
  MODULE_INSTALL_LOCAL: 'module:install-local',
```

- [ ] **Step 2: Add the main-process handler**

In `apps/desktop/src/main/modules/module-ipc.ts`, add to the imports:

```typescript
import { dialog } from 'electron';
```

(combine with the existing `import { ipcMain, BrowserWindow } from 'electron';` line: `import { ipcMain, BrowserWindow, dialog } from 'electron';`)

```typescript
import {
  activateLicense,
  getInstalledModules,
  removeLicense,
  checkForUpdates,
  heartbeatAll,
  installLocalModule,
} from './module-manager.js';
```

Add the handler after the `MODULE_ACTIVATE` handler:

```typescript
  // Sideload a locally-built module (dev workflow, not the marketplace path).
  ipcMain.handle(IPC_CHANNELS.MODULE_INSTALL_LOCAL, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Module Build Folder (containing module.json)',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Cancelled' };
    }
    try {
      const module = await installLocalModule(result.filePaths[0]!);
      return { success: true, module };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
```

- [ ] **Step 3: Expose it via preload**

In `apps/desktop/src/main/preload.ts`, find `moduleActivate: (key: string): Promise<{ success: boolean; error?: string }> =>` and add directly after its closing line:

```typescript
  moduleInstallLocal: (): Promise<{ success: boolean; error?: string; module?: InstalledModule }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MODULE_INSTALL_LOCAL),
```

Check the top of `preload.ts` for the existing `InstalledModule` type import (it must already be imported for `moduleList`'s return type) — if it isn't in the shared type-import line, add `type InstalledModule` to it.

- [ ] **Step 4: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/ipc-channels.ts apps/desktop/src/main/modules/module-ipc.ts apps/desktop/src/main/preload.ts
git commit -m "Wire local module install through IPC and preload"
```

---

### Task 8: "Install from folder" UI in Module Manager

**Files:**
- Modify: `apps/desktop/src/renderer/stores/module-store.ts`
- Modify: `apps/desktop/src/renderer/components/modules/ModuleManagerView.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.moduleInstallLocal` (Task 7).
- Produces: nothing further consumed by later tasks — this is the last piece needed to actually get the AI module (Task 9) loaded and running.

- [ ] **Step 1: Add the store action**

In `apps/desktop/src/renderer/stores/module-store.ts`, add to the `ModuleState` interface (after `activateLicense`):

```typescript
  installLocal: () => Promise<{ success: boolean; error?: string }>;
```

Add the implementation (after the `activateLicense` action, mirroring its shape):

```typescript
  installLocal: async () => {
    set({ activating: true, error: null });
    try {
      const result = await window.electronAPI.moduleInstallLocal();
      if (!result.success) {
        set({ activating: false, error: result.error || 'Install failed' });
        return result;
      }
      await get().loadModules();
      set({ activating: false });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ activating: false, error: message });
      return { success: false, error: message };
    }
  },
```

- [ ] **Step 2: Add the button**

In `apps/desktop/src/renderer/components/modules/ModuleManagerView.tsx`, destructure the new action from the store (add `installLocal,` to the existing `useModuleStore()` destructure list alongside `activateLicense`).

Add a handler near `handleActivate`:

```typescript
  const handleInstallLocal = async () => {
    clearError();
    const result = await installLocal();
    if (result.success) {
      setRestartRequired(true);
      checkUpdates();
    }
  };
```

Add a button right after the closing `</div>` of the key-input row (after the `{activating ? 'Adding…' : 'Add'}` button's containing `<div className="flex gap-2">...</div>`, before the error-message block):

```tsx
          <button
            onClick={handleInstallLocal}
            disabled={activating}
            className="mt-3 text-xs text-content-secondary hover:text-content transition-colors disabled:opacity-50"
          >
            Install from folder (dev)…
          </button>
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && npm run typecheck`
Expected: passes.

- [ ] **Step 4: Lint**

Run: `cd apps/desktop && npx eslint src/renderer/stores/module-store.ts src/renderer/components/modules/ModuleManagerView.tsx src/renderer/stores/camera-store.ts src/renderer/components/panels/CameraPanel.tsx src/renderer/components/panels/camera-overlay-math.ts src/renderer/modules/module-host-renderer.ts src/renderer/modules/ModuleRuntime.tsx src/main/modules/module-manager.ts src/main/modules/module-ipc.ts src/main/preload.ts src/shared/ipc-channels.ts`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/stores/module-store.ts apps/desktop/src/renderer/components/modules/ModuleManagerView.tsx
git commit -m "Add Install from folder (dev) button to Module Manager"
```

---

### Task 9: The AI Object Detection module

**Files:**
- Create: `modules/ai-object-detection/module.json`
- Create: `modules/ai-object-detection/package.json`
- Create: `modules/ai-object-detection/tsconfig.json`
- Create: `modules/ai-object-detection/esbuild.config.mjs`
- Create: `modules/ai-object-detection/src/renderer/index.tsx`
- Create: `modules/ai-object-detection/src/detect.py`
- Create: `modules/ai-object-detection/README.md`

**Interfaces:**
- Consumes: `RendererHostApi` (`camera`, `pty`, `moduleDir`) from `@jawji/module-sdk` (Task 1, 5).

This follows the exact layout of `packages/create-jawji-module/template/`, trimmed to renderer-only (no `main.js` — PTY spawning is available directly from `RendererHostApi.pty`).

- [ ] **Step 1: `module.json`**

```json
{
  "manifestVersion": 1,
  "slug": "jawji.builtin.ai-object-detection",
  "name": "AI Object Detection",
  "version": "0.1.0",
  "entry": { "renderer": "renderer.js" },
  "mountPoints": [],
  "permissions": ["pty"],
  "minJawjiVersion": "0.0.37"
}
```

- [ ] **Step 2: `package.json`**

```json
{
  "name": "jawji.builtin.ai-object-detection",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node esbuild.config.mjs",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@jawji/module-sdk": "workspace:*",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "esbuild": "^0.20.0",
    "typescript": "^5.4.0"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

- [ ] **Step 3: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: `esbuild.config.mjs`**

```javascript
import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { JawjiModulePlugin } from '@jawji/module-sdk/esbuild';

await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/renderer/index.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  plugins: [JawjiModulePlugin()],
  outfile: 'dist/renderer.js',
});

await copyFile('module.json', 'dist/module.json');
await copyFile('src/detect.py', 'dist/detect.py');
console.log('Build complete.');
```

- [ ] **Step 5: `src/detect.py`**

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

- [ ] **Step 6: `src/renderer/index.tsx`**

```tsx
import type { RendererHostApi, CameraDetection } from '@jawji/module-sdk';

let ptySessionId: string | null = null;
let unsubscribeStream: (() => void) | null = null;
let unsubscribeData: (() => void) | null = null;
let unsubscribeExit: (() => void) | null = null;

interface RawDetection {
  label: string;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

async function startDetection(host: RendererHostApi, streamUrl: string) {
  await stopDetection(host);

  host.log('info', `Starting detection on ${streamUrl}`);
  ptySessionId = await host.pty.create({
    shell: 'python3',
    args: ['detect.py', '--stream-url', streamUrl],
    cwd: host.moduleDir,
  });

  let buffer = '';
  unsubscribeData = host.pty.onData(ptySessionId, (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const raw = JSON.parse(line) as RawDetection[];
        const detections: CameraDetection[] = raw.map((d) => ({
          label: d.label,
          confidence: d.confidence,
          x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
        }));
        host.camera.setDetections(detections);
      } catch (err) {
        host.log('warn', 'Failed to parse detection line', line, err);
      }
    }
  });

  unsubscribeExit = host.pty.onExit(ptySessionId, (code) => {
    host.log(code === 0 ? 'info' : 'error', `detect.py exited with code ${code}`);
    host.camera.setDetections([]);
  });
}

async function stopDetection(host: RendererHostApi) {
  unsubscribeData?.();
  unsubscribeData = null;
  unsubscribeExit?.();
  unsubscribeExit = null;
  if (ptySessionId) {
    await host.pty.kill(ptySessionId);
    ptySessionId = null;
  }
  host.camera.setDetections([]);
}

export async function activate(host: RendererHostApi) {
  host.log('info', 'AI Object Detection module activated');

  const currentUrl = host.camera.getStreamUrl();
  if (currentUrl) {
    await startDetection(host, currentUrl);
  }

  unsubscribeStream = host.camera.subscribe((url) => {
    if (url) {
      startDetection(host, url).catch((err) => host.log('error', 'Failed to start detection', err));
    } else {
      stopDetection(host).catch((err) => host.log('error', 'Failed to stop detection', err));
    }
  });
}

export function deactivate() {
  unsubscribeStream?.();
  unsubscribeStream = null;
  // Best-effort: PTY cleanup on full app shutdown is handled by the main
  // process's killAllForModule(), so an explicit host.pty.kill() here isn't
  // required, but there's no host reference available in deactivate() to
  // call it anyway (matches the existing template module's deactivate() shape).
}
```

- [ ] **Step 7: `README.md`**

```markdown
# AI Object Detection

Draws bounding boxes on Jawji's Camera panel using YOLOv8 object detection,
running as a local Python process.

## Requirements

Install on the machine running Jawji (not the drone/companion computer):

\`\`\`bash
pip install ultralytics opencv-python
\`\`\`

The first run downloads the YOLOv8n model weights (~6MB) automatically.

## Build

\`\`\`bash
npm install
npm run build
\`\`\`

## Install into Jawji

1. Jawji → Module Manager → **Install from folder (dev)…**
2. Select this module's `dist/` folder (must contain `module.json`, `renderer.js`, `detect.py`).
3. Restart Jawji.
4. Open the Camera panel and point it at a live MJPEG stream — detection starts automatically once a stream URL is set.

## Scope

- Detects the 80 COCO classes YOLOv8n ships with (person, car, dog, etc.) —
  no custom model training/swapping in this version.
- Runs on CPU by default. GPU acceleration depends on your local PyTorch/CUDA
  setup — this module doesn't configure that for you.
- No detection history, alerts, or vehicle-command integration — bounding
  boxes on the live feed only.
```

- [ ] **Step 8: Build it and confirm it produces valid output**

Run:
```bash
cd modules/ai-object-detection
npm install
npm run typecheck
npm run build
```
Expected: `dist/module.json`, `dist/renderer.js`, and `dist/detect.py` all exist.

- [ ] **Step 9: Commit**

```bash
git add modules/ai-object-detection
git commit -m "Add AI Object Detection module (YOLOv8 via Python/PTY)"
```

---

### Task 10: End-to-end verification and docs

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/guides/companion-hardware-setup.md`

- [ ] **Step 1: Full workspace verification**

Run in order from the repo root:
```bash
cd apps/desktop && npm run typecheck
cd apps/desktop && npx vitest run
cd apps/desktop && npm run build
```
Expected: all pass, full test suite green with no regressions, production build succeeds.

- [ ] **Step 2: Manual end-to-end verification**

1. Build the module per Task 9 Step 8.
2. Launch Jawji (`pnpm dev` or the packaged build).
3. Module Manager → **Install from folder (dev)…** → select `modules/ai-object-detection/dist/`.
4. Restart Jawji.
5. Open the Telemetry Dashboard, add the **Camera** panel, point it at a live MJPEG stream (the `mjpg-streamer` setup from `docs/guides/companion-hardware-setup.md` works well for this).
6. Confirm cyan bounding boxes with labels/confidence appear over detected objects (a person walking into frame is an easy test) and stay aligned when resizing the panel or popping it out to a detached window.
7. Change the Camera panel's stream URL to something else — confirm the module restarts detection against the new stream (check Jawji's debug console for the "Starting detection on ..." log line).
8. Remove the stream (clear/close the panel) — confirm boxes clear and no errors appear in the console.

- [ ] **Step 3: CHANGELOG entry**

Under `## [Unreleased]` → `### Added`:

```markdown
- AI Object Detection module: a real, working module (not a demo) that runs YOLOv8 object detection against the Camera panel's live MJPEG feed and draws bounding boxes directly on the video. Built on the existing module system's PTY permission (spawns a local Python process) — required two small, reusable additions to that system: a `camera` namespace on the module host API (so a module can read the active stream URL and push detection results) and a "local install" path in Module Manager for sideloading locally-built modules outside the marketplace/license flow. Requires `pip install ultralytics opencv-python` on the machine running Jawji; see `modules/ai-object-detection/README.md`.
```

- [ ] **Step 4: README Features entry**

Add under `## Features`, near `### Camera Feed`:

```markdown
### AI Computer Vision (Module)
- **Live Object Detection** - The AI Object Detection module runs YOLOv8 against the Camera panel's feed and draws bounding boxes directly on the video
- **Runs Locally** - Python process spawned via the module system's PTY permission, no cloud dependency
- **Extensible** - Built on general-purpose module host APIs (`camera`, `pty`, `moduleDir`) any future module can reuse for its own video-processing or Python-backed features
```

- [ ] **Step 5: Roadmap entry**

Add to `### Completed`:

```markdown
- **AI Object Detection Module** - YOLOv8-based live object detection overlaid on the Camera panel, running as a local Python process via the module system
```

- [ ] **Step 6: Cross-reference in the companion hardware guide**

In `docs/guides/companion-hardware-setup.md`, after Part 4 (Intel RealSense) and before "Putting it all together", add:

```markdown
## Part 5 — Running AI object detection on the feed

Once Part 3 or Part 4 is streaming into the Camera panel, the **AI Object Detection** module (`modules/ai-object-detection/` in this repo) can draw live bounding boxes on top of it — see that module's own README for build/install steps. It runs entirely on the machine running Jawji, not on the Pi, so no extra Pi-side setup is needed beyond having a stream already configured in the Camera panel.
```

- [ ] **Step 7: Commit**

```bash
git add CHANGELOG.md README.md docs/guides/companion-hardware-setup.md
git commit -m "Document AI Object Detection module in CHANGELOG, README, and companion guide"
```

---

## Self-Review Notes

- **Spec coverage:** Python-via-PTY inference, bounding-boxes-on-video display, and "real module following the existing template pattern" are all implemented across Tasks 1-9. Task 10 covers verification and documentation.
- **Technical risks called out explicitly, not glossed over:** the letterboxing alignment math (Task 3) is extracted into a pure, independently-tested function specifically because it's the one place a subtle bug would be easy to miss and hard to notice visually at first (boxes slightly off only becomes obvious with non-matching aspect ratios). The `moduleDir` addition (Task 1/5) was not explicitly named in the design spec but is a necessary, small, and directly-justified technical requirement discovered during planning — without it, the module has no way to locate its own bundled `detect.py` for the PTY's `cwd`.
- **Type consistency:** `CameraDetection` (Task 1, in `@jawji/module-sdk`) is used identically in `camera-store.ts` (Task 2), `camera-overlay-math.ts` (Task 3), `CameraPanel.tsx` (Task 4), `module-host-renderer.ts` (Task 5), and the AI module's `src/renderer/index.tsx` (Task 9) — defined once, imported everywhere, no duplicate/drifting shape.
- **Local-install mechanism verified against the actual constraint:** `module-protocol.ts` hardcodes `<userData>/modules/<slug>/extracted` as the only place it will serve a module's renderer bundle from — `installLocalModule` (Task 6) copies to exactly that path, not wherever the `InstalledModule.installPath` field might otherwise suggest, so the module will actually load.
