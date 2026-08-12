/**
 * Streaming parser for Betaflight/iNav Blackbox logs (.bbl binary and
 * blackbox_decode .csv exports).
 *
 * Implements the blackbox format documented at
 * https://betaflight.com/docs/development/Blackbox-Internals with behavior
 * mirroring the reference decoder used by blackbox.betaflight.com
 * (https://github.com/betaflight/blackbox-log-viewer):
 *
 * - Header: `H field:value` ASCII lines, terminated by the first byte that
 *   doesn't start a header line.
 * - Frames: a single marker byte ('I' intraframe, 'P' interframe, 'G' GPS,
 *   'H' GPS home, 'S' slow, 'E' event) followed by the encoded field data.
 *   Fields are decoded with per-field predictor + encoding from the header.
 * - CSV: blackbox_decode exports the same header lines followed by
 *   `frameType,val,val,...` rows with predictions already applied.
 *
 * No external dependencies.
 */
import { BlackboxStream, EOF } from './bitstream.js';
import type {
  BlackboxEvent,
  BlackboxFrame,
  BlackboxFrameDef,
  BlackboxLog,
  BlackboxStreamParser,
  BlackboxSysConfig,
} from './types.js';

/** Sanity cap for a single frame's encoded length (bytes). */
const FLIGHT_LOG_MAX_FRAME_LENGTH = 256;
/** Time (us) and iteration jumps that indicate a corrupted/reset main stream. */
const MAXIMUM_TIME_JUMP_BETWEEN_FRAMES = 10 * 1000000;
const MAXIMUM_ITERATION_JUMP_BETWEEN_FRAMES = 500 * 10;

const FIELD_INDEX_ITERATION = 0;
const FIELD_INDEX_TIME = 1;

// Field predictors
const PREDICTOR_0 = 0;
const PREDICTOR_PREVIOUS = 1;
const PREDICTOR_STRAIGHT_LINE = 2;
const PREDICTOR_AVERAGE_2 = 3;
const PREDICTOR_MINTHROTTLE = 4;
const PREDICTOR_MOTOR_0 = 5;
const PREDICTOR_INC = 6;
const PREDICTOR_HOME_COORD = 7;
const PREDICTOR_1500 = 8;
const PREDICTOR_VBATREF = 9;
const PREDICTOR_LAST_MAIN_FRAME_TIME = 10;
const PREDICTOR_MINMOTOR = 11;
/** Internal: rewritten second member of a GPS home coord pair. */
const PREDICTOR_HOME_COORD_1 = 256;

// Field encodings (Betaflight numbering)
const ENCODING_SIGNED_VB = 0;
const ENCODING_UNSIGNED_VB = 1;
const ENCODING_NEG_14BIT = 3;
const ENCODING_TAG8_8SVB = 6;
const ENCODING_TAG2_3S32 = 7;
const ENCODING_TAG8_4S16 = 8;
const ENCODING_NULL = 9;
const ENCODING_TAG2_3SVARIABLE = 10;

// Event codes
export const FLIGHT_LOG_EVENT = {
  SYNC_BEEP: 0,
  AUTOTUNE_CYCLE_START: 10,
  AUTOTUNE_CYCLE_RESULT: 11,
  AUTOTUNE_TARGETS: 12,
  INFLIGHT_ADJUSTMENT: 13,
  LOGGING_RESUME: 14,
  DISARM: 15,
  GTUNE_CYCLE_RESULT: 20,
  FLIGHT_MODE: 30,
  TWITCH_TEST: 40,
  LOG_END: 255,
} as const;

const EVENT_NAMES: Record<number, string> = {
  [FLIGHT_LOG_EVENT.SYNC_BEEP]: 'SYNC_BEEP',
  [FLIGHT_LOG_EVENT.AUTOTUNE_CYCLE_START]: 'AUTOTUNE_CYCLE_START',
  [FLIGHT_LOG_EVENT.AUTOTUNE_CYCLE_RESULT]: 'AUTOTUNE_CYCLE_RESULT',
  [FLIGHT_LOG_EVENT.AUTOTUNE_TARGETS]: 'AUTOTUNE_TARGETS',
  [FLIGHT_LOG_EVENT.INFLIGHT_ADJUSTMENT]: 'INFLIGHT_ADJUSTMENT',
  [FLIGHT_LOG_EVENT.LOGGING_RESUME]: 'LOGGING_RESUME',
  [FLIGHT_LOG_EVENT.DISARM]: 'DISARM',
  [FLIGHT_LOG_EVENT.GTUNE_CYCLE_RESULT]: 'GTUNE_CYCLE_RESULT',
  [FLIGHT_LOG_EVENT.FLIGHT_MODE]: 'FLIGHT_MODE',
  [FLIGHT_LOG_EVENT.TWITCH_TEST]: 'TWITCH_TEST',
  [FLIGHT_LOG_EVENT.LOG_END]: 'LOG_END',
};

