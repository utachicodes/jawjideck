import { useState } from 'react';
import { Pencil, ChevronDown, Plus, Check, X, FolderOpen } from 'lucide-react';
import { useSettingsStore, type VehicleProfile, type VehicleType } from '../../stores/settings-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useParameterStore } from '../../stores/parameter-store';
import { VEHICLE_ICONS, VEHICLE_TYPE_NAMES, VEHICLE_TYPE_ORDER } from '../../lib/vehicle-icons';

function typeSpecLabel(p: VehicleProfile): string | null {
  switch (p.type) {
    case 'copter': return p.frameSize ? `${p.frameSize}mm frame` : null;
    case 'plane': return p.wingspan ? `${p.wingspan}mm wingspan` : null;
    case 'vtol': return p.wingspan ? `${p.wingspan}mm wingspan` : p.frameSize ? `${p.frameSize}mm frame` : null;
    case 'rover': return p.wheelbase ? `${p.wheelbase}mm wheelbase` : null;
    case 'boat': return p.hullLength ? `${p.hullLength}mm hull` : null;
    case 'sub': return p.maxDepth ? `${p.maxDepth}m depth rating` : null;
    default: return null;
  }
}

function formatMinutes(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  return `${Math.round(seconds / 60)} min`;
}

interface EditForm {
  name: string;
  weight: number;
  batteryCells: number;
  batteryCapacity: number;
}

/**
 * Active-vehicle panel for the disconnected landing screen. Lets the user see
 * and tweak their vehicle profile, switch profiles, add a new one, or import
 * a .param file — all without needing a connection first.
 */
