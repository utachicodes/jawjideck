import { describe, it, expect } from 'vitest';
import {
  detectPidScheme,
  buildAccelParams,
  buildPresetParams,
  getAllPidParamNames,
  type PidScheme,
} from './mavlink-pid-schemes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal parameter map for scheme detection */
function makeParams(names: string[]): Map<string, { value: number }> {
  const map = new Map<string, { value: number }>();
  for (const n of names) {
    map.set(n, { value: 0 });
  }
  return map;
}

// ---------------------------------------------------------------------------
// buildAccelParams
// ---------------------------------------------------------------------------

describe('buildAccelParams', () => {
  it('should map accel values to modern copter param names', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const result = buildAccelParams(scheme, { roll: 110000, pitch: 110000, yaw: 27000 });
    expect(result).toEqual({
      ATC_ACCEL_R_MAX: 110000,
      ATC_ACCEL_P_MAX: 110000,
      ATC_ACCEL_Y_MAX: 27000,
    });
  });

  it('should map accel values to quadplane param names', () => {
    const scheme = detectPidScheme(makeParams(['Q_A_RAT_RLL_P']));
    const result = buildAccelParams(scheme, { roll: 80000, pitch: 80000, yaw: 20000 });
    expect(result).toEqual({
      Q_A_ACCEL_R_MAX: 80000,
      Q_A_ACCEL_P_MAX: 80000,
      Q_A_ACCEL_Y_MAX: 20000,
    });
  });

  it('should return empty object for schemes without accel support', () => {
    // Legacy copter has no accel params
    const scheme = detectPidScheme(makeParams(['RATE_RLL_P']));
    const result = buildAccelParams(scheme, { roll: 110000, pitch: 110000, yaw: 27000 });
    expect(result).toEqual({});
  });

  it('should return empty object for plane scheme', () => {
    const scheme = detectPidScheme(makeParams(['RLL2SRV_P']));
    const result = buildAccelParams(scheme, { roll: 110000, pitch: 110000, yaw: 27000 });
    expect(result).toEqual({});
  });

  it('should handle zero accel values', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const result = buildAccelParams(scheme, { roll: 0, pitch: 0, yaw: 0 });
    expect(result).toEqual({
      ATC_ACCEL_R_MAX: 0,
      ATC_ACCEL_P_MAX: 0,
      ATC_ACCEL_Y_MAX: 0,
    });
  });

  it('should handle asymmetric accel values', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const result = buildAccelParams(scheme, { roll: 160000, pitch: 80000, yaw: 40000 });
    expect(result).toEqual({
      ATC_ACCEL_R_MAX: 160000,
      ATC_ACCEL_P_MAX: 80000,
      ATC_ACCEL_Y_MAX: 40000,
    });
  });
});

// ---------------------------------------------------------------------------
// Scheme accel properties
// ---------------------------------------------------------------------------

describe('PID scheme accel properties', () => {
  it('modern copter should have ATC_ACCEL_*_MAX param names', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    expect(scheme.accel).toEqual({
      roll: 'ATC_ACCEL_R_MAX',
      pitch: 'ATC_ACCEL_P_MAX',
      yaw: 'ATC_ACCEL_Y_MAX',
    });
  });

  it('modern copter should have accel defaults', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    expect(scheme.accelDefaults).toEqual({
      roll: 110000,
      pitch: 110000,
      yaw: 27000,
    });
  });

  it('quadplane should have Q_A_ACCEL_*_MAX param names', () => {
    const scheme = detectPidScheme(makeParams(['Q_A_RAT_RLL_P']));
    expect(scheme.accel).toEqual({
      roll: 'Q_A_ACCEL_R_MAX',
      pitch: 'Q_A_ACCEL_P_MAX',
      yaw: 'Q_A_ACCEL_Y_MAX',
    });
  });

  it('quadplane should have same accel defaults as modern copter', () => {
    const scheme = detectPidScheme(makeParams(['Q_A_RAT_RLL_P']));
    expect(scheme.accelDefaults).toEqual({
      roll: 110000,
      pitch: 110000,
      yaw: 27000,
    });
  });

  it('legacy copter should not have accel params', () => {
    const scheme = detectPidScheme(makeParams(['RATE_RLL_P']));
    expect(scheme.accel).toBeUndefined();
    expect(scheme.accelDefaults).toBeUndefined();
  });

  it('plane scheme should not have accel params', () => {
    const scheme = detectPidScheme(makeParams(['RLL2SRV_P']));
    expect(scheme.accel).toBeUndefined();
    expect(scheme.accelDefaults).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAllPidParamNames includes accel params
// ---------------------------------------------------------------------------

describe('getAllPidParamNames with accel params', () => {
  it('should include accel param names for modern copter', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const names = getAllPidParamNames(scheme);
    expect(names).toContain('ATC_ACCEL_R_MAX');
    expect(names).toContain('ATC_ACCEL_P_MAX');
    expect(names).toContain('ATC_ACCEL_Y_MAX');
  });

  it('should include accel param names for quadplane', () => {
    const scheme = detectPidScheme(makeParams(['Q_A_RAT_RLL_P']));
    const names = getAllPidParamNames(scheme);
    expect(names).toContain('Q_A_ACCEL_R_MAX');
    expect(names).toContain('Q_A_ACCEL_P_MAX');
    expect(names).toContain('Q_A_ACCEL_Y_MAX');
  });

  it('should not include accel param names for legacy copter', () => {
    const scheme = detectPidScheme(makeParams(['RATE_RLL_P']));
    const names = getAllPidParamNames(scheme);
    expect(names.some(n => n.includes('ACCEL'))).toBe(false);
  });

  it('should not include accel param names for plane', () => {
    const scheme = detectPidScheme(makeParams(['RLL2SRV_P']));
    const names = getAllPidParamNames(scheme);
    expect(names.some(n => n.includes('ACCEL'))).toBe(false);
  });

  it('should still include PID param names alongside accel params', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const names = getAllPidParamNames(scheme);
    // P/I/D/FF for roll
    expect(names).toContain('ATC_RAT_RLL_P');
    expect(names).toContain('ATC_RAT_RLL_I');
    expect(names).toContain('ATC_RAT_RLL_D');
    expect(names).toContain('ATC_RAT_RLL_FF');
    // Accel
    expect(names).toContain('ATC_ACCEL_R_MAX');
    // Total: 3 axes × 4 (P/I/D/FF) + 3 accel = 15
    expect(names).toHaveLength(15);
  });
});

