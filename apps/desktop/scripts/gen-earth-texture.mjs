/**
 * Generates the offline equirectangular earth textures used by the flight
 * path globe panel. Rasterizes public-domain Natural Earth 110m land data
 * (https://www.naturalearthdata.com) into dark/light PNGs.
 *
 * Run from apps/desktop:
 *   node scripts/gen-earth-texture.mjs <path-to-ne_110m_land.geojson>
 *
 * The PNGs are committed; this script only needs re-running when the source
 * data or palette changes.
 */
import { readFileSync } from 'node:fs';
import Jimp from 'jimp';

const [,, geojsonPath] = process.argv;
if (!geojsonPath) {
  console.error('Usage: node scripts/gen-earth-texture.mjs <ne_110m_land.geojson>');
  process.exit(1);
}

const W = 1024;
const H = 512;
const data = JSON.parse(readFileSync(geojsonPath, 'utf8'));

function collectPolygons(feature, out) {
  const geom = feature.geometry;
  if (!geom) return;
  if (geom.type === 'Polygon') out.push(geom.coordinates);
  else if (geom.type === 'MultiPolygon') for (const p of geom.coordinates) out.push(p);
}

const polygons = [];
for (const feature of data.features) collectPolygons(feature, polygons);
console.log(`Loaded ${polygons.length} polygons`);

// Equirectangular projection: x = (lng+180)/360*W, y = (90-lat)/180*H
function lngToX(lng) {
  return ((lng + 180) / 360) * W;
}
function latToY(lat) {
  return ((90 - lat) / 180) * H;
}

/** Even-odd scanline fill of one polygon ring set onto the image. */
function fillPolygon(rings, img, color) {
  const ring = rings[0]; // exterior ring
  const edges = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const y1 = latToY(a[1]);
    const y2 = latToY(b[1]);
    if (Math.abs(y1 - y2) < 1e-9) continue;
    edges.push({ y1, y2, x1: lngToX(a[0]), x2: lngToX(b[0]) });
  }
  for (let y = 0; y < H; y++) {
    const xs = [];
    for (const e of edges) {
      const minY = Math.min(e.y1, e.y2);
      const maxY = Math.max(e.y1, e.y2);
      if (y < minY || y >= maxY) continue;
      const t = (y - e.y1) / (e.y2 - e.y1);
      xs.push(e.x1 + t * (e.x2 - e.x1));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.floor(xs[i]));
      const x1 = Math.min(W - 1, Math.ceil(xs[i + 1]));
      for (let x = x0; x <= x1; x++) img.setPixelColor(color, x, y);
    }
  }
}

function drawGraticule(img, color) {
  // Latitude lines
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = Math.round(latToY(lat));
    for (let x = 0; x < W; x++) img.setPixelColor(color, x, y);
  }
  // Longitude lines
  for (let lng = -180; lng < 180; lng += 30) {
    const x = Math.round(lngToX(lng));
    for (let y = 0; y < H; y++) img.setPixelColor(color, x, y);
  }
}

async function render(prefix, ocean, land, graticule) {
  const img = new Jimp(W, H, ocean);
  for (const rings of polygons) fillPolygon(rings, img, land);
  drawGraticule(img, graticule);
  const out = `src/renderer/assets/globe/${prefix}.png`;
  await img.writeAsync(out);
  console.log(`Wrote ${out}`);
}

await render('earth-dark', 0x0d1330ff, 0x2b3d63ff, 0xffffff14);
await render('earth-light', 0xcfe3f3ff, 0xe8e4d8ff, 0x00000014);
console.log('Done');
