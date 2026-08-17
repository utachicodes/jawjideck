#!/usr/bin/env node
// Generate an Ed25519 key pair for Jawji Device Security & Licensing.
//
//   node tools/license-keys.mjs            # print to stdout
//   node tools/license-keys.mjs --out keys # also write keys/ dir + .env template
//
// Usage of the two halves:
//   - LICENSE_SIGNING_PRIVATE_KEY (PKCS8 PEM, base64): set in the jawji-gcs
//     server environment. The server signs entitlement tokens with it. NEVER
//     embed this in any client binary or repo.
//   - JAWJI_LICENSE_PUBLIC_KEY (SPKI PEM, base64): injected at BUILD TIME
//     into each service binary (jawjideck desktop, jawji-controller,
//     jawji-orchestrator) via the build's define/env mechanism. Clients use
//     it to verify tokens locally, offline, without ever holding the secret.
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const privateB64 = Buffer.from(privatePem, 'utf8').toString('base64');
const publicB64 = Buffer.from(publicPem, 'utf8').toString('base64');

const outIndex = process.argv.indexOf('--out');
const outDir = outIndex >= 0 ? resolve(process.argv[outIndex + 1]) : null;

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'private.pem'), privatePem, { mode: 0o600 });
  writeFileSync(join(outDir, 'public.pem'), publicPem);
  writeFileSync(
    join(outDir, 'env.template'),
    [
      '# jawji-gcs server (private signing key - never ship to a client)',
      `LICENSE_SIGNING_PRIVATE_KEY=${privateB64}`,
      '',
      '# build-time public key (inject into client builds)',
      `JAWJI_LICENSE_PUBLIC_KEY=${publicB64}`,
      '',
    ].join('\n')
  );
  console.log(`Wrote key files + env.template to ${outDir}`);
}

console.log('\n==========================================');
console.log('Jawji Device Security & Licensing keys');
console.log('==========================================\n');
console.log('SERVER (jawji-gcs) - sign only, keep secret:');
console.log('  LICENSE_SIGNING_PRIVATE_KEY=' + privateB64);
console.log('\nCLIENTS (desktop / controller / orchestrator) - build-time inject:');
console.log('  JAWJI_LICENSE_PUBLIC_KEY=' + publicB64);
console.log('\nStore the private key in the server environment and the public key in');
console.log('client build pipelines. Public keys are public - they do not need to');
console.log('be hidden, only the private key must never leave the server.');
