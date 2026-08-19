import {
  verifyEntitlementToken,
  isServiceEntitled,
  SERVICE_NAMES,
  type ServiceName,
  type EntitlementSnapshot,
} from '@jawji/license-verifier';
import type { StoredLicenseCache } from './license-credentials.js';

export class LicenseGateError extends Error {
  readonly service: ServiceName;
  readonly reason: string;

  constructor(service: ServiceName, reason: string) {
    super(`License required for '${service}': ${reason}`);
    this.name = 'LicenseGateError';
    this.service = service;
    this.reason = reason;
  }
}

export interface LicenseState {
  configured: boolean;
  verified: boolean;
  snapshot: EntitlementSnapshot | null;
  cachedAt: number | null;
  services: Record<ServiceName, boolean>;
}

export interface LicenseGateDeps {
  publicKey: string;
  readCredentials: () => StoredLicenseCache | null | Promise<StoredLicenseCache | null>;
  now?: () => number;
}

const emptyState = (): LicenseState => ({
  configured: false,
  verified: false,
  snapshot: null,
  cachedAt: null,
  services: Object.fromEntries(SERVICE_NAMES.map((s) => [s, false])) as Record<ServiceName, boolean>,
});

/**
 * Fail-closed license gate. Every paid/cloud feature must pass through
 * requireService() before doing anything. Enforcement is purely local:
 * the public key is compiled into the binary at build time, and the cached
 * token is verified with it (Ed25519) - so offline still works, and a
 * missing key, missing credential, bad signature, or lapsed entitlement all
 * resolve to "not entitled".
 */
export function createLicenseGate(deps: LicenseGateDeps) {
  const now = deps.now ?? (() => Date.now());

  async function getState(): Promise<LicenseState> {
    if (!deps.publicKey) return emptyState();

    const credentials = await deps.readCredentials();
    const token = credentials?.token;
    const snapshot = token ? verifyEntitlementToken(token, deps.publicKey) : null;

    const services = Object.fromEntries(
      SERVICE_NAMES.map((s) => [s, isServiceEntitled(snapshot, s, now())])
    ) as Record<ServiceName, boolean>;

    return {
      configured: true,
      verified: snapshot !== null,
      snapshot,
      cachedAt: credentials?.cachedAt ?? null,
      services,
    };
  }

  async function requireService(service: ServiceName): Promise<void> {
    const state = await getState();
    if (state.services[service]) return;

    let reason = 'no valid entitlement';
    if (!state.configured) reason = 'licensing key not embedded in this build';
    else if (!state.verified) reason = 'credential missing or failed verification';
    else reason = 'entitlement not active or expired';
    throw new LicenseGateError(service, reason);
  }

  return { getState, requireService, isEntitled: async (service: ServiceName) => (await getState()).services[service] };
}

export type LicenseGate = ReturnType<typeof createLicenseGate>;
