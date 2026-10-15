import { create } from 'zustand';

interface AppLockStore {
  /** Whether a username+PIN is configured for this install. */
  enabled: boolean;
  username: string | null;
  /** Whether the lock screen should currently be shown over the app. */
  locked: boolean;
  /** True once the initial state has been fetched from main (avoids a flash of the unlocked app). */
  ready: boolean;

  init: () => Promise<void>;
  setup: (username: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  disable: (pin: string) => Promise<boolean>;
  verify: (pin: string) => Promise<boolean>;
  lockNow: () => Promise<void>;
}

export const useAppLockStore = create<AppLockStore>((set, get) => {
  if (typeof window !== 'undefined' && window.electronAPI?.onAppLockEngage) {
    window.electronAPI.onAppLockEngage(() => {
      if (get().enabled) set({ locked: true });
    });
  }

  return {
    enabled: false,
    username: null,
    locked: false,
    ready: false,

    init: async () => {
      if (!window.electronAPI?.appLockGetState) {
        set({ ready: true });
        return;
      }
      const state = await window.electronAPI.appLockGetState();
      set({ enabled: state.enabled, username: state.username, locked: state.enabled, ready: true });
    },

    setup: async (username, pin) => {
      if (!window.electronAPI?.appLockSetup) return { success: false, error: 'Not available' };
      const result = await window.electronAPI.appLockSetup(username, pin);
      if (result.success) set({ enabled: true, username: username.trim(), locked: false });
      return result;
    },

    disable: async (pin) => {
      if (!window.electronAPI?.appLockDisable) return false;
      const result = await window.electronAPI.appLockDisable(pin);
      if (result.success) set({ enabled: false, username: null, locked: false });
      return result.success;
    },

    verify: async (pin) => {
      if (!window.electronAPI?.appLockVerify) return false;
      const result = await window.electronAPI.appLockVerify(pin);
      if (result.success) set({ locked: false });
      return result.success;
    },

    lockNow: async () => {
      if (!get().enabled) return;
      await window.electronAPI?.appLockEngage?.();
      set({ locked: true });
    },
  };
});
