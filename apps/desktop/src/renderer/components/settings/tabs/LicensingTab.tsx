import { useState } from 'react';
import { LogIn, LogOut, KeyRound, ShoppingCart, Sparkles, WifiOff, AlertTriangle } from 'lucide-react';
import { useLicensingStore, type LicenseType } from '../../../stores/licensing-store';
import { useIntelligenceCatalog } from '../../../hooks/useIntelligenceCatalog';
import { useSyncStore } from '../../../stores/sync-store';

function SyncStatusSection() {
  const syncing = useSyncStore((s) => s.syncing);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const error = useSyncStore((s) => s.error);
  const syncMissions = useSyncStore((s) => s.syncMissions);
  const syncSettings = useSyncStore((s) => s.syncSettings);

  const handleSyncNow = () => {
    void syncMissions();
    void syncSettings();
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-content">Mission &amp; Settings Sync</h4>
      <p className="text-[11px] text-content-secondary">
        Missions and settings sync automatically when you sign in and after each local
        change. Use this to sync immediately.
      </p>
      <button
        onClick={handleSyncNow}
        disabled={syncing}
        className="px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface disabled:opacity-50 text-content text-xs font-medium"
      >
        {syncing ? 'Syncing\u2026' : 'Sync now'}
      </button>
      {lastSyncedAt && (
        <p className="text-[10px] text-content-tertiary">
          Last synced {new Date(lastSyncedAt).toLocaleTimeString()}
        </p>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

function formatCachedAt(cachedAt: number | null): string {
  if (!cachedAt) return 'unknown';
  const minutes = Math.round((Date.now() - cachedAt) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'trialing': return 'Trial';
    case 'active': return 'Active';
    case 'past_due': return 'Past due';
    case 'canceled': return 'Canceled';
    default: return 'None';
  }
}

export function LicensingTab() {
  const {
    user, authLoading, entitlements, entitlementsLoading, error,
    offline, needsReverification, cachedAt,
    signIn, signOutUser, activateCode, startCheckout,
  } = useLicensingStore();
  const [code, setCode] = useState('');
  const [activating, setActivating] = useState(false);
  const catalog = useIntelligenceCatalog();

  if (authLoading) {
    return <div className="text-sm text-content-secondary">Loading…</div>;
  }

  if (!user) {
    return (
      <section className="bg-surface rounded-xl border border-subtle p-5 space-y-3">
        <h3 className="text-lg font-semibold text-content">Sign in</h3>
        <p className="text-sm text-content-secondary">
          Sign in with your Jawji account to see your subscription, activate a license, or buy jawji-orchestrator
          or a Jawji Intelligence module. Opens jawji.space in your browser.
        </p>
        <button
          onClick={() => void signIn()}
          className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 w-fit"
        >
          <LogIn size={14} /> Sign in
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {offline && !needsReverification && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <WifiOff size={14} className="shrink-0" />
          Offline — showing your license status as of {formatCachedAt(cachedAt)}.
        </div>
      )}
      {needsReverification && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertTriangle size={14} className="shrink-0" />
          Needs re-verification — last confirmed {formatCachedAt(cachedAt)}, more than 7 days ago. Connect to
          refresh; this may no longer reflect your actual license status.
        </div>
      )}

      <section className="bg-surface rounded-xl border border-subtle p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-content">{user.email ?? user.displayName ?? 'Signed in'}</h3>
            <p className="text-sm text-content-secondary mt-0.5">
              Subscription: {entitlementsLoading ? '…' : statusLabel(entitlements?.subscription.status ?? 'none')}
            </p>
          </div>
          <button
            onClick={() => void signOutUser()}
            className="px-3 py-1.5 text-xs text-content-secondary hover:text-content border border-border rounded-lg transition-colors flex items-center gap-1.5"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>

        {entitlements && entitlements.licenses.length > 0 && (
          <div className="pt-3 border-t border-subtle space-y-2">
            {entitlements.licenses.map((lic) => (
              <div key={lic.id} className="flex items-center justify-between text-sm">
                <span className="text-content">{lic.type}{lic.moduleId ? ` · ${lic.moduleId}` : ''}</span>
                <span className={lic.status === 'active' ? 'text-emerald-400' : 'text-content-secondary'}>{lic.status}</span>
              </div>
            ))}
          </div>
        )}

        <div className="pt-3 border-t border-subtle space-y-2">
          <p className="text-xs text-content-secondary">Activate a code</p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="13-character code"
              maxLength={13}
              className="flex-1 px-3 py-1.5 bg-surface-input border border-subtle rounded-lg text-sm font-mono"
            />
            <button
              disabled={!code || activating}
              onClick={async () => {
                setActivating(true);
                const ok = await activateCode(code);
                setActivating(false);
                if (ok) setCode('');
              }}
              className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500/80 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            >
              <KeyRound size={14} /> Activate
            </button>
          </div>
          <p className="text-xs text-content-tertiary">
            For a jawji-orchestrator code, activate it from the companion computer instead
            (<code>jawji-orchestrator activate &lt;code&gt;</code>) — that binds the license to the
            device actually running Orchestrator. Activating an orchestrator code here leaves it unbound.
          </p>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="pt-3 border-t border-subtle flex flex-wrap gap-2">
          {(['orchestrator'] as LicenseType[]).map((type) => (
            <button
              key={type}
              onClick={() => void startCheckout(type)}
              className="px-3 py-1.5 text-xs text-content-secondary hover:text-content border border-border rounded-lg transition-colors flex items-center gap-1.5"
            >
              <ShoppingCart size={14} /> Buy jawji-orchestrator
            </button>
          ))}
        </div>
      </section>

      <section className="bg-surface rounded-xl border border-subtle p-5 space-y-3">
        <SyncStatusSection />
      </section>

      <section className="bg-surface rounded-xl border border-subtle p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-blue-400" />
          <h3 className="text-lg font-semibold text-content">Jawji Intelligence</h3>
        </div>
        <p className="text-sm text-content-secondary">Cloud AI modules for aerial imagery, gated by your license.</p>
        {catalog.loading && <p className="text-xs text-content-secondary">Loading catalog…</p>}
        {!catalog.loading && catalog.modules.map((mod) => (
          <div key={mod.moduleId} className="flex items-center justify-between py-2 border-t border-subtle first:border-t-0">
            <div>
              <p className="text-sm text-content">{mod.name}</p>
              <p className="text-xs text-content-secondary mt-0.5">{mod.description}</p>
            </div>
            {mod.hasAccess ? (
              <span className="text-xs text-emerald-400 shrink-0 ml-3">Active</span>
            ) : (
              <button
                onClick={() => void startCheckout('intelligence-module', mod.moduleId)}
                className="shrink-0 ml-3 px-2.5 py-1 text-xs text-content-secondary hover:text-content border border-border rounded-lg transition-colors"
              >
                Buy
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
