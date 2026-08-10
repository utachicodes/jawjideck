/**
 * Convert a parsed ULog (PX4) file into the ArduPilot-shaped DataFlashLog
 * structure the rest of the app consumes (Summary, Health Report, Explorer,
 * map/globe, AI analysis). Native ULog topics are kept 1:1 as message types;
 * a few ArduPilot-style aliases are synthesized so the existing analysis
 * pipeline works unchanged:
 *
 * - `GPS`  from `vehicle_gps_position` (lat/lon deg, MSL alt m, sats, HDop, ground speed)
 * - `BAT`  from `battery_status` (Volt, Curr, CurrTot mAh)
 * - `MODE` from `vehicle_status` nav_state while armed (Name = PX4 mode name)
 *
 * Health checks degrade gracefully (skip) when a synthesized type is absent,
 * and metadata is mapped from ULog info messages where possible.
 */
import type {
  DataFlashLog,
  DataFlashMessage,
  FMTMessage,
  LogMetadata,
} from '@jawji/dataflash-parser';
import type { ULogData, ULogDataMessage } from './types.js';

/**
 * High-rate raw sensor streams that add huge message counts for little
 * analysis value (their data is already present in `sensor_combined` at a
 * sane rate). Subscriptions are still tracked so msg ids stay aligned.
 */
export const IGNORED_ULOG_TOPICS = new Set([
  'sensor_gyro',
  'sensor_accel',
  'sensor_baro',
  'sensor_mag',
  'vehicle_imu',
]);

/**
 * PX4 navigation state enums (vehicle_status.nav_state / commander_state.main_state).
 *
 * PX4 >= ~v1.16/1.18 restructured vehicle_status and renumbered nav_state, so the
 * table is chosen by the fields present in the log's own format definition:
 * `valid_nav_states_mask`/`armed_time` indicate the new layout.
 */
const PX4_NAV_STATES_OLD: Record<number, string> = {
  0: 'MANUAL',
  1: 'ALTCTL',
  2: 'POSCTL',
  3: 'AUTO_MISSION',
  4: 'AUTO_LOITER',
  5: 'AUTO_RTL',
  6: 'POSCTL_SLOW',
  7: 'AUTO_FOLLOW_TARGET',
  8: 'OFFBOARD',
  9: 'AUTO_TAKEOFF',
  10: 'AUTO_LAND',
  11: 'AUTO_PRECLAND',
  12: 'AUTO_VTOL_CRUISE',
  13: 'AUTO_VTOL_TAKEOFF',
  14: 'AUTO_VTOL_LAND',
  15: 'AUTO_FIXEDWING_TAKEOFF',
  16: 'AUTO_FIXEDWING_LAND',
  17: 'AUTO_FIXEDWING_LOITER',
  18: 'AUTO_ORBIT',
  19: 'AUTO_DESCEND',
  20: 'AUTO_VTOL_DESCEND',
  21: 'AUTO_RTGS',
};

const PX4_NAV_STATES_NEW: Record<number, string> = {
  0: 'MANUAL',
  1: 'ALTCTL',
  2: 'POSCTL',
  3: 'AUTO_MISSION',
  4: 'AUTO_LOITER',
  5: 'AUTO_RTL',
  6: 'POSITION_SLOW',
  7: 'FREE5',
  8: 'ALTITUDE_CRUISE',
  9: 'FREE3',
  10: 'ACRO',
  11: 'FREE2',
  12: 'DESCEND',
  13: 'TERMINATION',
  14: 'OFFBOARD',
  15: 'STAB',
  16: 'FREE1',
  17: 'AUTO_TAKEOFF',
  18: 'AUTO_LAND',
  19: 'AUTO_FOLLOW_TARGET',
  20: 'AUTO_PRECLAND',
  21: 'ORBIT',
  22: 'AUTO_VTOL_TAKEOFF',
  23: 'EXTERNAL1',
  24: 'EXTERNAL2',
  25: 'EXTERNAL3',
  26: 'EXTERNAL4',
  27: 'EXTERNAL5',
  28: 'EXTERNAL6',
  29: 'EXTERNAL7',
  30: 'EXTERNAL8',
};

