/**
 * Flight log summary computation — the "Flight Review" style at-a-glance
 * stats for a parsed ArduPilot .bin log. Pure functions over the parsed log
 * so they're unit-testable without React.
 */
import { getModeTimeline, haversineM, type ModeSegment } from './log-utils';
import type { ParsedLog } from '../../stores/log-store';

export interface BatteryStats {
  minVolt: number;
  maxVolt: number;
  maxCurr: number;
  /** mAh consumed — from CurrTot if logged, else integrated from Curr. */
  consumedMah: number;
  /** Downsampled time series for charting. */
  timeS: number[];
  volt: number[];
  curr: number[];
}

export interface GpsStats {
  minSats: number;
  maxSats: number;
  minHDop: number;
  maxHDop: number;
  /** Total distance flown along the path (m). */
  distanceFlownM: number;
  /** Max straight-line distance from the first valid GPS fix (m). */
  maxDistanceFromHomeM: number;
  /** Downsampled altitude (MSL) series for charting. */
  timeS: number[];
  alt: number[];
}

export interface ModeStat {
  name: string;
  color: string;
  seconds: number;
  /** 0..1 share of total flight time. */
  fraction: number;
}

export interface LogSummary {
  vehicleType: string;
  firmwareVersion: string;
  firmwareString: string;
  boardType: string;
  gitHash: string;
  /** Total log duration in seconds (from timeRange). */
  durationS: number;
  /** Duration from first to last GPS fix in seconds (null when no GPS). */
  flightTimeS: number | null;
  maxAltM: number | null;
  minAltM: number | null;
  maxClimbRateMs: number | null;
  maxSpeedMs: number | null;
  battery: BatteryStats | null;
  gps: GpsStats | null;
  modeSegments: ModeSegment[];
  modeStats: ModeStat[];
}

const SAMPLE_CAP = 2000;

/** Downsample a series to at most `cap` points (uniform stride). */
function downsample(time: number[], values: number[], cap = SAMPLE_CAP): { time: number[]; values: number[] } {
  if (time.length <= cap) return { time, values };
  const stride = time.length / cap;
  const outT: number[] = [];
  const outV: number[] = [];
  for (let i = 0; i < time.length; i += stride) {
    outT.push(time[Math.floor(i)]!);
    outV.push(values[Math.floor(i)]!);
  }
  if (outT[outT.length - 1] !== time[time.length - 1]) {
    outT.push(time[time.length - 1]!);
    outV.push(values[values.length - 1]!);
  }
  return { time: outT, values: outV };
}

