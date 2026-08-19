// mediamtx-setup.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getMediaMtxSetupStatus, detectCameras } from './mediamtx-setup.js';

vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: (err: Error | null, stdout: string) => void) => {
    if (_cmd === 'systemctl' && _args[1] === 'is-active') {
      cb(new Error('inactive'), 'inactive\n');
      return;
    }
    if (_cmd === 'udevadm') {
      cb(null, 'ID_MODEL=test-camera\nID_V4L_MODULES=video4linux\n');
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
  readdir: vi.fn(async (dir: string) => {
    if (dir === '/dev') return ['video0', 'video1'];
    return [];
  }),
}));

describe('mediamtx-setup', () => {
  it('returns status when not installed', async () => {
    const status = await getMediaMtxSetupStatus();
    expect(status.installed).toBe(false);
    expect(status.running).toBe(false);
    expect(status.cameras).toBeDefined();
    expect(status.rtspPort).toBe(8554);
    expect(status.webrtcPort).toBe(8889);
  });

  it('detects camera devices', async () => {
    const cameras = await detectCameras();
    expect(cameras.length).toBeGreaterThanOrEqual(1);
    expect(cameras[0].path).toMatch(/\/dev\/video\d+/);
  });
});
