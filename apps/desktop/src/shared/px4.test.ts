import { describe, it, expect } from 'vitest';
import {
  px4CustomMode,
  px4ModeName,
  px4ModeKey,
  PX4_MODE,
  PX4_COPTER_MODES,
  decodeParamBytewise,
  encodeParamBytewise,
  pwmToManualControl,
  PX4_SETUP_RULES,
} from './px4';

const floatBytes = (f: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, f, true);
  return b;
};

describe('PX4 custom_mode', () => {
  it('names modes reported by a real vehicle', () => {
    expect(px4ModeName(458752)).toBe('Stabilized'); // 0x00070000
    expect(px4ModeName(50593792)).toBe('Hold');     // 0x03040000
  });

  it('packs main and sub mode', () => {
    expect(px4CustomMode(4, 3)).toBe(50593792);
    expect(PX4_MODE.POSITION).toBe(0x00030000);
    expect(px4ModeName(PX4_MODE.RETURN)).toBe('Return');
    expect(px4ModeName(PX4_MODE.LAND)).toBe('Land');
  });

  it('ignores sub_mode noise outside AUTO when comparing', () => {
    expect(px4ModeKey(px4CustomMode(3, 0))).toBe(PX4_MODE.POSITION);
    expect(px4ModeKey(PX4_MODE.MISSION)).toBe(PX4_MODE.MISSION);
  });

  it('offers only distinct, named modes', () => {
    const nums = PX4_COPTER_MODES.map((m) => m.modeNum);
    expect(new Set(nums).size).toBe(nums.length);
    for (const m of PX4_COPTER_MODES) expect(px4ModeName(m.modeNum)).toBe(m.name);
  });
});

describe('PX4 byte-wise params', () => {
  it('decodes INT32 values sent in the float field', () => {
    // What a float decode showed for SYS_HAS_GPS=1, GPS_1_CONFIG=201, MAV_0_RATE=1200
    expect(decodeParamBytewise(floatBytes(1.401298464324817e-45), 6)).toBe(1);
    expect(decodeParamBytewise(floatBytes(2.8166099132928823e-43), 6)).toBe(201);
    expect(decodeParamBytewise(floatBytes(1.6815581571897805e-42), 6)).toBe(1200);
  });

  it('keeps REAL32 values as floats', () => {
    expect(decodeParamBytewise(floatBytes(2.5), 9)).toBe(2.5);
  });

  it('round-trips every integer type', () => {
    for (const [type, value] of [[1, 250], [2, -5], [3, 60000], [4, -30000], [5, 4000000000], [6, -123456]]) {
      expect(decodeParamBytewise(encodeParamBytewise(value!, type!), type!)).toBe(value);
    }
  });
});

describe('pwmToManualControl', () => {
  it('centers sticks and maps throttle to 0..1000', () => {
    expect(pwmToManualControl({ roll: 1500, pitch: 1500, throttle: 1000, yaw: 1500 })).toEqual({ x: 0, y: 0, z: 0, r: 0 });
    expect(pwmToManualControl({ roll: 1500, pitch: 1500, throttle: 1500, yaw: 1500 }).z).toBe(500);
  });

  it('treats low pitch PWM as forward (positive x)', () => {
    expect(pwmToManualControl({ roll: 2000, pitch: 1000, throttle: 2000, yaw: 2000 })).toEqual({ x: 1000, y: 1000, z: 1000, r: 1000 });
  });
});

describe('PX4_SETUP_RULES', () => {
  const rule = (p: string) => PX4_SETUP_RULES.find((r) => r.param === p)!;

  it('flags only values that block the feature', () => {
    expect(rule('COM_RC_IN_MODE').needsFix(0)).toBe(true);
    expect(rule('COM_RC_IN_MODE').needsFix(3)).toBe(false); // the test vehicle's value
    expect(rule('COM_DISARM_LAND').needsFix(-1)).toBe(true);
    expect(rule('COM_DISARM_LAND').needsFix(2)).toBe(false);
    expect(rule('MIS_TAKEOFF_ALT').needsFix(0)).toBe(true);
  });

  it('recommends values its own check accepts', () => {
    for (const r of PX4_SETUP_RULES) expect(r.needsFix(r.recommended)).toBe(false);
  });
});
