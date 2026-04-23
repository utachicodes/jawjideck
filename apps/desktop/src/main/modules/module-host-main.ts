import { app, ipcMain } from 'electron';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MainHostApi, ModuleManifest } from '@ardudeck/module-sdk';

export function createMainHostApi(manifest: ModuleManifest): MainHostApi {
  const dataDir = join(app.getPath('userData'), 'modules', manifest.slug, 'data');

  return {
    moduleSlug: manifest.slug,
    dataDir,
    async readData(key) {
      const p = join(dataDir, `${key}.json`);
      try {
        await access(p);
        return await readFile(p, 'utf-8');
      } catch {
        return undefined;
      }
    },
    async writeData(key, value) {
      await mkdir(dataDir, { recursive: true });
      await writeFile(join(dataDir, `${key}.json`), value, 'utf-8');
    },
    log(level, ...args) {
      const tag = `[module:${manifest.slug}]`;
      if (level === 'error') console.error(tag, ...args);
      else if (level === 'warn') console.warn(tag, ...args);
      else console.log(tag, ...args);
    },
    onRendererMessage(channel, handler) {
      const fullChannel = `module:${manifest.slug}:${channel}`;
      const listener = async (_: unknown, data: unknown) => handler(data);
      ipcMain.handle(fullChannel, listener);
      return () => ipcMain.removeHandler(fullChannel);
    },
  };
}
