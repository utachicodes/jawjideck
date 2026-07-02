import { create } from 'zustand';
import type { FleetVehicleEntry, FleetVehicleStatus, ConnectOptions } from '../../shared/ipc-channels';

interface FleetStore {
  roster: FleetVehicleEntry[];
  statusByVehicleId: Record<string, FleetVehicleStatus>;
  focusedVehicleId: string | null;

  loadRoster: () => Promise<void>;
  addVehicle: (candidate: Omit<FleetVehicleEntry, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateVehicle: (id: string, patch: Partial<Omit<FleetVehicleEntry, 'id'>>) => Promise<void>;
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
    const updated = await window.electronAPI.fleetUpdateVehicle(id, patch);
    if (updated) {
      set({ roster: get().roster.map((v) => (v.id === id ? updated : v)) });
    }
  },

  removeVehicle: async (id) => {
    await window.electronAPI.fleetRemoveVehicle(id);
    const { [id]: _removed, ...rest } = get().statusByVehicleId;
    set({ roster: get().roster.filter((v) => v.id !== id), statusByVehicleId: rest });
  },

  focusVehicle: async (entry, connectOptions) => {
    await window.electronAPI.disconnect();
    const success = await window.electronAPI.connect(connectOptions);
    if (success) {
      await window.electronAPI.fleetSetFocused(entry.id);
      set({ focusedVehicleId: entry.id });
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
