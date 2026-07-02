import { describe, expect, it, vi } from 'vitest';
import { sendRcOverridePreArmStream } from '../arming-helpers.js';

describe('sendRcOverridePreArmStream', () => {
  it('sends repeated RC override packets before arming', async () => {
    const writePacket = vi.fn().mockResolvedValue(undefined);
    const sendMavlinkPacket = vi.fn().mockResolvedValue(Buffer.from('packet'));
    const delay = vi.fn().mockResolvedValue(undefined);

    await sendRcOverridePreArmStream({
      sendMavlinkPacket,
      writePacket,
      targetSystem: 1,
      targetComponent: 1,
      iterations: 4,
      intervalMs: 250,
      delay,
    });

    expect(sendMavlinkPacket).toHaveBeenCalledTimes(4);
    expect(writePacket).toHaveBeenCalledTimes(4);
    expect(delay).toHaveBeenCalledTimes(3);
  });
});
