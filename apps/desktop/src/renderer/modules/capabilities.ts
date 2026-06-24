import { useMemo } from 'react';
import type { ViewId } from '../stores/navigation-store';
import { useModuleStore } from '../stores/module-store';

/**
 * Built-in features gated behind a Hangar "activatable" module.
 *
 * A view that is NOT listed here is always available. To make an existing
 * built-in feature activatable, add an entry mapping the Hangar module slug to
 * the view it gates - the nav item and any view navigation then require that
 * module to be activated (via the Hangar / a license key). No other code change
 * is needed; NavigationRail and the deep-link handler both consult this map.
 */
export interface Capability {
  /** Hangar module slug whose activation enables this view. */
  slug: string;
  /** The built-in view this capability gates. */
  viewId: ViewId;
}

export const CAPABILITIES: Capability[] = [
  // Example (not active): { slug: 'com.jawji.area-editor', viewId: 'mission' },
];

const GATED_VIEWS: ReadonlyMap<ViewId, string> = new Map(
  CAPABILITIES.map((c): [ViewId, string] => [c.viewId, c.slug]),
);

/** True if `viewId` is available given the set of enabled activatable slugs. */
export function isViewAvailable(viewId: ViewId, enabledSlugs: ReadonlySet<string>): boolean {
  const requiredSlug = GATED_VIEWS.get(viewId);
  return !requiredSlug || enabledSlugs.has(requiredSlug);
}

/** Reactive set of activatable module slugs currently enabled on this device. */
export function useEnabledCapabilitySlugs(): ReadonlySet<string> {
  const modules = useModuleStore((s) => s.modules);
  return useMemo(
    () => new Set(modules.filter((m) => m.activatable).map((m) => m.slug)),
    [modules],
  );
}
