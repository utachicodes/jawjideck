import { describe, it, expect } from 'vitest';
import { parseGisArea, gisFormatForExtension } from './gis-area-import';

describe('gisFormatForExtension', () => {
  it('maps extensions to formats', () => {
    expect(gisFormatForExtension('kml')).toBe('kml');
    expect(gisFormatForExtension('.kmz')).toBe('kml');
    expect(gisFormatForExtension('GeoJSON')).toBe('geojson');
    expect(gisFormatForExtension('json')).toBe('geojson');
    expect(gisFormatForExtension('csv')).toBeNull();
  });
});

describe('parseGisArea - GeoJSON', () => {
  it('reads a Polygon feature with a hole', () => {
    const gj = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [[10, 0], [11, 0], [11, 1], [10, 1], [10, 0]], // outer (closed)
              [[10.2, 0.2], [10.8, 0.2], [10.8, 0.8], [10.2, 0.2]], // hole
            ],
          },
        },
      ],
    });
    const areas = parseGisArea(gj, 'geojson');
    expect(areas).toHaveLength(1);
    // Closing point dropped -> 4 unique vertices.
    expect(areas[0]!.polygon).toHaveLength(4);
    expect(areas[0]!.polygon[0]).toEqual({ lat: 0, lng: 10 });
    expect(areas[0]!.holes).toHaveLength(1);
  });

  it('reads MultiPolygon as multiple areas', () => {
    const gj = JSON.stringify({
      type: 'Feature',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[0, 0], [1, 0], [1, 1]]],
          [[[5, 5], [6, 5], [6, 6]]],
        ],
      },
    });
    const areas = parseGisArea(gj, 'geojson');
    expect(areas).toHaveLength(2);
  });

  it('returns [] on garbage', () => {
    expect(parseGisArea('not json', 'geojson')).toEqual([]);
  });
});

describe('parseGisArea - KML', () => {
  it('reads a Polygon with outer + inner boundary', () => {
    const kml = `<?xml version="1.0"?><kml><Placemark><Polygon>
      <outerBoundaryIs><LinearRing><coordinates>
        10,0,0 11,0,0 11,1,0 10,1,0 10,0,0
      </coordinates></LinearRing></outerBoundaryIs>
      <innerBoundaryIs><LinearRing><coordinates>
        10.2,0.2 10.8,0.2 10.8,0.8 10.2,0.2
      </coordinates></LinearRing></innerBoundaryIs>
    </Polygon></Placemark></kml>`;
    const areas = parseGisArea(kml, 'kml');
    expect(areas).toHaveLength(1);
    expect(areas[0]!.polygon).toHaveLength(4);
    expect(areas[0]!.polygon[0]).toEqual({ lat: 0, lng: 10 });
    expect(areas[0]!.holes).toHaveLength(1);
  });

  it('skips degenerate polygons', () => {
    const kml = `<kml><Polygon><outerBoundaryIs><LinearRing><coordinates>10,0 11,0</coordinates></LinearRing></outerBoundaryIs></Polygon></kml>`;
    expect(parseGisArea(kml, 'kml')).toEqual([]);
  });
});
