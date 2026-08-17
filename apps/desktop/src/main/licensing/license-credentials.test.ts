import { describe, it, expect } from 'vitest';
import {
  LicenseCredentialStore,
  type CredentialStorage,
  type SecretCipher,
  type StoredLicenseCache,
} from './license-credentials.js';

const identityCipher: SecretCipher = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value, 'utf8'),
  decryptString: (buffer) => buffer.toString('utf8'),
};

function memoryStorage(initial: string | null = null): CredentialStorage & { raw: () => string | null } {
  let value: string | null = initial;
  return {
    raw: () => value,
    readEncrypted: () => value,
    writeEncrypted: (v) => {
      value = v;
    },
  };
}

const cache: StoredLicenseCache = {
  uid: 'user-1',
  snapshot: { uid: 'user-1', subscription: { status: 'active' } },
  token: 'abc.def',
  cachedAt: 1234,
};

function storeWith(overrides?: { storage?: CredentialStorage; cipher?: SecretCipher }): LicenseCredentialStore {
  return new LicenseCredentialStore({
    storage: memoryStorage(),
    cipher: identityCipher,
    ...overrides,
  });
}

describe('LicenseCredentialStore', () => {
  it('round-trips a cache through encryption and back', () => {
    const storage = memoryStorage();
    const store = new LicenseCredentialStore({ storage, cipher: identityCipher });
    expect(store.write(cache)).toBe(true);
    expect(storage.raw()).not.toContain(cache.token);
    expect(store.read()).toEqual(cache);
  });

  it('returns null when nothing is stored', () => {
    expect(storeWith().read()).toBeNull();
  });

  it('returns null when encryption is unavailable, even if a blob exists', () => {
    const unavailable: SecretCipher = {
      ...identityCipher,
      isEncryptionAvailable: () => false,
    };
    const storage = memoryStorage(JSON.stringify({ v: 1, encrypted: 'AA==' }));
    const store = new LicenseCredentialStore({ storage, cipher: unavailable });
    expect(store.read()).toBeNull();
  });

  it('write refuses to persist when encryption is unavailable', () => {
    const unavailable: SecretCipher = {
      ...identityCipher,
      isEncryptionAvailable: () => false,
    };
    const storage = memoryStorage();
    const store = new LicenseCredentialStore({ storage, cipher: unavailable });
    expect(store.write(cache)).toBe(false);
    expect(storage.raw()).toBeNull();
  });

  it('returns null on a corrupted blob', () => {
    const store = new LicenseCredentialStore({ storage: memoryStorage('not json'), cipher: identityCipher });
    expect(store.read()).toBeNull();
  });

  it('returns null for an unknown envelope version', () => {
    const blob = JSON.stringify({ v: 99, encrypted: Buffer.from('x').toString('base64') });
    const store = new LicenseCredentialStore({ storage: memoryStorage(blob), cipher: identityCipher });
    expect(store.read()).toBeNull();
  });

  it('returns null when the decrypted payload fails shape validation', () => {
    const encrypted = identityCipher.encryptString(JSON.stringify({ nope: true }));
    const blob = JSON.stringify({ v: 1, encrypted: encrypted.toString('base64') });
    const store = new LicenseCredentialStore({ storage: memoryStorage(blob), cipher: identityCipher });
    expect(store.read()).toBeNull();
  });

  it('returns null when the cipher throws (e.g. wrong key)', () => {
    const throwing: SecretCipher = {
      ...identityCipher,
      decryptString: () => {
        throw new Error('decrypt failed');
      },
    };
    const storage = memoryStorage(JSON.stringify({ v: 1, encrypted: Buffer.from('x').toString('base64') }));
    const store = new LicenseCredentialStore({ storage, cipher: throwing });
    expect(store.read()).toBeNull();
  });

  it('clear wipes the stored blob', () => {
    const storage = memoryStorage();
    const store = new LicenseCredentialStore({ storage, cipher: identityCipher });
    store.write(cache);
    store.clear();
    expect(storage.raw()).toBe('');
    expect(store.read()).toBeNull();
  });
});
