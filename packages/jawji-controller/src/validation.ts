// validation.ts
// Input validation for all user-supplied values that flow into
// shell commands, systemd units, or config files. Fail-closed:
// reject anything that doesn't match expected patterns.

const VALID_DEVICE_PATHS = /^\/dev\/(ttyACM|ttyUSB|serial\/by-id\/|video\d+|serial\d*)/;
const VALID_BAUD_RATES = new Set([9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]);
const MAX_PORT = 65535;

export function validateDevicePath(path: unknown, kind: 'serial' | 'video'): string | null {
  if (typeof path !== 'string' || path.length === 0 || path.length > 256) return null;
  // Block newlines — the injection vector for config/systemd files
  if (/[\r\n]/.test(path)) return null;
  // Block shell metacharacters
  if (/[;&|`$(){}!<>]/.test(path)) return null;

  if (kind === 'serial') {
    // Must be /dev/ttyACM*, /dev/ttyUSB*, or /dev/serial/by-id/*
    return VALID_DEVICE_PATHS.test(path) ? path : null;
  }
  if (kind === 'video') {
    // Must be /dev/video0, /dev/video1, etc.
    return /^\/dev\/video\d+$/.test(path) ? path : null;
  }
  return null;
}

export function validateBaudRate(rate: unknown): number | null {
  const num = typeof rate === 'number' ? rate : parseInt(String(rate), 10);
  if (isNaN(num)) return null;
  return VALID_BAUD_RATES.has(num) ? num : null;
}

export function validatePort(port: unknown): number | null {
  const num = typeof port === 'number' ? port : parseInt(String(port), 10);
  if (isNaN(num)) return null;
  if (num < 1 || num > MAX_PORT) return null;
  return num;
}

// Sanitize a string for safe inclusion in a systemd unit file.
// systemd ExecStart splits on whitespace and has special meaning for
// certain characters. The safest approach is to reject anything that
// isn't a simple path.
export function sanitizeSystemdPath(path: string): string | null {
  // Only allow alphanumeric, /, ., -, _ — nothing else
  if (/^[/a-zA-Z0-9._-]+$/.test(path)) return path;
  return null;
}
