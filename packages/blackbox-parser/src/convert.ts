/**
 * Convert a parsed Betaflight/iNav Blackbox log into the ArduPilot-shaped
 * DataFlashLog structure the rest of the app consumes (Summary, Health Report,
 * Explorer, map/globe, AI analysis).
 *
 * Synthesized ArduPilot-style aliases so the existing analysis pipeline works
 * unchanged:
 *
 * - `GPS`  from `G` frames (GPS_coord[0/1] 1e-7 deg, GPS_altitude dm,
 *   GPS_numSat, GPS_HDOP c-HDOP, GPS_speed cm/s)
 * - `BAT`  from the main frames' `vbatLatest`/`amperageLatest` (scaled per
 *   firmware version), downsampled to ~10 Hz so it doesn't bloat memory
 * - `MODE` from `FLIGHT_MODE` events (bitmask over the firmware-appropriate
 *   flight-mode name table)
 * - `EVT`  raw event frames (SYNC_BEEP, DISARM, AUTOTUNE, ...)
 *
 * Native frame data is kept 1:1 as `MAIN` (I/P frames), `SLOW` (S frames) and
 * `HOME` (H frames) message types with their original field names, so the
 * Explorer can plot gyro/PID/motor/RX traces exactly like blackbox.betaflight.com.
 */
import type {
  DataFlashLog,
  DataFlashMessage,
  FMTMessage,
  LogMetadata,
} from '@jawji/dataflash-parser';
import type { BlackboxFrame, BlackboxLog } from './types.js';
import { FLIGHT_LOG_EVENT } from './parser.js';

/** Betaflight flight-mode flag names per firmware era (see flightlog_fielddefs.js). */
const MODE_NAMES_PRE_3_3 = [
  'ARM', 'ANGLE', 'HORIZON', 'BARO', 'ANTIGRAVITY', 'MAG', 'HEADFREE', 'HEADADJ',
  'CAMSTAB', 'CAMTRIG', 'GPSHOME', 'GPSHOLD', 'PASSTHRU', 'BEEPER', 'LEDMAX',
  'LEDLOW', 'LLIGHTS', 'CALIB', 'GOV', 'OSD', 'TELEMETRY', 'GTUNE', 'SONAR',
  'SERVO1', 'SERVO2', 'SERVO3', 'BLACKBOX', 'FAILSAFE', 'AIRMODE', '3DDISABLE',
  'FPVANGLEMIX', 'BLACKBOXERASE', 'CAMERA1', 'CAMERA2', 'CAMERA3',
  'FLIPOVERAFTERCRASH', 'PREARM',
];

const MODE_NAMES_POST_3_3 = [
  'ARM', 'ANGLE', 'HORIZON', 'MAG', 'BARO', 'GPSHOME', 'GPSHOLD', 'HEADFREE',
  'PASSTHRU', 'RANGEFINDER', 'FAILSAFE', 'GPSRESCUE', 'ANTIGRAVITY', 'HEADADJ',
  'CAMSTAB', 'CAMTRIG', 'BEEPER', 'LEDMAX', 'LEDLOW', 'LLIGHTS', 'CALIB', 'GOV',
  'OSD', 'TELEMETRY', 'GTUNE', 'SERVO1', 'SERVO2', 'SERVO3', 'BLACKBOX',
  'AIRMODE', '3D', 'FPVANGLEMIX', 'BLACKBOXERASE', 'CAMERA1', 'CAMERA2',
  'CAMERA3', 'FLIPOVERAFTERCRASH', 'PREARM', 'BEEPGPSCOUNT', 'VTXPITMODE',
  'USER1', 'USER2', 'USER3', 'USER4', 'PIDAUDIO', 'ACROTRAINER',
  'VTXCONTROLDISABLE', 'LAUNCHCONTROL',
];

