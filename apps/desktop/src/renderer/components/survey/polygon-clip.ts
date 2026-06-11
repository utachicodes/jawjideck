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
