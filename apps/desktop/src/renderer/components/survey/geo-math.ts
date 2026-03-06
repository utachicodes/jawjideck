/**
 * Geographic Math Utilities for Survey Planning
 * Equirectangular projection - accurate enough for survey-scale areas (< 5km)
 */
import type { LatLng } from './survey-types';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS = 6371000; // meters

/**
 * Convert lat/lng to local XY meters relative to an origin point.
 * Uses equirectangular projection (sufficient for survey-scale distances).
 */
export function latLngToLocal(origin: LatLng, point: LatLng): { x: number; y: number } {
  const cosLat = Math.cos(origin.lat * DEG_TO_RAD);
  const x = (point.lng - origin.lng) * DEG_TO_RAD * EARTH_RADIUS * cosLat;
  const y = (point.lat - origin.lat) * DEG_TO_RAD * EARTH_RADIUS;
  return { x, y };
}

/**
 * Convert local XY meters back to lat/lng.
 */
export function localToLatLng(origin: LatLng, x: number, y: number): LatLng {
  const cosLat = Math.cos(origin.lat * DEG_TO_RAD);
  const lng = origin.lng + (x / (EARTH_RADIUS * cosLat)) * RAD_TO_DEG;
  const lat = origin.lat + (y / EARTH_RADIUS) * RAD_TO_DEG;
  return { lat, lng };
}

/**
 * Calculate polygon area using the Shoelace formula (in local meters).
 */
export function polygonArea(vertices: LatLng[]): number {
  if (vertices.length < 3) return 0;
  const origin = vertices[0]!;
  const local = vertices.map(v => latLngToLocal(origin, v));

  let area = 0;
  for (let i = 0; i < local.length; i++) {
    const j = (i + 1) % local.length;
    const a = local[i]!;
    const b = local[j]!;
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/**
 * Calculate polygon centroid.
 */
export function polygonCentroid(vertices: LatLng[]): LatLng {
  let latSum = 0;
  let lngSum = 0;
  for (const v of vertices) {
    latSum += v.lat;
    lngSum += v.lng;
  }
  return { lat: latSum / vertices.length, lng: lngSum / vertices.length };
}

/**
 * Rotate a 2D point around an origin by angle (radians).
 */
export function rotatePoint(
  point: { x: number; y: number },
  angle: number,
  origin: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

/**
 * Distance between two lat/lng points (Haversine).
 */
export function distanceLatLng(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(a.lat * DEG_TO_RAD) * Math.cos(b.lat * DEG_TO_RAD) * sinLng * sinLng;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

/**
 * Distance between two 2D points.
 */
export function distance2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute the bounding box of a set of 2D points.
 */
export function boundingBox(points: { x: number; y: number }[]): {
  minX: number; maxX: number; minY: number; maxY: number;
} {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Calculate camera ground footprint dimensions at a given altitude.
 */
export function cameraFootprint(
  sensorWidth: number,  // mm
  sensorHeight: number, // mm
  focalLength: number,  // mm
  altitude: number,     // meters
): { width: number; height: number; gsd: number } {
  const width = (sensorWidth * altitude) / focalLength;
  const height = (sensorHeight * altitude) / focalLength;
  // GSD = (sensorWidth * altitude) / (focalLength * imageWidth) * 100 cm/px
  // But we return it per-pixel here, caller needs imageWidth
  const gsd = (sensorWidth * altitude) / focalLength; // meters per sensor width, need to divide by imageWidth
  return { width, height, gsd };
}
