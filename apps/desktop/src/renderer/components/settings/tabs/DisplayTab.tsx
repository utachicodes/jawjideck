import { useState } from 'react';
import { useSettingsStore } from '../../../stores/settings-store';
import { useNavigationStore } from '../../../stores/navigation-store';
import { useConnectionStore } from '../../../stores/connection-store';
import { TileCacheCard } from '../TileCacheCard';
import { OpenAipKeyInput } from '../OpenAipKeyInput';
import { ScriptInstallModal } from '../../script-installer/ScriptInstallModal';
import { Ruler, Sliders, Map, Wifi, Terminal, FlaskConical, Puzzle } from 'lucide-react';

interface FieldValidation {
  min?: number;
  max?: number;
  required?: boolean;
  integer?: boolean;
}

const MISSION_FIELD_RULES: Record<string, FieldValidation> = {
  safeAltitudeBuffer: { min: 0, max: 500, required: true, integer: true },
  defaultWaypointAltitude: { min: 0, max: 10_000, required: true, integer: true },
  defaultTakeoffAltitude: { min: 0, max: 1_000, required: true, integer: true },
};

function validateField(value: string, rules: FieldValidation): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return rules.required ? 'Required' : null;
  const num = Number(trimmed);
  if (isNaN(num)) return 'Invalid number';
  if (rules.min !== undefined && num < rules.min) return `Min: ${rules.min}`;
  if (rules.max !== undefined && num > rules.max) return `Max: ${rules.max}`;
  if (rules.integer && !Number.isInteger(num)) return 'Must be whole number';
  return null;
}

