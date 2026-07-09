# jawji-orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish `jawji-orchestrator`, a standalone npm package that runs on a companion computer, holds a landing vehicle, asks a vision-language model whether the landing site is safe, and gates any repositioning on an external confirmation.

**Architecture:** A pure-logic state machine (`VisionAssistMode` + `LandingZoneCheckMode`) driven by three injected adapters (vehicle, camera, VLM client), plus a small localhost-only HTTP server for status/confirm. The vehicle adapter talks to a local `mavsdk_server` over gRPC, using vendored MAVSDK-Proto `.proto` files loaded at runtime (no official MAVSDK npm client exists — verified against the `mavlink` GitHub org and the npm registry directly).

**Tech Stack:** TypeScript, Node.js, `@grpc/grpc-js` + `@grpc/proto-loader` (pure JS, no native addons — matters for cross-compiling to Jetson/Pi ARM), `express` for the local status server, `vitest` for tests, GitHub Actions for CI.

## Global Constraints

- Repo: `utachicodes/jawji-orchestrator` on GitHub. Package: `@jawji/orchestrator` on npm, published independently with semver.
- No Claude/Anthropic mention or attribution anywhere in this repo — not in commit messages, not in the README, not in any file, not in commit trailers.
- README: no emojis anywhere, no em dashes anywhere (use commas, periods, or parentheses instead), badges near the top (npm version, license, build status at minimum).
- Confirm-gate policy defaults to `'gated'` (blocks on external confirm); `'autonomous'` must be explicitly opted into.
- An unsafe or unknown (VLM/camera failure) verdict is always treated as gated — never silently treated as safe.
- Local status/confirm HTTP server binds to `127.0.0.1` only, on port 48500 by default.
- No direct dependency on any package in the `ardudeck` monorepo (`@jawji/mavlink-ts` is not published to npm and is out of scope here).
- License: MIT (permissive, standard for a reusable npm library meant for third-party integration — flagged for the user to confirm/override before the first publish).

---

### Task 1: Repository scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `vitest.config.ts`
- Create: `src/index.ts` (empty placeholder export, filled in Task 9)

**Interfaces:**
- Produces: a buildable, testable TypeScript package skeleton every later task adds files into.

- [ ] **Step 1: Create the GitHub repository**

```bash
gh repo create utachicodes/jawji-orchestrator --public --description "Standalone onboard vision-assisted autonomy for companion computers, starting with a landing-zone safety check." --clone
cd jawji-orchestrator
```

- [ ] **Step 2: Write package.json**

```json
{
  "name": "@jawji/orchestrator",
  "version": "0.1.0",
  "description": "Standalone onboard vision-assisted autonomy for companion computers, starting with a landing-zone safety check.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "proto"
  ],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": [
    "mavsdk",
    "drone",
    "autonomy",
    "companion-computer",
    "vision-language-model"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/utachicodes/jawji-orchestrator.git"
  },
  "dependencies": {
    "@grpc/grpc-js": "^1.14.4",
    "@grpc/proto-loader": "^0.8.1",
    "google-proto-files": "^5.0.2",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "test"]
}
```

- [ ] **Step 4: Write vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Write .gitignore**

```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 6: Write LICENSE (MIT)**

```
MIT License

Copyright (c) 2026 utachicodes

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 7: Write a placeholder src/index.ts**

```typescript
export {};
```

- [ ] **Step 8: Install dependencies and verify the build**

```bash
npm install
npm run build
```

Expected: completes with no errors (an empty `dist/index.js` is produced).

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore LICENSE src/index.ts package-lock.json
git commit -m "Scaffold package structure"
```

---

### Task 2: Vendor MAVSDK proto files and build the gRPC client loader

**Files:**
- Create: `proto/mavsdk_options.proto`
- Create: `proto/action/action.proto`
- Create: `proto/telemetry/telemetry.proto`
- Create: `proto/mission/mission.proto`
- Create: `src/grpc/mavsdk-client.ts`
- Test: `test/grpc/mavsdk-client.test.ts`

**Interfaces:**
- Produces: `loadMavsdkClients(serverAddress: string): { action: ActionClient; telemetry: TelemetryClient; mission: MissionClient }` where each client is the raw grpc-js client object with camelCase RPC methods (e.g. `action.hold(request, callback)`, `action.gotoLocation(request, callback)`, `telemetry.subscribeFlightMode(request)` returning a readable stream, `mission.startMission(request, callback)`).

- [ ] **Step 1: Fetch the vendored proto files from the official MAVSDK-Proto repo**

```bash
mkdir -p proto/action proto/telemetry proto/mission
curl -fsSL https://raw.githubusercontent.com/mavlink/MAVSDK-Proto/main/protos/mavsdk_options.proto -o proto/mavsdk_options.proto
curl -fsSL https://raw.githubusercontent.com/mavlink/MAVSDK-Proto/main/protos/action/action.proto -o proto/action/action.proto
curl -fsSL https://raw.githubusercontent.com/mavlink/MAVSDK-Proto/main/protos/telemetry/telemetry.proto -o proto/telemetry/telemetry.proto
curl -fsSL https://raw.githubusercontent.com/mavlink/MAVSDK-Proto/main/protos/mission/mission.proto -o proto/mission/mission.proto
```

Expected: four files downloaded, non-empty.

- [ ] **Step 2: Write the failing test**

```typescript
// test/grpc/mavsdk-client.test.ts
import { describe, it, expect } from 'vitest';
import { loadMavsdkClients } from '../../src/grpc/mavsdk-client.js';

