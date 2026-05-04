/**
 * Calibration parameter taxonomy for ArduPilot.
 *
 * Used by the "Load calibration from file" flow to:
 *   1. Filter a generic .param file down to only the params that encode
 *      sensor calibration (offsets, scales, ellipsoid fit, etc.).
 *   2. Group those params by sensor (accel / gyro / mag) so the UI can
 *      show "N accel + M gyro + K mag" and let the user opt in per sensor.
 *   3. Identify which params are *hardware identity* (DEV_IDs) — these are
 *      only valid to copy if the source and target FCs have the same
 *      physical chips. Surfaced as a separate user-controlled toggle.
 *   4. Provide the *lock-in* params that must be written alongside the
 *      cal data to stop ArduPilot from auto-recalibrating / auto-learning
 *      over the loaded values on the next boot.
 *
 * Why this matters: ArduPilot accepts PARAM_SET on cal params just fine,
 * but several runtime systems will overwrite them unless explicitly
 * disabled — `INS_GYR_CAL >= 1` recalibrates the gyro at every boot,
 * `COMPASS_LEARN != 0` drifts compass offsets during flight. Without
 * forcing those flags, "loaded" calibration is silently lost.
 */

export type CalibrationCategory = 'accel' | 'gyro' | 'mag';

export type CalibrationParamKind =
  | 'offset'   // X/Y/Z bias values from cal
  | 'scale'    // X/Y/Z scaling factors (accel only)
  | 'ellipsoid'// COMPASS_DIA_*/ODI_* — ellipsoid fit
  | 'mot'      // COMPASS_MOT_* — motor compensation
  | 'devid'    // hardware identity (chip ID); risky to clone
  | 'enable'   // INS_USE* / COMPASS_USE — enables the instance
  | 'caltemp'  // INS_GYR{N}_CALTEMP — temperature at cal
  | 'tcal';    // INS_TCAL{N}_* — temperature compensation table

export interface CalibrationParamInfo {
  category: CalibrationCategory;
  kind: CalibrationParamKind;
  /** 1, 2, or 3 — IMU/compass instance. */
  instance: 1 | 2 | 3;
}

/**
 * Lock-in parameters: written automatically alongside the loaded cal so
 * ArduPilot doesn't drift / overwrite the values at boot or in flight.
 *
 *  - INS_GYR_CAL=0 → never auto-recalibrate gyro at boot
 *      (default is 1=power-on, which would clobber loaded INS_GYROFFS_*)
 *  - COMPASS_LEARN=0 → no live in-flight compass learning
 *      (default is 0 in modern AP, but file dumps from older builds may
 *       carry 1/2/3 which would actively un-load the values we wrote).
 *
 * NOTE: We intentionally do NOT touch COMPASS_USE or INS_USE here. Whether
 * an instance is enabled is a *vehicle config* decision, not a cal lock —
 * if the user's file has them, the regular per-category apply will write
 * them; if not, we leave whatever the FC has now.
 */
export const CALIBRATION_LOCK_FLAGS: ReadonlyArray<{
  paramId: string;
  value: number;
  /** Which categories trigger this lock-in being applied. */
  appliesTo: ReadonlyArray<CalibrationCategory>;
  reason: string;
}> = [
  { paramId: 'INS_GYR_CAL', value: 0, appliesTo: ['gyro'], reason: 'Disable boot-time gyro recalibration so loaded offsets persist' },
  { paramId: 'COMPASS_LEARN', value: 0, appliesTo: ['mag'], reason: 'Disable in-flight compass learning so loaded offsets persist' },
];

// ── Pattern matching ─────────────────────────────────────────────────────────

interface Rule {
  test: (id: string) => RegExpMatchArray | null;
  category: CalibrationCategory;
  kind: CalibrationParamKind;
  /** Captured-group index (1-based) holding the instance digit, or 0 for "always 1". */
  instanceGroup: number;
}

