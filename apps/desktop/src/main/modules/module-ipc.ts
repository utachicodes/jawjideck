/**
 * IPC handlers for Module Manager.
 * Bridges renderer requests to module-manager orchestrator.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import {
  activateLicense,
  getInstalledModules,
  removeLicense,
  checkForUpdates,
  heartbeatAll,
} from './module-manager.js';

export function setupModuleIpc(mainWindow: BrowserWindow): void {
  // Activate a license key
  ipcMain.handle(IPC_CHANNELS.MODULE_ACTIVATE, async (_, key: string) => {
    try {
      const result = await activateLicense(key, (progress) => {
        mainWindow.webContents.send(IPC_CHANNELS.MODULE_PROGRESS, progress);
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // List installed modules
  ipcMain.handle(IPC_CHANNELS.MODULE_LIST, () => {
    try {
      return getInstalledModules();
    } catch (err) {
      console.error('[ModuleIPC] List error:', err);
      return [];
    }
  });

  // Remove a license and its modules
  ipcMain.handle(IPC_CHANNELS.MODULE_REMOVE, async (_, key: string) => {
    try {
      return await removeLicense(key);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Check for updates
  ipcMain.handle(IPC_CHANNELS.MODULE_CHECK_UPDATES, async () => {
    try {
      return await checkForUpdates();
    } catch (err) {
      console.error('[ModuleIPC] Update check error:', err);
      return [];
    }
  });

  // Run heartbeat on app launch (background, non-blocking)
  setTimeout(() => {
    heartbeatAll().catch((err) => {
      console.warn('[ModuleIPC] Background heartbeat failed:', err);
    });
  }, 5000); // Delay 5s after startup
}
