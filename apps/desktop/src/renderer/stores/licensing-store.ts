import { create } from 'zustand';
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
  setPersistence,
  browserLocalPersistence,
  type User,
} from 'firebase/auth';
import { auth, firebaseConfigured } from '../lib/firebase';

const JAWJI_GCS_URL = import.meta.env.VITE_JAWJI_GCS_URL || 'https://jawji.space';

export type LicenseType = 'subscription' | 'orchestrator' | 'intelligence-module';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';
export type LicenseStatus = 'unredeemed' | 'active' | 'revoked';

export interface License {
  id: string;
  ownerUid: string | null;
  type: LicenseType;
  moduleId: string | null;
  boundHardwareId: string | null;
  status: LicenseStatus;
  createdAt: number;
  activatedAt: number | null;
}

export interface EntitlementSnapshot {
  uid: string;
  subscription: {
    uid: string;
    status: SubscriptionStatus;
    trialEndsAt: number | null;
    currentPeriodEnd: number | null;
    createdAt: number;
    updatedAt: number;
  };
  licenses: License[];
}

interface LicensingState {
  user: User | null;
  authLoading: boolean;
  entitlements: EntitlementSnapshot | null;
  entitlementsLoading: boolean;
  error: string | null;
  /** True when `entitlements` came from the on-disk cache, not a live fetch. */
  offline: boolean;
  /** True when the cached data is older than STALE_THRESHOLD_MS - shown, not hidden, per the "don't hard-lock, show an honest stale state" design. */
  needsReverification: boolean;
  /** When the currently-shown entitlements were last confirmed live, if known. */
  cachedAt: number | null;

  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshEntitlements: () => Promise<void>;
  activateCode: (code: string, hardwareId?: string) => Promise<boolean>;
  startCheckout: (licenseType: LicenseType, moduleId?: string) => Promise<string | null>;
}

// How long a cached entitlement snapshot is trusted without complaint while
// offline. Past this, the cached data is still shown (never a hard lock)
// but flagged as needing re-verification - matches the offline design's
// "surface an honest needs-re-verification state" principle.
export const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export function isCacheStale(cachedAt: number | null, now: number = Date.now()): boolean {
  if (!cachedAt) return true;
  return now - cachedAt > STALE_THRESHOLD_MS;
}

// Re-verify entitlements periodically during long-running sessions, so a
// revoked/expired license or a completed purchase is picked up without
// requiring the user to restart the app.
const PERIODIC_REVERIFY_INTERVAL_MS = 60 * 60 * 1000;

async function getIdTokenOrThrow(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const idToken = await getIdTokenOrThrow();
  const res = await fetch(`${JAWJI_GCS_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${idToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request to ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

let persistenceReady: Promise<void> | null = null;
function ensurePersistence(): Promise<void> {
  if (!persistenceReady) {
    persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => undefined);
  }
  return persistenceReady;
}

let initialized = false;

export const useLicensingStore = create<LicensingState>((set, get) => {
  if (typeof window !== 'undefined' && !initialized) {
    initialized = true;

    if (firebaseConfigured) {
      void ensurePersistence();
      onAuthStateChanged(auth, (user) => {
        set({ user, authLoading: false });
        if (user) void get().refreshEntitlements();
        else set({ entitlements: null });
      });

      setInterval(() => {
        if (auth.currentUser) void get().refreshEntitlements();
      }, PERIODIC_REVERIFY_INTERVAL_MS);

      window.electronAPI?.onLicensingAuthCallback(({ token }) => {
        void ensurePersistence()
          .then(() => signInWithCustomToken(auth, token))
          .catch((err) => set({ error: err instanceof Error ? err.message : 'Sign-in failed' }));
      });
    } else {
      set({ authLoading: false, error: 'Licensing is not configured for this build (missing VITE_FIREBASE_* env vars)' });
    }
  }

  return {
    user: null,
    authLoading: firebaseConfigured,
    entitlements: null,
    entitlementsLoading: false,
    error: null,
    offline: false,
    needsReverification: false,
    cachedAt: null,

    signIn: async () => {
      await window.electronAPI?.openExternal(`${JAWJI_GCS_URL}/desktop-auth`);
    },

    signOutUser: async () => {
      await signOut(auth);
      set({ entitlements: null, offline: false, needsReverification: false, cachedAt: null });
    },

    refreshEntitlements: async () => {
      set({ entitlementsLoading: true, error: null });
      const user = auth.currentUser;

      try {
        const { snapshot, token } = await apiFetch<{ snapshot: EntitlementSnapshot; token: string }>(
          '/api/licensing/entitlements'
        );
        const cachedAt = Date.now();
        set({
          entitlements: snapshot,
          entitlementsLoading: false,
          offline: false,
          needsReverification: false,
          cachedAt,
        });
        if (user) {
          void window.electronAPI?.licensingCacheSet({ uid: user.uid, snapshot, token, cachedAt });
        }
        return;
      } catch (err) {
        // A thrown TypeError from fetch() means the request never reached the
        // network (offline, DNS failure, etc.) - anything else (a non-2xx
        // response, an explicit API error) is a real answer from the server
        // and should NOT silently fall back to a possibly-outdated cache.
        const isNetworkFailure = err instanceof TypeError;
        if (isNetworkFailure && user) {
          const cache = await window.electronAPI?.licensingCacheGet();
          if (cache && cache.uid === user.uid && cache.snapshot) {
            const cachedAt = cache.cachedAt ?? null;
            set({
              entitlements: cache.snapshot as EntitlementSnapshot,
              entitlementsLoading: false,
              offline: true,
              needsReverification: isCacheStale(cachedAt),
              cachedAt,
              error: null,
            });
            return;
          }
        }
        set({ entitlementsLoading: false, error: err instanceof Error ? err.message : 'Failed to load entitlements' });
      }
    },

    activateCode: async (code, hardwareId) => {
      set({ error: null });
      try {
        const { snapshot } = await apiFetch<{ snapshot: EntitlementSnapshot }>('/api/licensing/activate', {
          method: 'POST',
          body: JSON.stringify({ code, hardwareId }),
        });
        set({ entitlements: snapshot });
        return true;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Activation failed' });
        return false;
      }
    },

    startCheckout: async (licenseType, moduleId) => {
      set({ error: null });
      try {
        const { checkoutUrl } = await apiFetch<{ checkoutUrl: string }>('/api/licensing/checkout', {
          method: 'POST',
          body: JSON.stringify({ licenseType, moduleId }),
        });
        await window.electronAPI?.openExternal(checkoutUrl);
        return checkoutUrl;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Checkout failed' });
        return null;
      }
    },
  };
});
