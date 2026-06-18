/**
 * Tests for area-object.ts — the parametric object model + transforms.
 * Works near lat 42, lng 19 (Montenegro-ish).
 */

import { describe, it, expect } from 'vitest';
import type { LatLng } from '../components/survey/survey-types';
import { latLngToLocal } from '../components/survey/geo-math';
import { distanceLatLng } from '../components/survey/geo-math';
import {
  makeRectangle,
  makeCircle,
  makeFromWorldRing,
  objectWorldRing,
  objectLocalBBox,
  translateObject,
  rotateObject,
  scaleObjectAbout,
  convertToPolygon,
  cloneObject,
  isVertexEditable,
  bufferObject,
  splitObjectByLine,
} from './area-object';

const CENTER: LatLng = { lat: 42, lng: 19 };

/** Max east extent (meters) of an object's world ring, measured in its center frame. */
function eastExtent(centerLat: number, centerLng: number, ring: LatLng[]): number {
  const origin = { lat: centerLat, lng: centerLng };
  return Math.max(...ring.map((p) => latLngToLocal(origin, p).x));
}

describe('makeRectangle', () => {
  it('produces a 4-vertex world ring of the requested size', () => {
    const obj = makeRectangle(CENTER, 100, 40, 'R1');
    const ring = objectWorldRing(obj);
    expect(ring).toHaveLength(4);
    const bb = objectLocalBBox(obj);
    expect(bb.maxX - bb.minX).toBeCloseTo(100, 5);
    expect(bb.maxY - bb.minY).toBeCloseTo(40, 5);
  });
});

describe('makeCircle', () => {
  it('places every vertex ~radius from the center', () => {
    const obj = makeCircle(CENTER, 150, 'C1', 32);
    const ring = objectWorldRing(obj);
    expect(ring).toHaveLength(32);
    for (const v of ring) {
      const d = distanceLatLng(CENTER, v);
      expect(d).toBeGreaterThan(148);
      expect(d).toBeLessThan(152);
    }
  });
});

describe('translateObject', () => {
  it('shifts the world ring by the delta', () => {
    const obj = makeRectangle(CENTER, 100, 100, 'R');
    const moved = translateObject(obj, 0.001, 0.002);
    expect(moved.center.lat).toBeCloseTo(42.001);
    expect(moved.center.lng).toBeCloseTo(19.002);
  });
});

describe('rotateObject', () => {
  it('reorients the shape (90deg turns width into height)', () => {
    const obj = makeRectangle(CENTER, 100, 20, 'R'); // wide
    const before = eastExtent(42, 19, objectWorldRing(obj));
    const turned = rotateObject(obj, 90);
    const after = eastExtent(42, 19, objectWorldRing(turned));
    expect(before).toBeCloseTo(50, 0); // half of 100
    expect(after).toBeCloseTo(10, 0); // half of 20 now points east
  });
});

describe('scaleObjectAbout', () => {
  it('scales the base and keeps the anchor corner fixed', () => {
    const obj = makeRectangle(CENTER, 100, 100, 'R'); // corners +/-50
    const anchorCorner = objectWorldRing(obj)[0]!; // local (-50,-50)
    const scaled = scaleObjectAbout(obj, 2, 1, { x: -50, y: -50 });
    const bb = objectLocalBBox(scaled);
    expect(bb.maxX - bb.minX).toBeCloseTo(200, 5); // doubled width
    expect(bb.maxY - bb.minY).toBeCloseTo(100, 5); // unchanged height
    // anchor corner's world position is unchanged
    const anchorAfter = objectWorldRing(scaled)[0]!;
    expect(distanceLatLng(anchorCorner, anchorAfter)).toBeLessThan(0.5);
  });
});

describe('makeFromWorldRing', () => {
  it('round-trips a world ring within ~1m', () => {
    const ring: LatLng[] = [
      { lat: 42.000, lng: 19.000 },
      { lat: 42.000, lng: 19.001 },
      { lat: 42.001, lng: 19.001 },
      { lat: 42.001, lng: 19.000 },
    ];
    const obj = makeFromWorldRing('polygon', ring, 'P');
    const out = objectWorldRing(obj);
    expect(out).toHaveLength(4);
    for (let i = 0; i < ring.length; i++) {
      expect(distanceLatLng(ring[i]!, out[i]!)).toBeLessThan(1);
    }
  });
});

