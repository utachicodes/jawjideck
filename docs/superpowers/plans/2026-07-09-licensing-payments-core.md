# Licensing & Payments Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared licensing/subscription/entitlement backend in jawji-gcs that will gate the official Jawji product experience, following the approved design spec at `docs/superpowers/specs/2026-07-09-licensing-payments-core-design.md`.

**Architecture:** A `lib/server/licensing/` module in jawji-gcs's existing Next.js backend. Pure logic (activation codes, entitlement computation, token signing) is written against an injected `LicensingDb` interface so it's fully unit-testable without a live database, mirroring the dependency-injection pattern already proven in jawji-orchestrator. A concrete `RealtimeLicensingDb` implementation wires that interface to Firebase Admin SDK's Realtime Database. New `app/api/licensing/*` routes expose it, reusing the existing `requireApiAuth` helper.

**Tech Stack:** TypeScript, Next.js App Router API routes, Firebase Admin SDK (`firebase-admin/database`, not Firestore), Node's built-in `crypto` for token signing (no new signing library), Vitest (new to this repo — no test framework exists in jawji-gcs today).

## Global Constraints

- **Storage is Firebase Realtime Database, not Firestore.** The approved spec assumed Firestore; verified against the actual codebase that jawji-gcs migrated away from Firestore and Realtime Database is "the system of record for org/drone/mission data" (`lib/firebase.ts` comment, `lib/realtime-db-service.ts` header). All tasks below use Realtime Database paths instead of Firestore collections. The spec's entities (User/Subscription/License/ActivationCode) and their fields are unchanged — only the storage technology.
- **Data model stays user-scoped (`ownerUid`), not org-scoped**, matching exactly what was approved in the spec. The existing `orgs/{orgId}` structure in `database.rules.json` is not touched by this plan — integrating licensing with orgs is out of scope, not part of what was designed.
- **No new database technology beyond what's already used.** Do not add Firestore, do not add a new database product.
- **No new signing/JWT library.** Entitlement tokens are signed with HMAC-SHA256 via Node's built-in `crypto` module, not a JWT library — simplest thing that satisfies "signed, offline-verifiable."
- **Vitest is new to this repo.** jawji-gcs has zero existing tests and no test framework configured. This plan introduces it, scoped narrowly to the new `lib/server/licensing/` code.
- **Payment provider is abstracted and unimplemented beyond `ManualPaymentProvider`**, per the spec's explicit deferral of the real processor choice.
- **`requireApiAuth` from `lib/server/api-auth.ts` is the existing auth helper** — use it exactly as `app/api/drone/command/route.ts` does, don't invent a new auth pattern.
- **Admin SDK initialization follows the lazy-init pattern already established in `lib/server/firebase-auth.ts`** (dynamic import, cached promise, `getApps().length === 0` guard) — don't introduce a different initialization style for the Database admin client.

---

### Task 1: Add Vitest test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm test` runs Vitest against `lib/server/licensing/**/*.test.ts`.

- [ ] **Step 1: Install Vitest as a dev dependency**

```bash
cd "C:/Users/abdou/Documents/jawji-gcs-final/jawji-gcs"
npm install -D vitest
```

- [ ] **Step 2: Add the test script to package.json**

In `package.json`, inside `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lib/server/licensing/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Verify the test runner works with no tests yet**

Run: `npm test`
Expected: Vitest runs, reports "No test files found" (or exits 0 with zero suites) — this confirms the runner itself is wired correctly before any real tests exist.

- [ ] **Step 5: Commit**

```bash
git add package.json vitest.config.ts package-lock.json
git commit -m "Add Vitest test infrastructure for the licensing module"
```

---

### Task 2: Licensing types and the LicensingDb interface

**Files:**
- Create: `lib/server/licensing/types.ts`

**Interfaces:**
- Produces: `Subscription`, `License`, `ActivationCode`, `EntitlementSnapshot`, `LicensingDb` — every later task imports these exact names.

- [ ] **Step 1: Write the types file**

```typescript
// lib/server/licensing/types.ts

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

export interface Subscription {
  uid: string;
  status: SubscriptionStatus;
  trialEndsAt: number | null;
  currentPeriodEnd: number | null;
  createdAt: number;
  updatedAt: number;
}

export type LicenseType = 'subscription' | 'orchestrator' | 'intelligence-module';
export type LicenseStatus = 'unredeemed' | 'active' | 'revoked';

export interface License {
  id: string;
  ownerUid: string | null;
  type: LicenseType;
  moduleId: string | null;
  boundHardwareId: string | null;
  status: LicenseStatus;
  createdAt: number;
  activatedAt: number | null;
}

export interface ActivationCode {
  code: string;
  licenseId: string;
  redeemed: boolean;
  createdAt: number;
  redeemedAt: number | null;
}

