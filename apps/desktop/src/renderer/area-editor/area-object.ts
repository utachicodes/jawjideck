/**
 * area-object — the Area Editor's object model.
 *
 * Each drawn shape is a first-class OBJECT, not a loose ring. An object is
 * stored parametrically as a local base ring (meters, centered on the origin,
 * un-rotated) plus a world `center` and `rotationDeg`. World geometry is
 * derived on demand. This makes whole-object transforms exact and keeps
 * rectangles/circles parametric (scaling adjusts the base, so a rectangle stays
 * a rectangle) until the user explicitly converts to a free polygon.
 *
 * Renderer-agnostic and pure: no React, no map library, no DOM.
 */

import type { LatLng } from '../components/survey/survey-types';
import { latLngToLocal, localToLatLng, offsetPolygon } from '../components/survey/geo-math';

export type EditorObjectType = 'polygon' | 'corridor' | 'rectangle' | 'circle';

export interface LocalPt {
  x: number; // east, meters
  y: number; // north, meters
}

export interface EditorObject {
  id: string;
  type: EditorObjectType;
  name: string;
  visible: boolean;
  /** World placement of the local origin. */
  center: LatLng;
  /** Rotation of the base ring about the origin, degrees, CCW. */
  rotationDeg: number;
  /** Local-frame outer ring (meters, centered on origin, before rotation). Open. */
  base: LocalPt[];
  /** Local-frame holes (areas/polygons only). */
  holes: LocalPt[][];
  /** Corridor swath width (meters); only meaningful for type 'corridor'. */
  corridorWidthM?: number;
  /** User-chosen fill/outline color; falls back to the index palette when unset. */
  color?: string;
}

// ---------------------------------------------------------------------------
// Local-frame math
// ---------------------------------------------------------------------------

