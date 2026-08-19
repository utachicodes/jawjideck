import type { EntitlementSnapshot, License, ServiceName } from './types.js';

export function hasActiveSubscription(
  snapshot: EntitlementSnapshot | null | undefined,
  now: number = Date.now()
): boolean {
  const sub = snapshot?.subscription;
  if (!sub) return false;
  if (sub.status !== 'active' && sub.status !== 'trialing') return false;
  const expires = sub.status === 'trialing' ? sub.trialEndsAt : sub.currentPeriodEnd;
  if (expires != null && now >= expires) return false;
  return true;
}

export function hasActiveLicense(
  snapshot: EntitlementSnapshot | null | undefined,
  type: License['type'],
  moduleId?: string,
  now: number = Date.now()
): boolean {
  if (!snapshot?.licenses) return false;
  return snapshot.licenses.some(
    (l) =>
      l.status === 'active' &&
      l.type === type &&
      (moduleId === undefined || l.moduleId === moduleId)
  );
}

/**
 * Central fail-closed policy: maps a product service to the entitlement that
 * unlocks it. Every paid/cloud service returns false unless the verified
 * snapshot carries the matching active entitlement - no token, invalid
 * token, or expired entitlement all resolve to "not entitled".
 */
export function isServiceEntitled(
  snapshot: EntitlementSnapshot | null | undefined,
  service: ServiceName,
  now: number = Date.now()
): boolean {
  switch (service) {
    case 'orchestrator':
      return hasActiveLicense(snapshot, 'orchestrator', undefined, now);
    case 'intelligence-modules':
      return (
        hasActiveSubscription(snapshot, now) ||
        hasActiveLicense(snapshot, 'intelligence-module', undefined, now)
      );
    case 'ai-analysis':
    case 'cloud-sync':
    case 'companion-provisioning':
      return hasActiveSubscription(snapshot, now);
    default:
      return false;
  }
}
