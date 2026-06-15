import type { ComponentType } from 'react';
import type { ModuleManifest } from './manifest.js';

export interface PtyCreateOptions {
  shell: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface RendererHostApi {
  moduleSlug: string;
  telemetry: {
    getSnapshot(): unknown;
    subscribe(listener: (s: unknown) => void): () => void;
  };
  connection: {
    getState(): unknown;
    subscribe(listener: (s: unknown) => void): () => void;
  };
  view: {
    getCurrent(): string;
    subscribe(listener: (v: string) => void): () => void;
  };
  params: {
    getAll(): Promise<unknown[]>;
    get(name: string): Promise<unknown>;
    set(name: string, value: number): Promise<void>;
  };
  pty: {
    create(opts: PtyCreateOptions): Promise<string>;
    write(id: string, data: string): Promise<void>;
    resize(id: string, cols: number, rows: number): Promise<void>;
    kill(id: string): Promise<void>;
    onData(id: string, cb: (d: string) => void): () => void;
    onExit(id: string, cb: (code: number) => void): () => void;
  };
  invoke(channel: string, data: unknown): Promise<unknown>;
  log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void;
  registerMountPoint(name: 'floatingOverlay', component: ComponentType): void;
}

export interface MainHostApi {
  moduleSlug: string;
  dataDir: string;
  readData(key: string): Promise<string | undefined>;
  writeData(key: string, value: string): Promise<void>;
  /**
   * Encrypted-at-rest storage for secrets (e.g. API keys), backed by the OS
   * keychain via Electron safeStorage. Falls back to plaintext with a warning
   * if OS encryption is unavailable. Prefer this over writeData for secrets.
   */
  secureRead(key: string): Promise<string | undefined>;
  secureWrite(key: string, value: string): Promise<void>;
  log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void;
  onRendererMessage(
    channel: string,
    handler: (data: unknown) => unknown | Promise<unknown>,
  ): () => void;
}

export interface ModuleMainExports {
  activate?: (host: MainHostApi) => unknown | Promise<unknown>;
  deactivate?: () => void | Promise<void>;
}

export interface ModuleRendererExports {
  activate?: (host: RendererHostApi) => unknown | Promise<unknown>;
  deactivate?: () => void | Promise<void>;
}

export interface LoadedModuleInfo {
  slug: string;
  manifest: ModuleManifest;
  installPath: string;
}
