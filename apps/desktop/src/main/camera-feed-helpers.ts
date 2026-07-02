import {
  serializeCommandLong,
  COMMAND_LONG_ID,
  COMMAND_LONG_CRC_EXTRA,
  VIDEO_STREAM_INFORMATION_ID,
} from '@jawji/mavlink-ts';

const MAV_CMD_REQUEST_MESSAGE = 512;

interface RequestVideoStreamInfoOptions {
  sendMavlinkPacket: (id: number, payload: Uint8Array, crcExtra: number) => Promise<Uint8Array>;
  writePacket: (packet: Uint8Array) => Promise<void>;
  targetSystem?: number;
  targetComponent?: number;
}

/**
 * Sends MAV_CMD_REQUEST_MESSAGE asking the vehicle to emit VIDEO_STREAM_INFORMATION.
 * Fire-and-forget from the caller's perspective — the response (if the FC sends
 * one) arrives asynchronously through the normal MAVLink data pipeline, not as
 * a return value here.
 */
export async function requestVideoStreamInfo({
  sendMavlinkPacket,
  writePacket,
  targetSystem = 1,
  targetComponent = 1,
}: RequestVideoStreamInfoOptions): Promise<void> {
  const payload = serializeCommandLong({
    targetSystem,
    targetComponent,
    command: MAV_CMD_REQUEST_MESSAGE,
    confirmation: 0,
    param1: VIDEO_STREAM_INFORMATION_ID,
    param2: 0,
    param3: 0,
    param4: 0,
    param5: 0,
    param6: 0,
    param7: 0,
  });

  const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA);
  await writePacket(packet);
}
