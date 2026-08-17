#!/usr/bin/env node
// Build-time license key injection (Device Security & Licensing).
//
// Reads JAWJI_LICENSE_PUBLIC_KEY (base64 SPKI PEM from tools/license-keys.mjs)
// and writes it into src/generated/license-key.ts, which tsc then compiles
// into the dist bundle. With no key set the file stays empty and paid/cloud
// features fail closed at runtime - a build can never silently ship without
// credentials.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const key = process.env.JAWJI_LICENSE_PUBLIC_KEY ?? '';
const out = join(root, 'src', 'generated', 'license-key.ts');

writeFileSync(out, `export const JAWJI_LICENSE_PUBLIC_KEY = ${JSON.stringify(key)};\n`);

if (key) {
  console.log(`[license] ${out}: public key embedded (paid features enabled per entitlement)`);
} else {
  console.log(`[license] ${out}: JAWJI_LICENSE_PUBLIC_KEY not set - paid features fail closed`);
}
