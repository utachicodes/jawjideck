# Licensing & Payments Core — Design Spec

**Date:** 2026-07-09
**Status:** Approved for planning
**Scope:** The shared licensing/subscription/entitlement backend that gates the official Jawji product experience (jawjideck desktop, jawji-gcs web) and, as follow-up work outside this pass, will gate jawji-orchestrator activation and Jawji Intelligence marketplace modules.

## Problem

Jawji's business model is shifting from a fully free, anonymous, no-account desktop app to a subscription product, with two additional paid products (jawji-orchestrator, Jawji Intelligence) sold through the same account. None of the infrastructure for this exists yet: jawjideck has no login of any kind, jawji-gcs has Firebase Auth but no subscription/licensing concept, and there is no shared way to represent "this user/device is entitled to X."

## Constraints established during brainstorming

These are not implementation choices, they are hard constraints the design must satisfy, established explicitly with the user before any architecture was proposed:

1. **jawjideck stays GPL-3.0.** The user confirmed they hold full copyright authority over Jawji (they are the "Ruben M." named as sole copyright holder in the LICENSE file) and explicitly chose to keep the core GCS GPL-3.0 going forward rather than relicense it. This means the source remains freely buildable by anyone; a subscription check baked into the GPL binary is not an enforceable gate against a user willing to build from source. The model is therefore **open-core**: the source stays free, the *official product* (pre-built installers, account/login, desktop-web sync, marketplace access, license activation) is what the subscription actually gates.
2. **jawji-orchestrator is a separate program, not a Jawji fork.** It doesn't link against or copy Jawji GPL code, only talks to it over local network APIs, so its own licensing (closed/proprietary, per-drone) is unconstrained by Jawji's GPL-3.0 status. Making it closed-source is separate, already-decided follow-up work (out of scope for this pass — see Non-goals).
3. **Jawji Intelligence must ship as a genuine Module.** Jawji's own LICENSE contains a "Marketplace Module Exception" under GPL Section 7 permitting proprietary/closed-source Modules, provided they interact solely through the Official Module API, don't modify Jawji internals, and are distributed through an authorized marketplace. Intelligence modules must satisfy this to be legally distributable as paid closed-source add-ons. jawjideck already has a module system (`packages/module-sdk`, the existing AI Object Detection module) this can build on.
4. **One shared identity across desktop and web.** jawjideck and jawji-gcs use the same Firebase Auth project and the same account — a subscription or license purchased on one is visible and usable on the other.
5. **Offline is a first-class requirement, for both jawjideck and jawji-orchestrator**, not an edge case. Flight sites are frequently connectivity-dead. Neither the base app nor Orchestrator may hard-require a live network call to function once a valid entitlement has been established.
6. **A lapsed/expired entitlement never interrupts something already in progress.** For Orchestrator this means: check only at mission start, an active mission always finishes. The same "don't corrupt an in-progress session" principle applies to the base app: an expired cached token surfaces an honest "needs re-verification" state rather than hard-locking mid-session.
7. **One activation mechanism, reused everywhere.** Base subscription, Orchestrator licenses, and Intelligence module purchases all go through the same purchase-code-redeem flow, not three separate systems.

## Requirements (from brainstorming)

1. **Entities:** `User` (Firebase Auth identity), `Subscription` (the base plan: `trialing` / `active` / `past_due` / `canceled`), `License` (a generic purchasable entitlement — type `subscription` | `orchestrator` | `intelligence-module` — owned by a User, and for `orchestrator` specifically, bound to a flight-controller board UID once activated), `ActivationCode` (a 13-character code generated when a License is purchased, redeemed later, possibly on a different device).
2. **Trial:** a new User with no Subscription automatically gets a 14-day `trialing` Subscription on first entitlement check — no purchase or code needed for this.
3. **Purchase and activation are separate steps.** Buying a License produces an ActivationCode; redeeming that code (via `POST /api/licensing/activate`) is what actually grants the entitlement. This deliberately supports buying licenses in bulk (e.g. for a fleet) and distributing codes to be redeemed later, by someone else, on a different device.
4. **Signed, cacheable entitlement token.** After sign-in and after every successful entitlement change (activation, trial start, subscription renewal), the backend issues a signed token containing the user's subscription status/expiry and active licenses. Clients cache this locally and validate it offline without a network call, refreshing opportunistically whenever online.
5. **Payment processor is abstracted, not decided.** The user is evaluating NabooPay but explicitly deferred the decision. The design must not couple the licensing logic to a specific processor's API — a `PaymentProvider` interface with a stub/manual implementation is required so a real processor can be wired in later without touching the licensing module itself.
6. **Built inside jawji-gcs's existing Next.js backend**, not a new standalone service (Approach C from brainstorming): a `lib/server/licensing/` module with the actual logic isolated from route handlers, reusing the Firebase project and Railway deployment jawji-gcs already has. Chosen specifically so it *could* be extracted into its own service later if there's ever evidence it needs to be, without that being a rewrite — internal boundaries matter more here than the deployment topology.

