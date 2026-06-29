import { useState } from 'react';
import { VehicleTab } from './tabs/VehicleTab';
import { DisplayTab } from './tabs/DisplayTab';
import { ToolsTab } from './tabs/ToolsTab';
import { AboutTab } from './tabs/AboutTab';
import { Car, Sliders, Wrench, Info } from 'lucide-react';

const TABS = [
  { id: 'vehicle', label: 'Vehicle', icon: Car },
  { id: 'display', label: 'Display', icon: Sliders },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'about', label: 'About', icon: Info },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function SettingsTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('vehicle');

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 bg-surface rounded-xl border border-subtle p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-content-secondary hover:text-content hover:bg-surface-raised'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'vehicle' && <VehicleTab />}
        {activeTab === 'display' && <DisplayTab />}
        {activeTab === 'tools' && <ToolsTab />}
        {activeTab === 'about' && <AboutTab />}
      </div>
    </div>
  );
}
