import { useLogStore } from '../../stores/log-store';
import { useSettingsStore } from '../../stores/settings-store';
import { LogListPanel } from './LogListPanel';
import { HealthReportPanel } from './HealthReportPanel';
import { LogExplorerPanel } from './LogExplorerPanel';
import { AiAnalysisPanel } from './AiAnalysisPanel';

export function LogsView() {
  const activeTab = useLogStore((s) => s.activeTab);
  const setActiveTab = useLogStore((s) => s.setActiveTab);
  const currentLog = useLogStore((s) => s.currentLog);
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const aiMessages = useLogStore((s) => s.aiMessages);

  const tabs = [
    { id: 'list' as const, label: 'Log List' },
    { id: 'report' as const, label: 'Health Report', disabled: !currentLog },
    { id: 'explorer' as const, label: 'Explorer', disabled: !currentLog },
    ...(aiProvider ? [{ id: 'ai' as const, label: 'AI Analysis', disabled: !currentLog }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-gray-700/50">
        <h2 className="text-lg font-semibold text-white mr-4">Flight Logs</h2>
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 mr-4">
          Experimental
        </span>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? tab.id === 'ai' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                : tab.disabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
            disabled={tab.disabled}
          >
            {tab.label}
            {tab.id === 'ai' && aiMessages.length > 0 && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                {aiMessages.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'list' && <LogListPanel />}
        {activeTab === 'report' && currentLog && <HealthReportPanel />}
        {activeTab === 'explorer' && currentLog && <LogExplorerPanel />}
        {activeTab === 'ai' && currentLog && <AiAnalysisPanel />}
      </div>
    </div>
  );
}

