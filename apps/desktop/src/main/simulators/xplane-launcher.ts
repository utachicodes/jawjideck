/**
 * X-Plane Launcher
 *
 * Manages launching X-Plane with correct network settings for iNav SITL integration.
 * X-Plane communicates directly with SITL using its native UDP protocol - no bridge needed!
 *
 * Data flow:
 *   X-Plane --UDP:49000--> iNav SITL (sensor data)
 *   X-Plane <--UDP:49001-- iNav SITL (control surfaces)
 */

import { spawn, ChildProcess } from 'child_process';
import { detectXPlane } from './simulator-detector';

export interface XPlaneConfig {
  // Aircraft (X-Plane uses its own aircraft selection in-app)
  aircraft?: string;

  // Network config for SITL
  sitlHost?: string;        // Default: 127.0.0.1
  dataOutPort?: number;     // X-Plane → SITL (Default: 49000)
  dataInPort?: number;      // SITL → X-Plane (Default: 49001)

  // Window settings
  fullscreen?: boolean;
}

class XPlaneLauncher {
  private process: ChildProcess | null = null;
  private config: XPlaneConfig | null = null;

  /**
   * Check if X-Plane is currently running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Get the current configuration
   */
  getConfig(): XPlaneConfig | null {
    return this.config;
  }

  /**
   * Configure X-Plane's network output settings.
   *
   * No-op: X-Plane 12 enables UDP data output automatically via the
   * `--data_out=IP:port` CLI flag added in buildArgs(). X-Plane 11
   * does not support this flag and must be configured manually through
   * the in-app Data Input & Output menu (enable indices 3, 4, 17, 18,
   * 20, 21 for the data SITL needs).
   */
  private configureNetworkOutput(_xplanePath: string, _config: XPlaneConfig): void {
    console.log('[X-Plane] Network output handled via --data_out CLI flag (X-Plane 12+).');
    console.log('[X-Plane] For X-Plane 11: enable Data Output indices 3, 4, 17, 18, 20, 21 manually via Settings > Data Input & Output > Network.');
  }

  /**
   * Build command line arguments for X-Plane
   */
  private buildArgs(config: XPlaneConfig): string[] {
    const args: string[] = [];

    // X-Plane command line options are limited
    // Most configuration is done via preferences or in-app

    // Network data output can be enabled via command line in X-Plane 12
    const host = config.sitlHost || '127.0.0.1';
    const outPort = config.dataOutPort || 49000;

    // X-Plane 12 supports --data_out for UDP output
    // Format: --data_out=IP:port
    args.push(`--data_out=${host}:${outPort}`);

    // Fullscreen
    if (config.fullscreen) {
      args.push('--full');
    }

    return args;
  }

  /**
   * Launch X-Plane
   * @param config X-Plane configuration
   * @param customPath Optional user-specified path to X-Plane executable
   */
  async launch(config: XPlaneConfig, customPath?: string): Promise<{ success: boolean; error?: string }> {
    // Check if already running
    if (this.isRunning()) {
      return { success: false, error: 'X-Plane is already running' };
    }

    // Detect X-Plane installation
    const xpInfo = await detectXPlane(customPath);
    if (!xpInfo.installed || !xpInfo.executable || !xpInfo.path) {
      return { success: false, error: 'X-Plane not found. Please install X-Plane or set a custom path.' };
    }

    // Configure network output
    this.configureNetworkOutput(xpInfo.path, config);

    // Build arguments
    const args = this.buildArgs(config);


    try {
      // Spawn X-Plane process
      this.process = spawn(xpInfo.executable, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: xpInfo.path, // Run from X-Plane directory
      });

      this.config = config;

      // Handle stdout
      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
        }
      });

      // Handle stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          console.error('[X-Plane Error]', output);
        }
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        this.process = null;
        this.config = null;
      });

      // Handle errors
      this.process.on('error', (err) => {
        console.error('[X-Plane] Process error:', err);
        this.process = null;
        this.config = null;
      });

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[X-Plane] Failed to launch:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Stop X-Plane
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }


    // Try graceful shutdown first
    this.process.kill('SIGTERM');

    // Wait a bit for graceful shutdown
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if still running
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
        resolve();
      }, 5000); // X-Plane may take longer to shut down

      if (this.process) {
        this.process.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });

    this.process = null;
    this.config = null;
  }

  /**
   * Get process info
   */
  getStatus(): { running: boolean; pid: number | null } {
    return {
      running: this.isRunning(),
      pid: this.process?.pid || null,
    };
  }
}

// Singleton instance
export const xplaneLauncher = new XPlaneLauncher();
