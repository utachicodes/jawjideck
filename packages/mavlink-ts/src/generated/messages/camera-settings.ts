/**
 * Settings of a camera. Can be requested with a MAV_CMD_REQUEST_MESSAGE command.
 * Message ID: 260
 * CRC Extra: 8
 */
export interface CameraSettings {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Camera mode */
  modeId: number;
  /** Current zoom level as a percentage of the full range (0.0 to 100.0, NaN if not known) */
  zoomlevel: number;
  /** Current focus level as a percentage of the full range (0.0 to 100.0, NaN if not known) */
  focuslevel: number;
}

export const CAMERA_SETTINGS_ID = 260;
export const CAMERA_SETTINGS_CRC_EXTRA = 146;
export const CAMERA_SETTINGS_MIN_LENGTH = 5;
export const CAMERA_SETTINGS_MAX_LENGTH = 14;

export function serializeCameraSettings(msg: CameraSettings): Uint8Array {
  const buffer = new Uint8Array(14);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  buffer[4] = msg.modeId & 0xff;
  view.setFloat32(5, msg.zoomlevel, true);
  view.setFloat32(9, msg.focuslevel, true);

  return buffer;
}

export function deserializeCameraSettings(payload: Uint8Array): CameraSettings {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    modeId: payload[4],
    zoomlevel: view.getFloat32(5, true),
    focuslevel: view.getFloat32(9, true),
  };
}