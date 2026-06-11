/**
 * GIS area import - parse survey boundaries out of the files surveyors already
 * have (KML and GeoJSON) so they don't hand-trace polygons on the map.
 *
 * Both formats reduce to the same shape: an outer ring plus optional inner
 * rings (no-fly holes). Coordinates are normalized to {lat, lng}. KMZ is a zip
 * around a KML document; the main process unzips it and hands us the KML text,
 * so this module stays pure (no Node, no DOM) and unit-testable.
 */

export interface ImportedArea {
  /** Exterior boundary, normalized to {lat, lng}, ring NOT closed (no repeated last point). */
  polygon: Array<{ lat: number; lng: number }>;
  /** Inner rings (no-fly holes), same normalization. */
  holes: Array<Array<{ lat: number; lng: number }>>;
}

export type GisFormat = 'kml' | 'geojson';

/** Detect format from a file extension (lower-cased, no dot needed). */
export function gisFormatForExtension(ext: string): GisFormat | null {
  const e = ext.replace(/^\./, '').toLowerCase();
  if (e === 'kml' || e === 'kmz') return 'kml';
  if (e === 'geojson' || e === 'json') return 'geojson';
  return null;
}

/** Drop a trailing point that duplicates the first (closed rings) so editing behaves. */
function openRing(ring: Array<{ lat: number; lng: number }>): Array<{ lat: number; lng: number }> {
  if (ring.length > 1) {
    const a = ring[0]!;
    const b = ring[ring.length - 1]!;
    if (a.lat === b.lat && a.lng === b.lng) return ring.slice(0, -1);
  }
  return ring;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

// ── GeoJSON ──────────────────────────────────────────────────────────────────

function geoJsonRing(coords: unknown): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(coords)) return [];
  const out: Array<{ lat: number; lng: number }> = [];
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (isValidLatLng(lat, lng)) out.push({ lat, lng });
  }
  return openRing(out);
}

/** Collect every Polygon (as [outer, ...holes][]) from any GeoJSON geometry. */
function geoJsonPolygons(geometry: unknown): unknown[][] {
  if (!geometry || typeof geometry !== 'object') return [];
  const g = geometry as { type?: string; coordinates?: unknown; geometries?: unknown };
  if (g.type === 'Polygon' && Array.isArray(g.coordinates)) return [g.coordinates];
  if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) return g.coordinates as unknown[][];
  if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) {
    return g.geometries.flatMap((sub) => geoJsonPolygons(sub));
  }
  return [];
}

function parseGeoJson(content: string): ImportedArea[] {
  const root = JSON.parse(content) as unknown;
  const geometries: unknown[] = [];
  const r = root as { type?: string; features?: unknown; geometry?: unknown };
  if (r.type === 'FeatureCollection' && Array.isArray(r.features)) {
    for (const f of r.features) {
      const geom = (f as { geometry?: unknown }).geometry;
      if (geom) geometries.push(geom);
    }
  } else if (r.type === 'Feature' && r.geometry) {
    geometries.push(r.geometry);
  } else {
    geometries.push(root);
  }

  const areas: ImportedArea[] = [];
  for (const geom of geometries) {
    for (const polygon of geoJsonPolygons(geom)) {
      if (!Array.isArray(polygon) || polygon.length === 0) continue;
      const outer = geoJsonRing(polygon[0]);
      if (outer.length < 3) continue;
      const holes = polygon.slice(1).map(geoJsonRing).filter((h) => h.length >= 3);
      areas.push({ polygon: outer, holes });
    }
  }
  return areas;
}

// ── KML ──────────────────────────────────────────────────────────────────────

/** Parse a KML <coordinates> blob: whitespace-separated "lng,lat[,alt]" tuples. */
function kmlCoordinates(blob: string): Array<{ lat: number; lng: number }> {
  const out: Array<{ lat: number; lng: number }> = [];
  for (const tuple of blob.trim().split(/\s+/)) {
    if (!tuple) continue;
    const parts = tuple.split(',');
    if (parts.length < 2) continue;
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (isValidLatLng(lat, lng)) out.push({ lat, lng });
  }
  return openRing(out);
}

function parseKml(content: string): ImportedArea[] {
  const areas: ImportedArea[] = [];
  const polygonRe = /<Polygon\b[^>]*>([\s\S]*?)<\/Polygon>/gi;
  const outerRe = /<outerBoundaryIs\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>/i;
  const innerRe = /<innerBoundaryIs\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>/gi;

  let m: RegExpExecArray | null;
  while ((m = polygonRe.exec(content)) !== null) {
    const body = m[1]!;
    const outerMatch = outerRe.exec(body);
    if (!outerMatch) continue;
    const outer = kmlCoordinates(outerMatch[1]!);
    if (outer.length < 3) continue;
    const holes: Array<Array<{ lat: number; lng: number }>> = [];
    let h: RegExpExecArray | null;
    innerRe.lastIndex = 0;
    while ((h = innerRe.exec(body)) !== null) {
      const ring = kmlCoordinates(h[1]!);
      if (ring.length >= 3) holes.push(ring);
    }
    areas.push({ polygon: outer, holes });
  }
  return areas;
}

/**
 * Parse a GIS boundary file into one or more areas. Returns [] when nothing
 * usable is found (callers should surface a friendly error rather than crash).
 */
export function parseGisArea(content: string, format: GisFormat): ImportedArea[] {
  try {
    return format === 'geojson' ? parseGeoJson(content) : parseKml(content);
  } catch {
    return [];
  }
}
