/**
 * ESP32 Flasher
 * Wrapper around esptool for flashing ESP32 family boards.
 * Follows the same pattern as avr-flasher.ts — spawn external tool,
 * parse output for progress, send IPC updates.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { FlashProgress, FlashResult } from '../../shared/firmware-types.js';

/** ESP32 chip variants and their esptool --chip values */
const ESP32_CHIPS: Record<string, string> = {
  esp32: 'esp32',
  'esp32-s2': 'esp32s2',
  'esp32-s3': 'esp32s3',
  'esp32-c3': 'esp32c3',
  'esp32-c6': 'esp32c6',
  'esp32-h2': 'esp32h2',
};

/** Default flash parameters per chip family */
const FLASH_DEFAULTS: Record<string, { flashMode: string; flashFreq: string; flashSize: string }> = {
  esp32: { flashMode: 'dio', flashFreq: '40m', flashSize: '4MB' },
  esp32s2: { flashMode: 'dio', flashFreq: '80m', flashSize: '4MB' },
  esp32s3: { flashMode: 'dio', flashFreq: '80m', flashSize: '8MB' },
  esp32c3: { flashMode: 'dio', flashFreq: '80m', flashSize: '4MB' },
  esp32c6: { flashMode: 'dio', flashFreq: '80m', flashSize: '4MB' },
  esp32h2: { flashMode: 'dio', flashFreq: '48m', flashSize: '4MB' },
};

export interface Esp32FlashOptions {
  /** Serial port path (e.g. /dev/ttyUSB0, COM3) */
  port: string;
  /** Chip variant (e.g. 'esp32', 'esp32-s3') */
  chip: string;
  /** Firmware binary file path */
  firmwarePath: string;
  /** Flash address offset (default: 0x0 for merged binaries, 0x10000 for app-only) */
  flashOffset?: string;
  /** Baud rate for flashing (default: 460800) */
  baudRate?: number;
  /** Erase flash before writing (default: false) */
  eraseAll?: boolean;
}

/**
 * Find esptool binary — bundled or on PATH
 */
export function getEsptoolPath(): string {
  const platform = process.platform;
  const binaryName = platform === 'win32' ? 'esptool.exe' : 'esptool';

  const appPath = app.getAppPath();
  const isAsar = appPath.includes('app.asar');

  const searchPaths = isAsar
    ? [
        path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'resources', 'bin', platform, binaryName),
      ]
    : [
        path.join(appPath, 'resources', 'bin', platform, binaryName),
        path.join(appPath, '..', 'resources', 'bin', platform, binaryName),
      ];

  // Also check common install locations
  if (platform !== 'win32') {
    searchPaths.push('/usr/local/bin/esptool.py');
    searchPaths.push('/usr/bin/esptool.py');
    searchPaths.push(path.join(process.env['HOME'] ?? '', '.local', 'bin', 'esptool.py'));
  }

  // Fallback to PATH
  searchPaths.push(binaryName);
  searchPaths.push('esptool.py');

  for (const binPath of searchPaths) {
    if (binPath !== binaryName && binPath !== 'esptool.py' && fs.existsSync(binPath)) {
      return binPath;
    }
  }

  // Return default — will fail with clear error if not found
  return binaryName;
}

/**
 * Send progress update to renderer
 */
function sendProgress(window: BrowserWindow | null, progress: FlashProgress): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.FIRMWARE_PROGRESS, progress);
  }
}

/**
 * Parse esptool output for progress percentage
 * esptool outputs lines like:
 *   "Writing at 0x00010000... (3 %)"
 *   "Erasing flash (this may take a while)..."
 *   "Chip is ESP32-S3 (revision v0.2)"
 *   "Hash of data verified."
 */
function parseEsptoolProgress(line: string): { progress: number; state: FlashProgress['state']; message: string } | null {
  // Writing progress: "Writing at 0x00010000... (3 %)"
  const writeMatch = line.match(/Writing at 0x[\da-fA-F]+\.\.\.\s*\((\d+)\s*%\)/);
  if (writeMatch) {
    const pct = parseInt(writeMatch[1]!, 10);
    return { progress: pct, state: 'flashing', message: `Writing: ${pct}%` };
  }

  // Erasing
  if (line.includes('Erasing flash') || line.includes('Erasing region')) {
    return { progress: 0, state: 'erasing', message: 'Erasing flash...' };
  }

  // Compressed upload: "Wrote 262144 bytes (143695 compressed) at 0x00010000 in 3.3 seconds"
  if (line.includes('Wrote') && line.includes('bytes')) {
    return { progress: 100, state: 'flashing', message: 'Write complete' };
  }

  // Verification
  if (line.includes('Hash of data verified') || line.includes('Leaving...')) {
    return { progress: 100, state: 'verifying', message: 'Verified' };
  }

  // Chip detection
  const chipMatch = line.match(/Chip is (ESP32\S*)/);
  if (chipMatch) {
    return { progress: 0, state: 'preparing', message: `Detected: ${chipMatch[1]}` };
  }

  // Connecting
  if (line.includes('Connecting')) {
    return { progress: 0, state: 'preparing', message: 'Connecting to bootloader...' };
  }

  return null;
}

/**
 * Flash ESP32 firmware using esptool
 */
