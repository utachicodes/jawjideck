import { describe, it, expect } from 'vitest';
import { createBlackboxParser, isBlackboxBuffer } from '../parser.js';
import { convertBlackboxToDataFlashLog } from '../convert.js';

/**
 * Minimal synthetic Betaflight-4.5-style blackbox log encoder, mirroring the
 * reference blackbox internals format:
 *
 * - Header: `H key: value\n` ASCII lines (field defs for I/P/G/H/S frames).
 * - Data: single ASCII frame markers ('I','P','G','H','S','E') followed by
 *   the field data encoded with the per-field encoding/predictor from the
 *   header. Predictions are applied on decode, so this encoder stores the
 *   residual (value - predicted value).
 */

// Field encodings (same numbering as parser.ts)
const E_UNSIGNED_VB = 1;
const E_NEG_14BIT = 3;
const E_TAG8_8SVB = 6;

// Predictors
const P_ZERO = 0;
const P_PREVIOUS = 1;
const P_INC = 6;
const P_HOME_COORD = 7;
const P_LAST_MAIN_TIME = 10;

const textEncoder = new TextEncoder();

class ByteWriter {
  bytes: number[] = [];

  pushByte(b: number): void {
    this.bytes.push(b & 0xff);
  }

  pushUnsignedVB(value: number): void {
    let v = value >>> 0;
    do {
      const b = v & 0x7f;
      v >>>= 7;
      this.pushByte(v > 0 ? b | 0x80 : b);
    } while (v > 0);
  }

  pushSignedVB(value: number): void {
    const zigzag = (value << 1) ^ (value >> 31);
    this.pushUnsignedVB(zigzag);
  }

  pushNeg14Bit(value: number): void {
    // Decoder: u = readUnsignedVB(); value = -signExtend14(u)
    this.pushUnsignedVB((-value) & 0x3fff);
  }

  pushString(s: string): void {
    for (const ch of s) this.bytes.push(ch.charCodeAt(0));
  }
}

interface FieldDef {
  name: string;
  predictor: number;
  encoding: number;
}

/** Encode `residuals` per the field defs (INC predictor writes no bytes). */
function encodeFields(writer: ByteWriter, defs: FieldDef[], residuals: number[]): void {
  let i = 0;
  while (i < defs.length) {
    const def = defs[i]!;
    if (def.predictor === P_INC) {
      i++;
      continue;
    }
    const residual = residuals[i]!;
    switch (def.encoding) {
      case E_UNSIGNED_VB:
        writer.pushUnsignedVB(residual);
        break;
      case E_NEG_14BIT:
        writer.pushNeg14Bit(residual);
        break;
      case E_TAG8_8SVB: {
        // Group consecutive TAG8_8SVB fields (max 8 per group), bitmap first.
        let groupLen = 1;
        while (groupLen < 8 && i + groupLen < defs.length && defs[i + groupLen]!.encoding === E_TAG8_8SVB) {
          groupLen++;
        }
        let header = 0;
        for (let j = 0; j < groupLen; j++) {
          if (residuals[i + j]! !== 0) header |= 1 << j;
        }
        if (groupLen === 1) {
          writer.pushSignedVB(residuals[i]!);
        } else {
          writer.pushByte(header);
          for (let j = 0; j < groupLen; j++) {
            if (header & (1 << j)) writer.pushSignedVB(residuals[i + j]!);
          }
        }
        i += groupLen;
        continue;
      }
      default:
        throw new Error(`unhandled test encoding ${def.encoding}`);
    }
    i++;
  }
}

const sys = {
  dataVersion: 2,
  firmwareType: 'Betaflight',
  firmwareRevision: 'Betaflight 4.5.1',
  boardInformation: 'JAWJI-TEST-BOARD',
  frameIntervalI: 32,
  frameIntervalPNum: 1,
  frameIntervalPDenom: 4,
  minthrottle: 1070,
  maxthrottle: 2000,
  vbatref: 4095,
};

