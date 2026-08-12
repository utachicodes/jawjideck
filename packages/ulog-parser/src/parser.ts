/**
 * Streaming binary parser for PX4 ULog (.ulg) files.
 *
 * Implements the current ULog spec (version 2, in use since PX4 ~v1.5):
 * - 16-byte file header (magic "ULog\x01\x12\x35" + version + start timestamp)
 * - 3-byte message header: uint16 msg_size (LE) + uint8 msg_type
 * - Definition messages: 'B' flag bits, 'F' formats, 'I' info, 'M' multi info,
 *   'P' parameters, 'Q' default parameters
 * - Data-section messages: 'A' subscriptions, 'R' unsubscriptions, 'D' data,
 *   'L' logged strings, 'C' tagged strings, 'S' sync, 'O' dropout
 * - Fields are PACKED (no implicit alignment); writers insert explicit
 *   `_padding[N]` fields where alignment is needed, and may omit a trailing
 *   padding field from the logged bytes.
 *
 * Reference behavior mirrors pyulog / the Foxglove TS parser: unknown message
 * types are skipped, truncated messages at EOF are discarded, and unknown
 * incompatible flag bits cause a hard parse error.
 *
 * No external dependencies.
 */
import type { ULogData, ULogDataMessage, ULogFormat, ULogLeaf, ULogSubscription } from './types.js';

export const ULOG_MAGIC = new Uint8Array([0x55, 0x4c, 0x6f, 0x67, 0x01, 0x12, 0x35]); // "ULog"

const MSG_FLAG_BITS = 0x42; // 'B'
const MSG_FORMAT = 0x46; // 'F'
const MSG_INFO = 0x49; // 'I'
const MSG_PARAMETER = 0x50; // 'P'
const MSG_PARAMETER_DEFAULT = 0x51; // 'Q'
const MSG_ADD_LOGGED = 0x41; // 'A'
const MSG_REMOVE_LOGGED = 0x52; // 'R'
const MSG_DATA = 0x44; // 'D'

/** Sanity cap for a single message payload (bytes). Larger = corrupted stream. */
const MAX_MSG_SIZE = 64 * 1024;

const BASIC_SIZES: Record<string, number> = {
  bool: 1,
  int8_t: 1,
  uint8_t: 1,
  int16_t: 2,
  uint16_t: 2,
  int32_t: 4,
  uint32_t: 4,
  int64_t: 8,
  uint64_t: 8,
  float: 4,
  double: 8,
  char: 1,
};

/** Read one scalar of a basic type from `view` at `offset` (little endian). */
function readBasic(view: DataView, offset: number, type: string): number {
  switch (type) {
    case 'bool':
      return view.getUint8(offset) !== 0 ? 1 : 0;
    case 'int8_t':
      return view.getInt8(offset);
    case 'uint8_t':
      return view.getUint8(offset);
    case 'int16_t':
      return view.getInt16(offset, true);
    case 'uint16_t':
      return view.getUint16(offset, true);
    case 'int32_t':
      return view.getInt32(offset, true);
    case 'uint32_t':
      return view.getUint32(offset, true);
    case 'int64_t':
      return Number(view.getBigInt64(offset, true));
    case 'uint64_t':
      return Number(view.getBigUint64(offset, true));
    case 'float':
      return view.getFloat32(offset, true);
    case 'double':
      return view.getFloat64(offset, true);
    case 'char':
      return view.getUint8(offset);
    default:
      return NaN;
  }
}

/** Strip NUL padding from a definition payload string. */
function stripNuls(s: string): string {
  return s.replace(/\0+$/g, '');
}

/** Parse an `F` format message payload: `name:type name;type[N] name;...` */
function parseFormat(payload: Uint8Array): ULogFormat {
  let text: string;
  try {
    text = new TextDecoder().decode(payload);
  } catch {
    text = '';
  }
  text = stripNuls(text);
  const colon = text.indexOf(':');
  if (colon === -1) throw new Error('Malformed format message (missing ":")');
  const name = text.slice(0, colon);
  const fields: ULogFormat['fields'] = [];
  for (const token of text.slice(colon + 1).split(';')) {
    if (token.length === 0) continue;
    const parts = token.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const typeStr = parts[0]!;
    const fieldName = parts[1]!;
    const bracket = typeStr.indexOf('[');
    if (bracket === -1) {
      fields.push({ type: typeStr, arrayLength: 0, name: fieldName });
    } else {
      const close = typeStr.indexOf(']');
      const arrayLength = Number.parseInt(typeStr.slice(bracket + 1, close), 10);
      fields.push({ type: typeStr.slice(0, bracket), arrayLength, name: fieldName });
    }
  }
  return { name, fields };
}

