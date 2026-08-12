import { describe, expect, it } from 'vitest';
import { createUlogParser, isUlogBuffer } from '../parser.js';
import { makeUlog, pack } from './make-ulog.js';

function feedInChunks(parser: ReturnType<typeof createUlogParser>, buffer: Uint8Array, size: number): void {
  for (let i = 0; i < buffer.length; i += size) {
    parser.feed(buffer.subarray(i, Math.min(i + size, buffer.length)));
  }
}

describe('createUlogParser', () => {
  it('parses header, formats, info, subscriptions and data messages', () => {
    const synth = makeUlog({
      formats: {
        vehicle_gps_position: ['int32_t lat', 'int32_t lon', 'int32_t alt', 'uint16_t hdop', 'uint8_t fix_type', 'uint8_t satellites_used', 'float vel_m_s'],
        vehicle_status: ['uint8_t arming_state', 'uint8_t nav_state'],
      },
      subscriptions: [
        { multiId: 0, msgId: 0, name: 'vehicle_gps_position' },
        { multiId: 0, msgId: 1, name: 'vehicle_status' },
      ],
      info: {
        sys_name: { type: 'char[10]', value: 'PX4' },
        ver_sw_release: { type: 'uint32_t', value: 0x010602ff },
      },
      startTimestampUs: 1234,
    });
    synth.addMsg('vehicle_gps_position', 0, pack(1000, [[4, 471234567], [4, 81654321], [4, 123456], [2, 250], [1, 3], [1, 12], [4, 0x3f800000]]));
    synth.addMsg('vehicle_status', 0, pack(2000, [[1, 1], [1, 3]]));
    const buffer = synth.build();

    const parser = createUlogParser();
    feedInChunks(parser, buffer, 7); // odd chunk size exercises partial messages
    const log = parser.finalize();

    expect(log.startTimestampUs).toBe(1234);
    expect(log.info['sys_name']).toBe('PX4');
    expect(log.info['ver_sw_release']).toBe(0x010602ff);

    const gps = log.messages['vehicle_gps_position'];
    expect(gps).toHaveLength(1);
    expect(gps![0]!.timeUs).toBe(1000);
    expect(gps![0]!.fields['lat']).toBe(471234567);
    expect(gps![0]!.fields['hdop']).toBe(250);
    expect(gps![0]!.fields['fix_type']).toBe(3);
    expect(gps![0]!.fields['vel_m_s']).toBe(1); // 0x3f800000 = 1.0f

    const status = log.messages['vehicle_status'];
    expect(status).toHaveLength(1);
    expect(status![0]!.fields['nav_state']).toBe(3);
    expect(status![0]!.fields['arming_state']).toBe(1);

    expect(log.messageTypes).toContain('vehicle_gps_position');
    expect(log.timeRange).toEqual({ startUs: 1000, endUs: 2000 });
  });

  it('expands arrays into indexed fields and decodes NUL-padded char arrays as strings', () => {
    const synth = makeUlog({
      formats: {
        vehicle_attitude: ['float[4] quat', 'char[10] label'],
      },
      subscriptions: [{ multiId: 0, msgId: 5, name: 'vehicle_attitude' }],
    });
    // quat = 1.0, 2.0, 3.0, 4.0 then "attitude\0\0"
    const payload = new Uint8Array(8 + 16 + 10);
    const view = new DataView(payload.buffer);
    view.setBigUint64(0, BigInt(5000), true);
    for (let i = 0; i < 4; i++) view.setFloat32(8 + i * 4, i + 1, true);
    payload.set(new TextEncoder().encode('attitude'), 24);
    synth.addMsg('vehicle_attitude', 0, payload);

    const log = createUlogParser();
    feedInChunks(log, synth.build(), 512);
    const parsed = log.finalize();
    const msg = parsed.messages['vehicle_attitude']![0]!;
    expect(msg.fields['quat[0]']).toBe(1);
    expect(msg.fields['quat[3]']).toBe(4);
    expect(msg.fields['label']).toBe('attitude');
    expect(msg.fields['quat']).toBeUndefined();
  });

  it('skips unknown message types (size-skip) and keeps parsing', () => {
    const synth = makeUlog({
      formats: { battery_status: ['float voltage_v', 'float current_a'] },
      subscriptions: [{ multiId: 0, msgId: 2, name: 'battery_status' }],
      // A message with an unknown type 'X' (size 3) right before the data.
      junkBeforeData: new Uint8Array([0x03, 0x00, 0x58, 0xde, 0xad, 0xbe]),
    });
    synth.addMsg('battery_status', 0, pack(100, [[4, 0x41800000], [4, 0x00000000]]));

    const log = createUlogParser();
    log.feed(synth.build());
    const parsed = log.finalize();
    expect(parsed.messages['battery_status']).toHaveLength(1);
    expect(parsed.messages['battery_status']![0]!.fields['voltage_v']).toBe(16); // 0x41800000
  });

  it('drops truncated trailing messages without crashing', () => {
    const synth = makeUlog({
      formats: { battery_status: ['float voltage_v', 'float current_a'] },
      subscriptions: [{ multiId: 0, msgId: 2, name: 'battery_status' }],
    });
    synth.addMsg('battery_status', 0, pack(100, [[4, 0x41800000], [4, 0x00000000]]));
    const good = synth.build();

    const cut = good.slice(0, good.length - 5); // last message incomplete at EOF
    const log = createUlogParser();
    log.feed(cut);
    const parsed = log.finalize();
    expect(parsed.messages['battery_status']).toBeUndefined();

    // A file truncated inside the 16-byte header parses to an empty log.
    const tiny = createUlogParser();
    tiny.feed(good.slice(0, 10));
    const tinyParsed = tiny.finalize();
    expect(tinyParsed.messageTypes).toEqual([]);
  });

  it('ignores topics in ignoreTopics without decoding their payloads', () => {
    const synth = makeUlog({
      formats: { sensor_gyro: ['float[3] xyz'] },
      subscriptions: [{ multiId: 0, msgId: 9, name: 'sensor_gyro' }],
    });
    synth.addMsg('sensor_gyro', 0, pack(1, [[4, 1]]));
    synth.addMsg('sensor_gyro', 0, pack(2, [[4, 1]]));

    const parser = createUlogParser({ ignoreTopics: new Set(['sensor_gyro']) });
    parser.feed(synth.build());
    const log = parser.finalize();
    expect(log.messages['sensor_gyro']).toBeUndefined();
  });

  it('handles multi-instance subscriptions with distinct topic keys', () => {
    const synth = makeUlog({
      formats: { sensor_mag: ['float[3] mag'] },
      subscriptions: [
        { multiId: 0, msgId: 3, name: 'sensor_mag' },
        { multiId: 1, msgId: 4, name: 'sensor_mag' },
      ],
    });
    synth.addMsg('sensor_mag', 0, pack(10, [[4, 0x3f800000]]));
    synth.addMsg('sensor_mag', 1, pack(20, [[4, 0x40000000]]));

    const log = createUlogParser();
    log.feed(synth.build());
    const parsed = log.finalize();
    expect(parsed.messages['sensor_mag']).toHaveLength(1);
    expect(parsed.messages['sensor_mag']![0]!.fields['mag[0]']).toBe(1);
    expect(parsed.messages['sensor_mag.1']).toHaveLength(1);
    expect(parsed.messages['sensor_mag.1']![0]!.fields['mag[0]']).toBe(2);
  });

  it('throws on a file that does not start with the ULog magic', () => {
    const parser = createUlogParser();
    expect(() => parser.feed(new Uint8Array(64))).toThrow(/not a ULog file/);
  });

  it('throws on unknown incompatible flag bits', () => {
    const synth = makeUlog({
      formats: {},
      subscriptions: [],
    });
    const buffer = synth.build();
    buffer[16 + 8 + 8] = 0x02; // incompat_flags[0] bit 1 set -> unknown
    const parser = createUlogParser();
    expect(() => parser.feed(buffer)).toThrow(/incompatible flag bits/);
  });

  it('isUlogBuffer detects the magic', () => {
    expect(isUlogBuffer(new Uint8Array([0x55, 0x4c, 0x6f, 0x67, 0x01, 0x12, 0x35, 0x00]))).toBe(true);
    expect(isUlogBuffer(new Uint8Array(8))).toBe(false);
  });
});
