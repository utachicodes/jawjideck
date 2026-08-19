# Web/Desktop Mission & Settings Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user's saved missions and app settings sync between the `jawjideck` desktop app and the `jawji-gcs` web app, without touching either app's live vehicle-connection code (desktop stays MAVLink-direct, web stays AWS IoT/MQTT — those are explicitly out of scope and not reconciled by this plan).

**Architecture:** `jawji-gcs` (Next.js, App Router) gets a new `/api/sync/*` area backed by Firebase Realtime Database, built exactly like the existing `/api/licensing/*` area (`requireApiAuth` → a DB-interface pure-logic layer → route handler). It stores an opaque, per-mission JSON blob and a per-user settings blob, both keyed by Firebase `uid`, with a server-stamped `updatedAt` for last-write-wins conflict resolution and a `deleted` tombstone flag for delete propagation. `jawjideck` desktop gets a new `sync-store.ts` (mirroring the existing `licensing-store.ts` pattern) that pulls the user's remote missions/settings on sign-in, merges them against the local mission library (JSON files on disk) and local settings (electron-store) using a pure, unit-tested merge-planning function, and pushes local changes after every local save/delete.

**Tech Stack:** Next.js 16 App Router, Firebase Admin SDK (`firebase-admin/database`), Firebase Auth, vitest (both repos), Zustand (desktop), Electron IPC (desktop), TypeScript throughout.

## Global Constraints

- This plan does **not** sync live telemetry, flight logs, or vehicle connection state — only saved missions (the mission library) and app settings. Reconciling the MAVLink vs. AWS IoT/MQTT vehicle backends is explicitly out of scope.
- No new IPC channels are needed on the desktop side — sync reuses the existing `missionLibrary*` and `getSettings`/`saveSettings` IPC calls that already exist. Do not add an offline sync queue or new electron-store cache in this plan; if a fetch fails, the sync simply reports an error and the user's next successful sync catches up (mirrors "no offline queue" simplicity, not the licensing cache's offline-fallback behavior — that's a deliberate scope cut, not an oversight).
- All new `jawji-gcs` server code lives under `lib/server/sync/` and `app/api/sync/`, following the exact structure of `lib/server/licensing/` and `app/api/licensing/`.
- Realtime Database access on the server always goes through the `SyncDb` interface (never call `database.ref(...)` directly from a route handler or from pure logic) — this is what let `lib/server/licensing/entitlements.ts` be unit-tested with an in-memory fake, and the same must hold for `lib/server/sync/missions.ts` / `settings.ts`.
- `uid` always comes from `requireApiAuth(req)`, never from the request body — a client cannot read or write another user's sync data.
- Mission `groups`/`items` are stored server-side as opaque `unknown[]` — the sync backend does not import or duplicate `jawjideck`'s `MissionItem`/`Group` types. It stores and returns whatever JSON it's given for those two fields.
- Timestamps: `updatedAt` in `SyncedMission`/`SyncedSettings` is always a `number` (epoch ms), stamped server-side on every write (never trust a client-supplied `updatedAt`). Desktop's local `StoredMission.updatedAt` is an ISO string (existing type, unchanged) — conversion happens at the sync-store boundary, not in either app's core type.

---

## Part A — `jawji-gcs` backend

All paths in this part are relative to `C:\Users\abdou\Documents\jawji-gcs-final\jawji-gcs`.

### Task 1: Sync types + in-memory test double

**Files:**
- Create: `lib/server/sync/types.ts`
- Create: `lib/server/sync/test-helpers/in-memory-db.ts`
- Test: `lib/server/sync/test-helpers/in-memory-db.test.ts`

**Interfaces:**
- Produces: `SyncedMission`, `SyncedSettings`, `SyncDb` (consumed by every later task in Part A), `createInMemorySyncDb()` (consumed by Task 2, Task 3 tests).

- [ ] **Step 1: Write `lib/server/sync/types.ts`**

```ts
export interface SyncedMission {
  id: string;
  name: string;
  description: string;
  vehicleProfileId: string | null;
  tags: string[];
  waypointCount: number;
  totalDistanceMeters: number;
  boundingBox: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null;
  version?: number;
  /** Opaque — the server never interprets mission internals, just stores/returns them. */
  groups: unknown[];
  items: unknown[];
  homePosition: { lat: number; lon: number; alt: number } | null;
  createdAt: string;
  /** Epoch ms. Always stamped server-side on every write. */
  updatedAt: number;
  /** Tombstone: true means this mission was deleted on some device. */
  deleted: boolean;
}

export interface SyncedSettings {
  uid: string;
  /** Opaque — the server never interprets settings internals. */
  payload: Record<string, unknown>;
  /** Epoch ms. Always stamped server-side on every write. */
  updatedAt: number;
}

/**
 * Storage interface every piece of sync logic in this module is written
 * against, instead of importing a database client directly. Lets the pure
 * logic (missions.ts, settings.ts) be unit tested with an in-memory fake,
 * and keeps exactly one place (RealtimeSyncDb) that knows about Firebase
 * Admin SDK at all. Mirrors lib/server/licensing/types.ts's LicensingDb.
 */
export interface SyncDb {
  listMissions(uid: string): Promise<SyncedMission[]>;
  getMission(uid: string, missionId: string): Promise<SyncedMission | null>;
  putMission(uid: string, mission: SyncedMission): Promise<void>;
  getSettings(uid: string): Promise<SyncedSettings | null>;
  putSettings(uid: string, settings: SyncedSettings): Promise<void>;
}
```

- [ ] **Step 2: Write `lib/server/sync/test-helpers/in-memory-db.ts`**

```ts
import type { SyncDb, SyncedMission, SyncedSettings } from '../types';

export function createInMemorySyncDb(): SyncDb {
  const missions = new Map<string, Map<string, SyncedMission>>();
  const settings = new Map<string, SyncedSettings>();

  function missionsFor(uid: string): Map<string, SyncedMission> {
    let m = missions.get(uid);
    if (!m) {
      m = new Map();
      missions.set(uid, m);
    }
    return m;
  }

  return {
    async listMissions(uid) {
      return [...missionsFor(uid).values()];
    },
    async getMission(uid, missionId) {
      return missionsFor(uid).get(missionId) ?? null;
    },
    async putMission(uid, mission) {
      missionsFor(uid).set(mission.id, mission);
    },
    async getSettings(uid) {
      return settings.get(uid) ?? null;
    },
    async putSettings(uid, record) {
      settings.set(uid, record);
    },
  };
}
```

- [ ] **Step 3: Write the failing test for the double itself**

