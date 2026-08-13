import { describe, expect, it } from 'vitest';
import { convertBlackboxToDataFlashLog, type BlackboxLog } from '@jawji/blackbox-parser';
import { computeLogSummary } from './log-summary';
import { listMessageTypes, getFieldStats, readSamples, executeLogTool } from './log-ai-tools';
import { getModeTimeline } from './log-utils';
import type { DataFlashLog, DataFlashMessage } from '@jawji/dataflash-parser';
import type { ParsedLog } from '../../stores/log-store';

/** A minimal synthetic Betaflight blackbox log (values mirror real G/P frames). */
function makeBlackboxLog(): BlackboxLog {
  const iNames = [
    'loopIteration', 'time', 'axisP', 'axisR', 'axisY', 'accSmooth[0]', 'accSmooth[1]',
    'accSmooth[2]', 'gyroADC[0]', 'gyroADC[1]', 'gyroADC[2]', 'vbatLatest',
    'amperageLatest', 'motors[0]', 'motors[1]', 'motors[2]', 'motors[3]',
  ];
  const iDef = {
    name: iNames as string[],
    count: iNames.length,
    signed: [] as number[],
    predictor: [] as number[],
    encoding: [] as number[],
  };
  const gDef = {
    name: ['time', 'GPS_coord[0]', 'GPS_coord[1]', 'GPS_altitude', 'GPS_numSat', 'GPS_HDOP', 'GPS_speed'] as string[],
    count: 7,
    signed: [] as number[],
    predictor: [] as number[],
    encoding: [] as number[],
  };
  const main = (iteration: number): { type: 'I' | 'P'; index: number; timeUs: number; fields: number[] } => ({
    type: iteration % 32 === 1 ? 'I' : 'P',
    index: iteration,
    timeUs: iteration * 125,
    fields: [
      iteration, iteration * 125, 0, 0, 0, 0, 0, 1, -2, 3, 4,
      1050 - Math.floor(iteration / 40), 3000, 1070, 1070, 1070, 1070,
    ],
  });
  return {
    frameDefs: { I: iDef, P: { ...iDef }, G: gDef },
    sysConfig: {
      dataVersion: 2,
      firmwareType: 'betaflight',
      firmwareVersion: '4.5.1',
      firmwareRevision: 'Betaflight 4.5.1',
      boardInformation: 'SITL',
      frameIntervalI: 32,
      frameIntervalPNum: 1,
      frameIntervalPDenom: 4,
      minthrottle: 1070,
      maxthrottle: 2000,
      vbatref: 4095,
      vbatscale: 110,
      currentMeterOffset: 0,
      currentMeterScale: 400,
      raw: {},
    },
    frames: [
      { type: 'H', index: 0, timeUs: 0, fields: [0, 371234567, 1221234567, 450] },
      { type: 'S', index: 1, timeUs: 0, fields: [0, 1] },
      ...Array.from({ length: 25 }, (_, i) => main(i * 4 === 0 ? 1 : i * 4)),
      { type: 'G', index: 26, timeUs: 5000, fields: [5000, 371235801, 1221233580, 450, 12, 89, 1500] },
    ],
    events: [
      { code: 30, timeUs: 8000, data: { newFlags: 3, lastFlags: 1 } },
      { code: 15, timeUs: 12000, data: { reason: 2 } },
    ],
    isCsv: false,
    timeRange: { startUs: 0, endUs: 12000 },
    stats: { totalBytes: 1000, totalCorruptFrames: 0, frameCount: 27, eventCount: 2 },
  };
}

/** The IPC-serialized shape the renderer stores (Maps already flattened). */
function asParsedLog(dfl: DataFlashLog): ParsedLog {
  const messages: Record<string, DataFlashMessage[]> = {};
  for (const [k, v] of dfl.messages) messages[k] = v;
  const formats: Record<number, { id: number; name: string; length: number; format: string; fields: string[]; unitChars?: string[]; multChars?: string[] }> = {};
  for (const [k, v] of dfl.formats) formats[k] = v;
  return {
    formats,
    messages,
    metadata: dfl.metadata,
    timeRange: dfl.timeRange,
    messageTypes: dfl.messageTypes,
    unitLabels: Object.fromEntries(dfl.unitLabels),
    multValues: Object.fromEntries(dfl.multValues),
  };
}

describe('blackbox logs in the AI/flight-analysis pipeline', () => {
  const dfl = convertBlackboxToDataFlashLog(makeBlackboxLog());
  const log = asParsedLog(dfl);

  it('converts to a DataFlashLog-shaped object', () => {
    expect(log.messages).toBeDefined();
    expect(JSON.stringify(log.messageTypes)).toContain('GPS');
    expect(JSON.stringify(log.messageTypes)).toContain('MODE');
    expect(JSON.stringify(log.messageTypes)).toContain('EVT');
    expect(JSON.stringify(log.messageTypes)).toContain('MAIN');
  });

  it('computes the flight summary without crashing', () => {
    const summary = computeLogSummary(log as ParsedLog);
    expect(summary.durationS).toBeGreaterThan(0);
    expect(summary.vehicleType).toBe('copter');
    expect(summary.battery?.maxVolt).toBeCloseTo(10.5, 1);
    // Single synthetic GPS fix → no flight time/distance stats, and that's fine.
    expect(summary.flightTimeS).toBeNull();
    expect(summary.modeStats.length).toBeGreaterThan(0);
  });

  it('builds the mode timeline', () => {
    const modeSeqs = getModeTimeline(log as ParsedLog);
    expect(modeSeqs.length).toBeGreaterThan(0);
    expect(modeSeqs[0]!.name).toContain('ARM');
  });

  it('runs the Claude log tools without crashing', () => {
    const types = listMessageTypes(log as ParsedLog);
    expect(types.some((t) => t.type === 'MAIN')).toBe(true);
    expect(types.some((t) => t.type === 'GPS')).toBe(true);

    const stats = getFieldStats(log as ParsedLog, 'MAIN', ['vbatLatest']);
    expect(JSON.stringify(stats)).toContain('1050');

    const samples = readSamples(
      log as ParsedLog,
      'MAIN',
      ['loopIteration', 'timeUs'],
      0,
      undefined,
      10,
    );
    expect(JSON.stringify(samples)).toContain('loopIteration');

    const modeResult = executeLogTool('list_message_types', {}, log as ParsedLog);
    expect(JSON.stringify(modeResult)).toContain('GPS');
    const alt = executeLogTool(
      'get_field_stats',
      { type: 'GPS', fields: ['Alt'] },
      log as ParsedLog,
    );
    expect(JSON.stringify(alt)).toContain('45');
  });
});