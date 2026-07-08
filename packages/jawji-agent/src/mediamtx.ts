// mediamtx.ts
// Queries a locally-running MediaMTX instance (installed by
// packages/companion-scripts/lib.sh's install_mediamtx) for real stream
// status -- which paths exist, whether a publisher is actually connected,
// how many readers -- rather than just "is the systemd service running".
// This is the first piece of the "Jawji Agent as orchestrator" pattern:
// the agent doesn't implement video streaming itself, it manages and
// reports on a dedicated tool (MediaMTX) that does.

import type { MediaMtxStatus } from '@jawji/companion-types';

const MEDIAMTX_API_BASE = 'http://127.0.0.1:9997';

interface MediaMtxPathsListResponse {
  items: Array<{
    name: string;
    ready: boolean;
    readers: unknown[];
    source: { type: string } | null;
  }>;
}

export async function isMediaMtxAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${MEDIAMTX_API_BASE}/v3/paths/list`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getMediaMtxStatus(): Promise<MediaMtxStatus> {
  try {
    const res = await fetch(`${MEDIAMTX_API_BASE}/v3/paths/list`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { available: false, paths: [] };

    const data = (await res.json()) as MediaMtxPathsListResponse;
    return {
      available: true,
      paths: data.items.map((item) => ({
        name: item.name,
        ready: item.ready,
        readers: item.readers.length,
        source: item.source?.type ?? null,
      })),
    };
  } catch {
    return { available: false, paths: [] };
  }
}
