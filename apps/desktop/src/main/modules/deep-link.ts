/**
 * ardudeck:// deep-link handling.
 *
 * The marketplace "Install in ArduDeck" button opens
 *   ardudeck://install?slug=<slug>&name=<name>&key=<license-key>
 * which lands here. We validate the key's signature offline, then hand the
 * request to the renderer to confirm with the user before installing.
 */

import { app, BrowserWindow } from 'electron';
import { verifyLicenseKey } from './license-validator.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';

const PROTOCOL = 'ardudeck';

let getWindow: (() => BrowserWindow | null) | null = null;
// A deep link can arrive before the window/renderer is ready (cold start via
// the link). Hold the most recent one and flush it once the renderer loads.
let pending: { slug: string; name: string; key: string } | null = null;

/**
 * Register the protocol and OS-level entry points. Call once, before the app
 * is ready. `resolveWindow` returns the main window (may be null early).
 */
export function setupDeepLinks(resolveWindow: () => BrowserWindow | null): void {
  getWindow = resolveWindow;

  // In dev (unpackaged), the OS must launch electron with the app path as an
  // argument for the protocol to resolve to this project.
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]!]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }

  // macOS delivers the URL via this event (both cold and warm start).
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  // Windows/Linux deliver the URL as an argv entry to a second instance.
  app.on('second-instance', (_event, argv) => {
    const win = getWindow?.();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) handleDeepLink(url);
  });
}

/** Handle a deep link present in the launch argv (Windows/Linux cold start). */
export function handleStartupArgs(argv: string[]): void {
  const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
  if (url) handleDeepLink(url);
}

/** Flush any deep link captured before the renderer was ready. */
export function flushPendingDeepLink(): void {
  if (pending) {
    deliver(pending);
    pending = null;
  }
}

function handleDeepLink(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.warn('[DeepLink] Unparseable URL:', url);
    return;
  }

  // ardudeck://install?... -> host is "install"
  if (parsed.host !== 'install') {
    console.warn('[DeepLink] Unknown action:', parsed.host);
    return;
  }

  const slug = parsed.searchParams.get('slug') ?? '';
  const name = parsed.searchParams.get('name') ?? slug;
  const key = parsed.searchParams.get('key') ?? '';

  if (!slug || !key) {
    console.warn('[DeepLink] Missing slug or key');
    return;
  }

  // Validate the license signature offline before surfacing anything.
  const verification = verifyLicenseKey(key);
  if (!verification.valid) {
    console.warn('[DeepLink] Rejected key:', verification.error);
    return;
  }

  deliver({ slug, name, key });
}

function deliver(payload: { slug: string; name: string; key: string }): void {
  const win = getWindow?.();
  if (!win || win.webContents.isLoading()) {
    pending = payload;
    return;
  }
  if (win.isMinimized()) win.restore();
  win.focus();
  win.webContents.send(IPC_CHANNELS.MODULE_DEEP_LINK_INSTALL, payload);
}
