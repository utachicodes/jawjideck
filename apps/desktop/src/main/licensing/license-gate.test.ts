import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import type { EntitlementSnapshot } from '@jawji/license-verifier';
import { createLicenseGate, LicenseGateError, type LicenseGate, type LicenseGateDeps } from './license-gate.js';
import type { StoredLicenseCache } from './license-credentials.js';

const NOW = 2_000_000_000_000;

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
    licenses: [
      {
        id: 'lic-1',
        ownerUid: 'user-1',
        type: 'orchestrator',
        moduleId: null,
        boundHardwareId: 'hw-1',
        status: 'active',
        createdAt: 1,
        activatedAt: 1,
      },
    ],
  };
}

function makeGate(overrides: Partial<LicenseGateDeps> = {}): { gate: LicenseGate; keys: ReturnType<typeof makeKeyPair>; setCredentials: (c: StoredLicenseCache | null) => void } {
  const keys = makeKeyPair();
  let creds: StoredLicenseCache | null = null;
  const deps: LicenseGateDeps = {
    publicKey: keys.publicKeyPem,
    readCredentials: () => creds,
    now: () => NOW,
    ...overrides,
  };
  return {
    gate: createLicenseGate(deps),
    keys,
    setCredentials: (c) => {
      creds = c;
    },
  };
}

describe('createLicenseGate', () => {
  it('is not configured when no public key is embedded (fail-closed)', async () => {
    const { gate } = makeGate({ publicKey: '' });
    const state = await gate.getState();
    expect(state.configured).toBe(false);
    expect(state.verified).toBe(false);
    expect(Object.values(state.services).every((v) => v === false)).toBe(true);
    await expect(gate.requireService('ai-analysis')).rejects.toThrow(LicenseGateError);
  });

  it('verified + entitled when the cached token is valid and the subscription is active', async () => {
    const { gate, keys, setCredentials } = makeGate();
    const snapshot = activeSnapshot();
    setCredentials({ uid: snapshot.uid, snapshot, token: signToken(snapshot, keys.privateKeyPem), cachedAt: NOW });
    const state = await gate.getState();
    expect(state.configured).toBe(true);
    expect(state.verified).toBe(true);
    expect(state.services['ai-analysis']).toBe(true);
    expect(state.services['cloud-sync']).toBe(true);
    expect(state.services['orchestrator']).toBe(true);
    await gate.requireService('ai-analysis');
    await gate.requireService('orchestrator');
  });

  it('fail-closed with no cached credential', async () => {
    const { gate } = makeGate();
    const state = await gate.getState();
    expect(state.verified).toBe(false);
    expect(Object.values(state.services).every((v) => v === false)).toBe(true);
    await expect(gate.requireService('cloud-sync')).rejects.toThrow(/missing or failed verification/);
  });

  it('rejects a token signed by a different key', async () => {
    const { gate, setCredentials } = makeGate();
    const other = makeKeyPair();
    const snapshot = activeSnapshot();
    setCredentials({ uid: snapshot.uid, snapshot, token: signToken(snapshot, other.privateKeyPem), cachedAt: NOW });
    expect((await gate.getState()).verified).toBe(false);
    await expect(gate.requireService('ai-analysis')).rejects.toThrow(LicenseGateError);
  });

  it('fail-closed when the subscription lapsed', async () => {
    const { gate, keys, setCredentials } = makeGate();
    const snapshot: EntitlementSnapshot = {
      ...activeSnapshot(),
      subscription: { ...activeSnapshot().subscription, status: 'canceled' },
    };
    setCredentials({ uid: snapshot.uid, snapshot, token: signToken(snapshot, keys.privateKeyPem), cachedAt: NOW });
    const state = await gate.getState();
    expect(state.verified).toBe(true);
    expect(state.services['ai-analysis']).toBe(false);
    expect(state.services['cloud-sync']).toBe(false);
    expect(state.services['companion-provisioning']).toBe(false);
    expect(state.services['orchestrator']).toBe(true);
    await expect(gate.requireService('ai-analysis')).rejects.toThrow(/not active or expired/);
  });

  it('requireService throws a LicenseGateError carrying the service + reason', async () => {
    const { gate } = makeGate({ publicKey: '' });
    try {
      await gate.requireService('intelligence-modules');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LicenseGateError);
      const e = err as LicenseGateError;
      expect(e.service).toBe('intelligence-modules');
      expect(e.reason).toContain('not embedded');
    }
  });
});