const MODE_NAMES_POST_4_5 = [
  'ARM', 'ANGLE', 'HORIZON', 'MAG', 'ALTHOLD', 'HEADFREE', 'CHIRP', 'PASSTHRU',
  'FAILSAFE', 'POSHOLD', 'GPSRESCUE', 'ANTIGRAVITY', 'HEADADJ', 'CAMSTAB',
  'BEEPER', 'LEDLOW', 'CALIB', 'OSD', 'TELEMETRY', 'SERVO1', 'SERVO2', 'SERVO3',
  'BLACKBOX', 'AIRMODE', '3D', 'FPVANGLEMIX', 'BLACKBOXERASE', 'CAMERA1',
  'CAMERA2', 'CAMERA3', 'FLIPOVERAFTERCRASH', 'PREARM', 'BEEPGPSCOUNT',
  'VTXPITMODE', 'USER1', 'USER2', 'USER3', 'USER4', 'PIDAUDIO', 'ACROTRAINER',
  'VTXCONTROLDISABLE', 'LAUNCHCONTROL',
];

function modeNamesFor(log: BlackboxLog): string[] {
  const { firmwareType, firmwareVersion } = log.sysConfig;
  const majorMinor = firmwareVersion.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [major = 0, minor = 0] = majorMinor;
  const atLeast = (m: number, n: number): boolean =>
    major > m || (major === m && minor >= n);
  if (firmwareType === 'betaflight') {
    if (atLeast(4, 5)) return MODE_NAMES_POST_4_5;
    if (atLeast(3, 3)) return MODE_NAMES_POST_3_3;
  }
  return MODE_NAMES_PRE_3_3;
}

/** Map a blackbox main frame (I/P) field array to a named fields record. */
function mainFrameFields(log: BlackboxLog, frame: BlackboxFrame): Record<string, number | string> {
  const names = log.frameDefs.I?.name ?? [];
  const fields: Record<string, number | string> = {};
  for (let i = 0; i < names.length && i < frame.fields.length; i++) {
    fields[names[i]!] = frame.fields[i]!;
  }
  return fields;
}

function isBetaflightAtLeast(log: BlackboxLog, m: number, n: number): boolean {
  if (log.sysConfig.firmwareType !== 'betaflight') return false;
  const parts = log.sysConfig.firmwareVersion.split('.').map((v) => Number.parseInt(v, 10) || 0);
  const [major = 0, minor = 0] = parts;
  return major > m || (major === m && minor >= n);
}

/** Convert a raw `vbatLatest` value to volts (scaling depends on firmware era). */
function vbatToVolts(log: BlackboxLog, raw: number): number {
  if (isBetaflightAtLeast(log, 4, 0)) return raw / 100;
  if (isBetaflightAtLeast(log, 3, 1)) return raw / 10;
  // Legacy: 12-bit ADC with vbatscale premultiplied by 100.
  return (raw * 33 * 10 * (log.sysConfig.vbatscale || 110)) / 0xfff / 1000;
}

/** Convert a raw `amperageLatest` value to amps. */
function amperageToAmps(log: BlackboxLog, raw: number): number {
  if (isBetaflightAtLeast(log, 3, 1)) return raw / 100;
  // Legacy: 12-bit ADC with currentMeterOffset/Scale.
  const mv = (raw * 33 * 100) / 4095 - log.sysConfig.currentMeterOffset;
  return mv / 1000;
}

/** Synthesize `GPS` messages from `G` frames. */
function buildGps(log: BlackboxLog): DataFlashMessage[] {
  const out: DataFlashMessage[] = [];
  for (const frame of log.frames) {
    if (frame.type !== 'G') continue;
    const names = log.frameDefs.G?.name ?? [];
    const get = (name: string): number | null => {
      const idx = names.indexOf(name);
      const v = idx >= 0 ? frame.fields[idx] : undefined;
      return typeof v === 'number' ? v : null;
    };
    const fields: Record<string, number | string> = {};

    const lat = get('GPS_coord[0]') ?? get('GPS_lat');
    const lng = get('GPS_coord[1]') ?? get('GPS_lon');
    const alt = get('GPS_altitude');
    const sats = get('GPS_numSat');
    const hdop = get('GPS_HDOP');
    const spd = get('GPS_speed');

    if (lat !== null) fields['Lat'] = lat / 10000000;
    if (lng !== null) fields['Lng'] = lng / 10000000;
    if (alt !== null) fields['Alt'] = alt / 10;
    if (sats !== null) fields['NSats'] = sats;
    if (hdop !== null) fields['HDop'] = hdop / 100;
    if (spd !== null) fields['Spd'] = spd / 100;
    if (Object.keys(fields).length === 0) continue;
    out.push({ type: 'GPS', timeUs: frame.timeUs, fields });
  }
  return out;
}

