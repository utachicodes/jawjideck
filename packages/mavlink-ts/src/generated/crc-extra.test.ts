/**
 * Tests for MAVLink CRC_EXTRA values
 *
 * A wrong CRC_EXTRA makes the parser silently drop every packet of that
 * message (and the vehicle drop every packet we send). The generator once
 * included extension fields and the uint8_t_mavlink_version type in the
 * CRC_EXTRA seed, which broke HEARTBEAT, GPS_RAW_INT, COMMAND_ACK, the
 * mission protocol and more. Expected values are from pymavlink.
 */

import { describe, it, expect } from 'vitest';
import { MESSAGE_REGISTRY } from './message-registry.js';

const EXPECTED_CRC_EXTRA: Record<string, number> = {
  HEARTBEAT: 50,
  GPS_RAW_INT: 24,
  GLOBAL_POSITION_INT: 104,
  COMMAND_LONG: 152,
  COMMAND_ACK: 143,
  RC_CHANNELS_OVERRIDE: 124,
  MANUAL_CONTROL: 243,
  STATUSTEXT: 83,
  BATTERY_STATUS: 154,
  HOME_POSITION: 104,
  MISSION_COUNT: 221,
  MISSION_REQUEST_INT: 196,
  MISSION_ITEM_INT: 38,
  MISSION_ACK: 153,
  MISSION_CURRENT: 28,
  AUTOPILOT_VERSION: 178,
};

describe('MAVLink CRC_EXTRA', () => {
  const byName = new Map([...MESSAGE_REGISTRY.values()].map((m) => [m.name, m]));

  for (const [name, crcExtra] of Object.entries(EXPECTED_CRC_EXTRA)) {
    it(`${name} uses CRC_EXTRA ${crcExtra}`, () => {
      expect(byName.get(name)?.crcExtra).toBe(crcExtra);
    });
  }
});
