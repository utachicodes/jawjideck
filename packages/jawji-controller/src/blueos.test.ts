// blueos.test.ts
import { describe, it, expect } from 'vitest';
import { installExtension, removeExtension, getExtensionLogs } from './blueos';

describe('blueos extension input validation', () => {
  it('rejects malformed identifiers on install', async () => {
    // Returns an error synchronously without any network call.
    expect((await installExtension('../etc/passwd', '1.0')).success).toBe(false);
    expect((await installExtension('x y', '1.0')).success).toBe(false);
    expect((await installExtension('', '1.0')).success).toBe(false);
  });

  it('rejects malformed versions on install', async () => {
    expect((await installExtension('org.ext', 'v1.0; rm -rf /')).success).toBe(false);
  });

  it('rejects malformed identifiers on remove', async () => {
    expect((await removeExtension('../etc')).success).toBe(false);
  });

  it('returns empty logs for malformed identifiers', async () => {
    expect(await getExtensionLogs('../../bad')).toBe('');
  });
});