/** Parse an info/parameter message payload: `key_len u8`, key `"type name"`, value bytes. */
function parseInfo(payload: Uint8Array): { type: string; key: string; value: Uint8Array } {
  const keyLen = payload[0] ?? 0;
  const keyText = new TextDecoder().decode(payload.subarray(1, 1 + keyLen));
  const space = keyText.indexOf(' ');
  const type = space === -1 ? keyText : keyText.slice(0, space);
  const key = space === -1 ? '' : keyText.slice(space + 1);
  return { type, key, value: payload.subarray(1 + keyLen) };
}

/** Decode an info value by its declared type. */
function decodeInfoValue(type: string, value: Uint8Array): string | number | Uint8Array {
  if (type.startsWith('char[')) {
    return stripNuls(new TextDecoder().decode(value));
  }
  const size = BASIC_SIZES[type];
  if (size !== undefined && value.length >= size) {
    return readBasic(new DataView(value.buffer, value.byteOffset, value.byteLength), 0, type);
  }
  return value; // array or unknown: keep raw bytes
}

const textDecoder = new TextDecoder();

export interface UlogParserOptions {
  /**
   * Topics to skip entirely (subscriptions are still tracked so msg ids stay
   * aligned, but data payloads are not decoded). Used to drop high-rate raw
   * sensor streams (1 kHz gyro/accel) that would otherwise dominate memory.
   */
  ignoreTopics?: Set<string>;
  /** Optional progress callback after each feed. */
  onProgress?: (bytesConsumed: number) => void;
}

export interface UlogStreamParser {
  /** Feed a chunk of binary data. Safe to call with partial messages. */
  feed(chunk: Uint8Array): void;
  /** Get the final parsed log. Truncated trailing data is discarded. */
  finalize(): ULogData;
}

