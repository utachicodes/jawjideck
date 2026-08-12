/**
 * Types for Betaflight/iNav Blackbox (.bbl / blackbox_decode .csv) logs.
 *
 * The blackbox format is documented at
 * https://betaflight.com/docs/development/Blackbox-Internals and the reference
 * decoder is the blackbox-log-viewer used by blackbox.betaflight.com:
 * https://github.com/betaflight/blackbox-log-viewer
 */

/** Definition of one frame type ('I', 'P', 'G', 'H', 'S') read from the header. */
export interface BlackboxFrameDef {
  name: string[];
  count: number;
  signed: number[];
  predictor: number[];
  encoding: number[];
}

/** A single decoded frame (raw integer field values, predictions applied). */
export interface BlackboxFrame {
  type: 'I' | 'P' | 'G' | 'H' | 'S';
  /** Frame index within the stream (I/P/G/H/S frames share one counter). */
  index: number;
  /** Microsecond timestamp (from the frame's own `time` field when present). */
  timeUs: number;
  fields: number[];
}

/** A decoded event frame (`E` frames). */
export interface BlackboxEvent {
  /** Event code — see FlightLogEvent. */
  code: number;
  /** Microsecond timestamp (best available; often the last main frame time). */
  timeUs: number;
  /** Event payload (values depend on the event type). */
  data: Record<string, number | string>;
}

/**
 * Header/system configuration parsed from the log header. Only the values the
 * decoder (or downstream analysis) actually needs are kept.
 */
export interface BlackboxSysConfig {
  /** `Data version` header value. */
  dataVersion: number;
  /** `Firmware type`: Betaflight / Cleanflight / Baseflight / iNav / unknown. */
  firmwareType: string;
  /** `Firmware revision`, e.g. "4.5.1". */
  firmwareVersion: string;
  /** Full `Firmware revision` string, e.g. "Betaflight 4.5.1". */
  firmwareRevision: string;
  /** `Board information` header value. */
  boardInformation: string;
  /** `I interval` — main-loop iterations per I frame. */
  frameIntervalI: number;
  /** `P interval` numerator (older "num/denom" form). */
  frameIntervalPNum: number;
  /** `P interval` denominator (older "num/denom" form). */
  frameIntervalPDenom: number;
  /** `minthrottle` header value (used by the MINTHROTTLE predictor). */
  minthrottle: number;
  /** `maxthrottle` header value. */
  maxthrottle: number;
  /** `vbatref` header value (used by the VBATREF predictor). */
  vbatref: number;
  /** `vbatscale` header value (legacy vbat ADC conversion). */
  vbatscale: number;
  /** `currentMeter` offset (legacy current ADC conversion). */
  currentMeterOffset: number;
  /** `currentMeter` scale (legacy current ADC conversion). */
  currentMeterScale: number;
  /** All other header fields, kept for reference/debugging. */
  raw: Record<string, string>;
}

/** Fully parsed blackbox log. */
export interface BlackboxLog {
  frameDefs: Partial<Record<'I' | 'P' | 'G' | 'H' | 'S', BlackboxFrameDef>>;
  sysConfig: BlackboxSysConfig;
  /** Decoded data frames in stream order (I/P/G/H/S). */
  frames: BlackboxFrame[];
  /** Decoded event frames in stream order. */
  events: BlackboxEvent[];
  /** True when the payload was decoded from a blackbox_decode CSV export. */
  isCsv: boolean;
  timeRange: { startUs: number; endUs: number };
  /** Parse statistics (for debugging/logging). */
  stats: {
    totalBytes: number;
    totalCorruptFrames: number;
    frameCount: number;
    eventCount: number;
  };
}

/** Streaming parser interface. */
export interface BlackboxStreamParser {
  /** Feed a chunk of file bytes. Safe to call with partial data. */
  feed(chunk: Uint8Array): void;
  /** Get the final parsed log. */
  finalize(): BlackboxLog;
  /** Optional progress callback after each feed. */
  onProgress?: (bytesConsumed: number) => void;
}
