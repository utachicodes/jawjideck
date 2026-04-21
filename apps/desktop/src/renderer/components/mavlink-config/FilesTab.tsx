/**
 * FilesTab — MAVLink-FTP file browser for the connected flight controller.
 *
 * Phase 1 (current): read-only browse + download. Lists directories, shows
 * file sizes, lets the user save any file to local disk via a save dialog.
 *
 * Phase 2 (future): upload + delete + create directory. Reuses the existing
 * write primitives in main/mavlink-ftp/ftp-client.ts that the script
 * installer already exercises.
 *
 * SITL note: ArduPilot SITL exposes the FTP-virtual /APM/ tree, NOT the
 * host-side <cwd>/scripts/ folder where SITL actually loads scripts from.
 * The browser shows the FTP view (matching real-hardware behaviour) and
 * surfaces a banner explaining the divergence when running on SITL.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  FolderOpen,
  Folder,
  File,
  ChevronRight,
  Home,
  RefreshCw,
  Download,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connection-store';

interface DirEntry {
  kind: 'dir' | 'file';
  name: string;
  size?: number;
}

const DEFAULT_PATH = '/';

export const FilesTab: React.FC = () => {
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const protocol = useConnectionStore((s) => s.connectionState.protocol);
  const isSitl = useConnectionStore((s) => s.connectionState.isSitl);

  const [path, setPath] = useState<string>(DEFAULT_PATH);
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Map of "path/filename" → { downloading, savedTo?, error? } for inline status.
  const [downloads, setDownloads] = useState<Record<string, { state: 'downloading' | 'done' | 'error'; detail?: string }>>({});

  const refresh = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    setEntries(null);
    const result = await window.electronAPI.mavlinkFtpList(target);
    setLoading(false);
    if (!result.success || !result.entries) {
      setError(result.error ?? 'Unknown error');
      return;
    }
    // Sort: dirs first, then files, alphabetical within group.
    const sorted = [...result.entries].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    setEntries(sorted);
  }, []);

  // Auto-load when the tab mounts (or path changes) and we're connected.
  useEffect(() => {
    if (isConnected && protocol === 'mavlink') {
      void refresh(path);
    }
  }, [isConnected, protocol, path, refresh]);

  const handleEntryClick = useCallback((entry: DirEntry) => {
    if (entry.kind !== 'dir') return;
    // Compose the new path; ensure exactly one slash between parts.
    const next = path.endsWith('/') ? `${path}${entry.name}` : `${path}/${entry.name}`;
    setPath(next);
  }, [path]);

  const handleDownload = useCallback(async (entry: DirEntry) => {
    if (entry.kind !== 'file') return;
    const fcPath = path.endsWith('/') ? `${path}${entry.name}` : `${path}/${entry.name}`;
    setDownloads(d => ({ ...d, [fcPath]: { state: 'downloading' } }));
    const result = await window.electronAPI.mavlinkFtpDownload(fcPath);
    setDownloads(d => ({
      ...d,
      [fcPath]: result.success
        ? { state: 'done', detail: result.savedTo }
        : { state: 'error', detail: result.error },
    }));
  }, [path]);

  // ── Render gates ─────────────────────────────────────────────

  if (!isConnected) {
    return (
      <ChromedShell>
        <EmptyState
          title="Not connected"
          message="Connect to a flight controller to browse its filesystem."
        />
      </ChromedShell>
    );
  }

  if (protocol !== 'mavlink') {
    return (
      <ChromedShell>
        <EmptyState
          title="MAVLink only"
          message="The FC file browser uses MAVLink-FTP. It is not available on MSP / iNav connections."
        />
      </ChromedShell>
    );
  }

  return (
    <ChromedShell>
      {isSitl && (
        <div className="mb-3 px-3 py-2 rounded text-xs bg-blue-500/10 border border-blue-500/30 text-blue-400">
          <div className="font-semibold mb-0.5">SITL note</div>
          ArduPilot SITL exposes the FTP-virtual <code className="font-mono text-[11px]">/APM/</code> tree. Files SITL actually loads (e.g. scripts) live on the host disk under the SITL working directory. They may not match what is shown here.
        </div>
      )}

      <PathBar
        path={path}
        loading={loading}
        onNavigate={setPath}
        onRefresh={() => refresh(path)}
      />

      {error && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold mb-0.5">Could not list {path}</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {!error && entries !== null && entries.length === 0 && !loading && (
        <div className="mt-6 text-center text-sm text-content-secondary">Directory is empty.</div>
      )}

      {entries !== null && entries.length > 0 && (
        <div className="mt-3 rounded-lg border border-default bg-surface overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_140px] text-[10px] font-semibold tracking-wider text-content-secondary uppercase border-b border-default px-3 py-2">
            <div>Name</div>
            <div className="text-right">Size</div>
            <div className="text-right">Action</div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {entries.map(entry => {
              const fcPath = path.endsWith('/') ? `${path}${entry.name}` : `${path}/${entry.name}`;
              const dl = downloads[fcPath];
              return (
                <div
                  key={entry.name}
                  className="grid grid-cols-[1fr_120px_140px] items-center px-3 py-2 text-xs border-b border-subtle last:border-b-0 hover:bg-surface-raised/40"
                >
                  <button
                    onClick={() => handleEntryClick(entry)}
                    disabled={entry.kind !== 'dir'}
                    className={`flex items-center gap-2 text-left truncate ${
                      entry.kind === 'dir' ? 'text-content hover:text-blue-400 cursor-pointer' : 'text-content-secondary cursor-default'
                    }`}
                  >
                    {entry.kind === 'dir'
                      ? <Folder className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      : <File   className="w-4 h-4 text-content-tertiary flex-shrink-0" />}
                    <span className="font-mono truncate">{entry.name}</span>
                  </button>
                  <div className="text-right font-mono text-content-secondary">
                    {entry.kind === 'file' ? formatSize(entry.size ?? 0) : '—'}
                  </div>
                  <div className="flex justify-end items-center">
                    {entry.kind === 'file' && (
                      <DownloadButton state={dl} onClick={() => handleDownload(entry)} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ChromedShell>
  );
};

// ── Sub-components ──────────────────────────────────────────────

function ChromedShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col p-4 gap-3 overflow-y-auto">
      <div className="flex items-center gap-3 flex-shrink-0">
        <FolderOpen className="w-6 h-6 text-content-secondary" />
        <div>
          <h2 className="text-lg font-semibold text-content">FC Files</h2>
          <p className="text-xs text-content-secondary">Browse the flight controller's filesystem via MAVLink-FTP.</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="max-w-md text-center">
        <div className="text-content font-medium mb-1">{title}</div>
        <div className="text-sm text-content-secondary">{message}</div>
      </div>
    </div>
  );
}

interface PathBarProps {
  path: string;
  loading: boolean;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
}

/**
 * Breadcrumb navigation. Each segment is clickable and navigates to that
 * level. The home button jumps to root. The refresh button re-lists.
 */