/** Field definitions matching a plausible BF 4.5 log (I/P/G/H/S). */
function makeFieldDefs() {
  const iDefs: FieldDef[] = [
    { name: 'loopIteration', predictor: P_ZERO, encoding: E_UNSIGNED_VB },
    { name: 'time', predictor: P_LAST_MAIN_TIME, encoding: E_UNSIGNED_VB },
    { name: 'axisP', predictor: 2, encoding: E_TAG8_8SVB },
    { name: 'axisR', predictor: 2, encoding: E_TAG8_8SVB },
    { name: 'axisY', predictor: 2, encoding: E_TAG8_8SVB },
    { name: 'accSmooth[0]', predictor: 2, encoding: E_TAG8_8SVB },
    { name: 'accSmooth[1]', predictor: 2, encoding: E_TAG8_8SVB },
    { name: 'accSmooth[2]', predictor: 2, encoding: E_TAG8_8SVB },
    { name: 'gyroADC[0]', predictor: 2, encoding: E_TAG8_8SVB },
    { name: 'gyroADC[1]', predictor: 2, encoding: E_TAG8_8SVB },
    { name: 'gyroADC[2]', predictor: 2, encoding: E_TAG8_8SVB },
    { name: 'vbatLatest', predictor: P_ZERO, encoding: E_UNSIGNED_VB },
    { name: 'amperageLatest', predictor: P_ZERO, encoding: E_UNSIGNED_VB },
    { name: 'motors[0]', predictor: P_PREVIOUS, encoding: E_TAG8_8SVB },
    { name: 'motors[1]', predictor: P_PREVIOUS, encoding: E_TAG8_8SVB },
    { name: 'motors[2]', predictor: P_PREVIOUS, encoding: E_TAG8_8SVB },
    { name: 'motors[3]', predictor: P_PREVIOUS, encoding: E_TAG8_8SVB },
  ];
  const pDefs = iDefs.map((d) => ({ ...d })); // P frames reuse I layout
  const gDefs: FieldDef[] = [
    { name: 'time', predictor: P_ZERO, encoding: E_UNSIGNED_VB },
    { name: 'GPS_coord[0]', predictor: P_HOME_COORD, encoding: E_NEG_14BIT },
    { name: 'GPS_coord[1]', predictor: P_HOME_COORD, encoding: E_NEG_14BIT },
    { name: 'GPS_altitude', predictor: P_ZERO, encoding: E_NEG_14BIT },
    { name: 'GPS_numSat', predictor: P_ZERO, encoding: E_UNSIGNED_VB },
    { name: 'GPS_HDOP', predictor: P_ZERO, encoding: E_UNSIGNED_VB },
    { name: 'GPS_speed', predictor: P_ZERO, encoding: E_UNSIGNED_VB },
    { name: 'GPS_ground_course', predictor: P_ZERO, encoding: E_UNSIGNED_VB },
  ];
  const hDefs: FieldDef[] = [
    { name: 'time', predictor: P_ZERO, encoding: E_UNSIGNED_VB },
    { name: 'GPS_home[0]', predictor: P_ZERO, encoding: E_UNSIGNED_VB },
    { name: 'GPS_home[1]', predictor: P_ZERO, encoding: E_UNSIGNED_VB },
    { name: 'GPS_altitude', predictor: P_ZERO, encoding: E_NEG_14BIT },
  ];
  const sDefs: FieldDef[] = [
    { name: 'time', predictor: P_ZERO, encoding: E_UNSIGNED_VB },
    { name: 'flightModeFlags', predictor: P_ZERO, encoding: E_UNSIGNED_VB },
  ];
  return { iDefs, pDefs, gDefs, hDefs, sDefs };
}

interface MainFrame {
  iteration: number;
  timeUs: number;
  values: number[];
}

/**
 * Build a complete synthetic log. Main frames every 4th loop iteration
 * (matching P interval 1/4) with I frames at iterations 1, 32, 64, 96
 * (matching I interval 32). Returns the byte offset of the G frame marker
 * so tests can corrupt it.
 */
