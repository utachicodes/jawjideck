import { useState, useCallback } from 'react';
import { useParameterStore } from '../../stores/parameter-store';
import type { PreArmFix } from '../../../shared/prearm-checks';

interface PreArmParamFixProps {
  paramIds: string[];
  hint: string;
  action?: PreArmFix['action'];
  navigateTo?: string;
}

/**
 * Renders an inline editor for a single parameter.
 * Adapts to metadata type: dropdown for enums, checkboxes for bitmasks, number input for ranges.
 */
function ParamEditor({ paramId, onApplied }: { paramId: string; onApplied: (needsReboot: boolean) => void }) {
  const param = useParameterStore((s) => s.parameters.get(paramId));
  const meta = useParameterStore((s) => s.getParameterMetadata(paramId));
  const isReboot = useParameterStore((s) => s.isRebootRequired(paramId));
  const setParameter = useParameterStore((s) => s.setParameter);
  const paramsLoading = useParameterStore((s) => s.isLoading);

  const [localValue, setLocalValue] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentValue = param?.value ?? 0;
  const editValue = localValue ?? currentValue;
  const hasChange = localValue !== null && localValue !== currentValue;

  const handleApply = useCallback(async () => {
    if (localValue === null) return;
    setSaving(true);
    setError(null);
    const ok = await setParameter(paramId, localValue);
    setSaving(false);
    if (!ok) {
      setError('Failed to set parameter');
    } else {
      setLocalValue(null);
      onApplied(isReboot);
    }
  }, [localValue, paramId, setParameter, isReboot, onApplied]);

  if (!param && !paramsLoading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span className="font-mono">{paramId}</span>
        <span>— not found on vehicle</span>
      </div>
    );
  }

  if (!param) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span className="font-mono">{paramId}</span>
        <span>— loading...</span>
      </div>
    );
  }

  const hasEnumValues = meta?.values && Object.keys(meta.values).length > 0;
  const hasBitmask = meta?.bitmask && Object.keys(meta.bitmask).length > 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono text-gray-400 w-28 shrink-0 truncate" title={paramId}>
          {paramId}
        </span>

        {/* Enum dropdown */}
        {hasEnumValues && !hasBitmask && (
          <select
            value={editValue}
            onChange={(e) => setLocalValue(Number(e.target.value))}
            className="bg-gray-700/60 border border-gray-600/50 rounded px-2 py-0.5 text-[11px] text-gray-200 min-w-[120px] max-w-[200px]"
          >
            {Object.entries(meta!.values!).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        )}

        {/* Bitmask checkboxes */}
        {hasBitmask && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {Object.entries(meta!.bitmask!).map(([bit, label]) => {
              const bitNum = Number(bit);
              const isSet = (editValue & (1 << bitNum)) !== 0;
              return (
                <label key={bit} className="flex items-center gap-1 text-[10px] text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSet}
                    onChange={() => {
                      const newVal = isSet
                        ? editValue & ~(1 << bitNum)
                        : editValue | (1 << bitNum);
                      setLocalValue(newVal);
                    }}
                    className="w-3 h-3 rounded border-gray-600 bg-gray-700"
                  />
                  {label}
                </label>
              );
            })}
          </div>
        )}

        {/* Range / plain number input */}
        {!hasEnumValues && !hasBitmask && (
          <input
            type="number"
            value={editValue}
            onChange={(e) => setLocalValue(Number(e.target.value))}
            min={meta?.range?.min}
            max={meta?.range?.max}
            className="bg-gray-700/60 border border-gray-600/50 rounded px-2 py-0.5 text-[11px] text-gray-200 w-24"
          />
        )}

        {meta?.units && (
          <span className="text-[10px] text-gray-500">{meta.units}</span>
        )}

        {isReboot && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
            Reboot required
          </span>
        )}

        {hasChange && (
          <button
            onClick={handleApply}
            disabled={saving}
            className="px-2 py-0.5 text-[10px] font-medium rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600/40 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Apply'}
          </button>
        )}
      </div>

      {error && (
        <div className="text-[10px] text-red-400 pl-[7.5rem]">{error}</div>
      )}
    </div>
  );
}

/**
 * Inline pre-arm fix component. Shows hint, parameter editors, and action links.
 * When params that require reboot are applied, shows a "Reboot FC" button.
 */
export function PreArmParamFix({ paramIds, hint, action, navigateTo }: PreArmParamFixProps) {
  const [needsReboot, setNeedsReboot] = useState(false);
  const [rebooting, setRebooting] = useState(false);

  const handleParamApplied = useCallback((rebootRequired: boolean) => {
    if (rebootRequired) {
      setNeedsReboot(true);
    }
  }, []);

  const handleReboot = useCallback(async () => {
    setRebooting(true);
    try {
      await window.electronAPI.mavlinkReboot();
    } catch {
      // reboot sent, connection will drop and reconnect
    }
    setRebooting(false);
    setNeedsReboot(false);
  }, []);

  return (
    <div className="px-3 py-2 bg-gray-800/40 border-t border-gray-700/30 space-y-2">
      <div className="text-[11px] text-gray-300">{hint}</div>

      {action && (
        <div className="text-[10px] text-amber-400/80">
          {action === 'calibrate-accel' && 'Accelerometer calibration required — use the Calibration tab'}
          {action === 'calibrate-compass' && 'Compass calibration required — use the Calibration tab'}
          {action === 'calibrate-rc' && 'RC calibration required — use the Calibration tab'}
        </div>
      )}

      {navigateTo && (
        <div className="text-[10px] text-blue-400">
          Go to {navigateTo.charAt(0).toUpperCase() + navigateTo.slice(1)} tab to resolve
        </div>
      )}

      {paramIds.length > 0 && (
        <div className="space-y-1.5">
          {paramIds.map((id) => (
            <ParamEditor key={id} paramId={id} onApplied={handleParamApplied} />
          ))}
        </div>
      )}

      {needsReboot && (
        <button
          onClick={handleReboot}
          disabled={rebooting}
          className="w-full mt-1 px-3 py-1.5 text-[11px] font-medium rounded bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600/30 transition-colors disabled:opacity-50"
        >
          {rebooting ? 'Rebooting...' : 'Reboot Flight Controller to apply'}
        </button>
      )}
    </div>
  );
}
