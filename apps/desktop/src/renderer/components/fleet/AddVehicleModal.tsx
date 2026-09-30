/**
 * AddVehicleModal — form for adding a vehicle to the fleet roster, or
 * editing an existing entry. Covers firmware, vehicle type, connection
 * (serial port picker, UDP listen/connect, TCP), an optional system ID for
 * shared links, and a connection test that fills in what it detects.
 */

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react';
import { useFleetStore } from '../../stores/fleet-store';
import { formatPortDisplayName, isSystemPort } from '../../utils/usb-device-names';
import type { SerialPortInfo } from '@jawji/comms';
import type { FleetVehicleEntry, FleetFirmware, FleetVehicleType, FleetTestResult } from '../../../shared/ipc-channels';
import {
  FLEET_FIRMWARE_LABELS,
  FLEET_VEHICLE_TYPE_LABELS,
  FLEET_COLORS,
  protocolForFirmware,
} from '../../../shared/fleet-vehicle';

interface AddVehicleModalProps {
  editingEntry: FleetVehicleEntry | null;
  onClose: () => void;
}

type TransportType = FleetVehicleEntry['transportType'];
type UdpMode = 'listen' | 'client';

const BAUD_RATES = [57600, 115200, 230400, 460800, 921600, 38400, 19200, 9600];

const PRESETS: ReadonlyArray<{ label: string; hint: string; apply: { transportType: TransportType; udpMode?: UdpMode; host?: string; port?: number; baudRate?: number } }> = [
  { label: 'Telemetry radio', hint: 'USB radio, 57600 baud', apply: { transportType: 'serial', baudRate: 57600 } },
  { label: 'Wi-Fi / companion', hint: 'Listen on UDP 14550', apply: { transportType: 'udp', udpMode: 'listen', port: 14550 } },
  { label: 'SITL', hint: 'TCP 127.0.0.1:5760', apply: { transportType: 'tcp', host: '127.0.0.1', port: 5760 } },
];

const inputClass = 'px-3 py-2 rounded-lg bg-surface border border-subtle text-content text-sm w-full min-w-0';

function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-subtle bg-surface p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            value === o.value ? 'bg-blue-600 text-white' : 'text-content-secondary hover:text-content hover:bg-surface-raised'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-xs text-content-secondary">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-400">{error}</span> : hint ? <span className="text-xs text-content-tertiary">{hint}</span> : null}
    </label>
  );
}

function defaultFirmware(entry: FleetVehicleEntry | null): FleetFirmware {
  if (entry?.firmware) return entry.firmware;
  return entry?.protocol === 'msp' ? 'betaflight' : 'ardupilot';
}