// In-flight adjustment function names (for INFLIGHT_ADJUSTMENT events)
const INFLIGHT_ADJUSTMENT_FUNCTIONS: Record<number, { name: string; scale?: number; scalef?: number }> = {
  0: { name: 'None' },
  1: { name: 'RC Rate', scale: 0.01 },
  2: { name: 'RC Expo', scale: 0.01 },
  3: { name: 'Throttle Expo', scale: 0.01 },
  4: { name: 'Pitch & Roll Rate', scale: 0.01 },
  5: { name: 'Yaw rate', scale: 0.01 },
  6: { name: 'Pitch & Roll P', scale: 0.1, scalef: 1 },
  7: { name: 'Pitch & Roll I', scale: 0.001, scalef: 0.1 },
  8: { name: 'Pitch & Roll D', scalef: 1000 },
  9: { name: 'Yaw P', scale: 0.1, scalef: 1 },
  10: { name: 'Yaw I', scale: 0.001, scalef: 0.1 },
  11: { name: 'Yaw D', scalef: 1000 },
  12: { name: 'Rate Profile' },
  13: { name: 'Pitch Rate', scale: 0.01 },
  14: { name: 'Roll Rate', scale: 0.01 },
  15: { name: 'Pitch P', scale: 0.1, scalef: 1 },
  16: { name: 'Pitch I', scale: 0.001, scalef: 0.1 },
  17: { name: 'Pitch D', scalef: 1000 },
  18: { name: 'Roll P', scale: 0.1, scalef: 1 },
  19: { name: 'Roll I', scale: 0.001, scalef: 0.1 },
  20: { name: 'Roll D', scalef: 1000 },
};

const END_OF_LOG_MESSAGE = 'End of log\0';

/** Default values used when a header field is absent (mirror reference). */
function defaultSysConfig(): BlackboxSysConfig {
  return {
    dataVersion: 2,
    firmwareType: 'Unknown',
    firmwareVersion: '',
    firmwareRevision: '',
    boardInformation: '',
    frameIntervalI: 32,
    frameIntervalPNum: 1,
    frameIntervalPDenom: 1,
    minthrottle: 1150,
    maxthrottle: 1850,
    vbatref: 4095,
    vbatscale: 110,
    currentMeterOffset: 0,
    currentMeterScale: 400,
    raw: {},
  };
}

function parseCommaSeparatedInts(value: string): number[] {
  return value
    .split(',')
    .map((token) => {
      const trimmed = token.trim();
      if (trimmed.length === 0) return 0;
      const n = Number.parseInt(trimmed, 10);
      return Number.isNaN(n) ? 0 : n;
    });
}

function parseFirmwareRevision(value: string): { type: string; version: string } {
  const fw = /((?:Beta|Race|Clean|Base|Butter)flight)\s+(\d+)\.(\d+)(?:\.(\d+))?/i.exec(value);
  if (fw) {
    const major = Number.parseInt(fw[2]!, 10);
    const minor = Number.parseInt(fw[3]!, 10);
    const patch = fw[4] ? Number.parseInt(fw[4]!, 10) : 0;
    return { type: fw[1]!.toLowerCase().replace(/flight$/, 'flight'), version: `${major}.${minor}.${patch}` };
  }
  const inav = /(INAV).*?(\d+)\.(\d+)(?:\.(\d+))?/i.exec(value);
  if (inav) {
    const major = Number.parseInt(inav[2]!, 10);
    const minor = Number.parseInt(inav[3]!, 10);
    const patch = inav[4] ? Number.parseInt(inav[4]!, 10) : 0;
    return { type: 'inav', version: `${major}.${minor}.${patch}` };
  }
  return { type: 'Unknown', version: '' };
}