export function DisplayTab() {
  const {
    missionDefaults, updateMissionDefaults, displayUnits, setDisplayUnits,
    experienceLevel, setExperienceLevel, uiVisibility, setUiVisibility,
    surveyPerformance, updateSurveyPerformance,
  } = useSettingsStore();
  const [missionLocalValues, setMissionLocalValues] = useState<Record<string, string>>({});
  const [missionErrors, setMissionErrors] = useState<Record<string, string | null>>({});

  const getMissionDisplayValue = (field: string): string | number => {
    if (field in missionLocalValues) return missionLocalValues[field]!;
    return (missionDefaults as any)[field] as number;
  };

  const handleMissionChange = (field: string, rawValue: string) => {
    setMissionLocalValues(prev => ({ ...prev, [field]: rawValue }));
    const rules = MISSION_FIELD_RULES[field];
    if (rules) setMissionErrors(prev => ({ ...prev, [field]: validateField(rawValue, rules) }));
  };

  const handleMissionBlur = (field: string) => {
    const raw = missionLocalValues[field];
    if (raw === undefined) return;
    const rules = MISSION_FIELD_RULES[field];
    const error = rules ? validateField(raw, rules) : null;
    if (error) {
      setMissionLocalValues(prev => { const n = { ...prev }; delete n[field]; return n; });
      setMissionErrors(prev => ({ ...prev, [field]: null }));
      return;
    }
    updateMissionDefaults({ [field]: Number(raw) });
    setMissionLocalValues(prev => { const n = { ...prev }; delete n[field]; return n; });
    setMissionErrors(prev => ({ ...prev, [field]: null }));
  };

  return (
    <div className="space-y-6">
      {/* Display Units */}
      <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Ruler size={16} className="text-blue-400" />
            <div>
              <div className="text-sm font-medium text-content">Display Units</div>
              <div className="text-[11px] text-content-secondary">
                {displayUnits === 'small' ? 'mm, g, mAh - for small/racing builds' : 'm, kg, Ah - for large aircraft'}
              </div>
            </div>
          </div>
          <div className="flex bg-surface-input rounded-lg border border-subtle overflow-hidden">
            <button onClick={() => setDisplayUnits('small')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${displayUnits === 'small' ? 'bg-blue-500/20 text-blue-400' : 'text-content-secondary hover:text-content'}`}>mm / g / mAh</button>
            <button onClick={() => setDisplayUnits('large')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${displayUnits === 'large' ? 'bg-blue-500/20 text-blue-400' : 'text-content-secondary hover:text-content'}`}>m / kg / Ah</button>
          </div>
        </div>
      </section>

      {/* Experience Level */}
      <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Sliders size={16} className="text-purple-400" />
            <div>
              <div className="text-sm font-medium text-content">Experience Level</div>
              <div className="text-[11px] text-content-secondary">Presets control all options below</div>
            </div>
          </div>
          <div className="flex bg-surface-input rounded-lg border border-subtle overflow-hidden">
            <button onClick={async () => { const v = await window.electronAPI?.getAppVersion() || '0.0.0'; setExperienceLevel('beginner', v); }} className={`px-3 py-1.5 text-xs font-medium transition-colors ${experienceLevel === 'beginner' ? 'bg-blue-500/20 text-blue-400' : 'text-content-secondary hover:text-content'}`}>Beginner</button>
            <button onClick={async () => { const v = await window.electronAPI?.getAppVersion() || '0.0.0'; setExperienceLevel('advanced', v); }} className={`px-3 py-1.5 text-xs font-medium transition-colors ${experienceLevel === 'advanced' ? 'bg-purple-500/20 text-purple-400' : 'text-content-secondary hover:text-content'}`}>Advanced</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {([
            { key: 'showInfoCards' as const, label: 'Info Cards', desc: '"What are PIDs?" panels' },
            { key: 'showQuickPresets' as const, label: 'Quick Presets', desc: 'Tuning style selectors' },
            { key: 'showExplanationCards' as const, label: 'Explanation Cards', desc: '"What is X?" breakdowns' },
            { key: 'showSectionDescriptions' as const, label: 'Section Descriptions', desc: 'Header subtitle text' },
            { key: 'showTips' as const, label: 'Inline Tips', desc: 'Compact hint text' },
            { key: 'defaultAdvancedViews' as const, label: 'Default Advanced Views', desc: 'Start in advanced mode' },
          ] as const).map(({ key, label, desc }) => (
            <label key={key} className="flex items-start gap-2.5 cursor-pointer group">
              <input type="checkbox" checked={uiVisibility[key]} onChange={(e) => setUiVisibility({ [key]: e.target.checked })} className="mt-0.5 w-3.5 h-3.5 rounded border-border bg-surface-raised text-blue-500 focus:ring-blue-500/30 focus:ring-offset-0 cursor-pointer" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-content group-hover:text-content transition-colors">{label}</div>
                <div className="text-[11px] text-content-tertiary">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Mission Defaults */}
      <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
        <h2 className="text-sm font-medium text-content mb-4 flex items-center gap-2">
          <Map size={14} className="text-blue-400" />
          Mission Planning Defaults
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { key: 'safeAltitudeBuffer', label: 'Safe Alt Buffer', desc: 'Above terrain for warnings', min: 0, max: 500 },
            { key: 'defaultWaypointAltitude', label: 'Waypoint Alt', desc: 'Default for new waypoints', min: 0, max: 10000 },
            { key: 'defaultTakeoffAltitude', label: 'Takeoff Alt', desc: 'Altitude after launch', min: 0, max: 1000 },
            { key: 'altReference', label: 'Alt Reference', desc: 'MSL or AGL', min: 0, max: 10000 },
          ].map(({ key, label, desc, min, max }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-content-secondary mb-1.5">{label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" value={getMissionDisplayValue(key)}
                  onChange={(e) => handleMissionChange(key, e.target.value)}
                  onBlur={() => handleMissionBlur(key)}
                  className={`w-full px-2 py-1.5 bg-surface-input border rounded text-content text-sm focus:outline-none ${missionErrors[key] ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-blue-500'}`}
                  min={min} max={max}
                />
                <span className="text-content-secondary text-xs">m</span>
              </div>
              {missionErrors[key] ? <div className="text-[10px] text-red-400 mt-1">{missionErrors[key]}</div> : <div className="text-[10px] text-content-tertiary mt-1">{desc}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Offline Maps */}
      <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
        <h2 className="text-sm font-medium text-content mb-4 flex items-center gap-2">
          <Map size={14} className="text-emerald-400" />
          Offline Maps
        </h2>
        <TileCacheCard />
      </section>

      {/* Map Overlays */}
      <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
        <h2 className="text-sm font-medium text-content mb-4 flex items-center gap-2">
          <Map size={14} className="text-emerald-400" />
          Map Overlays
        </h2>
        <OpenAipKeyInput />
      </section>
    </div>
  );
}
