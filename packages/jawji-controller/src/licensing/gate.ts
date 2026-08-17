import {
  verifyEntitlementToken,
  isServiceEntitled,
  type EntitlementSnapshot,
  type ServiceName,
} from '@jawji/license-verifier';
import { JAWJI_LICENSE_PUBLIC_KEY } from '../generated/license-key.js';

const PEM_BEGIN = '-----BEGIN PUBLIC KEY-----';

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

/** The Ed25519 public key baked in at build time ('' when not injected). */
export function getEmbeddedPublicKey(): string {
  if (!JAWJI_LICENSE_PUBLIC_KEY) return '';
  try {
    const pem = Buffer.from(JAWJI_LICENSE_PUBLIC_KEY, 'base64').toString('utf8');
    return pem.includes(PEM_BEGIN) ? pem : '';
  } catch {
    return '';
  }
}

/**
 * Verifies a signed entitlement token against the embedded public key.
 * Defense-in-depth for when the controller is used directly (e.g. SSH'd into
 * the Pi): paid provisioning requests must carry a token the desktop got from
 * jawji-gcs. Local Ed25519 verification means this works fully offline.
 * Fail-closed: no embedded key, no token, or a bad signature all return null.
 */
export function verifyProvisioningEntitlement(token: string | null | undefined): EntitlementSnapshot | null {
  const publicKey = getEmbeddedPublicKey();
  if (!publicKey || !token) return null;
  return verifyEntitlementToken(token, publicKey);
}

/**
 * Fail-closed gate for paid/cloud provisioning endpoints. Throws
 * LicenseGateError unless the request carries a locally-verified,
 * still-entitled snapshot for the requested service.
 */
export function requirePaidService(service: ServiceName, token: string | null | undefined): EntitlementSnapshot {
  const snapshot = verifyProvisioningEntitlement(token);
  if (!snapshot) {
    throw new LicenseGateError(
      service,
      getEmbeddedPublicKey() ? 'credential missing or signature verification failed' : 'licensing key not embedded in this build'
    );
  }
  if (!isServiceEntitled(snapshot, service)) {
    throw new LicenseGateError(service, 'entitlement not active or expired');
  }
  return snapshot;
}