export function createUlogParser(options: UlogParserOptions = {}): UlogStreamParser {
  const ignoreTopics = options.ignoreTopics ?? new Set<string>();
  let buffer = new Uint8Array(0);
  let headerParsed = false;
  let startTimestampUs = 0;
  let parsed = 0; // bytes fully consumed
  let totalConsumed = 0; // for progress reporting

  const info: Record<string, string | number | Uint8Array> = {};
  const formats = new Map<string, ULogFormat>();
  const subscriptions = new Map<number, ULogSubscription>();
  const messages: Record<string, ULogDataMessage[]> = {};

  // Per-subscription precomputed decode plan: topic key + flat leaf list.
  const decodePlans = new Map<number, { topicKey: string; leaves: ULogLeaf[]; timestampOffset: number }>();

  function topicKey(name: string, multiId: number): string {
    return multiId === 0 ? name : `${name}.${multiId}`;
  }

  /** Flatten a format into packed leaves in physical order, offsets included. */
  function flattenFormat(format: ULogFormat): ULogLeaf[] {
    const out: ULogLeaf[] = [];
    const walk = (fields: ULogFormat['fields'], prefix: string, base: number): void => {
      let off = base;
      for (const field of fields) {
        const size = BASIC_SIZES[field.type];
        if (size !== undefined) {
          if (field.type === 'char' && field.arrayLength > 0) {
            out.push({ name: prefix + field.name, type: 'char', offset: off, charLen: field.arrayLength });
            off += field.arrayLength;
          } else {
            const n = field.arrayLength > 0 ? field.arrayLength : 1;
            for (let i = 0; i < n; i++) {
              out.push({
                name: prefix + field.name + (field.arrayLength > 0 ? `[${i}]` : ''),
                type: field.type,
                offset: off,
              });
              off += size;
            }
          }
        } else {
          // Nested message type: flatten recursively (formats may be defined later).
          const nested = formats.get(field.type);
          if (!nested) {
            // Unknown nested type — best effort: skip the field entirely.
            continue;
          }
          const save = out.length;
          walk(nested.fields, '', 0);
          const nestedLeaves = out.splice(save);
          const nestedSize = nestedLeaves.reduce(
            (sum, l) => sum + (l.charLen ?? BASIC_SIZES[l.type] ?? 1),
            0,
          );
          const count = field.arrayLength > 0 ? field.arrayLength : 1;
          for (let i = 0; i < count; i++) {
            for (const leaf of nestedLeaves) {
              out.push({
                name: prefix + field.name + (count > 1 ? `[${i}].` : '.') + leaf.name,
                type: leaf.type,
                offset: off + i * nestedSize + leaf.offset,
                charLen: leaf.charLen,
              });
            }
          }
          off += nestedSize * count;
        }
      }
    };
    walk(format.fields, '', 0);
    return out;
  }

  /** Build the decode plan for a subscription (formats must already be known). */
  function buildPlan(sub: ULogSubscription): void {
    const format = formats.get(sub.name);
    if (!format) {
      decodePlans.delete(sub.msgId);
      return;
    }
    const allLeaves = flattenFormat(format);
    const timestampLeaf = allLeaves.find((l) => l.name === 'timestamp');
    decodePlans.set(sub.msgId, {
      topicKey: topicKey(sub.name, sub.multiId),
      leaves: allLeaves.filter((l) => l.name !== 'timestamp' && !l.name.startsWith('_')),
      timestampOffset: timestampLeaf?.offset ?? -1,
    });
  }

  /** Decode a data payload into a message object. */
  function decodeData(sub: ULogSubscription, payload: Uint8Array): ULogDataMessage | null {
    let plan = decodePlans.get(sub.msgId);
    if (!plan) {
      buildPlan(sub);
      plan = decodePlans.get(sub.msgId);
      if (!plan) return null;
    }
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let timeUs = 0;
    if (plan.timestampOffset >= 0 && plan.timestampOffset + 8 <= payload.length) {
      timeUs = Number(view.getBigUint64(plan.timestampOffset, true));
    }
    const fields: Record<string, number | string> = {};
    for (const leaf of plan.leaves) {
      if (leaf.charLen !== undefined) {
        const start = leaf.offset;
        const len = Math.min(leaf.charLen, Math.max(0, payload.length - start));
        try {
          fields[leaf.name] =
            len > 0 ? stripNuls(textDecoder.decode(payload.subarray(start, start + len))) : '';
        } catch {
          fields[leaf.name] = '';
        }
      } else {
        const size = BASIC_SIZES[leaf.type] ?? 0;
        if (size === 0 || leaf.offset + size > payload.length) continue; // truncated
        fields[leaf.name] = readBasic(view, leaf.offset, leaf.type);
      }
    }
    return { type: plan.topicKey, timeUs, fields };
  }

  function pushMessage(msg: ULogDataMessage): void {
    const arr = messages[msg.type];
    if (arr) arr.push(msg);
    else messages[msg.type] = [msg];
  }

  /** Parse as many complete messages as possible from `buffer` starting at `parsed`. */
  function drain(): void {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    let pos = parsed;
    while (pos + 3 <= buffer.length) {
      const msgSize = view.getUint16(pos, true);
      const msgType = view.getUint8(pos + 2);
      const total = 3 + msgSize;
      if (msgSize === 0 || msgSize > MAX_MSG_SIZE) {
        // Corrupted stream: resync by advancing a single byte (pyulog behavior).
        pos += 1;
        continue;
      }
      if (pos + total > buffer.length) break; // incomplete message: wait for more data

      const payload = buffer.subarray(pos + 3, pos + total);

      if (msgType === MSG_FORMAT) {
        try {
          const fmt = parseFormat(payload);
          formats.set(fmt.name, fmt);
        } catch {
          // Malformed format: skip the message.
        }
      } else if (msgType === MSG_INFO) {
        const pi = parseInfo(payload);
        info[pi.key] = decodeInfoValue(pi.type, pi.value);
      } else if (msgType === MSG_ADD_LOGGED) {
        if (payload.length >= 3) {
          // Payload: multi_id u8, msg_id u16 (LE), name (NUL-terminated).
          const sub: ULogSubscription = {
            multiId: payload[0] ?? 0,
            msgId: view.getUint16(pos + 4, true),
            name: stripNuls(textDecoder.decode(payload.subarray(3))),
          };
          subscriptions.set(sub.msgId, sub);
        }
      } else if (msgType === MSG_REMOVE_LOGGED) {
        if (payload.length >= 2) {
          subscriptions.delete(view.getUint16(pos + 3, true));
          decodePlans.delete(view.getUint16(pos + 3, true));
        }
      } else if (msgType === MSG_DATA) {
        if (payload.length >= 2) {
          const msgId = view.getUint16(pos + 3, true);
          const sub = subscriptions.get(msgId);
          if (sub && !ignoreTopics.has(sub.name) && !ignoreTopics.has(topicKey(sub.name, sub.multiId))) {
            const msg = decodeData(sub, payload.subarray(2));
            if (msg) pushMessage(msg);
          }
          // Skipped/unknown msg id: payload not decoded.
        }
      } else if (msgType === MSG_FLAG_BITS) {
        if (payload.length >= 16) {
          const incompatFlags = payload.subarray(8, 16);
          // Bit 0 = DATA_APPENDED (still parseable by reading straight through).
          if (incompatFlags[0] !== undefined && (incompatFlags[0] & ~0x01) !== 0) {
            throw new Error('ULog has unknown incompatible flag bits set — cannot parse');
          }
          for (let i = 1; i < 8; i++) {
            if (incompatFlags[i]) {
              throw new Error('ULog has unknown incompatible flag bits set — cannot parse');
            }
          }
        }
      }
      // 'M', 'P', 'Q', 'L', 'C', 'O', 'S' and unknown types: skip payload.

      pos += total;
    }
    parsed = pos;
  }

  return {
    feed(chunk: Uint8Array): void {
      totalConsumed += chunk.length;
      if (!headerParsed) {
        const needed = 16 - buffer.length;
        if (needed > 0) {
          const take = Math.min(needed, chunk.length);
          const next = new Uint8Array(buffer.length + take);
          next.set(buffer, 0);
          next.set(chunk.subarray(0, take), buffer.length);
          buffer = next;
          if (buffer.length < 16) return;
        }
        headerParsed = true;
        for (let i = 0; i < 7; i++) {
          if (buffer[i] !== ULOG_MAGIC[i]) {
            throw new Error('Invalid file format (not a ULog file)');
          }
        }
        startTimestampUs = Number(new DataView(buffer.buffer, buffer.byteOffset, 16).getBigUint64(8, true));
        parsed = 16;
        const rest = chunk.subarray(needed);
        if (rest.length > 0) {
          const next = new Uint8Array(16 + rest.length);
          next.set(buffer, 0);
          next.set(rest, 16);
          buffer = next;
        }
        drain();
      } else {
        const keep = buffer.length - parsed;
        const next = new Uint8Array(keep + chunk.length);
        if (keep > 0) next.set(buffer.subarray(parsed), 0);
        next.set(chunk, keep);
        buffer = next;
        parsed = 0;
        drain();
      }
      options.onProgress?.(totalConsumed);
    },

    finalize(): ULogData {
      let minUs = Number.POSITIVE_INFINITY;
      let maxUs = Number.NEGATIVE_INFINITY;
      const messageTypes: string[] = [];
      for (const [key, msgs] of Object.entries(messages)) {
        messageTypes.push(key);
        for (const m of msgs) {
          if (m.timeUs < minUs) minUs = m.timeUs;
          if (m.timeUs > maxUs) maxUs = m.timeUs;
        }
      }
      return {
        startTimestampUs,
        info,
        formats,
        subscriptions,
        messages,
        messageTypes,
        timeRange: {
          startUs: Number.isFinite(minUs) ? minUs : 0,
          endUs: Number.isFinite(maxUs) ? maxUs : 0,
        },
      };
    },
  };
}

/** True when `bytes` starts with the ULog magic sequence. */
export function isUlogBuffer(bytes: Uint8Array): boolean {
  if (bytes.length < 7) return false;
  for (let i = 0; i < 7; i++) {
    if (bytes[i] !== ULOG_MAGIC[i]) return false;
  }
  return true;
}
