import { describe, it, expect } from 'vitest';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { verifyEntitlementToken } from './token.js';
import type { EntitlementSnapshot } from './types.js';

function makeKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString(),
    privateKeyPem: privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
  };
}

function signToken(snapshot: EntitlementSnapshot, privateKeyPem: string): string {
  const key = createPrivateKey({ key: privateKeyPem, format: 'pem', type: 'pkcs8' });
  const payload = Buffer.from(JSON.stringify(snapshot)).toString('base64url');
  const signature = sign(null, Buffer.from(payload, 'base64url'), key).toString('base64url');
  return `${payload}.${signature}`;
}

const snapshot: EntitlementSnapshot = {
  uid: 'user-1',
  subscription: {
    uid: 'user-1',
    status: 'active',
    trialEndsAt: null,
    currentPeriodEnd: 4_000_000_000_000,
    createdAt: 1_000_000_000,
    updatedAt: 1_000_000_000,
  },
  licenses: [
    {
      id: 'lic-1',
      ownerUid: 'user-1',
      type: 'orchestrator',
      moduleId: null,
      boundHardwareId: 'hw-1',
      status: 'active',
      createdAt: 1_000_000_000,
      activatedAt: 1_000_000_000,
    },
  ],
};

describe('verifyEntitlementToken', () => {
  it('accepts a token signed by the matching private key', () => {
    const { publicKeyPem, privateKeyPem } = makeKeyPair();
    const token = signToken(snapshot, privateKeyPem);
    expect(verifyEntitlementToken(token, publicKeyPem)).toEqual(snapshot);
  });

  it('accepts a base64-encoded PEM public key', () => {
    const { publicKeyPem, privateKeyPem } = makeKeyPair();
    const token = signToken(snapshot, privateKeyPem);
    const b64 = Buffer.from(publicKeyPem, 'utf8').toString('base64');
    expect(verifyEntitlementToken(token, b64)).toEqual(snapshot);
  });

  it('rejects a token signed by a different key', () => {
    const keys = makeKeyPair();
    const other = makeKeyPair();
    const token = signToken(snapshot, other.privateKeyPem);
    expect(verifyEntitlementToken(token, keys.publicKeyPem)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const { publicKeyPem, privateKeyPem } = makeKeyPair();
    const token = signToken(snapshot, privateKeyPem);
    const [payload] = token.split('.');
    const tampered = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    tampered.uid = 'attacker';
    const tamperedPayload = Buffer.from(JSON.stringify(tampered)).toString('base64url');
    const [_, sig] = token.split('.');
    expect(verifyEntitlementToken(`${tamperedPayload}.${sig}`, publicKeyPem)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    const { publicKeyPem } = makeKeyPair();
    expect(verifyEntitlementToken('', publicKeyPem)).toBeNull();
    expect(verifyEntitlementToken('abc', publicKeyPem)).toBeNull();
    expect(verifyEntitlementToken('a.b.c', publicKeyPem)).toBeNull();
    expect(verifyEntitlementToken('a.b', publicKeyPem)).toBeNull();
  });

  it('rejects structurally invalid payloads even with a valid signature', () => {
    const { publicKeyPem, privateKeyPem } = makeKeyPair();
    const key = createPrivateKey({ key: privateKeyPem, format: 'pem', type: 'pkcs8' });
    const payload = Buffer.from(JSON.stringify({ nope: true })).toString('base64url');
    const signature = sign(null, Buffer.from(payload, 'base64url'), key).toString('base64url');
    expect(verifyEntitlementToken(`${payload}.${signature}`, publicKeyPem)).toBeNull();
  });

  it('rejects an invalid public key input', () => {
    const { privateKeyPem } = makeKeyPair();
    const token = signToken(snapshot, privateKeyPem);
    expect(verifyEntitlementToken(token, 'not-a-key')).toBeNull();
    expect(verifyEntitlementToken(token, Buffer.from('definitely-not-a-pem').toString('base64'))).toBeNull();
  });
});
