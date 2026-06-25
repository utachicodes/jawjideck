const fs = require('fs');
const path = require('path');

/**
 * Recursively remove all .bin directories under a given root.
 * These are npm symlink directories that break macOS code signing
 * when they end up in the unpacked asar.
 */
async function removeDotBinDirs(dir) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      if (entry.name === '.bin') {
        await fs.promises.rm(fullPath, { recursive: true, force: true });
      } else if (entry.isDirectory()) {
        await removeDotBinDirs(fullPath);
      }
    }
  }
}

async function removeFileOrDir(p) {
  try { await fs.promises.rm(p, { recursive: true, force: true }); } catch {}
}

module.exports = async function afterPack({ electronPlatformName, appOutDir }) {
  // macOS: remove .bin symlink directories from unpacked asar to prevent
  // ENOENT errors during code signing (broken symlinks in @serialport etc.)
  if (electronPlatformName === 'darwin') {
    const unpackedDir = path.join(
      appOutDir,
      'Jawji.app',
      'Contents',
      'Resources',
      'app.asar.unpacked'
    );
    await removeDotBinDirs(unpackedDir);
  }

  // Windows: trim non-English locales and cross-platform SITL/firmware binaries
  if (electronPlatformName === 'win32') {
    // Keep only English locale
    const localesDir = path.join(appOutDir, 'locales');
    try {
      const files = await fs.promises.readdir(localesDir);
      for (const f of files) {
        if (f !== 'en-US.pak') await removeFileOrDir(path.join(localesDir, f));
      }
    } catch {}

    // Remove Linux/macOS SITL binaries
    const sitlDir = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'resources', 'sitl');
    await removeFileOrDir(path.join(sitlDir, 'linux'));
    await removeFileOrDir(path.join(sitlDir, 'macos'));

    // Remove Linux/macOS firmware binaries
    const fwDir = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'resources', 'firmware');
    await removeFileOrDir(path.join(fwDir, 'linux'));
    await removeFileOrDir(path.join(fwDir, 'macos'));
  }

  // Linux: wrap executable with --no-sandbox
  if (electronPlatformName === 'linux') {
    const execName = '@Jawjidesktop';
    const execPath = path.join(appOutDir, execName);
    const binPath = path.join(appOutDir, `${execName}.bin`);

    await fs.promises.rename(execPath, binPath);
    await fs.promises.writeFile(execPath, [
      '#!/bin/bash',
      `exec "\${BASH_SOURCE%/*}/${execName}.bin" --no-sandbox "$@"`,
      ''
    ].join('\n'));
    await fs.promises.chmod(execPath, 0o755);
  }
};
