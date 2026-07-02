import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { JawjiModulePlugin } from '@jawji/module-sdk/esbuild';

await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/renderer/index.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  plugins: [JawjiModulePlugin()],
  outfile: 'dist/renderer.js',
});

await copyFile('module.json', 'dist/module.json');
await copyFile('src/detect.py', 'dist/detect.py');
console.log('Build complete.');
