import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { vi as vitest } from 'vitest';
import type { EntitlementSnapshot } from '@jawji/license-verifier';

function makeKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

function signToken(snapshot: EntitlementSnapshot, privateKeyPem: string): string {
  const key = createPrivateKey({ key: privateKeyPem, format: 'pem', type: 'pkcs8' });
  const payload = Buffer.from(JSON.stringify(snapshot)).toString('base64url');
  const signature = sign(null, Buffer.from(payload, 'base64url'), key).toString('base64url');
  return `${payload}.${signature}`;
}

const NOW = 2_000_000_000_000;

function activeSnapshot(): EntitlementSnapshot {
  return {
    uid: 'user-1',
    subscription: {
      uid: 'user-1',
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd: NOW + 1000,
      createdAt: 1,
      updatedAt: 1,
    },
    licenses: [],
  };
}

// Mock the generated build-time key module so tests can exercise both the
// embedded-key and fail-closed-no-key paths without a real build.
let embeddedKey = '';
vi.mock('../generated/license-key.js', () => ({
  get JAWJI_LICENSE_PUBLIC_KEY() {
    return embeddedKey;
  },
}));

describe('jawji-controller license gate', () => {
  beforeEach(() => {
    embeddedKey = '';
    vitest.resetModules();
  });

  async function loadGate() {
    return import('./gate.js');
  }

  it('fails closed when no public key is embedded in the build', async () => {
    const { getEmbeddedPublicKey, requirePaidService, LicenseGateError } = await loadGate();
    expect(getEmbeddedPublicKey()).toBe('');
    expect(() => requirePaidService('companion-provisioning', 'whatever.token')).toThrow(LicenseGateError);
    expect(() => requirePaidService('companion-provisioning', 'whatever.token')).toThrow(/not embedded/);
  });

  it('verifies a signed token when the key is embedded', async () => {
    const keys = makeKeyPair();
    embeddedKey = Buffer.from(keys.publicKeyPem, 'utf8').toString('base64');
    const { requirePaidService, verifyProvisioningEntitlement } = await loadGate();
    const snapshot = activeSnapshot();
    const token = signToken(snapshot, keys.privateKeyPem);

    expect(verifyProvisioningEntitlement(token)).toEqual(snapshot);
    expect(requirePaidService('companion-provisioning', token)).toEqual(snapshot);
  });

  it('rejects a token signed by a different key', async () => {
    const keys = makeKeyPair();
    embeddedKey = Buffer.from(keys.publicKeyPem, 'utf8').toString('base64');
    const other = makeKeyPair();
    const { requirePaidService, LicenseGateError } = await loadGate();
    expect(() => requirePaidService('orchestrator', signToken(activeSnapshot(), other.privateKeyPem))).toThrow(
      /signature verification failed/
    );
    expect(() => requirePaidService('orchestrator', signToken(activeSnapshot(), other.privateKeyPem))).toThrow(
      LicenseGateError
    );
  });

  it('fails closed when the entitlement does not cover the requested service', async () => {
    const keys = makeKeyPair();
    embeddedKey = Buffer.from(keys.publicKeyPem, 'utf8').toString('base64');
    const { requirePaidService, LicenseGateError } = await loadGate();
    const lapsed: EntitlementSnapshot = {
      ...activeSnapshot(),
      subscription: { ...activeSnapshot().subscription, status: 'canceled' },
    };
    expect(() => requirePaidService('cloud-sync', signToken(lapsed, keys.privateKeyPem))).toThrow(/not active or expired/);
  });

  it('rejects a missing token even with a valid embedded key', async () => {
    const keys = makeKeyPair();
    embeddedKey = Buffer.from(keys.publicKeyPem, 'utf8').toString('base64');
    const { requirePaidService, LicenseGateError } = await loadGate();
    expect(() => requirePaidService('companion-provisioning', null)).toThrow(LicenseGateError);
    expect(() => requirePaidService('companion-provisioning', undefined)).toThrow(LicenseGateError);
  });
});
