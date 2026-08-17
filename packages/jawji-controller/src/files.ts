// files.ts
import fs from 'fs/promises';
import path from 'path';
import type { FileEntry } from '@jawji/companion-types';

export function resolveSafePath(root: string, requestedPath: string): string {
  // Reject paths with .. components
  if (requestedPath.includes('..')) {
    throw new Error('Path traversal detected');
  }
  // Reject absolute paths with multiple segments (e.g. /etc/passwd)
  // Allow single-segment root-relative like "/" or "/filename.txt"
  if (path.isAbsolute(requestedPath) && !requestedPath.startsWith(root)) {
    const segments = requestedPath.split('/').filter(Boolean);
    if (segments.length > 1) {
      throw new Error('Path traversal detected');
    }
  }
  const resolved = path.resolve(root, requestedPath.replace(/^\/+/, ''));
  if (!resolved.startsWith(root)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

// Windows paths are case-insensitive, so compare lower-cased there.
const foldPath = (p: string) =>
  process.platform === 'win32' ? p.toLowerCase() : p;

function isPathInside(realRoot: string, realTarget: string): boolean {
  const rRoot = foldPath(realRoot);
  const rTarget = foldPath(realTarget);
  return rTarget === rRoot || rTarget.startsWith(rRoot + path.sep);
}

/**
 * Guard against symlink escapes: a lexically-safe path may still point
 * outside `root` if a directory in the chain is a symlink. Resolve the real
 * path and verify it stays inside the real root. `safePath` must already
 * exist (or, for writes, its parent must exist).
 */
async function assertRealpathWithin(root: string, safePath: string): Promise<void> {
  const [realRoot, realTarget] = await Promise.all([
    fs.realpath(root),
    fs.realpath(safePath),
  ]);
  if (!isPathInside(realRoot, realTarget)) {
    throw new Error('Path traversal detected');
  }
}

export async function listDirectory(
  root: string,
  dirPath: string
): Promise<FileEntry[]> {
  const safePath = resolveSafePath(root, dirPath);
  await assertRealpathWithin(root, safePath);
  const entries = await fs.readdir(safePath, { withFileTypes: true });

  // Stat every entry concurrently instead of awaiting one fs.stat at a time —
  // for large directories the sequential loop dominated the request latency.
  const results = await Promise.all(
    entries.map(async (entry): Promise<FileEntry | null> => {
      try {
        const fullPath = path.join(safePath, entry.name);
        const stat = await fs.stat(fullPath);
        return {
          name: entry.name,
          path: '/' + path.relative(root, fullPath),
          isDirectory: entry.isDirectory(),
          size: stat.size,
          modified: stat.mtimeMs,
        };
      } catch {
        // Skip entries we can't stat (permission issues)
        return null;
      }
    })
  );

  return results
    .filter((r): r is FileEntry => r !== null)
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export async function readFile(
  root: string,
  filePath: string
): Promise<Buffer> {
  const safePath = resolveSafePath(root, filePath);
  await assertRealpathWithin(root, safePath);
  return fs.readFile(safePath);
}

export async function writeFile(
  root: string,
  filePath: string,
  data: Buffer
): Promise<void> {
  const safePath = resolveSafePath(root, filePath);
  const dir = path.dirname(safePath);
  await fs.mkdir(dir, { recursive: true });
  // The file itself may not exist yet, so realpath the (created) parent dir
  // and re-check the target under its real location.
  const realRoot = await fs.realpath(root);
  const realDir = await fs.realpath(dir);
  const realTarget = path.join(realDir, path.basename(safePath));
  if (!isPathInside(realRoot, realTarget)) {
    throw new Error('Path traversal detected');
  }
  await fs.writeFile(realTarget, data);
}
