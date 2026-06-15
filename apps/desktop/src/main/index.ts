/**
 * Electron Main Process
 * Handles window management and native integrations
 */

import { app, BrowserWindow, shell } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setupIpcHandlers, cleanupOnShutdown } from './ipc-handlers.js';
import { setupModuleIpc } from './modules/module-ipc.js';
import { registerTileCacheScheme, setupTileCacheProtocol, setupTileCacheHandlers } from './tile-cache.js';
import { registerModuleSchemePrivileges, setupModuleProtocol } from './modules/module-protocol.js';
import { setupDeepLinks, handleStartupArgs, flushPendingDeepLink } from './modules/deep-link.js';
import { initWindowManager, restoreDetachedWindows, setupWindowManagerIpc } from './window-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Handle uncaught exceptions gracefully - especially network errors
// ECONNRESET happens when SITL is killed while connected
process.on('uncaughtException', (error: Error) => {
  // Network errors are expected when SITL/connection is killed
  const isNetworkError = error.message.includes('ECONNRESET') ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('EPIPE') ||
    error.message.includes('ETIMEDOUT');

  if (isNetworkError) {
    console.warn('[Main] Network error (expected during disconnect):', error.message);
    return; // Don't crash
  }

  // Log other uncaught exceptions but don't crash
  console.error('[Main] Uncaught exception:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);

  // Network errors are expected
  const isNetworkError = message.includes('ECONNRESET') ||
    message.includes('ECONNREFUSED') ||
    message.includes('EPIPE') ||
    message.includes('ETIMEDOUT');

  if (isNetworkError) {
    console.warn('[Main] Network rejection (expected during disconnect):', message);
    return;
  }

  console.error('[Main] Unhandled rejection:', reason);
  console.error('[Main] Rejection type:', typeof reason, reason?.constructor?.name);
  console.error('[Main] Rejection stack:', new Error('rejection trace').stack);
});

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Single-instance lock so ardudeck:// deep links route to the running app
// instead of spawning a second one.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// Track the main window so deep-link handlers can focus/message it.
let mainWindowRef: BrowserWindow | null = null;
setupDeepLinks(() => mainWindowRef);

// Set app name early to ensure consistent userData path in dev mode
// This ensures electron-store saves to %APPDATA%/ardudeck/ instead of %APPDATA%/Electron/
app.name = 'ardudeck';

// Register tile-cache:// scheme BEFORE app.ready (Electron requirement)
registerTileCacheScheme();
registerModuleSchemePrivileges();

function createWindow(): BrowserWindow {
  // Get the icon path based on platform
  // In dev: __dirname is out/main/, resources is at ../../resources/
  // In prod: app.getAppPath() points to the app root
  const resourcesPath = isDev
    ? join(__dirname, '../../resources')
    : join(app.getAppPath(), 'resources');

  const iconPath = process.platform === 'win32'
    ? join(resourcesPath, 'icon.ico')
    : process.platform === 'darwin'
    ? join(resourcesPath, 'icon.icns')
    : join(resourcesPath, 'icon.png');

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Load the app
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  // A second instance is quitting; don't open another window.
  if (!gotSingleInstanceLock) return;

  // Set macOS dock icon
  if (process.platform === 'darwin') {
    const resourcesPath = isDev
      ? join(__dirname, '../../resources')
      : join(app.getAppPath(), 'resources');
    app.dock.setIcon(join(resourcesPath, 'icon.png'));
  }

  // Setup tile cache protocol handler (must be after app.ready)
  setupTileCacheProtocol();
  setupModuleProtocol();

  const mainWindow = createWindow();
  mainWindowRef = mainWindow;

  // Register the main window with the detachable-windows manager BEFORE any
  // IPC handlers wire up, so safeSend's broadcast() helper can see it.
  initWindowManager(mainWindow);
  setupWindowManagerIpc();

  // Setup IPC handlers
  setupIpcHandlers(mainWindow);
  setupModuleIpc(mainWindow);
  setupTileCacheHandlers(mainWindow);

  // Restore any detached windows the user had open last time.
  // Defer until after the main window is ready so the renderer has subscribed
  // to the push channels by the time pop-outs spawn (they share the broadcast).
  mainWindow.webContents.once('did-finish-load', () => {
    restoreDetachedWindows();
    // Deliver any deep link captured before the renderer was ready, and handle
    // a link present in the initial launch argv (Windows/Linux cold start).
    flushPendingDeepLink();
    handleStartupArgs(process.argv);
  });

  // Dev-only: start test driver MCP server
  if (isDev) {
    import('./testing/index.js').then((m) => m.initTestingMcp(mainWindow)).catch(console.error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

// BSOD Prevention: Clean up serial/USB connections before app quits
// This is CRITICAL for Windows USB drivers (CH340, CP210x, FTDI)
// Without proper cleanup, drivers may not release, causing issues on reconnect
app.on('before-quit', async (event) => {
  // Prevent immediate quit to allow async cleanup
  event.preventDefault();

  try {
    await cleanupOnShutdown();
  } catch (err) {
    console.error('[App] Cleanup error:', err);
  }

  // Now actually quit
  app.exit(0);
});

// Also handle SIGINT/SIGTERM for graceful shutdown in dev mode
process.on('SIGINT', async () => {
  try {
    await cleanupOnShutdown();
  } catch (err) {
    console.error('[App] Cleanup error:', err);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  try {
    await cleanupOnShutdown();
  } catch (err) {
    console.error('[App] Cleanup error:', err);
  }
  process.exit(0);
});
