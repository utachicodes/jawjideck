/**
 * Survey Generator Registry
 *
 * Pluggable registry for survey pattern generators. Built-in generators
 * (grid, crosshatch, etc.) self-register at module load. Marketplace
 * modules (e.g. TOPAS Smart Survey) register from their renderer
 * entrypoint via `registerSurveyGenerator`. The mission file stores
 * `generatorId` on each survey group so a mission referencing a not-yet-
 * installed module renders as read-only but its cached WPs remain
 * uploadable.
 *
 * Spec: docs/superpowers/specs/2026-05-28-mission-groups-design.md
 *
 * PR 3 scope: replace the hardcoded switch in `survey-store.runGenerator`
 * with a registry lookup. Generators stay synchronous and accept the
 * existing `SurveyConfig` shape; PR 4 generalizes to async + a richer
 * GeneratorInput once survey groups become first-class.
 */

import type { SurveyConfig, SurveyPattern, SurveyResult } from './survey-types';

/**
 * Map the legacy `SurveyPattern` enum to a registry id. Existing saved
 * configs and presets still set `pattern: 'grid'`; the registry stores
 * `'builtin.grid'`. New consumers (TOPAS, future module-supplied
 * generators) reference registry ids directly.
 */
export function patternToGeneratorId(pattern: SurveyPattern): string {
  return `builtin.${pattern}`;
}

export interface SurveyGeneratorCapabilities {
  /** Generator can take interior boundaries (no-fly zones) inside the ROI. */
  supportsHoles: boolean;
  /** Generator can take a separate workspace polygon (allowed flight area). */
  supportsWorkspace: boolean;
  /** Generator's track width / line spacing requires camera + overlap settings. */
  requiresCamera: boolean;
  /** Generator runs asynchronously (e.g. remote API call). */
  isAsync: boolean;
  /** Generator hits a network resource and is subject to remote failure modes. */
  isRemote: boolean;
}

export interface SurveyGeneratorRegistration {
  /** Stable identifier serialized into mission files. Use reverse-DNS style. */
  id: string;
  /** Semver-ish. Lets future code detect schema migrations on saved groups. */
  version: string;
  displayName: string;
  description: string;
  capabilities: SurveyGeneratorCapabilities;
  /**
   * Execute the generator. Sync returns from built-ins are wrapped so callers
   * always `await` regardless of generator implementation. The current
   * `SurveyConfig` shape is preserved for PR 3; PR 4 introduces a richer
   * GeneratorInput once survey groups own the polygon + config.
   */
  generate(config: SurveyConfig): SurveyResult | Promise<SurveyResult>;
}

const registry = new Map<string, SurveyGeneratorRegistration>();

export function registerSurveyGenerator(reg: SurveyGeneratorRegistration): void {
  if (registry.has(reg.id)) {
    // Re-registering with the same id is allowed (HMR, test reseeds). Newer
    // wins; the registry is module-scoped, not persisted.
  }
  registry.set(reg.id, reg);
}

export function unregisterSurveyGenerator(id: string): void {
  registry.delete(id);
}

export function getSurveyGenerator(id: string): SurveyGeneratorRegistration | undefined {
  return registry.get(id);
}

export function listSurveyGenerators(): SurveyGeneratorRegistration[] {
  return Array.from(registry.values());
}

/**
 * Reset to a clean registry. Test-only helper. Production code never calls
 * this; the registry rebuilds itself at module load via the built-ins'
 * self-registration block.
 */
export function _resetRegistryForTests(): void {
  registry.clear();
}
