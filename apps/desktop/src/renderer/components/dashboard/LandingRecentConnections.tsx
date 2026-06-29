import { useState } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useSettingsStore, type SavedConnection } from '../../stores/settings-store';

function toConnectOptions(c: SavedConnection) {
  if (c.type === 'tcp') {
    return { type: 'tcp' as const, host: c.host ?? '127.0.0.1', tcpPort: c.port, protocol: c.protocol };
  }
  return {
    type: 'udp' as const,
    udpPort: c.udpMode === 'client' ? (c.udpClientLocalPort ?? 14550) : c.port,
    udpMode: c.udpMode ?? 'listen',
    udpRemoteHost: c.udpRemoteHost,
    udpRemotePort: c.udpRemotePort,
    udpClientLocalPort: c.udpClientLocalPort,
    protocol: c.protocol,
  };
}

/**
 * One-click reconnect shortcuts on the landing page, reusing the same
 * connectionMemory.recentConnections data ConnectionPanel's
 * RecentConnectionsButton reads — just surfaced where a returning user lands
 * first, instead of requiring a trip into the sidebar form.
 */
export function LandingRecentConnections() {
  const { connect, isConnecting } = useConnectionStore();
  const recentConnections = useSettingsStore((s) => s.connectionMemory.recentConnections ?? []);
  const [connectingLabel, setConnectingLabel] = useState<string | null>(null);

  const recents = [...recentConnections].sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 4);
  if (recents.length === 0) return null;

  const handleQuickConnect = async (c: SavedConnection) => {
    setConnectingLabel(c.label);
    try {
      await connect(toConnectOptions(c));
    } finally {
      setConnectingLabel(null);
    }
  };

  return (
    <div className="mb-6 text-left">
      <div className="section-header-eyebrow">Recent Connections</div>
      <div className="flex flex-wrap gap-2">
        {recents.map((c) => (
          <button
            key={c.label}
            onClick={() => handleQuickConnect(c)}
            disabled={isConnecting}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-raised border border-subtle text-sm text-content-secondary hover:text-content disabled:opacity-50 transition-colors"
          >
            {connectingLabel === c.label ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
            )}
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
