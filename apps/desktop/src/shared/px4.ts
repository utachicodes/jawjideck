/**
 * PX4 protocol helpers (HEARTBEAT autopilot = MAV_AUTOPILOT_PX4).
 *
 * PX4 differs from ArduPilot in ways that matter to a GCS:
 *   - custom_mode packs main_mode << 16 | sub_mode << 24 (px4_custom_mode.h)
 *   - integer params are sent byte-wise inside PARAM_VALUE's float field
 *   - GCS stick input uses MANUAL_CONTROL, not RC_CHANNELS_OVERRIDE
 */

import type { VehicleCapabilities } from './telemetry-types';

export const MAV_AUTOPILOT_PX4 = 12;

export const PX4_MAIN_MODE = {
  MANUAL: 1,
  ALTCTL: 2,
  POSCTL: 3,
  AUTO: 4,
  ACRO: 5,
  OFFBOARD: 6,
  STABILIZED: 7,
} as const;

export const PX4_AUTO_SUB_MODE = {
  READY: 1,
  TAKEOFF: 2,
  LOITER: 3,
  MISSION: 4,
  RTL: 5,
  LAND: 6,
  FOLLOW_TARGET: 8,
  PRECLAND: 9,
} as const;

export function px4CustomMode(mainMode: number, subMode = 0): number {
  return (((mainMode & 0xff) << 16) | ((subMode & 0xff) << 24)) >>> 0;
}

export function px4ModeParts(customMode: number): { mainMode: number; subMode: number } {
  return { mainMode: (customMode >>> 16) & 0xff, subMode: (customMode >>> 24) & 0xff };
}

export const PX4_MODE = {
  MANUAL: px4CustomMode(PX4_MAIN_MODE.MANUAL),
  STABILIZED: px4CustomMode(PX4_MAIN_MODE.STABILIZED),
  ACRO: px4CustomMode(PX4_MAIN_MODE.ACRO),
  ALTITUDE: px4CustomMode(PX4_MAIN_MODE.ALTCTL),
  POSITION: px4CustomMode(PX4_MAIN_MODE.POSCTL),
  OFFBOARD: px4CustomMode(PX4_MAIN_MODE.OFFBOARD),
  HOLD: px4CustomMode(PX4_MAIN_MODE.AUTO, PX4_AUTO_SUB_MODE.LOITER),
  MISSION: px4CustomMode(PX4_MAIN_MODE.AUTO, PX4_AUTO_SUB_MODE.MISSION),
  RETURN: px4CustomMode(PX4_MAIN_MODE.AUTO, PX4_AUTO_SUB_MODE.RTL),
  LAND: px4CustomMode(PX4_MAIN_MODE.AUTO, PX4_AUTO_SUB_MODE.LAND),
  TAKEOFF: px4CustomMode(PX4_MAIN_MODE.AUTO, PX4_AUTO_SUB_MODE.TAKEOFF),
  PRECISION_LAND: px4CustomMode(PX4_MAIN_MODE.AUTO, PX4_AUTO_SUB_MODE.PRECLAND),
  FOLLOW_ME: px4CustomMode(PX4_MAIN_MODE.AUTO, PX4_AUTO_SUB_MODE.FOLLOW_TARGET),
} as const;

const MAIN_MODE_NAMES: Record<number, string> = {
  [PX4_MAIN_MODE.MANUAL]: 'Manual',
  [PX4_MAIN_MODE.ALTCTL]: 'Altitude',
  [PX4_MAIN_MODE.POSCTL]: 'Position',
  [PX4_MAIN_MODE.ACRO]: 'Acro',
  [PX4_MAIN_MODE.OFFBOARD]: 'Offboard',
  [PX4_MAIN_MODE.STABILIZED]: 'Stabilized',
};

const AUTO_SUB_MODE_NAMES: Record<number, string> = {
  [PX4_AUTO_SUB_MODE.READY]: 'Ready',
  [PX4_AUTO_SUB_MODE.TAKEOFF]: 'Takeoff',
  [PX4_AUTO_SUB_MODE.LOITER]: 'Hold',
  [PX4_AUTO_SUB_MODE.MISSION]: 'Mission',
  [PX4_AUTO_SUB_MODE.RTL]: 'Return',
  [PX4_AUTO_SUB_MODE.LAND]: 'Land',
  [PX4_AUTO_SUB_MODE.FOLLOW_TARGET]: 'Follow Me',
  [PX4_AUTO_SUB_MODE.PRECLAND]: 'Precision Land',
};

/** Display name for a PX4 custom_mode, matching QGroundControl's names. */
export function px4ModeName(customMode: number): string {
  const { mainMode, subMode } = px4ModeParts(customMode);
  if (mainMode === PX4_MAIN_MODE.AUTO) {
    return AUTO_SUB_MODE_NAMES[subMode] ?? `Auto ${subMode}`;
  }
  if (mainMode === PX4_MAIN_MODE.POSCTL && subMode === 1) return 'Orbit';
  return MAIN_MODE_NAMES[mainMode] ?? `Mode ${mainMode}.${subMode}`;
}

/** Normalize a PX4 custom_mode so modes compare equal regardless of sub_mode noise. */
export function px4ModeKey(customMode: number): number {
  const { mainMode, subMode } = px4ModeParts(customMode);
  return mainMode === PX4_MAIN_MODE.AUTO ? px4CustomMode(mainMode, subMode) : px4CustomMode(mainMode);
}

