import { describe, it, expect } from 'vitest';
import type { ParsedLog } from '../../stores/log-store';
import { getModeTimeline, getFlightPath, haversineM } from './log-utils';
import { computeLogSummary, formatDuration } from './log-summary';

// Copter log with a simple 60s flight: climb to 50m, circle ~100m away, land.
// GPS at 1Hz, BAT at 2Hz, MODE: STABILIZE (0) -> ALT_HOLD (2) -> LOITER (5).
function makeLog(): ParsedLog {
  const startUs = 1_000_000;
  const gps = Array.from({ length: 61 }, (_, i) => {
    const t = startUs + i * 1_000_000;
    const alt = i < 10 ? i * 5 : i < 50 ? 50 : 50 - (i - 50) * 5;
    // Walk ~5m east per second from home (0.00005 deg lat ≈ 5.5m)
    const lat = 47.5 + (i * 0.00005);
    return {
      type: 'GPS' as const,
      timeUs: t,
      fields: { Lat: lat, Lng: 8.5, Alt: alt, NSats: i < 5 ? 7 : 12, HDop: i < 5 ? 2.1 : 0.9, Spd: i < 10 ? 3 : 8 },
    };
  });
  const bat = Array.from({ length: 121 }, (_, i) => ({
    type: 'BAT' as const,
    timeUs: startUs + i * 500_000,
    fields: { Volt: i < 60 ? 12.5 : 11.9, Curr: i < 10 ? 2 : 15, CurrTot: i * 20 },
  }));
  const modes = [
    { type: 'MODE' as const, timeUs: startUs, fields: { ModeNum: 0 } },
    { type: 'MODE' as const, timeUs: startUs + 10_000_000, fields: { ModeNum: 2 } },
    { type: 'MODE' as const, timeUs: startUs + 30_000_000, fields: { ModeNum: 5 } },
  ];
  return {
    formats: {},
    messages: { GPS: gps, BAT: bat, MODE: modes },
    metadata: { vehicleType: 'copter', firmwareVersion: '4.5.7', firmwareString: 'ArduCopter V4.5.7', boardType: 'Pixhawk1', gitHash: 'abc123' },
    timeRange: { startUs, endUs: startUs + 60_000_000 },
    messageTypes: ['GPS', 'BAT', 'MODE'],
    unitLabels: {},
    multValues: {},
  };
}

describe('getFlightPath', () => {
  it('extracts valid lat/lng/alt tuples and skips zero fixes', () => {
    const log = makeLog();
    log.messages['GPS']![5]!.fields['Lat'] = 0;
    const path = getFlightPath(log);
    expect(path.length).toBe(60);
    expect(path[0]).toEqual([47.5, 8.5, 0]);
  });
});

describe('getModeTimeline', () => {
  it('builds segments with vehicle-aware names and colors', () => {
    const segs = getModeTimeline(makeLog());
    expect(segs.map((s) => s.name)).toEqual(['STABILIZE', 'ALT_HOLD', 'LOITER']);
    expect(segs[0]!.startS).toBe(1);
    expect(segs[0]!.endS).toBe(11);
    expect(segs[2]!.endS).toBe(61);
    expect(segs[1]!.color).toBe('#3b82f6');
  });

  it('returns empty array when no MODE messages', () => {
    const log = makeLog();
    delete log.messages['MODE'];
    expect(getModeTimeline(log)).toEqual([]);
  });
});

describe('haversineM', () => {
  it('computes ~111.2 km per degree of latitude', () => {
    expect(haversineM(0, 0, 1, 0)).toBeGreaterThan(110000);
    expect(haversineM(0, 0, 1, 0)).toBeLessThan(112000);
  });
});

describe('computeLogSummary', () => {
  it('computes duration, altitude, speed, and battery stats', () => {
    const s = computeLogSummary(makeLog());
    expect(s.durationS).toBe(60);
    expect(s.flightTimeS).toBe(60);
    expect(s.maxAltM).toBe(50);
    expect(s.minAltM).toBe(0);
    expect(s.maxSpeedMs).toBe(8);
    expect(s.battery).toMatchObject({ minVolt: 11.9, maxVolt: 12.5, maxCurr: 15, consumedMah: 2400 });
  });

  it('computes GPS distance stats and satellite range', () => {
    const s = computeLogSummary(makeLog());
    expect(s.gps!.maxSats).toBe(12);
    expect(s.gps!.minSats).toBe(7);
    expect(s.gps!.minHDop).toBe(0.9);
    expect(s.gps!.maxHDop).toBe(2.1);
    // 60 steps x ~5.5m ≈ 330m flown
    expect(s.gps!.distanceFlownM).toBeGreaterThan(300);
    expect(s.gps!.distanceFlownM).toBeLessThan(360);
    // max distance from home ≈ full path length for a straight line
    expect(s.gps!.maxDistanceFromHomeM).toBeGreaterThan(300);
  });

  it('computes mode stats sorted by duration', () => {
    const s = computeLogSummary(makeLog());
    // LOITER runs 31s→61s (30s), ALT_HOLD 11s→31s (20s), STABILIZE 1s→11s (10s)
    expect(s.modeStats.map((m) => m.name)).toEqual(['LOITER', 'ALT_HOLD', 'STABILIZE']);
    expect(s.modeStats[0]!.seconds).toBe(30);
    expect(s.modeStats[0]!.fraction).toBeCloseTo(30 / 60, 5);
  });

  it('handles logs without GPS/BAT gracefully', () => {
    const log = makeLog();
    delete log.messages['GPS'];
    delete log.messages['BAT'];
    const s = computeLogSummary(log);
    expect(s.gps).toBeNull();
    expect(s.battery).toBeNull();
    expect(s.maxAltM).toBeNull();
    expect(s.flightTimeS).toBeNull();
    expect(s.modeStats.length).toBe(3);
  });
});

describe('formatDuration', () => {
  it('formats seconds into h/m/s strings', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(125)).toBe('2m 5s');
    expect(formatDuration(3725)).toBe('1h 2m 5s');
  });
});
