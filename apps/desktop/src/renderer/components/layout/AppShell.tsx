import { type ReactNode, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useUpdateStore } from '../../stores/update-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { DebugConsole } from '../debug/DebugConsole';
import { UpdateBanner } from './UpdateBanner';
import { ArmDisarmButton } from './ArmDisarmButton';
import iconImage from '../../assets/icon.png';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { connectionState, disconnect } = useConnectionStore();
  const { currentVersion, status, fetchVersion } = useUpdateStore();
  const setView = useNavigationStore((s) => s.setView);

  useEffect(() => {
    fetchVersion();
  }, [fetchVersion]);

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f]">
      {/* Header */}
      <header className="h-14 border-b border-gray-800/50 bg-gray-900/50 backdrop-blur-sm flex items-center px-6 shrink-0 relative z-50">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <img src={iconImage} alt="ArduDeck" className="h-8 rounded-md" />
          <h1 className="text-lg font-semibold text-white">ArduDeck</h1>
        </div>

        <div className="ml-auto flex items-center gap-4">
          {/* Version badge */}
          {currentVersion && (
            <button
              onClick={() => setView('settings')}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors"
              title="About ArduDeck"
            >
              <span className="text-xs">v{currentVersion}</span>
              {(status === 'available' || status === 'downloaded') && (
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              )}
            </button>
          )}

          {/* ARM / DISARM button */}
          <ArmDisarmButton />

          {/* Connection status */}
          {connectionState.isConnected ? (
            <button
              onClick={disconnect}
              title="Click to disconnect"
              className="group flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-gray-800/50 border border-emerald-500/30 hover:border-red-500/50 transition-colors cursor-pointer"
            >
              <div className="status-dot status-dot-connected group-hover:bg-red-400" />
              <span className="text-sm font-medium text-gray-300 group-hover:text-red-300 transition-colors">
                {connectionState.transport}
              </span>
              <svg className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 group-hover:text-red-400 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-gray-800/50 border ${
              connectionState.isWaitingForHeartbeat
                ? 'border-yellow-500/30'
                : 'border-gray-700/50'
            }`}>
              {connectionState.isWaitingForHeartbeat ? (
                <svg className="w-2.5 h-2.5 text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <div className="status-dot status-dot-disconnected" />
              )}
              <span className="text-sm font-medium text-gray-300">
                {connectionState.isWaitingForHeartbeat ? 'Waiting...' : 'Disconnected'}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Update notification banner */}
      <UpdateBanner />

      {/* Main content */}
      <div className="flex-1 overflow-hidden">{children}</div>

      {/* Debug console */}
      <DebugConsole />
    </div>
  );
}
