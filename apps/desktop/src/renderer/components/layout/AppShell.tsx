import { type ReactNode, useEffect, useState } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useUpdateStore } from '../../stores/update-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useFlightControlStore } from '../../stores/flight-control-store';
import { useGamepad } from '../../hooks/useGamepad';
import { useTheme } from '../../hooks/useTheme';
import { DebugConsole } from '../debug/DebugConsole';
import { ThemeTransitionLayer } from './ThemeTransitionLayer';
import { UpdateBanner } from './UpdateBanner';
import { ArmDisarmButton } from './ArmDisarmButton';
import { FlightStrip } from './FlightStrip';
import { ScriptHealthBadge } from '../script-installer/ScriptHealthBadge';
import { QuickLaunchMenu } from './QuickLaunchMenu';
import { AlertTriangle, X, Loader2, Keyboard, Gamepad2 } from 'lucide-react';
import iconImage from '../../assets/icon.png';

/**
 * Input-method selector — Keyboard and Joystick are mutually exclusive (both
 * write the same RC channels, so running both at once would fight each
 * other). Clicking the active one turns control off; clicking the other
 * switches to it.
 */
function InputModeToggle() {
  const connectionState = useConnectionStore((s) => s.connectionState);
  const { kbActive, toggleKbActive, gpActive, toggleGpActive } = useFlightControlStore();
  const gamepad = useGamepad();
  const isConnected = connectionState?.isConnected ?? false;
  const protocol = connectionState?.protocol;

  if (!isConnected || (protocol !== 'msp' && protocol !== 'mavlink')) return null;

  return (
    <div className="flex items-center rounded-full border border-border bg-surface p-0.5 gap-0.5">
      <button
        onClick={toggleKbActive}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide transition-colors
          ${kbActive
            ? 'bg-blue-500/20 text-blue-400'
            : 'text-content-secondary hover:bg-surface-raised hover:text-content'
          }`}
        title="Keyboard RC control (WASD + QE + Arrows)"
      >
        <Keyboard size={13} />
        <span>KB</span>
      </button>
      <button
        onClick={toggleGpActive}
        disabled={!gamepad.connected}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide transition-colors
          ${gpActive
            ? 'bg-blue-500/20 text-blue-400'
            : gamepad.connected
              ? 'text-content-secondary hover:bg-surface-raised hover:text-content'
              : 'text-content-disabled opacity-40 cursor-not-allowed'
          }`}
        title={gamepad.connected ? `Joystick RC control (${gamepad.name})` : 'No gamepad detected — connect a controller'}
      >
        <Gamepad2 size={13} />
        <span>JOY</span>
      </button>
    </div>
  );
}

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

          {/* Keyboard / Joystick RC control selector */}
          <InputModeToggle />

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

      {/* Rising sun/moon icon for the theme-switch reveal animation */}
      <ThemeTransitionLayer />
    </div>
  );
}
