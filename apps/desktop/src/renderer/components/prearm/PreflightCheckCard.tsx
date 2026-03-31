import { useState, useMemo } from 'react';
import { useMessagesStore } from '../../stores/messages-store';
import {
  PREARM_CATEGORIES,
  isPreArmMessage,
  matchPreArmError,
  type PreArmCategory,
} from '../../../shared/prearm-checks';
import { PreArmParamFix } from './PreArmParamFix';
import { PanelContainer } from '../panels/panel-utils';

export function PreflightCheckCard() {
  const messages = useMessagesStore((s) => s.messages);
  const [lastCheckTs, setLastCheckTs] = useState(() => Date.now() - 30_000);
  const [isChecking, setIsChecking] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<PreArmCategory>>(new Set());

  // Filter for fresh pre-arm messages and match them
  const activeErrors = useMemo(() => {
    return messages
      .filter((m) => m.timestamp >= lastCheckTs && isPreArmMessage(m.text))
      .map((m) => {
        const result = matchPreArmError(m.text);
        return result ? { message: m, ...result } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [messages, lastCheckTs]);

  // Group errors by category, deduplicate by reason
  const errorsByCategory = useMemo(() => {
    const map = new Map<PreArmCategory, typeof activeErrors>();
    for (const err of activeErrors) {
      const cat = err.pattern.category;
      const existing = map.get(cat) ?? [];
      if (!existing.some((e) => e.reason === err.reason)) {
        existing.push(err);
      }
      map.set(cat, existing);
    }
    return map;
  }, [activeErrors]);

  const issueCount = errorsByCategory.size;
  const allClear = issueCount === 0 && !isChecking;

  const handleRecheck = () => {
    setLastCheckTs(Date.now());
    setIsChecking(true);
    setExpandedCategories(new Set());
    setTimeout(() => setIsChecking(false), 3000);
  };

  const toggleCategory = (cat: PreArmCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <PanelContainer className="flex flex-col gap-0 p-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/40 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-200">Pre-flight Checks</span>
          {isChecking ? (
            <span className="text-[10px] text-blue-400 animate-pulse">Checking...</span>
          ) : issueCount > 0 ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
              {issueCount} issue{issueCount !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
              Ready
            </span>
          )}
        </div>
        <button
          onClick={handleRecheck}
          disabled={isChecking}
          className="text-[10px] text-gray-400 hover:text-gray-200 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-700/30 disabled:opacity-50"
        >
          Recheck
        </button>
      </div>

      {/* Category list */}
      <div className="flex-1 overflow-auto">
        <div className="divide-y divide-gray-800/50">
          {PREARM_CATEGORIES.map(({ id, label }) => {
            const errors = errorsByCategory.get(id);
            const hasFailed = errors && errors.length > 0;
            const isExpanded = expandedCategories.has(id);

            return (
              <div key={id}>
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs ${
                    hasFailed ? 'cursor-pointer hover:bg-gray-800/30' : ''
                  } transition-colors`}
                  onClick={hasFailed ? () => toggleCategory(id) : undefined}
                >
                  {isChecking ? (
                    <span className="w-3.5 text-center text-gray-500">-</span>
                  ) : hasFailed ? (
                    <span className="w-3.5 text-center text-red-400 font-bold text-[11px]">✗</span>
                  ) : (
                    <span className="w-3.5 text-center text-emerald-400 text-[11px]">✓</span>
                  )}

                  <span className={`flex-1 ${hasFailed ? 'text-gray-200' : 'text-gray-500'}`}>
                    {label}
                  </span>

                  {hasFailed && (
                    <span className="text-[10px] text-gray-500">
                      {isExpanded ? '▾' : '›'}
                    </span>
                  )}
                </div>

                {hasFailed && isExpanded && errors.map((err, i) => (
                  <div key={`${err.reason}-${i}`} className="border-t border-gray-700/20">
                    <div className="px-3 py-1 pl-8 text-[11px] text-gray-400 font-mono">
                      {err.reason}
                    </div>
                    <div className="pl-5">
                      <PreArmParamFix
                        paramIds={err.pattern.fix.params}
                        hint={err.pattern.fix.hint}
                        action={err.pattern.fix.action}
                        navigateTo={err.pattern.fix.navigateTo}
                      />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {allClear && (
          <div className="px-3 py-2 border-t border-gray-700/40">
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <span>✓</span>
              <span>Ready to Arm</span>
            </div>
          </div>
        )}
      </div>
    </PanelContainer>
  );
}
