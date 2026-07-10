import { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { useLicensingStore } from '../stores/licensing-store';

const JAWJI_GCS_URL = import.meta.env.VITE_JAWJI_GCS_URL || 'https://jawji.space';

// Mirrors lib/server/intelligence/access.ts's hasModuleAccess in jawji-gcs:
// base-detection is free with any active/trialing subscription, everything
// else needs a matching active intelligence-module License.
const FREE_WITH_ANY_ACTIVE_SUBSCRIPTION = new Set(['base-detection']);

export interface IntelligenceModuleWithAccess {
  moduleId: string;
  name: string;
  description: string;
  hasAccess: boolean;
}

interface CatalogState {
  modules: IntelligenceModuleWithAccess[];
  loading: boolean;
  error: string | null;
}

/** Fetches jawji-gcs's Jawji Intelligence module catalog + this user's access to each. */
export function useIntelligenceCatalog(): CatalogState {
  const user = useLicensingStore((s) => s.user);
  const entitlements = useLicensingStore((s) => s.entitlements);
  const [state, setState] = useState<CatalogState>({ modules: [], loading: false, error: null });

  useEffect(() => {
    if (!user) {
      setState({ modules: [], loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        const res = await fetch(`${JAWJI_GCS_URL}/api/intelligence/modules`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) throw new Error(`Failed to load module catalog (${res.status})`);
        const { modules } = (await res.json()) as {
          modules: Array<{ moduleId: string; name: string; description: string }>;
        };
        if (cancelled) return;
        const hasActiveSubscription =
          entitlements?.subscription.status === 'active' || entitlements?.subscription.status === 'trialing';
        const activeModuleIds = new Set(
          (entitlements?.licenses ?? [])
            .filter((l) => l.status === 'active' && l.type === 'intelligence-module' && l.moduleId)
            .map((l) => l.moduleId as string)
        );
        setState({
          modules: modules.map((m) => ({
            ...m,
            hasAccess: FREE_WITH_ANY_ACTIVE_SUBSCRIPTION.has(m.moduleId)
              ? hasActiveSubscription
              : activeModuleIds.has(m.moduleId),
          })),
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({ modules: [], loading: false, error: err instanceof Error ? err.message : 'Failed to load' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, entitlements]);

  return state;
}