// Order matters: more-specific patterns first. Each rule describes a single
// param family and how to extract the IMU/compass instance from the name.
const RULES: ReadonlyArray<Rule> = [
  // ── Accel ──
  // INS_ACCOFFS_X/Y/Z (instance 1), INS_ACC{2,3}OFFS_X/Y/Z
  { test: id => id.match(/^INS_ACC([23])?OFFS_[XYZ]$/), category: 'accel', kind: 'offset', instanceGroup: 1 },
  // INS_ACCSCAL_X/Y/Z (instance 1), INS_ACC{2,3}SCAL_X/Y/Z
  { test: id => id.match(/^INS_ACC([23])?SCAL_[XYZ]$/), category: 'accel', kind: 'scale', instanceGroup: 1 },
  // INS_ACC_ID, INS_ACC2_ID, INS_ACC3_ID
  { test: id => id.match(/^INS_ACC([23])?_ID$/), category: 'accel', kind: 'devid', instanceGroup: 1 },
  // INS_USE, INS_USE2, INS_USE3 — toggles the IMU as a whole. We attribute
  // these to the accel category (UI-wise the user enables/disables the IMU
  // when applying accel cal). Gyro shares the same INS_USE flags.
  { test: id => id.match(/^INS_USE([23])?$/), category: 'accel', kind: 'enable', instanceGroup: 1 },

  // ── Gyro ──
  // INS_GYROFFS_X/Y/Z (instance 1), INS_GYR{2,3}OFFS_X/Y/Z
  { test: id => id.match(/^INS_GYR([23])?OFFS_[XYZ]$/), category: 'gyro', kind: 'offset', instanceGroup: 1 },
  // INS_GYR_ID, INS_GYR2_ID, INS_GYR3_ID
  { test: id => id.match(/^INS_GYR([23])?_ID$/), category: 'gyro', kind: 'devid', instanceGroup: 1 },
  // INS_GYR_CALTEMP (instance 1 — naming oddity), INS_GYR1_CALTEMP, INS_GYR2_CALTEMP, INS_GYR3_CALTEMP.
  // The instance-1 form has both `INS_GYR_CALTEMP` and `INS_GYR1_CALTEMP`
  // depending on AP version; we accept either.
  { test: id => id.match(/^INS_GYR([123])?_CALTEMP$/), category: 'gyro', kind: 'caltemp', instanceGroup: 1 },
  // INS_TCAL1_*, INS_TCAL2_*, INS_TCAL3_* (temperature compensation tables)
  { test: id => id.match(/^INS_TCAL([123])_/), category: 'gyro', kind: 'tcal', instanceGroup: 1 },

  // ── Compass / Mag ──
  // COMPASS_OFS_X/Y/Z (instance 1), COMPASS_OFS{2,3}_X/Y/Z
  { test: id => id.match(/^COMPASS_OFS([23])?_[XYZ]$/), category: 'mag', kind: 'offset', instanceGroup: 1 },
  // COMPASS_DIA_X/Y/Z, COMPASS_DIA{2,3}_X/Y/Z (ellipsoid diagonal)
  { test: id => id.match(/^COMPASS_DIA([23])?_[XYZ]$/), category: 'mag', kind: 'ellipsoid', instanceGroup: 1 },
  // COMPASS_ODI_X/Y/Z, COMPASS_ODI{2,3}_X/Y/Z (ellipsoid off-diagonal)
  { test: id => id.match(/^COMPASS_ODI([23])?_[XYZ]$/), category: 'mag', kind: 'ellipsoid', instanceGroup: 1 },
  // COMPASS_MOT_X/Y/Z, COMPASS_MOT{2,3}_X/Y/Z (motor interference compensation)
  { test: id => id.match(/^COMPASS_MOT([23])?_[XYZ]$/), category: 'mag', kind: 'mot', instanceGroup: 1 },
  // COMPASS_DEV_ID, COMPASS_DEV_ID2, COMPASS_DEV_ID3
  { test: id => id.match(/^COMPASS_DEV_ID([23])?$/), category: 'mag', kind: 'devid', instanceGroup: 1 },
  // COMPASS_USE, COMPASS_USE2, COMPASS_USE3
  { test: id => id.match(/^COMPASS_USE([23])?$/), category: 'mag', kind: 'enable', instanceGroup: 1 },
];

/**
 * Classify a param ID into a calibration category. Returns null if the
 * param is not a recognized calibration param. The matching is exact-name
 * (no prefix wildcards) so unrelated params like INS_ACC_BODYFIX, COMPASS_ENABLE,
 * INS_GYRO_RATE etc. are correctly rejected.
 */
export function categorizeCalibrationParam(paramId: string): CalibrationParamInfo | null {
  for (const rule of RULES) {
    const m = rule.test(paramId);
    if (!m) continue;
    const captured = rule.instanceGroup > 0 ? m[rule.instanceGroup] : undefined;
    const instance = captured ? (Number(captured) as 1 | 2 | 3) : 1;
    return { category: rule.category, kind: rule.kind, instance };
  }
  return null;
}

/** Convenience: just a boolean. */
export function isCalibrationParam(paramId: string): boolean {
  return categorizeCalibrationParam(paramId) !== null;
}

/**
 * Returns the lock-in flags that should be written when applying any of
 * the given categories. Flags whose `appliesTo` doesn't intersect with
 * `applying` are skipped — e.g., applying accel-only doesn't touch
 * COMPASS_LEARN.
 */
export function getLockFlagsForCategories(
  applying: ReadonlyArray<CalibrationCategory>,
): ReadonlyArray<{ paramId: string; value: number; reason: string }> {
  const set = new Set(applying);
  return CALIBRATION_LOCK_FLAGS
    .filter(f => f.appliesTo.some(c => set.has(c)))
    .map(({ paramId, value, reason }) => ({ paramId, value, reason }));
}
