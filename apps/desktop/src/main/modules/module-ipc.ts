/**
 * IPC handlers for Module Manager.
 * Bridges renderer requests to module-manager orchestrator.
 */

import { ipcMain, BrowserWindow, dialog } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import {
  activateLicense,
  getInstalledModules,
  removeLicense,
  checkForUpdates,
  heartbeatAll,
  installLocalModule,
} from './module-manager.js';
import { getLoadedModules, loadAllModules } from './module-registry.js';
import { killPty, resizePty, spawnPty, writePty } from './module-pty-service.js';
import { createLicenseGate, LicenseGateError } from '../licensing/license-gate.js';
import { createLicenseCredentialStore } from '../licensing/license-credentials.js';

// Fail-closed license gate for Intelligence module operations (install/activate/run).
// Built lazily on first use, once the app is ready.
let moduleLicenseGate: ReturnType<typeof createLicenseGate> | null = null;
async function getModuleLicenseGate() {
  if (!moduleLicenseGate) {
    const store = await createLicenseCredentialStore();
    moduleLicenseGate = createLicenseGate({
      publicKey: __JAWJI_LICENSE_PUBLIC_KEY__ ?? '',
      readCredentials: () => store.read(),
    });
  }
  return moduleLicenseGate;
}

export function setupModuleIpc(mainWindow: BrowserWindow): void {
  // Activate a license key
  ipcMain.handle(IPC_CHANNELS.MODULE_ACTIVATE, async (_, key: string) => {
    try {
      await (await getModuleLicenseGate()).requireService('intelligence-modules');
    } catch (err) {
      if (err instanceof LicenseGateError) return { success: false, error: `License required: ${err.reason}` };
      throw err;
    }
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

  // Sideload a locally-built module (dev workflow, not the marketplace path).
  ipcMain.handle(IPC_CHANNELS.MODULE_INSTALL_LOCAL, async () => {
    try {
      await (await getModuleLicenseGate()).requireService('intelligence-modules');
    } catch (err) {
      if (err instanceof LicenseGateError) return { success: false, error: `License required: ${err.reason}` };
      throw err;
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Module Build Folder (containing module.json)',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Cancelled' };
    }
    try {
      const module = await installLocalModule(result.filePaths[0]!);
      return { success: true, module };
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

  // --------------------------------------------------------------------------
  // Module Host (runtime API for loaded modules)
  // --------------------------------------------------------------------------

  ipcMain.handle(IPC_CHANNELS.MODULE_HOST_LIST_LOADED, () => {
    return getLoadedModules().map((r) => ({
      slug: r.slug,
      manifest: r.manifest,
      installPath: r.installPath,
    }));
  });

  ipcMain.handle(
    IPC_CHANNELS.MODULE_HOST_PTY_CREATE,
    (
      event,
      slug: string,
      opts: {
        shell: string;
        args?: string[];
        cwd?: string;
        env?: Record<string, string>;
        cols?: number;
        rows?: number;
      },
    ) => {
      const rec = getLoadedModules().find((r) => r.slug === slug);
      if (!rec) throw new Error(`unknown module: ${slug}`);
      if (!rec.manifest.permissions?.includes('pty')) {
        throw new Error(`module ${slug} lacks pty permission`);
      }
      return spawnPty({
        moduleSlug: slug,
        windowId: event.sender.id,
        shell: opts.shell,
        args: opts.args,
        cwd: opts.cwd,
        env: opts.env,
        cols: opts.cols,
        rows: opts.rows,
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.MODULE_HOST_PTY_WRITE, (_e, id: string, data: string) =>
    writePty(id, data),
  );

  ipcMain.handle(
    IPC_CHANNELS.MODULE_HOST_PTY_RESIZE,
    (_e, id: string, cols: number, rows: number) => resizePty(id, cols, rows),
  );

  ipcMain.handle(IPC_CHANNELS.MODULE_HOST_PTY_KILL, (_e, id: string) => killPty(id));

  // Run heartbeat on app launch (background, non-blocking)
  setTimeout(() => {
    heartbeatAll().catch((err) => {
      console.warn('[ModuleIPC] Background heartbeat failed:', err);
    });
  }, 5000); // Delay 5s after startup

  // Load all installed modules (background, non-blocking)
  loadAllModules().catch((err) => {
    console.error('[ModuleIPC] Load-all failed:', err);
  });
}