export function buildTestLog(): { bytes: Uint8Array; gFramePos: number } {
  const { iDefs, pDefs, gDefs, hDefs, sDefs } = makeFieldDefs();
  const writer = new ByteWriter();

  const headerLines = [
    `Data version: ${sys.dataVersion}`,
    `I interval: ${sys.frameIntervalI}`,
    `P interval: ${sys.frameIntervalPNum}/${sys.frameIntervalPDenom}`,
    `Firmware type: ${sys.firmwareType}`,
    `Firmware revision: ${sys.firmwareRevision}`,
    `Board information: ${sys.boardInformation}`,
    `minthrottle: ${sys.minthrottle}`,
    `maxthrottle: ${sys.maxthrottle}`,
    `vbatref: ${sys.vbatref}`,
  ];
  for (const line of headerLines) writer.pushString(`H ${line}\n`);

  const fieldLine = (frameName: string, defs: FieldDef[], what: 'name' | 'predictor' | 'encoding') => {
    const values = defs.map((d) =>
      what === 'name' ? d.name : what === 'predictor' ? String(d.predictor) : String(d.encoding),
    );
    writer.pushString(`H Field ${frameName} ${what}: ${values.join(',')}\n`);
  };
  for (const [frameName, defs] of [
    ['I', iDefs],
    ['P', pDefs],
    ['G', gDefs],
    ['H', hDefs],
    ['S', sDefs],
  ] as const) {
    fieldLine(frameName, defs, 'name');
    fieldLine(frameName, defs, 'predictor');
    fieldLine(frameName, defs, 'encoding');
  }

  // ── main-stream history (mirror the decoder) ──────────────────────────────
  // h1/h2 correspond to the decoder's mainHistory[1]/[2].
  let h1: MainFrame | null = null;
  let h2: MainFrame | null = null;

  const writeMain = (marker: 'I' | 'P', frame: MainFrame) => {
    const defs = marker === 'I' ? iDefs : pDefs;
    const residuals: number[] = [];
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i]!;
      const value = frame.values[i]!;
      let predicted = 0;
      switch (def.predictor) {
        case P_ZERO:
          predicted = 0;
          break;
        case P_PREVIOUS:
          predicted = h1?.values[i] ?? 0;
          break;
        case 2: // straight line — I frames only have mainHistory[1]
          if (marker === 'P' && h1 && h2) predicted = 2 * h1.values[i]! - h2.values[i]!;
          break;
        case P_LAST_MAIN_TIME:
          predicted = h1?.timeUs ?? 0;
          break;
        case P_INC:
          predicted = 0; // no bytes written
          break;
        default:
          throw new Error(`unhandled test predictor ${def.predictor}`);
      }
      residuals.push(value - predicted);
    }
    writer.pushString(marker);
    encodeFields(writer, defs, residuals);
    // Rotate history exactly like the decoder's complete*Frame functions.
    if (marker === 'I') {
      h1 = frame;
      h2 = frame;
    } else {
      h2 = h1;
      h1 = frame;
    }
  };

  // ── synthetic flight: straight & level, battery decaying, motors idle ────
  const LOOP_TIME_US = 125; // 8 kHz loop
  const mainFrames: MainFrame[] = [];
  for (let frameIndex = 0; frameIndex < 25; frameIndex++) {
    const iteration = frameIndex === 0 ? 1 : frameIndex * 4; // 1, 4, 8, ..., 96
    const timeUs = iteration * LOOP_TIME_US;
    mainFrames.push({
      iteration,
      timeUs,
      values: [
        iteration, // loopIteration
        timeUs, // time
        0, // axisP
        0, // axisR
        0, // axisY
        0, // accSmooth[0]
        0, // accSmooth[1]
        1, // accSmooth[2] (1g)
        -2, // gyroADC[0]
        3, // gyroADC[1]
        4, // gyroADC[2]
        1050 - Math.floor(iteration / 40), // vbatLatest (centivolts)
        3000, // amperageLatest (deciamps)
        1070, // motors[0]
        1070, // motors[1]
        1070, // motors[2]
        1070, // motors[3]
      ],
    });
  }

  const home = [371234567, 1221234567, 450]; // lat, lon, alt(dm)

  // H frame (GPS home) before any G frame.
  const writeH = (timeUs: number) => {
    writer.pushString('H');
    encodeFields(writer, hDefs, [timeUs, home[0], home[1], home[2]]);
  };

  // G frame — residuals relative to home (coords use HOME_COORD predictor).
  const writeG = (timeUs: number, latDelta: number, lonDelta: number) => {
    writer.pushString('G');
    encodeFields(writer, gDefs, [
      timeUs, latDelta, lonDelta, home[2], 12, 89, 1500, 2700,
    ]);
  };

  const writeS = (timeUs: number, flightModeFlags: number) => {
    writer.pushString('S');
    encodeFields(writer, sDefs, [timeUs, flightModeFlags]);
  };

  const writeEvent = (code: number, payload: (w: ByteWriter) => void) => {
    writer.pushByte(code);
    payload(writer);
  };

  // ── data section ──────────────────────────────────────────────────────────
  writer.pushString('E');
  writeEvent(0, (w) => w.pushUnsignedVB(500)); // SYNC_BEEP at t=500us

  writeH(0);
  writeS(0, 1);

  let gFramePos = -1;
  for (const frame of mainFrames) {
    const isI = frame.iteration % sys.frameIntervalI === 0 || frame.iteration % sys.frameIntervalI === 1;
    if (frame.iteration === 40) {
      gFramePos = writer.bytes.length;
      writeG(frame.timeUs, 1234, -987);
    }
    writeMain(isI ? 'I' : 'P', frame);
    if (frame.iteration === 64) writeS(frame.timeUs, 3);
  }

  // FLIGHT_MODE event (ARM|ANGLE) mid-flight, DISARM at the end.
  writer.pushString('E');
  writeEvent(30, (w) => {
    w.pushUnsignedVB(3); // newFlags = ARM | ANGLE
    w.pushUnsignedVB(1); // lastFlags = ARM
  });
  writer.pushString('E');
  writeEvent(15, (w) => w.pushUnsignedVB(2)); // DISARM, reason 2 (throttle low)

  writer.pushString('E');
  writeEvent(255, (w) => w.pushString('End of log\0')); // LOG_END

  return { bytes: new Uint8Array(writer.bytes), gFramePos };
}