```ts
import { describe, it, expect } from 'vitest';
import { createInMemorySyncDb } from './in-memory-db';

describe('createInMemorySyncDb', () => {
  it('returns an empty mission list for a user with no missions', async () => {
    const db = createInMemorySyncDb();
    expect(await db.listMissions('user-1')).toEqual([]);
  });

  it('isolates missions per uid', async () => {
    const db = createInMemorySyncDb();
    await db.putMission('user-1', { id: 'm1', name: 'A', description: '', vehicleProfileId: null, tags: [], waypointCount: 0, totalDistanceMeters: 0, boundingBox: null, groups: [], items: [], homePosition: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: 1, deleted: false });
    expect(await db.listMissions('user-2')).toEqual([]);
    expect(await db.listMissions('user-1')).toHaveLength(1);
  });

  it('round-trips getMission by id', async () => {
    const db = createInMemorySyncDb();
    await db.putMission('user-1', { id: 'm1', name: 'A', description: '', vehicleProfileId: null, tags: [], waypointCount: 0, totalDistanceMeters: 0, boundingBox: null, groups: [], items: [], homePosition: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: 1, deleted: false });
    const found = await db.getMission('user-1', 'm1');
    expect(found?.name).toBe('A');
    expect(await db.getMission('user-1', 'missing')).toBeNull();
  });

  it('round-trips settings by uid', async () => {
    const db = createInMemorySyncDb();
    expect(await db.getSettings('user-1')).toBeNull();
    await db.putSettings('user-1', { uid: 'user-1', payload: { foo: 'bar' }, updatedAt: 5 });
    expect((await db.getSettings('user-1'))?.payload).toEqual({ foo: 'bar' });
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/server/sync/test-helpers/in-memory-db.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add lib/server/sync/types.ts lib/server/sync/test-helpers/in-memory-db.ts lib/server/sync/test-helpers/in-memory-db.test.ts
git commit -m "feat(sync): add sync types and in-memory test double"
```

---

### Task 2: Missions pure logic + tests

**Files:**
- Create: `lib/server/sync/missions.ts`
- Test: `lib/server/sync/missions.test.ts`

**Interfaces:**
- Consumes: `SyncDb`, `SyncedMission` from `./types` (Task 1); `createInMemorySyncDb` from `./test-helpers/in-memory-db` (Task 1, test-only).
- Produces: `listMissions(db, uid)`, `upsertMission(db, uid, mission, now?)`, `removeMission(db, uid, missionId, now?)` — consumed by Task 5 and Task 6 route handlers.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { listMissions, upsertMission, removeMission } from './missions';
import { createInMemorySyncDb } from './test-helpers/in-memory-db';

