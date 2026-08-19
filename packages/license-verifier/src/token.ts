import { createPublicKey, verify } from 'node:crypto';
import type { EntitlementSnapshot } from './types.js';

const PEM_BEGIN = '-----BEGIN PUBLIC KEY-----';

function toPem(publicKey: string): string {
  if (publicKey.includes(PEM_BEGIN)) return publicKey;
  try {
    const decoded = Buffer.from(publicKey, 'base64').toString('utf8');
    if (decoded.includes(PEM_BEGIN)) return decoded;
  } catch {
    // fall through to the error below
  }
  throw new Error('Invalid Ed25519 public key format (expected SPKI PEM or its base64 encoding)');
}

function structuralValidation(snapshot: unknown): snapshot is EntitlementSnapshot {
  if (typeof snapshot !== 'object' || snapshot === null) return false;
  const s = snapshot as Record<string, unknown>;
  if (typeof s.uid !== 'string') return false;
  const sub = s.subscription as Record<string, unknown> | undefined;
  if (typeof sub !== 'object' || sub === null) return false;
  if (!['trialing', 'active', 'past_due', 'canceled'].includes(String(sub.status))) return false;
  if (!Array.isArray(s.licenses)) return false;
  return s.licenses.every(
    (l) =>
      typeof l === 'object' &&
      l !== null &&
      ['subscription', 'orchestrator', 'intelligence-module'].includes(
        String((l as Record<string, unknown>).type)
      ) &&
      ['unredeemed', 'active', 'revoked'].includes(String((l as Record<string, unknown>).status))
  );
}

/**
 * Verifies an Ed25519-signed entitlement token against the embedded public
 * key. Token format: `<base64url(json)>.<base64url(64-byte signature)>`.
 * Returns the snapshot only when the signature is valid AND the payload is
 * structurally a plausible EntitlementSnapshot; otherwise null.
 */
export function verifyEntitlementToken(token: string, publicKeyInput: string): EntitlementSnapshot | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  try {
    const publicKey = createPublicKey({
      key: toPem(publicKeyInput),
      format: 'pem',
      type: 'spki',
    });

    const payloadBytes = Buffer.from(payload, 'base64url');
    const signatureBytes = Buffer.from(signature, 'base64url');
    if (signatureBytes.length !== 64) return null;

    if (!verify(null, payloadBytes, publicKey, signatureBytes)) return null;

    const parsed: unknown = JSON.parse(payloadBytes.toString('utf8'));
    if (!structuralValidation(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
