/**
 * survey-units — area/distance formatting for the Area Editor briefing.
 *
 * Mirrors the wind overlay's unit cycle (see components/map/wind/wind-field):
 * a small set of systems with a `next` toggle and pure formatters. Commercial
 * survey clients quote in acres + feet; the default stays metric (ha + m/km).
 */
import type { SurveyUnits } from '../stores/settings-store';

const HA_TO_ACRES = 2.47105;
const M_TO_FT = 3.28084;
const FT_PER_MILE = 5280;

/** Cycle metric <-> imperial (two systems, so a toggle). */
export function nextSurveyUnits(system: SurveyUnits): SurveyUnits {
  return system === 'metric' ? 'imperial' : 'metric';
}

/** Short label for the active area unit - used on the toggle button. */
export function surveyAreaUnitLabel(system: SurveyUnits): string {
  return system === 'metric' ? 'ha' : 'ac';
}

/** Format an area given in hectares. */
export function formatSurveyAreaHa(ha: number, system: SurveyUnits): string {
  if (system === 'imperial') {
    return `${(ha * HA_TO_ACRES).toFixed(2)} ac`;
  }
  return `${ha.toFixed(2)} ha`;
}

/** Format a distance given in meters. */
export function formatSurveyDistanceM(m: number, system: SurveyUnits): string {
  if (system === 'imperial') {
    const ft = m * M_TO_FT;
    if (ft >= FT_PER_MILE) return `${(ft / FT_PER_MILE).toFixed(ft >= 10 * FT_PER_MILE ? 0 : 1)} mi`;
    return `${Math.round(ft)} ft`;
  }
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km`;
  return `${Math.round(m)} m`;
}