function PathBar({ path, loading, onNavigate, onRefresh }: PathBarProps) {
  const parts = path.split('/').filter(Boolean);
  return (
    <div className="flex items-center gap-1 flex-wrap text-xs">
      <button
        onClick={() => onNavigate('/')}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-raised text-content-secondary hover:text-content"
        title="Go to root"
      >
        <Home className="w-3.5 h-3.5" />
      </button>
      {parts.map((part, i) => {
        const targetPath = '/' + parts.slice(0, i + 1).join('/');
        const isLast = i === parts.length - 1;
        return (
          <React.Fragment key={`${i}-${part}`}>
            <ChevronRight className="w-3 h-3 text-content-tertiary" />
            <button
              onClick={() => onNavigate(targetPath)}
              className={`px-2 py-1 rounded font-mono ${
                isLast
                  ? 'text-content font-medium cursor-default'
                  : 'text-content-secondary hover:bg-surface-raised hover:text-content'
              }`}
              disabled={isLast}
            >
              {part}
            </button>
          </React.Fragment>
        );
      })}
      <div className="flex-1" />
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-raised text-content-secondary hover:text-content disabled:opacity-50"
        title="Refresh listing"
      >
        {loading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <RefreshCw className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function DownloadButton({
  state,
  onClick,
}: {
  state: { state: 'downloading' | 'done' | 'error'; detail?: string } | undefined;
  onClick: () => void;
}) {
  if (state?.state === 'downloading') {
    return (
      <span className="flex items-center gap-1 text-content-secondary text-[11px]">
        <Loader2 className="w-3 h-3 animate-spin" />
        Downloading…
      </span>
    );
  }
  if (state?.state === 'done') {
    return (
      <button
        onClick={onClick}
        className="text-emerald-400 text-[11px] underline hover:text-emerald-300"
        title={`Saved to ${state.detail}`}
      >
        Saved · re-download
      </button>
    );
  }
  if (state?.state === 'error') {
    return (
      <button
        onClick={onClick}
        className="text-rose-400 text-[11px] underline hover:text-rose-300"
        title={state.detail ?? 'Download failed'}
      >
        Failed · retry
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-surface-raised hover:bg-surface-raised/70 text-content"
    >
      <Download className="w-3 h-3" />
      Download
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
