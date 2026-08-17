/**
 * Renderer-side entitlement check. Uses the snapshot already in the zustand
 * store (written via LICENSING_CACHE after a main-process-verified fetch) so
 * no new IPC round-trip is needed. This is the primary enforcement layer for
 * the renderer; the main-process handlers also gate for defense-in-depth.
 */

import { useLicensingStore } from '../stores/licensing-store';
import type { EntitlementSnapshot, License, LicenseType, SubscriptionStatus } from '../stores/licensing-store';

export type PaidService =
  | 'ai-analysis'
  | 'cloud-sync'
  | 'intelligence-modules'
  | 'companion-provisioning'
  | 'orchestrator';

function isActiveSubscription(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

function isSubscriptionUnexpired(
  subscription: EntitlementSnapshot['subscription'],
  now: number
): boolean {
  if (!isActiveSubscription(subscription.status)) return false;
  const expires =
    subscription.status === 'trialing'
      ? subscription.trialEndsAt
      : subscription.currentPeriodEnd;
  return expires == null || now < expires;
}

function hasActiveLicense(
  licenses: License[],
  type: LicenseType,
  moduleId?: string
): boolean {
  return licenses.some(
    (l) =>
      l.status === 'active' &&
      l.type === type &&
      (moduleId === undefined || l.moduleId === moduleId)
  );
}

/**
 * Central fail-closed policy: maps a product service to the entitlement that
 * unlocks it. Every paid/cloud feature checks this before doing any real work.
 * No token → false, expired subscription → false, invalid snapshot → false.
 */
export function isServiceEntitled(
  service: PaidService,
  snapshot: EntitlementSnapshot | null | undefined,
  now: number = Date.now()
): boolean {
  if (!snapshot) return false;

  const subActive = isSubscriptionUnexpired(snapshot.subscription, now);
  const licenses = snapshot.licenses ?? [];

  switch (service) {
    case 'ai-analysis':
    case 'cloud-sync':
    case 'companion-provisioning':
      return subActive;

    case 'intelligence-modules':
      return subActive || hasActiveLicense(licenses, 'intelligence-module');

    case 'orchestrator':
      return hasActiveLicense(licenses, 'orchestrator');

    default:
      return false;
  }
}

/**
 * Convenience hook-agnostic check. Returns true when the service is entitled.
 * The renderer can use this before making any paid-API call.
 */
export function isCurrentServiceEntitled(service: PaidService): boolean {
  const snapshot = useLicensingStore.getState().entitlements;
  return isServiceEntitled(service, snapshot);
}
