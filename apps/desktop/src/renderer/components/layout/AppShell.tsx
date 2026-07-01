import { type ReactNode, useEffect, useState } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useUpdateStore } from '../../stores/update-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useTheme } from '../../hooks/useTheme';
import { DebugConsole } from '../debug/DebugConsole';
import { UpdateBanner } from './UpdateBanner';
import { ArmDisarmButton } from './ArmDisarmButton';
import { FlightStrip } from './FlightStrip';
import { ScriptHealthBadge } from '../script-installer/ScriptHealthBadge';
import { QuickLaunchMenu } from './QuickLaunchMenu';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import iconImage from '../../assets/icon.png';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { connectionState, disconnect } = useConnectionStore();
  const { currentVersion, status, fetchVersion } = useUpdateStore();
  const setView = useNavigationStore((s) => s.setView);

  useTheme();

  useEffect(() => {
    fetchVersion();
  }, [fetchVersion]);

  // Tick once a second while the link is stale so the banner shows elapsed seconds.
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!connectionState.isStale) return;
    const id = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [connectionState.isStale]);

  const staleSeconds = connectionState.isStale && connectionState.staleSince
    ? Math.max(0, Math.floor((Date.now() - connectionState.staleSince) / 1000))
    : 0;

  return (
    <div className="h-screen flex flex-col bg-surface-base">
      {/* Header */}
      <header className="h-14 border-b border-subtle bg-surface-nav backdrop-blur-sm flex items-center shrink-0 relative z-50">
        {/* Logo is a wide wordmark (transparent bg) — size by height and let width
            follow its natural aspect ratio so it isn't cropped into a square. */}
        <img src={iconImage} alt="Jawji" className="h-7 w-auto ml-3 object-contain shrink-0" />

        <div className="ml-auto flex items-center gap-4 pr-6">
          {/* Version badge */}
          {currentVersion && (
            <button
              onClick={() => setView('settings')}
              className="flex items-center gap-1.5 text-content-tertiary hover:text-content-secondary transition-colors"
              title="About Jawji"
            >
              <span className="text-xs">v{currentVersion}</span>
              {(status === 'available' || status === 'downloaded') && (
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              )}
            </button>
          )}

          {/* FC-side Lua script health (only when advanced commands unlocked + AD_HB seen) */}
          <ScriptHealthBadge />

          {/* ARM / DISARM button */}
          <ArmDisarmButton />

          {/* Connection status */}
          {connectionState.isConnected ? (
            <button
              onClick={disconnect}
              title={connectionState.isStale ? `No data for ${staleSeconds}s. Click to disconnect` : 'Click to disconnect'}
              className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-surface border transition-colors cursor-pointer ${
                connectionState.isStale
                  ? 'border-yellow-500/50 hover:border-red-500/50'
                  : 'border-emerald-500/30 hover:border-red-500/50'
              }`}
            >
              {connectionState.isStale ? (
                <AlertTriangle size={12} className="text-yellow-400 animate-pulse" />
              ) : (
                <div className="status-dot status-dot-connected group-hover:bg-red-400" />
              )}
              <span className={`text-sm font-medium transition-colors ${
                connectionState.isStale ? 'text-yellow-300' : 'text-content-secondary group-hover:text-red-300'
              }`}>
                {connectionState.isStale ? `No data ${staleSeconds}s` : connectionState.transport}
              </span>
              <X size={12} className="text-content-tertiary opacity-0 group-hover:opacity-100 group-hover:text-red-400 transition-all" />
            </button>
          ) : (
            <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-surface border ${
              connectionState.isWaitingForHeartbeat
                ? 'border-yellow-500/30'
                : 'border-subtle'
            }`}>
              {connectionState.isWaitingForHeartbeat ? (
                <Loader2 size={10} className="text-yellow-400 animate-spin" />
              ) : (
                <div className="status-dot status-dot-disconnected" />
              )}
              <span className="text-sm font-medium text-content-secondary">
                {connectionState.isWaitingForHeartbeat ? 'Waiting...' : 'Disconnected'}
              </span>
            </div>
          )}

          {/* Quick Launch: open self-contained tools in their own window. */}
          <QuickLaunchMenu />
        </div>
      </header>

      {/* Update notification banner */}
      <UpdateBanner />

      {/* Main content */}
      <div className="flex-1 overflow-hidden">{children}</div>

      {/* Persistent flight controls strip */}
      <FlightStrip />

      {/* Debug console */}
      <DebugConsole />
    </div>
  );
}
