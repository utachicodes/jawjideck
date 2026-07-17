import { create } from 'zustand';
import type { MissionSummary, SaveMissionPayload } from '../../shared/mission-library-types';
import type { Group } from '../../shared/mission-group-types';
import type { MissionItem } from '../../shared/mission-types';
import { apiFetch } from '../lib/api-fetch';
import { useMissionLibraryStore } from './mission-library-store';

export interface SyncedMission {
  id: string;
  name: string;
  description: string;
  vehicleProfileId: string | null;
  tags: string[];
  waypointCount: number;
  totalDistanceMeters: number;
  boundingBox: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null;
  version?: number;
  groups: unknown[];
  items: unknown[];
  homePosition: { lat: number; lon: number; alt: number } | null;
  createdAt: string;
  updatedAt: number;
  deleted: boolean;
}

export interface SyncedSettings {
  uid: string;
  payload: Record<string, unknown>;
  updatedAt: number;
}

export interface MergePlan {
  /** Local missions to POST to the server (new locally, or newer than the remote copy). */
  toPush: MissionSummary[];
  /** Remote missions to save locally (new remotely, or newer than the local copy). */
  toPull: SyncedMission[];
  /** Mission ids to delete locally because a newer remote tombstone exists. */
  toDeleteLocally: string[];
}

/**
 * Last-write-wins merge plan between the local mission library and the
 * server's synced missions. Pure and side-effect free so it can be unit
 * tested without touching IPC or the network — see sync-store.test.ts.
 */
export function planMissionMerge(local: MissionSummary[], remote: SyncedMission[]): MergePlan {
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const localById = new Map(local.map((l) => [l.id, l]));
  const toPush: MissionSummary[] = [];
  const toPull: SyncedMission[] = [];
  const toDeleteLocally: string[] = [];

  for (const l of local) {
    const r = remoteById.get(l.id);
    if (!r) {
      toPush.push(l);
      continue;
    }
    const localUpdatedAt = new Date(l.updatedAt).getTime();
    if (r.updatedAt > localUpdatedAt) {
      if (r.deleted) toDeleteLocally.push(l.id);
      else toPull.push(r);
    } else if (localUpdatedAt > r.updatedAt) {
      toPush.push(l);
    }
    // Equal timestamps: already in sync, nothing to do.
  }

  for (const r of remote) {
    if (r.deleted) continue;
    if (!localById.has(r.id)) toPull.push(r);
  }

  return { toPush, toPull, toDeleteLocally };
}

function syncedMissionToPayload(m: SyncedMission): SaveMissionPayload {
  return {
    name: m.name,
    description: m.description,
    vehicleProfileId: m.vehicleProfileId,
    tags: m.tags,
    groups: m.groups as Group[],
    items: m.items as MissionItem[],
    homePosition: m.homePosition,
    existingId: m.id,
  };
}

function localMissionToSyncedPayload(m: import('../../shared/mission-library-types').StoredMission): Omit<SyncedMission, 'updatedAt' | 'deleted'> {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    vehicleProfileId: m.vehicleProfileId,
    tags: m.tags,
    waypointCount: m.waypointCount,
    totalDistanceMeters: m.totalDistanceMeters,
    boundingBox: m.boundingBox,
    version: m.version,
    groups: m.groups,
    items: m.items,
    homePosition: m.homePosition,
    createdAt: m.createdAt,
  };
}

interface SyncState {
  syncing: boolean;
  lastSyncedAt: number | null;
  error: string | null;
  syncMissions: () => Promise<void>;
  syncSettings: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set) => ({
  syncing: false,
  lastSyncedAt: null,
  error: null,

  syncMissions: async () => {
    set({ syncing: true, error: null });
    try {
      const { missions: remote } = await apiFetch<{ missions: SyncedMission[] }>('/api/sync/missions');
      const local = useMissionLibraryStore.getState().missions;
      const plan = planMissionMerge(local, remote);

      for (const r of plan.toPull) {
        await window.electronAPI.missionLibrarySave(syncedMissionToPayload(r));
      }
      for (const id of plan.toDeleteLocally) {
        await window.electronAPI.missionLibraryDelete(id);
      }
      for (const l of plan.toPush) {
        const full = await window.electronAPI.missionLibraryGet(l.id);
        if (full) {
          await apiFetch('/api/sync/missions', {
            method: 'POST',
            body: JSON.stringify(localMissionToSyncedPayload(full)),
          });
        }
      }

      if (plan.toPull.length || plan.toDeleteLocally.length) {
        await useMissionLibraryStore.getState().loadMissions();
      }
      set({ syncing: false, lastSyncedAt: Date.now() });
    } catch (err) {
      set({ syncing: false, error: err instanceof Error ? err.message : 'Mission sync failed' });
    }
  },

  syncSettings: async () => {
    set({ syncing: true, error: null });
    try {
      const local = await window.electronAPI.getSettings();
      const { settings: remote } = await apiFetch<{ settings: SyncedSettings | null }>('/api/sync/settings');
      const localUpdatedAt = local.settingsUpdatedAt ?? 0;

      if (!remote || localUpdatedAt >= remote.updatedAt) {
        await apiFetch('/api/sync/settings', {
          method: 'PUT',
          body: JSON.stringify({ payload: local }),
        });
      } else {
        await window.electronAPI.saveSettings(remote.payload as unknown as import('../../shared/ipc-channels').SettingsStoreSchema);
      }
      set({ syncing: false, lastSyncedAt: Date.now() });
    } catch (err) {
      set({ syncing: false, error: err instanceof Error ? err.message : 'Settings sync failed' });
    }
  },
}));