export function LandingVehiclePanel() {
  const vehicles = useSettingsStore((s) => s.vehicles);
  const activeVehicleId = useSettingsStore((s) => s.activeVehicleId);
  const setActiveVehicle = useSettingsStore((s) => s.setActiveVehicle);
  const addVehicle = useSettingsStore((s) => s.addVehicle);
  const updateVehicle = useSettingsStore((s) => s.updateVehicle);
  const getEstimatedFlightTime = useSettingsStore((s) => s.getEstimatedFlightTime);
  const setView = useNavigationStore((s) => s.setView);
  const loadOfflineFile = useParameterStore((s) => s.loadOfflineFile);

  const [mode, setMode] = useState<'view' | 'edit' | 'switch' | 'new-type'>('view');
  const [form, setForm] = useState<EditForm | null>(null);

  const active = vehicles.find((v) => v.id === activeVehicleId) || vehicles[0] || null;
  if (!active) return null;

  const startEdit = () => {
    setForm({
      name: active.name,
      weight: active.weight,
      batteryCells: active.batteryCells,
      batteryCapacity: active.batteryCapacity,
    });
    setMode('edit');
  };

  const saveEdit = () => {
    if (!form) return;
    updateVehicle(active.id, {
      name: form.name.trim() || active.name,
      weight: form.weight,
      batteryCells: form.batteryCells,
      batteryCapacity: form.batteryCapacity,
    });
    setMode('view');
  };

  const handleSwitch = (id: string) => {
    setActiveVehicle(id);
    setMode('view');
  };

  const handleCreate = (type: VehicleType) => {
    const id = addVehicle({
      name: `My ${VEHICLE_TYPE_NAMES[type]}`,
      type,
      weight: 600,
      batteryCells: 4,
      batteryCapacity: 1500,
    });
    setActiveVehicle(id);
    setMode('view');
  };

  const handleLoadParamFile = async () => {
    // Mirrors ParametersView's handleOpenOfflineFile: cancel and failure both
    // resolve false here, so there's nothing worth surfacing as an error.
    const loaded = await loadOfflineFile();
    if (loaded) {
      setView('parameters');
    }
  };

  const flightTime = getEstimatedFlightTime();
  const spec = typeSpecLabel(active);

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5 text-left mb-6 relative">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 shrink-0 text-blue-400">{VEHICLE_ICONS[active.type]}</div>

        <div className="flex-1 min-w-0">
          {mode === 'edit' && form ? (
            <div className="space-y-2">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-2 py-1 bg-surface-raised border border-subtle rounded-lg text-sm text-content"
                placeholder="Vehicle name"
              />
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-content-secondary">
                  Weight (g)
                  <input
                    type="number"
                    value={form.weight}
                    onChange={(e) => setForm({ ...form, weight: Number(e.target.value) || 0 })}
                    className="mt-1 w-full px-2 py-1 bg-surface-raised border border-subtle rounded-lg text-content"
                  />
                </label>
                <label className="text-xs text-content-secondary">
                  Battery cells (S)
                  <input
                    type="number"
                    value={form.batteryCells}
                    onChange={(e) => setForm({ ...form, batteryCells: Number(e.target.value) || 0 })}
                    className="mt-1 w-full px-2 py-1 bg-surface-raised border border-subtle rounded-lg text-content"
                  />
                </label>
                <label className="text-xs text-content-secondary">
                  Capacity (mAh)
                  <input
                    type="number"
                    value={form.batteryCapacity}
                    onChange={(e) => setForm({ ...form, batteryCapacity: Number(e.target.value) || 0 })}
                    className="mt-1 w-full px-2 py-1 bg-surface-raised border border-subtle rounded-lg text-content"
                  />
                </label>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={saveEdit} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg">
                  <Check className="w-3.5 h-3.5" /> Save
                </button>
                <button onClick={() => setMode('view')} className="inline-flex items-center gap-1 px-3 py-1.5 bg-surface-raised hover:bg-surface-overlay-subtle text-content-secondary text-xs rounded-lg">
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-content">{active.name}</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase font-medium tracking-wide">
                  {VEHICLE_TYPE_NAMES[active.type]}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-content-secondary flex-wrap">
                <span>{active.weight}g</span>
                <span>·</span>
                <span>{active.batteryCells}S {active.batteryCapacity}mAh</span>
                {spec && <><span>·</span><span>{spec}</span></>}
                {flightTime > 0 && <><span>·</span><span>~{formatMinutes(flightTime)} flight time</span></>}
              </div>
            </>
          )}
        </div>

        {mode === 'view' && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={startEdit}
              title="Edit vehicle specs"
              className="p-2 rounded-lg hover:bg-surface-raised text-content-secondary hover:text-content"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMode('switch')}
              title="Switch vehicle"
              className="p-2 rounded-lg hover:bg-surface-raised text-content-secondary hover:text-content"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {mode === 'switch' && (
        <div className="mt-4 pt-4 border-t border-subtle">
          <div className="space-y-1">
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => handleSwitch(v.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  v.id === active.id ? 'bg-blue-500/10 text-blue-300' : 'hover:bg-surface-raised text-content'
                }`}
              >
                <div className="w-6 h-6 shrink-0">{VEHICLE_ICONS[v.type]}</div>
                <span className="text-sm flex-1 truncate">{v.name}</span>
                <span className="text-[10px] text-content-secondary uppercase">{VEHICLE_TYPE_NAMES[v.type]}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setMode('new-type')}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-subtle hover:border-blue-500/50 hover:bg-blue-500/5 text-content-secondary hover:text-content text-sm"
            >
              <Plus className="w-4 h-4" /> New Vehicle
            </button>
            <button
              onClick={() => setMode('view')}
              className="px-3 py-2 rounded-lg text-content-secondary hover:text-content text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {mode === 'new-type' && (
        <div className="mt-4 pt-4 border-t border-subtle">
          <p className="text-xs text-content-secondary mb-3">What type of vehicle?</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {VEHICLE_TYPE_ORDER.map((type) => (
              <button
                key={type}
                onClick={() => handleCreate(type)}
                className="flex flex-col items-center gap-1.5 p-2 rounded-lg border border-subtle hover:border-blue-500/50 hover:bg-blue-500/5"
              >
                <div className="w-8 h-8 text-content-secondary">{VEHICLE_ICONS[type]}</div>
                <span className="text-[10px] text-content-secondary">{VEHICLE_TYPE_NAMES[type]}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setMode('switch')} className="mt-3 text-xs text-content-secondary hover:text-content underline">
            Back
          </button>
        </div>
      )}

      {mode === 'view' && (
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-subtle">
          <button
            onClick={handleLoadParamFile}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface-overlay-subtle text-content-secondary hover:text-content text-xs font-medium"
          >
            <FolderOpen className="w-3.5 h-3.5" /> Import .param File
          </button>
          <button
            onClick={() => setView('settings')}
            className="text-xs text-content-secondary hover:text-content underline"
          >
            Manage vehicle profiles in Settings
          </button>
        </div>
      )}
    </div>
  );
}
