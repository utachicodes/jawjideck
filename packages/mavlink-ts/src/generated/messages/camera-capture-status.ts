/**
 * Information about the status of a capture. Can be requested with a MAV_CMD_REQUEST_MESSAGE command.
 * Message ID: 262
 * CRC Extra: 196
 */
export interface CameraCaptureStatus {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Current status of image capturing (0: idle, 1: capture in progress, 2: interval set but idle, 3: interval set and capture in progress) */
  imageStatus: number;
  /** Current status of video capturing (0: idle, 1: capture in progress) */
  videoStatus: number;
  /** Image capture interval (s) */
  imageInterval: number;
  /** Time since recording started (ms) */
  recordingTimeMs: number;
  /** Available storage capacity. (MiB) */
  availableCapacity: number;
  /** Total number of images captured ('forever', or until reset using MAV_CMD_STORAGE_FORMAT). */
  imageCount: number;
}

export const CAMERA_CAPTURE_STATUS_ID = 262;
export const CAMERA_CAPTURE_STATUS_CRC_EXTRA = 12;
export const CAMERA_CAPTURE_STATUS_MIN_LENGTH = 18;
export const CAMERA_CAPTURE_STATUS_MAX_LENGTH = 23;

export function serializeCameraCaptureStatus(msg: CameraCaptureStatus): Uint8Array {
  const buffer = new Uint8Array(23);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.imageInterval, true);
  view.setUint32(8, msg.recordingTimeMs, true);
  view.setFloat32(12, msg.availableCapacity, true);
  buffer[16] = msg.imageStatus & 0xff;
  buffer[17] = msg.videoStatus & 0xff;
  view.setInt32(18, msg.imageCount, true);

  return buffer;
}

export function deserializeCameraCaptureStatus(payload: Uint8Array): CameraCaptureStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    imageInterval: view.getFloat32(4, true),
    recordingTimeMs: view.getUint32(8, true),
    availableCapacity: view.getFloat32(12, true),
    imageStatus: payload[16],
    videoStatus: payload[17],
    imageCount: view.getInt32(18, true),
  };
}