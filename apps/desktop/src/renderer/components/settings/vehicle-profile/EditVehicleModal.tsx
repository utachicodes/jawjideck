/**
 * EditVehicleModal — the missing "Edit Vehicle" surface for a Vehicle
 * Profile: name, type, physical specs (weight/battery/frame/wing/etc.),
 * config selectors, advanced SITL physics, template binding, drift/apply
 * status and snapshots, and delete.
 *
 * Fields apply immediately (no Save/Cancel) — this matches the pattern the
 * sub-components here (ConfigSelectors, PhysicsAdvanced) were already built
 * against: each takes `onUpdate: (patch) => void` and calls it per change.
 */

import { useState } from 'react';
import { X, Trash2, FileDown, RefreshCw } from 'lucide-react';
import { useSettingsStore, type VehicleProfile, type VehicleType } from '../../../stores/settings-store';
import { useParameterStore } from '../../../stores/parameter-store';
import { VEHICLE_ICONS, VEHICLE_TYPE_NAMES } from '../../../lib/vehicle-icons';
import { getTemplate, defaultTemplateForType } from '../../../lib/vehicle-templates/registry';
import { inferProfileFromParams } from '../../../lib/vehicle-templates/import';
import { saveParmToFile } from '../../../lib/vehicle-templates/export-parm';
import type { VehicleTemplate } from '../../../lib/vehicle-templates/types';
import { VehicleTemplatePicker } from './VehicleTemplatePicker';
import { ConfigSelectors } from './ConfigSelectors';
import { PhysicsAdvanced } from './PhysicsAdvanced';
import { ParamsPreview } from './ParamsPreview';
import { DriftBadge } from './DriftBadge';
import { SnapshotList } from './SnapshotList';
import { TemplateChip } from './TemplateChip';
import { StallSpeedCalcButton } from './StallSpeedCalcButton';

interface EditVehicleModalProps {
  vehicle: VehicleProfile;
  onClose: () => void;
}

const inputClass = 'w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] text-content-secondary">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-content-tertiary">{hint}</span>}
    </label>
  );
}

