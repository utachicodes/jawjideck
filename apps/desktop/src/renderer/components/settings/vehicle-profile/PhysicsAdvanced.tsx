import { Cpu } from 'lucide-react';
import type { VehicleProfile } from '../../../stores/settings-store.js';

interface PhysicsAdvancedProps {
  vehicle: VehicleProfile;
  onUpdate: (updates: Partial<VehicleProfile>) => void;
}

/**
 * Collapsible "Physics (SITL fidelity)" section — drives SIM_* params.
 * Matches the existing <details>/<summary> pattern used elsewhere in the
 * Edit Vehicle modal (rotating chevron, icon, collapsed by default).
 */
export function PhysicsAdvanced({ vehicle, onUpdate }: PhysicsAdvancedProps) {
  return (
    <details className="group">
      <summary className="text-sm font-medium text-content-secondary cursor-pointer hover:text-content flex items-center gap-2">
        <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <Cpu className="w-4 h-4" />
        Physics (SITL fidelity)
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <NumField
          label="Thrust/Weight ratio"
          value={vehicle.thrustToWeight}
          step={0.1}
          unit=""
          placeholder="2.0"
          onChange={v => onUpdate({ thrustToWeight: v })}
          hint="Used for SIM_ENGINE_MUL"
        />
        <NumField
          label="Prop Diameter"
          value={vehicle.propDiameter}
          step={1}
          unit="mm"
          placeholder="127"
          onChange={v => onUpdate({ propDiameter: v })}
          hint="Prop diameter in millimetres"
        />
        <NumField
          label="Drag Coefficient"
          value={vehicle.dragCoefficient}
          step={0.01}
          unit=""
          placeholder="0.3"
          onChange={v => onUpdate({ dragCoefficient: v })}
          hint="SIM_DRAG_COEF (0.1–1.5 typical)"
        />
        <NumField
          label="Servo Speed"
          value={vehicle.servoSpeed}
          step={10}
          unit="°/s"
          placeholder="300"
          onChange={v => onUpdate({ servoSpeed: v })}
          hint="SIM_SERVO_SPEED response"
        />
        <div className="col-span-2 grid grid-cols-3 gap-2">
          <NumField
            label="CG Offset X"
            value={vehicle.cogOffset?.x}
            step={1}
            unit="mm"
            onChange={v => onUpdate({ cogOffset: { ...(vehicle.cogOffset ?? { x: 0, y: 0, z: 0 }), x: v } })}
          />
          <NumField
            label="CG Offset Y"
            value={vehicle.cogOffset?.y}
            step={1}
            unit="mm"
            onChange={v => onUpdate({ cogOffset: { ...(vehicle.cogOffset ?? { x: 0, y: 0, z: 0 }), y: v } })}
          />
          <NumField
            label="CG Offset Z"
            value={vehicle.cogOffset?.z}
            step={1}
            unit="mm"
            onChange={v => onUpdate({ cogOffset: { ...(vehicle.cogOffset ?? { x: 0, y: 0, z: 0 }), z: v } })}
          />
        </div>
      </div>
    </details>
  );
}

interface NumFieldProps {
  label: string;
  value: number | undefined;
  step: number;
  unit: string;
  placeholder?: string;
  hint?: string;
  onChange: (value: number) => void;
}

function NumField({ label, value, step, unit, placeholder, hint, onChange }: NumFieldProps) {
  return (
    <div>
      <label className="block text-[11px] text-content-secondary mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          step={step}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }}
          className="w-full px-2 py-1.5 bg-surface-input border border-border rounded text-xs text-content focus:outline-none focus:border-blue-500"
        />
        {unit && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-content-tertiary">{unit}</span>}
      </div>
      {hint && <div className="text-[10px] text-content-tertiary mt-0.5">{hint}</div>}
    </div>
  );
}