// ---------------------------------------------------------------------------
// buildPresetParams (existing fn - ensure it still works with accel schemes)
// ---------------------------------------------------------------------------

describe('buildPresetParams with accel-capable scheme', () => {
  it('should build PID params without including accel params', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const values = {
      roll:  { p: 0.135, i: 0.135, d: 0.0036, ff: 0 },
      pitch: { p: 0.135, i: 0.135, d: 0.0036, ff: 0 },
      yaw:   { p: 0.18, i: 0.018, d: 0, ff: 0 },
    };
    const params = buildPresetParams(scheme, values);
    // Should not contain accel params
    expect(Object.keys(params).some(k => k.includes('ACCEL'))).toBe(false);
    // Should contain PID params
    expect(params['ATC_RAT_RLL_P']).toBe(0.135);
    expect(params['ATC_RAT_PIT_I']).toBe(0.135);
    expect(params['ATC_RAT_YAW_D']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Combined PID + accel param building
// ---------------------------------------------------------------------------

describe('PID + accel param building workflow', () => {
  it('should produce separate PID and accel param sets that can be merged', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const pidValues = {
      roll:  { p: 0.08, i: 0.08, d: 0.003, ff: 0 },
      pitch: { p: 0.08, i: 0.08, d: 0.003, ff: 0 },
      yaw:   { p: 0.15, i: 0.015, d: 0, ff: 0 },
    };
    const accelValues = { roll: 80000, pitch: 80000, yaw: 20000 };

    const pidParams = buildPresetParams(scheme, pidValues);
    const accelParams = buildAccelParams(scheme, accelValues);
    const combined = { ...pidParams, ...accelParams };

    // PID params present
    expect(combined['ATC_RAT_RLL_P']).toBe(0.08);
    expect(combined['ATC_RAT_YAW_P']).toBe(0.15);
    // Accel params present
    expect(combined['ATC_ACCEL_R_MAX']).toBe(80000);
    expect(combined['ATC_ACCEL_Y_MAX']).toBe(20000);
    // Total keys: 12 PID + 3 accel = 15
    expect(Object.keys(combined)).toHaveLength(15);
  });

  it('should produce only PID params when scheme has no accel', () => {
    const scheme = detectPidScheme(makeParams(['RATE_RLL_P']));
    const pidValues = {
      roll:  { p: 0.15, i: 0.1, d: 0.004 },
      pitch: { p: 0.15, i: 0.1, d: 0.004 },
      yaw:   { p: 0.15, i: 0.015, d: 0 },
    };
    const accelValues = { roll: 110000, pitch: 110000, yaw: 27000 };

    const pidParams = buildPresetParams(scheme, pidValues);
    const accelParams = buildAccelParams(scheme, accelValues);
    const combined = { ...pidParams, ...accelParams };

    // Only PID params (legacy has no FF, so 3 axes × 3 = 9)
    expect(Object.keys(combined)).toHaveLength(9);
    expect(Object.keys(combined).some(k => k.includes('ACCEL'))).toBe(false);
  });
});