describe('createBlackboxParser (synthetic .bbl)', () => {
  it('detects blackbox buffers by header signature', () => {
    const { bytes } = buildTestLog();
    expect(isBlackboxBuffer(bytes)).toBe(true);
    expect(isBlackboxBuffer(new Uint8Array([0x00, 0x01, 0x02]))).toBe(false);
  });

  it('parses header field definitions and system config', () => {
    const parser = createBlackboxParser();
    parser.feed(buildTestLog().bytes);
    const log = parser.finalize();

    expect(log.sysConfig.firmwareType).toBe('betaflight');
    expect(log.sysConfig.firmwareVersion).toBe('4.5.1');
    expect(log.sysConfig.boardInformation).toBe('JAWJI-TEST-BOARD');
    expect(log.sysConfig.frameIntervalI).toBe(32);
    expect(log.sysConfig.frameIntervalPDenom).toBe(4);

    expect(log.frameDefs.I?.name[0]).toBe('loopIteration');
    expect(log.frameDefs.G?.name).toContain('GPS_coord[0]');
    expect(log.frameDefs.H?.name).toContain('GPS_home[0]');
    expect(log.frameDefs.S?.name).toContain('flightModeFlags');
    expect(log.isCsv).toBe(false);
  });

  it('decodes main frames with predictors applied', () => {
    const parser = createBlackboxParser();
    parser.feed(buildTestLog().bytes);
    const log = parser.finalize();

    const main = log.frames.filter((f) => f.type === 'I' || f.type === 'P');
    expect(main.length).toBe(25); // iterations 1, 4, 8, ..., 96

    const iFrames = log.frames.filter((f) => f.type === 'I');
    expect(iFrames.length).toBe(4); // iterations 1, 32, 64, 96

    const first = main[0]!;
    expect(first.timeUs).toBe(125);
    expect(first.fields[0]).toBe(1); // loopIteration

    const last = main[main.length - 1]!;
    expect(last.timeUs).toBe(96 * 125);
    expect(last.fields[0]).toBe(96);

    // vbatLatest decays over the flight (centivolts).
    const vbatIdx = log.frameDefs.I!.name.indexOf('vbatLatest');
    const vbat = main.map((f) => f.fields[vbatIdx]!);
    expect(vbat[0]).toBe(1050);
    expect(vbat[vbat.length - 1]).toBeLessThan(vbat[0]!);
    expect(vbat[vbat.length - 1]).toBe(1050 - Math.floor(96 / 40));
  });

  it('decodes G, H, S frames and events', () => {
    const parser = createBlackboxParser();
    parser.feed(buildTestLog().bytes);
    const log = parser.finalize();

    expect(log.frames.filter((f) => f.type === 'H').length).toBe(1);
    expect(log.frames.filter((f) => f.type === 'S').length).toBe(2);

    const gps = log.frames.filter((f) => f.type === 'G');
    expect(gps.length).toBe(1);
    const g = gps[0]!;
    expect(g.fields[0]).toBe(40 * 125); // time
    expect(g.fields[1]).toBe(371234567 + 1234); // lat = home + delta
    expect(g.fields[2]).toBe(1221234567 - 987); // lon = home + delta
    expect(g.fields[3]).toBe(450); // alt (dm)

    const events = log.events;
    expect(events.length).toBe(3); // SYNC_BEEP, FLIGHT_MODE, DISARM (LOG_END excluded)
    expect(events[0]!.code).toBe(0);
    expect(events[0]!.data['time']).toBe(500);
    expect(events[1]!.code).toBe(30);
    expect(events[1]!.data['newFlags']).toBe(3);
    expect(events[2]!.code).toBe(15);
    expect(events[2]!.data['reason']).toBe(2);
  });

  it('handles chunked feeds without corrupting the stream', () => {
    const { bytes } = buildTestLog();
    const parser = createBlackboxParser();
    // Feed in arbitrary 13-byte chunks.
    for (let i = 0; i < bytes.length; i += 13) {
      parser.feed(bytes.subarray(i, Math.min(i + 13, bytes.length)));
    }
    const log = parser.finalize();

    const whole = createBlackboxParser();
    whole.feed(bytes);
    const wholeLog = whole.finalize();

    expect(log.frames.length).toBe(wholeLog.frames.length);
    expect(log.events.length).toBe(wholeLog.events.length);
    const last = log.frames[log.frames.length - 1]!;
    const wholeLast = wholeLog.frames[wholeLog.frames.length - 1]!;
    expect(last.fields).toEqual(wholeLast.fields);
  });

  it('converts to DataFlashLog shape (GPS, BAT, MODE, EVT, MAIN)', () => {
    const parser = createBlackboxParser();
    parser.feed(buildTestLog().bytes);
    const dfl = convertBlackboxToDataFlashLog(parser.finalize());

    expect(dfl.metadata.vehicleType).toBe('copter');
    expect(dfl.metadata.firmwareVersion).toBe('4.5.1');
    expect(dfl.metadata.firmwareString).toBe('Betaflight 4.5.1');

    const gps = dfl.messages.get('GPS')!;
    expect(gps.length).toBe(1);
    expect(gps[0]!.fields['Lat']).toBeCloseTo(37.1235801, 7);
    expect(gps[0]!.fields['Lng']).toBeCloseTo(122.123358, 7);
    expect(gps[0]!.fields['Alt']).toBe(45); // dm -> m
    expect(gps[0]!.fields['NSats']).toBe(12);
    expect(gps[0]!.fields['HDop']).toBeCloseTo(0.89, 2);
    expect(gps[0]!.fields['Spd']).toBeCloseTo(15.0, 2);

    const bat = dfl.messages.get('BAT')!;
    expect(bat.length).toBeGreaterThan(0);
    expect(bat[0]!.fields['Volt']).toBeCloseTo(10.5, 2); // centivolts / 100
    expect(bat[0]!.fields['Curr']).toBeCloseTo(30.0, 2); // deciamps / 100
    // Battery row spacing >= 100ms.
    for (let i = 1; i < bat.length; i++) {
      expect(bat[i]!.timeUs - bat[i - 1]!.timeUs).toBeGreaterThanOrEqual(100_000);
    }

    const mode = dfl.messages.get('MODE')!;
    expect(mode.length).toBe(1);
    expect(mode[0]!.fields['Name']).toBe('ARM + ANGLE');

    const evt = dfl.messages.get('EVT')!;
    expect(evt.length).toBe(2); // SYNC_BEEP + DISARM (FLIGHT_MODE -> MODE, LOG_END dropped)
    expect(evt[0]!.fields['Id']).toBe(0);
    expect(evt[1]!.fields['Id']).toBe(15);
    expect(evt[1]!.fields['reason']).toBe(2);

    const main = dfl.messages.get('MAIN')!;
    expect(main.length).toBe(25);
    expect(main[0]!.fields['loopIteration']).toBe(1);
    expect(main[0]!.fields['vbatLatest']).toBe(1050);

    expect(dfl.messages.get('SLOW')!.length).toBe(2);
    expect(dfl.messages.get('HOME')!.length).toBe(1);
    expect(dfl.messageTypes).toEqual(
      expect.arrayContaining(['GPS', 'BAT', 'MODE', 'EVT', 'MAIN', 'SLOW', 'HOME']),
    );
  });

  it('resyncs after a corrupt frame', () => {
    const { bytes, gFramePos } = buildTestLog();
    const corrupted = Array.from(bytes);
    corrupted[gFramePos] = 'X'.charCodeAt(0); // 'G' marker -> garbage byte

    const parser = createBlackboxParser();
    parser.feed(new Uint8Array(corrupted));
    const log = parser.finalize();

    expect(log.stats.totalCorruptFrames).toBeGreaterThan(0);
    // The stream invalidates until the next I frame resyncs it: the corrupt
    // P(36), the G frame and P(40..60) are lost (29 clean frames - 8).
    expect(log.frames.length).toBe(21);
    expect(log.frames.filter((f) => f.type === 'G').length).toBe(0);
  });

  it('parses blackbox_decode CSV payloads', () => {
    const { iDefs, gDefs } = makeFieldDefs();
    const lines: string[] = [];
    for (const line of [
      'Data version: 2',
      'I interval: 32',
      'P interval: 1/4',
      'Firmware type: Betaflight',
      'Firmware revision: Betaflight 4.5.1',
    ]) {
      lines.push(`H ${line}`);
    }
    lines.push(`H Field I name: ${iDefs.map((d) => d.name).join(',')}`);
    lines.push(`H Field I predictor: ${iDefs.map((d) => d.predictor).join(',')}`);
    lines.push(`H Field I encoding: ${iDefs.map((d) => d.encoding).join(',')}`);
    lines.push(`H Field P name: ${iDefs.map((d) => d.name).join(',')}`);
    lines.push(`H Field P predictor: ${iDefs.map((d) => d.predictor).join(',')}`);
    lines.push(`H Field P encoding: ${iDefs.map((d) => d.encoding).join(',')}`);
    lines.push(`H Field G name: ${gDefs.map((d) => d.name).join(',')}`);
    lines.push(`H Field G predictor: ${gDefs.map((d) => d.predictor).join(',')}`);
    lines.push(`H Field G encoding: ${gDefs.map((d) => d.encoding).join(',')}`);

    const mainValues = (iteration: number, timeUs: number): string =>
      [
        iteration, timeUs, 0, 0, 0, 0, 0, 1, -2, 3, 4, 1049, 3000, 1070, 1070, 1070, 1070,
      ].join(',');

    for (const [it, t] of [
      [1, 125],
      [4, 500],
      [8, 1000],
      [12, 1500],
    ] as const) {
      lines.push(`I,${mainValues(it, t)}`);
    }
    lines.push(`G,${[500, 371234567, 1221234567, 450, 12, 89, 1500, 2700].join(',')}`);

    const parser = createBlackboxParser();
    parser.feed(textEncoder.encode(lines.join('\n') + '\n'));
    const log = parser.finalize();

    expect(log.isCsv).toBe(true);
    const main = log.frames.filter((f) => f.type === 'I' || f.type === 'P');
    expect(main.length).toBe(4);
    expect(main[3]!.timeUs).toBe(1500);
    expect(log.frames.filter((f) => f.type === 'G').length).toBe(1);
  });
});