export function createBlackboxParser(options: { onProgress?: (bytesConsumed: number) => void } = {}): BlackboxStreamParser {
  const onProgress = options.onProgress;

  let buffer = new Uint8Array(0);
  let parsed = 0; // bytes fully consumed from `buffer`
  let headerDone = false;
  let isCsv = false;
  let csvHeaderRowSeen = false;
  let bytesConsumed = 0;

  const sysConfig = defaultSysConfig();
  const frameDefs: Partial<Record<'I' | 'P' | 'G' | 'H' | 'S', BlackboxFrameDef>> = {};
  const frames: BlackboxFrame[] = [];
  const events: BlackboxEvent[] = [];
  const stats = { totalBytes: 0, totalCorruptFrames: 0, frameCount: 0, eventCount: 0 };

  // ── main-stream state (mirrors the reference parser) ──────────────────────
  const mainHistoryRing: number[][] = [];
  const mainHistory: (number[] | null)[] = [null, null, null];
  let mainStreamIsValid = false;
  let gpsHomeHistory: number[][] = [];
  let gpsHomeIsValid = false;
  let lastGPS: number[] = [];
  let lastSlow: number[] = [];
  let lastEvent: BlackboxEvent | null = null;
  let lastSkippedFrames = 0;
  let lastMainFrameIteration = -1;
  let lastMainFrameTime = -1;
  let lastFrameType: { marker: string; complete: (frameStart: number, frameEnd: number) => boolean } | null = null;
  let frameStart = 0;
  let frameIndex = 0;
  let logEndReached = false;

  const nameToIndex = (frameName: string, names: string[]): number => {
    return names.indexOf(frameName);
  };

  function invalidateMainStream(): void {
    mainStreamIsValid = false;
    mainHistory[0] = mainHistoryRing[0] ?? null;
    mainHistory[1] = null;
    mainHistory[2] = null;
  }

  /** Should a frame with the given iteration index be present in this log? */
  function shouldHaveFrame(frameIndexIter: number): boolean {
    return (
      ((frameIndexIter % sysConfig.frameIntervalI) + sysConfig.frameIntervalPNum - 1) %
        sysConfig.frameIntervalPDenom <
      sysConfig.frameIntervalPNum
    );
  }

  function countIntentionallySkippedFrames(): number {
    if (lastMainFrameIteration === -1) return 0;
    let count = 0;
    for (let i = lastMainFrameIteration + 1; !shouldHaveFrame(i); i++) count++;
    return count;
  }

  function countIntentionallySkippedFramesTo(targetIteration: number): number {
    if (lastMainFrameIteration === -1) return 0;
    let count = 0;
    for (let i = lastMainFrameIteration + 1; i < targetIteration; i++) {
      if (!shouldHaveFrame(i)) count++;
    }
    return count;
  }

  /** Push the given main frame into the `frames` list as a published record. */
  function publishFrame(marker: string, values: number[], timeUs: number): void {
    // Copy the values — the history buffers are reused by later parses.
    frames.push({
      type: marker as BlackboxFrame['type'],
      index: frameIndex++,
      timeUs,
      fields: values.slice(),
    });
    stats.frameCount++;
  }

  function completeIntraframe(frameStartPos: number, frameEndPos: number): boolean {
    let acceptFrame = true;
    const current = mainHistory[0];
    if (!current) return false;

    if (lastMainFrameIteration !== -1) {
      acceptFrame =
        current[FIELD_INDEX_ITERATION]! >= lastMainFrameIteration &&
        current[FIELD_INDEX_ITERATION]! < lastMainFrameIteration + MAXIMUM_ITERATION_JUMP_BETWEEN_FRAMES &&
        current[FIELD_INDEX_TIME]! >= lastMainFrameTime &&
        current[FIELD_INDEX_TIME]! < lastMainFrameTime + MAXIMUM_TIME_JUMP_BETWEEN_FRAMES;
    }

    if (acceptFrame) {
      lastMainFrameIteration = current[FIELD_INDEX_ITERATION]!;
      lastMainFrameTime = current[FIELD_INDEX_TIME]!;
      mainStreamIsValid = true;
      publishFrame('I', current, current[FIELD_INDEX_TIME]!);
    } else {
      invalidateMainStream();
    }

    // Rotate history: both previous slots become the I-frame
    mainHistory[1] = mainHistory[0] ?? null;
    mainHistory[2] = mainHistory[0] ?? null;
    if (mainHistory[0] === mainHistoryRing[0]) mainHistory[0] = mainHistoryRing[1] ?? null;
    else if (mainHistory[0] === mainHistoryRing[1]) mainHistory[0] = mainHistoryRing[2] ?? null;
    else mainHistory[0] = mainHistoryRing[0] ?? null;
    return mainStreamIsValid;
  }

  function completeInterframe(frameStartPos: number, frameEndPos: number): boolean {
    const current = mainHistory[0];
    if (!current) return false;

    if (
      mainStreamIsValid &&
      (current[FIELD_INDEX_TIME]! > lastMainFrameTime + MAXIMUM_TIME_JUMP_BETWEEN_FRAMES ||
        current[FIELD_INDEX_ITERATION]! > lastMainFrameIteration + MAXIMUM_ITERATION_JUMP_BETWEEN_FRAMES)
    ) {
      mainStreamIsValid = false;
    }

    if (mainStreamIsValid) {
      lastMainFrameIteration = current[FIELD_INDEX_ITERATION]!;
      lastMainFrameTime = current[FIELD_INDEX_TIME]!;
      publishFrame('P', current, current[FIELD_INDEX_TIME]!);
    }

    if (mainStreamIsValid) {
      mainHistory[2] = mainHistory[1] ?? null;
      mainHistory[1] = mainHistory[0] ?? null;
      if (mainHistory[0] === mainHistoryRing[0]) mainHistory[0] = mainHistoryRing[1] ?? null;
      else if (mainHistory[0] === mainHistoryRing[1]) mainHistory[0] = mainHistoryRing[2] ?? null;
      else mainHistory[0] = mainHistoryRing[0] ?? null;
    }
    return mainStreamIsValid;
  }

  function completeGpsHomeFrame(): boolean {
    const current = gpsHomeHistory[0];
    if (!current) return false;
    for (let i = 0; i < current.length; i++) {
      if (gpsHomeHistory[1]) gpsHomeHistory[1][i] = current[i]!;
    }
    gpsHomeIsValid = true;
    publishFrame('H', current, current[0] ?? lastMainFrameTime);
    return true;
  }

  function completeGpsFrame(): boolean {
    if (gpsHomeIsValid && lastGPS.length > 0) {
      publishFrame('G', lastGPS, lastGPS[0] ?? lastMainFrameTime);
    }
    return gpsHomeIsValid;
  }

  function completeSlowFrame(): boolean {
    if (lastSlow.length > 0) {
      publishFrame('S', lastSlow, lastMainFrameTime);
    }
    return true;
  }

  function completeEventFrame(): boolean {
    if (lastEvent) {
      events.push(lastEvent);
      stats.eventCount++;
      return true;
    }
    return false;
  }

  /**
   * Parse the fields of a frame into the `current` buffer using the frame
   * definition, applying the previous-frame history for predictions.
   */
  function parseFrameFields(
    frameDef: BlackboxFrameDef,
    current: number[],
    previous: number[] | null,
    previous2: number[] | null,
    skippedFrames: number,
    stream: BlackboxStream,
  ): void {
    const predictor = frameDef.predictor;
    const encoding = frameDef.encoding;
    const values = new Array<number>(8);
    const gpsHome = gpsHomeHistory[1] ?? [];

    let i = 0;
    while (i < frameDef.count) {
      let value: number;

      if (predictor[i] === PREDICTOR_INC) {
        current[i] = (current[i] ?? 0) + skippedFrames + 1;
        if (previous) current[i] = (current[i] ?? 0) + (previous[i] ?? 0);
        i++;
        continue;
      }

      switch (encoding[i]) {
        case ENCODING_SIGNED_VB:
          value = stream.readSignedVB();
          break;
        case ENCODING_UNSIGNED_VB:
          value = stream.readUnsignedVB();
          break;
        case ENCODING_NEG_14BIT: {
          const u = stream.readUnsignedVB();
          value = u & 0x2000 ? (u | 0xffffc000) : u; // signExtend14Bit, then negate below
          value = -value;
          break;
        }
        case ENCODING_TAG8_4S16:
          stream.readTag8_4S16(values, sysConfig.dataVersion >= 2);
          for (let j = 0; j < 4; j++, i++) {
            current[i] = applyPrediction(i, predictor[i] ?? PREDICTOR_0, values[j] ?? 0, current, previous, previous2, gpsHome, stream);
          }
          continue;
        case ENCODING_TAG2_3S32:
          stream.readTag2_3S32(values);
          for (let j = 0; j < 3; j++, i++) {
            current[i] = applyPrediction(i, predictor[i] ?? PREDICTOR_0, values[j] ?? 0, current, previous, previous2, gpsHome, stream);
          }
          continue;
        case ENCODING_TAG2_3SVARIABLE:
          stream.readTag2_3SVariable(values);
          for (let j = 0; j < 3; j++, i++) {
            current[i] = applyPrediction(i, predictor[i] ?? PREDICTOR_0, values[j] ?? 0, current, previous, previous2, gpsHome, stream);
          }
          continue;
        case ENCODING_TAG8_8SVB: {
          // How many consecutive fields are in this encoded group?
          let groupCount = 1;
          for (let j = i + 1; j < i + 8 && j < frameDef.count; j++) {
            if (encoding[j] !== ENCODING_TAG8_8SVB) break;
            groupCount++;
          }
          stream.readTag8_8SVB(values, groupCount);
          for (let j = 0; j < groupCount; j++, i++) {
            current[i] = applyPrediction(i, predictor[i] ?? PREDICTOR_0, values[j] ?? 0, current, previous, previous2, gpsHome, stream);
          }
          continue;
        }
        case ENCODING_NULL:
          value = 0;
          break;
        default: {
          const enc = encoding[i];
          if (enc === undefined) throw new Error(`Missing field encoding header for field #${i} '${frameDef.name[i]}'`);
          throw new Error(`Unsupported field encoding ${enc}`);
        }
      }

      current[i] = applyPrediction(i, predictor[i] ?? PREDICTOR_0, value, current, previous, previous2, gpsHome, stream);
      i++;
    }
  }

  /** Apply the configured predictor for one field and return the decoded value. */
  function applyPrediction(
    fieldIndex: number,
    pred: number,
    value: number,
    current: number[],
    previous: number[] | null,
    previous2: number[] | null,
    gpsHome: number[],
    stream: BlackboxStream,
  ): number {
    switch (pred) {
      case PREDICTOR_0:
        break;
      case PREDICTOR_PREVIOUS:
        if (previous) value += previous[fieldIndex]!;
        break;
      case PREDICTOR_STRAIGHT_LINE:
        if (previous && previous2) value += 2 * previous[fieldIndex]! - previous2[fieldIndex]!;
        break;
      case PREDICTOR_AVERAGE_2:
        if (previous && previous2) value += ~~((previous[fieldIndex]! + previous2[fieldIndex]!) / 2);
        break;
      case PREDICTOR_MINTHROTTLE:
        value = Math.trunc(value) + sysConfig.minthrottle;
        break;
      case PREDICTOR_MINMOTOR:
        value = Math.trunc(value) + Math.trunc(sysConfig.minthrottle);
        break;
      case PREDICTOR_MOTOR_0: {
        const idx = nameToIndex('motor[0]', frameDefs.I?.name ?? []);
        if (idx === -1) throw new Error('Attempted to base I-field prediction on motor0 before it was read');
        value += current[idx]!;
        break;
      }
      case PREDICTOR_1500:
        value += 1500;
        break;
      case PREDICTOR_VBATREF:
        value += sysConfig.vbatref;
        break;
      case PREDICTOR_HOME_COORD: {
        const idx = nameToIndex('GPS_home[0]', frameDefs.H?.name ?? []);
        if (idx === -1) throw new Error('Attempted to base prediction on GPS home without GPS home frame definition');
        value += gpsHome[idx] ?? 0;
        break;
      }
      case PREDICTOR_HOME_COORD_1: {
        const idx = nameToIndex('GPS_home[1]', frameDefs.H?.name ?? []);
        if (idx === -1) throw new Error('Attempted to base prediction on GPS home without GPS home frame definition');
        value += gpsHome[idx] ?? 0;
        break;
      }
      case PREDICTOR_LAST_MAIN_FRAME_TIME:
        if (mainHistory[1]) value += mainHistory[1][FIELD_INDEX_TIME]!;
        break;
      default:
        throw new Error(`Unsupported field predictor ${pred}`);
    }
    return value;
  }

  function parseGpsHomeFrame(stream: BlackboxStream): void {
    if (frameDefs.H && gpsHomeHistory[0]) {
      parseFrameFields(frameDefs.H, gpsHomeHistory[0]!, null, null, 0, stream);
    }
  }

  function parseGpsFrame(stream: BlackboxStream): void {
    if (frameDefs.G && lastGPS.length > 0) {
      parseFrameFields(frameDefs.G, lastGPS, null, null, 0, stream);
    }
  }

  function parseSlowFrame(stream: BlackboxStream): void {
    if (frameDefs.S && lastSlow.length > 0) {
      parseFrameFields(frameDefs.S, lastSlow, null, null, 0, stream);
    }
  }

  function parseInterframe(stream: BlackboxStream): void {
    if (!frameDefs.P || !mainHistory[0]) return;
    lastSkippedFrames = countIntentionallySkippedFrames();
    parseFrameFields(frameDefs.P, mainHistory[0]!, mainHistory[1] ?? null, mainHistory[2] ?? null, lastSkippedFrames, stream);
  }

  function parseIntraframe(stream: BlackboxStream): void {
    if (!frameDefs.I || !mainHistory[0]) return;
    parseFrameFields(frameDefs.I, mainHistory[0]!, mainHistory[1] ?? null, null, 0, stream);
  }

  function parseInflightAdjustment(data: Record<string, number | string>): void {
    const tmp = streamReadU8();
    const func = tmp & 127;
    const value = tmp < 128 ? streamReadSignedVB() : floatFromU32(streamReadU32());
    const descr = INFLIGHT_ADJUSTMENT_FUNCTIONS[func];
    data.name = descr ? descr.name : 'Unknown';
    data.func = func;
    let scale = descr?.scale ?? 1;
    if (tmp >= 128 && descr?.scalef !== undefined) scale = descr.scalef;
    data.value = Math.round(value * scale * 10000) / 10000;
  }

  // Event parsing needs stream access; declare a mutable reference so the
  // helpers above can read from the active stream.
  let streamReadU8 = (): number => 0;
  let streamReadSignedVB = (): number => 0;
  let streamReadU32 = (): number => 0;

  function floatFromU32(v: number): number {
    const arr = new Uint32Array(1);
    arr[0] = v >>> 0;
    return new Float32Array(arr.buffer)[0]!;
  }

  function parseEventFrame(stream: BlackboxStream): void {
    streamReadU8 = () => stream.readByte();
    streamReadSignedVB = () => stream.readSignedVB();
    streamReadU32 = () => stream.readU32();

    const eventType = stream.readByte();
    const timeUs = lastMainFrameTime >= 0 ? lastMainFrameTime : 0;
    lastEvent = { code: eventType, timeUs, data: {} };

    switch (eventType) {
      case FLIGHT_LOG_EVENT.SYNC_BEEP:
        lastEvent.data.time = stream.readUnsignedVB();
        lastEvent.timeUs = lastEvent.data.time as number;
        break;
      case FLIGHT_LOG_EVENT.FLIGHT_MODE:
        lastEvent.data.newFlags = stream.readUnsignedVB();
        lastEvent.data.lastFlags = stream.readUnsignedVB();
        break;
      case FLIGHT_LOG_EVENT.DISARM:
        lastEvent.data.reason = stream.readUnsignedVB();
        break;
      case FLIGHT_LOG_EVENT.AUTOTUNE_CYCLE_START: {
        lastEvent.data.phase = stream.readByte();
        const cycleAndRising = stream.readByte();
        lastEvent.data.cycle = cycleAndRising & 0x7f;
        lastEvent.data.rising = (cycleAndRising >> 7) & 0x01;
        lastEvent.data.p = stream.readByte();
        lastEvent.data.i = stream.readByte();
        lastEvent.data.d = stream.readByte();
        break;
      }
      case FLIGHT_LOG_EVENT.AUTOTUNE_CYCLE_RESULT:
        lastEvent.data.overshot = stream.readByte();
        lastEvent.data.p = stream.readByte();
        lastEvent.data.i = stream.readByte();
        lastEvent.data.d = stream.readByte();
        break;
      case FLIGHT_LOG_EVENT.AUTOTUNE_TARGETS:
        lastEvent.data.currentAngle = stream.readS16() / 10;
        lastEvent.data.targetAngle = stream.readS8();
        lastEvent.data.targetAngleAtPeak = stream.readS8();
        lastEvent.data.firstPeakAngle = stream.readS16() / 10;
        lastEvent.data.secondPeakAngle = stream.readS16() / 10;
        break;
      case FLIGHT_LOG_EVENT.GTUNE_CYCLE_RESULT:
        lastEvent.data.axis = stream.readByte();
        lastEvent.data.gyroAVG = stream.readSignedVB();
        lastEvent.data.newP = stream.readS16();
        break;
      case FLIGHT_LOG_EVENT.INFLIGHT_ADJUSTMENT:
        parseInflightAdjustment(lastEvent.data);
        break;
      case FLIGHT_LOG_EVENT.TWITCH_TEST: {
        const stage = stream.readByte();
        lastEvent.data.name = ['', 'Response Time', 'Half Setpoint Time', 'Setpoint Time', 'Negative Setpoint', 'Initial Setpoint'][stage] ?? 'Unknown';
        lastEvent.data.value = floatFromU32(stream.readU32());
        break;
      }
      case FLIGHT_LOG_EVENT.LOGGING_RESUME:
        lastEvent.data.logIteration = stream.readUnsignedVB();
        lastEvent.data.currentTime = stream.readUnsignedVB();
        lastMainFrameIteration = lastEvent.data.logIteration as number;
        lastMainFrameTime = lastEvent.data.currentTime as number;
        break;
      case FLIGHT_LOG_EVENT.LOG_END: {
        const endMessage = stream.readString(END_OF_LOG_MESSAGE.length);
        if (endMessage === END_OF_LOG_MESSAGE) {
          logEndReached = true;
        } else {
          lastEvent = null;
        }
        break;
      }
      default:
        lastEvent = null;
    }
  }

  // ── header parsing ─────────────────────────────────────────────────────────

  /** Parse one header line (without the leading "H "). */
  function parseHeaderLine(line: string): void {
    const colon = line.indexOf(':');
    if (colon === -1) return;
    const rawName = line.slice(0, colon);
    const value = line.slice(colon + 1).trim();

    // Field definitions: "Field I name/predictor/encoding/signed"
    const fieldMatch = /^Field (.) (.+)$/.exec(rawName);
    if (fieldMatch) {
      const frameName = fieldMatch[1]! as 'I' | 'P' | 'G' | 'H' | 'S';
      const frameInfo = fieldMatch[2]!;
      const frameDef = (frameDefs[frameName] ??= {
        name: [],
        count: 0,
        signed: [],
        predictor: [],
        encoding: [],
      });
      if (frameInfo === 'name') {
        frameDef.name = value.split(',').map((n) => n.replace(/^gyroData/, 'gyroADC'));
        frameDef.count = frameDef.name.length;
        frameDef.signed.length = frameDef.count;
      } else if (frameInfo === 'predictor') {
        frameDef.predictor = parseCommaSeparatedInts(value);
      } else if (frameInfo === 'encoding') {
        frameDef.encoding = parseCommaSeparatedInts(value);
      } else if (frameInfo === 'signed') {
        frameDef.signed = parseCommaSeparatedInts(value);
      }
      return;
    }

    switch (rawName) {
      case 'Data version':
        sysConfig.dataVersion = Number.parseInt(value, 10) || 2;
        break;
      case 'I interval': {
        const v = Number.parseInt(value, 10);
        sysConfig.frameIntervalI = v >= 1 ? v : 1;
        break;
      }
      case 'P interval': {
        const slash = value.indexOf('/');
        if (slash === -1) {
          sysConfig.frameIntervalPNum = 1;
          sysConfig.frameIntervalPDenom = Number.parseInt(value, 10) || 1;
        } else {
          sysConfig.frameIntervalPNum = Number.parseInt(value.slice(0, slash), 10) || 1;
          sysConfig.frameIntervalPDenom = Number.parseInt(value.slice(slash + 1), 10) || 1;
        }
        break;
      }
      case 'Firmware type':
        sysConfig.firmwareType = value === 'Cleanflight' ? 'cleanflight' : value === 'Baseflight' ? 'baseflight' : value;
        break;
      case 'Firmware revision': {
        const parsed = parseFirmwareRevision(value);
        sysConfig.firmwareType = parsed.type;
        sysConfig.firmwareVersion = parsed.version;
        sysConfig.firmwareRevision = value;
        break;
      }
      case 'Board information':
        sysConfig.boardInformation = value;
        break;
      case 'minthrottle':
        sysConfig.minthrottle = Number.parseInt(value, 10) || sysConfig.minthrottle;
        break;
      case 'maxthrottle':
        sysConfig.maxthrottle = Number.parseInt(value, 10) || sysConfig.maxthrottle;
        break;
      case 'vbatref':
        sysConfig.vbatref = Number.parseInt(value, 10) || sysConfig.vbatref;
        break;
      case 'vbatscale':
        sysConfig.vbatscale = Number.parseInt(value, 10) || sysConfig.vbatscale;
        break;
      case 'currentMeter':
      case 'currentSensor': {
        const parts = parseCommaSeparatedInts(value);
        sysConfig.currentMeterOffset = parts[0] ?? 0;
        sysConfig.currentMeterScale = parts[1] ?? 400;
        break;
      }
      default:
        sysConfig.raw[rawName] = value;
        break;
    }
  }

  /** Consume header lines from `stream`; true when the header has ended. */
  function drainHeader(stream: BlackboxStream): boolean {
    while (true) {
      if (stream.pos >= stream.end) return false; // need more data

      // A header line is "H" followed by a space; anything else ends the header.
      const c = stream.readChar();
      if (c === EOF) return false;
      if (c !== 'H') {
        // Not a header line — if it's a frame marker the header ends here,
        // otherwise skip garbage (mirror reference behavior).
        if (c === 'I' || c === 'P' || c === 'G' || c === 'H' || c === 'S' || c === 'E') {
          stream.unreadChar();
          return true;
        }
        continue;
      }
      if (stream.peekChar() !== 0x20) {
        // 'H' not followed by space: could be a GPS-home frame marker, or the
        // buffer could end mid-'H '. Wait for more data before deciding.
        if (stream.eof) {
          stream.unreadChar();
          return false;
        }
        if (stream.pos > stream.start) stream.unreadChar();
        return true;
      }
      stream.readByte(); // consume the space

      // Read the rest of the line
      const lineStart = stream.pos;
      let lineEnd = -1;
      for (let i = lineStart; i < stream.end; i++) {
        const b = stream.dataAt(i);
        if (b === 0x0a || b === 0x00) {
          lineEnd = i;
          break;
        }
      }
      if (lineEnd === -1) {
        // Line not yet complete — rewind to the "H" so the next feed re-parses.
        stream.pos = lineStart - 2;
        return false;
      }
      const line = textDecoder.decode(stream.subarray(lineStart, lineEnd));
      parseHeaderLine(line);
      stream.pos = lineEnd + 1;
    }
  }

  // ── data parsing ───────────────────────────────────────────────────────────

  const FRAME_TYPES: Record<string, { marker: string; parse: (s: BlackboxStream) => void; complete: (fs: number, fe: number) => boolean }> = {
    I: { marker: 'I', parse: parseIntraframe, complete: completeIntraframe },
    P: { marker: 'P', parse: parseInterframe, complete: completeInterframe },
    G: { marker: 'G', parse: parseGpsFrame, complete: completeGpsFrame },
    H: { marker: 'H', parse: parseGpsHomeFrame, complete: completeGpsHomeFrame },
    S: { marker: 'S', parse: parseSlowFrame, complete: completeSlowFrame },
    E: { marker: 'E', parse: parseEventFrame, complete: completeEventFrame },
  };

  /** Allocate history buffers once field counts are known (after header). */
  function allocateBuffers(): void {
    const iCount = frameDefs.I?.count ?? 0;
    mainHistoryRing.length = 0;
    for (let i = 0; i < 3; i++) mainHistoryRing.push(new Array<number>(iCount).fill(0));
    mainHistory[0] = mainHistoryRing[0]!;
    mainHistory[1] = null;
    mainHistory[2] = null;

    if (frameDefs.H && frameDefs.G) {
      gpsHomeHistory = [new Array<number>(frameDefs.H.count).fill(0), new Array<number>(frameDefs.H.count).fill(0)];
      lastGPS = new Array<number>(frameDefs.G.count).fill(0);
      // Home coord predictors appear in pairs (lat/lon) — rewrite the second
      // occurrence so predictions apply to the right field.
      for (let i = 1; i < frameDefs.G.count; i++) {
        if (
          frameDefs.G.predictor[i - 1] === PREDICTOR_HOME_COORD &&
          frameDefs.G.predictor[i] === PREDICTOR_HOME_COORD
        ) {
          frameDefs.G.predictor[i] = PREDICTOR_HOME_COORD_1;
        }
      }
    } else {
      gpsHomeHistory = [];
      lastGPS = [];
    }
    if (frameDefs.S) lastSlow = new Array<number>(frameDefs.S.count).fill(0);
    else lastSlow = [];
  }

  /** Parse as many complete frames as possible from the buffer. */
  function drainData(stream: BlackboxStream): void {
    while (true) {
      const command = stream.readChar();
      if (command === EOF) {
        // A frame ending exactly at the buffer end is complete — finish it
        // now so the next feed starts with a clean frameStart.
        if (lastFrameType) {
          const lastFrameSize = stream.pos - frameStart;
          if (lastFrameSize <= FLIGHT_LOG_MAX_FRAME_LENGTH) {
            lastFrameType.complete(frameStart, stream.pos);
          } else {
            mainStreamIsValid = false;
            stats.totalCorruptFrames++;
          }
          lastFrameType = null;
        }
        break;
      }

      if (lastFrameType) {
        const lastFrameSize = stream.pos - frameStart;
        const looksLikeFrameCompleted = FRAME_TYPES[command] !== undefined || command === EOF;
        if (lastFrameSize <= FLIGHT_LOG_MAX_FRAME_LENGTH && looksLikeFrameCompleted) {
          lastFrameType.complete(frameStart, stream.pos);
        } else {
          // The previous frame was corrupt — resync one byte at a time.
          mainStreamIsValid = false;
          stats.totalCorruptFrames++;
          stream.pos = frameStart + 1;
          lastFrameType = null;
          continue;
        }
      }

      frameStart = stream.pos - 1;
      const frameType = FRAME_TYPES[command];
      if (frameType && (command === 'E' || frameDefs[command as 'I' | 'P' | 'G' | 'H' | 'S'])) {
        lastFrameType = frameType;
        frameType.parse(stream);
        if (stream.eof) {
          // Truncated frame at buffer end — roll back and wait for more data.
          stream.pos = frameStart;
          stream.eof = false;
          lastFrameType = null;
          break;
        }
        if (logEndReached) {
          // "End of log" event seen — consume the rest of the buffer.
          stream.pos = stream.end;
          return;
        }
      } else {
        mainStreamIsValid = false;
        lastFrameType = null;
      }
    }
    parsed = stream.pos;
  }

  /** Parse a blackbox_decode CSV payload row (predictions already applied). */
  function drainCsvData(stream: BlackboxStream): void {
    while (true) {
      if (stream.pos >= stream.end) break;
      const lineStart = stream.pos;
      let lineEnd = -1;
      for (let i = lineStart; i < stream.end; i++) {
        if (stream.dataAt(i) === 0x0a) {
          lineEnd = i;
          break;
        }
      }
      if (lineEnd === -1) break; // incomplete line — wait for more data
      const line = textDecoder.decode(stream.subarray(lineStart, lineEnd));
      stream.pos = lineEnd + 1;

      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      // Column-header row emitted by blackbox_decode ("frameType,loopIteration,...")
      if (!csvHeaderRowSeen && /^frameType\s*,/i.test(trimmed)) {
        csvHeaderRowSeen = true;
        continue;
      }

      const parts = trimmed.split(',');
      const marker = parts[0]!.trim();
      const frameDef = frameDefs[marker as 'I' | 'P' | 'G' | 'H' | 'S'];
      if (!frameDef) continue; // unknown row (events etc.)

      const values: number[] = [];
      for (let i = 1; i <= frameDef.count; i++) {
        const raw = parts[i];
        if (raw === undefined || raw.trim().toLowerCase() === 'nan' || raw.trim() === '') {
          values.push(0);
          continue;
        }
        const n = Number.parseFloat(raw);
        values.push(Number.isNaN(n) ? 0 : n);
      }

      // Track main-stream time/iteration state so P frames and events carry
      // meaningful timestamps (CSV rows are already fully decoded).
      if (marker === 'I' || marker === 'P') {
        const iter = values[FIELD_INDEX_ITERATION] ?? 0;
        const time = values[FIELD_INDEX_TIME] ?? lastMainFrameTime;
        if (iter < lastMainFrameIteration) {
          mainStreamIsValid = false;
        } else {
          mainStreamIsValid = true;
          lastMainFrameIteration = iter;
          lastMainFrameTime = time;
        }
        publishFrame(marker, values, time);
      } else if (marker === 'G') {
        publishFrame('G', values, values[0] ?? lastMainFrameTime);
      } else if (marker === 'S') {
        publishFrame('S', values, lastMainFrameTime);
      } else if (marker === 'H') {
        publishFrame('H', values, values[0] ?? lastMainFrameTime);
      }
    }
    parsed = stream.pos;
  }

  // ── feed / finalize ────────────────────────────────────────────────────────

  return {
    feed(chunk: Uint8Array): void {
      bytesConsumed += chunk.length;
      stats.totalBytes += chunk.length;

      const keep = buffer.length - parsed;
      const next = new Uint8Array(keep + chunk.length);
      if (keep > 0) next.set(buffer.subarray(parsed), 0);
      next.set(chunk, keep);
      buffer = next;
      parsed = 0;

      if (!headerDone) {
        const stream = new BlackboxStream(buffer, parsed, buffer.length);
        const headerEnded = drainHeader(stream);
        parsed = stream.pos;
        if (!headerEnded) {
          // Not enough data yet (or line incomplete) — compact and wait.
          const rem = buffer.length - parsed;
          const kept = new Uint8Array(rem);
          kept.set(buffer.subarray(parsed), 0);
          buffer = kept;
          parsed = 0;
          onProgress?.(bytesConsumed);
          return;
        }
        headerDone = true;

        // P frames derive their field layout from I frames.
        const p = frameDefs.P;
        const i = frameDefs.I;
        if (i && p) {
          p.count = i.count;
          p.name = i.name;
          p.signed = i.signed;
        }
        if (!i || i.count === 0 || i.encoding.length !== i.count || i.predictor.length !== i.count) {
          throw new Error('Log is missing required definitions for I frames, header may be corrupt');
        }
        if (!p || p.encoding.length !== p.count || p.predictor.length !== p.count) {
          throw new Error('Log is missing required definitions for P frames, header may be corrupt');
        }
        allocateBuffers();

        // Sniff whether the payload is binary or a CSV export.
        isCsv = sniffCsv(buffer, parsed);
      }

      const stream = new BlackboxStream(buffer, parsed, buffer.length);
      if (isCsv) drainCsvData(stream);
      else drainData(stream);
      parsed = stream.pos;

      const rem = buffer.length - parsed;
      const kept = new Uint8Array(rem);
      kept.set(buffer.subarray(parsed), 0);
      buffer = kept;
      parsed = 0;

      onProgress?.(bytesConsumed);
    },

    finalize(): BlackboxLog {
      let startUs = Number.POSITIVE_INFINITY;
      let endUs = Number.NEGATIVE_INFINITY;
      const allTimes: number[] = [];
      for (const f of frames) allTimes.push(f.timeUs);
      for (const e of events) allTimes.push(e.timeUs);
      for (const t of allTimes) {
        if (t < startUs) startUs = t;
        if (t > endUs) endUs = t;
      }
      return {
        frameDefs,
        sysConfig,
        frames,
        events,
        isCsv,
        timeRange: {
          startUs: Number.isFinite(startUs) ? startUs : 0,
          endUs: Number.isFinite(endUs) ? endUs : 0,
        },
        stats,
      };
    },
  };
}

