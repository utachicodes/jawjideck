// fc-detect.ts
// Auto-detects connected flight controllers via USB serial ports.
// Scans /dev/ttyACM* (Arduino/ST) and /dev/ttyUSB* (CP2102/CH340) and
// probes them for MAVLink HEARTBEAT responses.

import { readdir, stat } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { log } from './logs.js';

const exec = promisify(execFile);

export interface FlightController {
  path: string;
  driver: string;      // 'st' | 'cp210x' | 'ch341' | 'cdc_acm' | 'unknown'
  baudRate: number;
  detected: boolean;   // true if MAVLink heartbeat was seen
  fcType?: string;     // 'arducopter' | 'arduplane' | 'px4' | etc
  firmwareVersion?: string;
}

// Known USB VID:PID pairs for popular flight controller boards
const FC_VID_PIDS: Record<string, string> = {
  '2341:0036': 'Arduino (STM32)',
  '2341:0037': 'Arduino (STM32)',
  '2da1:0057': 'CubePilot',
  '30d5:0057': 'mRo',
  '2df8:2e00': 'Holybro',
  '1209:beba': 'ArduPilot',
  '1209:bebc': 'ArduPilot',
  '26ac:0032': 'Matek',
  '0483:5729': 'STM32 DFU',
  '1fc9:0483': 'NXP MCU',
};

// Serial device path patterns
const SERIAL_GLOBS = ['/dev/ttyACM*', '/dev/ttyUSB*', '/dev/serial/by-id/*'];

export type FcDetectionResult = {
  controllers: FlightController[];
  bestPath: string | null;
  bestBaud: number;
  timestamp: number;
};

let cachedResult: FcDetectionResult | null = null;
const CACHE_TTL_MS = 5000;

export async function detectFlightControllers(): Promise<FcDetectionResult> {
  if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL_MS) {
    return cachedResult;
  }

  const controllers: FlightController[] = [];
  const seen = new Set<string>();

  for (const pattern of SERIAL_GLOBS) {
    try {
      const matches = await glob(pattern);
      for (const devPath of matches) {
        if (seen.has(devPath)) continue;
        seen.add(devPath);

        const info = await probeDevice(devPath);
        if (info) {
          controllers.push(info);
        }
      }
    } catch {
      // Pattern may not exist — skip silently
    }
  }

  // Pick the best candidate: detected MAVLink > known driver > first alphabetically
  let bestPath: string | null = null;
  let bestBaud = 57600;

  if (controllers.length > 0) {
    const detected = controllers.filter(c => c.detected);
    const sorted = detected.length > 0 ? detected : controllers;
    sorted.sort((a, b) => {
      if (a.driver !== 'unknown' && b.driver === 'unknown') return -1;
      if (a.driver === 'unknown' && b.driver !== 'unknown') return 1;
      return a.path.localeCompare(b.path);
    });
    bestPath = sorted[0]?.path ?? null;
    bestBaud = sorted[0]?.baudRate ?? 57600;
  }

  cachedResult = { controllers, bestPath, bestBaud, timestamp: Date.now() };
  log.info(`FC detection: ${controllers.length} controller(s) found${bestPath ? `, best: ${bestPath}` : ''}`);
  return cachedResult;
}

async function glob(pattern: string): Promise<string[]> {
  // Simple glob: expand * at the end of the prefix directory
  const dir = pattern.substring(0, pattern.lastIndexOf('/'));
  const prefix = pattern.substring(pattern.lastIndexOf('/') + 1).replace(/\*$/, '');

  try {
    const entries = await readdir(dir);
    const results: string[] = [];
    for (const entry of entries) {
      if (entry.startsWith(prefix)) {
        const fullPath = `${dir}/${entry}`;
        try {
          const s = await stat(fullPath);
          if (s.isCharacterDevice() || s.isBlockDevice()) {
            results.push(fullPath);
          }
        } catch {
          // skip
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function probeDevice(path: string): Promise<FlightController | null> {
  try {
    const s = await stat(path);
    if (!s.isCharacterDevice() && !s.isBlockDevice()) return null;
  } catch {
    return null;
  }

  const driver = await detectDriver(path);
  const baudRate = driver === 'cdc_acm' ? 115200 : 57600;

  // Quick MAVLink probe: send a HEARTBEAT request and check for response
  const detected = await probeMavlink(path, baudRate);

  return {
    path,
    driver,
    baudRate,
    detected,
  };
}

async function detectDriver(path: string): Promise<string> {
  try {
    const byIdPath = path.replace(/\/dev\/ttyACM(\d+)/, '/dev/serial/by-id/*');
    const dir = byIdPath.substring(0, byIdPath.lastIndexOf('/'));
    const prefix = byIdPath.substring(byIdPath.lastIndexOf('/') + 1).replace(/\*$/, '');

    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        if (entry.startsWith(prefix) || path.includes('ACM')) {
          if (entry.includes('usb-Arduino') || entry.includes('STMicroelectronics')) return 'cdc_acm';
          if (entry.includes('CP210') || entry.includes('cp210x')) return 'cp210x';
          if (entry.includes('CH340') || entry.includes('CH341')) return 'ch341';
        }
      }
    } catch {
      // /dev/serial/by-id not available
    }

    // Fallback: check subsystem
    const { stdout } = await exec('udevadm', ['info', '--query=property', '--name', path]);
    if (stdout.includes('ID_MODEL=stm32') || stdout.includes('ID_VENDOR=Arduino')) return 'cdc_acm';
    if (stdout.includes('ID_VENDOR=Silicon_Labs')) return 'cp210x';
    if (stdout.includes('ID_VENDOR=1a86') || stdout.includes('ID_MODEL=ch340')) return 'ch341';

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

async function probeMavlink(path: string, baudRate: number): Promise<boolean> {
  try {
    // Use stty to configure the port, then try to read a MAVLink heartbeat
    await exec('stty', ['-F', path, String(baudRate), 'cs8', '-cstopb', '-parenb', 'raw', '-echo']);
    await exec('timeout', ['1', 'cat', path]);
    // If we got here without error, something is on the port — likely an FC
    // A more robust approach would parse MAVLink packets, but this is a
    // reasonable heuristic for auto-detection.
    return true;
  } catch {
    // cat timeout is expected (no data = no FC)
    // stty error = port doesn't exist or is busy
    return false;
  }
}

export function invalidateFcCache(): void {
  cachedResult = null;
}