function rot(p: LocalPt, deg: number): LocalPt {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Centroid of a local ring (simple vertex average; fine for placement). */
function localCentroid(pts: LocalPt[]): LocalPt {
  if (pts.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / pts.length, y: sy / pts.length };
}

// ---------------------------------------------------------------------------
// World <-> local
// ---------------------------------------------------------------------------

/** Map a local point through rotation + placement to a world LatLng. */
export function localToWorld(obj: EditorObject, p: LocalPt): LatLng {
  const r = rot(p, obj.rotationDeg);
  return localToLatLng(obj.center, r.x, r.y);
}

/** Inverse of localToWorld: a world LatLng back into the object's local frame. */
export function worldToLocal(obj: EditorObject, p: LatLng): LocalPt {
  const placed = latLngToLocal(obj.center, p); // relative to center, still rotated
  return rot(placed, -obj.rotationDeg); // un-rotate
}

/** The object's outer ring in world coordinates. */
export function objectWorldRing(obj: EditorObject): LatLng[] {
  return obj.base.map((p) => localToWorld(obj, p));
}

/** The object's holes in world coordinates. */
export function objectWorldHoles(obj: EditorObject): LatLng[][] {
  return obj.holes.map((h) => h.map((p) => localToWorld(obj, p)));
}

/** Axis-aligned bounding box of the base ring (local, un-rotated frame). */
export function objectLocalBBox(obj: EditorObject): { minX: number; minY: number; maxX: number; maxY: number } {
  if (obj.base.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of obj.base) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// ---------------------------------------------------------------------------
// Transforms (pure; return a new object)
// ---------------------------------------------------------------------------

/** Move the whole object by a world delta. */
export function translateObject(obj: EditorObject, dLat: number, dLng: number): EditorObject {
  return { ...obj, center: { lat: obj.center.lat + dLat, lng: obj.center.lng + dLng } };
}

/** Rotate the whole object by an incremental angle (degrees). */
export function rotateObject(obj: EditorObject, deltaDeg: number): EditorObject {
  return { ...obj, rotationDeg: obj.rotationDeg + deltaDeg };
}

/**
 * Scale the object's base about a fixed LOCAL anchor (kept invariant). Because
 * the anchor stays fixed in the local frame and center/rotation are unchanged,
 * the anchor's WORLD position is unchanged too — so dragging a corner handle
 * keeps the opposite corner pinned. sx/sy are clamped to a small positive min.
 */
export function scaleObjectAbout(obj: EditorObject, sx: number, sy: number, anchor: LocalPt): EditorObject {
  const cx = Math.max(sx, 0.001);
  const cy = Math.max(sy, 0.001);
  const map = (p: LocalPt): LocalPt => ({
    x: (p.x - anchor.x) * cx + anchor.x,
    y: (p.y - anchor.y) * cy + anchor.y,
  });
  return { ...obj, base: obj.base.map(map), holes: obj.holes.map((h) => h.map(map)) };
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

function newId(): string {
  return crypto.randomUUID();
}

/** Rectangle of width×height meters, axis-aligned, centered at `center`. */
export function makeRectangle(center: LatLng, widthM: number, heightM: number, name: string): EditorObject {
  const hw = widthM / 2;
  const hh = heightM / 2;
  return {
    id: newId(),
    type: 'rectangle',
    name,
    visible: true,
    center,
    rotationDeg: 0,
    base: [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ],
    holes: [],
  };
}

/** Circle (segments-gon) of radius meters, centered at `center`. */
export function makeCircle(center: LatLng, radiusM: number, name: string, segments = 48): EditorObject {
  const base: LocalPt[] = [];
  for (let i = 0; i < segments; i++) {
    const ang = (2 * Math.PI * i) / segments;
    base.push({ x: radiusM * Math.cos(ang), y: radiusM * Math.sin(ang) });
  }
  return { id: newId(), type: 'circle', name, visible: true, center, rotationDeg: 0, base, holes: [] };
}

/** Build an object from a world-space ring (its centroid becomes the center). */
export function makeFromWorldRing(
  type: EditorObjectType,
  ring: LatLng[],
  name: string,
  opts?: { holes?: LatLng[][]; corridorWidthM?: number },
): EditorObject {
  const centroid = ringCentroidWorld(ring);
  const base = ring.map((p) => latLngToLocal(centroid, p));
  const holes = (opts?.holes ?? []).map((h) => h.map((p) => latLngToLocal(centroid, p)));
  const obj: EditorObject = {
    id: newId(),
    type,
    name,
    visible: true,
    center: centroid,
    rotationDeg: 0,
    base,
    holes,
  };
  if (opts?.corridorWidthM !== undefined) obj.corridorWidthM = opts.corridorWidthM;
  return obj;
}

/** World centroid of a ring (vertex average in local meters, mapped back). */
export function ringCentroidWorld(ring: LatLng[]): LatLng {
  if (ring.length === 0) return { lat: 0, lng: 0 };
  const origin = ring[0]!;
  const c = localCentroid(ring.map((p) => latLngToLocal(origin, p)));
  return localToLatLng(origin, c.x, c.y);
}

/**
 * Convert a parametric object to a free polygon: same geometry, but typed
 * 'polygon' so per-vertex editing is allowed.
 */
export function convertToPolygon(obj: EditorObject): EditorObject {
  return { ...obj, type: 'polygon' };
}

/** Deep-copy an object under a fresh id (for Duplicate). */
export function cloneObject(obj: EditorObject, name?: string): EditorObject {
  return {
    ...obj,
    id: newId(),
    name: name ?? obj.name,
    center: { ...obj.center },
    base: obj.base.map((p) => ({ ...p })),
    holes: obj.holes.map((h) => h.map((p) => ({ ...p }))),
  };
}

/** Whether per-vertex editing is allowed (parametric shapes are locked). */
export function isVertexEditable(obj: EditorObject): boolean {
  return obj.type === 'polygon' || obj.type === 'corridor';
}

// ---------------------------------------------------------------------------
// Buffer (offset) + Split — operate in the object's local meters frame
// ---------------------------------------------------------------------------

function signedArea2D(ring: LocalPt[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Validate an offset ring: >=3 pts, same winding, real area, and the area moved
 * in the expected DIRECTION. The direction check is what catches an over-shrink
 * that the simple miter offset reflects into a same-winding *larger* polygon.
 */
function offsetOk(ring: LocalPt[], refArea: number, expandExpected: boolean): boolean {
  if (ring.length < 3) return false;
  const a = signedArea2D(ring);
  if (Math.sign(a) !== Math.sign(refArea) || Math.abs(a) < 1) return false;
  return expandExpected ? Math.abs(a) > Math.abs(refArea) : Math.abs(a) < Math.abs(refArea);
}

/**
 * Grow (meters > 0) or shrink (meters < 0) a closed area by a distance.
 * The outer ring offsets outward and holes offset inward (so a hole shrinks as
 * the area grows). Returns null for corridors or if the offset collapses.
 * offsetPolygon's positive distance SHRINKS, so we negate for the outer ring.
 */
export function bufferObject(obj: EditorObject, meters: number): EditorObject | null {
  if (obj.type === 'corridor' || obj.base.length < 3) return null;
  const outer = offsetPolygon(obj.base, -meters) as LocalPt[];
  if (!offsetOk(outer, signedArea2D(obj.base), meters > 0)) return null;
  const holes: LocalPt[][] = [];
  for (const h of obj.holes) {
    if (h.length < 3) continue;
    const oh = offsetPolygon(h, meters) as LocalPt[];
    // A hole grows when the area shrinks, and vice versa.
    if (offsetOk(oh, signedArea2D(h), meters < 0)) holes.push(oh);
  }
  return { ...obj, base: outer, holes };
}

function segIntersect(a: LocalPt, b: LocalPt, c: LocalPt, d: LocalPt): (LocalPt & { t: number }) | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null; // parallel / collinear
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * rx, y: a.y + t * ry, t };
}

function pointInRing(pt: LocalPt, ring: LocalPt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]!;
    const pj = ring[j]!;
    if (pi.y > pt.y !== pj.y > pt.y && pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y) + pi.x) {
      inside = !inside;
    }
  }
  return inside;
}

