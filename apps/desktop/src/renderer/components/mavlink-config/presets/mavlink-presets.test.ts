import { describe, it, expect, vi } from 'vitest';

// Mock lucide-react since it's a renderer dependency not available in Node tests
vi.mock('lucide-react', () => ({
  Egg: 'Egg',
  Drama: 'Drama',
  Zap: 'Zap',
  Film: 'Film',
}));

import { PID_PRESETS } from './mavlink-presets';

// ---------------------------------------------------------------------------
// PID Preset accel values
// ---------------------------------------------------------------------------

describe('PID Preset acceleration limits', () => {
  it('all presets should define accel values', () => {
    for (const [key, preset] of Object.entries(PID_PRESETS)) {
      expect(preset.accel, `preset "${key}" should have accel`).toBeDefined();
      expect(preset.accel!.roll, `preset "${key}" roll accel`).toBeGreaterThan(0);
      expect(preset.accel!.pitch, `preset "${key}" pitch accel`).toBeGreaterThan(0);
      expect(preset.accel!.yaw, `preset "${key}" yaw accel`).toBeGreaterThan(0);
    }
  });

  it('beginner preset should have lowest accel limits', () => {
    const beginner = PID_PRESETS['beginner']!;
    const racing = PID_PRESETS['racing']!;
    expect(beginner.accel!.roll).toBeLessThan(racing.accel!.roll);
    expect(beginner.accel!.pitch).toBeLessThan(racing.accel!.pitch);
    expect(beginner.accel!.yaw).toBeLessThan(racing.accel!.yaw);
  });

  it('racing preset should have highest accel limits', () => {
    const racing = PID_PRESETS['racing']!;
    for (const [key, preset] of Object.entries(PID_PRESETS)) {
      if (key === 'racing') continue;
      expect(racing.accel!.roll).toBeGreaterThanOrEqual(preset.accel!.roll);
      expect(racing.accel!.pitch).toBeGreaterThanOrEqual(preset.accel!.pitch);
      expect(racing.accel!.yaw).toBeGreaterThanOrEqual(preset.accel!.yaw);
    }
  });

  it('cinematic preset should have lower accel than freestyle', () => {
    const cinematic = PID_PRESETS['cinematic']!;
    const freestyle = PID_PRESETS['freestyle']!;
    expect(cinematic.accel!.roll).toBeLessThan(freestyle.accel!.roll);
    expect(cinematic.accel!.pitch).toBeLessThan(freestyle.accel!.pitch);
    expect(cinematic.accel!.yaw).toBeLessThan(freestyle.accel!.yaw);
  });

  it('yaw accel should always be lower than roll/pitch accel', () => {
    for (const [key, preset] of Object.entries(PID_PRESETS)) {
      expect(preset.accel!.yaw, `preset "${key}" yaw < roll`).toBeLessThan(preset.accel!.roll);
      expect(preset.accel!.yaw, `preset "${key}" yaw < pitch`).toBeLessThan(preset.accel!.pitch);
    }
  });

  it('specific preset accel values match expected constants', () => {
    expect(PID_PRESETS['beginner']!.accel).toEqual({ roll: 80000, pitch: 80000, yaw: 20000 });
    expect(PID_PRESETS['freestyle']!.accel).toEqual({ roll: 110000, pitch: 110000, yaw: 27000 });
    expect(PID_PRESETS['racing']!.accel).toEqual({ roll: 160000, pitch: 160000, yaw: 40000 });
    expect(PID_PRESETS['cinematic']!.accel).toEqual({ roll: 55000, pitch: 55000, yaw: 14000 });
  });
});