## Non-goals (explicitly out of scope for this pass)

- **Actually wiring jawji-orchestrator to validate against this license server.** Orchestrator's own license-check code, its move to closed-source, and its consumption of the entitlement-token scheme are separate, later work — this pass only builds the backend Orchestrator will eventually call.
- **Building Jawji Intelligence itself** (the cloud inference service, the marketplace UI, the actual AI models). This pass only needs the licensing/entitlement primitives Intelligence will eventually be gated by.
- **jawjideck's Settings > Account UI, sign-in flow, and local token caching.** This pass is the backend; the desktop-side consumption of it is follow-up work, sequenced after this backend exists.
- **Choosing and integrating a real payment processor.** Explicitly deferred by the user. This pass builds the abstraction boundary only.
- **Any relicensing of jawjideck itself.** Explicitly declined by the user during brainstorming.
- **Fleet/bulk-purchase UI** (buying N Orchestrator licenses at once for a fleet). The data model supports one License per purchase; a bulk-purchase flow that creates several is a product-UI feature, not a backend primitive, and can be layered on later without changing this design.

## Architecture

### Data model (Firestore, reusing the existing Firebase project)

```
users/{uid}                          # Firebase Auth is the source of truth for identity;
                                      # no separate user profile document required by this design

subscriptions/{uid}                  # one per user
  status: 'trialing' | 'active' | 'past_due' | 'canceled'
  trialEndsAt: Timestamp | null
  currentPeriodEnd: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp

licenses/{licenseId}
  ownerUid: string | null            # null until an activation code is redeemed
  type: 'subscription' | 'orchestrator' | 'intelligence-module'
  moduleId: string | null            # set only when type = 'intelligence-module'
  boundHardwareId: string | null     # set only when type = 'orchestrator', after activation
  status: 'unredeemed' | 'active' | 'revoked'
  createdAt: Timestamp
  activatedAt: Timestamp | null

activationCodes/{code}               # code itself is the document id: 13 chars, uppercase alphanumeric
  licenseId: string
  redeemed: boolean
  createdAt: Timestamp
  redeemedAt: Timestamp | null
```

`activationCodes` is keyed by the code itself so redemption is a single document lookup, not a query. Codes are generated with a cryptographically random source, excluding visually ambiguous characters (`0`/`O`, `1`/`I`/`l`), 13 characters long as specified during brainstorming.

### `lib/server/licensing/` module (jawji-gcs)

