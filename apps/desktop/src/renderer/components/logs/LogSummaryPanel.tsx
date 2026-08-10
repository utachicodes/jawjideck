import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useResolvedTheme } from '../../hooks/useTheme';
import { useLogStore } from '../../stores/log-store';
import { computeLogSummary, formatDuration, type LogSummary } from './log-summary';

// uPlot chart style overrides (same CSS-variable theming as the Explorer).
const uplotStyle = document.createElement('style');
uplotStyle.textContent = `
  .u-select { background: rgba(59, 130, 246, 0.15) !important; border: 1px solid rgba(59, 130, 246, 0.5) !important; }
  .u-legend { font-size: 11px; padding: 4px 8px; }
  .u-legend .u-series { padding: 1px 4px; }
  .u-legend .u-label { color: var(--text-secondary); }
  .u-legend .u-value { color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .u-legend .u-series > * { vertical-align: middle; }
  .u-legend .u-marker { border-radius: 50%; }
`;
document.head.appendChild(uplotStyle);

function MiniChart({
  title,
  timeS,
  series,
  yLabel,
}: {
  title: string;
  timeS: number[];
  series: { label: string; color: string; values: number[] }[];
  yLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const resolvedTheme = useResolvedTheme();
  const isLight = resolvedTheme === 'light';

  useEffect(() => {
    const container = containerRef.current;
    if (!container || timeS.length < 2) return;
    const { width, height } = container.getBoundingClientRect();

    const data: uPlot.AlignedData = [
      new Float64Array(timeS),
      ...series.map((s) => new Float64Array(s.values)),
    ];

    const opts: uPlot.Options = {
      width: Math.max(width, 200),
      height: Math.max(height, 160),
      cursor: { drag: { x: true, y: false, uni: 50 } },
      select: { show: true, left: 0, top: 0, width: 0, height: 0 },
      scales: { x: { time: false }, y: { auto: true } },
      legend: { show: true },
      axes: [
        {
          label: 'Time (s)',
          stroke: isLight ? '#4b5563' : '#9ca3af',
          grid: { stroke: isLight ? '#e5e7eb' : '#1f2937', width: 1 },
          ticks: { stroke: isLight ? '#d1d5db' : '#374151', width: 1 },
          font: '11px system-ui',
        },
        {
          label: yLabel,
          stroke: isLight ? '#4b5563' : '#9ca3af',
          grid: { stroke: isLight ? '#e5e7eb' : '#1f2937', width: 1 },
          ticks: { stroke: isLight ? '#d1d5db' : '#374151', width: 1 },
          font: '11px system-ui',
        },
      ],
      series: [
        { label: 'Time' },
        ...series.map((s, i) => ({
          label: s.label,
          stroke: s.color,
          width: 1.5,
          points: { show: false },
          value: (self: uPlot, raw: number) => {
            if (raw == null || !Number.isFinite(raw)) return '-';
            return i === 0 ? String(raw.toFixed(2)) : String(raw.toFixed(1));
          },
        })),
      ],
    };

    plotRef.current = new uPlot(opts, data, container);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plotRef.current?.setSize({ width: entry.contentRect.width, height: Math.max(entry.contentRect.height, 150) });
      }
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (plotRef.current) { plotRef.current.destroy(); plotRef.current = null; }
    };
  }, [timeS, series, isLight, yLabel]);

  return (
    <div className="bg-surface border border-subtle rounded-lg overflow-hidden flex flex-col">
      <div className="px-3 py-1.5 text-xs font-medium text-content-secondary border-b border-subtle">{title}</div>
      <div ref={containerRef} className="flex-1 min-h-[160px]" />
    </div>
  );
}

function StatCard({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="bg-surface border border-subtle rounded-lg px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-content-tertiary">{label}</div>
      <div className="text-lg font-semibold text-content tabular-nums leading-tight mt-0.5">
        {value}
        {unit && <span className="text-xs font-normal text-content-secondary ml-1">{unit}</span>}
      </div>
      {sub && <div className="text-[10px] text-content-tertiary mt-0.5">{sub}</div>}
    </div>
  );
}

