import { describe, expect, it } from 'vitest';
import { convertUlogToDataFlashLog, IGNORED_ULOG_TOPICS } from '../convert.js';
import { createUlogParser } from '../parser.js';
import { makeUlog, pack } from './make-ulog.js';

function parse(synth: ReturnType<typeof makeUlog>): ReturnType<typeof convertUlogToDataFlashLog> {
  const parser = createUlogParser({ ignoreTopics: IGNORED_ULOG_TOPICS });
  parser.feed(synth.build());
  return convertUlogToDataFlashLog(parser.finalize());
}

describe('convertUlogToDataFlashLog', () => {
  it('synthesizes GPS, BAT and MODE with ArduPilot field names', () => {
    const synth = makeUlog({
      formats: {
        vehicle_gps_position: ['int32_t lat', 'int32_t lon', 'int32_t alt', 'uint16_t hdop', 'uint8_t fix_type', 'uint8_t satellites_used', 'float vel_m_s'],
        battery_status: ['float voltage_v', 'float current_a', 'float discharged_mah'],
        vehicle_status: ['uint8_t arming_state', 'uint8_t nav_state', 'uint8_t is_rotary_wing'],
      },
      subscriptions: [
        { multiId: 0, msgId: 0, name: 'vehicle_gps_position' },
        { multiId: 0, msgId: 1, name: 'battery_status' },
        { multiId: 0, msgId: 2, name: 'vehicle_status' },
      ],
      info: {
        sys_name: { type: 'char[10]', value: 'PX4' },
        ver_sw_release: { type: 'uint32_t', value: 0x010602ff },
      },
    });

    synth.addMsg('vehicle_gps_position', 0, pack(1000, [
      [4, 471234567], [4, 81654321], [4, 123456], [2, 250], [1, 3], [1, 12], [4, 0x3f800000],
    ]));
    synth.addMsg('battery_status', 0, pack(2000, [
      ['float', 16], ['float', 0.5], ['float', 2400],
    ]));
    synth.addMsg('vehicle_status', 0, pack(3000, [[1, 1], [1, 2], [1, 1]])); // disarmed (1): no MODE
    synth.addMsg('vehicle_status', 0, pack(4000, [[1, 2], [1, 3], [1, 1]])); // armed (2): AUTO_MISSION
    synth.addMsg('vehicle_status', 0, pack(5000, [[1, 2], [1, 4], [1, 1]])); // armed: AUTO_LOITER
    synth.addMsg('vehicle_status', 0, pack(6000, [[1, 1], [1, 5], [1, 1]])); // disarmed: no MODE

    const log = parse(synth);

    const gps = log.messages.get('GPS')!;
    expect(gps).toHaveLength(1);
    expect(gps[0]!.fields['Lat']).toBeCloseTo(47.1234567);
    expect(gps[0]!.fields['Lng']).toBeCloseTo(8.1654321);
    expect(gps[0]!.fields['Alt']).toBeCloseTo(123.456);
    expect(gps[0]!.fields['NSats']).toBe(12);
    expect(gps[0]!.fields['HDop']).toBeCloseTo(2.5);
    expect(gps[0]!.fields['Spd']).toBe(1);
    expect(gps[0]!.fields['Status']).toBe(3);

    const bat = log.messages.get('BAT')!;
    expect(bat[0]!.fields['Volt']).toBe(16);
    expect(bat[0]!.fields['Curr']).toBe(0.5);
    expect(bat[0]!.fields['CurrTot']).toBe(2400);

    const modes = log.messages.get('MODE')!;
    expect(modes).toHaveLength(2);
    expect(modes[0]!.fields).toMatchObject({ ModeNum: 3, Name: 'AUTO_MISSION' });
    expect(modes[1]!.fields).toMatchObject({ ModeNum: 4, Name: 'AUTO_LOITER' });
  });

  it('keeps native topics verbatim and builds synth formats', () => {
    const synth = makeUlog({
      formats: { vehicle_attitude: ['float[4] quat'] },
      subscriptions: [{ multiId: 0, msgId: 5, name: 'vehicle_attitude' }],
    });
    synth.addMsg('vehicle_attitude', 0, pack(100, [[4, 0x3f800000], [4, 0], [4, 0], [4, 0]]));

    const log = parse(synth);
    expect(log.messages.get('vehicle_attitude')).toHaveLength(1);
    expect(log.messageTypes).toContain('vehicle_attitude');

    const fmt = log.formats.get(log.formats.size - 1)!;
    expect(fmt.name).toBe('vehicle_attitude');
    expect(fmt.fields).toEqual(['quat[0]', 'quat[1]', 'quat[2]', 'quat[3]']);
  });

  it('handles the newer PX4 vehicle_gps_position/vehicle_status layouts (v1.18+)', () => {
    const synth = makeUlog({
      formats: {
        vehicle_gps_position: ['double latitude_deg', 'double longitude_deg', 'double altitude_msl_m', 'uint8_t satellites_used', 'float hdop', 'float vel_m_s', 'uint8_t fix_type'],
        vehicle_status: ['uint64_t armed_time', 'uint8_t arming_state', 'uint8_t nav_state', 'uint8_t vehicle_type'],
      },
      subscriptions: [
        { multiId: 0, msgId: 0, name: 'vehicle_gps_position' },
        { multiId: 0, msgId: 1, name: 'vehicle_status' },
      ],
      info: {
        sys_name: { type: 'char[10]', value: 'PX4' },
        ver_sw_release: { type: 'uint32_t', value: 0x011200ff }, // v1.18.0
      },
    });

    // Position fields are doubles in degrees/meters — must NOT be scaled.
    const gpsPayload = new Uint8Array(8 + 8 + 8 + 8 + 1 + 4 + 4 + 1);
    const view = new DataView(gpsPayload.buffer);
    view.setBigUint64(0, BigInt(1000), true);
    view.setFloat64(8, 14.4636298, true);
    view.setFloat64(16, -17.0124714, true);
    view.setFloat64(24, 1234.5, true); // > 1000 m — must survive unscaled
    view.setUint8(32, 14);
    view.setFloat32(33, 0.9, true);
    view.setFloat32(37, 3.2, true);
    view.setUint8(41, 3);
    synth.addMsg('vehicle_gps_position', 0, gpsPayload);

    synth.addMsg('vehicle_status', 0, pack(2000, [[8, 1000], [1, 1], [1, 15], [1, 1]])); // disarmed: STAB, no MODE
    synth.addMsg('vehicle_status', 0, pack(3000, [[8, 1000], [1, 2], [1, 15], [1, 1]])); // armed: STAB
    synth.addMsg('vehicle_status', 0, pack(4000, [[8, 1000], [1, 2], [1, 22], [1, 1]])); // armed: AUTO_VTOL_TAKEOFF

    const log = parse(synth);

    const gps = log.messages.get('GPS')!;
    expect(gps[0]!.fields['Lat']).toBeCloseTo(14.4636298);
    expect(gps[0]!.fields['Lng']).toBeCloseTo(-17.0124714);
    expect(gps[0]!.fields['Alt']).toBe(1234.5);
    expect(gps[0]!.fields['HDop']).toBeCloseTo(0.9);
    expect(gps[0]!.fields['NSats']).toBe(14);

    const modes = log.messages.get('MODE')!;
    expect(modes).toHaveLength(2);
    expect(modes[0]!.fields).toMatchObject({ ModeNum: 15, Name: 'STAB' });
    expect(modes[1]!.fields).toMatchObject({ ModeNum: 22, Name: 'AUTO_VTOL_TAKEOFF' });

    expect(log.metadata.vehicleType).toBe('copter'); // vehicle_type = 1
    expect(log.metadata.firmwareVersion).toBe('v1.18.0');
  });

  it('uses the classic nav_state names for older layouts', () => {
    const synth = makeUlog({
      formats: {
        vehicle_status: ['uint8_t arming_state', 'uint8_t nav_state', 'uint8_t is_rotary_wing'],
      },
      subscriptions: [{ multiId: 0, msgId: 2, name: 'vehicle_status' }],
    });
    synth.addMsg('vehicle_status', 0, pack(1000, [[1, 2], [1, 15], [1, 1]])); // armed

    const log = parse(synth);
    expect(log.messages.get('MODE')![0]!.fields['Name']).toBe('AUTO_FIXEDWING_TAKEOFF');
  });

  it('maps metadata from info messages (ver_sw_release, sys_name, hw, vehicle type)', () => {
    const synth = makeUlog({
      formats: { vehicle_status: ['uint8_t arming_state', 'uint8_t nav_state', 'uint8_t is_rotary_wing', 'uint8_t is_vtol', 'uint8_t is_fixed_wing'] },
      subscriptions: [{ multiId: 0, msgId: 2, name: 'vehicle_status' }],
      info: {
        sys_name: { type: 'char[10]', value: 'PX4' },
        ver_sw_release: { type: 'uint32_t', value: 0x010602ff },
        ver_hw: { type: 'char[10]', value: 'PX4FMU_V5X' },
      },
    });
    synth.addMsg('vehicle_status', 0, pack(1000, [[1, 1], [1, 3], [1, 1], [1, 0], [1, 0]]));

    const log = parse(synth);
    expect(log.metadata.vehicleType).toBe('copter');
    expect(log.metadata.firmwareVersion).toBe('v1.6.2');
    expect(log.metadata.firmwareString).toBe('PX4 v1.6.2');
    expect(log.metadata.boardType).toBe('PX4FMU_V5X');
  });

  it('marks fixed-wing/vtol vehicles as plane', () => {
    const synth = makeUlog({
      formats: { vehicle_status: ['uint8_t arming_state', 'uint8_t nav_state', 'uint8_t is_rotary_wing', 'uint8_t is_vtol', 'uint8_t is_fixed_wing'] },
      subscriptions: [{ multiId: 0, msgId: 2, name: 'vehicle_status' }],
    });
    synth.addMsg('vehicle_status', 0, pack(1000, [[1, 1], [1, 4], [1, 0], [1, 0], [1, 1]]));

    expect(parse(synth).metadata.vehicleType).toBe('plane');
  });

  it('degrades to empty maps when no vehicle data exists', () => {
    const synth = makeUlog({ formats: {}, subscriptions: [] });
    const log = parse(synth);
    expect(log.messages.size).toBe(0);
    expect(log.metadata.vehicleType).toBe('');
    expect(log.timeRange).toEqual({ startUs: 0, endUs: 0 });
  });
});
