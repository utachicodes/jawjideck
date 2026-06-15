import { describe, it, expect } from 'vitest';
import {
  computeMissionBriefing,
  formatDistanceM,
  formatDurationSec,
  type BriefingInput,
  type BriefingPoint,
} from './flight-briefing';

// A north-south leg of ~1113m per 0.01 deg latitude (near the equator).
function legPoints(count: number, altM = 50): BriefingPoint[] {
  return Array.from({ length: count }, (_, i) => ({ lat: i * 0.01, lng: 0, altM }));
}

const base: Omit<BriefingInput, 'located'> = {
  home: { lat: 0, lng: 0 },
  cruiseSpeedMs: 10,
  enduranceSec: 20 * 60,
};

describe('formatters', () => {
  it('formats distance with km/m thresholds', () => {
    expect(formatDistanceM(450)).toBe('450 m');
    expect(formatDistanceM(2500)).toBe('2.5 km');
    expect(formatDistanceM(42000)).toBe('42 km');
  });

  it('formats duration in min and h/min', () => {
    expect(formatDurationSec(0)).toBe('0 min');
    expect(formatDurationSec(45 * 60)).toBe('45 min');
    expect(formatDurationSec(90 * 60)).toBe('1 h 30 min');
    expect(formatDurationSec(120 * 60)).toBe('2 h');
  });
});

describe('computeMissionBriefing', () => {
  it('flags an empty mission', () => {
    const b = computeMissionBriefing({ ...base, located: [] });
    expect(b.empty).toBe(true);
    expect(b.checks).toHaveLength(0);
  });

  it('computes distance, time and altitude from the path', () => {
    const b = computeMissionBriefing({ ...base, located: legPoints(3, 80) });
    // Two 0.01-deg legs ~= 2226m.
    expect(b.distanceM).toBeGreaterThan(2200);
    expect(b.distanceM).toBeLessThan(2250);
    expect(b.flightTimeSec).toBeCloseTo(b.distanceM / 10, 5);
    expect(b.maxAltM).toBe(80);
    expect(b.maxFromHomeM).toBeGreaterThan(b.distanceM / 2);
  });

  it('needs more batteries as the mission outlasts endurance', () => {
    // ~111km of legs at 10 m/s = ~3 hours; 20-min packs -> many batteries.
    const b = computeMissionBriefing({ ...base, located: legPoints(101) });
    expect(b.batteryCount).toBeGreaterThan(1);
  });

  it('reports reserve on the final battery for a short hop', () => {
    const b = computeMissionBriefing({ ...base, located: legPoints(2) });
    expect(b.batteryCount).toBe(1);
    expect(b.reservePct).not.toBeNull();
    expect(b.reservePct!).toBeGreaterThan(90); // tiny flight, almost full reserve
  });

  it('omits the from-home check when there is no home', () => {
    const b = computeMissionBriefing({ ...base, home: null, located: legPoints(3) });
    expect(b.maxFromHomeM).toBe(0);
    expect(b.checks.find((c) => c.id === 'maxFromHome')).toBeUndefined();
  });

  it('keeps every check informational in passive mode', () => {
    const b = computeMissionBriefing({ ...base, located: legPoints(3) });
    expect(b.checks.length).toBeGreaterThan(0);
    expect(b.checks.every((c) => c.severity === 'info')).toBe(true);
  });

  it('reports altitude range, total climb and waypoint count', () => {
    const located = [
      { lat: 0, lng: 0, altM: 40 },
      { lat: 0.01, lng: 0, altM: 60 },  // +20
      { lat: 0.02, lng: 0, altM: 50 },  // -10 (not counted)
      { lat: 0.03, lng: 0, altM: 90 },  // +40
    ];
    const b = computeMissionBriefing({ ...base, located });
    expect(b.minAltM).toBe(40);
    expect(b.maxAltM).toBe(90);
    expect(b.totalClimbM).toBe(60); // 20 + 40, descents excluded
    expect(b.waypointCount).toBe(4);
  });

  it('computes daylight margin in the site timezone', () => {
    const weather = {
      windSpeedMs: 3, windGustMs: 5, windDirDeg: 270, tempC: 18, precipMm: 0,
      sunriseIso: '2026-06-15T05:00', sunsetIso: '2026-06-15T21:00',
      currentTimeIso: '2026-06-15T18:00', fetchedAtMs: 0,
    };
    // legPoints(2) is a ~1113m hop; at 10 m/s that's ~111s, negligible vs the
    // 3h window, so the mission ends ~18:01 and margin is ~179 min to 21:00.
    const b = computeMissionBriefing({ ...base, located: legPoints(2), weather });
    expect(b.daylight).not.toBeNull();
    expect(b.daylight!.nowMin).toBe(18 * 60);
    expect(b.daylight!.sunsetMin).toBe(21 * 60);
    expect(b.daylight!.marginMin).toBeGreaterThan(175);
    expect(b.daylight!.marginMin).toBeLessThan(180);
  });

  it('reports negative daylight margin when a long mission overruns sunset', () => {
    const weather = {
      windSpeedMs: 3, windGustMs: 5, windDirDeg: 270, tempC: 18, precipMm: 0,
      sunriseIso: '2026-06-15T05:00', sunsetIso: '2026-06-15T21:00',
      currentTimeIso: '2026-06-15T20:30', fetchedAtMs: 0,
    };
    // ~111km of legs at 10 m/s ~= 3h, launched at 20:30 -> ends well after 21:00.
    const b = computeMissionBriefing({ ...base, located: legPoints(101), weather });
    expect(b.daylight!.marginMin).toBeLessThan(0);
  });

  it('has no daylight window without site time', () => {
    const b = computeMissionBriefing({ ...base, located: legPoints(3) });
    expect(b.daylight).toBeNull();
  });

  it('carries survey stats and converts coverage to hectares', () => {
    const b = computeMissionBriefing({
      ...base,
      located: legPoints(3),
      survey: { gsdCm: 1.8, photoCount: 240, dataGb: 6.4, areaM2: 50_000 },
    });
    expect(b.survey).not.toBeNull();
    expect(b.survey!.coverageHa).toBe(5);
    expect(b.survey!.photoCount).toBe(240);
  });
});
