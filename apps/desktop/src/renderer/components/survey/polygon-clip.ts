/**
 * Polygon Clipping for Survey Grid Lines
 * Clips horizontal scan lines against a polygon boundary using scan-line intersection.
 */

interface Point2D {
  x: number;
  y: number;
}

/**
 * Find X intersections of a horizontal line at Y with polygon edges.
 * Returns sorted X coordinates where the line enters/exits the polygon.
 */
function scanLineIntersections(polygon: Point2D[], y: number): number[] {
  const intersections: number[] = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;

    // Check if edge crosses the scan line
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      // Calculate X intersection using linear interpolation
      const t = (y - a.y) / (b.y - a.y);
      const x = a.x + t * (b.x - a.x);
      intersections.push(x);
    }
  }

  // Sort for proper pairing (enter/exit)
  intersections.sort((a, b) => a - b);
  return intersections;
}

export interface ClippedSegment {
  x1: number;
  x2: number;
  y: number;
}

/**
 * Clip horizontal scan lines against a polygon boundary.
 * Returns line segments that are inside the polygon.
 *
 * @param polygon - Vertices in local 2D coordinates
 * @param lineSpacing - Distance between scan lines (meters)
 * @param overshoot - Extra distance past polygon edges (meters)
 * @returns Array of clipped line segments
 */
export function clipScanLines(
  polygon: Point2D[],
  lineSpacing: number,
  overshoot: number = 0,
  holes: Point2D[][] = [],
): ClippedSegment[] {
  if (polygon.length < 3 || lineSpacing <= 0) return [];

  // Find bounding box
  let minY = Infinity, maxY = -Infinity;
  for (const p of polygon) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const segments: ClippedSegment[] = [];

  // Start from half a line spacing inside the bounding box
  const startY = minY + lineSpacing / 2;

  for (let y = startY; y < maxY; y += lineSpacing) {
    // Combine the outer-boundary crossings with each hole's crossings and sort.
    // Even-odd pairing over the merged list yields the spans that are inside the
    // polygon AND outside every hole - so scan lines automatically break around
    // no-fly holes. (A hole crossing flips parity, turning a hole span into a
    // gap.)
    const xs = scanLineIntersections(polygon, y);
    if (xs.length < 2) continue;
    for (const hole of holes) {
      if (hole.length >= 3) xs.push(...scanLineIntersections(hole, y));
    }
    xs.sort((a, b) => a - b);

    const lastIdx = xs.length - 1;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      // Overshoot only extends the true outer ends of the line (first/last
      // crossings), never the hole-induced split points.
      const x1 = xs[i]! - (i === 0 ? overshoot : 0);
      const x2 = xs[i + 1]! + (i + 1 === lastIdx ? overshoot : 0);
      segments.push({ x1, x2, y });
    }
  }

  return segments;
}

// ── Boustrophedon routing over disconnected regions ──────────────────────────

/**
 * Order clipped scan segments into a sensible single-pass flight path.
 *
 * The naive approach — emit segments in (y, x) order and alternate direction by
 * index — only works for a convex polygon, where every scan row yields exactly
 * one inside-span. For a concave or branching boundary (corridors, multi-arm
 * areas), a single row crosses several disjoint arms, and the naive serpentine
 * connects the end of one arm straight to the next arm ON THE SAME ROW. That
 * draws long horizontal deadheads across the empty interior on every row — the
 * vehicle would actually fly them.
 *
 * Instead we group segments into connected components (an "arm" = segments on
 * adjacent rows whose x-intervals overlap), serpentine within each arm, then
 * stitch the arms together greedily by nearest endpoint. Cross-void traversals
 * drop from one-per-row to roughly one-per-arm-boundary.
 *
 * Returns oriented segments: x1 is the entry, x2 the exit, in traversal order
 * (so x1 may be greater than x2).
 */
