// docker.test.ts
import { describe, it, expect } from 'vitest';
import { controlContainer } from './docker';

describe('docker container validation', () => {
  it('rejects invalid container IDs before touching docker', async () => {
    expect((await controlContainer('..', 'start')).success).toBe(false);
    expect((await controlContainer('abc!', 'start')).success).toBe(false);
    expect((await controlContainer('', 'start')).success).toBe(false);
  });

  it('rejects unknown actions', async () => {
    expect((await controlContainer('a1b2c3', 'exec' as any)).success).toBe(false);
    expect((await controlContainer('a1b2c3', 'rm' as any)).success).toBe(false);
  });
});
