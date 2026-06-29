import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../../stores/settings-store';
import { useToursStore } from '../../../stores/tours-store';
import { useNavigationStore } from '../../../stores/navigation-store';
import { ScriptInstallModal } from '../../script-installer/ScriptInstallModal';
import { Terminal, FlaskConical, Puzzle, RotateCcw } from 'lucide-react';

export function ToolsTab() {
  return (
    <div className="space-y-6">
      <ConsoleSettingsSection />
      <AiAnalysisSection />
      <ExperimentalFeaturesSection />
    </div>
  );
}

function ConsoleSettingsSection() {
  const showDebugLogs = useSettingsStore((s) => s.showDebugLogs);
  const setShowDebugLogs = useSettingsStore((s) => s.setShowDebugLogs);

  return (
    <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
      <h2 className="text-sm font-medium text-content mb-4 flex items-center gap-2">
        <Terminal size={14} className="text-content-secondary" />
        Console
      </h2>
      <div className="flex items-center justify-between bg-surface-input rounded-lg p-3">
        <div className="flex-1 mr-3">
          <div className="text-sm text-content font-medium">Verbose Logging</div>
          <div className="text-xs text-content-secondary mt-0.5">
            Show debug and packet-level messages in the console. When off, only info, warnings, and errors are shown.
          </div>
        </div>
        <button
          onClick={() => setShowDebugLogs(!showDebugLogs)}
          className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${showDebugLogs ? 'bg-blue-600' : 'bg-surface-raised'}`}
        >
          <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${showDebugLogs ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>
    </section>
  );
}

function AiAnalysisSection() {
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const setAiProvider = useSettingsStore((s) => s.setAiProvider);
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const providers = [
    { id: 'claude' as const, name: 'Claude', color: 'bg-orange-500' },
    { id: 'openai' as const, name: 'OpenAI', color: 'bg-emerald-500' },
    { id: 'gemini' as const, name: 'Gemini', color: 'bg-blue-500' },
  ];

  useEffect(() => {
    if (!aiProvider) { setHasKey(false); setApiKey(''); return; }
    window.electronAPI?.getApiKey(`ai-${aiProvider}`).then((res) => { setHasKey(res.hasKey); setApiKey(''); });
  }, [aiProvider]);

  const handleSaveKey = async () => {
    if (!aiProvider || !apiKey.trim()) return;
    setSaving(true);
    await window.electronAPI?.setApiKey(`ai-${aiProvider}`, apiKey.trim());
    setHasKey(true); setApiKey(''); setSaving(false);
  };

  const handleRemoveKey = async () => {
    if (!aiProvider) return;
    await window.electronAPI?.setApiKey(`ai-${aiProvider}`, '');
    setHasKey(false); setAiProvider(null);
  };

  return (
    <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
      <h2 className="text-sm font-medium text-content mb-4 flex items-center gap-2">
        <FlaskConical size={14} className="text-purple-400" />
        AI Flight Analysis
      </h2>
      <div className="space-y-4">
        <p className="text-xs text-content-secondary">
          Enable AI-powered analysis of your flight logs. Your API key is encrypted and stored locally.
        </p>
        <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-lg p-3">
          <div className="text-[11px] text-amber-300/80 leading-relaxed space-y-1">
            <p><strong className="text-amber-300">Experimental feature.</strong></p>
            <p>AI suggestions are not a substitute for your own judgement. Always verify recommendations against ArduPilot documentation before applying changes.</p>
          </div>
        </div>
        <div>
          <div className="text-xs text-content-secondary mb-2">Provider</div>
          <div className="flex gap-2">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => setAiProvider(aiProvider === p.id ? null : p.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${aiProvider === p.id ? 'border-purple-500/50 bg-purple-500/10 text-content' : 'border-subtle bg-surface-input text-content-secondary hover:text-content hover:border-border'}`}
              >
                <span className={`w-2 h-2 rounded-full ${aiProvider === p.id ? p.color : 'bg-surface-raised'}`} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
        {aiProvider && (
          <div>
            <div className="text-xs text-content-secondary mb-2">API Key</div>
            {hasKey ? (
              <div className="flex items-center gap-2 bg-surface-input rounded-lg p-3">
                <span className="text-sm text-content flex-1">Key configured and encrypted</span>
                <button onClick={handleRemoveKey} className="text-xs text-red-400 hover:text-red-300 transition-colors">Remove</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={`Enter ${providers.find((p) => p.id === aiProvider)?.name} API key...`} className="flex-1 bg-surface-input border border-subtle rounded-lg px-3 py-2 text-sm text-content placeholder-content-tertiary focus:outline-none focus:border-purple-500/50" />
                <button onClick={handleSaveKey} disabled={!apiKey.trim() || saving} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ExperimentalFeaturesSection() {
  const companionUnlocked = useSettingsStore((s) => s.companionUnlocked);
  const setCompanionUnlocked = useSettingsStore((s) => s.setCompanionUnlocked);
  const advancedCommandsUnlocked = useSettingsStore((s) => s.advancedCommandsUnlocked);
  const setAdvancedCommandsUnlocked = useSettingsStore((s) => s.setAdvancedCommandsUnlocked);

  return (
    <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
      <h2 className="text-sm font-medium text-content mb-4 flex items-center gap-2">
        <FlaskConical size={14} className="text-purple-400" />
        Experimental Features
      </h2>
      <p className="text-xs text-content-secondary mb-4">These features are under active development and may have rough edges. ArduPilot/MAVLink only.</p>
      <div className="space-y-3">
        <div className="flex items-center justify-between bg-surface-input rounded-lg p-3">
          <div className="flex-1 mr-3">
            <div className="text-sm text-content font-medium">Companion Computer</div>
            <div className="text-xs text-content-secondary mt-0.5">Monitor and manage companion boards (Raspberry Pi, ESP32, Jetson)</div>
          </div>
          <button onClick={() => setCompanionUnlocked(!companionUnlocked)} className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${companionUnlocked ? 'bg-purple-600' : 'bg-surface-raised'}`}>
            <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${companionUnlocked ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </div>
        <div className="bg-surface-input rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-3">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="text-sm text-content font-medium">Advanced map commands</div>
                <span className="px-1.5 py-0 text-[9px] font-bold tracking-wider rounded bg-rose-600/20 text-rose-400 border border-rose-600/40">RISKY</span>
              </div>
              <div className="text-xs text-content-secondary mt-0.5">Unlocks Orbit and Land at point commands</div>
            </div>
            <button onClick={() => setAdvancedCommandsUnlocked(!advancedCommandsUnlocked)} className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${advancedCommandsUnlocked ? 'bg-purple-600' : 'bg-surface-raised'}`}>
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${advancedCommandsUnlocked ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
