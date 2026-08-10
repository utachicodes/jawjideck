/**
 * Shared helpers for log analysis: flight path extraction, mode timelines,
 * and mode colors. Used by the Summary tab, Explorer charts, and the map/
 * globe panels so every view renders the same modes with the same colors.
 */
import { getModeName } from '@jawji/dataflash-parser';
import type { ParsedLog } from '../../stores/log-store';

/** Fixed color per flight mode name. New/unknown modes fall back to gray. */
export const MODE_COLORS: Record<string, string> = {
  STABILIZE: '#6b7280', ALT_HOLD: '#3b82f6', LOITER: '#10b981', AUTO: '#8b5cf6',
  RTL: '#f59e0b', LAND: '#ef4444', GUIDED: '#ec4899', POSHOLD: '#06b6d4',
  ACRO: '#f97316', CIRCLE: '#84cc16', BRAKE: '#6366f1', SMART_RTL: '#fbbf24',
  AUTO_RTL: '#a78bfa', ZIGZAG: '#f472b6', FOLLOW: '#22d3ee', DRIFT: '#94a3b8',
  SPORT: '#fb7185', FLIP: '#e879f9', AUTOTUNE: '#34d399', THROW: '#fca5a5',
  FLOWHOLD: '#38bdf8', MANUAL: '#9ca3af', FBWA: '#4f46e5', FBWB: '#7c3aed',
  CRUISE: '#0ea5e9', TRAINING: '#a3a3a3', LOITER_ALT_QLND: '#059669',
};

export interface ModeSegment {
  startS: number;
  endS: number;
  name: string;
  color: string;
}

/** Vehicle-aware mode timeline from MODE messages, in seconds. */
export function getModeTimeline(log: ParsedLog | null): ModeSegment[] {
  if (!log) return [];
  const modes = log.messages['MODE'];
  if (!modes || modes.length === 0) return [];
  const endTimeS = log.timeRange.endUs / 1_000_000;
  const vehicleType = log.metadata.vehicleType || 'copter';
  const segments: ModeSegment[] = [];
  for (let i = 0; i < modes.length; i++) {
    const m = modes[i]!;
    // ULog conversion emits an explicit mode Name; ArduPilot logs carry ModeNum.
    const name =
      typeof m.fields['Name'] === 'string' && m.fields['Name'].length > 0
        ? (m.fields['Name'] as string)
        : getModeName((typeof m.fields['ModeNum'] === 'number' ? m.fields['ModeNum'] : m.fields['Mode']) as number, vehicleType);
    const startS = m.timeUs / 1_000_000;
    const endS = i + 1 < modes.length ? (modes[i + 1]!.timeUs / 1_000_000) : endTimeS;
    segments.push({ startS, endS, name, color: MODE_COLORS[name] ?? '#6b7280' });
  }
  return segments;
}

/** Flight path as [lat, lng, altMsl] tuples, filtered to valid GPS fixes. */
export function getFlightPath(log: ParsedLog | null): [number, number, number][] {
  if (!log) return [];
  const gps = log.messages['GPS'];
  if (!gps) return [];
  const path: [number, number, number][] = [];
  for (const msg of gps) {
    const lat = msg.fields['Lat'];
    const lng = msg.fields['Lng'];
    const alt = msg.fields['Alt'];
    if (typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0) {
      path.push([lat, lng, typeof alt === 'number' ? alt : 0]);
    }
  }
  return path;
}

/** Haversine distance in meters between two lat/lng pairs. */
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
