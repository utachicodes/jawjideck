/**
 * Crosshatch (Double Grid) Pattern Generator
 * Runs the grid generator twice: once at gridAngle, once at gridAngle + 90.
 * Produces double coverage for 3D reconstruction.
 */
import type { SurveyConfig, SurveyResult } from '../survey-types';
import { generateGrid } from './grid-generator';
import { computeSurveyStats } from '../survey-stats';

export function generateCrosshatch(config: SurveyConfig): SurveyResult {
  // First pass at original angle
  const pass1 = generateGrid(config);

  // Second pass at 90 degrees
  const pass2Config: SurveyConfig = {
    ...config,
    gridAngle: (config.gridAngle + 90) % 360,
  };
  const pass2 = generateGrid(pass2Config);

  // Combine results
  const waypoints = [...pass1.waypoints, ...pass2.waypoints];
  const photoPositions = [...pass1.photoPositions, ...pass2.photoPositions];
  const footprints = [...pass1.footprints, ...pass2.footprints];
  const lineCount = pass1.stats.lineCount + pass2.stats.lineCount;

  const stats = computeSurveyStats(config, waypoints, photoPositions, lineCount);

  return { waypoints, photoPositions, footprints, stats };
}
