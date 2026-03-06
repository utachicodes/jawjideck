/**
 * Camera Preset Selector - Dropdown with grouped presets and custom option.
 */
import { useState, useRef, useEffect } from 'react';
import type { CameraPreset } from './survey-types';
import { CAMERA_PRESET_GROUPS, CUSTOM_CAMERA } from './camera-presets';

interface CameraPresetSelectorProps {
  value: CameraPreset;
  onChange: (preset: CameraPreset) => void;
}

export function CameraPresetSelector({ value, onChange }: CameraPresetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const filteredGroups = CAMERA_PRESET_GROUPS.map(group => ({
    ...group,
    presets: group.presets.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()),
    ),
  })).filter(group => group.presets.length > 0);

  const isCustom = value.name === 'Custom';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
        className="w-full px-3 py-2 text-left text-xs bg-gray-800 border border-gray-600 rounded-lg text-gray-200 hover:border-gray-500 transition-colors flex items-center justify-between"
      >
        <span className="truncate">{value.name}</span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Sensor info summary */}
      {!isCustom && (
        <div className="mt-1 text-[10px] text-gray-500 leading-tight">
          {value.sensorWidth}x{value.sensorHeight}mm sensor, {value.focalLength}mm, {value.imageWidth}x{value.imageHeight}px
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
          {/* Search */}
          <div className="sticky top-0 bg-gray-800 p-2 border-b border-gray-700">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cameras..."
              className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:border-purple-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Groups */}
          {filteredGroups.map(group => (
            <div key={group.group}>
              <div className="px-3 py-1 text-[10px] font-medium text-gray-500 uppercase tracking-wider bg-gray-900/50">
                {group.group}
              </div>
              {group.presets.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => { onChange(preset); setIsOpen(false); }}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-600/20 transition-colors ${
                    value.name === preset.name ? 'text-purple-300 bg-purple-600/10' : 'text-gray-300'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          ))}

          {/* Custom option */}
          <div className="border-t border-gray-700">
            <button
              onClick={() => { onChange({ ...CUSTOM_CAMERA }); setIsOpen(false); }}
              className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-600/20 transition-colors ${
                isCustom ? 'text-purple-300 bg-purple-600/10' : 'text-gray-400'
              }`}
            >
              Custom...
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
