import { describe, it, expect } from 'vitest';
import {
  nextSurveyUnits,
  surveyAreaUnitLabel,
  formatSurveyAreaHa,
  formatSurveyDistanceM,
} from './survey-units';

describe('survey-units', () => {
  it('toggles between metric and imperial', () => {
    expect(nextSurveyUnits('metric')).toBe('imperial');
    expect(nextSurveyUnits('imperial')).toBe('metric');
  });

  it('labels the active area unit', () => {
    expect(surveyAreaUnitLabel('metric')).toBe('ha');
    expect(surveyAreaUnitLabel('imperial')).toBe('ac');
  });

  it('formats area as hectares or acres', () => {
    expect(formatSurveyAreaHa(12.5, 'metric')).toBe('12.50 ha');
    // 1 ha = 2.47105 acres
    expect(formatSurveyAreaHa(10, 'imperial')).toBe('24.71 ac');
  });

  it('formats distance metric (m / km)', () => {
    expect(formatSurveyDistanceM(450, 'metric')).toBe('450 m');
    expect(formatSurveyDistanceM(2500, 'metric')).toBe('2.5 km');
    expect(formatSurveyDistanceM(15000, 'metric')).toBe('15 km');
  });

  it('formats distance imperial (ft / mi)', () => {
    // 100 m -> 328 ft
    expect(formatSurveyDistanceM(100, 'imperial')).toBe('328 ft');
    // 2000 m -> 6561.7 ft -> 1.2 mi
    expect(formatSurveyDistanceM(2000, 'imperial')).toBe('1.2 mi');
    // 20000 m -> ~12.4 mi -> rounded (>= 10 mi) -> 12 mi
    expect(formatSurveyDistanceM(20000, 'imperial')).toBe('12 mi');
  });
});
