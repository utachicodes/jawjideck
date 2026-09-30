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

const isUdpListen = (e: Omit<FleetVehicleEntry, 'id'>) => e.transportType === 'udp' && e.udpMode === 'listen';

/**
 * Returns an error message if `candidate` is incomplete or would duplicate
 * an existing roster entry's connection endpoint, or `null` if it's valid.
 * `excludeId` skips the entry being edited.
 */
export function validateNewEntry(
  entries: FleetVehicleEntry[],
  candidate: Omit<FleetVehicleEntry, 'id'>,
  excludeId?: string,
): string | null {
  if (!candidate.name?.trim()) return 'Name is required';
  if (candidate.transportType === 'serial') {
    if (!candidate.serialPath) return 'Choose a serial port';
  } else {
    if (!Number.isInteger(candidate.port) || candidate.port! < 1 || candidate.port! > 65535) return 'Port must be 1-65535';
    if (!isUdpListen(candidate) && !candidate.host?.trim()) return 'Host is required';
  }
  if (candidate.systemId !== undefined && (!Number.isInteger(candidate.systemId) || candidate.systemId < 1 || candidate.systemId > 255)) {
    return 'System ID must be 1-255';
  }

  const duplicate = entries.some((e) => {
    if (e.id === excludeId || e.transportType !== candidate.transportType) return false;
    if (candidate.transportType === 'serial') return e.serialPath === candidate.serialPath;
    // Two listeners can't share a local port, whatever host they name
    if (isUdpListen(candidate) || isUdpListen(e)) {
      return isUdpListen(candidate) && isUdpListen(e) && e.port === candidate.port;
    }
    return e.host === candidate.host && e.port === candidate.port;
  });
  if (duplicate) {
    if (candidate.transportType === 'serial') return `A vehicle on ${candidate.serialPath} is already in the roster`;
    if (isUdpListen(candidate)) return `A vehicle already listens on UDP port ${candidate.port}`;
    return `A vehicle at ${candidate.host}:${candidate.port} is already in the roster`;
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
