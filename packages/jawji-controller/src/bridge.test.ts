// bridge.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getBridgeStatus } from './bridge.js';

vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
    if (_cmd === 'systemctl' && _args[1] === 'is-active') {
      cb(new Error('inactive'), 'inactive\n');
      return;
    }
    if (_cmd === 'stat') {
      cb(new Error('ENOENT'), '');
      return;
    }
    if (_cmd === 'ss') {
      cb(null, 'State  Recv-Q  Send-Q   Local Address:Port\nLISTEN  0      128      0.0.0.0:14550\n');
      return;
    }
    cb(new Error('not found'), '');
  }),
}));

describe('bridge', () => {
  it('returns bridge status', async () => {
    const status = await getBridgeStatus();
    expect(status.udpPort).toBe(14550);
    expect(status.tcpPort).toBe(5760);
    expect(typeof status.fcConnected).toBe('boolean');
    expect(typeof status.mavlinkRunning).toBe('boolean');
  });

  it('reports fc disconnected when device missing', async () => {
    const status = await getBridgeStatus();
    expect(status.fcConnected).toBe(false);
  });

  it('reports mavlink not running', async () => {
    const status = await getBridgeStatus();
    expect(status.mavlinkRunning).toBe(false);
  });
});
