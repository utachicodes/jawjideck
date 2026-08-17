import { describe, it, expect } from 'vitest';
import { hasActiveSubscription, hasActiveLicense, isServiceEntitled } from './entitlement.js';
import type { EntitlementSnapshot, License, Subscription } from './types.js';

const NOW = 2_000_000_000_000;

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    uid: 'user-1',
    status: 'active',
    trialEndsAt: null,
    currentPeriodEnd: NOW + 1000,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function license(overrides: Partial<License> = {}): License {
  return {
    id: 'lic-1',
    ownerUid: 'user-1',
    type: 'orchestrator',
    moduleId: null,
    boundHardwareId: null,
    status: 'active',
    createdAt: 1,
    activatedAt: 1,
    ...overrides,
  };
}

function snapshot(overrides: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot {
  return {
    uid: 'user-1',
    subscription: subscription(),
    licenses: [],
    ...overrides,
  };
}

describe('hasActiveSubscription', () => {
  it('true for active without an expiry', () => {
    expect(hasActiveSubscription(snapshot({ subscription: subscription({ currentPeriodEnd: null }) }), NOW)).toBe(true);
  });
  it('true for trialing within the window', () => {
    expect(
      hasActiveSubscription(snapshot({ subscription: subscription({ status: 'trialing', trialEndsAt: NOW + 1000 }) }), NOW)
    ).toBe(true);
  });
  it('false for trialing past trialEndsAt', () => {
    expect(
      hasActiveSubscription(snapshot({ subscription: subscription({ status: 'trialing', trialEndsAt: NOW - 1 }) }), NOW)
    ).toBe(false);
  });
  it('false for active past currentPeriodEnd', () => {
    expect(
      hasActiveSubscription(snapshot({ subscription: subscription({ currentPeriodEnd: NOW - 1 }) }), NOW)
    ).toBe(false);
  });
  it('false for past_due / canceled / missing', () => {
    expect(hasActiveSubscription(snapshot({ subscription: subscription({ status: 'past_due' }) }), NOW)).toBe(false);
    expect(hasActiveSubscription(snapshot({ subscription: subscription({ status: 'canceled' }) }), NOW)).toBe(false);
    expect(hasActiveSubscription(null, NOW)).toBe(false);
    expect(hasActiveSubscription(undefined, NOW)).toBe(false);
  });
});

describe('hasActiveLicense', () => {
  it('matches type and status', () => {
    expect(hasActiveLicense(snapshot({ licenses: [license()] }), 'orchestrator')).toBe(true);
    expect(hasActiveLicense(snapshot({ licenses: [license()] }), 'subscription')).toBe(false);
    expect(hasActiveLicense(snapshot({ licenses: [license({ status: 'revoked' })] }), 'orchestrator')).toBe(false);
    expect(hasActiveLicense(snapshot({ licenses: [license({ status: 'unredeemed' })] }), 'orchestrator')).toBe(false);
  });
  it('filters by moduleId', () => {
    const l = license({ type: 'intelligence-module', moduleId: 'imagery' });
    expect(hasActiveLicense(snapshot({ licenses: [l] }), 'intelligence-module', 'imagery')).toBe(true);
    expect(hasActiveLicense(snapshot({ licenses: [l] }), 'intelligence-module', 'other')).toBe(false);
  });
  it('false with no licenses', () => {
    expect(hasActiveLicense(snapshot(), 'orchestrator')).toBe(false);
    expect(hasActiveLicense(null, 'orchestrator')).toBe(false);
  });
});

describe('isServiceEntitled (fail-closed policy)', () => {
  it('subscription-gated services require an active subscription', () => {
    const entitled = snapshot();
    expect(isServiceEntitled(entitled, 'ai-analysis', NOW)).toBe(true);
    expect(isServiceEntitled(entitled, 'cloud-sync', NOW)).toBe(true);
    expect(isServiceEntitled(entitled, 'companion-provisioning', NOW)).toBe(true);

    const lapsed = snapshot({ subscription: subscription({ status: 'canceled' }) });
    expect(isServiceEntitled(lapsed, 'ai-analysis', NOW)).toBe(false);
    expect(isServiceEntitled(lapsed, 'cloud-sync', NOW)).toBe(false);
    expect(isServiceEntitled(lapsed, 'companion-provisioning', NOW)).toBe(false);
  });

  it('no snapshot at all fails closed for every service', () => {
    for (const service of ['ai-analysis', 'cloud-sync', 'intelligence-modules', 'companion-provisioning', 'orchestrator'] as const) {
      expect(isServiceEntitled(null, service, NOW)).toBe(false);
      expect(isServiceEntitled(undefined, service, NOW)).toBe(false);
    }
  });

  it('orchestrator requires an active bound orchestrator license', () => {
    const withLic = snapshot({ licenses: [license({ type: 'orchestrator', boundHardwareId: 'hw-1' })] });
    expect(isServiceEntitled(withLic, 'orchestrator', NOW)).toBe(true);
    expect(isServiceEntitled(snapshot(), 'orchestrator', NOW)).toBe(false);
    expect(isServiceEntitled(snapshot({ licenses: [license({ type: 'orchestrator', status: 'revoked' })] }), 'orchestrator', NOW)).toBe(false);
  });

  it('intelligence modules open with a subscription or a module license', () => {
    expect(isServiceEntitled(snapshot(), 'intelligence-modules', NOW)).toBe(true);
    const noSub = snapshot({ subscription: subscription({ status: 'canceled' }) });
    expect(isServiceEntitled(noSub, 'intelligence-modules', NOW)).toBe(false);
    const withModule = snapshot({ subscription: subscription({ status: 'canceled' }), licenses: [license({ type: 'intelligence-module' })] });
    expect(isServiceEntitled(withModule, 'intelligence-modules', NOW)).toBe(true);
  });
});
