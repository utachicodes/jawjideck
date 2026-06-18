/**
 * Tests for the grid generator's margin (polygon buffer) and plane-mode turn
 * alignment. Geometry sanity only — exact waypoint coordinates depend on the
 * camera/overlap math covered elsewhere.
 */
import { describe, it, expect } from 'vitest';
import { generateGrid } from './grid-generator';
import { DEFAULT_SURVEY_CONFIG, type SurveyConfig, type LatLng } from '../survey-types';
import { latLngToLocal, polygonCentroid } from '../geo-math';

// ~300 m square near 47°N (big enough for several scan lines at the default camera).
const SQUARE: LatLng[] = [
  { lat: 47.0000, lng: 8.0000 },
  { lat: 47.0000, lng: 8.0040 },
  { lat: 47.0027, lng: 8.0040 },
  { lat: 47.0027, lng: 8.0000 },
];

// A slanted parallelogram so adjacent scan lines end at different offsets
// (this is where plane-mode turn alignment changes the path).
const SLANT: LatLng[] = [
  { lat: 47.0000, lng: 8.0000 },
  { lat: 47.0000, lng: 8.0040 },
  { lat: 47.0027, lng: 8.0060 },
  { lat: 47.0027, lng: 8.0020 },
];

function cfg(polygon: LatLng[], over: Partial<SurveyConfig> = {}): SurveyConfig {
  return { ...DEFAULT_SURVEY_CONFIG, polygon, ...over };
}

/** East-west span (m) of the waypoint set in the polygon's local frame. */
function localXSpan(polygon: LatLng[], wps: LatLng[]): number {
  const o = polygonCentroid(polygon);
  const xs = wps.map((p) => latLngToLocal(o, p).x);
  return Math.max(...xs) - Math.min(...xs);
}

describe('grid margin', () => {
  it('positive margin grows coverage, negative shrinks it', () => {
    const base = generateGrid(cfg(SQUARE, { margin: 0 }));
    const grown = generateGrid(cfg(SQUARE, { margin: 30 }));
    const shrunk = generateGrid(cfg(SQUARE, { margin: -30 }));

    const baseSpan = localXSpan(SQUARE, base.waypoints);
    const grownSpan = localXSpan(SQUARE, grown.waypoints);
    const shrunkSpan = localXSpan(SQUARE, shrunk.waypoints);

    expect(grownSpan).toBeGreaterThan(baseSpan);
    expect(shrunkSpan).toBeLessThan(baseSpan);
  });

  it('an over-shrink that would collapse the polygon falls back to no offset', () => {
    // 300 m square shrunk by 1 km -> degenerate; generator keeps the original.
    const collapsed = generateGrid(cfg(SQUARE, { margin: -1000 }));
    const base = generateGrid(cfg(SQUARE, { margin: 0 }));
    expect(collapsed.waypoints.length).toBe(base.waypoints.length);
  });
});

describe('grid plane-mode turns', () => {
  it('plane mode lengthens the path vs copter on a slanted polygon', () => {
    const copter = generateGrid(cfg(SLANT, { gridMode: 'copter' }));
    const plane = generateGrid(cfg(SLANT, { gridMode: 'plane' }));
    // Extending the shorter line end at each turn can only add distance.
    expect(plane.stats.flightDistance).toBeGreaterThan(copter.stats.flightDistance);
    expect(plane.waypoints.length).toBe(copter.waypoints.length); // same WP count, just shifted
  });

  it('on an axis-aligned rectangle the ends already match (no extra distance)', () => {
    const copter = generateGrid(cfg(SQUARE, { gridMode: 'copter' }));
    const plane = generateGrid(cfg(SQUARE, { gridMode: 'plane' }));
    expect(plane.stats.flightDistance).toBeCloseTo(copter.stats.flightDistance, 0);
  });
});