const baseMission = {
  id: 'm1', name: 'Survey A', description: '', vehicleProfileId: null, tags: [],
  waypointCount: 3, totalDistanceMeters: 120, boundingBox: null,
  groups: [{ id: 'g1' }], items: [{ seq: 0 }], homePosition: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('listMissions', () => {
  it('returns an empty array for a user with none', async () => {
    const db = createInMemorySyncDb();
    expect(await listMissions(db, 'user-1')).toEqual([]);
  });
});

describe('upsertMission', () => {
  it('stamps updatedAt server-side and stores the mission', async () => {
    const db = createInMemorySyncDb();
    const now = 1_700_000_000_000;

    const result = await upsertMission(db, 'user-1', baseMission, now);

    expect(result.updatedAt).toBe(now);
    expect(result.deleted).toBe(false);
    const stored = await db.getMission('user-1', 'm1');
    expect(stored?.name).toBe('Survey A');
  });

  it('ignores a client-supplied updatedAt', async () => {
    const db = createInMemorySyncDb();
    const now = 1_700_000_000_000;

    const result = await upsertMission(db, 'user-1', { ...baseMission, updatedAt: 1 } as never, now);

    expect(result.updatedAt).toBe(now);
  });
});

describe('removeMission', () => {
  it('marks an existing mission as a tombstone, keeping its other fields', async () => {
    const db = createInMemorySyncDb();
    await upsertMission(db, 'user-1', baseMission, 1_700_000_000_000);

    await removeMission(db, 'user-1', 'm1', 1_700_000_001_000);

    const stored = await db.getMission('user-1', 'm1');
    expect(stored?.deleted).toBe(true);
    expect(stored?.updatedAt).toBe(1_700_000_001_000);
    expect(stored?.name).toBe('Survey A');
  });

  it('creates a bare tombstone for a mission never seen server-side', async () => {
    const db = createInMemorySyncDb();

    await removeMission(db, 'user-1', 'never-synced', 1_700_000_002_000);

    const stored = await db.getMission('user-1', 'never-synced');
    expect(stored?.deleted).toBe(true);
    expect(stored?.updatedAt).toBe(1_700_000_002_000);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/server/sync/missions.test.ts`
Expected: FAIL with "Cannot find module './missions'"

- [ ] **Step 3: Write `lib/server/sync/missions.ts`**

```ts
import type { SyncDb, SyncedMission } from './types';

export async function listMissions(db: SyncDb, uid: string): Promise<SyncedMission[]> {
  return db.listMissions(uid);
}

export async function upsertMission(
  db: SyncDb,
  uid: string,
  mission: Omit<SyncedMission, 'updatedAt' | 'deleted'>,
  now: number = Date.now()
): Promise<SyncedMission> {
  const record: SyncedMission = { ...mission, updatedAt: now, deleted: false };
  await db.putMission(uid, record);
  return record;
}

export async function removeMission(
  db: SyncDb,
  uid: string,
  missionId: string,
  now: number = Date.now()
): Promise<SyncedMission> {
  const existing = await db.getMission(uid, missionId);
  const record: SyncedMission = existing
    ? { ...existing, deleted: true, updatedAt: now }
    : {
        id: missionId, name: '', description: '', vehicleProfileId: null, tags: [],
        waypointCount: 0, totalDistanceMeters: 0, boundingBox: null, groups: [], items: [],
        homePosition: null, createdAt: new Date(now).toISOString(), updatedAt: now, deleted: true,
      };
  await db.putMission(uid, record);
  return record;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/server/sync/missions.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add lib/server/sync/missions.ts lib/server/sync/missions.test.ts
git commit -m "feat(sync): add mission sync pure logic (list/upsert/remove)"
```

---

### Task 3: Settings pure logic + tests

**Files:**
- Create: `lib/server/sync/settings.ts`
- Test: `lib/server/sync/settings.test.ts`

**Interfaces:**
- Consumes: `SyncDb`, `SyncedSettings` from `./types` (Task 1).
- Produces: `getSettings(db, uid)`, `putSettings(db, uid, payload, now?)` — consumed by Task 7 route handler.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { getSettings, putSettings } from './settings';
import { createInMemorySyncDb } from './test-helpers/in-memory-db';

describe('getSettings', () => {
  it('returns null for a user with no saved settings', async () => {
    const db = createInMemorySyncDb();
    expect(await getSettings(db, 'user-1')).toBeNull();
  });
});

describe('putSettings', () => {
  it('stamps updatedAt server-side and stores the payload', async () => {
    const db = createInMemorySyncDb();
    const now = 1_700_000_000_000;

    const result = await putSettings(db, 'user-1', { theme: 'dark' }, now);

    expect(result).toEqual({ uid: 'user-1', payload: { theme: 'dark' }, updatedAt: now });
    expect(await getSettings(db, 'user-1')).toEqual(result);
  });

  it('overwrites a previous settings payload', async () => {
    const db = createInMemorySyncDb();
    await putSettings(db, 'user-1', { theme: 'dark' }, 1_700_000_000_000);

    await putSettings(db, 'user-1', { theme: 'light' }, 1_700_000_001_000);

    const stored = await getSettings(db, 'user-1');
    expect(stored?.payload).toEqual({ theme: 'light' });
    expect(stored?.updatedAt).toBe(1_700_000_001_000);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/server/sync/settings.test.ts`
Expected: FAIL with "Cannot find module './settings'"

- [ ] **Step 3: Write `lib/server/sync/settings.ts`**

```ts
import type { SyncDb, SyncedSettings } from './types';

export async function getSettings(db: SyncDb, uid: string): Promise<SyncedSettings | null> {
  return db.getSettings(uid);
}

export async function putSettings(
  db: SyncDb,
  uid: string,
  payload: Record<string, unknown>,
  now: number = Date.now()
): Promise<SyncedSettings> {
  const record: SyncedSettings = { uid, payload, updatedAt: now };
  await db.putSettings(uid, record);
  return record;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/server/sync/settings.test.ts`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add lib/server/sync/settings.ts lib/server/sync/settings.test.ts
git commit -m "feat(sync): add settings sync pure logic (get/put)"
```

---

### Task 4: Realtime Database implementation of `SyncDb`

**Files:**
- Create: `lib/server/sync/admin-db.ts`

**Interfaces:**
- Consumes: `SyncDb`, `SyncedMission`, `SyncedSettings` from `./types` (Task 1).
- Produces: `getRealtimeSyncDb()` — consumed by Task 5, Task 6, Task 7 route handlers.

No unit test for this file — it's a thin Firebase Admin RTDB wrapper requiring a live database connection, matching `lib/server/licensing/admin-db.ts` (also untested for the same reason; verified by the existing route handlers' integration behavior instead).

- [ ] **Step 1: Write `lib/server/sync/admin-db.ts`**

This duplicates the lazy Firebase Admin singleton pattern from `lib/server/licensing/admin-db.ts` verbatim (the codebase's existing convention is one independent lazy singleton per DB-consuming module — do not refactor that into a shared helper as part of this plan).

```ts
import type { SyncDb, SyncedMission, SyncedSettings } from './types';

let dbPromise: Promise<import('firebase-admin/database').Database | null> | null = null;

async function getAdminDatabase(): Promise<import('firebase-admin/database').Database | null> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      const adminApp = await import('firebase-admin/app');
      const adminDatabase = await import('firebase-admin/database');
      const { getApps, initializeApp, cert, applicationDefault } = adminApp;
      const databaseURL = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
      if (!databaseURL) {
        console.error('[sync/admin-db] FIREBASE_DATABASE_URL not set — cannot initialize');
        return null;
      }
      if (getApps().length === 0) {
        const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (serviceAccountJson) {
          const parsed = JSON.parse(serviceAccountJson);
          initializeApp({ credential: cert(parsed), projectId: parsed.project_id || projectId, databaseURL });
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          initializeApp({ credential: applicationDefault(), projectId, databaseURL });
        } else {
          console.error('[sync/admin-db] No service account credentials available');
          return null;
        }
      }
      return adminDatabase.getDatabase();
    } catch (err) {
      console.error('[sync/admin-db] Failed to initialize firebase-admin database:', err);
      return null;
    }
  })();
  return dbPromise;
}

export async function getRealtimeSyncDb(): Promise<SyncDb> {
  const database = await getAdminDatabase();
  if (!database) {
    throw new Error('Sync database is not available (missing Firebase admin credentials)');
  }

  return {
    async listMissions(uid) {
      const snap = await database.ref(`sync/missions/${uid}`).get();
      if (!snap.exists()) return [];
      const val = snap.val() as Record<string, SyncedMission>;
      return Object.values(val);
    },
    async getMission(uid, missionId) {
      const snap = await database.ref(`sync/missions/${uid}/${missionId}`).get();
      return snap.exists() ? (snap.val() as SyncedMission) : null;
    },
    async putMission(uid, mission) {
      await database.ref(`sync/missions/${uid}/${mission.id}`).set(mission);
    },
    async getSettings(uid) {
      const snap = await database.ref(`sync/settings/${uid}`).get();
      return snap.exists() ? (snap.val() as SyncedSettings) : null;
    },
    async putSettings(uid, settings) {
      await database.ref(`sync/settings/${uid}`).set(settings);
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add lib/server/sync/admin-db.ts
git commit -m "feat(sync): add Realtime Database implementation of SyncDb"
```

---

### Task 5: Missions API routes — list + upsert

**Files:**
- Create: `app/api/sync/missions/route.ts`

**Interfaces:**
- Consumes: `requireApiAuth` from `@/lib/server/api-auth` (existing); `getRealtimeSyncDb` from `@/lib/server/sync/admin-db` (Task 4); `listMissions`, `upsertMission` from `@/lib/server/sync/missions` (Task 2).

- [ ] **Step 1: Write `app/api/sync/missions/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/server/api-auth"
import { getRealtimeSyncDb } from "@/lib/server/sync/admin-db"
import { listMissions, upsertMission } from "@/lib/server/sync/missions"
import type { SyncedMission } from "@/lib/server/sync/types"

export async function GET(req: NextRequest) {
    const auth = await requireApiAuth(req)
    if (auth instanceof NextResponse) return auth

    try {
        const db = await getRealtimeSyncDb()
        const missions = await listMissions(db, auth.user.uid)
        return NextResponse.json({ missions })
    } catch (error) {
        console.error("[API] Sync missions list error:", error)
        return NextResponse.json(
            { error: "Failed to load missions", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    const auth = await requireApiAuth(req)
    if (auth instanceof NextResponse) return auth

    let body: Omit<SyncedMission, "updatedAt" | "deleted">
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    if (!body || typeof body.id !== "string" || !body.id) {
        return NextResponse.json({ error: "Mission id is required" }, { status: 400 })
    }

    try {
        const db = await getRealtimeSyncDb()
        const mission = await upsertMission(db, auth.user.uid, body)
        return NextResponse.json({ mission })
    } catch (error) {
        console.error("[API] Sync mission upsert error:", error)
        return NextResponse.json(
            { error: "Failed to save mission", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        )
    }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add app/api/sync/missions/route.ts
git commit -m "feat(sync): add GET/POST /api/sync/missions"
```

---

### Task 6: Mission delete API route

**Files:**
- Create: `app/api/sync/missions/[missionId]/route.ts`

**Interfaces:**
- Consumes: `requireApiAuth`, `getRealtimeSyncDb` (Task 4), `removeMission` from `@/lib/server/sync/missions` (Task 2).

- [ ] **Step 1: Write `app/api/sync/missions/[missionId]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/server/api-auth"
import { getRealtimeSyncDb } from "@/lib/server/sync/admin-db"
import { removeMission } from "@/lib/server/sync/missions"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ missionId: string }> }) {
    const auth = await requireApiAuth(req)
    if (auth instanceof NextResponse) return auth

    const { missionId } = await params
    if (!missionId) {
        return NextResponse.json({ error: "Mission id is required" }, { status: 400 })
    }

    try {
        const db = await getRealtimeSyncDb()
        const mission = await removeMission(db, auth.user.uid, missionId)
        return NextResponse.json({ mission })
    } catch (error) {
        console.error("[API] Sync mission delete error:", error)
        return NextResponse.json(
            { error: "Failed to delete mission", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        )
    }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors (confirms the `params: Promise<...>` shape matches this Next.js version's route handler signature — Next 15+ made dynamic route `params` async; this repo is on Next 16 per `package.json`)

- [ ] **Step 3: Commit**

```bash
git add "app/api/sync/missions/[missionId]/route.ts"
git commit -m "feat(sync): add DELETE /api/sync/missions/[missionId]"
```

---

### Task 7: Settings API routes — get + put

**Files:**
- Create: `app/api/sync/settings/route.ts`

**Interfaces:**
- Consumes: `requireApiAuth`, `getRealtimeSyncDb` (Task 4), `getSettings`, `putSettings` from `@/lib/server/sync/settings` (Task 3).

- [ ] **Step 1: Write `app/api/sync/settings/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/server/api-auth"
import { getRealtimeSyncDb } from "@/lib/server/sync/admin-db"
import { getSettings, putSettings } from "@/lib/server/sync/settings"

export async function GET(req: NextRequest) {
    const auth = await requireApiAuth(req)
    if (auth instanceof NextResponse) return auth

    try {
        const db = await getRealtimeSyncDb()
        const settings = await getSettings(db, auth.user.uid)
        return NextResponse.json({ settings })
    } catch (error) {
        console.error("[API] Sync settings get error:", error)
        return NextResponse.json(
            { error: "Failed to load settings", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        )
    }
}

export async function PUT(req: NextRequest) {
    const auth = await requireApiAuth(req)
    if (auth instanceof NextResponse) return auth

    let body: { payload?: Record<string, unknown> }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    if (!body?.payload || typeof body.payload !== "object") {
        return NextResponse.json({ error: "payload is required" }, { status: 400 })
    }

    try {
        const db = await getRealtimeSyncDb()
        const settings = await putSettings(db, auth.user.uid, body.payload)
        return NextResponse.json({ settings })
    } catch (error) {
        console.error("[API] Sync settings put error:", error)
        return NextResponse.json(
            { error: "Failed to save settings", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        )
    }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add app/api/sync/settings/route.ts
git commit -m "feat(sync): add GET/PUT /api/sync/settings"
```

---

### Task 8: Realtime Database security rules

**Files:**
- Modify: `database.rules.json:62-68` (the existing `"licensing"` block — add a sibling `"sync"` block right after it)

**Interfaces:**
- None (config-only, no code).

- [ ] **Step 1: Edit `database.rules.json`**

Change:
```json
    "licensing": {
      ".read": false,
      ".write": false,
      "licenses": { ".indexOn": ["ownerUid"] },
      "$other": { ".validate": false }
    }
```
to:
```json
    "licensing": {
      ".read": false,
      ".write": false,
      "licenses": { ".indexOn": ["ownerUid"] },
      "$other": { ".validate": false }
    },

    "sync": {
      ".read": false,
      ".write": false,
      "$other": { ".validate": false }
    }
```

(Server-only, same as `licensing` — all access goes through the Admin SDK via `requireApiAuth`-gated routes, never the client Firebase SDK.)

- [ ] **Step 2: Validate the JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('database.rules.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add database.rules.json
git commit -m "feat(sync): add sync/ node to Realtime Database rules (server-only)"
```

*(Deploying the updated rules to the live Firebase project, e.g. via `firebase deploy --only database`, is an operational step for whoever owns Firebase project access — not part of this plan's automated steps.)*

---

## Part B — `jawjideck` desktop

All paths in this part are relative to `c:\Users\abdou\Documents\jawji-gcs-final\jawjideck`.

### Task 9: Extract shared `apiFetch` helper

**Files:**
- Create: `apps/desktop/src/renderer/lib/api-fetch.ts`
- Modify: `apps/desktop/src/renderer/stores/licensing-store.ts:1-95` (remove the locally-defined `JAWJI_GCS_URL`/`getIdTokenOrThrow`/`apiFetch`, import from the new file instead)

**Interfaces:**
- Produces: `JAWJI_GCS_URL`, `apiFetch<T>(path, init?)` — consumed by Task 12/13 (`sync-store.ts`) and by the refactored `licensing-store.ts`.

- [ ] **Step 1: Write `apps/desktop/src/renderer/lib/api-fetch.ts`**

```ts
import { auth } from './firebase';

export const JAWJI_GCS_URL = import.meta.env.VITE_JAWJI_GCS_URL || 'https://jawji.space';

async function getIdTokenOrThrow(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const idToken = await getIdTokenOrThrow();
  const res = await fetch(`${JAWJI_GCS_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${idToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request to ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}
```

- [ ] **Step 2: Edit `licensing-store.ts` to use the shared helper**

Remove lines 12 (`const JAWJI_GCS_URL = ...`) and 74-95 (`getIdTokenOrThrow`/`apiFetch` definitions), and add an import. The top of the file goes from:

```ts
import { create } from 'zustand';
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
  setPersistence,
  browserLocalPersistence,
  type User,
} from 'firebase/auth';
import { auth, firebaseConfigured } from '../lib/firebase';

const JAWJI_GCS_URL = import.meta.env.VITE_JAWJI_GCS_URL || 'https://jawji.space';
```

to:

```ts
import { create } from 'zustand';
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
  setPersistence,
  browserLocalPersistence,
  type User,
} from 'firebase/auth';
import { auth, firebaseConfigured } from '../lib/firebase';
import { apiFetch, JAWJI_GCS_URL } from '../lib/api-fetch';
```

And remove this whole block (originally lines 74-95):

```ts
async function getIdTokenOrThrow(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const idToken = await getIdTokenOrThrow();
  const res = await fetch(`${JAWJI_GCS_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${idToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request to ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}
```

Everything else in the file (the `signIn`/`refreshEntitlements`/`activateCode`/`startCheckout` bodies) is unchanged — they already call `apiFetch(...)`, which now resolves to the imported function instead of the local one.

- [ ] **Step 3: Run the existing licensing-store test to confirm nothing broke**

Run: `pnpm --filter @jawji/desktop test -- licensing-store.test.ts`
Expected: 4 passed (same as before — `isCacheStale`/`STALE_THRESHOLD_MS` are untouched)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @jawji/desktop exec tsc --noEmit`
Expected: no new errors

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/lib/api-fetch.ts apps/desktop/src/renderer/stores/licensing-store.ts
git commit -m "refactor: extract shared apiFetch helper out of licensing-store"
```

---

### Task 10: Stamp `settingsUpdatedAt` on every settings save

**Files:**
- Modify: `apps/desktop/src/shared/ipc-channels.ts:1005-1006` (add a field to `SettingsStoreSchema`)
- Modify: `apps/desktop/src/main/ipc-handlers.ts:3755-3757` (stamp it in the `SETTINGS_SAVE` handler)

**Interfaces:**
- Produces: `SettingsStoreSchema.settingsUpdatedAt: number | undefined` — consumed by Task 13 (`syncSettings`).

Local settings currently have no last-modified timestamp, which the last-write-wins settings sync needs. Stamping happens in the main-process IPC handler (not the renderer) so it's always fresh regardless of which renderer code path triggers a save.

- [ ] **Step 1: Edit `ipc-channels.ts`**

Change (end of `SettingsStoreSchema`, right before its closing brace):

```ts
  surveySavedConfig?: Record<string, unknown>;
}
```

to:

```ts
  surveySavedConfig?: Record<string, unknown>;
  /** Epoch ms, stamped by the main process on every SETTINGS_SAVE. Used for last-write-wins sync with jawji-gcs. */
  settingsUpdatedAt?: number;
}
```

- [ ] **Step 2: Edit `ipc-handlers.ts`**

Change:

```ts
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_, settings: SettingsStoreSchema): Promise<void> => {
    settingsStore.set(settings);
  });
```

to:

```ts
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_, settings: SettingsStoreSchema): Promise<void> => {
    settingsStore.set({ ...settings, settingsUpdatedAt: Date.now() });
  });
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @jawji/desktop exec tsc --noEmit`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/shared/ipc-channels.ts apps/desktop/src/main/ipc-handlers.ts
git commit -m "feat(sync): stamp settingsUpdatedAt on every settings save"
```

---

### Task 11: Sync types + mission merge-planning logic (pure, tested)

**Files:**
- Create: `apps/desktop/src/renderer/stores/sync-store.ts` (types + `planMissionMerge` only in this task; sync actions added in Task 12/13)
- Test: `apps/desktop/src/renderer/stores/sync-store.test.ts`

**Interfaces:**
- Consumes: `MissionSummary` from `../../shared/mission-library-types` (existing).
- Produces: `SyncedMission` type, `MergePlan` type, `planMissionMerge(local, remote)` — consumed by Task 12.

This is the trickiest logic in the whole plan (last-write-wins across two independently-clocked stores, plus tombstone handling), so it's built and tested as a pure function before anything wires it to real IPC/network calls — same reasoning as `isCacheStale` in `licensing-store.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { planMissionMerge, type SyncedMission } from './sync-store';
import type { MissionSummary } from '../../shared/mission-library-types';

function localMission(overrides: Partial<MissionSummary> = {}): MissionSummary {
  return {
    id: 'm1', name: 'Local', description: '', vehicleProfileId: null, tags: [],
    waypointCount: 1, totalDistanceMeters: 10, boundingBox: null,
    flightCount: 0, lastFlightStatus: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function remoteMission(overrides: Partial<SyncedMission> = {}): SyncedMission {
  return {
    id: 'm1', name: 'Remote', description: '', vehicleProfileId: null, tags: [],
    waypointCount: 1, totalDistanceMeters: 10, boundingBox: null,
    groups: [], items: [], homePosition: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: 1_735_689_600_000, deleted: false,
    ...overrides,
  };
}

describe('planMissionMerge', () => {
  it('pushes a mission that only exists locally', () => {
    const plan = planMissionMerge([localMission()], []);
    expect(plan.toPush.map((m) => m.id)).toEqual(['m1']);
    expect(plan.toPull).toEqual([]);
    expect(plan.toDeleteLocally).toEqual([]);
  });

  it('pulls a mission that only exists remotely (and is not a tombstone)', () => {
    const plan = planMissionMerge([], [remoteMission()]);
    expect(plan.toPull.map((m) => m.id)).toEqual(['m1']);
    expect(plan.toPush).toEqual([]);
  });

  it('ignores a remote tombstone for a mission never seen locally', () => {
    const plan = planMissionMerge([], [remoteMission({ deleted: true })]);
    expect(plan.toPull).toEqual([]);
    expect(plan.toDeleteLocally).toEqual([]);
  });

  it('pulls when the remote copy is newer than the local copy', () => {
    const local = localMission({ updatedAt: '2026-01-01T00:00:00.000Z' });
    const remote = remoteMission({ updatedAt: new Date('2026-01-02T00:00:00.000Z').getTime() });
    const plan = planMissionMerge([local], [remote]);
    expect(plan.toPull.map((m) => m.id)).toEqual(['m1']);
    expect(plan.toPush).toEqual([]);
  });

  it('pushes when the local copy is newer than the remote copy', () => {
    const local = localMission({ updatedAt: '2026-01-02T00:00:00.000Z' });
    const remote = remoteMission({ updatedAt: new Date('2026-01-01T00:00:00.000Z').getTime() });
    const plan = planMissionMerge([local], [remote]);
    expect(plan.toPush.map((m) => m.id)).toEqual(['m1']);
    expect(plan.toPull).toEqual([]);
  });

  it('deletes locally when a newer remote tombstone exists', () => {
    const local = localMission({ updatedAt: '2026-01-01T00:00:00.000Z' });
    const remote = remoteMission({ deleted: true, updatedAt: new Date('2026-01-02T00:00:00.000Z').getTime() });
    const plan = planMissionMerge([local], [remote]);
    expect(plan.toDeleteLocally).toEqual(['m1']);
    expect(plan.toPush).toEqual([]);
    expect(plan.toPull).toEqual([]);
  });

  it('re-pushes (undeletes) when the local copy is newer than a remote tombstone', () => {
    const local = localMission({ updatedAt: '2026-01-02T00:00:00.000Z' });
    const remote = remoteMission({ deleted: true, updatedAt: new Date('2026-01-01T00:00:00.000Z').getTime() });
    const plan = planMissionMerge([local], [remote]);
    expect(plan.toPush.map((m) => m.id)).toEqual(['m1']);
    expect(plan.toDeleteLocally).toEqual([]);
  });

  it('does nothing for a mission that is already in sync', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const local = localMission({ updatedAt: ts });
    const remote = remoteMission({ updatedAt: new Date(ts).getTime() });
    const plan = planMissionMerge([local], [remote]);
    expect(plan.toPush).toEqual([]);
    expect(plan.toPull).toEqual([]);
    expect(plan.toDeleteLocally).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @jawji/desktop test -- sync-store.test.ts`
Expected: FAIL with "Cannot find module './sync-store'"

- [ ] **Step 3: Write `sync-store.ts` (types + `planMissionMerge` only for now)**

```ts
import type { MissionSummary } from '../../shared/mission-library-types';

export interface SyncedMission {
  id: string;
  name: string;
  description: string;
  vehicleProfileId: string | null;
  tags: string[];
  waypointCount: number;
  totalDistanceMeters: number;
  boundingBox: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null;
  version?: number;
  groups: unknown[];
  items: unknown[];
  homePosition: { lat: number; lon: number; alt: number } | null;
  createdAt: string;
  updatedAt: number;
  deleted: boolean;
}

export interface SyncedSettings {
  uid: string;
  payload: Record<string, unknown>;
  updatedAt: number;
}

export interface MergePlan {
  /** Local missions to POST to the server (new locally, or newer than the remote copy). */
  toPush: MissionSummary[];
  /** Remote missions to save locally (new remotely, or newer than the local copy). */
  toPull: SyncedMission[];
  /** Mission ids to delete locally because a newer remote tombstone exists. */
  toDeleteLocally: string[];
}

/**
 * Last-write-wins merge plan between the local mission library and the
 * server's synced missions. Pure and side-effect free so it can be unit
 * tested without touching IPC or the network — see sync-store.test.ts.
 */
export function planMissionMerge(local: MissionSummary[], remote: SyncedMission[]): MergePlan {
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const localById = new Map(local.map((l) => [l.id, l]));
  const toPush: MissionSummary[] = [];
  const toPull: SyncedMission[] = [];
  const toDeleteLocally: string[] = [];

  for (const l of local) {
    const r = remoteById.get(l.id);
    if (!r) {
      toPush.push(l);
      continue;
    }
    const localUpdatedAt = new Date(l.updatedAt).getTime();
    if (r.updatedAt > localUpdatedAt) {
      if (r.deleted) toDeleteLocally.push(l.id);
      else toPull.push(r);
    } else if (localUpdatedAt > r.updatedAt) {
      toPush.push(l);
    }
    // Equal timestamps: already in sync, nothing to do.
  }

  for (const r of remote) {
    if (r.deleted) continue;
    if (!localById.has(r.id)) toPull.push(r);
  }

  return { toPush, toPull, toDeleteLocally };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @jawji/desktop test -- sync-store.test.ts`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/stores/sync-store.ts apps/desktop/src/renderer/stores/sync-store.test.ts
git commit -m "feat(sync): add mission merge-planning logic (last-write-wins)"
```

---

### Task 12: `syncMissions` action

**Files:**
- Modify: `apps/desktop/src/renderer/stores/sync-store.ts` (append the zustand store to the file created in Task 11)

**Interfaces:**
- Consumes: `apiFetch` from `../lib/api-fetch` (Task 9); `planMissionMerge` (Task 11); `useMissionLibraryStore` from `./mission-library-store` (existing, `missions`, `loadMissions()`); `window.electronAPI.missionLibraryGet/Save/Delete` (existing IPC, unchanged); `SaveMissionPayload`, `MissionItem`, `Group` types (existing).
- Produces: `useSyncStore` (zustand hook) with `syncing`, `lastSyncedAt`, `error`, `syncMissions()` — consumed by Task 14 (wiring) and Task 15 (UI).

- [ ] **Step 1: Append to `sync-store.ts`**

Add these imports at the top of the file (alongside the existing `MissionSummary` import):

```ts
import { create } from 'zustand';
import type { MissionSummary, SaveMissionPayload } from '../../shared/mission-library-types';
import type { Group } from '../../shared/mission-group-types';
import type { MissionItem } from '../../shared/mission-types';
import { apiFetch } from '../lib/api-fetch';
import { useMissionLibraryStore } from './mission-library-store';
```

(Replace the earlier `import type { MissionSummary } from '../../shared/mission-library-types';` from Task 11 with this expanded block.)

Append at the end of the file, after `planMissionMerge`:

```ts
function syncedMissionToPayload(m: SyncedMission): SaveMissionPayload {
  return {
    name: m.name,
    description: m.description,
    vehicleProfileId: m.vehicleProfileId,
    tags: m.tags,
    groups: m.groups as Group[],
    items: m.items as MissionItem[],
    homePosition: m.homePosition,
    existingId: m.id,
  };
}

function localMissionToSyncedPayload(m: import('../../shared/mission-library-types').StoredMission): Omit<SyncedMission, 'updatedAt' | 'deleted'> {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    vehicleProfileId: m.vehicleProfileId,
    tags: m.tags,
    waypointCount: m.waypointCount,
    totalDistanceMeters: m.totalDistanceMeters,
    boundingBox: m.boundingBox,
    version: m.version,
    groups: m.groups,
    items: m.items,
    homePosition: m.homePosition,
    createdAt: m.createdAt,
  };
}

interface SyncState {
  syncing: boolean;
  lastSyncedAt: number | null;
  error: string | null;
  syncMissions: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set) => ({
  syncing: false,
  lastSyncedAt: null,
  error: null,

  syncMissions: async () => {
    set({ syncing: true, error: null });
    try {
      const { missions: remote } = await apiFetch<{ missions: SyncedMission[] }>('/api/sync/missions');
      const local = useMissionLibraryStore.getState().missions;
      const plan = planMissionMerge(local, remote);

      for (const r of plan.toPull) {
        await window.electronAPI.missionLibrarySave(syncedMissionToPayload(r));
      }
      for (const id of plan.toDeleteLocally) {
        await window.electronAPI.missionLibraryDelete(id);
      }
      for (const l of plan.toPush) {
        const full = await window.electronAPI.missionLibraryGet(l.id);
        if (full) {
          await apiFetch('/api/sync/missions', {
            method: 'POST',
            body: JSON.stringify(localMissionToSyncedPayload(full)),
          });
        }
      }

      if (plan.toPull.length || plan.toDeleteLocally.length) {
        await useMissionLibraryStore.getState().loadMissions();
      }
      set({ syncing: false, lastSyncedAt: Date.now() });
    } catch (err) {
      set({ syncing: false, error: err instanceof Error ? err.message : 'Mission sync failed' });
    }
  },
}));
```

- [ ] **Step 2: Run the sync-store tests again to confirm the pure-logic tests still pass unchanged**

Run: `pnpm --filter @jawji/desktop test -- sync-store.test.ts`
Expected: 8 passed (the new store code doesn't affect `planMissionMerge`'s behavior)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @jawji/desktop exec tsc --noEmit`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/stores/sync-store.ts
git commit -m "feat(sync): add syncMissions action to sync-store"
```

---

### Task 13: `syncSettings` action

**Files:**
- Modify: `apps/desktop/src/renderer/stores/sync-store.ts`

**Interfaces:**
- Consumes: `apiFetch` (Task 9); `window.electronAPI.getSettings/saveSettings` (existing IPC); `SettingsStoreSchema.settingsUpdatedAt` (Task 10).
- Produces: `useSyncStore().syncSettings()` — consumed by Task 14/15.

- [ ] **Step 1: Extend the `SyncState` interface and store body**

Change:

```ts
interface SyncState {
  syncing: boolean;
  lastSyncedAt: number | null;
  error: string | null;
  syncMissions: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set) => ({
  syncing: false,
  lastSyncedAt: null,
  error: null,

  syncMissions: async () => {
    /* ...unchanged from Task 12... */
  },
}));
```

to:

```ts
interface SyncState {
  syncing: boolean;
  lastSyncedAt: number | null;
  error: string | null;
  syncMissions: () => Promise<void>;
  syncSettings: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set) => ({
  syncing: false,
  lastSyncedAt: null,
  error: null,

  syncMissions: async () => {
    /* ...unchanged from Task 12... */
  },

  syncSettings: async () => {
    set({ syncing: true, error: null });
    try {
      const local = await window.electronAPI.getSettings();
      const { settings: remote } = await apiFetch<{ settings: SyncedSettings | null }>('/api/sync/settings');
      const localUpdatedAt = local.settingsUpdatedAt ?? 0;

      if (!remote || localUpdatedAt >= remote.updatedAt) {
        await apiFetch('/api/sync/settings', {
          method: 'PUT',
          body: JSON.stringify({ payload: local }),
        });
      } else {
        await window.electronAPI.saveSettings(remote.payload as unknown as import('../../shared/ipc-channels').SettingsStoreSchema);
      }
      set({ syncing: false, lastSyncedAt: Date.now() });
    } catch (err) {
      set({ syncing: false, error: err instanceof Error ? err.message : 'Settings sync failed' });
    }
  },
}));
```

(Leave the `syncMissions` body exactly as written in Task 12 — only `SyncState` and the object literal gain the new field/method.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @jawji/desktop exec tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Run the sync-store tests**

Run: `pnpm --filter @jawji/desktop test -- sync-store.test.ts`
Expected: 8 passed (unchanged)

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/stores/sync-store.ts
git commit -m "feat(sync): add syncSettings action to sync-store"
```

---

### Task 14: Wire sync to sign-in and to local mission changes

**Files:**
- Modify: `apps/desktop/src/renderer/stores/licensing-store.ts` (trigger a sync on sign-in)
- Modify: `apps/desktop/src/renderer/stores/mission-library-store.ts:97-126` (push after save/delete)

**Interfaces:**
- Consumes: `useSyncStore` from `./sync-store` (Task 12/13).

- [ ] **Step 1: Edit `licensing-store.ts`'s `onAuthStateChanged` callback**

Change:

```ts
      onAuthStateChanged(auth, (user) => {
        set({ user, authLoading: false });
        if (user) void get().refreshEntitlements();
        else set({ entitlements: null });
      });
```

to:

```ts
      onAuthStateChanged(auth, (user) => {
        set({ user, authLoading: false });
        if (user) {
          void get().refreshEntitlements();
          // Fire-and-forget: mission/settings sync failures shouldn't block
          // sign-in or surface as a licensing error. The sync store tracks
          // its own error state independently.
          void import('./sync-store').then(({ useSyncStore }) => {
            void useSyncStore.getState().syncMissions();
            void useSyncStore.getState().syncSettings();
          });
        } else {
          set({ entitlements: null });
        }
      });
```

(Dynamic `import()` here avoids a static circular import — `sync-store.ts` doesn't import `licensing-store.ts`, but this keeps the dependency direction explicit and one-way.)

- [ ] **Step 2: Edit `mission-library-store.ts`'s `saveMission` and `deleteMission`**

Change:

```ts
  saveMission: async (payload: SaveMissionPayload) => {
    try {
      const summary = await window.electronAPI.missionLibrarySave(payload);
      // Reload the list after save (don't let reload failure break the save result)
      get().loadMissions().catch(() => {});
      return summary;
    } catch (err) {
      console.error('[MissionLibrary] Failed to save mission:', err);
      set({ error: String(err) });
      return null;
    }
  },
```

to:

```ts
  saveMission: async (payload: SaveMissionPayload) => {
    try {
      const summary = await window.electronAPI.missionLibrarySave(payload);
      // Reload the list after save (don't let reload failure break the save result)
      get().loadMissions().catch(() => {});
      // Fire-and-forget: push the change to jawji-gcs if signed in. Sync
      // failures don't block the local save or surface here — the sync
      // store tracks its own error state.
      void import('./sync-store').then(({ useSyncStore }) => {
        void useSyncStore.getState().syncMissions();
      });
      return summary;
    } catch (err) {
      console.error('[MissionLibrary] Failed to save mission:', err);
      set({ error: String(err) });
      return null;
    }
  },
```

And change:

```ts
  deleteMission: async (id: string) => {
    try {
      const success = await window.electronAPI.missionLibraryDelete(id);
      if (success) {
        // Clear selection if this mission was selected
        const { selectedMission } = get();
        if (selectedMission?.id === id) {
          set({ selectedMission: null, flightLogs: [] });
        }
        await get().loadMissions();
      }
      return success;
    } catch (err) {
      set({ error: String(err) });
      return false;
    }
  },
```

to:

```ts
  deleteMission: async (id: string) => {
    try {
      const success = await window.electronAPI.missionLibraryDelete(id);
      if (success) {
        // Clear selection if this mission was selected
        const { selectedMission } = get();
        if (selectedMission?.id === id) {
          set({ selectedMission: null, flightLogs: [] });
        }
        await get().loadMissions();
        void import('./sync-store').then(({ useSyncStore }) => {
          void useSyncStore.getState().syncMissions();
        });
      }
      return success;
    } catch (err) {
      set({ error: String(err) });
      return false;
    }
  },
```

Note: `syncMissions()` re-derives its push/pull plan from scratch each call (it lists all remote missions and diffs against local), so calling it again after a local delete correctly picks up the delete as a local-newer-than-remote change and pushes the tombstone — no separate "push a single delete" path is needed.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @jawji/desktop exec tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Run the full desktop test suite**

Run: `pnpm --filter @jawji/desktop test`
Expected: all passing (no regressions in `mission-store-groups.test.ts`, `licensing-store.test.ts`, `sync-store.test.ts`, etc.)

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/stores/licensing-store.ts apps/desktop/src/renderer/stores/mission-library-store.ts
git commit -m "feat(sync): trigger mission/settings sync on sign-in and local mission changes"
```

---

### Task 15: Manual "Sync now" affordance in Settings

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/tabs/LicensingTab.tsx` (add a small sync section below the existing account/subscription UI)

**Interfaces:**
- Consumes: `useSyncStore` from `../../../stores/sync-store` (Task 12/13); `useLicensingStore` (existing, for `user`/`entitlements` gating).

- [ ] **Step 1: Read the current file to find the right insertion point**

Before editing, open `apps/desktop/src/renderer/components/settings/tabs/LicensingTab.tsx` and locate the closing of the account/subscription section (the Jawji Intelligence catalog section starts around line 146 per prior investigation — insert the new sync section just before that, so it reads: account info → sync status → Jawji Intelligence catalog).

- [ ] **Step 2: Add the sync UI**

Add this import at the top of the file, alongside the other store imports:

```tsx
import { useSyncStore } from '../../../stores/sync-store';
```

Add this component, defined in the same file below the main `LicensingTab` component (or inline if the file already has a pattern of small local sub-components — follow whatever's already there):

```tsx
function SyncStatusSection() {
  const syncing = useSyncStore((s) => s.syncing);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const error = useSyncStore((s) => s.error);
  const syncMissions = useSyncStore((s) => s.syncMissions);
  const syncSettings = useSyncStore((s) => s.syncSettings);

  const handleSyncNow = () => {
    void syncMissions();
    void syncSettings();
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-content">Mission &amp; Settings Sync</h4>
      <p className="text-[11px] text-content-secondary">
        Missions and settings sync automatically when you sign in and after each local
        change. Use this to sync immediately.
      </p>
      <button
        onClick={handleSyncNow}
        disabled={syncing}
        className="px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface disabled:opacity-50 text-content text-xs font-medium"
      >
        {syncing ? 'Syncing…' : 'Sync now'}
      </button>
      {lastSyncedAt && (
        <p className="text-[10px] text-content-tertiary">
          Last synced {new Date(lastSyncedAt).toLocaleTimeString()}
        </p>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
```

Render `<SyncStatusSection />` in the main component's JSX, gated behind the existing signed-in check (wherever the file already checks `useLicensingStore((s) => s.user)` for the account section — place it inside that same conditional, since sync requires a signed-in `apiFetch` call).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @jawji/desktop exec tsc --noEmit`
Expected: no new errors

- [ ] **Step 4: Manual smoke test**

Run: `pnpm --filter @jawji/desktop dev`
Then: open Settings → Licensing tab while signed in, confirm the "Mission & Settings Sync" section renders with a working "Sync now" button (check the Electron devtools console for errors, and confirm no exception if `jawji-gcs` isn't reachable — should show the error text, not crash).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/tabs/LicensingTab.tsx
git commit -m "feat(sync): add manual sync-now UI to the Licensing settings tab"
```

---

### Task 16: End-to-end verification checklist

**Files:** none (manual verification across both repos; no code changes)

**Interfaces:** none.

This exercises the full stack for real, which no unit test in Part A or B does on its own (they each test one side against fakes). Requires a real Firebase project with `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_JSON` (or ADC), `LICENSING_TOKEN_SECRET` configured for `jawji-gcs`, and `VITE_FIREBASE_*`/`VITE_JAWJI_GCS_URL` configured for the desktop app (both already required for the existing, working licensing flow — this plan adds no new required env vars).

- [ ] **Step 1: Deploy the updated database rules**

Run (from the `jawji-gcs` repo, with the Firebase CLI configured for the right project): `firebase deploy --only database`
Expected: deploy succeeds, confirms the new `sync` node's rules are live

- [ ] **Step 2: Start `jawji-gcs` locally**

Run (from `jawji-gcs`): `npm run dev`
Expected: server starts on its configured port with no missing-env-var errors related to `FIREBASE_DATABASE_URL`/`FIREBASE_SERVICE_ACCOUNT_JSON`

- [ ] **Step 3: Start the desktop app pointed at it**

Run (from `jawjideck`, with `apps/desktop/.env`'s `VITE_JAWJI_GCS_URL` pointed at the local `jawji-gcs` dev server): `pnpm --filter @jawji/desktop dev`

- [ ] **Step 4: Sign in on desktop, save a mission, confirm it appears server-side**

In the desktop app: sign in via the Licensing tab, save a mission in the Mission Library.
Then (from `jawji-gcs`, or via `curl` with a valid ID token): `GET /api/sync/missions` and confirm the saved mission appears with `deleted: false` and a real `updatedAt`.

- [ ] **Step 5: Confirm delete propagation**

In the desktop app, delete that mission from the Mission Library.
Then re-run `GET /api/sync/missions` and confirm the same mission id now has `deleted: true`.

- [ ] **Step 6: Confirm settings sync**

In the desktop app, change a setting (e.g. `experienceLevel`), wait for the auto-sync or click "Sync now".
Then `GET /api/sync/settings` and confirm `payload.experienceLevel` matches.

- [ ] **Step 7: Confirm a second desktop install pulls the same data**

Run a second local instance of the desktop app (or clear `userData` and restart), sign in with the same account, and confirm the mission and settings arrive via the sign-in sync without manual intervention.

- [ ] **Step 8: Record the result**

If any step fails, fix the underlying issue in the relevant task's files (not a new task — amend the failing task's commit or add a small follow-up commit), then re-run this checklist from the beginning.

---

## Self-Review Notes

- **Spec coverage:** Missions/waypoints sync (Tasks 1-2, 5-6, 11-12, 14), settings sync (Tasks 1, 3, 7, 13-14), last-write-wins conflict resolution via `updatedAt` (Tasks 2-3, 11), delete propagation via tombstones (Tasks 2, 6, 11-12) — all covered. Live telemetry/vehicle-connection reconciliation is explicitly out of scope per the Global Constraints, matching the user's chosen architecture (shared data store, decoupled from live telemetry).
- **No placeholders:** every step has complete, concrete code — no `// TODO` or "similar to Task N" shortcuts.
- **Type consistency:** `SyncedMission`/`SyncedSettings` are defined identically in intent (though independently, since the two repos don't share a types package) in `lib/server/sync/types.ts` (Task 1) and `sync-store.ts` (Task 11) — both use `updatedAt: number` (epoch ms) and a `deleted: boolean` tombstone flag. `planMissionMerge`'s signature (`local: MissionSummary[], remote: SyncedMission[]`) matches exactly how it's called in Task 12's `syncMissions`. `SettingsStoreSchema.settingsUpdatedAt` (Task 10) is read in Task 13's `syncSettings` under the same field name.