export function AddVehicleModal({ editingEntry, onClose }: AddVehicleModalProps) {
  const addVehicle = useFleetStore((s) => s.addVehicle);
  const updateVehicle = useFleetStore((s) => s.updateVehicle);
  const roster = useFleetStore((s) => s.roster);

  const [name, setName] = useState(editingEntry?.name ?? '');
  const [firmware, setFirmware] = useState<FleetFirmware>(defaultFirmware(editingEntry));
  const [vehicleType, setVehicleType] = useState<FleetVehicleType>(editingEntry?.vehicleType ?? 'copter');
  const [color, setColor] = useState(editingEntry?.color ?? FLEET_COLORS[roster.length % FLEET_COLORS.length]!);
  const [transportType, setTransportType] = useState<TransportType>(editingEntry?.transportType ?? 'serial');
  // Entries saved before listen mode existed were UDP clients
  const [udpMode, setUdpMode] = useState<UdpMode>(editingEntry ? editingEntry.udpMode ?? 'client' : 'listen');
  const [host, setHost] = useState(editingEntry?.host ?? '127.0.0.1');
  const [port, setPort] = useState(String(editingEntry?.port ?? 14550));
  const [serialPath, setSerialPath] = useState(editingEntry?.serialPath ?? '');
  const [baudRate, setBaudRate] = useState(editingEntry?.baudRate ?? 57600);
  const [systemId, setSystemId] = useState(editingEntry?.systemId !== undefined ? String(editingEntry.systemId) : '');
  const [notes, setNotes] = useState(editingEntry?.notes ?? '');
  const [showAdvanced, setShowAdvanced] = useState(Boolean(editingEntry?.systemId || editingEntry?.notes));

  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [loadingPorts, setLoadingPorts] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<FleetTestResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const refreshPorts = async () => {
    setLoadingPorts(true);
    try {
      const list = (await window.electronAPI.listPorts()).filter((p) => !isSystemPort(p));
      setPorts(list);
      setSerialPath((current) => current || list[0]?.path || '');
    } finally {
      setLoadingPorts(false);
    }
  };

  useEffect(() => {
    if (transportType === 'serial') void refreshPorts();
  }, [transportType]);

  const isListen = transportType === 'udp' && udpMode === 'listen';
  const portNum = Number(port);
  const sysidNum = systemId.trim() === '' ? undefined : Number(systemId);

  const errors = {
    name: name.trim() ? null : 'Give the vehicle a name',
    serialPath: transportType === 'serial' && !serialPath ? 'Choose a serial port' : null,
    port: transportType !== 'serial' && !(Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535) ? 'Port must be 1-65535' : null,
    host: transportType !== 'serial' && !isListen && !host.trim() ? 'Enter a host or IP address' : null,
    systemId: sysidNum !== undefined && !(Number.isInteger(sysidNum) && sysidNum >= 1 && sysidNum <= 255) ? 'System ID must be 1-255' : null,
  };
  const connectionValid = !errors.serialPath && !errors.port && !errors.host && !errors.systemId;
  const valid = connectionValid && !errors.name;

  const candidate = useMemo((): Omit<FleetVehicleEntry, 'id'> => {
    const base = {
      name: name.trim(),
      protocol: protocolForFirmware(firmware),
      firmware,
      vehicleType,
      color,
      transportType,
      ...(sysidNum !== undefined && protocolForFirmware(firmware) === 'mavlink' ? { systemId: sysidNum } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    if (transportType === 'serial') return { ...base, serialPath, baudRate };
    if (transportType === 'udp') return { ...base, udpMode, port: portNum, ...(isListen ? {} : { host: host.trim() }) };
    return { ...base, host: host.trim(), port: portNum };
  }, [name, firmware, vehicleType, color, transportType, sysidNum, notes, serialPath, baudRate, udpMode, portNum, isListen, host]);

  // A test result describes the connection it was run on; drop it when that changes
  // (firmware is left out: a successful test sets it)
  useEffect(() => { setTestResult(null); }, [transportType, udpMode, host, port, serialPath, baudRate, systemId]);

  const applyPreset = (preset: (typeof PRESETS)[number]['apply']) => {
    setTransportType(preset.transportType);
    if (preset.udpMode) setUdpMode(preset.udpMode);
    if (preset.host) setHost(preset.host);
    if (preset.port) setPort(String(preset.port));
    if (preset.baudRate) setBaudRate(preset.baudRate);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await window.electronAPI.fleetTestConnection(candidate, editingEntry?.id);
    setTesting(false);
    setTestResult(result);
    if (result.success) {
      if (result.firmware) setFirmware(result.firmware);
      if (result.vehicleType) setVehicleType(result.vehicleType);
    }
  };

  const handleSubmit = async () => {
    setTouched(true);
    if (!valid) return;
    setSaving(true);
    setSubmitError(null);
    const result = editingEntry
      ? await updateVehicle(editingEntry.id, {
          ...candidate,
          // Clear optional fields the user removed
          systemId: candidate.systemId,
          notes: candidate.notes,
          ...(candidate.transportType !== 'serial' ? { serialPath: undefined, baudRate: undefined } : { host: undefined, port: undefined, udpMode: undefined }),
          ...(isListen ? { host: undefined } : {}),
        })
      : await addVehicle(candidate);
    setSaving(false);
    if (!result.success) {
      setSubmitError(result.error ?? 'Failed to save vehicle');
      return;
    }
    onClose();
  };

  const selectedPortMissing = serialPath && !ports.some((p) => p.path === serialPath);
  const isMavlink = protocolForFirmware(firmware) === 'mavlink';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-raised rounded-xl border border-subtle w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-full">
        <div className="px-6 py-4 border-b border-subtle shrink-0">
          <h2 className="text-lg font-semibold text-content">{editingEntry ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5 overflow-y-auto">
          {!editingEntry && (
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.apply)}
                  className="text-left px-3 py-2 rounded-lg border border-subtle bg-surface hover:bg-surface-raised hover:border-default transition-colors min-w-0"
                >
                  <div className="text-xs font-semibold text-content truncate">{p.label}</div>
                  <div className="text-[11px] text-content-tertiary truncate">{p.hint}</div>
                </button>
              ))}
            </div>
          )}

          <section className="flex flex-col gap-3">
            <Field label="Name" error={touched ? errors.name : null}>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Survey Quad 1" className={inputClass} />
            </Field>

            <Field label="Firmware">
              <Segmented
                value={firmware}
                onChange={setFirmware}
                options={(Object.keys(FLEET_FIRMWARE_LABELS) as FleetFirmware[]).map((f) => ({ value: f, label: FLEET_FIRMWARE_LABELS[f] }))}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Vehicle type">
                <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value as FleetVehicleType)} className={inputClass}>
                  {(Object.keys(FLEET_VEHICLE_TYPE_LABELS) as FleetVehicleType[]).map((t) => (
                    <option key={t} value={t}>{FLEET_VEHICLE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Color">
                <div className="flex flex-wrap gap-1.5 py-1.5">
                  {FLEET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      title={c}
                      className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </Field>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <Field label="Connection">
              <Segmented
                value={transportType}
                onChange={setTransportType}
                options={[{ value: 'serial', label: 'Serial / USB' }, { value: 'udp', label: 'UDP' }, { value: 'tcp', label: 'TCP' }]}
              />
            </Field>

            {transportType === 'serial' && (
              <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
                <Field label="Port" error={touched ? errors.serialPath : null}>
                  <div className="flex gap-2">
                    <select value={serialPath} onChange={(e) => setSerialPath(e.target.value)} className={inputClass}>
                      {ports.length === 0 && !serialPath && <option value="">No USB devices found</option>}
                      {selectedPortMissing && <option value={serialPath}>{serialPath} (not plugged in)</option>}
                      {ports.map((p) => <option key={p.path} value={p.path}>{formatPortDisplayName(p)}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={refreshPorts}
                      title="Refresh ports"
                      className="px-2.5 rounded-lg border border-subtle bg-surface text-content-secondary hover:text-content shrink-0"
                    >
                      <RefreshCw size={14} className={loadingPorts ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </Field>
                <Field label="Baud rate">
                  <select value={baudRate} onChange={(e) => setBaudRate(Number(e.target.value))} className={inputClass}>
                    {BAUD_RATES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
              </div>
            )}

            {transportType === 'udp' && (
              <>
                <Segmented
                  value={udpMode}
                  onChange={setUdpMode}
                  options={[{ value: 'listen', label: 'Listen (vehicle sends here)' }, { value: 'client', label: 'Connect to vehicle' }]}
                />
                <div className={`grid gap-3 ${isListen ? 'grid-cols-1' : 'grid-cols-[1fr_7rem]'}`}>
                  {!isListen && (
                    <Field label="Host" error={touched ? errors.host : null}>
                      <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.4.1" className={inputClass} />
                    </Field>
                  )}
                  <Field label={isListen ? 'Local port' : 'Port'} error={touched ? errors.port : null} hint={isListen ? 'Most companions and routers send to 14550' : undefined}>
                    <input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" className={inputClass} />
                  </Field>
                </div>
              </>
            )}

            {transportType === 'tcp' && (
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <Field label="Host" error={touched ? errors.host : null}>
                  <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="127.0.0.1" className={inputClass} />
                </Field>
                <Field label="Port" error={touched ? errors.port : null}>
                  <input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" className={inputClass} />
                </Field>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleTest}
                disabled={!connectionValid || testing}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-subtle bg-surface text-sm font-medium text-content hover:bg-surface-raised disabled:opacity-40 shrink-0"
              >
                {testing && <Loader2 size={14} className="animate-spin" />}
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              {testResult && (
                <span className={`flex items-center gap-1.5 text-xs min-w-0 ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                  {testResult.success ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                  <span className="truncate">
                    {testResult.success
                      ? `Found ${[testResult.firmware && FLEET_FIRMWARE_LABELS[testResult.firmware], testResult.vehicleType && FLEET_VEHICLE_TYPE_LABELS[testResult.vehicleType]].filter(Boolean).join(' ') || 'vehicle'}${testResult.systemId ? `, system ${testResult.systemId}` : ''}`
                      : testResult.error}
                  </span>
                </span>
              )}
            </div>
          </section>

          <section>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-content-secondary hover:text-content"
            >
              <ChevronDown size={14} className={`transition-transform ${showAdvanced ? '' : '-rotate-90'}`} />
              Advanced
            </button>
            {showAdvanced && (
              <div className="flex flex-col gap-3 mt-3">
                {isMavlink && (
                  <Field
                    label="System ID"
                    error={errors.systemId}
                    hint="Only track this MAVLink system. Leave empty to use the first vehicle heard."
                  >
                    <input
                      value={systemId}
                      onChange={(e) => setSystemId(e.target.value)}
                      placeholder={testResult?.systemId ? `Detected: ${testResult.systemId}` : 'Any'}
                      inputMode="numeric"
                      className={inputClass}
                    />
                  </Field>
                )}
                <Field label="Notes">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Frame, owner, payload…" className={`${inputClass} resize-none`} />
                </Field>
              </div>
            )}
          </section>

          {submitError && <p className="text-red-400 text-sm">{submitError}</p>}
        </div>

        <div className="px-6 py-4 border-t border-subtle flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-surface-raised hover:bg-surface text-content rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || (touched && !valid)} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
            {saving ? 'Saving…' : editingEntry ? 'Save' : 'Add Vehicle'}
          </button>
        </div>
      </div>
    </div>
  );
}