function fmt(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export function LogSummaryPanel() {
  const currentLog = useLogStore((s) => s.currentLog);
  const summary: LogSummary | null = useMemo(
    () => (currentLog ? computeLogSummary(currentLog) : null),
    [currentLog],
  );

  if (!summary) {
    return (
      <div className="h-full flex items-center justify-center text-content-tertiary text-xs">
        No log loaded
      </div>
    );
  }

  const { battery, gps, modeSegments, modeStats } = summary;
  const hasModes = modeSegments.length > 0;
  const totalModeS = modeStats.reduce((sum, ms) => sum + ms.seconds, 0);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Log metadata header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="text-base font-semibold text-content">
          {summary.vehicleType ? summary.vehicleType.toUpperCase() : 'Flight'} Log Summary
        </h3>
        {summary.firmwareString && (
          <span className="text-xs text-content-secondary">{summary.firmwareString}</span>
        )}
        {summary.boardType && (
          <span className="text-xs text-content-tertiary">{summary.boardType}</span>
        )}
        {summary.gitHash && (
          <span className="text-[10px] font-mono text-content-tertiary">{summary.gitHash}</span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 ml-auto">
          {formatDuration(summary.durationS)}
        </span>
      </div>

      {/* Flight stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
        <StatCard label="Flight Time" value={summary.flightTimeS !== null ? formatDuration(summary.flightTimeS) : '—'} sub={summary.flightTimeS !== null ? `of ${formatDuration(summary.durationS)} log` : undefined} />
        <StatCard label="Max Altitude" value={fmt(summary.maxAltM)} unit="m" sub={`min ${fmt(summary.minAltM)} m`} />
        <StatCard label="Max Climb Rate" value={fmt(summary.maxClimbRateMs)} unit="m/s" />
        <StatCard label="Max Speed" value={fmt(summary.maxSpeedMs)} unit="m/s" sub={summary.maxSpeedMs !== null ? `${fmt(summary.maxSpeedMs * 3.6)} km/h` : undefined} />
        <StatCard label="Distance Flown" value={gps ? gps.distanceFlownM.toLocaleString() : '—'} unit="m" />
        <StatCard label="Max Distance" value={gps ? gps.maxDistanceFromHomeM.toLocaleString() : '—'} unit="m" sub="from home" />
      </div>

      {/* Battery */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="Battery Min" value={battery ? fmt(battery.minVolt, 2) : '—'} unit="V" sub={battery ? `max ${fmt(battery.maxVolt, 2)} V` : undefined} />
        <StatCard label="Max Current" value={battery ? fmt(battery.maxCurr) : '—'} unit="A" />
        <StatCard label="Consumed" value={battery ? battery.consumedMah.toLocaleString() : '—'} unit="mAh" />
        <StatCard label="GPS Satellites" value={gps ? `${gps.minSats}–${gps.maxSats}` : '—'} sub={gps ? `HDOP ${fmt(gps.minHDop, 1)}–${fmt(gps.maxHDop, 1)}` : undefined} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {battery && (
          <MiniChart
            title="Battery"
            yLabel="Voltage (V) / Current (A)"
            timeS={battery.timeS}
            series={[
              { label: 'Volt', color: '#3b82f6', values: battery.volt },
              { label: 'Curr', color: '#f59e0b', values: battery.curr },
            ]}
          />
        )}
        {gps && (
          <MiniChart
            title="Altitude (MSL)"
            yLabel="Altitude (m)"
            timeS={gps.timeS}
            series={[{ label: 'Alt', color: '#10b981', values: gps.alt }]}
          />
        )}
        {!battery && !gps && (
          <div className="bg-surface border border-subtle rounded-lg px-3 py-6 text-center text-xs text-content-tertiary col-span-full">
            No battery or GPS series in this log — only summary values are available.
          </div>
        )}
      </div>

      {/* Mode timeline */}
      {hasModes && (
        <div className="bg-surface border border-subtle rounded-lg p-3 space-y-2">
          <div className="text-xs font-medium text-content-secondary">Flight Modes</div>
          {/* Full-log strip */}
          <div className="h-6 rounded overflow-hidden flex bg-surface-raised" title="Mode timeline across the whole log">
            {modeSegments.map((seg, i) => {
              const widthPct = (Math.max(0, seg.endS - seg.startS) / summary.durationS) * 100;
              return (
                <div
                  key={i}
                  className="h-full"
                  style={{ width: `${widthPct}%`, background: seg.color }}
                  title={`${seg.name}: ${formatDuration(seg.endS - seg.startS)}`}
                />
              );
            })}
          </div>
          {/* Mode legend with durations */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {modeStats.map((ms) => (
              <div key={ms.name} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ms.color }} />
                <span className="text-content font-medium">{ms.name}</span>
                <span className="text-content-secondary tabular-nums">{formatDuration(ms.seconds)}</span>
                <span className="text-content-tertiary tabular-nums">
                  {totalModeS > 0 ? `${Math.round((ms.seconds / totalModeS) * 100)}%` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