const textDecoder = new TextDecoder();

/** True when the first bytes look like a blackbox log. */
export function isBlackboxBuffer(bytes: Uint8Array): boolean {
  const probeLen = Math.min(bytes.length, 4096);
  const probe = bytes.subarray(0, probeLen);
  const text = textDecoder.decode(probe);
  return (
    text.includes('H Data version:') ||
    text.includes('Product:Blackbox flight data recorder') ||
    text.includes('Blackbox flight data recorder')
  );
}

/** Sniff whether the payload after the header is a blackbox_decode CSV export. */
function sniffCsv(buffer: Uint8Array, offset: number): boolean {
  const probe = buffer.subarray(offset, Math.min(buffer.length, offset + 4096));
  const text = textDecoder.decode(probe);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;
  // blackbox_decode emits a "frameType,<I-field names>" column row first, then
  // `I,val,val,...` data rows. Binary payloads are byte-level, so require a
  // consistent letter+comma row shape across several lines to avoid false
  // positives from stray commas in encoded data.
  const rowShape = (l: string): boolean => /^(frameType|I|P|G|H|S|E)\s*,/.test(l.trim());
  if (!rowShape(lines[0]!)) return false;
  const matches = lines.slice(0, 5).filter(rowShape).length;
  return matches >= 3;
}