describe('convertToPolygon / isVertexEditable', () => {
  it('rectangles and circles are not vertex-editable until converted', () => {
    const rect = makeRectangle(CENTER, 50, 50, 'R');
    expect(isVertexEditable(rect)).toBe(false);
    const poly = convertToPolygon(rect);
    expect(poly.type).toBe('polygon');
    expect(isVertexEditable(poly)).toBe(true);
  });

  it('polygons and corridors are vertex-editable', () => {
    const poly = makeFromWorldRing('polygon', [
      { lat: 42, lng: 19 }, { lat: 42, lng: 19.001 }, { lat: 42.001, lng: 19 },
    ], 'P');
    expect(isVertexEditable(poly)).toBe(true);
    const corridor = makeFromWorldRing('corridor', [
      { lat: 42, lng: 19 }, { lat: 42.001, lng: 19.001 },
    ], 'C', { corridorWidthM: 60 });
    expect(isVertexEditable(corridor)).toBe(true);
    expect(corridor.corridorWidthM).toBe(60);
  });
});

describe('cloneObject', () => {
  it('copies geometry under a fresh id without sharing arrays', () => {
    const rect = makeRectangle(CENTER, 100, 40, 'R1');
    const copy = cloneObject(rect, 'R1 copy');
    expect(copy.id).not.toBe(rect.id);
    expect(copy.name).toBe('R1 copy');
    expect(objectWorldRing(copy)).toHaveLength(4);
    // mutating the copy's base must not touch the original
    copy.base[0]!.x = 999;
    expect(rect.base[0]!.x).not.toBe(999);
  });
});

describe('bufferObject', () => {
  it('grows the area (meters > 0) and keeps it valid', () => {
    const rect = makeRectangle(CENTER, 100, 100, 'R');
    const grown = bufferObject(rect, 20);
    expect(grown).not.toBeNull();
    const bb0 = objectLocalBBox(rect);
    const bb1 = objectLocalBBox(grown!);
    expect(bb1.maxX - bb1.minX).toBeGreaterThan(bb0.maxX - bb0.minX);
  });

  it('shrinks the area (meters < 0)', () => {
    const rect = makeRectangle(CENTER, 100, 100, 'R');
    const shrunk = bufferObject(rect, -20);
    expect(shrunk).not.toBeNull();
    const bb = objectLocalBBox(shrunk!);
    expect(bb.maxX - bb.minX).toBeLessThan(100);
  });

  it('returns null for corridors and for collapse', () => {
    const corridor = makeFromWorldRing('corridor', [{ lat: 42, lng: 19 }, { lat: 42.001, lng: 19.001 }], 'C');
    expect(bufferObject(corridor, 10)).toBeNull();
    const rect = makeRectangle(CENTER, 40, 40, 'R');
    expect(bufferObject(rect, -50)).toBeNull(); // shrink past collapse
  });
});

describe('splitObjectByLine', () => {
  // A ~200x200 m square centered at CENTER.
  const square = makeRectangle(CENTER, 200, 200, 'Sq');

  it('slices a square into two areas with a crossing line', () => {
    // Vertical-ish cut through the middle (well outside N/S edges so it crosses twice).
    const parts = splitObjectByLine(square, { lat: 42.01, lng: 19 }, { lat: 41.99, lng: 19 });
    expect(parts).not.toBeNull();
    expect(parts!).toHaveLength(2);
    expect(parts![0]!.type).toBe('polygon');
    // Combined area roughly equals the original (~40000 m^2), allowing for the cut.
    const ringArea = (r: LatLng[]): number => Math.abs(
      r.reduce((a, p, i) => {
        const q = r[(i + 1) % r.length]!;
        const o = latLngToLocal(CENTER, p);
        const o2 = latLngToLocal(CENTER, q);
        return a + (o.x * o2.y - o2.x * o.y);
      }, 0) / 2,
    );
    const total = ringArea(objectWorldRing(parts![0]!)) + ringArea(objectWorldRing(parts![1]!));
    expect(total).toBeGreaterThan(35000);
    expect(total).toBeLessThan(45000);
  });

  it('returns null when the line does not cross twice', () => {
    // Line entirely outside the square.
    expect(splitObjectByLine(square, { lat: 42.05, lng: 19.05 }, { lat: 42.06, lng: 19.06 })).toBeNull();
  });

  it('returns null for corridors', () => {
    const corridor = makeFromWorldRing('corridor', [{ lat: 42, lng: 19 }, { lat: 42.001, lng: 19.001 }], 'C');
    expect(splitObjectByLine(corridor, { lat: 42, lng: 18.9 }, { lat: 42, lng: 19.1 })).toBeNull();
  });
});
