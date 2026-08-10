/**
 * Test helper: build a synthetic ULog v2 binary file (the format PX4 writes)
 * so parser + converter tests run against a real byte layout without needing
 * a fixture .ulg checked into the repo.
 */
import { ULOG_MAGIC } from '../parser.js';

function u16(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
}

function u64(v: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(v), true);
  return out;
}

function msgHeader(type: number, size: number): Uint8Array {
  return new Uint8Array([size & 0xff, (size >> 8) & 0xff, type]);
}

function text(bytes: string): Uint8Array {
  return new TextEncoder().encode(bytes);
}

function i32(v: number): Uint8Array {
  const t = new Uint8Array(4);
  new DataView(t.buffer).setInt32(0, v, true);
  return t;
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export type PackField = [number, number] | ['float', number];

/** Pack numeric fields (LE) with a u64 timestamp at the front. */
export function pack(timestampUs: number, fields: PackField[]): Uint8Array {
  const out: Uint8Array[] = [u64(timestampUs)];
  for (const field of fields) {
    if (field[0] === 'float') {
      const tmp = new Uint8Array(4);
      new DataView(tmp.buffer).setFloat32(0, field[1], true);
      out.push(tmp);
      continue;
    }
    const [size, value] = field;
    const tmp = new Uint8Array(size);
    const view = new DataView(tmp.buffer);
    switch (size) {
      case 1: view.setUint8(0, value); break;
      case 2: view.setUint16(0, value, true); break;
      case 4: view.setInt32(0, value, true); break;
      case 8: view.setBigUint64(0, BigInt(value), true); break;
      default: throw new Error(`unsupported size ${size}`);
    }
    out.push(tmp);
  }
  return concat(...out);
}

export interface SyntheticUlog {
  /** Add one data message for a subscription; appends to the buffer. */
  addMsg: (name: string, multiId: number, payload: Uint8Array) => void;
  /** Final buffer once all messages are added. */
  build: () => Uint8Array;
}

/**
 * Build a synthetic ULog file. Format strings must NOT include the timestamp
 * field (it is auto-prepended as `uint64_t timestamp`).
 */
export function makeUlog(opts: {
  formats: Record<string, string[]>;
  subscriptions: Array<{ multiId: number; msgId: number; name: string }>;
  info?: Record<string, { type: string; value: string | number }>;
  startTimestampUs?: number;
  /** Raw bytes appended after the subscription messages (before any data). */
  junkBeforeData?: Uint8Array;
}): SyntheticUlog {
  const parts: Uint8Array[] = [];
  const subById = new Map<number, string>(); // msgId -> `${name}#${multiId}`

  const header = new Uint8Array(16);
  header.set(ULOG_MAGIC, 0);
  header[7] = 0; // version
  new DataView(header.buffer).setBigUint64(8, BigInt(opts.startTimestampUs ?? 0), true);
  parts.push(header);

  // 'B' flag bits: compat[8] + incompat[8] + appended_offsets[3x u64] = 40 bytes
  parts.push(msgHeader(0x42, 40));
  parts.push(new Uint8Array(40));

  for (const [name, fields] of Object.entries(opts.formats)) {
    const fmt = text(`${name}:uint64_t timestamp;${fields.join(';')};`);
    parts.push(msgHeader(0x46, fmt.length));
    parts.push(fmt);
  }

  if (opts.info) {
    for (const [key, { type, value }] of Object.entries(opts.info)) {
      const keyBytes = text(`${type} ${key}`);
      const valueBytes = typeof value === 'number' ? i32(value) : text(value);
      const payload = concat(new Uint8Array([keyBytes.length]), keyBytes, valueBytes);
      parts.push(msgHeader(0x49, payload.length));
      parts.push(payload);
    }
  }

  for (const sub of opts.subscriptions) {
    const name = text(sub.name);
    const payload = new Uint8Array(3 + name.length);
    payload[0] = sub.multiId;
    payload[1] = sub.msgId & 0xff;
    payload[2] = (sub.msgId >> 8) & 0xff;
    payload.set(name, 3);
    parts.push(msgHeader(0x41, payload.length));
    parts.push(payload);
    subById.set(sub.msgId, `${sub.name}#${sub.multiId}`);
  }

  if (opts.junkBeforeData) parts.push(opts.junkBeforeData);

  return {
    addMsg(name: string, multiId: number, payload: Uint8Array): void {
      let msgId = -1;
      for (const [id, key] of subById) {
        if (key === `${name}#${multiId}`) msgId = id;
      }
      if (msgId === -1) throw new Error(`no subscription for ${name} (multi ${multiId})`);
      const body = concat(u16(msgId), payload);
      parts.push(msgHeader(0x44, body.length));
      parts.push(body);
    },
    build(): Uint8Array {
      return concat(...parts);
    },
  };
}
