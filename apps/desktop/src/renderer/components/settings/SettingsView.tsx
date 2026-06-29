import { SettingsTabs } from './SettingsTabs';

/**
 * Settings View - thin wrapper around tabbed settings interface.
 * All actual UI lives in the tabs/ subdirectory.
 */
export function SettingsView() {
  return (
    <div className="h-full overflow-auto bg-surface-input">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-content">Settings</h1>
          <p className="text-content-secondary text-sm mt-1">
            Configure vehicle profiles, display, and tools
          </p>
        </div>
        <SettingsTabs />
      </div>
    </div>
  );
}
