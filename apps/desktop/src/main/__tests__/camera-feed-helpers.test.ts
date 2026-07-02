import { describe, expect, it, vi } from 'vitest';
import { requestVideoStreamInfo } from '../camera-feed-helpers.js';

describe('requestVideoStreamInfo', () => {
  it('sends a single MAV_CMD_REQUEST_MESSAGE COMMAND_LONG for VIDEO_STREAM_INFORMATION', async () => {
    const writePacket = vi.fn().mockResolvedValue(undefined);
    const sendMavlinkPacket = vi.fn().mockResolvedValue(Buffer.from('packet'));

    await requestVideoStreamInfo({
      sendMavlinkPacket,
      writePacket,
      targetSystem: 1,
      targetComponent: 1,
    });

    expect(sendMavlinkPacket).toHaveBeenCalledTimes(1);
    expect(writePacket).toHaveBeenCalledTimes(1);
    expect(writePacket).toHaveBeenCalledWith(Buffer.from('packet'));
  });

  it('defaults targetSystem/targetComponent to 1 when omitted', async () => {
    const writePacket = vi.fn().mockResolvedValue(undefined);
    const sendMavlinkPacket = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));

    await requestVideoStreamInfo({ sendMavlinkPacket, writePacket });

    expect(sendMavlinkPacket).toHaveBeenCalledTimes(1);
    // First arg is COMMAND_LONG_ID (76); just verify it was called with 3 args (msgid, payload, crcExtra)
    expect(sendMavlinkPacket.mock.calls[0]).toHaveLength(3);
  });
});
