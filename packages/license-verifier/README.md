# @jawji/license-verifier

Shared, zero-dependency package for offline Ed25519 entitlement-token verification and fail-closed service gating. Used by jawjideck (Electron desktop), jawji-controller (companion agent), and jawji-orchestrator (autonomy runtime).

## What this package does

1. **Verifies Ed25519-signed entitlement tokens** issued by jawji-gcs without contacting the server. The public key is embedded at build time; the token is verified locally, offline.
2. **Maps product services to entitlement requirements** via a central `isServiceEntitled()` policy — every paid/cloud feature checks this before doing any real work.
3. **Enforces fail-closed behavior**: no public key → all services denied; expired subscription → paid services denied; tampered token → denied.

## Token format

```
<base64url(JSON payload)>.<base64url(64-byte Ed25519 signature)>
```

Payload (`EntitlementSnapshot`):

```typescript
{
  uid: string;
  subscription: {
    status: 'trialing' | 'active' | 'past_due' | 'canceled';
    trialEndsAt: number | null;
    currentPeriodEnd: number | null;
  };
  licenses: License[];
  issuedAt: number;
}
```

## Services and entitlement mapping

| Service | Requires |
|---------|----------|
| `ai-analysis` | Active subscription |
| `cloud-sync` | Active subscription |
| `intelligence-modules` | Active subscription OR active `intelligence-module` license |
| `companion-provisioning` | Active subscription |
| `orchestrator` | Active `orchestrator` license |

## API

### `verifyEntitlementToken(token, publicKeyInput)`

Returns `EntitlementSnapshot | null`. Returns `null` on any failure (expired, tampered, wrong key).

```typescript
import { verifyEntitlementToken } from '@jawji/license-verifier';

const snapshot = verifyEntitlementToken(token, publicKeyBase64);
if (!snapshot) throw new Error('Invalid license');
```

### `isServiceEntitled(service, snapshot, now?)`

Returns `boolean`. Central fail-closed policy.

```typescript
import { isServiceEntitled } from '@jawji/license-verifier';

if (!isServiceEntitled('ai-analysis', snapshot)) {
  throw new Error('Subscription required');
}
```

### `hasActiveSubscription(snapshot, now?)`

Returns `boolean`. True when subscription status is `active` or `trialing` and not expired.

### `hasActiveLicense(licenses, type, moduleId?)`

Returns `boolean`. True when at least one matching license has `status: 'active'`.

## Build-time key injection

Each client binary embeds the Ed25519 public key at build time via a `define` in the build config:

```typescript
// electron.vite.config.ts (desktop)
define: {
  __JAWJI_LICENSE_PUBLIC_KEY__: JSON.stringify(
    process.env.JAWJI_LICENSE_PUBLIC_KEY ?? ''
  ),
}
```

Generate both keys with:

```bash
node tools/license-keys.mjs
```

This prints `LICENSE_SIGNING_PRIVATE_KEY` (server only) and `JAWJI_LICENSE_PUBLIC_KEY` (embedded in clients). Builds with no key ship empty — paid features fail closed.

## Tests

```bash
npx vitest run packages/license-verifier
```

19 tests covering token verification, entitlement policy, edge cases (expired, wrong key, revoked, trial status).
