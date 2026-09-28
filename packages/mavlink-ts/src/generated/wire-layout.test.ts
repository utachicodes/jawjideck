/**
 * Tests for MAVLink wire layout
 *
 * Extension fields must follow the size-sorted base fields in declaration
 * order. The generator once sorted them in with the base fields, which moved
 * every field after them (GPS fix/satellites, HOME_POSITION, STATUSTEXT,
 * MANUAL_CONTROL...). Fixtures are payloads packed by pymavlink.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MESSAGE_REGISTRY } from './message-registry.js';
import { MAVLinkParser } from '../core/mavlink-parser.js';
import { crcCalculateWithExtra } from '../core/crc.js';

interface Vector {
  name: string;
  msgid: number;
  payload: string;
  fields: Record<string, unknown>;
  types: Record<string, string>;
}

const vectors: Vector[] = JSON.parse(
  readFileSync(new URL('./__fixtures__/pymavlink-vectors.json', import.meta.url), 'utf8'),
);

const norm = (s: string) => s.replace(/_/g, '').toLowerCase();
const hexToBytes = (hex: string) => Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));

function fieldOf(obj: Record<string, unknown>, field: string): unknown {
  const key = Object.keys(obj).find((k) => norm(k) === norm(field));
  return key === undefined ? undefined : obj[key];
}

function expectField(actual: unknown, expected: unknown, type: string) {
  if (Array.isArray(expected)) {
    expected.forEach((v, i) => expectField((actual as unknown[])[i], v, type));
  } else if (typeof expected === 'string') {
    expect(actual).toBe(expected);
  } else if (type === 'float') {
    expect(Math.fround(Number(actual))).toBe(Math.fround(expected as number));
  } else {
    expect(String(actual)).toBe(String(expected));
  }
}

describe('MAVLink wire layout matches pymavlink', () => {
  for (const v of vectors) {
    const info = MESSAGE_REGISTRY.get(v.msgid)!;

    it(`${v.name} decodes every field`, () => {
      const msg = info.deserialize(hexToBytes(v.payload)) as Record<string, unknown>;
      for (const [field, expected] of Object.entries(v.fields)) {
        const actual = fieldOf(msg, field);
        if (actual === undefined) continue; // field newer than our generated types
        expectField(actual, expected, v.types[field]!);
      }
    });

    it(`${v.name} re-encodes to the same payload`, () => {
      const msg = info.deserialize(hexToBytes(v.payload));
      const out = Buffer.from(info.serialize(msg)).toString('hex');
      expect(out).toBe(v.payload.slice(0, out.length));
    });
  }
});

describe('MAVLinkParser payload length handling', () => {
  // Build a MAVLink 1 GPS_RAW_INT frame (base fields only, 30 bytes).
  function v1Frame(msgid: number, payload: Uint8Array): Uint8Array {
    const frame = new Uint8Array(6 + payload.length + 2);
    frame.set([0xfe, payload.length, 0, 1, 1, msgid]);
    frame.set(payload, 6);
    const crc = crcCalculateWithExtra(frame, 6 + payload.length, MESSAGE_REGISTRY.get(msgid)!.crcExtra);
    frame[6 + payload.length] = crc & 0xff;
    frame[7 + payload.length] = crc >> 8;
    return frame;
  }

  it('accepts a MAVLink 1 packet without extension fields and zero-pads it', async () => {
    const gps = vectors.find((v) => v.name === 'GPS_RAW_INT')!;
    const base = hexToBytes(gps.payload).slice(0, 30);
    const parser = new MAVLinkParser();
    parser.registerMessage(MESSAGE_REGISTRY.get(24)!);

    const packets = [];
    for await (const p of parser.parse(v1Frame(24, base))) packets.push(p);

    expect(packets).toHaveLength(1);
    expect(packets[0]!.payload.length).toBe(52);
    const msg = MESSAGE_REGISTRY.get(24)!.deserialize(packets[0]!.payload) as Record<string, unknown>;
    expect(msg.satellitesVisible).toBe(gps.fields.satellites_visible);
    expect(msg.altEllipsoid).toBe(0);
  });
});