export interface EntitlementSnapshot {
  uid: string;
  subscription: Subscription;
  licenses: License[];
}

/**
 * Storage interface every piece of licensing logic in this module is
 * written against, instead of importing a database client directly. Lets
 * the pure logic (codes.ts, entitlements.ts) be unit tested with an
 * in-memory fake, and keeps exactly one place (RealtimeLicensingDb) that
 * knows about Firebase Admin SDK at all.
 */
export interface LicensingDb {
  getSubscription(uid: string): Promise<Subscription | null>;
  createTrialSubscription(uid: string, trialDays: number, now: number): Promise<Subscription>;
  getLicensesByOwner(uid: string): Promise<License[]>;
  createLicense(license: Omit<License, 'id'>): Promise<License>;
  getLicenseById(licenseId: string): Promise<License | null>;
  updateLicense(licenseId: string, patch: Partial<Omit<License, 'id'>>): Promise<void>;
  getActivationCode(code: string): Promise<ActivationCode | null>;
  createActivationCode(code: string, licenseId: string, now: number): Promise<void>;
  markCodeRedeemed(code: string, now: number): Promise<void>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "C:/Users/abdou/Documents/jawji-gcs-final/jawji-gcs" && npx tsc --noEmit lib/server/licensing/types.ts --module esnext --target es2022 --moduleResolution bundler`
Expected: no errors (this is a types-only file, no imports to resolve).

- [ ] **Step 3: Commit**

```bash
git add lib/server/licensing/types.ts
git commit -m "Add licensing types and the LicensingDb interface"
```

---

### Task 3: Activation code generation and redemption

**Files:**
- Create: `lib/server/licensing/codes.ts`
- Create: `lib/server/licensing/codes.test.ts`
- Create: `lib/server/licensing/test-helpers/in-memory-db.ts`

**Interfaces:**
- Consumes: `LicensingDb`, `License`, `ActivationCode` from `types.ts`.
- Produces: `generateActivationCode(existingCodeCheck: (code: string) => Promise<boolean>): Promise<string>`, `redeemCode(db: LicensingDb, code: string, uid: string, hardwareId?: string): Promise<License>`. Later tasks (entitlements.ts, the activate route) call `redeemCode` by this exact signature.

- [ ] **Step 1: Write the in-memory fake LicensingDb (test helper, not a test itself)**

```typescript
// lib/server/licensing/test-helpers/in-memory-db.ts
import type { LicensingDb, Subscription, License, ActivationCode } from '../types.js';

export function createInMemoryLicensingDb(): LicensingDb {
  const subscriptions = new Map<string, Subscription>();
  const licenses = new Map<string, License>();
  const codes = new Map<string, ActivationCode>();
  let nextLicenseId = 1;

  return {
    async getSubscription(uid) {
      return subscriptions.get(uid) ?? null;
    },
    async createTrialSubscription(uid, trialDays, now) {
      const sub: Subscription = {
        uid,
        status: 'trialing',
        trialEndsAt: now + trialDays * 24 * 60 * 60 * 1000,
        currentPeriodEnd: null,
        createdAt: now,
        updatedAt: now,
      };
      subscriptions.set(uid, sub);
      return sub;
    },
    async getLicensesByOwner(uid) {
      return [...licenses.values()].filter((l) => l.ownerUid === uid);
    },
    async createLicense(license) {
      const id = `license-${nextLicenseId++}`;
      const full: License = { ...license, id };
      licenses.set(id, full);
      return full;
    },
    async getLicenseById(licenseId) {
      return licenses.get(licenseId) ?? null;
    },
    async updateLicense(licenseId, patch) {
      const existing = licenses.get(licenseId);
      if (!existing) throw new Error(`No license ${licenseId}`);
      licenses.set(licenseId, { ...existing, ...patch });
    },
    async getActivationCode(code) {
      return codes.get(code) ?? null;
    },
    async createActivationCode(code, licenseId, now) {
      codes.set(code, { code, licenseId, redeemed: false, createdAt: now, redeemedAt: null });
    },
    async markCodeRedeemed(code, now) {
      const existing = codes.get(code);
      if (!existing) throw new Error(`No code ${code}`);
      codes.set(code, { ...existing, redeemed: true, redeemedAt: now });
    },
  };
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// lib/server/licensing/codes.test.ts
import { describe, it, expect } from 'vitest';
import { generateActivationCode, redeemCode } from './codes.js';
import { createInMemoryLicensingDb } from './test-helpers/in-memory-db.js';

describe('generateActivationCode', () => {
  it('produces a 13-character code from an unambiguous alphabet', async () => {
    const code = await generateActivationCode(async () => false);
    expect(code).toHaveLength(13);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/); // excludes 0/O, 1/I/L
  });

  it('retries on collision', async () => {
    let calls = 0;
    const code = await generateActivationCode(async () => {
      calls += 1;
      return calls === 1; // first generated code "collides", second doesn't
    });
    expect(code).toHaveLength(13);
    expect(calls).toBe(2);
  });
});

describe('redeemCode', () => {
  it('redeems an unredeemed code, activates the license, and marks the code redeemed', async () => {
    const db = createInMemoryLicensingDb();
    const license = await db.createLicense({
      ownerUid: null,
      type: 'intelligence-module',
      moduleId: 'custom-detection',
      boundHardwareId: null,
      status: 'unredeemed',
      createdAt: Date.now(),
      activatedAt: null,
    });
    await db.createActivationCode('ABCDEFGHJKLMN', license.id, Date.now());

    const activated = await redeemCode(db, 'ABCDEFGHJKLMN', 'user-1');

    expect(activated.status).toBe('active');
    expect(activated.ownerUid).toBe('user-1');
    const code = await db.getActivationCode('ABCDEFGHJKLMN');
    expect(code!.redeemed).toBe(true);
  });

  it('binds boundHardwareId only for orchestrator licenses', async () => {
    const db = createInMemoryLicensingDb();
    const license = await db.createLicense({
      ownerUid: null,
      type: 'orchestrator',
      moduleId: null,
      boundHardwareId: null,
      status: 'unredeemed',
      createdAt: Date.now(),
      activatedAt: null,
    });
    await db.createActivationCode('ORCHDRONE0001', license.id, Date.now());

    const activated = await redeemCode(db, 'ORCHDRONE0001', 'user-1', 'fc-uid-abc123');

    expect(activated.boundHardwareId).toBe('fc-uid-abc123');
  });

  it('rejects a hardwareId supplied for a non-orchestrator license', async () => {
    const db = createInMemoryLicensingDb();
    const license = await db.createLicense({
      ownerUid: null,
      type: 'subscription',
      moduleId: null,
      boundHardwareId: null,
      status: 'unredeemed',
      createdAt: Date.now(),
      activatedAt: null,
    });
    await db.createActivationCode('SUBCODE000001', license.id, Date.now());

    await expect(redeemCode(db, 'SUBCODE000001', 'user-1', 'fc-uid-abc123')).rejects.toThrow(
      'hardwareId is only valid for orchestrator licenses'
    );
  });

  it('rejects redeeming a code that does not exist', async () => {
    const db = createInMemoryLicensingDb();
    await expect(redeemCode(db, 'DOESNOTEXIST1', 'user-1')).rejects.toThrow('code_not_found');
  });

  it('rejects redeeming an already-redeemed code', async () => {
    const db = createInMemoryLicensingDb();
    const license = await db.createLicense({
      ownerUid: 'user-1',
      type: 'subscription',
      moduleId: null,
      boundHardwareId: null,
      status: 'active',
      createdAt: Date.now(),
      activatedAt: Date.now(),
    });
    await db.createActivationCode('ALREADYUSED01', license.id, Date.now());
    await db.markCodeRedeemed('ALREADYUSED01', Date.now());

    await expect(redeemCode(db, 'ALREADYUSED01', 'user-2')).rejects.toThrow('code_already_redeemed');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd "C:/Users/abdou/Documents/jawji-gcs-final/jawji-gcs" && npm test`
Expected: FAIL — `codes.ts` does not exist yet.

- [ ] **Step 4: Write the implementation**

```typescript
// lib/server/licensing/codes.ts
import type { LicensingDb, License } from './types.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes 0/O, 1/I/L
const CODE_LENGTH = 13;

function randomCode(): string {
  let result = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    result += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return result;
}

/**
 * Generates a 13-character activation code, retrying on collision.
 * existingCodeCheck should return true if the code is already in use.
 */
export async function generateActivationCode(
  existingCodeCheck: (code: string) => Promise<boolean>
): Promise<string> {
  for (;;) {
    const candidate = randomCode();
    const collides = await existingCodeCheck(candidate);
    if (!collides) return candidate;
  }
}

export async function redeemCode(
  db: LicensingDb,
  code: string,
  uid: string,
  hardwareId?: string
): Promise<License> {
  const activationCode = await db.getActivationCode(code);
  if (!activationCode) {
    throw new Error('code_not_found');
  }
  if (activationCode.redeemed) {
    throw new Error('code_already_redeemed');
  }

  const license = await db.getLicenseById(activationCode.licenseId);
  if (!license) {
    throw new Error('code_not_found');
  }

  if (hardwareId && license.type !== 'orchestrator') {
    throw new Error('hardwareId is only valid for orchestrator licenses');
  }

  const now = Date.now();
  const patch: Partial<Omit<License, 'id'>> = {
    ownerUid: uid,
    status: 'active',
    activatedAt: now,
  };
  if (license.type === 'orchestrator' && hardwareId) {
    patch.boundHardwareId = hardwareId;
  }

  await db.updateLicense(license.id, patch);
  await db.markCodeRedeemed(code, now);

  return { ...license, ...patch };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "C:/Users/abdou/Documents/jawji-gcs-final/jawji-gcs" && npm test`
Expected: PASS, all 6 tests in `codes.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/server/licensing/codes.ts lib/server/licensing/codes.test.ts lib/server/licensing/test-helpers/in-memory-db.ts
git commit -m "Add activation code generation and redemption logic"
```

---

### Task 4: Entitlement token signing

**Files:**
- Create: `lib/server/licensing/token.ts`
- Create: `lib/server/licensing/token.test.ts`

**Interfaces:**
- Consumes: `EntitlementSnapshot` from `types.ts`.
- Produces: `signEntitlementToken(snapshot: EntitlementSnapshot, secret: string): string`, `verifyEntitlementToken(token: string, secret: string): EntitlementSnapshot | null`.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/server/licensing/token.test.ts
import { describe, it, expect } from 'vitest';
import { signEntitlementToken, verifyEntitlementToken } from './token.js';
import type { EntitlementSnapshot } from './types.js';

const SECRET = 'test-secret-do-not-use-in-prod';

function fakeSnapshot(): EntitlementSnapshot {
  return {
    uid: 'user-1',
    subscription: {
      uid: 'user-1',
      status: 'trialing',
      trialEndsAt: Date.now() + 1000000,
      currentPeriodEnd: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    licenses: [],
  };
}

describe('signEntitlementToken / verifyEntitlementToken', () => {
  it('round-trips a snapshot through sign and verify', () => {
    const snapshot = fakeSnapshot();
    const token = signEntitlementToken(snapshot, SECRET);
    const verified = verifyEntitlementToken(token, SECRET);
    expect(verified).toEqual(snapshot);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signEntitlementToken(fakeSnapshot(), SECRET);
    const verified = verifyEntitlementToken(token, 'wrong-secret');
    expect(verified).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = signEntitlementToken(fakeSnapshot(), SECRET);
    const [payload, signature] = token.split('.');
    const tamperedPayload = Buffer.from('{"uid":"attacker"}').toString('base64url');
    const tampered = `${tamperedPayload}.${signature}`;
    expect(verifyEntitlementToken(tampered, SECRET)).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifyEntitlementToken('not-a-real-token', SECRET)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "C:/Users/abdou/Documents/jawji-gcs-final/jawji-gcs" && npm test`
Expected: FAIL — `token.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/server/licensing/token.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EntitlementSnapshot } from './types.js';

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signEntitlementToken(snapshot: EntitlementSnapshot, secret: string): string {
  const payload = Buffer.from(JSON.stringify(snapshot)).toString('base64url');
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyEntitlementToken(token: string, secret: string): EntitlementSnapshot | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;

  const expectedSignature = sign(payload, secret);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json) as EntitlementSnapshot;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "C:/Users/abdou/Documents/jawji-gcs-final/jawji-gcs" && npm test`
Expected: PASS, all 4 tests in `token.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/server/licensing/token.ts lib/server/licensing/token.test.ts
git commit -m "Add HMAC-signed entitlement token signing and verification"
```

---

### Task 5: Entitlements computation (trial auto-start)

**Files:**
- Create: `lib/server/licensing/entitlements.ts`
- Create: `lib/server/licensing/entitlements.test.ts`

**Interfaces:**
- Consumes: `LicensingDb`, `EntitlementSnapshot` from `types.ts`; `signEntitlementToken` from `token.ts`.
- Produces: `getEntitlements(db: LicensingDb, uid: string, now?: number): Promise<EntitlementSnapshot>`, `issueEntitlementToken(snapshot: EntitlementSnapshot, secret: string): string` (thin re-export of `signEntitlementToken`, kept as its own name so callers of the entitlements module don't need to know token.ts exists).

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/server/licensing/entitlements.test.ts
import { describe, it, expect } from 'vitest';
import { getEntitlements } from './entitlements.js';
import { createInMemoryLicensingDb } from './test-helpers/in-memory-db.js';

describe('getEntitlements', () => {
  it('auto-starts a 14-day trial for a user with no subscription yet', async () => {
    const db = createInMemoryLicensingDb();
    const now = Date.now();

    const snapshot = await getEntitlements(db, 'user-1', now);

    expect(snapshot.subscription.status).toBe('trialing');
    expect(snapshot.subscription.trialEndsAt).toBe(now + 14 * 24 * 60 * 60 * 1000);
    expect(snapshot.licenses).toEqual([]);
  });

  it('does not overwrite an existing subscription', async () => {
    const db = createInMemoryLicensingDb();
    const now = Date.now();
    await db.createTrialSubscription('user-1', 14, now - 1000);

    const snapshot = await getEntitlements(db, 'user-1', now);

    expect(snapshot.subscription.createdAt).toBe(now - 1000);
  });

  it('includes the user\'s active licenses', async () => {
    const db = createInMemoryLicensingDb();
    const now = Date.now();
    await db.createTrialSubscription('user-1', 14, now);
    await db.createLicense({
      ownerUid: 'user-1',
      type: 'orchestrator',
      moduleId: null,
      boundHardwareId: 'fc-uid-abc',
      status: 'active',
      createdAt: now,
      activatedAt: now,
    });

    const snapshot = await getEntitlements(db, 'user-1', now);

    expect(snapshot.licenses).toHaveLength(1);
    expect(snapshot.licenses[0].type).toBe('orchestrator');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "C:/Users/abdou/Documents/jawji-gcs-final/jawji-gcs" && npm test`
Expected: FAIL — `entitlements.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/server/licensing/entitlements.ts
import type { LicensingDb, EntitlementSnapshot } from './types.js';
import { signEntitlementToken } from './token.js';

const TRIAL_DAYS = 14;

export async function getEntitlements(
  db: LicensingDb,
  uid: string,
  now: number = Date.now()
): Promise<EntitlementSnapshot> {
  let subscription = await db.getSubscription(uid);
  if (!subscription) {
    subscription = await db.createTrialSubscription(uid, TRIAL_DAYS, now);
  }
  const licenses = await db.getLicensesByOwner(uid);
  return { uid, subscription, licenses };
}

export function issueEntitlementToken(snapshot: EntitlementSnapshot, secret: string): string {
  return signEntitlementToken(snapshot, secret);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "C:/Users/abdou/Documents/jawji-gcs-final/jawji-gcs" && npm test`
Expected: PASS, all 3 tests in `entitlements.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/server/licensing/entitlements.ts lib/server/licensing/entitlements.test.ts
git commit -m "Add entitlements computation with trial auto-start"
```

---

### Task 6: Payment provider abstraction

**Files:**
- Create: `lib/server/licensing/payment-provider.ts`
- Create: `lib/server/licensing/payment-provider.test.ts`

**Interfaces:**
- Consumes: `LicensingDb`, `License`, `LicenseType` from `types.ts`; `generateActivationCode` from `codes.ts`.
- Produces: `PaymentProvider` interface, `createManualPaymentProvider(db: LicensingDb): PaymentProvider`. The API routes in Task 7 depend on this exact interface shape.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/server/licensing/payment-provider.test.ts
import { describe, it, expect } from 'vitest';
import { createManualPaymentProvider } from './payment-provider.js';
import { createInMemoryLicensingDb } from './test-helpers/in-memory-db.js';

describe('createManualPaymentProvider', () => {
  it('createCheckoutSession returns a checkout URL', async () => {
    const db = createInMemoryLicensingDb();
    const provider = createManualPaymentProvider(db);

    const result = await provider.createCheckoutSession('user-1', 'intelligence-module', 'custom-detection');

    expect(result.checkoutUrl).toContain('user-1');
  });

  it('handleWebhookEvent creates an unredeemed license and activation code', async () => {
    const db = createInMemoryLicensingDb();
    const provider = createManualPaymentProvider(db);

    const result = await provider.handleWebhookEvent(
      JSON.stringify({ eventId: 'evt_1', uid: 'user-1', licenseType: 'orchestrator' }),
      'unused-in-manual-provider'
    );

    expect(result).not.toBeNull();
    const license = await db.getLicenseById(result!.licenseId);
    expect(license!.status).toBe('unredeemed');
    expect(license!.type).toBe('orchestrator');
  });

  it('handleWebhookEvent is idempotent for a repeated event id', async () => {
    const db = createInMemoryLicensingDb();
    const provider = createManualPaymentProvider(db);
    const body = JSON.stringify({ eventId: 'evt_dup', uid: 'user-1', licenseType: 'subscription' });

    const first = await provider.handleWebhookEvent(body, 'unused');
    const second = await provider.handleWebhookEvent(body, 'unused');

    expect(second).toEqual(first);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "C:/Users/abdou/Documents/jawji-gcs-final/jawji-gcs" && npm test`
Expected: FAIL — `payment-provider.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/server/licensing/payment-provider.ts
import type { LicensingDb, LicenseType } from './types.js';
import { generateActivationCode } from './codes.js';

export interface PaymentProvider {
  createCheckoutSession(
    uid: string,
    licenseType: LicenseType,
    moduleId?: string
  ): Promise<{ checkoutUrl: string }>;
  handleWebhookEvent(
    rawBody: string,
    signature: string
  ): Promise<{ licenseId: string; uid: string } | null>;
}

/**
 * Manual, no-real-charge implementation of PaymentProvider. Satisfies the
 * interface end to end (checkout + webhook + idempotency) without a real
 * payment processor, per the spec's explicit deferral of that choice.
 * A real provider (e.g. NabooPay) replaces this without any change to the
 * API routes or licensing logic that consume PaymentProvider.
 */
export function createManualPaymentProvider(db: LicensingDb): PaymentProvider {
  const processedEvents = new Map<string, { licenseId: string; uid: string }>();

  return {
    async createCheckoutSession(uid, _licenseType, _moduleId) {
      return { checkoutUrl: `https://jawji.space/checkout/manual?uid=${encodeURIComponent(uid)}` };
    },

    async handleWebhookEvent(rawBody) {
      const event = JSON.parse(rawBody) as { eventId: string; uid: string; licenseType: LicenseType; moduleId?: string };

      const existing = processedEvents.get(event.eventId);
      if (existing) return existing;

      const license = await db.createLicense({
        ownerUid: null,
        type: event.licenseType,
        moduleId: event.moduleId ?? null,
        boundHardwareId: null,
        status: 'unredeemed',
        createdAt: Date.now(),
        activatedAt: null,
      });

      const code = await generateActivationCode(async (candidate) => {
        const found = await db.getActivationCode(candidate);
        return found !== null;
      });
      await db.createActivationCode(code, license.id, Date.now());

      const result = { licenseId: license.id, uid: event.uid };
      processedEvents.set(event.eventId, result);
      return result;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "C:/Users/abdou/Documents/jawji-gcs-final/jawji-gcs" && npm test`
Expected: PASS, all 3 tests in `payment-provider.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/server/licensing/payment-provider.ts lib/server/licensing/payment-provider.test.ts
git commit -m "Add PaymentProvider abstraction with a manual implementation"
```

---

### Task 7: Realtime Database admin wiring

**Files:**
- Create: `lib/server/licensing/admin-db.ts`
- Modify: `database.rules.json`

**Interfaces:**
- Consumes: `LicensingDb` from `types.ts`.
- Produces: `getRealtimeLicensingDb(): Promise<LicensingDb>` — the API routes in Task 8 call this to get the production database implementation.

- [ ] **Step 1: Add deny-all rules for the new /licensing path**

In `database.rules.json`, inside the top-level `"rules"` object, alongside the existing `"users"` and `"orgs"` keys, add:

```json
    "licensing": {
      ".read": false,
      ".write": false,
      "licenses": { ".indexOn": ["ownerUid"] },
      "$other": { ".validate": false }
    }
```

This mirrors the top-level `.read`/`.write: false` default already in the file — licensing data is only ever touched by the Admin SDK (which bypasses these rules entirely), never directly by a client. The explicit block makes that intent visible in the rules file itself rather than relying on the top-level default alone. The `.indexOn` matches the existing pattern used for `drones`/`lastSeen` elsewhere in this file — `getLicensesByOwner` (Task 7) queries `licenses` by `ownerUid`, so without this index Firebase logs a warning and falls back to an unindexed scan once the dataset grows.

- [ ] **Step 2: Write the admin database wiring**

This follows the exact lazy-init pattern already used in `lib/server/firebase-auth.ts`, applied to `firebase-admin/database` instead of `firebase-admin/auth`.

```typescript
// lib/server/licensing/admin-db.ts
import type { LicensingDb, Subscription, License, ActivationCode } from './types.js';

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
        console.error('[licensing/admin-db] FIREBASE_DATABASE_URL not set — cannot initialize');
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
          console.error('[licensing/admin-db] No service account credentials available');
          return null;
        }
      }
      return adminDatabase.getDatabase();
    } catch (err) {
      console.error('[licensing/admin-db] Failed to initialize firebase-admin database:', err);
      return null;
    }
  })();
  return dbPromise;
}

export async function getRealtimeLicensingDb(): Promise<LicensingDb> {
  const database = await getAdminDatabase();
  if (!database) {
    throw new Error('Licensing database is not available (missing Firebase admin credentials)');
  }

  return {
    async getSubscription(uid) {
      const snap = await database.ref(`licensing/subscriptions/${uid}`).get();
      return snap.exists() ? (snap.val() as Subscription) : null;
    },
    async createTrialSubscription(uid, trialDays, now) {
      const sub: Subscription = {
        uid,
        status: 'trialing',
        trialEndsAt: now + trialDays * 24 * 60 * 60 * 1000,
        currentPeriodEnd: null,
        createdAt: now,
        updatedAt: now,
      };
      await database.ref(`licensing/subscriptions/${uid}`).set(sub);
      return sub;
    },
    async getLicensesByOwner(uid) {
      const snap = await database.ref('licensing/licenses').orderByChild('ownerUid').equalTo(uid).get();
      if (!snap.exists()) return [];
      const val = snap.val() as Record<string, Omit<License, 'id'>>;
      return Object.entries(val).map(([id, license]) => ({ ...license, id }));
    },
    async createLicense(license) {
      const ref = database.ref('licensing/licenses').push();
      const id = ref.key as string;
      await ref.set(license);
      return { ...license, id };
    },
    async getLicenseById(licenseId) {
      const snap = await database.ref(`licensing/licenses/${licenseId}`).get();
      if (!snap.exists()) return null;
      return { ...(snap.val() as Omit<License, 'id'>), id: licenseId };
    },
    async updateLicense(licenseId, patch) {
      await database.ref(`licensing/licenses/${licenseId}`).update(patch);
    },
    async getActivationCode(code) {
      const snap = await database.ref(`licensing/activationCodes/${code}`).get();
      return snap.exists() ? (snap.val() as ActivationCode) : null;
    },
    async createActivationCode(code, licenseId, now) {
      const record: ActivationCode = { code, licenseId, redeemed: false, createdAt: now, redeemedAt: null };
      await database.ref(`licensing/activationCodes/${code}`).set(record);
    },
    async markCodeRedeemed(code, now) {
      await database.ref(`licensing/activationCodes/${code}`).update({ redeemed: true, redeemedAt: now });
    },
  };
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `cd "C:/Users/abdou/Documents/jawji-gcs-final/jawji-gcs" && npx tsc --noEmit`
Expected: no new errors introduced by this file (pre-existing unrelated errors in the repo, if any, are not this task's concern — only confirm nothing new is broken).

- [ ] **Step 4: Commit**

```bash
git add lib/server/licensing/admin-db.ts database.rules.json
git commit -m "Wire licensing module to Firebase Admin Realtime Database"
```

---

### Task 8: API routes

**Files:**
- Create: `app/api/licensing/entitlements/route.ts`
- Create: `app/api/licensing/checkout/route.ts`
- Create: `app/api/licensing/activate/route.ts`
- Create: `app/api/licensing/webhook/route.ts`

**Interfaces:**
- Consumes: `requireApiAuth` from `lib/server/api-auth.ts`; `getRealtimeLicensingDb` from `lib/server/licensing/admin-db.ts`; `getEntitlements`, `issueEntitlementToken` from `lib/server/licensing/entitlements.ts`; `redeemCode` from `lib/server/licensing/codes.ts`; `createManualPaymentProvider` from `lib/server/licensing/payment-provider.ts`.

- [ ] **Step 1: Write GET /api/licensing/entitlements**

```typescript
// app/api/licensing/entitlements/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/server/api-auth"
import { getRealtimeLicensingDb } from "@/lib/server/licensing/admin-db"
import { getEntitlements, issueEntitlementToken } from "@/lib/server/licensing/entitlements"

export async function GET(req: NextRequest) {
    const auth = await requireApiAuth(req)
    if (auth instanceof NextResponse) return auth

    try {
        const db = await getRealtimeLicensingDb()
        const snapshot = await getEntitlements(db, auth.user.uid)
        const secret = process.env.LICENSING_TOKEN_SECRET
        if (!secret) {
            throw new Error("LICENSING_TOKEN_SECRET not configured")
        }
        const token = issueEntitlementToken(snapshot, secret)

        return NextResponse.json({ snapshot, token })
    } catch (error) {
        console.error("[API] Licensing entitlements error:", error)
        return NextResponse.json(
            { error: "Failed to load entitlements", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        )
    }
}
```

- [ ] **Step 2: Write POST /api/licensing/checkout**

```typescript
// app/api/licensing/checkout/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/server/api-auth"
import { getRealtimeLicensingDb } from "@/lib/server/licensing/admin-db"
import { createManualPaymentProvider } from "@/lib/server/licensing/payment-provider"

const VALID_LICENSE_TYPES = ["subscription", "orchestrator", "intelligence-module"] as const

export async function POST(req: NextRequest) {
    const auth = await requireApiAuth(req)
    if (auth instanceof NextResponse) return auth

    try {
        const body = await req.json()
        const { licenseType, moduleId } = body

        if (!VALID_LICENSE_TYPES.includes(licenseType)) {
            return NextResponse.json(
                { error: `Invalid licenseType. Valid types: ${VALID_LICENSE_TYPES.join(", ")}` },
                { status: 400 }
            )
        }

        const db = await getRealtimeLicensingDb()
        const provider = createManualPaymentProvider(db)
        const result = await provider.createCheckoutSession(auth.user.uid, licenseType, moduleId)

        return NextResponse.json(result)
    } catch (error) {
        console.error("[API] Licensing checkout error:", error)
        return NextResponse.json(
            { error: "Failed to start checkout", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        )
    }
}
```

- [ ] **Step 3: Write POST /api/licensing/activate**

```typescript
// app/api/licensing/activate/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/server/api-auth"
import { getRealtimeLicensingDb } from "@/lib/server/licensing/admin-db"
import { redeemCode } from "@/lib/server/licensing/codes"
import { getEntitlements, issueEntitlementToken } from "@/lib/server/licensing/entitlements"

export async function POST(req: NextRequest) {
    const auth = await requireApiAuth(req)
    if (auth instanceof NextResponse) return auth

    try {
        const body = await req.json()
        const { code, hardwareId } = body

        if (!code || typeof code !== "string") {
            return NextResponse.json({ error: "Missing code" }, { status: 400 })
        }

        const db = await getRealtimeLicensingDb()

        try {
            await redeemCode(db, code, auth.user.uid, hardwareId)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Activation failed"
            if (message === "code_not_found" || message === "code_already_redeemed") {
                return NextResponse.json({ error: message }, { status: 400 })
            }
            throw err
        }

        const snapshot = await getEntitlements(db, auth.user.uid)
        const secret = process.env.LICENSING_TOKEN_SECRET
        if (!secret) {
            throw new Error("LICENSING_TOKEN_SECRET not configured")
        }
        const token = issueEntitlementToken(snapshot, secret)

        return NextResponse.json({ snapshot, token })
    } catch (error) {
        console.error("[API] Licensing activate error:", error)
        return NextResponse.json(
            { error: "Failed to activate code", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        )
    }
}
```

- [ ] **Step 4: Write POST /api/licensing/webhook**

```typescript
// app/api/licensing/webhook/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getRealtimeLicensingDb } from "@/lib/server/licensing/admin-db"
import { createManualPaymentProvider } from "@/lib/server/licensing/payment-provider"

// No requireApiAuth here on purpose: this endpoint is called by the payment
// provider, not a signed-in Jawji user. PaymentProvider.handleWebhookEvent
// is responsible for its own signature verification once a real provider
// replaces ManualPaymentProvider.
export async function POST(req: NextRequest) {
    try {
        const rawBody = await req.text()
        const signature = req.headers.get("x-webhook-signature") ?? ""

        const db = await getRealtimeLicensingDb()
        const provider = createManualPaymentProvider(db)
        const result = await provider.handleWebhookEvent(rawBody, signature)

        if (!result) {
            return NextResponse.json({ error: "Invalid webhook event" }, { status: 400 })
        }

        return NextResponse.json({ received: true })
    } catch (error) {
        console.error("[API] Licensing webhook error:", error)
        return NextResponse.json(
            { error: "Failed to process webhook", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        )
    }
}
```

- [ ] **Step 5: Verify the whole project typechecks and builds**

Run: `cd "C:/Users/abdou/Documents/jawji-gcs-final/jawji-gcs" && npx tsc --noEmit`
Expected: no errors from any file in `app/api/licensing/` or `lib/server/licensing/`.

Run: `cd "C:/Users/abdou/Documents/jawji-gcs-final/jawji-gcs" && npm test`
Expected: PASS, all tests across every task in this plan (17 tests total: 6 codes + 4 token + 3 entitlements + 3 payment-provider + 1 generateActivationCode collision — recount exact total when running).

- [ ] **Step 6: Commit**

```bash
git add app/api/licensing
git commit -m "Add licensing API routes: entitlements, checkout, activate, webhook"
```

---

## Self-review notes

- **Spec coverage:** every entity (User via Firebase Auth, Subscription, License, ActivationCode) is implemented; trial auto-start (Task 5), offline-cacheable signed token (Task 4), purchase/code/redeem separation (Tasks 3, 6, 8), payment provider abstraction (Task 6), the four API routes named in the spec (Task 8) are all covered. The spec's Non-goals (Orchestrator wiring, Intelligence itself, jawjideck's UI, a real payment processor, relicensing, bulk-purchase UI) have no corresponding tasks here, matching the spec.
- **Type consistency:** `LicensingDb` is defined once in Task 2 and used identically (same method names and signatures) by the in-memory fake (Task 3), `entitlements.ts` (Task 5), `payment-provider.ts` (Task 6), and `admin-db.ts` (Task 7) — checked against each task's code above.
- **Deviation from the approved spec, called out explicitly:** storage is Realtime Database, not Firestore, because the codebase had already migrated away from Firestore before this plan was written — see Global Constraints. Every other requirement in the spec is implemented as designed.
