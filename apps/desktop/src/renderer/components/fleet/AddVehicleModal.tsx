/**
 * AddVehicleModal — form for adding a vehicle to the fleet roster, or
 * editing an existing entry. Same connection fields as the main Connect
 * panel (protocol, transport, host/port or serial path/baud).
 */

import { useState } from 'react';
import { useFleetStore } from '../../stores/fleet-store';
import type { FleetVehicleEntry } from '../../../shared/ipc-channels';

interface AddVehicleModalProps {
  editingEntry: FleetVehicleEntry | null;
  onClose: () => void;
}

export function AddVehicleModal({ editingEntry, onClose }: AddVehicleModalProps) {
  const addVehicle = useFleetStore((s) => s.addVehicle);
  const updateVehicle = useFleetStore((s) => s.updateVehicle);

  const [name, setName] = useState(editingEntry?.name ?? '');
  const [protocol, setProtocol] = useState<'mavlink' | 'msp'>(editingEntry?.protocol ?? 'mavlink');
  const [transportType, setTransportType] = useState<'tcp' | 'udp' | 'serial'>(editingEntry?.transportType ?? 'udp');
  const [host, setHost] = useState(editingEntry?.host ?? '127.0.0.1');
  const [port, setPort] = useState(String(editingEntry?.port ?? 14550));
  const [serialPath, setSerialPath] = useState(editingEntry?.serialPath ?? '');
  const [baudRate, setBaudRate] = useState(String(editingEntry?.baudRate ?? 115200));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);

    const candidate = {
      name: name.trim() || 'Unnamed Vehicle',
      protocol,
      transportType,
      ...(transportType === 'serial'
        ? { serialPath, baudRate: Number(baudRate) }
        : { host, port: Number(port) }),
    };

    if (editingEntry) {
      await updateVehicle(editingEntry.id, candidate);
      setSaving(false);
      onClose();
      return;
    }

    const result = await addVehicle(candidate);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Failed to add vehicle');
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-surface-raised rounded-xl border border-subtle w-full max-w-md mx-4 overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-subtle">
          <h2 className="text-lg font-semibold text-content">{editingEntry ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-content-secondary">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-content-secondary">Protocol</span>
            <select value={protocol} onChange={(e) => setProtocol(e.target.value as 'mavlink' | 'msp')} className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content">
              <option value="mavlink">MAVLink (ArduPilot)</option>
              <option value="msp">MSP (Betaflight/iNav)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-content-secondary">Connection</span>
            <select value={transportType} onChange={(e) => setTransportType(e.target.value as 'tcp' | 'udp' | 'serial')} className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content">
              <option value="udp">UDP</option>
              <option value="tcp">TCP</option>
              <option value="serial">Serial</option>
            </select>
          </label>

          {transportType === 'serial' ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-content-secondary">Serial Port</span>
                <input value={serialPath} onChange={(e) => setSerialPath(e.target.value)} placeholder="COM3 or /dev/ttyUSB0" className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-content-secondary">Baud Rate</span>
                <input value={baudRate} onChange={(e) => setBaudRate(e.target.value)} className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content" />
              </label>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-content-secondary">Host</span>
                <input value={host} onChange={(e) => setHost(e.target.value)} className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-content-secondary">Port</span>
                <input value={port} onChange={(e) => setPort(e.target.value)} className="px-3 py-2 rounded-lg bg-surface border border-subtle text-content" />
              </label>
            </>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-subtle flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-surface-raised hover:bg-surface text-content rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
            {saving ? 'Saving…' : editingEntry ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
