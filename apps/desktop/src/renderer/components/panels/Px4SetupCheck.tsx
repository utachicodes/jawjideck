/**
 * Px4SetupCheck — lists the PX4 settings this app's flight controls depend on
 * (stick input source, auto-disarm after landing, default takeoff altitude)
 * and offers a one-click fix for any value that would block them.
 */

import { useState } from 'react';
import { useParameterStore } from '../../stores/parameter-store';
import { PX4_SETUP_RULES } from '../../../shared/px4';

export function Px4SetupCheck() {
  const parameters = useParameterStore((s) => s.parameters);
  const setParameter = useParameterStore((s) => s.setParameter);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = PX4_SETUP_RULES.map((rule) => {
    const value = parameters.get(rule.param)?.value;
    return { rule, value, needsFix: value !== undefined && rule.needsFix(value) };
  });
  const toFix = rows.filter((r) => r.needsFix);
  const loaded = rows.some((r) => r.value !== undefined);

  const applyRecommended = async () => {
    setApplying(true);
    setError(null);
    const failed: string[] = [];
    for (const { rule } of toFix) {
      if (!(await setParameter(rule.param, rule.recommended))) failed.push(rule.param);
    }
    if (failed.length) setError(`Could not set ${failed.join(', ')}`);
    setApplying(false);
  };

  if (!loaded) return null;

  return (
    <div className={`rounded-xl border-2 p-3 ${toFix.length ? 'border-amber-500/40 bg-amber-500/10' : 'border-subtle bg-surface'}`}>
      <div className="text-xs font-bold uppercase tracking-wider text-content-secondary mb-2">PX4 flight setup</div>
      <div className="flex flex-col gap-1.5">
        {rows.map(({ rule, value, needsFix }) => (
          <div key={rule.param} className="flex items-start justify-between gap-3 text-sm" title={`${rule.param}: ${rule.why}`}>
            <span className="text-content-secondary">{rule.label}</span>
            <span className={`font-mono text-right ${needsFix ? 'text-amber-300' : 'text-content'}`}>
              {value === undefined ? '—' : rule.describe(value)}
              {needsFix && <span className="text-content-tertiary"> → {rule.describe(rule.recommended)}</span>}
            </span>
          </div>
        ))}
      </div>
      {toFix.length > 0 && (
        <>
          <p className="text-xs text-amber-200/80 mt-2">{toFix.map((r) => r.rule.why).join(' ')}</p>
          <button
            onClick={applyRecommended}
            disabled={applying}
            className="mt-2 w-full px-3 py-2 text-sm font-bold rounded-lg bg-amber-500/25 hover:bg-amber-500/35 text-amber-100 disabled:opacity-50"
          >
            {applying ? 'Applying…' : `Apply recommended (${toFix.length})`}
          </button>
        </>
      )}
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
