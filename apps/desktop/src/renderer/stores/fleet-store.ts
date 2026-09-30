import { create } from 'zustand';
import { useSettingsStore } from './settings-store';
import type { FleetVehicleEntry, FleetVehicleStatus, ConnectOptions } from '../../shared/ipc-channels';

interface FleetStore {
  roster: FleetVehicleEntry[];
  statusByVehicleId: Record<string, FleetVehicleStatus>;
  focusedVehicleId: string | null;

  loadRoster: () => Promise<void>;
  addVehicle: (candidate: Omit<FleetVehicleEntry, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateVehicle: (id: string, patch: Partial<Omit<FleetVehicleEntry, 'id'>>) => Promise<{ success: boolean; error?: string }>;
  removeVehicle: (id: string) => Promise<void>;
  focusVehicle: (entry: FleetVehicleEntry, connectOptions: ConnectOptions) => Promise<boolean>;
  applyStatus: (status: FleetVehicleStatus) => void;
  subscribeToStatus: () => () => void;
}

export const useFleetStore = create<FleetStore>((set, get) => ({
  roster: [],
  statusByVehicleId: {},
  focusedVehicleId: null,

  loadRoster: async () => {
    const roster = await window.electronAPI.fleetGetRoster();
    set({ roster });
  },

  addVehicle: async (candidate) => {
    const result = await window.electronAPI.fleetAddVehicle(candidate);
    if (result.success && result.entry) {
      set({ roster: [...get().roster, result.entry] });
    }
    return result;
  },

  updateVehicle: async (id, patch) => {
    const result = await window.electronAPI.fleetUpdateVehicle(id, patch);
    const updated = result.entry;
    if (result.success && updated) {
      set({ roster: get().roster.map((v) => (v.id === id ? updated : v)) });
    }
    return result;
  },

  removeVehicle: async (id) => {
    await window.electronAPI.fleetRemoveVehicle(id);
    const { [id]: _removed, ...rest } = get().statusByVehicleId;
    set({ roster: get().roster.filter((v) => v.id !== id), statusByVehicleId: rest });
  },

  focusVehicle: async (entry, connectOptions) => {
    const previousFocusedId = get().focusedVehicleId;

    // The roster's background Fleet Monitor may already hold this entry's
    // port (UDP listen, or the serial device) — release it *before*
    // connecting, or the main connection's own bind/open fails with
    // EADDRINUSE / "port busy" and focus silently does nothing.
    await window.electronAPI.fleetSetFocused(entry.id);
    await new Promise((r) => setTimeout(r, 300)); // let the monitor's socket/port close

    await window.electronAPI.disconnect();
    const success = await window.electronAPI.connect(connectOptions);
    if (success) {
      set({ focusedVehicleId: entry.id });
      // If this roster entry is linked to a Vehicle Profile, switch to it now
      // rather than waiting for the AUTOPILOT_VERSION-based auto-association
      // (useBoardProfileAssociation), so weight/battery/frame estimates are
      // right immediately instead of showing the previously-active profile.
      if (entry.vehicleProfileId) {
        useSettingsStore.getState().setActiveVehicle(entry.vehicleProfileId);
      }
    } else {
      // Connect failed — give the monitor this entry back instead of
      // leaving it both unfocused and unmonitored.
      await window.electronAPI.fleetSetFocused(previousFocusedId);
    }
    return success;
  },

  applyStatus: (status) => {
    set({ statusByVehicleId: { ...get().statusByVehicleId, [status.vehicleId]: status } });
  },

  subscribeToStatus: () => {
    return window.electronAPI.onFleetVehicleStatus((status) => {
      get().applyStatus(status);
    });
  },
}));
