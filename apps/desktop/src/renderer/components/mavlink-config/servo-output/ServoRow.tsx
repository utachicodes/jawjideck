/**
 * ServoRow — one channel in the Servo Output table.
 *
 * Renders live PWM bar + Reverse / Function / Min / Trim / Max editors.
 * Number inputs keep their own draft state and commit on blur or Enter, so
 * the user can type freely without partial values being sent mid-stroke.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { ParameterWithMeta } from '../../../../shared/parameter-types';

interface Option {
  value: number;
  label: string;
}

interface ServoRowProps {
  channel: number;
  parameters: Map<string, ParameterWithMeta>;
  setParameter: (paramId: string, value: number) => Promise<boolean>;
  functionOptions: Option[] | null;
  livePwm: number | undefined;
  liveStale: boolean;
  pwmMin: number;
  pwmMax: number;
}

export const ServoRow: React.FC<ServoRowProps> = React.memo(
  ({ channel, parameters, setParameter, functionOptions, livePwm, liveStale, pwmMin, pwmMax }) => {
    const prefix = `SERVO${channel}`;
    const functionParam = parameters.get(`${prefix}_FUNCTION`);
    const reversedParam = parameters.get(`${prefix}_REVERSED`);
    const minParam = parameters.get(`${prefix}_MIN`);
    const trimParam = parameters.get(`${prefix}_TRIM`);
    const maxParam = parameters.get(`${prefix}_MAX`);

    const hasParams = Boolean(functionParam || minParam || trimParam || maxParam);
    const funcValue = functionParam?.value ?? 0;
    const reversed = (reversedParam?.value ?? 0) > 0;

    const liveVal = livePwm ?? 0;
    const pct =
      liveVal > 0
        ? Math.min(100, Math.max(0, ((liveVal - pwmMin) / (pwmMax - pwmMin)) * 100))
        : 0;

    const onToggleReverse = useCallback(() => {
      setParameter(`${prefix}_REVERSED`, reversed ? 0 : 1);
    }, [prefix, reversed, setParameter]);

    const onFunctionChange = useCallback(
      (e: React.ChangeEvent<HTMLSelectElement>) => {
        const v = Number(e.target.value);
        if (!Number.isNaN(v)) setParameter(`${prefix}_FUNCTION`, v);
      },
      [prefix, setParameter]
    );

    return (
      <div className="grid grid-cols-[40px_1fr_80px_minmax(180px,1fr)_80px_80px_80px] gap-2 items-center px-3 py-2 hover:bg-surface-raised/30">
        {/* Channel number */}
        <div className="text-center text-sm font-mono text-content-secondary">{channel}</div>

        {/* Live PWM bar */}
        <div className="relative h-7 rounded bg-surface-base border border-subtle overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 transition-all duration-75 ${
              liveStale ? 'bg-content-tertiary/30' : 'bg-emerald-500/50'
            }`}
            style={{ width: `${pct}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-content">
            {liveVal > 0 ? liveVal : '—'}
          </div>
        </div>

        {/* Reverse checkbox */}
        <div className="flex justify-center">
          <input
            type="checkbox"
            checked={reversed}
            disabled={!reversedParam}
            onChange={onToggleReverse}
            className="w-4 h-4 rounded border-subtle bg-surface-base accent-pink-500 disabled:opacity-40"
          />
        </div>

        {/* Function dropdown */}
        <div>
          {functionOptions && functionOptions.length > 0 ? (
            <select
              value={funcValue}
              disabled={!functionParam}
              onChange={onFunctionChange}
              className="w-full h-8 px-2 text-sm rounded bg-surface-base border border-subtle text-content disabled:opacity-40"
            >
              {!functionOptions.some((o) => o.value === funcValue) && (
                <option value={funcValue}>{`Unknown (${funcValue})`}</option>
              )}
              {functionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <NumberCell
              param={`${prefix}_FUNCTION`}
              value={funcValue}
              disabled={!functionParam}
              setParameter={setParameter}
              min={-1}
              max={255}
            />
          )}
        </div>

        {/* Min / Trim / Max */}
        <NumberCell
          param={`${prefix}_MIN`}
          value={minParam?.value ?? 0}
          disabled={!minParam}
          setParameter={setParameter}
          min={pwmMin}
          max={pwmMax}
        />
        <NumberCell
          param={`${prefix}_TRIM`}
          value={trimParam?.value ?? 0}
          disabled={!trimParam}
          setParameter={setParameter}
          min={pwmMin}
          max={pwmMax}
        />
        <NumberCell
          param={`${prefix}_MAX`}
          value={maxParam?.value ?? 0}
          disabled={!maxParam}
          setParameter={setParameter}
          min={pwmMin}
          max={pwmMax}
        />

        {!hasParams && (
          <div className="col-span-7 text-xs text-content-tertiary text-center">
            (params not loaded for channel {channel})
          </div>
        )}
      </div>
    );
  }
);

ServoRow.displayName = 'ServoRow';

interface NumberCellProps {
  param: string;
  value: number;
  disabled: boolean;
  setParameter: (paramId: string, value: number) => Promise<boolean>;
  min: number;
  max: number;
}

const NumberCell: React.FC<NumberCellProps> = ({ param, value, disabled, setParameter, min, max }) => {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = useCallback(() => {
    const n = Number(draft);
    if (Number.isNaN(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    if (clamped !== value) {
      setParameter(param, clamped);
    }
    if (String(clamped) !== draft) setDraft(String(clamped));
  }, [draft, value, min, max, param, setParameter]);

  const onKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        setDraft(String(value));
        e.currentTarget.blur();
      }
    },
    [value]
  );

  return (
    <input
      type="number"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      className="h-8 w-full px-2 text-sm text-center rounded bg-surface-base border border-subtle text-content font-mono disabled:opacity-40 focus:outline-none focus:border-pink-500/60"
    />
  );
};