/** Synthesize `BAT` messages from the main frames' vbat/amperage (10 Hz cap). */
function buildBattery(log: BlackboxLog): DataFlashMessage[] {
  const names = log.frameDefs.I?.name ?? [];
  const vbatIdx = names.indexOf('vbatLatest');
  const ampIdx = names.indexOf('amperageLatest');
  if (vbatIdx === -1 && ampIdx === -1) return [];

  const out: DataFlashMessage[] = [];
  let lastTimeUs = -Infinity;
  for (const frame of log.frames) {
    if (frame.type !== 'I' && frame.type !== 'P') continue;
    // ~10 Hz is plenty for the summary/health-check consumption.
    if (frame.timeUs - lastTimeUs < 100_000) continue;
    const fields: Record<string, number | string> = {};
    const vbat = vbatIdx >= 0 ? frame.fields[vbatIdx] : undefined;
    const amp = ampIdx >= 0 ? frame.fields[ampIdx] : undefined;
    if (typeof vbat === 'number') fields['Volt'] = vbatToVolts(log, vbat);
    if (typeof amp === 'number') fields['Curr'] = amperageToAmps(log, amp);
    if (Object.keys(fields).length === 0) continue;
    out.push({ type: 'BAT', timeUs: frame.timeUs, fields });
    lastTimeUs = frame.timeUs;
  }
  // Always keep the very last sample so the end-of-flight voltage is visible.
  const last = log.frames[log.frames.length - 1];
  if (last && last.timeUs - lastTimeUs >= 100_000 && (last.type === 'I' || last.type === 'P')) {
    const fields: Record<string, number | string> = {};
    const vbat = vbatIdx >= 0 ? last.fields[vbatIdx] : undefined;
    const amp = ampIdx >= 0 ? last.fields[ampIdx] : undefined;
    if (typeof vbat === 'number') fields['Volt'] = vbatToVolts(log, vbat);
    if (typeof amp === 'number') fields['Curr'] = amperageToAmps(log, amp);
    if (Object.keys(fields).length > 0) out.push({ type: 'BAT', timeUs: last.timeUs, fields });
  }
  return out;
}

/** Synthesize `MODE` messages from FLIGHT_MODE events (bitmask flag names). */
function buildModes(log: BlackboxLog): DataFlashMessage[] {
  const names = modeNamesFor(log);
  const out: DataFlashMessage[] = [];
  for (const ev of log.events) {
    if (ev.code !== FLIGHT_LOG_EVENT.FLIGHT_MODE) continue;
    const flags = typeof ev.data['newFlags'] === 'number' ? (ev.data['newFlags'] as number) : 0;
    const active: string[] = [];
    for (let i = 0; i < names.length; i++) {
      // `1 << i` wraps for i >= 32, so mask to the low 32 bits explicitly.
      if (i >= 32) break;
      if (flags & (1 << i)) active.push(names[i]!);
    }
    if (active.length === 0) continue;
    out.push({ type: 'MODE', timeUs: ev.timeUs, fields: { Name: active.join(' + '), ModeNum: flags } });
  }
  return out;
}

/** Synthesize `EVT` messages from all event frames (FLIGHT_MODE lives on as `MODE`). */
function buildEvents(log: BlackboxLog): DataFlashMessage[] {
  const out: DataFlashMessage[] = [];
  for (const ev of log.events) {
    if (ev.code === FLIGHT_LOG_EVENT.FLIGHT_MODE) continue;
    out.push({
      type: 'EVT',
      timeUs: ev.timeUs,
      fields: { Id: ev.code, Event: FLIGHT_LOG_EVENT_NAMES[ev.code] ?? `EVENT_${ev.code}`, ...ev.data },
    });
  }
  return out;
}

/** Keep native I/P frames as `MAIN` messages. */
function buildMain(log: BlackboxLog): DataFlashMessage[] {
  const out: DataFlashMessage[] = [];
  for (const frame of log.frames) {
    if (frame.type !== 'I' && frame.type !== 'P') continue;
    out.push({ type: 'MAIN', timeUs: frame.timeUs, fields: mainFrameFields(log, frame) });
  }
  return out;
}

