/**
 * Fleet Roster — persisted list of vehicles available for lightweight fleet
 * monitoring. Separate from the main connection layer entirely; this module
 * only tracks *which* vehicles exist and their connection info, not whether
 * they're currently connected.
 */

import Store from 'electron-store';
import { randomUUID } from 'node:crypto';
import type { FleetVehicleEntry } from '../../shared/ipc-channels.js';

interface FleetRosterSchema {
  vehicles: FleetVehicleEntry[];
}

const rosterStore = new Store<FleetRosterSchema>({
  name: 'fleet-roster',
  defaults: { vehicles: [] },
});

/**
 * Returns an error message if `candidate` would duplicate an existing
 * roster entry's connection endpoint, or `null` if it's valid to add.
 */
export function validateNewEntry(entries: FleetVehicleEntry[], candidate: Omit<FleetVehicleEntry, 'id'>): string | null {
  const duplicate = entries.some((e) => {
    if (e.transportType !== candidate.transportType) return false;
    if (candidate.transportType === 'serial') {
      return e.serialPath === candidate.serialPath;
    }
    return e.host === candidate.host && e.port === candidate.port;
  });
  if (duplicate) {
    return candidate.transportType === 'serial'
      ? `A vehicle on ${candidate.serialPath} is already in the roster`
      : `A vehicle at ${candidate.host}:${candidate.port} is already in the roster`;
  }
  return null;
}

export function getRoster(): FleetVehicleEntry[] {
  return rosterStore.get('vehicles', []);
}

export function addVehicle(candidate: Omit<FleetVehicleEntry, 'id'>): FleetVehicleEntry {
  const entry: FleetVehicleEntry = { ...candidate, id: randomUUID() };
  const vehicles = [...getRoster(), entry];
  rosterStore.set('vehicles', vehicles);
  return entry;
}

export function updateVehicle(id: string, patch: Partial<Omit<FleetVehicleEntry, 'id'>>): FleetVehicleEntry | null {
  const vehicles = getRoster();
  const idx = vehicles.findIndex((v) => v.id === id);
  if (idx === -1) return null;
  const updated: FleetVehicleEntry = { ...vehicles[idx]!, ...patch };
  const next = [...vehicles];
  next[idx] = updated;
  rosterStore.set('vehicles', next);
  return updated;
}

export function removeVehicle(id: string): void {
  rosterStore.set('vehicles', getRoster().filter((v) => v.id !== id));
}

/** Test-only: clear the roster. Not exported from the module's public API surface used by production code. */
export function _resetRosterForTests(): void {
  rosterStore.set('vehicles', []);
}
