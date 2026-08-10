/** Types for the parsed ULog (PX4) file. */

/** One leaf field of a subscription after nested types are flattened. */
export interface ULogLeaf {
  /** Full output name, e.g. `quat[2]` or `sub.nested[0].field`. */
  name: string;
  /** Basic type name: one of the ULog basic binary types. */
  type: string;
  /** Byte offset of this leaf within the packed message payload. */
  offset: number;
  /** For `char` arrays: number of chars. Otherwise undefined. */
  charLen?: number;
}

/** A parsed ULog message format (`F` message). */
export interface ULogFormat {
  name: string;
  /** Raw fields from the format string: type may be a nested message name. */
  fields: { type: string; arrayLength: number; name: string }[];
}

/** A subscription (`A` message). */
export interface ULogSubscription {
  msgId: number;
  multiId: number;
  name: string;
}

/** A single decoded data message. */
export interface ULogDataMessage {
  /** Topic name (for multi-instance topics this is `name` for id 0, else `name.<id>`). */
  type: string;
  /** Timestamp in microseconds (ULog `timestamp` field). */
  timeUs: number;
  /** Decoded fields. `_padding` fields are omitted; char arrays decode to strings. */
  fields: Record<string, number | string>;
}

/** Complete parsed ULog file. */
export interface ULogData {
  /** Log start timestamp from the 16-byte file header (us). */
  startTimestampUs: number;
  /** Info dictionary (`I` messages), keyed by key name. */
  info: Record<string, string | number | Uint8Array>;
  /** Format definitions (`F` messages). */
  formats: Map<string, ULogFormat>;
  /** Subscriptions (`A` messages), keyed by msg id. */
  subscriptions: Map<number, ULogSubscription>;
  /** Decoded data messages keyed by topic key (see ULogDataMessage.type). */
  messages: Record<string, ULogDataMessage[]>;
  /** All topic keys that have at least one data message. */
  messageTypes: string[];
  /** Min/max message timestamp in microseconds. */
  timeRange: { startUs: number; endUs: number };
}
