import { useUpdateStore } from '../../../stores/update-store';
import { useToursStore } from '../../../stores/tours-store';
import { useNavigationStore } from '../../../stores/navigation-store';
import { Info, RotateCcw, ExternalLink } from 'lucide-react';

export function AboutTab() {
  const {
    currentVersion, status, canAutoUpdate, latestVersion, publishedAt,
    downloadProgress, bytesDownloaded, totalBytes, error,
    checkForUpdate, downloadUpdate, installUpdate, openReleaseUrl,
  } = useUpdateStore();

  const isChecking = status === 'checking';
  const showCheckButton = status === 'idle' || status === 'not-available' || status === 'error';

  return (
    <div className="space-y-6">
      <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-content">Jawji</h3>
            <p className="text-sm text-content-secondary mt-0.5">v{currentVersion || '...'}</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://github.com/utachicodes/jawjideck" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs text-content-secondary hover:text-content border border-border hover:border-border rounded-lg transition-colors flex items-center gap-1.5">
              GitHub <ExternalLink size={10} />
            </a>
            {showCheckButton && (
              <button onClick={() => checkForUpdate()} disabled={isChecking} className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500/80 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2">
                Check for Updates
              </button>
            )}
            {isChecking && <span className="text-xs text-content-secondary">Checking...</span>}
            {status === 'available' && canAutoUpdate && (
              <button onClick={() => downloadUpdate()} className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs font-medium rounded-lg transition-colors">Download v{latestVersion}</button>
            )}
            {status === 'available' && !canAutoUpdate && (
              <button onClick={openReleaseUrl} className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
                View Release v{latestVersion} <ExternalLink size={10} />
              </button>
            )}
            {status === 'downloaded' && (
              <button onClick={() => installUpdate()} className="px-3 py-1.5 bg-emerald-600/80 hover:bg-emerald-500/80 text-white text-xs font-medium rounded-lg transition-colors">Restart to Update</button>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-subtle">
          {status === 'not-available' && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <Info size={16} /> You're up to date
            </div>
          )}
          {status === 'available' && (
            <div className="flex items-center justify-between bg-blue-500/10 rounded-lg p-3">
              <div>
                <p className="text-sm text-blue-300 font-medium">v{latestVersion} is available</p>
                {publishedAt && <p className="text-xs text-content-secondary mt-0.5">Released {new Date(publishedAt).toLocaleDateString()}</p>}
              </div>
            </div>
          )}
          {status === 'downloading' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-content-secondary">
                <span>Downloading v{latestVersion}...</span>
                <span className="tabular-nums">{totalBytes > 0 ? `${(bytesDownloaded / (1024 * 1024)).toFixed(1)} / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytesDownloaded / (1024 * 1024)).toFixed(1)} MB`}</span>
              </div>
              <div className="h-1.5 bg-surface-inset rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${Math.round(downloadProgress)}%` }} />
              </div>
            </div>
          )}
          {status === 'downloaded' && (
            <div className="flex items-center gap-2 text-sm text-emerald-400"><Info size={16} /> Update downloaded and ready to install</div>
          )}
          {status === 'error' && error && (
            <div className="flex items-center gap-2 text-sm text-red-400"><Info size={16} /> <span className="truncate">{error}</span></div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-subtle flex items-center justify-between">
          <div>
            <p className="text-sm text-content">Guided tour</p>
            <p className="text-xs text-content-secondary mt-0.5">Re-show the walkthroughs for every screen.</p>
          </div>
          <button
            onClick={() => { useToursStore.getState().resetAll(); useNavigationStore.getState().setView('telemetry'); }}
            className="px-3 py-1.5 text-xs text-content-secondary hover:text-content border border-border hover:border-border rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RotateCcw size={10} /> Replay tour
          </button>
        </div>
      </section>
    </div>
  );
}
