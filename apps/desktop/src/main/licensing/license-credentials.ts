export interface SecretCipher {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(buffer: Buffer): string;
}

export interface CredentialStorage {
  readEncrypted(): string | null;
  writeEncrypted(value: string): void;
}

export interface StoredLicenseCache {
  uid: string | null;
  snapshot: unknown;
  token: string | null;
  cachedAt: number | null;
}

interface EncryptedCacheV1 {
  v: 1;
  encrypted: string;
}

/**
 * Builds the real, Electron-backed store. Kept behind an async factory so the
 * module can be unit-tested in plain Node (tests inject fake cipher/storage).
 * Both safeStorage and electron-store require the app to be ready, which is
 * guaranteed by the time IPC handlers run.
 */
export async function createLicenseCredentialStore(): Promise<LicenseCredentialStore> {
  const { default: Store } = await import('electron-store');
  const { safeStorage } = await import('electron');
  const store = new Store<{ cacheV1: string | null }>({
    name: 'licensing-credentials',
    defaults: { cacheV1: null },
  });
  return new LicenseCredentialStore({
    storage: {
      readEncrypted: () => store.get('cacheV1') ?? null,
      writeEncrypted: (value) => store.set('cacheV1', value),
    },
    cipher: {
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
      encryptString: (value) => safeStorage.encryptString(value),
      decryptString: (buffer) => safeStorage.decryptString(buffer),
    },
  });
}

function shapeCheck(value: unknown): value is StoredLicenseCache {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.uid === null || typeof v.uid === 'string') &&
    v.snapshot !== null &&
    (v.token === null || typeof v.token === 'string') &&
    (v.cachedAt === null || typeof v.cachedAt === 'number')
  );
}

/**
 * Encrypted-at-rest store for the entitlement credential (the signed token +
 * snapshot the renderer writes through LICENSING_CACHE_*). The IPC-facing
 * schema is unchanged; the plaintext never touches disk. When platform
 * encryption is unavailable the store refuses to persist (fail-closed: no
 * on-disk credential means offline verification simply does not happen).
 */
export class LicenseCredentialStore {
  private readonly storage: CredentialStorage;
  private readonly cipher: SecretCipher;

  constructor(options: { storage: CredentialStorage; cipher: SecretCipher }) {
    this.storage = options.storage;
    this.cipher = options.cipher;
  }

  isEncryptionAvailable(): boolean {
    return this.cipher.isEncryptionAvailable();
  }

  read(): StoredLicenseCache | null {
    const raw = this.storage.readEncrypted();
    if (!raw) return null;
    if (!this.cipher.isEncryptionAvailable()) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || (parsed as { v?: unknown }).v !== 1) return null;
      const encrypted = (parsed as EncryptedCacheV1).encrypted;
      const plaintext = this.cipher.decryptString(Buffer.from(encrypted, 'base64'));
      const cache: unknown = JSON.parse(plaintext);
      if (!shapeCheck(cache)) return null;
      return cache;
    } catch {
      return null;
    }
  }

  write(cache: StoredLicenseCache): boolean {
    if (!this.cipher.isEncryptionAvailable()) return false;
    try {
      const encrypted = this.cipher.encryptString(JSON.stringify(cache));
      const payload: EncryptedCacheV1 = { v: 1, encrypted: encrypted.toString('base64') };
      this.storage.writeEncrypted(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    this.storage.writeEncrypted('');
  }
}
