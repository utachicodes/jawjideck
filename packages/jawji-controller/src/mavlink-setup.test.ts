// mavlink-setup.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getMavlinkRouterStatus } from './mavlink-setup.js';

vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
    // systemctl is-active returns 'inactive' by default
    if (_cmd === 'systemctl' && _args[1] === 'is-active') {
      cb(new Error('inactive'), 'inactive\n');
      return;
    }
    // which fails = not installed
    if (_cmd === 'which') {
      cb(new Error('not found'), '');
      return;
    }
    cb(new Error('not found'), '');
  }),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => { throw new Error('ENOENT'); }),
  writeFile: vi.fn(async () => {}),
  mkdir: vi.fn(async () => {}),
}));

describe('mavlink-setup', () => {
  it('returns status when not installed', async () => {
    const status = await getMavlinkRouterStatus();
    expect(status.installed).toBe(false);
    expect(status.running).toBe(false);
    expect(status.udpPort).toBe(14550);
    expect(status.tcpPort).toBe(5760);
  });

  it('returns correct default ports', async () => {
    const status = await getMavlinkRouterStatus();
    expect(status.fcBaud).toBe(57600);
    expect(status.fcDevice).toBe('/dev/serial0');
  });
});