- `codes.ts` — `generateActivationCode(): string`, `redeemCode(code: string, uid: string, hardwareId?: string): Promise<License>`. Owns the random-generation and redemption logic; the only place that touches the `activationCodes` collection. Since the code itself is the Firestore document id, `generateActivationCode` must check-and-retry on collision (write with a precondition that the document doesn't already exist, regenerate and retry on failure) rather than assume uniqueness — the actual collision probability at 13 characters from a 32-symbol alphabet is negligible, but the retry loop costs nothing and removes the assumption entirely.
- `entitlements.ts` — `getEntitlements(uid: string): Promise<EntitlementSnapshot>` (reads `subscriptions/{uid}` and `licenses` where `ownerUid == uid`, starting a trial subscription if none exists yet), `issueEntitlementToken(snapshot: EntitlementSnapshot): string` (signs a JWT-style token with the snapshot payload).
- `payment-provider.ts` — the abstraction:
  ```typescript
  export interface PaymentProvider {
    createCheckoutSession(uid: string, licenseType: License['type'], moduleId?: string): Promise<{ checkoutUrl: string }>;
    handleWebhookEvent(rawBody: string, signature: string): Promise<{ licenseId: string; uid: string } | null>;
  }
  ```
  This pass ships a `ManualPaymentProvider` implementation (an admin-triggered "mark this license as paid" path, no real charge), satisfying the interface so the rest of the system (routes, entitlement logic) never needs to change when a real provider is wired in.

### API routes (`app/api/licensing/*`)

- `GET /api/licensing/entitlements` — auth required (Firebase ID token). Calls `getEntitlements`, auto-starts a trial if none exists, returns the current `EntitlementSnapshot` plus a freshly signed token.
- `POST /api/licensing/checkout` — auth required. Body: `{ licenseType, moduleId? }`. Delegates to the configured `PaymentProvider.createCheckoutSession`.
- `POST /api/licensing/activate` — auth required. Body: `{ code, hardwareId? }`. Calls `redeemCode`, returns a refreshed `EntitlementSnapshot` + token.
- `POST /api/licensing/webhook` — no user auth (verified via the provider's own signature scheme instead). Delegates to `PaymentProvider.handleWebhookEvent`; on a valid event, marks the corresponding License `active` and its code `redeemed`. Idempotent: keyed by the event id the provider supplies, a duplicate delivery of the same event is a no-op.

## Data flow

1. Sign in via Firebase Auth (jawjideck or jawji-gcs — same identity either way).
2. Client calls `GET /api/licensing/entitlements`. No `subscriptions/{uid}` document exists yet → one is created with `status: 'trialing'`, `trialEndsAt: now + 14 days`.
3. Client caches the returned signed token locally. It's valid for offline use; the client re-checks opportunistically whenever it has connectivity, not on a fixed schedule that would require one.
4. To buy Orchestrator or an Intelligence module, the client calls `POST /api/licensing/checkout`, gets a checkout URL from the (currently manual) `PaymentProvider`, and completes payment there.
5. The provider's webhook fires `POST /api/licensing/webhook` → a `License` row is created (`status: 'unredeemed'`) and a matching `ActivationCode` is generated.
6. The code is delivered to the purchaser (out of scope for this pass exactly how — email, a confirmation page, etc.) and entered in-app via `POST /api/licensing/activate`, which redeems it, binds `boundHardwareId` if the license type is `orchestrator`, and returns a refreshed entitlement token.

## Error handling

- **Expired cached token, no connectivity:** the client (not this backend — see Non-goals) is responsible for surfacing an honest "needs re-verification, working from a stale entitlement" state rather than hard-locking. This backend's only obligation is that tokens carry an explicit, checkable expiry.
- **Invalid or already-redeemed code:** `POST /api/licensing/activate` returns a specific error (`code_not_found` / `code_already_redeemed`), never a generic failure, so the client can show an accurate message.
- **Redeeming a code with a `hardwareId` for a non-`orchestrator` license type:** rejected — `boundHardwareId` is only meaningful for `orchestrator` licenses, silently accepting and ignoring it would hide a client bug.
- **Webhook delivered more than once for the same event:** idempotent by design (see Architecture) — the second delivery finds the License already `active` and the code already `redeemed`, and returns success without re-processing.
- **Webhook signature invalid:** rejected outright, never processed, regardless of payload contents.

## Testing

- Unit tests for `codes.ts` (generation produces the right length/character set, redemption transitions state correctly, redeeming an already-redeemed code fails) and `entitlements.ts` (trial auto-start, token contents match the underlying data) against a Firestore emulator — no real payment provider involved, since `PaymentProvider` is mocked.
- Unit tests for `ManualPaymentProvider` itself, confirming it satisfies the `PaymentProvider` interface contract (useful both as a real implementation for this pass and as a reference for whatever real provider replaces it later).
- One integration test exercising the full flow end to end: sign in (test Firebase user) → entitlements (trial starts) → checkout → simulated webhook → activate → entitlements again (reflects the new license).
