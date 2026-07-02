import {
  serializeRcChannelsOverride,
  RC_CHANNELS_OVERRIDE_ID,
  RC_CHANNELS_OVERRIDE_CRC_EXTRA,
  type RcChannelsOverride,
} from '@jawji/mavlink-ts';

interface SendRcOverridePreArmStreamOptions {
  sendMavlinkPacket: (id: number, payload: Uint8Array, crcExtra: number) => Promise<Uint8Array>;
  writePacket: (packet: Uint8Array) => Promise<void>;
  targetSystem?: number;
  targetComponent?: number;
  iterations?: number;
  intervalMs?: number;
  delay?: (ms: number) => Promise<void>;
  /** If set, pin this channel to PWM 1800 (ARM position) so the arm-switch pre-arm check passes. */
  armSwitchChannel?: number;
}

function buildOverridePayload(
  targetSystem: number,
  targetComponent: number,
  armSwitchChannel?: number,
): RcChannelsOverride {
  const base: RcChannelsOverride = {
    targetSystem, targetComponent,
    chan1Raw: 1500, chan2Raw: 1500, chan3Raw: 1000, chan4Raw: 1500,
    chan5Raw: 1000, chan6Raw: 1000, chan7Raw: 1000, chan8Raw: 1000,
    chan9Raw: 0, chan10Raw: 0, chan11Raw: 0, chan12Raw: 0,
    chan13Raw: 0, chan14Raw: 0, chan15Raw: 0, chan16Raw: 0,
    chan17Raw: 0, chan18Raw: 0,
  };
  if (armSwitchChannel !== undefined && armSwitchChannel >= 1 && armSwitchChannel <= 18) {
    const key = `chan${armSwitchChannel}Raw` as keyof RcChannelsOverride;
    // PWM 1800 = ARM position (typically 1700-2100 range for "ON"/ARM)
    base[key] = 1800;
  }
  return base;
}

export async function sendRcOverridePreArmStream({
  sendMavlinkPacket,
  writePacket,
  targetSystem = 1,
  targetComponent = 1,
  iterations = 3,
  intervalMs = 250,
  delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  armSwitchChannel,
}: SendRcOverridePreArmStreamOptions): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    const override = buildOverridePayload(targetSystem, targetComponent, armSwitchChannel);
    const payload = serializeRcChannelsOverride(override);

    const packet = await sendMavlinkPacket(RC_CHANNELS_OVERRIDE_ID, payload, RC_CHANNELS_OVERRIDE_CRC_EXTRA);
    await writePacket(packet);

    if (i < iterations - 1) {
      await delay(intervalMs);
    }
  }
}