/** Keep S (slow) frames as `SLOW` messages. */
function buildSlow(log: BlackboxLog): DataFlashMessage[] {
  const out: DataFlashMessage[] = [];
  for (const frame of log.frames) {
    if (frame.type !== 'S') continue;
    const names = log.frameDefs.S?.name ?? [];
    const fields: Record<string, number | string> = {};
    for (let i = 0; i < names.length && i < frame.fields.length; i++) {
      fields[names[i]!] = frame.fields[i]!;
    }
    out.push({ type: 'SLOW', timeUs: frame.timeUs, fields });
  }
  return out;
}

/** Keep H (GPS home) frames as `HOME` messages. */
function buildHome(log: BlackboxLog): DataFlashMessage[] {
  const out: DataFlashMessage[] = [];
  for (const frame of log.frames) {
    if (frame.type !== 'H') continue;
    const names = log.frameDefs.H?.name ?? [];
    const fields: Record<string, number | string> = {};
    for (let i = 0; i < names.length && i < frame.fields.length; i++) {
      fields[names[i]!] = frame.fields[i]!;
    }
    out.push({ type: 'HOME', timeUs: frame.timeUs, fields });
  }
  return out;
}

const FLIGHT_LOG_EVENT_NAMES: Record<number, string> = {
  [FLIGHT_LOG_EVENT.SYNC_BEEP]: 'SYNC_BEEP',
  [FLIGHT_LOG_EVENT.AUTOTUNE_CYCLE_START]: 'AUTOTUNE_CYCLE_START',
  [FLIGHT_LOG_EVENT.AUTOTUNE_CYCLE_RESULT]: 'AUTOTUNE_CYCLE_RESULT',
  [FLIGHT_LOG_EVENT.AUTOTUNE_TARGETS]: 'AUTOTUNE_TARGETS',
  [FLIGHT_LOG_EVENT.INFLIGHT_ADJUSTMENT]: 'INFLIGHT_ADJUSTMENT',
  [FLIGHT_LOG_EVENT.LOGGING_RESUME]: 'LOGGING_RESUME',
  [FLIGHT_LOG_EVENT.DISARM]: 'DISARM',
  [FLIGHT_LOG_EVENT.GTUNE_CYCLE_RESULT]: 'GTUNE_CYCLE_RESULT',
  [FLIGHT_LOG_EVENT.FLIGHT_MODE]: 'FLIGHT_MODE',
  [FLIGHT_LOG_EVENT.TWITCH_TEST]: 'TWITCH_TEST',
  [FLIGHT_LOG_EVENT.LOG_END]: 'LOG_END',
};

/** Convert a parsed blackbox log into the DataFlashLog shape. */
export function convertBlackboxToDataFlashLog(blackbox: BlackboxLog): DataFlashLog {
  const built: DataFlashMessage[][] = [
    buildGps(blackbox),
    buildBattery(blackbox),
    buildModes(blackbox),
    buildEvents(blackbox),
  ];
  const messages = new Map<string, DataFlashMessage[]>();
  for (const group of built) {
    if (group.length > 0) messages.set(group[0]!.type, group);
  }

  // Native frame data.
  const nativeGroups: DataFlashMessage[][] = [buildMain(blackbox), buildSlow(blackbox), buildHome(blackbox)];
  for (const group of nativeGroups) {
    if (group.length > 0) messages.set(group[0]!.type, group);
  }

  const messageTypes = [...messages.keys()];
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

  const { sysConfig } = blackbox;
  const firmwareVersion = sysConfig.firmwareVersion;
  const firmwareString =
    sysConfig.firmwareRevision.length > 0
      ? sysConfig.firmwareRevision
      : sysConfig.firmwareType !== 'Unknown'
        ? `${sysConfig.firmwareType} ${firmwareVersion}`.trim()
        : firmwareVersion;

  const metadata: LogMetadata = {
    vehicleType: 'copter',
    firmwareVersion,
    firmwareString,
    boardType: sysConfig.boardInformation,
    gitHash: '',
  };

  return {
    formats,
    messages,
    metadata,
    timeRange: blackbox.timeRange,
    messageTypes,
    unitLabels: new Map(),
    multValues: new Map(),
  };
}