function navStateTable(ulog: ULogData): Record<number, string> {
  const fmt = ulog.formats.get('vehicle_status');
  if (fmt && fmt.fields.some((f) => f.name === 'valid_nav_states_mask' || f.name === 'armed_time')) {
    return PX4_NAV_STATES_NEW;
  }
  return PX4_NAV_STATES_OLD;
}

function num(msg: ULogDataMessage, key: string): number | null {
  const v = msg.fields[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Synthesize `GPS` messages from `vehicle_gps_position`.
 *
 * The topic's field layout changed in newer PX4: `lat`/`lon` (int32, 1e-7 deg)
 * and `alt` (int32, mm) became `latitude_deg`/`longitude_deg` (double, deg) and
 * `altitude_msl_m` (double, m). The declared format type decides the scaling,
 * so both layouts (and mixed versions) convert correctly.
 */
function buildGps(ulog: ULogData): ULogDataMessage[] {
  const src = ulog.messages['vehicle_gps_position'];
  if (!src) return [];
  const fmt = ulog.formats.get('vehicle_gps_position');
  const typeOf = (name: string): string | undefined => fmt?.fields.find((f) => f.name === name)?.type;
  const latIsInt = typeOf('lat') === 'int32_t';
  const lngIsInt = typeOf('lon') === 'int32_t';
  const altIsMm = typeOf('alt') === 'int32_t';
  const hdopType = typeOf('hdop');
  // Old layout: uint16_t in centi-units. New layout: float in plain units.
  const hdopIsInt = hdopType !== 'float' && hdopType !== 'double';
  const out: ULogDataMessage[] = [];
  for (const m of src) {
    const sats = num(m, 'satellites_used');
    const hdop = num(m, 'hdop');
    const spd = num(m, 'vel_m_s');
    const fix = num(m, 'fix_type');
    const fields: Record<string, number | string> = {};

    const lat = num(m, 'lat') ?? num(m, 'latitude_deg');
    if (lat !== null) fields['Lat'] = latIsInt ? lat / 1e7 : lat;
    const lng = num(m, 'lon') ?? num(m, 'longitude_deg');
    if (lng !== null) fields['Lng'] = lngIsInt ? lng / 1e7 : lng;
    const alt = num(m, 'alt') ?? num(m, 'altitude_msl_m');
    if (alt !== null) fields['Alt'] = altIsMm ? alt / 1e3 : alt;
    if (sats !== null) fields['NSats'] = sats;
    if (hdop !== null) fields['HDop'] = hdopIsInt ? hdop / 100 : hdop;
    if (spd !== null) fields['Spd'] = spd;
    if (fix !== null) fields['Status'] = fix;
    if (Object.keys(fields).length > 0) out.push({ type: 'GPS', timeUs: m.timeUs, fields });
  }
  return out;
}

/** Synthesize `BAT` messages from `battery_status` (first battery instance). */
function buildBattery(ulog: ULogData): ULogDataMessage[] {
  const src = ulog.messages['battery_status'];
  if (!src) return [];
  const out: ULogDataMessage[] = [];
  for (const m of src) {
    const volt = num(m, 'voltage_v') ?? num(m, 'voltage_filtered_v');
    const curr = num(m, 'current_a') ?? num(m, 'current_filtered_a');
    const consumed = num(m, 'discharged_mah');
    const fields: Record<string, number | string> = {};
    if (volt !== null) fields['Volt'] = volt;
    if (curr !== null) fields['Curr'] = curr;
    if (consumed !== null) fields['CurrTot'] = consumed;
    if (Object.keys(fields).length > 0) out.push({ type: 'BAT', timeUs: m.timeUs, fields });
  }
  return out;
}

/** Synthesize `MODE` messages from `vehicle_status` nav_state while armed. */
function buildModes(ulog: ULogData): ULogDataMessage[] {
  const src = ulog.messages['vehicle_status'] ?? ulog.messages['commander_state'];
  if (!src) return [];
  const navStates = navStateTable(ulog);
  const out: ULogDataMessage[] = [];
  let armed = false;
  let lastMode: number | null = null;
  let emittedArmedMode = false;
  const hasArming = src.some((m) => typeof m.fields['arming_state'] === 'number');
  for (const m of src) {
    const arming = num(m, 'arming_state');
    const mode = num(m, 'nav_state') ?? num(m, 'main_state');
    if (arming !== null) armed = arming === 2; // PX4: ARMING_STATE_ARMED = 2 (old and new layouts)
    if (mode === null) continue;
    if (hasArming && !armed) {
      // No mode changes while disarmed (matches ArduPilot MODE semantics).
      lastMode = mode;
      continue;
    }
    if (mode !== lastMode || (hasArming && !emittedArmedMode)) {
      const name = navStates[mode] ?? `NAV_${mode}`;
      out.push({
        type: 'MODE',
        timeUs: m.timeUs,
        fields: { ModeNum: mode, Name: name },
      });
      emittedArmedMode = true;
    }
    lastMode = mode;
  }
  return out;
}

/** Determine vehicle type from the first vehicle_status message. */
function vehicleTypeFrom(ulog: ULogData): string {
  const vs = ulog.messages['vehicle_status'];
  if (!vs || vs.length === 0) return '';
  const m = vs[0]!;
  if (num(m, 'is_rotary_wing')) return 'copter';
  if (num(m, 'is_vtol') || num(m, 'is_fixed_wing')) return 'plane';
  // Newer PX4 dropped the per-type booleans for a single vehicle_type field.
  const vt = num(m, 'vehicle_type');
  if (vt === 1) return 'copter'; // VEHICLE_TYPE_ROTARY_WING
  if (vt === 2) return 'plane'; // VEHICLE_TYPE_FIXED_WING
  if (vt === 3) return 'rover'; // VEHICLE_TYPE_ROVER
  return '';
}

/** Format `ver_sw_release` (0xAABBCCTT) as `vX.Y.Z`, or fall back to ver_sw. */
function firmwareVersionFrom(ulog: ULogData): string {
  const release = ulog.info['ver_sw_release'];
  if (typeof release === 'number' && release > 0) {
    const major = (release >> 24) & 0xff;
    const minor = (release >> 16) & 0xff;
    const patch = (release >> 8) & 0xff;
    return `v${major}.${minor}.${patch}`;
  }
  const verSw = ulog.info['ver_sw'];
  if (typeof verSw === 'string' && verSw.length > 0) return verSw;
  return '';
}

/** Convert a parsed ULog file into the DataFlashLog shape. */
export function convertUlogToDataFlashLog(ulog: ULogData): DataFlashLog {
  const messages = new Map<string, DataFlashMessage[]>();

  // Synthesized ArduPilot-style aliases first.
  for (const built of [buildGps(ulog), buildBattery(ulog), buildModes(ulog)]) {
    if (built.length > 0) {
      messages.set(built[0]!.type, built.map((m) => ({ type: m.type, timeUs: m.timeUs, fields: m.fields })));
    }
  }

  // Native topics, verbatim.
  const messageTypes: string[] = [...messages.keys()];
  for (const [key, msgs] of Object.entries(ulog.messages)) {
    messageTypes.push(key);
    messages.set(
      key,
      msgs.map((m) => ({ type: key, timeUs: m.timeUs, fields: m.fields })),
    );
  }

  // Synthesized formats (only name/fields are consumed downstream).
  const formats = new Map<number, FMTMessage>();
  let id = 0;
  for (const type of messageTypes) {
    const first = messages.get(type)?.[0];
    formats.set(id, {
      id,
      name: type,
      length: 0,
      format: '',
      fields: first ? Object.keys(first.fields) : [],
    });
    id++;
  }

  const firmwareVersion = firmwareVersionFrom(ulog);
  const sysName = ulog.info['sys_name'];
  const metadata: LogMetadata = {
    vehicleType: vehicleTypeFrom(ulog),
    firmwareVersion,
    firmwareString:
      typeof sysName === 'string' && sysName.length > 0
        ? `${sysName} ${firmwareVersion}`.trim()
        : firmwareVersion,
    boardType: typeof ulog.info['ver_hw'] === 'string' ? (ulog.info['ver_hw'] as string) : '',
    gitHash: '',
  };

  return {
    formats,
    messages,
    metadata,
    timeRange: ulog.timeRange,
    messageTypes,
    unitLabels: new Map(),
    multValues: new Map(),
  };
}