function num(msg: { fields: Record<string, number | string> }, key: string): number | null {
  const v = msg.fields[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function computeBattery(log: ParsedLog): BatteryStats | null {
  const bat = log.messages['BAT'];
  if (!bat || bat.length === 0) return null;
  let minVolt = Infinity;
  let maxVolt = -Infinity;
  let maxCurr = 0;
  let consumedMah = 0;
  let lastTimeS = -1;
  const timeS: number[] = [];
  const volt: number[] = [];
  const curr: number[] = [];
  for (const m of bat) {
    const v = num(m, 'Volt');
    const c = num(m, 'Curr');
    if (v === null && c === null) continue;
    const t = m.timeUs / 1_000_000;
    if (v !== null) {
      minVolt = Math.min(minVolt, v);
      maxVolt = Math.max(maxVolt, v);
    }
    if (c !== null) {
      maxCurr = Math.max(maxCurr, c);
      const tot = num(m, 'CurrTot');
      if (tot !== null) {
        consumedMah = Math.max(consumedMah, tot);
      } else if (lastTimeS >= 0) {
        consumedMah += (c * (t - lastTimeS)) / 3.6;
      }
    }
    lastTimeS = t;
    timeS.push(t);
    volt.push(v ?? NaN);
    curr.push(c ?? NaN);
  }
  if (minVolt === Infinity) return null;
  const ds = downsample(timeS, volt);
  const dsCurr = downsample(timeS, curr);
  return {
    minVolt,
    maxVolt,
    maxCurr,
    consumedMah: Math.round(consumedMah),
    timeS: ds.time,
    volt: ds.values,
    curr: dsCurr.values,
  };
}

function computeGps(log: ParsedLog): GpsStats | null {
  const gps = log.messages['GPS'];
  if (!gps || gps.length === 0) return null;
  let minSats = Infinity;
  let maxSats = 0;
  let minHDop = Infinity;
  let maxHDop = 0;
  let homeLat: number | null = null;
  let homeLng: number | null = null;
  let distanceFlown = 0;
  let maxDistHome = 0;
  let prevLat: number | null = null;
  let prevLng: number | null = null;
  const timeS: number[] = [];
  const alt: number[] = [];
  for (const m of gps) {
    const lat = num(m, 'Lat');
    const lng = num(m, 'Lng');
    const sats = num(m, 'NSats');
    const hdop = num(m, 'HDop');
    if (sats !== null) {
      minSats = Math.min(minSats, sats);
      maxSats = Math.max(maxSats, sats);
    }
    if (hdop !== null) {
      minHDop = Math.min(minHDop, hdop);
      maxHDop = Math.max(maxHDop, hdop);
    }
    if (lat !== null && lng !== null && lat !== 0 && lng !== 0) {
      if (homeLat === null) { homeLat = lat; homeLng = lng; }
      if (prevLat !== null && prevLng !== null) {
        distanceFlown += haversineM(prevLat, prevLng, lat, lng);
      }
      maxDistHome = Math.max(maxDistHome, haversineM(homeLat!, homeLng!, lat, lng));
      prevLat = lat;
      prevLng = lng;
    }
    const a = num(m, 'Alt');
    timeS.push(m.timeUs / 1_000_000);
    alt.push(a ?? NaN);
  }
  if (homeLat === null) return null;
  const ds = downsample(timeS, alt);
  return {
    minSats: minSats === Infinity ? 0 : minSats,
    maxSats,
    minHDop: minHDop === Infinity ? 0 : minHDop,
    maxHDop,
    distanceFlownM: Math.round(distanceFlown),
    maxDistanceFromHomeM: Math.round(maxDistHome),
    timeS: ds.time,
    alt: ds.values,
  };
}

export function computeLogSummary(log: ParsedLog): LogSummary {
  // Altitude sources, in preference order: GPS.Alt (MSL), ALT.Alt, CTUN.Alt.
  let altSource: { timeS: number[]; alt: number[] } | null = null;
  const gpsMsg = log.messages['GPS'];
  if (gpsMsg && gpsMsg.length > 0) {
    const times: number[] = [];
    const alts: number[] = [];
    for (const m of gpsMsg) {
      const a = num(m, 'Alt');
      times.push(m.timeUs / 1_000_000);
      alts.push(a ?? NaN);
    }
    const ds = downsample(times, alts);
    altSource = { timeS: ds.time, alt: ds.values };
  }
  if (!altSource && log.messages['ALT']) {
    const altMsgs = log.messages['ALT']!;
    const times: number[] = [];
    const alts: number[] = [];
    for (const m of altMsgs) {
      const a = num(m, 'Alt');
      times.push(m.timeUs / 1_000_000);
      alts.push(a ?? NaN);
    }
    const ds = downsample(times, alts);
    altSource = { timeS: ds.time, alt: ds.values };
  }
  if (!altSource && log.messages['CTUN']) {
    const altMsgs = log.messages['CTUN']!;
    const times: number[] = [];
    const alts: number[] = [];
    for (const m of altMsgs) {
      const a = num(m, 'Alt');
      times.push(m.timeUs / 1_000_000);
      alts.push(a ?? NaN);
    }
    const ds = downsample(times, alts);
    altSource = { timeS: ds.time, alt: ds.values };
  }

  let maxAltM: number | null = null;
  let minAltM: number | null = null;
  for (const a of altSource?.alt ?? []) {
    if (!Number.isFinite(a)) continue;
    maxAltM = maxAltM === null ? a : Math.max(maxAltM, a);
    minAltM = minAltM === null ? a : Math.min(minAltM, a);
  }

  // Climb rate from GPS altitude deltas (m/s between consecutive fixes).
  let maxClimbRateMs: number | null = null;
  if (gpsMsg && gpsMsg.length > 1) {
    let prev: { t: number; a: number } | null = null;
    for (const m of gpsMsg) {
      const a = num(m, 'Alt');
      if (a === null) continue;
      const t = m.timeUs / 1_000_000;
      if (prev) {
        const dt = t - prev.t;
        if (dt > 0.05 && dt < 10) {
          const rate = (a - prev.a) / dt;
          maxClimbRateMs = maxClimbRateMs === null ? rate : Math.max(maxClimbRateMs, Math.abs(rate));
        }
      }
      prev = { t, a };
    }
  }

  // Speed sources: GPS.Spd (ground), VFR.GSpd, ARSP.Airspeed.
  let maxSpeedMs: number | null = null;
  for (const [type, key] of [['GPS', 'Spd'], ['VFR', 'GSpd'], ['ARSP', 'Airspeed']] as const) {
    const msgs = log.messages[type];
    if (!msgs) continue;
    for (const m of msgs) {
      const s = num(m, key);
      if (s !== null && s > 0) maxSpeedMs = maxSpeedMs === null ? s : Math.max(maxSpeedMs, s);
    }
    if (maxSpeedMs !== null) break;
  }

  const modeSegments = getModeTimeline(log);
  const modeStats: ModeStat[] = [];
  for (const seg of modeSegments) {
    const existing = modeStats.find((ms) => ms.name === seg.name);
    if (existing) existing.seconds += Math.max(0, seg.endS - seg.startS);
    else modeStats.push({ name: seg.name, color: seg.color, seconds: Math.max(0, seg.endS - seg.startS), fraction: 0 });
  }
  const totalModeS = modeStats.reduce((sum, ms) => sum + ms.seconds, 0);
  for (const ms of modeStats) {
    ms.fraction = totalModeS > 0 ? ms.seconds / totalModeS : 0;
  }
  modeStats.sort((a, b) => b.seconds - a.seconds);

  const durationS = Math.max(0, (log.timeRange.endUs - log.timeRange.startUs) / 1_000_000);

  const gps = computeGps(log);
  const flightTimeS =
    gpsMsg && gpsMsg.length > 1
      ? (gpsMsg[gpsMsg.length - 1]!.timeUs - gpsMsg[0]!.timeUs) / 1_000_000
      : null;

  return {
    vehicleType: log.metadata.vehicleType,
    firmwareVersion: log.metadata.firmwareVersion,
    firmwareString: log.metadata.firmwareString,
    boardType: log.metadata.boardType,
    gitHash: log.metadata.gitHash,
    durationS,
    flightTimeS,
    maxAltM,
    minAltM,
    maxClimbRateMs: maxClimbRateMs !== null ? Math.round(maxClimbRateMs * 10) / 10 : null,
    maxSpeedMs,
    battery: computeBattery(log),
    gps,
    modeSegments,
    modeStats,
  };
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
