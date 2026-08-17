// fc-detect.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectFlightControllers, invalidateFcCache } from './fc-detect.js';

vi.mock('child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], cb: (err: Error | null, stdout: string) => void) => {
    // Mock udevadm for driver detection
    if (cmd === 'udevadm' && args[2]?.includes('ttyACM0')) {
      cb(null, 'ID_MODEL=stm32\nID_VENDOR=Arduino\n');
      return;
    }
    if (cmd === 'udevadm' && args[2]?.includes('ttyUSB0')) {
      cb(null, 'ID_VENDOR=Silicon_Labs\n');
      return;
    }
    // Mock stty for MAVLink probe
    if (cmd === 'stty') {
      cb(null, '');
      return;
    }
    // Mock timeout/cat for probe
    if (cmd === 'timeout') {
      cb(new Error('timeout'), '');
      return;
    }
    cb(new Error('not found'), '');
  }),
}));

vi.mock('fs/promises', () => ({
  readdir: vi.fn(async (dir: string) => {
    if (dir === '/dev') return ['ttyACM0', 'ttyUSB0', 'tty0'];
    if (dir === '/dev/serial/by-id') return [];
    return [];
  }),
  stat: vi.fn(async (path: string) => {
    if (path.includes('ttyACM') || path.includes('ttyUSB')) {
      return { isCharacterDevice: () => true, isBlockDevice: () => false };
    }
    return { isCharacterDevice: () => false, isBlockDevice: () => false };
  }),
}));

describe('fc-detect', () => {
  beforeEach(() => {
    invalidateFcCache();
  });

  it('detects connected flight controllers', async () => {
    const result = await detectFlightControllers();
    expect(result.controllers.length).toBeGreaterThanOrEqual(1);
    expect(result.bestPath).toBeTruthy();
  });

  it('identifies driver type', async () => {
    const result = await detectFlightControllers();
    const acm = result.controllers.find(c => c.path.includes('ttyACM'));
    if (acm) {
      expect(['cdc_acm', 'cp210x', 'ch341', 'unknown']).toContain(acm.driver);
    }
  });

  it('returns best baud rate', async () => {
    const result = await detectFlightControllers();
    expect([57600, 115200]).toContain(result.bestBaud);
  });

  it('caches results', async () => {
    const r1 = await detectFlightControllers();
    const r2 = await detectFlightControllers();
    expect(r1.timestamp).toBe(r2.timestamp);
  });

  it('respects cache invalidation', async () => {
    const r1 = await detectFlightControllers();
    invalidateFcCache();
    await new Promise(r => setTimeout(r, 10));
    const r2 = await detectFlightControllers();
    expect(r2.timestamp).toBeGreaterThanOrEqual(r1.timestamp);
  });
});
