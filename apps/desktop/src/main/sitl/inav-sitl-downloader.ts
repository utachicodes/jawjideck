/**
 * iNav SITL Downloader
 *
 * Downloads the iNav SITL binary for Windows from GitHub releases.
 * macOS and Linux binaries are bundled directly in the app resources.
 *
 * Source: https://github.com/iNavFlight/inav/releases
 */

import { app, BrowserWindow } from 'electron';
import { createWriteStream } from 'node:fs';
import { mkdir, access, rm, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';

const INAV_RELEASES_URL = 'https://github.com/iNavFlight/inav/releases';

/**
 * iNav SITL version tag.
 * Must match a release tag on GitHub (e.g., "8.0.1", "8.1.0").
 * Update this when a new stable SITL build is available.
 */
const INAV_SITL_VERSION = '8.0.1';

/** Cygwin DLLs required by the Windows iNav SITL binary. */
const CYGWIN_DLLS = [
  'cygwin1.dll',
  'cyggcc_s-seh-1.dll',
  'cygstdc++-6.dll',
  'cygatomic-1.dll',
  'cyggomp-1.dll',
  'cygiconv-2.dll',
  'cygintl-8.dll',
  'cygquadmath-0.dll',
  'cygssp-0.dll',
];

interface DownloadProgress {
  status: 'downloading' | 'complete' | 'error';
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  error?: string;
}

class InavSitlDownloader {
  private mainWindow: BrowserWindow | null = null;
  private abortController: AbortController | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private getBasePath(): string {
    return path.join(app.getPath('userData'), 'inav-sitl');
  }

  /**
   * Cleanup legacy bundled binaries that are no longer shipped.
   * Best-effort; failures are logged but don't block startup.
   */
  async cleanupLegacyBundledBinaries(): Promise<void> {
    if (process.platform !== 'win32') return;

    try {
      const basePath = path.join(
        app.isPackaged
          ? path.join(app.getAppPath() + '.unpacked', 'resources', 'sitl')
          : path.join(app.getAppPath(), 'resources', 'sitl'),
        'windows',
      );
      const exePath = path.join(basePath, 'inav_SITL.exe');
      await stat(exePath).then(async () => {
        console.log('[iNav SITL] Removing legacy bundled inav_SITL.exe (now downloaded on demand)');
        await rm(exePath, { force: true });
      }).catch(() => { /* not present, nothing to clean */ });
    } catch {
      /* path doesn't exist, skip */
    }
  }

  /**
   * Get the path to the downloaded iNav SITL binary.
   * Returns the downloaded path; caller should check existence.
   */
  getBinaryPath(): string {
    return path.join(this.getBasePath(), 'inav_SITL.exe');
  }

  /**
   * Get the path to the bundled iNav SITL binary (legacy, may not exist).
   */
  getBundledBinaryPath(): string {
    const basePath = app.isPackaged
      ? path.join(app.getAppPath() + '.unpacked', 'resources', 'sitl')
      : path.join(app.getAppPath(), 'resources', 'sitl');
    return path.join(basePath, 'windows', 'inav_SITL.exe');
  }

  /**
   * Get the path to the bundled cygwin1.dll (legacy, may not exist).
   */
  getBundledCygwinDllPath(): string {
    const basePath = app.isPackaged
      ? path.join(app.getAppPath() + '.unpacked', 'resources', 'sitl')
      : path.join(app.getAppPath(), 'resources', 'sitl');
    return path.join(basePath, 'windows', 'cygwin1.dll');
  }

  /**
   * Check if the iNav SITL binary is available (downloaded or bundled).
   */
  async checkBinary(): Promise<{ exists: boolean; path: string; source: 'downloaded' | 'bundled' | 'none' }> {
    const downloadedPath = this.getBinaryPath();
    try {
      await access(downloadedPath);
      return { exists: true, path: downloadedPath, source: 'downloaded' };
    } catch { /* not downloaded */ }

    const bundledPath = this.getBundledBinaryPath();
    try {
      await access(bundledPath);
      return { exists: true, path: bundledPath, source: 'bundled' };
    } catch { /* not bundled */ }

    return { exists: false, path: '', source: 'none' };
  }

  /**
   * Download the iNav SITL binary for Windows.
   */
  async download(): Promise<{ success: boolean; path?: string; error?: string }> {
    if (process.platform !== 'win32') {
      return { success: true, path: this.getBundledBinaryPath() };
    }

    const binaryPath = this.getBinaryPath();
    const binaryDir = path.dirname(binaryPath);
    const tempPath = `${binaryPath}.tmp`;

    this.abortController = new AbortController();

    try {
      await mkdir(binaryDir, { recursive: true });

      const url = `${INAV_RELEASES_URL}/download/${INAV_SITL_VERSION}/inav_SITL.exe`;

      this.sendProgress({ status: 'downloading', progress: 0, bytesDownloaded: 0, totalBytes: 0 });

      const response = await fetch(url, {
        signal: this.abortController.signal,
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} — ${url}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      let bytesDownloaded = 0;

      const writeStream = createWriteStream(tempPath);
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bytesDownloaded += value.length;
        writeStream.write(value);

        const progress = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;
        this.sendProgress({ status: 'downloading', progress, bytesDownloaded, totalBytes });
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end();
      });

      try { await rm(binaryPath, { force: true }); } catch { /* ignore */ }
      await rename(tempPath, binaryPath);

      this.sendProgress({ status: 'complete', progress: 100, bytesDownloaded: totalBytes, totalBytes });

      return { success: true, path: binaryPath };
    } catch (err) {
      try { await rm(tempPath, { force: true }); } catch { /* ignore */ }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.sendProgress({ status: 'error', progress: 0, bytesDownloaded: 0, totalBytes: 0, error: errorMessage });
      return { success: false, error: errorMessage };
    } finally {
      this.abortController = null;
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private sendProgress(progress: DownloadProgress): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.INAV_SITL_DOWNLOAD_PROGRESS, progress);
    }
  }
}

export const inavSitlDownloader = new InavSitlDownloader();
