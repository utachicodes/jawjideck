import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const userDataDir = await mkdtemp(join(tmpdir(), 'jawji-test-userdata-'));

vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'userData' ? userDataDir : tmpdir()) },
}));

// module-manager.ts constructs an electron-store Store at module load time,
// which requires a live Electron app context outside of one — same issue and
// same fix as fleet-roster.test.ts (see apps/desktop/src/main/fleet/__tests__/fleet-roster.test.ts).
vi.mock('electron-store', () => {
  class FakeStore<T extends Record<string, unknown>> {
    private data: Partial<T>;
    constructor(options: { defaults?: T }) {
      this.data = (options.defaults ?? {}) as Partial<T>;
    }
    get<K extends keyof T>(key: K, fallback?: T[K]): T[K] {
      return (this.data[key] ?? fallback) as T[K];
    }
    set<K extends keyof T>(key: K, value: T[K]): void {
      this.data[key] = value;
    }
  }
  return { default: FakeStore };
});

const { installLocalModule } = await import('../module-manager.js');

describe('installLocalModule', () => {
  let sourceDir: string;

  beforeEach(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), 'jawji-test-module-src-'));
    await writeFile(
      join(sourceDir, 'module.json'),
      JSON.stringify({
        manifestVersion: 1,
        slug: 'jawji.test.local-module',
        name: 'Local Test Module',
        version: '0.0.1',
        entry: { renderer: 'renderer.js' },
        mountPoints: [],
        permissions: [],
      }),
    );
    await writeFile(join(sourceDir, 'renderer.js'), 'export function activate() {}');
  });

  it('copies the source directory to <userData>/modules/<slug>/extracted and registers it', async () => {
    const record = await installLocalModule(sourceDir);

    expect(record.slug).toBe('jawji.test.local-module');
    expect(record.name).toBe('Local Test Module');
    expect(record.version).toBe('0.0.1');
    expect(record.licenseKey).toBe('local-dev');
    expect(record.activatable).toBeFalsy();
    expect(record.installPath).toBeTruthy();

    const copiedManifest = await readFile(join(record.installPath!, 'module.json'), 'utf-8');
    expect(JSON.parse(copiedManifest).slug).toBe('jawji.test.local-module');
    const copiedRenderer = await readFile(join(record.installPath!, 'renderer.js'), 'utf-8');
    expect(copiedRenderer).toContain('activate');
  });

  it('rejects a directory with no valid module.json', async () => {
    const badDir = await mkdtemp(join(tmpdir(), 'jawji-test-bad-'));
    await writeFile(join(badDir, 'module.json'), '{not valid json');
    await expect(installLocalModule(badDir)).rejects.toThrow();
    await rm(badDir, { recursive: true, force: true });
  });
});