function centroid(ring: LocalPt[]): LocalPt {
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p.x;
    y += p.y;
  }
  return { x: x / ring.length, y: y / ring.length };
}

/**
 * Slice a closed area with a straight line (two world points) into two areas.
 * The line must cross the boundary exactly twice (a simple cut). Holes are
 * assigned to whichever half contains their centroid. Returns null if the cut
 * isn't a clean two-crossing slice (caller treats as a no-op).
 */
export function splitObjectByLine(obj: EditorObject, p1: LatLng, p2: LatLng): EditorObject[] | null {
  if (obj.type === 'corridor') return null;
  const ring = obj.base;
  const n = ring.length;
  if (n < 3) return null;

  const a = worldToLocal(obj, p1);
  const b = worldToLocal(obj, p2);

  const cuts: { k: number; pt: LocalPt; t: number }[] = [];
  for (let k = 0; k < n; k++) {
    const hit = segIntersect(a, b, ring[k]!, ring[(k + 1) % n]!);
    if (hit) cuts.push({ k, pt: { x: hit.x, y: hit.y }, t: hit.t });
  }
  if (cuts.length !== 2) return null;
  cuts.sort((x, y) => x.t - y.t);
  const c1 = cuts[0]!;
  const c2 = cuts[1]!;
  if (c1.k === c2.k) return null;

  const forward = (start: number, end: number): LocalPt[] => {
    const out: LocalPt[] = [];
    const count = ((end - start + n) % n) + 1;
    for (let s = 0; s < count; s++) out.push(ring[(((start + s) % n) + n) % n]!);
    return out;
  };

  const ringA: LocalPt[] = [c1.pt, ...forward(c1.k + 1, c2.k), c2.pt];
  const ringB: LocalPt[] = [c2.pt, ...forward(c2.k + 1, c1.k), c1.pt];
  if (ringA.length < 3 || ringB.length < 3) return null;

  const build = (localRing: LocalPt[], suffix: string): EditorObject => {
    const world = localRing.map((p) => localToWorld(obj, p));
    const holes = obj.holes
      .filter((h) => h.length >= 3 && pointInRing(centroid(h), localRing))
      .map((h) => h.map((p) => localToWorld(obj, p)));
    const built = makeFromWorldRing('polygon', world, `${obj.name} ${suffix}`, { holes });
    return obj.color ? { ...built, color: obj.color } : built;
  };

  return [build(ringA, 'A'), build(ringB, 'B')];
}
