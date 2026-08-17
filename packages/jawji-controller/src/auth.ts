// auth.ts
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function loadOrCreateToken(tokenPath: string): string {
  const dir = path.dirname(tokenPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(tokenPath)) {
    // Ensure the on-disk token file stays owner-only even if it pre-dates the
    // 0o600 write below (e.g. created by an older version or a backup).
    fs.chmodSync(tokenPath, 0o600);
    const existing = fs.readFileSync(tokenPath, 'utf-8').trim();
    if (existing.length === 64) return existing;
  }

  const token = generateToken();
  fs.writeFileSync(tokenPath, token, { mode: 0o600 });
  return token;
}

export function validateToken(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