export function routeScanSegments(
  segments: ClippedSegment[],
  lineSpacing: number,
): ClippedSegment[] {
  if (segments.length <= 1) return segments;

  // Union-find over segment indices.
  const parent = segments.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[i] !== r) { const n = parent[i]!; parent[i] = r; i = n; }
    return r;
  };
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };

  // Group segment indices by their (shared) row y, rows ascending.
  const rows = new Map<number, number[]>();
  segments.forEach((s, i) => {
    const bucket = rows.get(s.y);
    if (bucket) bucket.push(i);
    else rows.set(s.y, [i]);
  });
  const ys = [...rows.keys()].sort((a, b) => a - b);

  // Two segments on adjacent rows belong to the same arm if their x-intervals
  // overlap. Rows separated by more than ~1.5 line spacings (a pinch where the
  // boundary produced no span) are treated as disconnected.
  const overlaps = (a: ClippedSegment, b: ClippedSegment) =>
    Math.min(a.x1, a.x2) <= Math.max(b.x1, b.x2) &&
    Math.min(b.x1, b.x2) <= Math.max(a.x1, a.x2);

  for (let r = 0; r + 1 < ys.length; r++) {
    const y0 = ys[r]!;
    const y1 = ys[r + 1]!;
    if (y1 - y0 > lineSpacing * 1.5) continue;
    for (const i of rows.get(y0)!) {
      for (const j of rows.get(y1)!) {
        if (overlaps(segments[i]!, segments[j]!)) union(i, j);
      }
    }
  }

  // Collect components, each sorted by row then x.
  const components = new Map<number, ClippedSegment[]>();
  segments.forEach((s, i) => {
    const root = find(i);
    const list = components.get(root);
    if (list) list.push(s);
    else components.set(root, [s]);
  });
  for (const list of components.values()) {
    list.sort((a, b) => (a.y - b.y) || (Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2)));
  }

  // Greedy nearest-endpoint chaining: orient each segment so its entry is the
  // end nearest the current position. Within an arm (one span per row) this
  // reproduces a serpentine; it also picks the cheaper end when crossing arms.
  const dist = (px: number, py: number, x: number, y: number) => Math.hypot(x - px, y - py);
  const chain = (segs: ClippedSegment[], px: number, py: number): {
    ordered: ClippedSegment[]; x: number; y: number;
  } => {
    const remaining = [...segs];
    const ordered: ClippedSegment[] = [];
    let cx = px, cy = py;
    while (remaining.length > 0) {
      let best = 0, reverse = false, bestD = Infinity;
      for (let k = 0; k < remaining.length; k++) {
        const s = remaining[k]!;
        const dStart = dist(cx, cy, s.x1, s.y);
        const dEnd = dist(cx, cy, s.x2, s.y);
        if (dStart < bestD) { bestD = dStart; best = k; reverse = false; }
        if (dEnd < bestD) { bestD = dEnd; best = k; reverse = true; }
      }
      const s = remaining.splice(best, 1)[0]!;
      const entry = reverse ? s.x2 : s.x1;
      const exit = reverse ? s.x1 : s.x2;
      ordered.push({ x1: entry, x2: exit, y: s.y });
      cx = exit; cy = s.y;
    }
    return { ordered, x: cx, y: cy };
  };

  // Start from the lowest-then-leftmost endpoint so the path begins at a
  // natural corner rather than mid-area.
  const start = segments.reduce((acc, s) => {
    const x = Math.min(s.x1, s.x2);
    return (s.y < acc.y || (s.y === acc.y && x < acc.x)) ? { x, y: s.y } : acc;
  }, { x: Infinity, y: Infinity });

  // Visit components greedily by whichever has an endpoint nearest the current
  // position, chaining each as we go.
  const pending = [...components.values()];
  const result: ClippedSegment[] = [];
  let cx = start.x, cy = start.y;
  while (pending.length > 0) {
    let bestIdx = 0, bestD = Infinity;
    for (let k = 0; k < pending.length; k++) {
      for (const s of pending[k]!) {
        const d = Math.min(
          dist(cx, cy, s.x1, s.y), dist(cx, cy, s.x2, s.y),
        );
        if (d < bestD) { bestD = d; bestIdx = k; }
      }
    }
    const comp = pending.splice(bestIdx, 1)[0]!;
    const { ordered, x, y } = chain(comp, cx, cy);
    result.push(...ordered);
    cx = x; cy = y;
  }

  return result;
}
