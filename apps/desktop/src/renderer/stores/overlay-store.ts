import { create } from 'zustand';
import type { OverlayId, AirspaceData, AirportData, RainViewerMeta } from '../../shared/overlay-types';

interface OverlayStore {
  // Toggle state
  activeOverlays: Set<OverlayId>;
  toggleOverlay: (id: OverlayId) => void;

  // Radar
  radarMeta: RainViewerMeta | null;
  fetchRadarMeta: () => Promise<void>;

  // Airspace & airports
  airspaceData: AirspaceData[];
  airportData: AirportData[];
  fetchOverlayData: (lat: number, lon: number, zoom: number) => Promise<void>;

  // API key state
  openaipKeyMissing: boolean;
  showApiKeyDialog: boolean;
  setShowApiKeyDialog: (show: boolean) => void;
  checkApiKey: () => Promise<boolean>;

  // Throttling state
  _lastFetchPos: { lat: number; lon: number; zoom: number } | null;
  _lastFetchTime: number;
}

const MIN_FETCH_INTERVAL = 30_000; // 30s
const MIN_POSITION_DELTA_KM = 10;
const MIN_ZOOM_DELTA = 1.5;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const useOverlayStore = create<OverlayStore>((set, get) => ({
  activeOverlays: new Set(),
  radarMeta: null,
  airspaceData: [],
  airportData: [],
  openaipKeyMissing: false,
  showApiKeyDialog: false,
  _lastFetchPos: null,
  _lastFetchTime: 0,

  toggleOverlay: (id) => {
    const state = get();
    const current = new Set(state.activeOverlays);
    if (current.has(id)) {
      current.delete(id);
    } else {
      // If enabling an OpenAIP overlay, check for API key first
      if ((id === 'airspace' || id === 'airports') && state.openaipKeyMissing) {
        set({ showApiKeyDialog: true });
        return;
      }
      current.add(id);
    }
    set({ activeOverlays: current });
  },

  setShowApiKeyDialog: (show) => set({ showApiKeyDialog: show }),

  checkApiKey: async () => {
    const result = await window.electronAPI.getApiKey('openaip');
    const missing = !result?.hasKey;
    set({ openaipKeyMissing: missing });
    return !missing;
  },

  fetchRadarMeta: async () => {
    try {
      const meta = await window.electronAPI.getRadarMeta();
      if (meta) set({ radarMeta: meta as RainViewerMeta });
    } catch {
      // Ignore — keep stale meta
    }
  },

  fetchOverlayData: async (lat, lon, zoom) => {
    const state = get();
    const now = Date.now();
    const hasAirspace = state.activeOverlays.has('airspace');
    const hasAirports = state.activeOverlays.has('airports');

    if (!hasAirspace && !hasAirports) return;

    // Throttle: skip if too recent
    if (now - state._lastFetchTime < MIN_FETCH_INTERVAL) return;

    // Skip if position hasn't changed enough
    if (state._lastFetchPos) {
      const dist = haversineKm(lat, lon, state._lastFetchPos.lat, state._lastFetchPos.lon);
      const zoomDelta = Math.abs(zoom - state._lastFetchPos.zoom);
      if (dist < MIN_POSITION_DELTA_KM && zoomDelta < MIN_ZOOM_DELTA) return;
    }

    set({ _lastFetchPos: { lat, lon, zoom }, _lastFetchTime: now });

    const params = { lat, lon, zoom };

    try {
      const [airspaceResult, airportResult] = await Promise.all([
        hasAirspace ? window.electronAPI.getAirspace(params) : null,
        hasAirports ? window.electronAPI.getAirports(params) : null,
      ]);

      if (airspaceResult) {
        const res = airspaceResult as { error?: string; data: AirspaceData[] };
        if (res.error === 'no-key') {
          set({ openaipKeyMissing: true, showApiKeyDialog: true });
          return;
        }
        set({ airspaceData: res.data });
      }

      if (airportResult) {
        const res = airportResult as { error?: string; data: AirportData[] };
        if (res.error === 'no-key') {
          set({ openaipKeyMissing: true, showApiKeyDialog: true });
          return;
        }
        set({ airportData: res.data });
      }
    } catch {
      // Ignore fetch errors — keep stale data
    }
  },
}));
