// processes.test.ts
import { describe, it, expect } from 'vitest';
import { listProcesses, isProtected, killProcess } from './processes';

describe('processes', () => {
  it('returns current processes with required fields', async () => {
    const procs = await listProcesses(['jawji-controller']);
    expect(procs.length).toBeGreaterThan(0);
    const first = procs[0];
    expect(first).toHaveProperty('pid');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('cpu');
    expect(first).toHaveProperty('ram');
    expect(first).toHaveProperty('user');
    expect(first).toHaveProperty('command');
    expect(first).toHaveProperty('isProtected');
  });

  it('marks protected processes', () => {
    expect(isProtected('mavlink-router', ['mavlink-router', 'mavp2p'])).toBe(true);
    expect(isProtected('python3', ['mavlink-router', 'mavp2p'])).toBe(false);
  });

  it('rejects non-positive PIDs before touching any process', async () => {
    // PID -1 would otherwise signal every process; these must be rejected
    // before any process lookup or signal is attempted.
    expect((await killProcess(-1, [])).success).toBe(false);
    expect((await killProcess(0, [])).success).toBe(false);
    expect((await killProcess(NaN, [])).success).toBe(false);
    expect((await killProcess(1.5, [])).success).toBe(false);
  });
});
