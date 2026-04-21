/**
 * ArduPilot SITL Process Manager
 *
 * Runs SITL natively on all platforms:
 * - macOS: Native ARM64/x64 binary (built by our CI)
 * - Linux: Native x64 binary
 * - Windows: Cygwin binary + DLLs
 */

import { spawn, ChildProcess } from 'node:child_process';
import { app, BrowserWindow } from 'electron';
import { chmod, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ArduPilotSitlConfig,
  ArduPilotSitlStatus,
  ArduPilotVehicleType,
} from '../../shared/ipc-channels.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';

const VEHICLE_BINARY_MAP: Record<ArduPilotVehicleType, { native: string; windows: string }> = {
  copter: { native: 'arducopter', windows: 'ArduCopter' },
  plane: { native: 'arduplane', windows: 'ArduPlane' },
  rover: { native: 'ardurover', windows: 'ArduRover' },
  sub: { native: 'ardusub', windows: 'ArduSub' },
};

const DEFAULT_MODELS: Record<ArduPilotVehicleType, string> = {
  copter: 'quad',
  plane: 'plane',
  rover: 'rover',
  sub: 'vectored',
};

// Model → FRAME_CLASS mapping for ArduPilot Copter
// See: https://ardupilot.org/copter/docs/parameters.html#frame-class
const COPTER_FRAME_CLASS: Record<string, number> = {
  'quad': 1,       // Quad
  '+': 1,          // Quad
  'hexa': 2,       // Hexa
  'octa': 3,       // Octa
  'octaquad': 4,   // OctaQuad
  'y6': 5,         // Y6
  'heli': 6,       // Heli
  'tri': 7,        // Tri
  'singlecopter': 8,
  'coax': 9,       // CoaxCopter
};

/**
 * Generate a defaults param file for SITL based on vehicle type and model.
 * This ensures essential parameters (like FRAME_CLASS) are set on first boot
 * or after EEPROM wipe, avoiding the "Check frame class" arming error.
 */
function generateDefaultParams(vehicleType: ArduPilotVehicleType, model: string): string {
  const lines: string[] = [];

  if (vehicleType === 'copter') {
    const frameClass = COPTER_FRAME_CLASS[model] ?? 1; // Default to Quad
    lines.push(`FRAME_CLASS ${frameClass}`);
  }

  return lines.join('\n');
}

class ArduPilotSitlProcessManager {
  private process: ChildProcess | null = null;
  private _isRunning = false;
  private mainWindow: BrowserWindow | null = null;
  private _currentConfig: ArduPilotSitlConfig | null = null;

  get isRunning(): boolean {
    return this._isRunning;
  }

