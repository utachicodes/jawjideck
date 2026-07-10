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

  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshEntitlements: () => Promise<void>;
  activateCode: (code: string, hardwareId?: string) => Promise<boolean>;
  startCheckout: (licenseType: LicenseType, moduleId?: string) => Promise<string | null>;
}

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

    signIn: async () => {
      await window.electronAPI?.openExternal(`${JAWJI_GCS_URL}/desktop-auth`);
    },

    signOutUser: async () => {
      await signOut(auth);
      set({ entitlements: null });
    },

    refreshEntitlements: async () => {
      set({ entitlementsLoading: true, error: null });
      try {
        const { snapshot } = await apiFetch<{ snapshot: EntitlementSnapshot }>('/api/licensing/entitlements');
        set({ entitlements: snapshot, entitlementsLoading: false });
      } catch (err) {
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