function NumberField({ value, onChange, min, step = 1, unit }: {
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        min={min}
        step={step}
        value={value ?? ''}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        className={inputClass}
      />
      {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-content-tertiary pointer-events-none">{unit}</span>}
    </div>
  );
}

export function EditVehicleModal({ vehicle, onClose }: EditVehicleModalProps) {
  const updateVehicle = useSettingsStore((s) => s.updateVehicle);
  const removeVehicle = useSettingsStore((s) => s.removeVehicle);
  const vehicleCount = useSettingsStore((s) => s.vehicles.length);
  const parameters = useParameterStore((s) => s.parameters);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const update = (patch: Partial<VehicleProfile>) => updateVehicle(vehicle.id, patch);

  const handleTypeChange = (type: VehicleType) => {
    // A template only makes sense for the type it was built for — drop the
    // binding so ParamsPreview/Apply fall back to that type's default template
    // instead of quietly emitting the wrong airframe's params.
    update({ type, templateSlug: undefined });
  };

  const handleSelectTemplate = (template: VehicleTemplate) => {
    update({ ...template.defaults, templateSlug: template.slug });
    setShowTemplatePicker(false);
  };

  const handleImportFromConnected = () => {
    const valueMap = new Map<string, number>();
    for (const [id, p] of parameters) valueMap.set(id, p.value);
    const result = inferProfileFromParams(valueMap);
    if (result) {
      const { name: _name, ...rest } = result.profile;
      update(rest);
    }
    setShowTemplatePicker(false);
  };

  const handleExport = async () => {
    setExportError(null);
    const template = getTemplate(vehicle.templateSlug) ?? defaultTemplateForType(vehicle.type);
    const result = await saveParmToFile(vehicle, template, { includeSim: true });
    if (!result.ok && result.error) setExportError(result.error);
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    removeVehicle(vehicle.id);
    onClose();
  };

  const showCopter = vehicle.type === 'copter' || vehicle.type === 'vtol';
  const showPlane = vehicle.type === 'plane' || vehicle.type === 'vtol';
  const showVtolOnly = vehicle.type === 'vtol';

  return (
    <div className="fixed inset-0 bg-surface-overlay flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div
        className="bg-surface-raised rounded-xl border border-subtle w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-subtle">
          <div className="w-8 h-8 text-blue-400 shrink-0">{VEHICLE_ICONS[vehicle.type]}</div>
          <input
            value={vehicle.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Vehicle name"
            className="flex-1 min-w-0 bg-transparent text-base font-semibold text-content focus:outline-none border-b border-transparent focus:border-blue-500"
          />
          <DriftBadge profile={vehicle} />
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-overlay-subtle text-content-secondary hover:text-content shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Type + template */}
          <div className="flex items-end gap-3">
            <Field label="Vehicle type">
              <select value={vehicle.type} onChange={(e) => handleTypeChange(e.target.value as VehicleType)} className={inputClass}>
                {(Object.keys(VEHICLE_TYPE_NAMES) as VehicleType[]).map((t) => (
                  <option key={t} value={t}>{VEHICLE_TYPE_NAMES[t]}</option>
                ))}
              </select>
            </Field>
            <div className="flex items-center gap-2 pb-2">
              {vehicle.templateSlug && <TemplateChip slug={vehicle.templateSlug} />}
              <button
                type="button"
                onClick={() => setShowTemplatePicker(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-content-secondary hover:text-content hover:bg-surface-overlay-subtle border border-subtle"
              >
                <RefreshCw className="w-3 h-3" />
                {vehicle.templateSlug ? 'Change template' : 'Pick a template'}
              </button>
            </div>
          </div>

          {/* Common physical */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Weight (AUW)"><NumberField value={vehicle.weight} onChange={(v) => update({ weight: v })} min={0} unit="g" /></Field>
            <Field label="Battery cells"><NumberField value={vehicle.batteryCells} onChange={(v) => update({ batteryCells: v })} min={1} unit="S" /></Field>
            <Field label="Battery capacity"><NumberField value={vehicle.batteryCapacity} onChange={(v) => update({ batteryCapacity: v })} min={0} unit="mAh" /></Field>
            <Field label="Battery chemistry">
              <select
                value={vehicle.batteryChemistry ?? 'lipo'}
                onChange={(e) => update({ batteryChemistry: e.target.value as VehicleProfile['batteryChemistry'] })}
                className={inputClass}
              >
                <option value="lipo">LiPo</option>
                <option value="lihv">LiHV</option>
                <option value="lion">Li-Ion</option>
                <option value="life">LiFe</option>
              </select>
            </Field>
            <Field label="Discharge rating" hint="Optional">
              <NumberField value={vehicle.batteryDischarge} onChange={(v) => update({ batteryDischarge: v })} min={0} unit="C" />
            </Field>
          </div>

          {/* Copter-specific */}
          {showCopter && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Frame size"><NumberField value={vehicle.frameSize} onChange={(v) => update({ frameSize: v })} min={0} unit="mm" /></Field>
              <Field label="Motor count">
                <select value={vehicle.motorCount ?? 4} onChange={(e) => update({ motorCount: Number(e.target.value) })} className={inputClass}>
                  {[3, 4, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Motor KV"><NumberField value={vehicle.motorKv} onChange={(v) => update({ motorKv: v })} min={0} /></Field>
              <Field label="Prop size">
                <input value={vehicle.propSize ?? ''} onChange={(e) => update({ propSize: e.target.value })} placeholder="5x4.5" className={inputClass} />
              </Field>
            </div>
          )}

          {/* Plane-specific */}
          {showPlane && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Wingspan"><NumberField value={vehicle.wingspan} onChange={(v) => update({ wingspan: v })} min={0} unit="mm" /></Field>
              <Field label="Wing area"><NumberField value={vehicle.wingArea} onChange={(v) => update({ wingArea: v })} min={0} unit="cm²" /></Field>
              <Field label="Stall speed">
                <div className="flex items-center gap-1.5">
                  <NumberField value={vehicle.stallSpeed} onChange={(v) => update({ stallSpeed: v })} min={0} step={0.1} unit="m/s" />
                  <StallSpeedCalcButton vehicle={vehicle} onCompute={(v) => update({ stallSpeed: v })} />
                </div>
              </Field>
            </div>
          )}

          {/* VTOL-specific */}
          {showVtolOnly && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="VTOL motor count"><NumberField value={vehicle.vtolMotorCount} onChange={(v) => update({ vtolMotorCount: v })} min={0} /></Field>
              <Field label="Transition speed"><NumberField value={vehicle.transitionSpeed} onChange={(v) => update({ transitionSpeed: v })} min={0} step={0.5} unit="m/s" /></Field>
            </div>
          )}

          {/* Rover-specific */}
          {vehicle.type === 'rover' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Wheelbase"><NumberField value={vehicle.wheelbase} onChange={(v) => update({ wheelbase: v })} min={0} unit="mm" /></Field>
              <Field label="Wheel diameter"><NumberField value={vehicle.wheelDiameter} onChange={(v) => update({ wheelDiameter: v })} min={0} unit="mm" /></Field>
              <Field label="Drive type">
                <select value={vehicle.driveType ?? 'differential'} onChange={(e) => update({ driveType: e.target.value as VehicleProfile['driveType'] })} className={inputClass}>
                  <option value="differential">Differential</option>
                  <option value="ackermann">Ackermann</option>
                  <option value="skid">Skid</option>
                </select>
              </Field>
              <Field label="Max speed"><NumberField value={vehicle.maxSpeed} onChange={(v) => update({ maxSpeed: v })} min={0} step={0.1} unit="m/s" /></Field>
            </div>
          )}

          {/* Boat-specific */}
          {vehicle.type === 'boat' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Hull length"><NumberField value={vehicle.hullLength} onChange={(v) => update({ hullLength: v })} min={0} unit="mm" /></Field>
              <Field label="Hull type">
                <select value={vehicle.hullType ?? 'displacement'} onChange={(e) => update({ hullType: e.target.value as VehicleProfile['hullType'] })} className={inputClass}>
                  <option value="displacement">Displacement</option>
                  <option value="planing">Planing</option>
                  <option value="catamaran">Catamaran</option>
                  <option value="pontoon">Pontoon</option>
                </select>
              </Field>
              <Field label="Propulsion">
                <select value={vehicle.propellerType ?? 'prop'} onChange={(e) => update({ propellerType: e.target.value as VehicleProfile['propellerType'] })} className={inputClass}>
                  <option value="prop">Propeller</option>
                  <option value="jet">Jet</option>
                  <option value="paddle">Paddle</option>
                </select>
              </Field>
              <Field label="Max speed"><NumberField value={vehicle.maxSpeed} onChange={(v) => update({ maxSpeed: v })} min={0} step={0.1} unit="m/s" /></Field>
            </div>
          )}

          {/* Sub-specific */}
          {vehicle.type === 'sub' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Max depth"><NumberField value={vehicle.maxDepth} onChange={(v) => update({ maxDepth: v })} min={0} unit="m" /></Field>
              <Field label="Thruster count"><NumberField value={vehicle.thrusterCount} onChange={(v) => update({ thrusterCount: v })} min={0} /></Field>
              <Field label="Buoyancy">
                <select value={vehicle.buoyancy ?? 'neutral'} onChange={(e) => update({ buoyancy: e.target.value as VehicleProfile['buoyancy'] })} className={inputClass}>
                  <option value="positive">Positive</option>
                  <option value="neutral">Neutral</option>
                  <option value="negative">Negative</option>
                </select>
              </Field>
            </div>
          )}

          <ConfigSelectors vehicle={vehicle} onUpdate={update} />
          <PhysicsAdvanced vehicle={vehicle} onUpdate={update} />

          <Field label="Notes">
            <textarea
              value={vehicle.notes ?? ''}
              onChange={(e) => update({ notes: e.target.value })}
              rows={2}
              placeholder="Payload, frame changes, quirks…"
              className={`${inputClass} resize-none`}
            />
          </Field>

          <div className="flex items-center justify-between">
            <SnapshotList profile={vehicle} />
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-content-secondary hover:text-content hover:bg-surface-overlay-subtle"
            >
              <FileDown className="w-3.5 h-3.5" />
              Export .parm
            </button>
          </div>
          {exportError && <p className="text-xs text-red-400">{exportError}</p>}

          <ParamsPreview vehicle={vehicle} onBeforeApply={onClose} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-subtle">
          <button
            onClick={handleDelete}
            disabled={vehicleCount <= 1}
            title={vehicleCount <= 1 ? 'The last vehicle profile cannot be deleted' : undefined}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              confirmDelete ? 'bg-red-500 hover:bg-red-400 text-white' : 'text-red-400 hover:bg-red-500/10'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {confirmDelete ? 'Click again to delete' : 'Delete vehicle'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium">
            Done
          </button>
        </div>
      </div>

      {showTemplatePicker && (
        <VehicleTemplatePicker
          onSelect={handleSelectTemplate}
          onImportFromConnected={handleImportFromConnected}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}
    </div>
  );
}
