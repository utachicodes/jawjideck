/**
 * App Lock — an optional username + PIN quick-unlock screen for this
 * installation. Not an account system: it's a local gate (like a phone's
 * lock screen) so someone else picking up the laptop can't use Jawji without
 * the PIN. The PIN never leaves the main process; the renderer only ever
 * gets a boolean back from a verify call.
 */
import { ipcMain, safeStorage, BrowserWindow } from 'electron';
import Store from 'electron-store';
import { IPC_CHANNELS, type AppLockState } from '../shared/ipc-channels.js';

interface AppLockStoreSchema {
  enabled: boolean;
  username: string | null;
  /** base64 of safeStorage-encrypted PIN, or the raw PIN if encryption isn't available on this OS. */
  pin: string | null;
}

const store = new Store<AppLockStoreSchema>({
  name: 'app-lock',
  defaults: { enabled: false, username: null, pin: null },
});

function getStoredPin(): string | null {
  const stored = store.get('pin');
  if (!stored) return null;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    }
    return stored;
  } catch {
    return null;
  }
}

function setStoredPin(pin: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    store.set('pin', safeStorage.encryptString(pin).toString('base64'));
  } else {
    store.set('pin', pin);
  }
}

export function getAppLockState(): AppLockState {
  return { enabled: store.get('enabled'), username: store.get('username') };
}

export function setupAppLockHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.APP_LOCK_GET_STATE, (): AppLockState => getAppLockState());

  ipcMain.handle(
    IPC_CHANNELS.APP_LOCK_SETUP,
    (_event, username: string, pin: string): { success: boolean; error?: string } => {
      const trimmedUsername = username.trim();
      if (!trimmedUsername) return { success: false, error: 'Username is required' };
      if (!/^\d{4,8}$/.test(pin)) return { success: false, error: 'PIN must be 4-8 digits' };

      store.set('username', trimmedUsername);
      setStoredPin(pin);
      store.set('enabled', true);
      return { success: true };
    },
  );

  ipcMain.handle(IPC_CHANNELS.APP_LOCK_VERIFY, (_event, pin: string): { success: boolean } => {
    const stored = getStoredPin();
    return { success: stored !== null && stored === pin };
  });

  ipcMain.handle(IPC_CHANNELS.APP_LOCK_DISABLE, (_event, pin: string): { success: boolean } => {
    const stored = getStoredPin();
    if (stored === null || stored !== pin) return { success: false };
    store.set('enabled', false);
    store.set('username', null);
    store.set('pin', null);
    return { success: true };
  });

  // Manually lock right now (e.g. "Lock now" button in Settings), without
  // waiting for the next app launch.
  ipcMain.handle(IPC_CHANNELS.APP_LOCK_REQUEST_ENGAGE, () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.APP_LOCK_ENGAGE);
    }
    return { success: true };
  });
}
