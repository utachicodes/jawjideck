/**
 * Survey Statistics Calculator
 */
import type { LatLng, SurveyConfig, SurveyStats } from './survey-types';
import { distanceLatLng, polygonArea } from './geo-math';

/**
 * Calculate GSD (Ground Sample Distance) in cm/pixel.
 */
export function calculateGSD(
  sensorWidth: number,   // mm
  focalLength: number,   // mm
  imageWidth: number,     // pixels
  altitude: number,       // meters
): number {
  // GSD = (sensorWidth_mm * altitude_m) / (focalLength_mm * imageWidth_px) * 100 (for cm)
  return (sensorWidth * altitude * 100) / (focalLength * imageWidth);
}

/**
 * Calculate survey footprint dimensions.
 */
export function calculateFootprint(
  sensorWidth: number,
  sensorHeight: number,
  focalLength: number,
  altitude: number,
): { width: number; height: number } {
  return {
    width: (sensorWidth * altitude) / focalLength,
    height: (sensorHeight * altitude) / focalLength,
  };
}

/**
 * Calculate line and photo spacing from overlap.
 */
export function calculateSpacing(
  footprintWidth: number,
  footprintHeight: number,
  frontOverlap: number,  // percentage
  sideOverlap: number,   // percentage
): { lineSpacing: number; photoSpacing: number } {
  return {
    lineSpacing: footprintWidth * (1 - sideOverlap / 100),
    photoSpacing: footprintHeight * (1 - frontOverlap / 100),
  };
}

/**
 * Calculate total flight distance from waypoints.
 */
export function calculateFlightDistance(waypoints: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += distanceLatLng(waypoints[i - 1]!, waypoints[i]!);
  }
  return total;
}

/**
 * Compute full survey stats from config and generated data.
 */
export function computeSurveyStats(
  config: SurveyConfig,
  waypoints: LatLng[],
  photoPositions: LatLng[],
  lineCount: number,
): SurveyStats {
  const { camera, altitude, speed } = config;
  const gsd = calculateGSD(camera.sensorWidth, camera.focalLength, camera.imageWidth, altitude);
  const { width: footprintWidth, height: footprintHeight } = calculateFootprint(
    camera.sensorWidth, camera.sensorHeight, camera.focalLength, altitude,
  );
  const { lineSpacing, photoSpacing } = calculateSpacing(
    footprintWidth, footprintHeight, config.frontOverlap, config.sideOverlap,
  );
  const flightDistance = calculateFlightDistance(waypoints);
  const flightTime = speed > 0 ? flightDistance / speed : 0;
  const areaCovered = polygonArea(config.polygon);

  return {
    gsd,
    flightDistance,
    flightTime,
    photoCount: photoPositions.length,
    lineCount,
    areaCovered,
    footprintWidth,
    footprintHeight,
    lineSpacing,
    photoSpacing,
  };
}