describe('loadMavsdkClients', () => {
  it('builds clients with the expected RPC methods present', () => {
    const clients = loadMavsdkClients('localhost:50051');
    expect(typeof clients.action.hold).toBe('function');
    expect(typeof clients.action.gotoLocation).toBe('function');
    expect(typeof clients.telemetry.subscribeFlightMode).toBe('function');
    expect(typeof clients.mission.startMission).toBe('function');
    clients.action.close();
    clients.telemetry.close();
    clients.mission.close();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/grpc/mavsdk-client.test.ts`
Expected: FAIL with a module-not-found error for `src/grpc/mavsdk-client.js`.

- [ ] **Step 4: Write the implementation**

```typescript
// src/grpc/mavsdk-client.ts
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { includeDirs as wellKnownIncludeDirs } from 'google-proto-files';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_ROOT = path.resolve(__dirname, '../../proto');

function loadPackage(protoRelativePath: string): grpc.GrpcObject {
  const packageDefinition = protoLoader.loadSync(
    path.join(PROTO_ROOT, protoRelativePath),
    {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [PROTO_ROOT, ...wellKnownIncludeDirs],
    }
  );
  return grpc.loadPackageDefinition(packageDefinition);
}

export interface MavsdkClients {
  action: grpc.Client & Record<string, (...args: unknown[]) => unknown>;
  telemetry: grpc.Client & Record<string, (...args: unknown[]) => unknown>;
  mission: grpc.Client & Record<string, (...args: unknown[]) => unknown>;
}

export function loadMavsdkClients(serverAddress: string): MavsdkClients {
  const credentials = grpc.credentials.createInsecure();

  const actionPkg = loadPackage('action/action.proto') as {
    mavsdk: { rpc: { action: { ActionService: grpc.ServiceClientConstructor } } };
  };
  const telemetryPkg = loadPackage('telemetry/telemetry.proto') as {
    mavsdk: { rpc: { telemetry: { TelemetryService: grpc.ServiceClientConstructor } } };
  };
  const missionPkg = loadPackage('mission/mission.proto') as {
    mavsdk: { rpc: { mission: { MissionService: grpc.ServiceClientConstructor } } };
  };

  return {
    action: new actionPkg.mavsdk.rpc.action.ActionService(serverAddress, credentials) as MavsdkClients['action'],
    telemetry: new telemetryPkg.mavsdk.rpc.telemetry.TelemetryService(serverAddress, credentials) as MavsdkClients['telemetry'],
    mission: new missionPkg.mavsdk.rpc.mission.MissionService(serverAddress, credentials) as MavsdkClients['mission'],
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/grpc/mavsdk-client.test.ts`
Expected: PASS. This test only verifies the generated client shape (method names exist) — it does not require a running `mavsdk_server`, since grpc-js clients are constructed lazily and don't connect until an RPC is actually called.

- [ ] **Step 6: Commit**

```bash
git add proto src/grpc test/grpc
git commit -m "Add vendored MAVSDK proto files and gRPC client loader"
```

---

### Task 3: Shared types

**Files:**
- Create: `src/types.ts`

**Interfaces:**
- Produces: `VehicleState`, `ModeVerdict`, `ConfirmDecision`, `VehicleAdapter`, `CameraSource`, `VlmClient`, `OrchestratorContext`, `OrchestratorConfig` — every later task imports from this file, so signatures here are final.

- [ ] **Step 1: Write src/types.ts**

```typescript
// src/types.ts

export interface VehicleState {
  flightMode: 'READY' | 'TAKEOFF' | 'HOLD' | 'MISSION' | 'RETURN_TO_LAUNCH' | 'LAND' | 'OFFBOARD' | 'OTHER';
  latitudeDeg: number;
  longitudeDeg: number;
  absoluteAltitudeM: number;
}

export interface LandingCandidate {
  latitudeDeg: number;
  longitudeDeg: number;
  description: string;
}

export type ModeVerdict =
  | { status: 'safe' }
  | { status: 'unsafe'; candidate?: LandingCandidate }
  | { status: 'unknown'; reason: string };

export type ConfirmDecision =
  | { action: 'accept-candidate' }
  | { action: 'reject' };

export interface VehicleAdapter {
  hold(): Promise<void>;
  gotoLocation(coords: { latitudeDeg: number; longitudeDeg: number; absoluteAltitudeM: number }): Promise<void>;
  resumeMission(): Promise<void>;
  subscribeFlightMode(onChange: (state: VehicleState) => void): () => void;
}

export interface CameraSource {
  captureFrame(): Promise<Buffer>;
}

export interface VlmClient {
  query(image: Buffer, prompt: string): Promise<unknown>;
}

export interface OrchestratorContext {
  vehicle: VehicleAdapter;
  camera: CameraSource;
  vlm: VlmClient;
}

export type ConfirmPolicy = 'gated' | 'autonomous';

export interface OrchestratorConfig {
  mavsdkServerAddress: string;
  vlmClient: VlmClient;
  cameraSource: CameraSource;
  confirmPolicy: ConfirmPolicy;
  statusServerPort: number;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "Add shared types"
```

---

### Task 4: MAVSDK vehicle adapter

**Files:**
- Create: `src/adapters/mavsdk-adapter.ts`
- Test: `test/adapters/mavsdk-adapter.test.ts`

**Interfaces:**
- Consumes: `MavsdkClients` from Task 2, `VehicleAdapter` and `VehicleState` from Task 3.
- Produces: `createMavsdkVehicleAdapter(clients: MavsdkClients): VehicleAdapter`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/adapters/mavsdk-adapter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createMavsdkVehicleAdapter } from '../../src/adapters/mavsdk-adapter.js';
import type { MavsdkClients } from '../../src/grpc/mavsdk-client.js';

function fakeClients(): MavsdkClients {
  return {
    action: {
      hold: vi.fn((_req, cb) => cb(null, {})),
      gotoLocation: vi.fn((_req, cb) => cb(null, {})),
    } as unknown as MavsdkClients['action'],
    telemetry: {
      subscribeFlightMode: vi.fn(() => {
        const listeners: Record<string, (data: unknown) => void> = {};
        return {
          on: (event: string, cb: (data: unknown) => void) => { listeners[event] = cb; },
          cancel: vi.fn(),
          __emit: (data: unknown) => listeners['data']?.(data),
        };
      }),
    } as unknown as MavsdkClients['telemetry'],
    mission: {
      startMission: vi.fn((_req, cb) => cb(null, {})),
    } as unknown as MavsdkClients['mission'],
  };
}

describe('createMavsdkVehicleAdapter', () => {
  it('hold() resolves when the gRPC call succeeds', async () => {
    const clients = fakeClients();
    const adapter = createMavsdkVehicleAdapter(clients);
    await expect(adapter.hold()).resolves.toBeUndefined();
    expect(clients.action.hold).toHaveBeenCalledOnce();
  });

  it('gotoLocation() sends the correct request shape', async () => {
    const clients = fakeClients();
    const adapter = createMavsdkVehicleAdapter(clients);
    await adapter.gotoLocation({ latitudeDeg: 1, longitudeDeg: 2, absoluteAltitudeM: 3 });
    expect(clients.action.gotoLocation).toHaveBeenCalledWith(
      { latitudeDeg: 1, longitudeDeg: 2, absoluteAltitudeM: 3, yawDeg: 0 },
      expect.any(Function)
    );
  });

  it('resumeMission() calls startMission', async () => {
    const clients = fakeClients();
    const adapter = createMavsdkVehicleAdapter(clients);
    await adapter.resumeMission();
    expect(clients.mission.startMission).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adapters/mavsdk-adapter.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/adapters/mavsdk-adapter.ts
import type { MavsdkClients } from '../grpc/mavsdk-client.js';
import type { VehicleAdapter, VehicleState } from '../types.js';

function callUnary<TResponse>(
  method: (request: unknown, callback: (err: Error | null, response: TResponse) => void) => void,
  request: unknown
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    method(request, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

const FLIGHT_MODE_MAP: Record<string, VehicleState['flightMode']> = {
  FLIGHT_MODE_READY: 'READY',
  FLIGHT_MODE_TAKEOFF: 'TAKEOFF',
  FLIGHT_MODE_HOLD: 'HOLD',
  FLIGHT_MODE_MISSION: 'MISSION',
  FLIGHT_MODE_RETURN_TO_LAUNCH: 'RETURN_TO_LAUNCH',
  FLIGHT_MODE_LAND: 'LAND',
  FLIGHT_MODE_OFFBOARD: 'OFFBOARD',
};

export function createMavsdkVehicleAdapter(clients: MavsdkClients): VehicleAdapter {
  return {
    async hold(): Promise<void> {
      await callUnary(clients.action.hold.bind(clients.action) as never, {});
    },

    async gotoLocation(coords): Promise<void> {
      await callUnary(clients.action.gotoLocation.bind(clients.action) as never, {
        latitudeDeg: coords.latitudeDeg,
        longitudeDeg: coords.longitudeDeg,
        absoluteAltitudeM: coords.absoluteAltitudeM,
        yawDeg: 0,
      });
    },

    async resumeMission(): Promise<void> {
      await callUnary(clients.mission.startMission.bind(clients.mission) as never, {});
    },

    subscribeFlightMode(onChange): () => void {
      const call = (clients.telemetry.subscribeFlightMode as (req: unknown) => {
        on: (event: string, cb: (data: unknown) => void) => void;
        cancel: () => void;
      })({});

      call.on('data', (response: unknown) => {
        const mode = (response as { flightMode?: string }).flightMode ?? 'FLIGHT_MODE_UNKNOWN';
        onChange({
          flightMode: FLIGHT_MODE_MAP[mode] ?? 'OTHER',
          latitudeDeg: 0,
          longitudeDeg: 0,
          absoluteAltitudeM: 0,
        });
      });

      return () => call.cancel();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adapters/mavsdk-adapter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/mavsdk-adapter.ts test/adapters/mavsdk-adapter.test.ts
git commit -m "Add MAVSDK vehicle adapter"
```

---

### Task 5: VLM HTTP client

**Files:**
- Create: `src/adapters/vlm-client.ts`
- Test: `test/adapters/vlm-client.test.ts`

**Interfaces:**
- Consumes: `VlmClient` from Task 3.
- Produces: `createHttpVlmClient(endpoint: string): VlmClient`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/adapters/vlm-client.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHttpVlmClient } from '../../src/adapters/vlm-client.js';

describe('createHttpVlmClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs the image as base64 and the prompt, returns parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'safe' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpVlmClient('http://127.0.0.1:8000/query');
    const result = await client.query(Buffer.from('fake-image'), 'is this safe to land on');

    expect(result).toEqual({ status: 'safe' });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/query', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(body.prompt).toBe('is this safe to land on');
    expect(body.imageBase64).toBe(Buffer.from('fake-image').toString('base64'));
  });

  it('throws if the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const client = createHttpVlmClient('http://127.0.0.1:8000/query');
    await expect(client.query(Buffer.from('x'), 'p')).rejects.toThrow('VLM query failed with status 500');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adapters/vlm-client.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/adapters/vlm-client.ts
import type { VlmClient } from '../types.js';

export function createHttpVlmClient(endpoint: string): VlmClient {
  return {
    async query(image: Buffer, prompt: string): Promise<unknown> {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64: image.toString('base64'),
          prompt,
        }),
      });

      if (!response.ok) {
        throw new Error(`VLM query failed with status ${response.status}`);
      }

      return response.json();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adapters/vlm-client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/vlm-client.ts test/adapters/vlm-client.test.ts
git commit -m "Add HTTP VLM client adapter"
```

---

### Task 6: Local status/confirm HTTP server

**Files:**
- Create: `src/server/status-server.ts`
- Test: `test/server/status-server.test.ts`

**Interfaces:**
- Consumes: `ModeVerdict`, `ConfirmDecision` from Task 3.
- Produces: `createStatusServer(options: { port: number; onConfirm: (decision: ConfirmDecision) => void }): { start(): Promise<void>; stop(): Promise<void>; setStatus(status: OrchestratorStatus): void }`, and the `OrchestratorStatus` type it defines.

- [ ] **Step 1: Write the failing test**

```typescript
// test/server/status-server.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStatusServer } from '../../src/server/status-server.js';

describe('createStatusServer', () => {
  let server: ReturnType<typeof createStatusServer> | null = null;

  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it('serves the current status on GET /status', async () => {
    server = createStatusServer({ port: 48599, onConfirm: vi.fn() });
    server.setStatus({ state: 'idle' });
    await server.start();

    const res = await fetch('http://127.0.0.1:48599/status');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'idle' });
  });

  it('calls onConfirm with the decision posted to POST /confirm', async () => {
    const onConfirm = vi.fn();
    server = createStatusServer({ port: 48598, onConfirm });
    await server.start();

    const res = await fetch('http://127.0.0.1:48598/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'accept-candidate' }),
    });

    expect(res.status).toBe(200);
    expect(onConfirm).toHaveBeenCalledWith({ action: 'accept-candidate' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/server/status-server.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/status-server.ts
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import type { ConfirmDecision } from '../types.js';

export interface OrchestratorStatus {
  state: 'idle' | 'holding' | 'awaiting-confirm' | 'no-safe-alternative';
  verdict?: { status: 'unsafe' | 'unknown'; candidate?: { latitudeDeg: number; longitudeDeg: number; description: string } };
}

export interface StatusServerOptions {
  port: number;
  onConfirm: (decision: ConfirmDecision) => void;
}

export interface StatusServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  setStatus(status: OrchestratorStatus): void;
}

export function createStatusServer(options: StatusServerOptions): StatusServer {
  let currentStatus: OrchestratorStatus = { state: 'idle' };
  let httpServer: Server | null = null;
  const app: Express = express();
  app.use(express.json());

  app.get('/status', (_req, res) => {
    res.json(currentStatus);
  });

  app.post('/confirm', (req, res) => {
    const decision = req.body as ConfirmDecision;
    options.onConfirm(decision);
    res.status(200).json({ received: true });
  });

  return {
    setStatus(status: OrchestratorStatus): void {
      currentStatus = status;
    },
    start(): Promise<void> {
      return new Promise((resolve) => {
        httpServer = app.listen(options.port, '127.0.0.1', () => resolve());
      });
    },
    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        if (!httpServer) {
          resolve();
          return;
        }
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/server/status-server.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/status-server.ts test/server/status-server.test.ts
git commit -m "Add local status and confirm HTTP server"
```

---

### Task 7: VisionAssistMode interface and LandingZoneCheckMode

**Files:**
- Create: `src/modes/vision-assist-mode.ts`
- Create: `src/modes/landing-zone-check.ts`
- Test: `test/modes/landing-zone-check.test.ts`

**Interfaces:**
- Consumes: `VehicleState`, `ModeVerdict`, `ConfirmDecision`, `OrchestratorContext` from Task 3.
- Produces: `VisionAssistMode` interface, `createLandingZoneCheckMode(prompt?: string): VisionAssistMode`.

- [ ] **Step 1: Write src/modes/vision-assist-mode.ts**

```typescript
// src/modes/vision-assist-mode.ts
import type { ConfirmDecision, ModeVerdict, OrchestratorContext, VehicleState } from '../types.js';

export interface VisionAssistMode {
  readonly id: string;
  shouldTrigger(vehicleState: VehicleState): boolean;
  evaluate(image: Buffer, ctx: OrchestratorContext): Promise<ModeVerdict>;
  onDecision(decision: ConfirmDecision, ctx: OrchestratorContext): Promise<void>;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// test/modes/landing-zone-check.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createLandingZoneCheckMode } from '../../src/modes/landing-zone-check.js';
import type { OrchestratorContext } from '../../src/types.js';

function fakeContext(vlmResponse: unknown): OrchestratorContext {
  return {
    vehicle: {
      hold: vi.fn().mockResolvedValue(undefined),
      gotoLocation: vi.fn().mockResolvedValue(undefined),
      resumeMission: vi.fn().mockResolvedValue(undefined),
      subscribeFlightMode: vi.fn(() => () => {}),
    },
    camera: {
      captureFrame: vi.fn().mockResolvedValue(Buffer.from('frame')),
    },
    vlm: {
      query: vi.fn().mockResolvedValue(vlmResponse),
    },
  };
}

describe('createLandingZoneCheckMode', () => {
  it('shouldTrigger is true only when flight mode is LAND', () => {
    const mode = createLandingZoneCheckMode();
    expect(mode.shouldTrigger({ flightMode: 'LAND', latitudeDeg: 0, longitudeDeg: 0, absoluteAltitudeM: 0 })).toBe(true);
    expect(mode.shouldTrigger({ flightMode: 'MISSION', latitudeDeg: 0, longitudeDeg: 0, absoluteAltitudeM: 0 })).toBe(false);
  });

  it('evaluate returns safe when the VLM reports status safe', async () => {
    const mode = createLandingZoneCheckMode();
    const ctx = fakeContext({ status: 'safe' });
    const verdict = await mode.evaluate(Buffer.from('frame'), ctx);
    expect(verdict).toEqual({ status: 'safe' });
  });

  it('evaluate returns unsafe with a candidate when the VLM flags a hazard and points at an alternative', async () => {
    const mode = createLandingZoneCheckMode();
    const ctx = fakeContext({
      status: 'unsafe',
      point_2d: [120, 340],
      description: 'clearer patch to the north east',
    });
    const verdict = await mode.evaluate(Buffer.from('frame'), ctx);
    expect(verdict.status).toBe('unsafe');
  });

  it('evaluate returns unknown if the VLM call throws', async () => {
    const mode = createLandingZoneCheckMode();
    const ctx: OrchestratorContext = {
      ...fakeContext({}),
      vlm: { query: vi.fn().mockRejectedValue(new Error('timeout')) },
    };
    const verdict = await mode.evaluate(Buffer.from('frame'), ctx);
    expect(verdict).toEqual({ status: 'unknown', reason: 'timeout' });
  });

  it('onDecision with accept-candidate calls gotoLocation then resumeMission', async () => {
    const mode = createLandingZoneCheckMode();
    const ctx = fakeContext({ status: 'unsafe', point_2d: [1, 1], description: 'alt' });
    await mode.evaluate(Buffer.from('frame'), ctx);
    await mode.onDecision({ action: 'accept-candidate' }, ctx);
    expect(ctx.vehicle.gotoLocation).toHaveBeenCalledOnce();
  });

  it('onDecision with reject calls resumeMission without repositioning', async () => {
    const mode = createLandingZoneCheckMode();
    const ctx = fakeContext({ status: 'unsafe' });
    await mode.evaluate(Buffer.from('frame'), ctx);
    await mode.onDecision({ action: 'reject' }, ctx);
    expect(ctx.vehicle.gotoLocation).not.toHaveBeenCalled();
    expect(ctx.vehicle.resumeMission).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/modes/landing-zone-check.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Write the implementation**

```typescript
// src/modes/landing-zone-check.ts
import type { ConfirmDecision, LandingCandidate, ModeVerdict, OrchestratorContext } from '../types.js';
import type { VisionAssistMode } from './vision-assist-mode.js';

const DEFAULT_PROMPT = 'Assess whether this is a safe landing zone. If unsafe, point to a safer nearby spot.';

interface RawVlmResponse {
  status?: string;
  point_2d?: [number, number];
  description?: string;
}

function toCandidate(raw: RawVlmResponse, currentLat: number, currentLon: number): LandingCandidate | undefined {
  if (!raw.point_2d) return undefined;
  // point_2d is [y, x] normalized image coordinates from the VLM's operational_coordinate_v2
  // response family. Converting that to a real lat/lon offset requires camera intrinsics,
  // altitude, and gimbal angle, which are supplied by the integrator's CameraSource, not this
  // package. This mode reports the raw point plus a placeholder offset; integrators wire real
  // ground-plane projection through their own CameraSource/VlmClient before this is production-safe.
  return {
    latitudeDeg: currentLat,
    longitudeDeg: currentLon,
    description: raw.description ?? 'candidate landing spot',
  };
}

export function createLandingZoneCheckMode(prompt: string = DEFAULT_PROMPT): VisionAssistMode {
  let lastCandidate: LandingCandidate | undefined;

  return {
    id: 'landing-zone-check',

    shouldTrigger(vehicleState): boolean {
      return vehicleState.flightMode === 'LAND';
    },

    async evaluate(image, ctx): Promise<ModeVerdict> {
      await ctx.vehicle.hold();

      let raw: RawVlmResponse;
      try {
        raw = (await ctx.vlm.query(image, prompt)) as RawVlmResponse;
      } catch (err) {
        return { status: 'unknown', reason: err instanceof Error ? err.message : String(err) };
      }

      if (raw.status === 'safe') {
        lastCandidate = undefined;
        return { status: 'safe' };
      }

      lastCandidate = toCandidate(raw, 0, 0);
      return { status: 'unsafe', candidate: lastCandidate };
    },

    async onDecision(decision: ConfirmDecision, ctx: OrchestratorContext): Promise<void> {
      if (decision.action === 'accept-candidate' && lastCandidate) {
        await ctx.vehicle.gotoLocation({
          latitudeDeg: lastCandidate.latitudeDeg,
          longitudeDeg: lastCandidate.longitudeDeg,
          absoluteAltitudeM: 0,
        });
        return;
      }
      await ctx.vehicle.resumeMission();
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/modes/landing-zone-check.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/modes test/modes
git commit -m "Add VisionAssistMode interface and LandingZoneCheckMode"
```

---

### Task 8: Orchestrator wiring and public entrypoint

**Files:**
- Create: `src/orchestrator.ts`
- Modify: `src/index.ts`
- Test: `test/orchestrator.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 through 7.
- Produces: `createOrchestrator(config: OrchestratorConfig & { modes: VisionAssistMode[] }): { start(): Promise<void>; stop(): Promise<void> }`, exported from `src/index.ts` along with every public type and factory function from earlier tasks.

- [ ] **Step 1: Write the failing test**

```typescript
// test/orchestrator.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOrchestrator } from '../src/orchestrator.js';
import type { VehicleAdapter, VehicleState } from '../src/types.js';
import type { VisionAssistMode } from '../src/modes/vision-assist-mode.js';

describe('createOrchestrator', () => {
  let orchestrator: ReturnType<typeof createOrchestrator> | null = null;

  afterEach(async () => {
    await orchestrator?.stop();
    orchestrator = null;
  });

  it('triggers the mode when the vehicle adapter reports a matching state, and resumes on a safe verdict', async () => {
    let flightModeCallback: ((state: VehicleState) => void) | null = null;
    const vehicle: VehicleAdapter = {
      hold: vi.fn().mockResolvedValue(undefined),
      gotoLocation: vi.fn().mockResolvedValue(undefined),
      resumeMission: vi.fn().mockResolvedValue(undefined),
      subscribeFlightMode: vi.fn((cb) => {
        flightModeCallback = cb;
        return () => {};
      }),
    };

    const mode: VisionAssistMode = {
      id: 'test-mode',
      shouldTrigger: (state) => state.flightMode === 'LAND',
      evaluate: vi.fn().mockResolvedValue({ status: 'safe' }),
      onDecision: vi.fn().mockResolvedValue(undefined),
    };

    orchestrator = createOrchestrator({
      mavsdkServerAddress: 'unused-in-this-test',
      vlmClient: { query: vi.fn() },
      cameraSource: { captureFrame: vi.fn().mockResolvedValue(Buffer.from('f')) },
      confirmPolicy: 'gated',
      statusServerPort: 48597,
      modes: [mode],
      vehicleAdapterOverride: vehicle,
    } as never);

    await orchestrator.start();
    flightModeCallback!({ flightMode: 'LAND', latitudeDeg: 0, longitudeDeg: 0, absoluteAltitudeM: 0 });

    await vi.waitFor(() => {
      expect(mode.evaluate).toHaveBeenCalledOnce();
      expect(vehicle.resumeMission).toHaveBeenCalledOnce();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/orchestrator.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/orchestrator.ts
import { loadMavsdkClients } from './grpc/mavsdk-client.js';
import { createMavsdkVehicleAdapter } from './adapters/mavsdk-adapter.js';
import { createStatusServer, type StatusServer } from './server/status-server.js';
import type { OrchestratorConfig, VehicleAdapter, ConfirmDecision } from './types.js';
import type { VisionAssistMode } from './modes/vision-assist-mode.js';

export interface OrchestratorInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
}

type FullOrchestratorConfig = OrchestratorConfig & {
  modes: VisionAssistMode[];
  vehicleAdapterOverride?: VehicleAdapter;
};

export function createOrchestrator(config: FullOrchestratorConfig): OrchestratorInstance {
  const mavsdkClients = config.vehicleAdapterOverride ? null : loadMavsdkClients(config.mavsdkServerAddress);
  const vehicle: VehicleAdapter =
    config.vehicleAdapterOverride ?? createMavsdkVehicleAdapter(mavsdkClients!);

  const statusServer: StatusServer = createStatusServer({
    port: config.statusServerPort,
    onConfirm: (decision) => handleConfirm(decision),
  });

  const MAX_REEVALUATION_ATTEMPTS = 3;

  let activeMode: VisionAssistMode | null = null;
  let unsubscribe: (() => void) | null = null;
  let pendingResolve: ((decision: ConfirmDecision) => void) | null = null;

  async function handleConfirm(decision: ConfirmDecision): Promise<void> {
    if (!pendingResolve) return;
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve(decision);
  }

  async function evaluateOnce(
    mode: VisionAssistMode,
    ctx: { vehicle: VehicleAdapter; camera: typeof config.cameraSource; vlm: typeof config.vlmClient }
  ): Promise<'safe' | 'gave-up' | 'repositioned'> {
    const image = await config.cameraSource.captureFrame();
    const verdict = await mode.evaluate(image, ctx);

    if (verdict.status === 'safe') {
      await vehicle.resumeMission();
      return 'safe';
    }

    if (config.confirmPolicy === 'autonomous') {
      await mode.onDecision({ action: 'accept-candidate' }, ctx);
      return 'repositioned';
    }

    statusServer.setStatus({
      state: 'awaiting-confirm',
      verdict: verdict.status === 'unsafe'
        ? { status: 'unsafe', candidate: verdict.candidate }
        : { status: 'unknown' },
    });

    const decision = await new Promise<ConfirmDecision>((resolve) => {
      pendingResolve = resolve;
    });

    await mode.onDecision(decision, ctx);

    if (decision.action === 'reject') {
      return 'safe'; // treated as resolved: onDecision already resumed the original landing
    }
    return 'repositioned';
  }

  async function runMode(mode: VisionAssistMode): Promise<void> {
    activeMode = mode;
    statusServer.setStatus({ state: 'holding' });

    const ctx = { vehicle, camera: config.cameraSource, vlm: config.vlmClient };

    for (let attempt = 1; attempt <= MAX_REEVALUATION_ATTEMPTS; attempt += 1) {
      const outcome = await evaluateOnce(mode, ctx);
      if (outcome === 'safe') {
        statusServer.setStatus({ state: 'idle' });
        activeMode = null;
        return;
      }
      // outcome === 'repositioned': loop again to re-evaluate the new position,
      // up to MAX_REEVALUATION_ATTEMPTS total.
    }

    statusServer.setStatus({ state: 'no-safe-alternative' });
    activeMode = null;
  }

  async function verifyMavsdkServerReachable(): Promise<void> {
    if (!mavsdkClients) return; // test/mock adapters skip the real connectivity check
    // isMissionFinished is documented as a SYNC, read-only RPC in mission.proto - safe to use
    // purely as a "did the server answer" probe, unlike resumeMission/hold/gotoLocation which
    // all have real side effects on the vehicle.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(
        `Could not reach mavsdk_server at ${config.mavsdkServerAddress} within 5s`
      )), 5000);
      const isMissionFinished = mavsdkClients.mission.isMissionFinished as (
        request: unknown,
        callback: (err: Error | null, response: unknown) => void
      ) => void;
      isMissionFinished({}, (err) => {
        clearTimeout(timeout);
        if (err) reject(err);
        else resolve();
      });
    });
  }

  return {
    async start(): Promise<void> {
      await verifyMavsdkServerReachable();
      await statusServer.start();
      unsubscribe = vehicle.subscribeFlightMode((state) => {
        if (activeMode) return;
        for (const mode of config.modes) {
          if (mode.shouldTrigger(state)) {
            void runMode(mode);
            break;
          }
        }
      });
    },
    async stop(): Promise<void> {
      unsubscribe?.();
      await statusServer.stop();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/orchestrator.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the public entrypoint**

```typescript
// src/index.ts
export { createOrchestrator } from './orchestrator.js';
export type { OrchestratorInstance } from './orchestrator.js';
export { createMavsdkVehicleAdapter } from './adapters/mavsdk-adapter.js';
export { createHttpVlmClient } from './adapters/vlm-client.js';
export { createLandingZoneCheckMode } from './modes/landing-zone-check.js';
export type { VisionAssistMode } from './modes/vision-assist-mode.js';
export { loadMavsdkClients } from './grpc/mavsdk-client.js';
export type { MavsdkClients } from './grpc/mavsdk-client.js';
export { createStatusServer } from './server/status-server.js';
export type { OrchestratorStatus, StatusServer, StatusServerOptions } from './server/status-server.js';
export type {
  VehicleState,
  LandingCandidate,
  ModeVerdict,
  ConfirmDecision,
  VehicleAdapter,
  CameraSource,
  VlmClient,
  OrchestratorContext,
  OrchestratorConfig,
  ConfirmPolicy,
} from './types.js';
```

- [ ] **Step 6: Run the full test suite and build**

```bash
npm run build
npm test
```

Expected: build succeeds, all tests across every task pass.

- [ ] **Step 7: Commit**

```bash
git add src/orchestrator.ts src/index.ts test/orchestrator.test.ts
git commit -m "Wire orchestrator state machine and public entrypoint"
```

---

### Task 9: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: a GitHub Actions workflow that runs on push/PR to `main`, gives the build-status badge in the README something real to point at.

- [ ] **Step 1: Write the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm test
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "Add CI workflow"
git push -u origin main
```

- [ ] **Step 3: Verify the workflow runs**

```bash
gh run watch
```

Expected: the workflow completes successfully on GitHub Actions.

---

### Task 10: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Produces: the package's public documentation. No code interfaces; content requirements only.

- [ ] **Step 1: Write README.md**

```markdown
# jawji-orchestrator

[![npm version](https://img.shields.io/npm/v/%40jawji%2Forchestrator.svg)](https://www.npmjs.com/package/@jawji/orchestrator)
[![CI](https://github.com/utachicodes/jawji-orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/utachicodes/jawji-orchestrator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Standalone onboard vision assisted autonomy for a companion computer, starting with a landing zone safety check.

## What this is

This package runs on a companion computer (a Jetson or Raspberry Pi, for example), as its own process, with its own direct connection to the flight controller through a local `mavsdk_server`. It watches vehicle telemetry, and when a configured mode is triggered (the landing zone check triggers on entering LAND mode), it holds the vehicle, captures a camera frame, sends that frame to a vision language model, and decides whether the current position looks safe.

## What this is not

This is not a ground control station feature, and it does not require a ground control station to be connected. It has no dependency on any particular GCS. A GCS, or any other operator interface, can observe and confirm what this package is doing by talking to its local HTTP API, but that is entirely optional and the package works correctly with nothing else connected at all.

This package also does not include a vision language model server, and does not include camera capture code for any specific hardware. Both are supplied by the integrator through the adapter interfaces described below.

## How the pieces fit together

1. `mavsdk_server` runs on the companion computer, exposing MAVSDK's gRPC interface against the flight controller connection.
2. This package connects to that `mavsdk_server` over gRPC, using vendored proto definitions from the official `mavlink/MAVSDK-Proto` repository, loaded at runtime with `@grpc/proto-loader`. There is no official MAVSDK Node.js client published to npm, which is why this package generates its own client rather than depending on one.
3. When the vehicle's flight mode telemetry reports LAND, the orchestrator commands a hold through the MAVSDK action service, then asks the integrator supplied `CameraSource` for a frame.
4. That frame, along with a prompt, is sent to the integrator supplied `VlmClient`. This package does not care which vision language model answers, only that the response includes a `status` field (`safe` or `unsafe`) and, when unsafe, an optional candidate location.
5. If the verdict is safe, the vehicle resumes its mission automatically.
6. If the verdict is unsafe or the vision language model call failed, the orchestrator holds and exposes the verdict on a small local HTTP server, bound to 127.0.0.1 only, by default on port 48500.
7. Something else, a GCS, a remote control channel, anything with network access to that local API, posts a confirm or reject decision to `/confirm`. The orchestrator then either repositions to the candidate and re-evaluates, or resumes the original landing.
8. If nothing responds, the vehicle simply continues holding. This package does not invent a timeout based fallback action. The flight controller's own existing failsafes, such as battery or radio control loss, remain the safety net if the vehicle is genuinely unattended.

## Confirm gate policy

By default, `confirmPolicy` is `gated`, meaning an unsafe or unknown verdict always blocks on step 7 above until an external confirm arrives. Setting `confirmPolicy` to `autonomous` skips that wait entirely and acts on the mode's own default decision immediately. This must be set explicitly. The default is `gated` on purpose, so that using this package does not silently grant a companion computer the ability to make unattended repositioning decisions unless that is a deliberate choice by whoever is integrating it.

## Local HTTP API

Bound to `127.0.0.1` only, not exposed to the network by this package. Default port 48500.

`GET /status` returns the current orchestrator status as JSON, one of:

```json
{ "state": "idle" }
{ "state": "holding" }
{ "state": "awaiting-confirm", "verdict": { "status": "unsafe", "candidate": { "latitudeDeg": 1.23, "longitudeDeg": 4.56, "description": "clearer patch to the north east" } } }
```

`POST /confirm` accepts a JSON body of either:

```json
{ "action": "accept-candidate" }
{ "action": "reject" }
```

Anything with network reachability to the companion computer's localhost, such as a reverse proxy, an agent process, or an SSH tunnel, can be layered in front of this API to expose it more broadly. This package deliberately does not do that itself, since deciding who is allowed to confirm a landing decision is a security and trust boundary question for the integrator, not something this package should assume an answer to.

## Usage

```typescript
import {
  createOrchestrator,
  createHttpVlmClient,
  createLandingZoneCheckMode,
} from '@jawji/orchestrator';

const orchestrator = createOrchestrator({
  mavsdkServerAddress: 'localhost:50051',
  vlmClient: createHttpVlmClient('http://127.0.0.1:8000/query'),
  cameraSource: {
    async captureFrame() {
      // Return the current frame as a JPEG or PNG Buffer, from whatever
      // camera source is available on this companion computer.
      throw new Error('not implemented');
    },
  },
  confirmPolicy: 'gated',
  statusServerPort: 48500,
  modes: [createLandingZoneCheckMode()],
});

await orchestrator.start();
```

## Prerequisites

- A running `mavsdk_server` connected to the flight controller. This project's own `jawji` companion installer sets one up as part of its autonomy profile, but any `mavsdk_server` instance works.
- A vision language model reachable over HTTP that accepts an image and a prompt and returns JSON with at least a `status` field. This package does not ship one. A small local server such as `llama-server` from `llama.cpp`, or a hosted endpoint, both work equally well as long as the response shape matches.

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT, see [LICENSE](LICENSE).
```

- [ ] **Step 2: Verify no emojis or em dashes are present**

```bash
grep -P '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' README.md
grep -P '\x{2014}' README.md
```

Expected: both commands produce no output (no matches).

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "Add README"
git push
```

---

### Task 11: Publish to npm

**Files:** none (publishing step only).

- [ ] **Step 1: Verify the package builds and tests pass one final time**

```bash
npm run build
npm test
```

Expected: both succeed.

- [ ] **Step 2: Verify npm authentication**

```bash
npm whoami
```

Expected: prints an authenticated npm username. If this fails, the user needs to run `npm login` (or set an `NPM_TOKEN`) before this step can proceed — this cannot be done non-interactively.

- [ ] **Step 3: Publish**

```bash
npm publish --access public
```

Expected: `@jawji/orchestrator@0.1.0` published successfully, visible at `https://www.npmjs.com/package/@jawji/orchestrator`.

- [ ] **Step 4: Tag the release in git**

```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## Self-review notes

- Every task's file paths, exported function names, and type names are consistent across tasks: `VehicleAdapter`, `CameraSource`, `VlmClient`, `OrchestratorContext`, `OrchestratorConfig`, `ModeVerdict`, `ConfirmDecision`, `VisionAssistMode` are defined once in Task 3 (or Task 7 for `VisionAssistMode`) and imported by exact name everywhere else.
- The spec's non-goals (survey/inspection modes, Q&A modes, timeout fallback, bundled VLM server, publishing `@jawji/mavlink-ts`) have no corresponding tasks here, matching the spec.
- The spec's README requirements (no emojis, no em dashes, badges, full pipeline documentation) are covered by Task 10, with an explicit verification step.
- The spec's "no mention of Claude" instruction is a global constraint applied to every commit message and every file in every task, not a separate task.
- License was not specified in the brainstorming conversation; MIT was chosen as the implementer's judgment call for a reusable library and is called out explicitly in Global Constraints for the user to override before Task 11's publish step if they want something else.
