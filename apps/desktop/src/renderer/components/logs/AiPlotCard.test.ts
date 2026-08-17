import { describe, it, expect } from 'vitest';
import { buildPlotData } from './AiPlotCard';
import type { ParsedLog } from '../../stores/log-store';
import type { PlotMarker } from './log-ai-tools';

const BASE_US = 1_000_000_000;

function makeLog(overrides?: Partial<ParsedLog>): ParsedLog {
  const att = Array.from({ length: 10 }, (_, i) => ({
    type: 'ATT',
    timeUs: BASE_US + i * 100_000,
    fields: { Roll: Math.sin(i) * 10, Pitch: Math.cos(i) * 5, Mode: i % 2 === 0 ? 'AUTO' : 'LOITER' },
  }));
  return {
    formats: {},
    messages: { ATT: att },
    metadata: { vehicleType: 'ArduCopter', firmwareVersion: '4.5.1', firmwareString: 'ArduCopter 4.5.1', boardType: 'Pixhawk', gitHash: '' },
    timeRange: { startUs: BASE_US, endUs: BASE_US + 10 * 100_000 },
    messageTypes: ['ATT'],
    unitLabels: {},
    multValues: {},
    ...overrides,
  };
}

function marker(partial: Partial<PlotMarker> = {}): PlotMarker {
  return { type: 'ATT', fields: ['Roll'], ...partial };
}

describe('buildPlotData', () => {
  it('returns null when the marker type is not in the log', () => {
    expect(buildPlotData(makeLog(), marker({ type: 'VIBE' }))).toBeNull();
  });

  it('returns null when the requested time window has no messages', () => {
    const data = buildPlotData(makeLog(), marker({ startS: 1000, endS: 2000 }));
    expect(data).toBeNull();
  });

  it('returns null when no numeric fields are available', () => {
    const log = makeLog({
      messages: { ATT: [{ type: 'ATT', timeUs: BASE_US, fields: { Mode: 'AUTO' } }] },
    });
    expect(buildPlotData(log, marker({ fields: ['Mode'] }))).toBeNull();
    expect(buildPlotData(log, marker({ fields: [] }))).toBeNull();
  });

  it('builds a single series with relative seconds and values', () => {
    const data = buildPlotData(makeLog(), marker());
    expect(data).not.toBeNull();
    const { series, startS, endS } = data!;
    expect(series).toHaveLength(1);
    expect(series[0]!.label).toBe('ATT.Roll');
    expect(series[0]!.time).toHaveLength(10);
    expect(series[0]!.time[0]).toBe(0);
    expect(series[0]!.time[9]).toBeCloseTo(0.9);
    expect(series[0]!.values[0]).toBeCloseTo(Math.sin(0) * 10);
    expect(startS).toBe(0);
    expect(endS).toBeCloseTo(0.9);
  });

  it('filters by the requested window and skips non-numeric fields', () => {
    const data = buildPlotData(makeLog(), marker({ fields: ['Roll', 'Pitch', 'Mode'], startS: 0.2, endS: 0.5 }));
    expect(data).not.toBeNull();
    expect(data!.series.map((s) => s.label)).toEqual(['ATT.Roll', 'ATT.Pitch']);
    expect(data!.series[0]!.time).toEqual([0.2, 0.3, 0.4, 0.5]);
    expect(data!.startS).toBe(0.2);
    expect(data!.endS).toBe(0.5);
  });

  it('falls back to numeric fields of the first record when fields are empty', () => {
    const data = buildPlotData(makeLog(), marker({ fields: [] }));
    expect(data!.series.map((s) => s.label)).toEqual(['ATT.Roll', 'ATT.Pitch']);
  });

  it('splits multi-instance types into one series per instance', () => {
    const msgs = Array.from({ length: 20 }, (_, i) => ({
      type: 'ATT',
      timeUs: BASE_US + i * 100_000,
      fields: { Instance: i % 2, Roll: i * 1.0, Mode: 'AUTO' },
    }));
    const data = buildPlotData(makeLog({ messages: { ATT: msgs } }), marker());
    expect(data).not.toBeNull();
    expect(data!.series.map((s) => s.label)).toEqual(['ATT[0].Roll', 'ATT[1].Roll']);
    expect(data!.series[0]!.time).toHaveLength(10);
    expect(data!.series[1]!.time).toHaveLength(10);
  });

  it('does not split when all messages share a single instance', () => {
    const msgs = Array.from({ length: 5 }, (_, i) => ({
      type: 'ATT',
      timeUs: BASE_US + i * 100_000,
      fields: { Instance: 0, Roll: i * 1.0 },
    }));
    const data = buildPlotData(makeLog({ messages: { ATT: msgs } }), marker());
    expect(data!.series).toHaveLength(1);
    expect(data!.series[0]!.label).toBe('ATT.Roll');
  });

  it('decimates to at most MAX_POINTS+1 points while keeping first and last', () => {
    const msgs = Array.from({ length: 2000 }, (_, i) => ({
      type: 'ATT',
      timeUs: BASE_US + i * 1000,
      fields: { Roll: i },
    }));
    const data = buildPlotData(makeLog({ messages: { ATT: msgs } }), marker());
    const times = data!.series[0]!.time;
    expect(times.length).toBeLessThanOrEqual(501);
    expect(times[0]).toBe(0);
    expect(times[times.length - 1]).toBeCloseTo(1.999);
    expect(data!.series[0]!.values[0]).toBe(0);
    expect(data!.series[0]!.values[data!.series[0]!.values.length - 1]).toBe(1999);
  });

  it('resolves MAVLink-style type names to ArduPilot dataflash types', () => {
    const log = makeLog({
      messages: {
        IMU: Array.from({ length: 5 }, (_, i) => ({
          type: 'IMU',
          timeUs: BASE_US + i * 100_000,
          fields: { AccX: 1, AccY: 2, AccZ: 3, GyrX: 0.1, GyrY: 0.2, GyrZ: 0.3, Instance: 0 },
        })),
      },
    });
    const accel = buildPlotData(log, marker({ type: 'VEHICLE_ACCELERATION', fields: ['x', 'y', 'z'] }));
    expect(accel).not.toBeNull();
    expect(accel!.series.map((s) => s.label)).toEqual(['IMU.AccX', 'IMU.AccY', 'IMU.AccZ']);

    const rate = buildPlotData(log, marker({ type: 'VEHICLE_ANGULAR_VELOCITY', fields: ['x', 'y', 'z'] }));
    expect(rate).not.toBeNull();
    expect(rate!.series.map((s) => s.label)).toEqual(['IMU.GyrX', 'IMU.GyrY', 'IMU.GyrZ']);
  });

  it('falls back to numeric fields when an aliased marker names unknown fields', () => {
    const log = makeLog({
      messages: {
        IMU: [{ type: 'IMU', timeUs: BASE_US, fields: { AccX: 1, AccY: 2, AccZ: 3 } }],
      },
    });
    const data = buildPlotData(log, marker({ type: 'VEHICLE_ACCELERATION', fields: [] }));
    expect(data).not.toBeNull();
    expect(data!.series.map((s) => s.label)).toEqual(['IMU.AccX', 'IMU.AccY', 'IMU.AccZ']);
  });

  it('does not alias unknown types', () => {
    expect(buildPlotData(makeLog(), marker({ type: 'FOO' }))).toBeNull();
  });
});
