import { create } from 'zustand';

export type ViewId = 'telemetry' | 'parameters' | 'mission' | 'library' | 'settings' | 'firmware' | 'cli' | 'sitl' | 'osd' | 'report' | 'calibration' | 'lua-graph' | 'modules' | 'companion' | 'logs' | 'inspector';

interface NavigationStore {
  // State
  currentView: ViewId;
  /**
   * Pending in-view scroll target. When a caller deep-links to a view (e.g. a
   * "settings" quick link from the survey panel), it sets the element id here;
   * the target view scrolls to it on mount and clears it.
   */
  scrollTarget: string | null;

  // Actions
  setView: (view: ViewId, scrollTarget?: string) => void;
  clearScrollTarget: () => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  currentView: 'telemetry',
  scrollTarget: null,

  setView: (view, scrollTarget) => set({ currentView: view, scrollTarget: scrollTarget ?? null }),
  clearScrollTarget: () => set({ scrollTarget: null }),
}));
