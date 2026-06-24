/**
 * HTTP client for the Jawji Marketplace API.
 * Handles activation, heartbeat, update checks, and bundle downloads.
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { app } from 'electron';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type {
  ActivateResponse,
  HeartbeatResponse,
  CheckUpdatesResponse,
} from '../../shared/module-types.js';

const DEFAULT_BASE_URL = 'https://jawji-marketplace.herokuapp.com';
const DEV_BASE_URL = 'http://localhost:3012';

function getBaseUrl(): string {
  if (process.env['MARKETPLACE_URL']) return process.env['MARKETPLACE_URL'];
  // In dev, talk to the local marketplace by default instead of production.
  if (!app.isPackaged) return DEV_BASE_URL;
  return DEFAULT_BASE_URL;
}

async function jsonPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Could not reach the marketplace at ${getBaseUrl()}. Check your connection and try again.`);
  }
  if (!res.ok) {
    throw new Error(await marketplaceError(res));
  }
  return res.json() as Promise<T>;
}

/**
 * Build a clean error message from a failed response. The API returns JSON
 * errors ({ message }); a non-JSON body (e.g. an HTML gateway/"no such app"
 * page) means the marketplace itself is down or misconfigured, so we never
 * surface raw HTML to the UI.
 */
async function marketplaceError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const json = JSON.parse(text);
    if (json?.message) return `Marketplace error (${res.status}): ${json.message}`;
  } catch {
    // body is not JSON — fall through to the generic message
  }
  return `Marketplace unavailable (${res.status}). The service may be down or MARKETPLACE_URL is misconfigured.`;
}

/**
 * Activate a license key on this device.
 */
export async function activate(
  key: string,
  deviceId: string,
  deviceName: string,
): Promise<ActivateResponse> {
  return jsonPost<ActivateResponse>('/client/activate', { key, deviceId, deviceName });
}

/**
 * Deactivate a license key from this device.
 */
export async function deactivate(
  key: string,
  deviceId: string,
): Promise<{ ok: boolean }> {
  return jsonPost<{ ok: boolean }>('/client/deactivate', { key, deviceId });
}

/**
 * Heartbeat to check if a license is still valid (not revoked).
 */
export async function heartbeat(
  key: string,
  deviceId: string,
): Promise<HeartbeatResponse> {
  return jsonPost<HeartbeatResponse>('/client/heartbeat', { key, deviceId });
}

/**
 * Check for available updates for installed modules.
 */
export async function checkUpdates(
  installed: { slug: string; version: string }[],
): Promise<CheckUpdatesResponse> {
  return jsonPost<CheckUpdatesResponse>('/client/check-updates', { installed });
}

/**
 * Download a module bundle ZIP to disk.
 * Returns the local file path and the SHA256 hash from the server.
 */
export async function downloadBundle(
  slug: string,
  version: string,
  licenseKey: string,
  onProgress?: (downloaded: number, total: number) => void,
): Promise<{ filePath: string; hash: string }> {
  const url = `${getBaseUrl()}/client/download/${encodeURIComponent(slug)}/${encodeURIComponent(version)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { 'x-license-key': licenseKey },
    });
  } catch {
    throw new Error(`Could not reach the marketplace at ${getBaseUrl()}. Check your connection and try again.`);
  }

  if (!res.ok) {
    throw new Error(await marketplaceError(res));
  }

  const hash = res.headers.get('x-bundle-hash') || '';
  const totalSize = parseInt(res.headers.get('content-length') || '0', 10);

  // Save to userData/modules/{slug}/
  const modulesDir = join(app.getPath('userData'), 'modules', slug);
  await mkdir(modulesDir, { recursive: true });
  const filePath = join(modulesDir, `${version}.zip`);

  if (!res.body) {
    throw new Error('Empty response body');
  }

  // Stream download with progress
  const writeStream = createWriteStream(filePath);
  let downloaded = 0;

  const reader = res.body.getReader();
  const nodeStream = new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) {
        this.push(null);
        return;
      }
      downloaded += value.byteLength;
      onProgress?.(downloaded, totalSize);
      this.push(Buffer.from(value));
    },
  });

  await pipeline(nodeStream, writeStream);

  return { filePath, hash };
}
