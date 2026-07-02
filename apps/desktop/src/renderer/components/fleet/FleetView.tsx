/**
 * FleetView — lightweight overview of every vehicle in the roster: status
 * tiles (armed/mode/battery/last-seen) plus a shared map. Focusing a
 * vehicle here hands it the main connection so every other view (Mission
 * Planning, Parameters, etc.) operates on it, exactly as today.
 */

import { useEffect, useState } from 'react';
import { useFleetStore } from '../../stores/fleet-store';
import { useConnectionStore } from '../../stores/connection-store';
import { FleetMapPanel } from './FleetMapPanel';
import { AddVehicleModal } from './AddVehicleModal';
import type { FleetVehicleEntry } from '../../../shared/ipc-channels';
import { Plus, Pencil, Trash2, Radio } from 'lucide-react';

function connectOptionsFor(entry: FleetVehicleEntry) {
  if (entry.transportType === 'serial') {
    return { type: 'serial' as const, port: entry.serialPath, baudRate: entry.baudRate, protocol: entry.protocol };
  }
  if (entry.transportType === 'tcp') {
    return { type: 'tcp' as const, host: entry.host, tcpPort: entry.port, protocol: entry.protocol };
  }
  return { type: 'udp' as const, udpMode: 'client' as const, udpRemoteHost: entry.host, udpRemotePort: entry.port, protocol: entry.protocol };
}

function VehicleTile({ entry, isFocused, onFocus, onEdit, onRemove }: {
  entry: FleetVehicleEntry;
  isFocused: boolean;
  onFocus: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const status = useFleetStore((s) => s.statusByVehicleId[entry.id]);
  const connected = isFocused || status?.connected;

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${isFocused ? 'border-blue-500/60 bg-blue-500/5' : 'border-subtle bg-surface'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : status?.error ? 'bg-red-400' : 'bg-content-tertiary'}`} />
          <span className="font-semibold text-content">{entry.name}</span>
          {isFocused && <span className="text-[10px] uppercase tracking-wide text-blue-400 font-bold">Focused</span>}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} title="Edit" className="p-1.5 rounded-lg text-content-tertiary hover:text-content hover:bg-surface-raised"><Pencil size={14} /></button>
          <button onClick={onRemove} title="Remove" className="p-1.5 rounded-lg text-content-tertiary hover:text-red-400 hover:bg-surface-raised"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="text-xs text-content-secondary">
        {entry.protocol.toUpperCase()} · {entry.transportType === 'serial' ? entry.serialPath : `${entry.host}:${entry.port}`}
      </div>

      {status?.error && <div className="text-xs text-red-400">{status.error}</div>}

      {!isFocused && status && (
        <div className="flex items-center gap-3 text-xs text-content-secondary">
          <span>{status.armed ? 'Armed' : 'Disarmed'}</span>
          {status.batteryVoltage != null && <span>{status.batteryVoltage.toFixed(1)}V</span>}
          {status.batteryPercent != null && <span>{status.batteryPercent}%</span>}
        </div>
      )}

      <button
        onClick={onFocus}
        disabled={isFocused}
        className="mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-40 disabled:cursor-not-allowed text-blue-300"
      >
        <Radio size={12} /> {isFocused ? 'Focused' : 'Focus'}
      </button>
    </div>
  );
}

export function FleetView() {
  const roster = useFleetStore((s) => s.roster);
  const loadRoster = useFleetStore((s) => s.loadRoster);
  const subscribeToStatus = useFleetStore((s) => s.subscribeToStatus);
  const focusVehicle = useFleetStore((s) => s.focusVehicle);
  const removeVehicle = useFleetStore((s) => s.removeVehicle);
  const focusedVehicleId = useFleetStore((s) => s.focusedVehicleId);
  const connectionState = useConnectionStore((s) => s.connectionState);

  const [modalEntry, setModalEntry] = useState<FleetVehicleEntry | null | 'new'>(null);

  useEffect(() => {
    loadRoster();
    const unsubscribe = subscribeToStatus();
    return unsubscribe;
  }, [loadRoster, subscribeToStatus]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
        <h1 className="text-lg font-semibold text-content">Fleet</h1>
        <button
          onClick={() => setModalEntry('new')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
        >
          <Plus size={14} /> Add Vehicle
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-96 overflow-y-auto p-4 flex flex-col gap-3 border-r border-subtle">
          {roster.length === 0 && (
            <p className="text-sm text-content-secondary p-4 text-center">No vehicles in the fleet yet. Add one to start monitoring it.</p>
          )}
          {roster.map((entry) => (
            <VehicleTile
              key={entry.id}
              entry={entry}
              isFocused={connectionState.isConnected && entry.id === focusedVehicleId}
              onFocus={() => focusVehicle(entry, connectOptionsFor(entry))}
              onEdit={() => setModalEntry(entry)}
              onRemove={() => removeVehicle(entry.id)}
            />
          ))}
        </div>

        <div className="flex-1">
          <FleetMapPanel />
        </div>
      </div>

      {modalEntry !== null && (
        <AddVehicleModal
          editingEntry={modalEntry === 'new' ? null : modalEntry}
          onClose={() => setModalEntry(null)}
        />
      )}
    </div>
  );
}
