import { useEffect, useState, useRef } from 'react';
import { useModuleStore } from '../../stores/module-store';
import type { ModuleProgress, InstalledModule } from '../../../shared/module-types';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// License Type Badge
// ---------------------------------------------------------------------------

function LicenseTypeBadge({ type }: { type: InstalledModule['licenseType'] }) {
  const styles = {
    perpetual: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    subscription: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    trial: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };

  const labels = {
    perpetual: 'Perpetual',
    subscription: 'Subscription',
    trial: 'Trial',
  };

  return (
    <span className={`px-2 py-0.5 text-xs rounded-full border ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Progress Indicator
// ---------------------------------------------------------------------------

function ActivationProgress({ progress }: { progress: ModuleProgress }) {
  const stageLabels: Record<ModuleProgress['stage'], string> = {
    validating: 'Validating',
    activating: 'Activating',
    downloading: 'Downloading',
    verifying: 'Verifying',
    complete: 'Complete',
    error: 'Error',
  };

  const stageColors: Record<ModuleProgress['stage'], string> = {
    validating: 'text-blue-400',
    activating: 'text-blue-400',
    downloading: 'text-blue-400',
    verifying: 'text-blue-400',
    complete: 'text-emerald-400',
    error: 'text-red-400',
  };

  return (
    <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
          {progress.stage === 'complete' ? (
            <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
          ) : progress.stage === 'error' ? (
            <AlertIcon className="w-5 h-5 text-red-400" />
          ) : (
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <div>
          <h3 className={`text-sm font-medium ${stageColors[progress.stage]}`}>
            {stageLabels[progress.stage]}
          </h3>
          <p className="text-xs text-gray-400">{progress.message}</p>
        </div>
      </div>

      {/* Progress bar */}
      {progress.percent !== undefined && progress.stage !== 'error' && (
        <div className="w-full h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              progress.stage === 'complete' ? 'bg-emerald-500' : 'bg-blue-500'
            }`}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module Card
// ---------------------------------------------------------------------------

function ModuleCard({
  module,
  hasUpdate,
  onRemove,
}: {
  module: InstalledModule;
  hasUpdate: boolean;
  onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  const displayName = module.name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-4 flex items-start gap-4">
      {/* Icon */}
      <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
        <PackageIcon className="w-6 h-6 text-purple-400" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-medium text-white truncate">{displayName}</h3>
          {hasUpdate && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <ArrowUpIcon className="w-2.5 h-2.5" />
              Update
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 font-mono mb-2">{module.slug}</p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">v{module.version}</span>
          <LicenseTypeBadge type={module.licenseType} />
          {module.bundleName && (
            <span className="text-xs text-gray-500">{module.bundleName}</span>
          )}
        </div>
      </div>

      {/* Remove */}
      <div className="shrink-0">
        {confirmRemove ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                onRemove();
                setConfirmRemove(false);
              }}
              className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmRemove(false)}
              className="px-2 py-1 text-xs bg-gray-700/50 text-gray-400 rounded hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remove module"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-800/50 border border-gray-700/30 flex items-center justify-center mb-5">
        <PackageIcon className="w-8 h-8 text-gray-600" />
      </div>
      <h3 className="text-lg font-medium text-gray-300 mb-2">No modules installed</h3>
      <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
        Enter a license key above to activate and download your modules.
        License keys are provided when you purchase modules from the ArduDeck marketplace.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------

export function ModuleManagerView() {
  const {
    modules,
    isLoading,
    error,
    activating,
    progress,
    updates,
    loadModules,
    activateLicense,
    removeLicense,
    checkUpdates,
    setProgress,
    clearError,
  } = useModuleStore();

  const [keyInput, setKeyInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Load modules and check for updates on mount
  useEffect(() => {
    loadModules();
    checkUpdates();
  }, [loadModules, checkUpdates]);

  // Subscribe to progress events from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onModuleProgress((p) => {
      setProgress(p);
    });
    return () => { cleanup(); };
  }, [setProgress]);

  const handleActivate = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;

    clearError();
    const result = await activateLicense(trimmed);
    if (result.success) {
      setKeyInput('');
      // Refresh updates
      checkUpdates();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleActivate();
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setKeyInput(text.trim());
      }
    } catch {
      // Clipboard access denied
    }
  };

  // Group modules by license key for display
  const updateSlugs = new Set(updates.map((u) => u.slug));

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <PackageIcon className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Module Manager</h1>
            <p className="text-sm text-gray-400">Activate license keys and manage installed modules</p>
          </div>
        </div>

        {/* License Key Input */}
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <KeyIcon className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-sm font-medium text-gray-200">Activate License</h2>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ARDUDECK-xxxxxxxx-xxxxxxxx"
                disabled={activating}
                className="w-full px-3 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 disabled:opacity-50 font-mono"
                spellCheck={false}
                autoComplete="off"
              />
              {!keyInput && (
                <button
                  onClick={handlePaste}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-500 hover:text-gray-300 bg-gray-800/50 rounded transition-colors"
                >
                  Paste
                </button>
              )}
            </div>
            <button
              onClick={handleActivate}
              disabled={!keyInput.trim() || activating}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-blue-600 shrink-0"
            >
              {activating ? 'Activating...' : 'Activate'}
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mt-3 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertIcon className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Progress indicator */}
        {progress && progress.stage !== 'complete' && (
          <ActivationProgress progress={progress} />
        )}

        {/* Installed Modules */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-300">
              Installed Modules
              {modules.length > 0 && (
                <span className="ml-2 text-xs text-gray-500">({modules.length})</span>
              )}
            </h2>
            {modules.length > 0 && (
              <button
                onClick={() => checkUpdates()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-gray-800/30 hover:bg-gray-800/50 border border-gray-700/30 rounded-lg transition-colors"
              >
                <RefreshIcon className="w-3.5 h-3.5" />
                Check Updates
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : modules.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {modules.map((mod) => (
                <ModuleCard
                  key={mod.slug}
                  module={mod}
                  hasUpdate={updateSlugs.has(mod.slug)}
                  onRemove={() => removeLicense(mod.licenseKey)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Updates available */}
        {updates.length > 0 && (
          <div className="bg-blue-500/5 rounded-xl border border-blue-500/20 p-5">
            <div className="flex items-center gap-3 mb-3">
              <ArrowUpIcon className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-medium text-blue-400">
                {updates.length} update{updates.length > 1 ? 's' : ''} available
              </h3>
            </div>
            <div className="space-y-2">
              {updates.map((u) => (
                <div key={u.slug} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">{u.name}</span>
                  <span className="text-xs text-gray-500">
                    {u.currentVersion} → <span className="text-blue-400">{u.latestVersion}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