/** Modes offered in the UI for a PX4 multicopter, in QGroundControl's order. */
export const PX4_COPTER_MODES: ReadonlyArray<{ name: string; modeNum: number }> = [
  { name: 'Position', modeNum: PX4_MODE.POSITION },
  { name: 'Altitude', modeNum: PX4_MODE.ALTITUDE },
  { name: 'Stabilized', modeNum: PX4_MODE.STABILIZED },
  { name: 'Manual', modeNum: PX4_MODE.MANUAL },
  { name: 'Acro', modeNum: PX4_MODE.ACRO },
  { name: 'Hold', modeNum: PX4_MODE.HOLD },
  { name: 'Mission', modeNum: PX4_MODE.MISSION },
  { name: 'Return', modeNum: PX4_MODE.RETURN },
  { name: 'Land', modeNum: PX4_MODE.LAND },
  { name: 'Takeoff', modeNum: PX4_MODE.TAKEOFF },
];

// MAV_PARAM_TYPE
const UINT8 = 1, INT8 = 2, UINT16 = 3, INT16 = 4, UINT32 = 5, INT32 = 6;

/**
 * Decode PARAM_VALUE.param_value bytes the PX4 way: integer types are stored
 * byte-wise in the 4-byte float field rather than converted to float.
 */
export function decodeParamBytewise(bytes: Uint8Array, paramType: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, 4);
  switch (paramType) {
    case UINT8: return view.getUint8(0);
    case INT8: return view.getInt8(0);
    case UINT16: return view.getUint16(0, true);
    case INT16: return view.getInt16(0, true);
    case UINT32: return view.getUint32(0, true);
    case INT32: return view.getInt32(0, true);
    default: return view.getFloat32(0, true);
  }
}

/** Encode a value into the 4-byte param_value field the PX4 way. */
export function encodeParamBytewise(value: number, paramType: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  const int = Math.round(value);
  switch (paramType) {
    case UINT8: view.setUint8(0, int); break;
    case INT8: view.setInt8(0, int); break;
    case UINT16: view.setUint16(0, int, true); break;
    case INT16: view.setInt16(0, int, true); break;
    case UINT32: view.setUint32(0, int, true); break;
    case INT32: view.setInt32(0, int, true); break;
    default: view.setFloat32(0, value, true);
  }
  return bytes;
}

/**
 * Convert RC PWM stick values (1000-2000, ArduPilot convention: low pitch =
 * forward) to MANUAL_CONTROL axes. z is throttle 0..1000 (500 = hover in
 * Position/Altitude), r is yaw with positive = clockwise as PX4 expects.
 */
export function pwmToManualControl(pwm: { roll: number; pitch: number; throttle: number; yaw: number }): {
  x: number; y: number; z: number; r: number;
} {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
  return {
    x: clamp((1500 - pwm.pitch) * 2, -1000, 1000),
    y: clamp((pwm.roll - 1500) * 2, -1000, 1000),
    z: clamp(pwm.throttle - 1000, 0, 1000),
    r: clamp((pwm.yaw - 1500) * 2, -1000, 1000),
  };
}

/** Flight-control capabilities for any PX4 vehicle (PX4 modes are shared across frames). */
export const PX4_CAPABILITIES: VehicleCapabilities = {
  stabilizeModeNum: PX4_MODE.STABILIZED,
  manualModeNum: PX4_MODE.MANUAL,
  guidedModeNum: PX4_MODE.HOLD, // PX4 accepts DO_REPOSITION / goto in Hold
  rtlModeNum: PX4_MODE.RETURN,
  rtlAutoLands: true,
  takeoff: { supported: true, method: 'command' },
  land: { supported: true, modeNum: PX4_MODE.LAND, label: 'Land' },
};

/** Mission run / pause modes for PX4. */
export const PX4_MISSION_MODES = { auto: PX4_MODE.MISSION, pause: PX4_MODE.HOLD, pauseLabel: 'Hold' };

/**
 * Settings PX4 needs for this app's flight controls. Each rule only flags a
 * value that blocks the feature; anything else the user chose is left alone.
 */
export interface Px4SetupRule {
  param: string;
  label: string;
  recommended: number;
  needsFix: (value: number) => boolean;
  describe: (value: number) => string;
  why: string;
}

const RC_IN_MODES: Record<number, string> = {
  0: 'RC only',
  1: 'MAVLink only',
  2: 'RC or MAVLink (fallback)',
  3: 'RC or MAVLink (keep first)',
  4: 'Disabled',
};

export const PX4_SETUP_RULES: ReadonlyArray<Px4SetupRule> = [
  {
    param: 'COM_RC_IN_MODE',
    label: 'Stick input',
    recommended: 2,
    needsFix: (v) => v === 0,
    describe: (v) => RC_IN_MODES[v] ?? String(v),
    why: 'RC only makes PX4 ignore this app\'s joystick and keyboard.',
  },
  {
    param: 'COM_DISARM_LAND',
    label: 'Auto-disarm after landing',
    recommended: 2,
    needsFix: (v) => v <= 0,
    describe: (v) => (v <= 0 ? 'Off' : `${v} s`),
    why: 'Without it the motors keep spinning after Land.',
  },
  {
    param: 'MIS_TAKEOFF_ALT',
    label: 'Default takeoff altitude',
    recommended: 2.5,
    needsFix: (v) => v < 1,
    describe: (v) => `${v} m`,
    why: 'Takeoff mode climbs to this height when none is given.',
  },
];
