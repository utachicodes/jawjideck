import { create } from 'zustand';
import type { InstalledModule, ModuleProgress, UpdateAvailable } from '../../shared/module-types.js';

interface ModuleState {
  // State
  modules: InstalledModule[];
  isLoading: boolean;
  error: string | null;
  activating: boolean;
  progress: ModuleProgress | null;
  updates: UpdateAvailable[];

  // Actions
  loadModules: () => Promise<void>;
  activateLicense: (key: string) => Promise<{ success: boolean; error?: string }>;
  removeLicense: (key: string) => Promise<void>;
  checkUpdates: () => Promise<void>;
  setProgress: (progress: ModuleProgress | null) => void;
  clearError: () => void;
}

export const useModuleStore = create<ModuleState>((set, get) => ({
  modules: [],
  isLoading: false,
  error: null,
  activating: false,
  progress: null,
  updates: [],

  loadModules: async () => {
    set({ isLoading: true, error: null });
    try {
      const modules = await window.electronAPI.moduleList();
      set({ modules, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, isLoading: false });
    }
  },

  activateLicense: async (key: string) => {
    set({ activating: true, error: null, progress: null });
    try {
      const result = await window.electronAPI.moduleActivate(key);
      if (!result.success) {
        set({ activating: false, error: result.error || 'Activation failed' });
        return result;
      }
      // Refresh module list
      await get().loadModules();
      set({ activating: false });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ activating: false, error: message });
      return { success: false, error: message };
    }
  },

  removeLicense: async (key: string) => {
    set({ error: null });
    try {
      await window.electronAPI.moduleRemove(key);
      await get().loadModules();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    }
  },

  checkUpdates: async () => {
    try {
      const updates = await window.electronAPI.moduleCheckUpdates();
      set({ updates });
    } catch (err) {
      console.error('[ModuleStore] Update check failed:', err);
    }
  },

  setProgress: (progress) => set({ progress }),

  clearError: () => set({ error: null }),
}));