export async function flashEsp32(
  options: Esp32FlashOptions,
  window: BrowserWindow | null,
  abortController?: AbortController,
): Promise<FlashResult> {
  const esptoolPath = getEsptoolPath();
  const startTime = Date.now();

  const chipKey = ESP32_CHIPS[options.chip.toLowerCase()] ?? 'esp32';
  const defaults = FLASH_DEFAULTS[chipKey] ?? FLASH_DEFAULTS['esp32']!;
  const baudRate = options.baudRate ?? 460800;
  const flashOffset = options.flashOffset ?? '0x0';

  return new Promise((resolve) => {
    if (!options.port) {
      resolve({
        success: false,
        error: 'No serial port specified. Connect your ESP32 via USB and select the port.',
        duration: 0,
      });
      return;
    }

    if (!fs.existsSync(options.firmwarePath)) {
      resolve({
        success: false,
        error: `Firmware file not found: ${options.firmwarePath}`,
        duration: 0,
      });
      return;
    }

    sendProgress(window, {
      state: 'preparing',
      progress: 0,
      message: 'Starting ESP32 flash...',
    });

    // Build esptool arguments
    const args: string[] = [
      '--chip', chipKey,
      '--port', options.port,
      '--baud', baudRate.toString(),
    ];

    if (options.eraseAll) {
      // Erase entire flash first, then write
      // We'll run two commands sequentially — first erase_flash, then write_flash
      // For simplicity, use write_flash with --erase-all flag
      args.push('write_flash', '--erase-all');
    } else {
      args.push('write_flash');
    }

    args.push(
      '--flash_mode', defaults.flashMode,
      '--flash_freq', defaults.flashFreq,
      '--flash_size', defaults.flashSize,
      flashOffset, options.firmwarePath,
    );

    const proc = spawn(esptoolPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let lastProgress = 0;
    let errorOutput = '';

    const handleOutput = (data: Buffer) => {
      const lines = data.toString().split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const progressInfo = parseEsptoolProgress(trimmed);
        if (progressInfo && progressInfo.progress >= lastProgress) {
          lastProgress = progressInfo.progress;
          sendProgress(window, {
            state: progressInfo.state,
            progress: progressInfo.progress,
            message: progressInfo.message,
          });
        }

        // Collect errors
        if (
          trimmed.toLowerCase().includes('error') ||
          trimmed.toLowerCase().includes('failed') ||
          trimmed.toLowerCase().includes('fatal') ||
          trimmed.includes('A fatal error occurred')
        ) {
          errorOutput += trimmed + '\n';
        }
      }
    };

    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;

      if (code === 0) {
        sendProgress(window, {
          state: 'complete',
          progress: 100,
          message: 'Flash complete!',
        });

        resolve({
          success: true,
          message: 'ESP32 firmware flashed and verified successfully',
          duration,
          verified: true,
        });
      } else {
        let friendlyError = errorOutput;

        if (errorOutput.includes('Failed to connect')) {
          friendlyError = 'Failed to connect to ESP32. Hold the BOOT button while plugging in USB, then try again.';
        } else if (errorOutput.includes('Permission denied') || errorOutput.includes('could not open port')) {
          friendlyError = `Cannot open ${options.port}. Make sure no other program is using the port.`;
        } else if (errorOutput.includes('No serial data received')) {
          friendlyError = 'No response from ESP32. Check the USB cable and try holding BOOT while connecting.';
        } else if (errorOutput.includes('Chip is') && errorOutput.includes('not')) {
          friendlyError = 'Chip mismatch — the connected board is a different ESP32 variant than selected.';
        }

        resolve({
          success: false,
          error: friendlyError || `esptool exited with code ${code}`,
          duration,
        });
      }
    });

    proc.on('error', (err) => {
      const duration = Date.now() - startTime;

      let message = `Failed to start esptool: ${err.message}.`;
      if (err.message.includes('ENOENT')) {
        message = 'esptool not found. Install it with: pip install esptool';
      }

      resolve({
        success: false,
        error: message,
        duration,
      });
    });

    if (abortController) {
      abortController.signal.addEventListener('abort', () => {
        proc.kill('SIGTERM');
        resolve({
          success: false,
          error: 'Flash operation aborted',
          duration: Date.now() - startTime,
        });
      });
    }
  });
}

/**
 * Check if esptool is available
 */
export async function isEsptoolAvailable(): Promise<boolean> {
  const esptoolPath = getEsptoolPath();

  return new Promise((resolve) => {
    const proc = spawn(esptoolPath, ['version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Detect ESP32 chip on a given serial port
 */
export async function detectEsp32Chip(port: string): Promise<{ chip: string; mac: string } | null> {
  const esptoolPath = getEsptoolPath();

  return new Promise((resolve) => {
    const proc = spawn(esptoolPath, ['--port', port, 'chip_id'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';

    proc.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { output += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }

      const chipMatch = output.match(/Chip is (ESP32\S*)/);
      const macMatch = output.match(/MAC:\s*([\da-f:]+)/i);

      if (chipMatch) {
        resolve({
          chip: chipMatch[1]!,
          mac: macMatch?.[1] ?? 'unknown',
        });
      } else {
        resolve(null);
      }
    });

    proc.on('error', () => {
      resolve(null);
    });

    // Timeout after 10s
    setTimeout(() => {
      proc.kill('SIGTERM');
    }, 10000);
  });
}
