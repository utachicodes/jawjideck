/**
 * Fleet management IPC wiring. Owns the set of active Fleet Monitor
 * connections — one per roster vehicle that is not currently focused.
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { FleetVehicleEntry } from '../../shared/ipc-channels.js';
import { getAllWindows } from '../window-manager.js';
import { getRoster, addVehicle, updateVehicle, removeVehicle, validateNewEntry } from './fleet-roster.js';
import { startMonitor, type FleetMonitorHandle } from './fleet-monitor.js';

const activeMonitors = new Map<string, FleetMonitorHandle>();
let focusedVehicleId: string | null = null;

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of getAllWindows()) {
    if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }
}

function stopMonitor(vehicleId: string): void {
  activeMonitors.get(vehicleId)?.stop();
  activeMonitors.delete(vehicleId);
}

function startMonitorFor(entry: FleetVehicleEntry): void {
  if (activeMonitors.has(entry.id)) return;
  const handle = startMonitor(entry, (status) => {
    broadcast(IPC_CHANNELS.FLEET_VEHICLE_STATUS, status);
  });
  activeMonitors.set(entry.id, handle);
}

/** Start monitors for every roster vehicle except the currently-focused one. */
function syncMonitors(): void {
  const roster = getRoster();
  const rosterIds = new Set(roster.map((v) => v.id));

  for (const id of activeMonitors.keys()) {
    if (!rosterIds.has(id)) stopMonitor(id);
  }
  for (const entry of roster) {
    if (entry.id === focusedVehicleId) {
      stopMonitor(entry.id);
    } else {
      startMonitorFor(entry);
    }
  }
}

export function registerFleetHandlers(_mainWindow: BrowserWindow): void {
  syncMonitors();

  ipcMain.handle(IPC_CHANNELS.FLEET_GET_ROSTER, async () => {
    return getRoster();
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_ADD_VEHICLE, async (_, candidate: Omit<FleetVehicleEntry, 'id'>) => {
    const error = validateNewEntry(getRoster(), candidate);
    if (error) return { success: false, error };
    const entry = addVehicle(candidate);
    syncMonitors();
    return { success: true, entry };
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_UPDATE_VEHICLE, async (_, id: string, patch: Partial<Omit<FleetVehicleEntry, 'id'>>) => {
    stopMonitor(id);
    const updated = updateVehicle(id, patch);
    syncMonitors();
    return updated;
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_REMOVE_VEHICLE, async (_, id: string) => {
    stopMonitor(id);
    removeVehicle(id);
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_SET_FOCUSED, async (_, vehicleId: string | null) => {
    focusedVehicleId = vehicleId;
    syncMonitors();
  });
}
