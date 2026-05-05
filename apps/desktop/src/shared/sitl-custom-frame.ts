/**
 * SITL Custom Frame
 *
 * JSON frame definition for ArduPilot SITL multicopter physics. Mirrors the
 * format used in `Tools/autotest/models/Callisto.json` and friends. Loaded by
 * SITL via `--model <type>:<absolute path>`.
 *
 * Source of truth: libraries/SITL/SIM_Frame.h (Model struct fields).
 */

export interface SitlCustomFrame {
  /** Vehicle mass in kg. Drives thrust-to-weight, hover throttle, etc. */
  mass: number;
  /** Diagonal motor-to-motor distance in meters. */
  diagonal_size: number;
  /** Reference forward speed (m/s) for drag tuning. */
  refSpd: number;
  /** Reference attitude angle (deg) at refSpd for drag tuning. */
  refAngle: number;
  /** Reference voltage (V) used for thrust scaling. */
  refVoltage: number;
  /** Reference current draw (A) at hover. */
  refCurrent: number;
  /** Reference altitude (m) for atmospheric model. */
  refAlt: number;
  /** Reference temperature (C) for atmospheric model. */
  refTempC: number;
  /** Battery internal resistance (ohms). Larger = more sag under load. */
  refBatRes: number;
  /** Pack max voltage at full charge. CRITICAL for high-voltage simulation. */
  maxVoltage: number;
  /** Battery capacity in amp-hours. */
  battCapacityAh: number;
  /** Propeller exponent. ~0.5 for typical multirotor props. */
  propExpo: number;
  /** Reference rotation rate (deg/s) for tuning. */
  refRotRate: number;
  /** Hover throttle (0-1). Used for thrust linearization. */
  hoverThrOut: number;
  /** Motor PWM range. */
  pwmMin: number;
  pwmMax: number;
  /** Motor spin output normalization (0-1). */
  spin_min: number;
  spin_max: number;
  /** Slew rate limit. */
  slew_max: number;
  /** Total propeller disc area in m^2. */
  disc_area: number;
  /** Momentum drag coefficient. */
  mdrag_coef: number;
  /** Number of motors. Determines SITL --model type (quad=4, hexa=6, octa=8). */
  num_motors: number;
}

export interface SitlCustomFrameMeta {
  /** Filename without .json extension, used as identifier. */
  id: string;
  /** Human-friendly display name. */
  name: string;
  /** When the file was last saved (ISO timestamp). */
  updatedAt: string;
  /** Path on disk. Absolute, used for SITL --model. */
  path: string;
}

export interface SitlCustomFrameRecord extends SitlCustomFrameMeta {
  frame: SitlCustomFrame;
}

/**
/**
 * Templates: starting points for new frames. Names map to user-visible labels.
 * Values come from upstream ArduPilot defaults where available; the heavy octa
 * matches Callisto.json (32.5 kg industrial octocopter).
 */
export const SITL_FRAME_TEMPLATES: Record<string, { name: string; frame: SitlCustomFrame }> = {
  small_quad: {
    name: 'Small Quad (default)',
    frame: {
      mass: 1.5,
      diagonal_size: 0.4,
      refSpd: 15.0,
      refAngle: 45.0,
      refVoltage: 12.6,
      refCurrent: 30.0,
      refAlt: 0,
      refTempC: 25,
      refBatRes: 0.025,
      maxVoltage: 12.6,
      battCapacityAh: 5.0,
      propExpo: 0.65,
      refRotRate: 360,
      hoverThrOut: 0.39,
      pwmMin: 1000,
      pwmMax: 2000,
      spin_min: 0.15,
      spin_max: 0.95,
      slew_max: 150,
      disc_area: 0.05,
      mdrag_coef: 0.10,
      num_motors: 4,
    },
  },
  hexa: {
    name: 'Hexa (medium cinema)',
    frame: {
      mass: 4.5,
      diagonal_size: 0.65,
      refSpd: 18.0,
      refAngle: 35.0,
      refVoltage: 22.2,
      refCurrent: 45.0,
      refAlt: 0,
      refTempC: 25,
      refBatRes: 0.020,
      maxVoltage: 25.2,
      battCapacityAh: 16.0,
      propExpo: 0.5,
      refRotRate: 200,
      hoverThrOut: 0.40,
      pwmMin: 1000,
      pwmMax: 2000,
      spin_min: 0.15,
      spin_max: 0.95,
      slew_max: 100,
      disc_area: 0.30,
      mdrag_coef: 0.10,
      num_motors: 6,
    },
  },
  heavy_octa: {
    name: 'Heavy-lift Octa (Callisto class)',
    frame: {
      mass: 32.5,
      diagonal_size: 1.325,
      refSpd: 25.0,
      refAngle: 30.0,
      refVoltage: 46.9,
      refCurrent: 65.36,
      refAlt: 26,
      refTempC: 25,
      refBatRes: 0.024,
      maxVoltage: 50.4,
      battCapacityAh: 44,
      propExpo: 0.5,
      refRotRate: 120,
      hoverThrOut: 0.36,
      pwmMin: 1000,
      pwmMax: 1940,
      spin_min: 0.2,
      spin_max: 0.975,
      slew_max: 75,
      disc_area: 1.82,
      mdrag_coef: 0.10,
      num_motors: 8,
    },
  },
  heavy_industrial_14s: {
    name: 'Heavy Industrial Octa 14S',
    frame: {
      mass: 60,
      diagonal_size: 1.6,
      refSpd: 15.0,
      refAngle: 25.0,
      refVoltage: 51.8,
      refCurrent: 120,
      refAlt: 26,
      refTempC: 25,
      refBatRes: 0.015,
      maxVoltage: 60.9,
      battCapacityAh: 56,
      propExpo: 0.5,
      refRotRate: 90,
      hoverThrOut: 0.55,
      pwmMin: 1100,
      pwmMax: 1940,
      spin_min: 0.20,
      spin_max: 0.95,
      slew_max: 50,
      disc_area: 2.5,
      mdrag_coef: 0.10,
      num_motors: 8,
    },
  },
};

/**
 * Map num_motors → SITL --model frame type prefix. SITL uses these to pick
 * the right motor mixer & layout.
 */
export function frameTypeForMotors(numMotors: number): string {
  switch (numMotors) {
    case 4: return 'quad';
    case 6: return 'hexa';
    case 8: return 'octa';
    default: return 'quad';
  }
}

/**
 * Validate a parsed JSON object against the SitlCustomFrame shape. Returns
 * the typed frame on success, or a list of error strings.
 */
export function validateFrame(obj: unknown): { ok: true; frame: SitlCustomFrame } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['Not a JSON object'] };
  }
  const o = obj as Record<string, unknown>;
  const requiredNumeric: (keyof SitlCustomFrame)[] = [
    'mass', 'diagonal_size', 'refSpd', 'refAngle', 'refVoltage', 'refCurrent',
    'refAlt', 'refTempC', 'refBatRes', 'maxVoltage', 'battCapacityAh', 'propExpo',
    'refRotRate', 'hoverThrOut', 'pwmMin', 'pwmMax', 'spin_min', 'spin_max',
    'slew_max', 'disc_area', 'mdrag_coef', 'num_motors',
  ];
  for (const key of requiredNumeric) {
    if (typeof o[key] !== 'number' || !Number.isFinite(o[key] as number)) {
      errors.push(`Missing or non-numeric field: ${key}`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, frame: o as unknown as SitlCustomFrame };
}