  get currentConfig(): ArduPilotSitlConfig | null {
    return this._currentConfig;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  isPlatformSupported(): { supported: boolean; useDocker: boolean; error?: string } {
    const platform = process.platform;

    if (platform === 'darwin' || platform === 'linux' || platform === 'win32') {
      // All platforms run natively now (no Docker)
      return { supported: true, useDocker: false };
    }

    return {
      supported: false,
      useDocker: false,
      error: `Unsupported platform: ${platform}`,
    };
  }

  getBinaryPath(vehicleType: ArduPilotVehicleType, releaseTrack: string): string {
    const userDataPath = app.getPath('userData');
    const vehicle = VEHICLE_BINARY_MAP[vehicleType];
    const basePath = path.join(userDataPath, 'ardupilot-sitl', releaseTrack, vehicleType);

    if (process.platform === 'win32') {
      return path.join(basePath, `${vehicle.windows}.exe`);
    }
    // macOS and Linux: native binary, no extension
    return path.join(basePath, vehicle.native);
  }

  private getCygwinDllPath(): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'ardupilot-sitl', 'cygwin');
  }

  private buildArgs(config: ArduPilotSitlConfig): string[] {
    const args: string[] = [];

    const model = config.model || DEFAULT_MODELS[config.vehicleType];
    args.push(`-M${model}`);

    const { lat, lng, alt, heading } = config.homeLocation;
    args.push(`-O${lat},${lng},${alt},${heading}`);

    // TCP MAVLink server on port 5760
    args.push('--serial0', 'tcp:0');

    // Always specify speedup on macOS ARM64 to avoid crash (ArduPilot issue #19588)
    const speedup = config.speedup && config.speedup > 1 ? config.speedup : 1;
    args.push(`-s${speedup}`);

    if (config.wipeOnStart) {
      args.push('--wipe');
    }

    if (config.simulator && config.simulator !== 'none') {
      args.push('--sim', config.simulator);
      if (config.simAddress) {
        args.push('--sim-address', config.simAddress);
      }
    }

    if (config.defaultsFile) {
      args.push('--defaults', config.defaultsFile);
    }

    return args;
  }

  async start(config: ArduPilotSitlConfig): Promise<{ success: boolean; command?: string; error?: string }> {
    if (this._isRunning) {
      this.stop();
    }

    const platformCheck = this.isPlatformSupported();
    if (!platformCheck.supported) {
      return { success: false, error: platformCheck.error };
    }

    try {
      const binaryPath = this.getBinaryPath(config.vehicleType, config.releaseTrack);

      const { access } = await import('node:fs/promises');
      try {
        await access(binaryPath);
      } catch {
        return {
          success: false,
          error: `SITL binary not found at ${binaryPath}. Please download it first.`,
        };
      }

      // Make binary executable (macOS/Linux)
      if (process.platform !== 'win32') {
        try {
          await chmod(binaryPath, 0o755);
        } catch (err) {
          console.error('Failed to chmod SITL binary:', err);
        }
      }

      // Generate defaults file with essential params (FRAME_CLASS etc.)
      const model = config.model || DEFAULT_MODELS[config.vehicleType];
      const defaultParams = generateDefaultParams(config.vehicleType, model);
      if (defaultParams && !config.defaultsFile) {
        const defaultsPath = path.join(path.dirname(binaryPath), 'ardudeck-defaults.parm');
        await writeFile(defaultsPath, defaultParams, 'utf-8');
        config = { ...config, defaultsFile: defaultsPath };
      }

      this._currentConfig = config;

      const args = this.buildArgs(config);
      const spawnCmd = binaryPath;
      const commandString = `${binaryPath} ${args.join(' ')}`;

      // Environment setup
      const env = { ...process.env };

      // Windows: Add Cygwin DLLs to PATH
      if (process.platform === 'win32') {
        const cygwinPath = this.getCygwinDllPath();
        env.PATH = `${cygwinPath};${env.PATH}`;
      }

      this.process = spawn(spawnCmd, args, {
        cwd: path.dirname(binaryPath),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });
      this._isRunning = true;

      this.process.stdout?.on('data', (data: Buffer) => {
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_STDOUT, data.toString());
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_STDERR, data.toString());
      });

      this.process.on('error', (error: Error) => {
        console.error('ArduPilot SITL process error:', error);
        this._isRunning = false;
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_ERROR, error.message);
      });

      this.process.on('exit', (code: number | null, signal: string | null) => {
        this._isRunning = false;
        this.process = null;
        this._currentConfig = null;
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_EXIT, { code, signal });
      });

      return { success: true, command: commandString };
    } catch (err) {
      console.error('Failed to start ArduPilot SITL:', err);
      this._isRunning = false;
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  stop(): void {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');

        setTimeout(() => {
          if (this.process) {
            try {
              this.process.kill('SIGKILL');
            } catch {
              // Already dead
            }
          }
        }, 2000);
      } catch (err) {
        console.error('Failed to kill ArduPilot SITL process:', err);
      }
      this.process = null;
      this._isRunning = false;
      this._currentConfig = null;
    }
  }

  /**
   * Stop the SITL process and resolve only after it has actually exited (or
   * after `timeoutMs` if the OS is being slow). Unlike stop(), this awaits
   * the underlying child process's 'exit' event before returning, which is
   * required when you intend to immediately respawn SITL with the same TCP
   * port - otherwise start() races the dying child for the port and the new
   * SITL silently fails to bind.
   */
  async stopAndWait(timeoutMs: number = 5000): Promise<void> {
    const proc = this.process;
    if (!proc) return;
    return new Promise<void>((resolve) => {
      let settled = false;
      const settle = () => { if (!settled) { settled = true; resolve(); } };
      proc.once('exit', settle);
      try {
        proc.kill('SIGTERM');
        setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch { /* already dead */ }
        }, 2000);
      } catch { /* ignore */ }
      this.process = null;
      this._isRunning = false;
      this._currentConfig = null;
      // Belt-and-braces fallback so we don't hang forever.
      setTimeout(settle, timeoutMs);
    });
  }

  /**
   * Stop the running SITL (waiting for actual exit) and immediately start
   * it again with the same config. Returns whatever start() returns.
   *
   * Use this when you've changed something on disk that ArduPilot only picks
   * up on cold boot (e.g. wrote a new Lua script under /APM/scripts/).
   */
  async restart(): Promise<{ success: boolean; command?: string; error?: string }> {
    const cfg = this._currentConfig;
    if (!cfg) return { success: false, error: 'No active SITL config to restart with' };
    await this.stopAndWait(5000);
    // Brief pause for the OS to fully release the bound TCP port (5760).
    await new Promise<void>(r => setTimeout(r, 1000));
    return this.start(cfg);
  }

  getStatus(): ArduPilotSitlStatus {
    return {
      isRunning: this._isRunning,
      pid: this.process?.pid,
      vehicleType: this._currentConfig?.vehicleType,
      tcpPort: 5760,
    };
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

export const ardupilotSitlProcess = new ArduPilotSitlProcessManager();
