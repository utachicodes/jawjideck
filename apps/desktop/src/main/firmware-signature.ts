import { createHash } from 'crypto';
import { readFileSync } from 'fs';

export interface FirmwareSignature {
  algorithm: 'sha256';
  hash: string;
  signedBy?: string;
  timestamp: number;
}

export interface FirmwareManifestEntry {
  version: string;
  board: string;
  url: string;
  sha256: string;
  signature?: FirmwareSignature;
}

export async function verifyFirmwareHash(filePath: string, expectedHash: string): Promise<boolean> {
  const buffer = readFileSync(filePath);
  const hash = createHash('sha256').update(buffer).digest('hex');
  return hash === expectedHash;
}

export async function verifyFirmwareSignature(
  filePath: string,
  signature: FirmwareSignature,
  publicKey: string
): Promise<boolean> {
  // For cosign/keyless signatures, we'd use sigstore verification
  // This is a placeholder for future implementation
  // In production, use @sigstore/verify or similar
  return true;
}

export function extractHashFromManifest(manifest: Record<string, FirmwareManifestEntry>, board: string, version: string): string | null {
  const key = `${board}-${version}`;
  const entry = manifest[key];
  return entry?.sha256 ?? null;
}

export async function downloadAndVerifyFirmware(
  url: string,
  expectedHash: string,
  destination: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `Download failed: ${response.status}` };
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Verify hash before writing
    const hash = createHash('sha256').update(buffer).digest('hex');
    if (hash !== expectedHash) {
      return { success: false, error: `Hash mismatch: expected ${expectedHash}, got ${hash}` };
    }
    
    // Write file
    const { writeFileSync } = await import('fs');
    writeFileSync(destination, buffer);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}