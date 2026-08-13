import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { ParsedLog } from '../../stores/log-store';
import { useLogStore } from '../../stores/log-store';
import { getModeTimeline, type ModeSegment } from './log-utils';
import type { PlotMarker } from './log-ai-tools';

const SERIES_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

const MAX_POINTS = 500;

interface Series {
  label: string;
  time: number[];
  values: number[];
}

function numeric(m: { fields: Record<string, number | string> }, key: string): number | null {
  const v = m.fields[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function decimate(time: number[], values: number[]): { time: number[]; values: number[] } {
  if (time.length <= MAX_POINTS) return { time, values };
  const stride = time.length / MAX_POINTS;
  const outT: number[] = [];
  const outV: number[] = [];
  for (let i = 0; i < time.length; i += stride) {
    outT.push(time[Math.floor(i)]!);
    outV.push(values[Math.floor(i)]!);
  }
  if (outT[outT.length - 1] !== time[time.length - 1]) {
    outT.push(time[time.length - 1]!);
    outV.push(values[values.length - 1]!);
  }
  return { time: outT, values: outV };
}

/** Build time-series data for a plot marker straight from the parsed log. */
export function buildPlotData(
  log: ParsedLog,
  marker: PlotMarker,
): { series: Series[]; startS: number; endS: number } | null {
  const all = log.messages[marker.type];
  if (!all || all.length === 0) return null;

  const base = log.timeRange.startUs;
  const lo = marker.startS != null ? base + marker.startS * 1_000_000 : -Infinity;
  const hi = marker.endS != null ? base + marker.endS * 1_000_000 : Infinity;
  const msgs = all.filter((m) => m.timeUs >= lo && m.timeUs <= hi);
  if (msgs.length === 0) return null;

  // Multi-instance detection (Instance / I field), same as the Explorer.
  const sample = msgs[0]!;
  const instanceKey =
    sample.fields['Instance'] !== undefined ? 'Instance'
    : sample.fields['I'] !== undefined ? 'I'
    : null;
  const distinctInstances = new Set<number>();
  if (instanceKey) {
    const limit = Math.min(msgs.length, 1024);
    for (let i = 0; i < limit; i++) {
      const v = msgs[i]!.fields[instanceKey];
      if (typeof v === 'number') distinctInstances.add(v);
    }
  }
  const splitByInstance = instanceKey != null && distinctInstances.size > 1;

  // Field fallback: numeric fields of the type's first record.
  let fields = marker.fields.filter((f) => f.length > 0);
  if (fields.length === 0) {
    fields = Object.keys(sample.fields).filter((f) => typeof sample.fields[f] === 'number');
  }
  if (fields.length === 0) return null;

  const labelPrefix = `${marker.type}.`;
  const series: Series[] = [];

  for (const field of fields) {
    if (splitByInstance && instanceKey) {
      const byInst = new Map<number, { time: number[]; values: number[] }>();
      for (const m of msgs) {
        const inst = m.fields[instanceKey];
        if (typeof inst !== 'number') continue;
        const v = numeric(m, field);
        if (v === null) continue;
        let bucket = byInst.get(inst);
        if (!bucket) { bucket = { time: [], values: [] }; byInst.set(inst, bucket); }
        bucket.time.push((m.timeUs - base) / 1_000_000);
        bucket.values.push(v);
      }
      for (const [inst, bucket] of [...byInst.entries()].sort((a, b) => a[0] - b[0])) {
        const ds = decimate(bucket.time, bucket.values);
        series.push({ label: `${marker.type}[${inst}].${field}`, time: ds.time, values: ds.values });
      }
    } else {
      const time: number[] = [];
      const values: number[] = [];
      for (const m of msgs) {
        const v = numeric(m, field);
        if (v === null) continue;
        time.push((m.timeUs - base) / 1_000_000);
        values.push(v);
      }
      if (time.length === 0) continue;
      const ds = decimate(time, values);
      series.push({ label: `${labelPrefix}${field}`, time: ds.time, values: ds.values });
    }
  }

  if (series.length === 0) return null;

  const windowStartS = marker.startS ?? (msgs[0]!.timeUs - base) / 1_000_000;
  const windowEndS = marker.endS ?? (msgs[msgs.length - 1]!.timeUs - base) / 1_000_000;
  return { series, startS: windowStartS, endS: windowEndS };
}

export function AiPlotCard({
  log,
  marker,
  isLight,
  onOpenInExplorer,
}: {
  log: ParsedLog;
  marker: PlotMarker;
  isLight: boolean;
  onOpenInExplorer?: (marker: PlotMarker) => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  const data = useMemo(() => buildPlotData(log, marker), [log, marker]);
  const modeTimeline = useMemo<ModeSegment[]>(() => getModeTimeline(log), [log]);

  const title = marker.title || `${marker.type} (${marker.fields.join(', ')})`;

  useEffect(() => {
    const container = chartRef.current;
    if (!container || !data) {
      if (plotRef.current) { plotRef.current.destroy(); plotRef.current = null; }
      return;
    }

    const { width, height } = container.getBoundingClientRect();

    // Merge per-series time axes onto a union axis (different sample rates
    // per instance/sensor are common).
    const timeSet = new Set<number>();
    for (const s of data.series) for (const t of s.time) timeSet.add(t);
    const unionTime = Float64Array.from(timeSet).sort();
    const aligned = data.series.map((s) => {
      const out = new Float64Array(unionTime.length).fill(NaN);
      let j = 0;
      for (let i = 0; i < unionTime.length && j < s.time.length; i++) {
        if (Math.abs(unionTime[i]! - s.time[j]!) < 0.0001) {
          out[i] = s.values[j]!;
          j++;
        }
      }
      return out;
    });

    const segments = modeTimeline;
    const opts: uPlot.Options = {
      width: Math.max(width, 300),
      height: Math.max(height, 170),
      cursor: { drag: { x: true, y: false, uni: 50 } },
      select: { show: true, left: 0, top: 0, width: 0, height: 0 },
      hooks: {
        setSelect: [(u) => {
          if (u.select.width > 10) {
            u.setScale('x', {
              min: u.posToVal(u.select.left, 'x'),
              max: u.posToVal(u.select.left + u.select.width, 'x'),
            });
          }
          u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
        }],
        drawClear: [(u) => {
          if (segments.length === 0) return;
          const ctx = u.ctx;
          const xMin = u.scales.x?.min ?? 0;
          const xMax = u.scales.x?.max ?? 0;
          ctx.save();
          ctx.beginPath();
          ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
          ctx.clip();
          for (const seg of segments) {
            if (seg.endS < xMin || seg.startS > xMax) continue;
            const x1 = u.valToPos(Math.max(seg.startS, xMin), 'x', true);
            const x2 = u.valToPos(Math.min(seg.endS, xMax), 'x', true);
            ctx.fillStyle = seg.color + '12';
            ctx.fillRect(x1, u.bbox.top, x2 - x1, u.bbox.height);
          }
          ctx.restore();
        }],
      },
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
          stroke: isLight ? '#4b5563' : '#9ca3af',
          grid: { stroke: isLight ? '#e5e7eb' : '#1f2937', width: 1 },
          ticks: { stroke: isLight ? '#d1d5db' : '#374151', width: 1 },
          font: '11px system-ui',
        },
      ],
      series: [
        { label: 'Time' },
        ...data.series.map((s, i) => ({
          label: s.label,
          stroke: SERIES_COLORS[i % SERIES_COLORS.length]!,
          width: 1.5,
          points: { show: false },
        })),
      ],
    };

    if (plotRef.current) plotRef.current.destroy();
    const plot = new uPlot(opts, [unionTime, ...aligned], container);
    plotRef.current = plot;
    plot.setScale('x', { min: data.startS, max: data.endS });

    const handleDblClick = () => {
      if (data.endS > data.startS) plot.setScale('x', { min: data.startS, max: data.endS });
    };
    container.addEventListener('dblclick', handleDblClick);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plotRef.current?.setSize({ width: entry.contentRect.width, height: Math.max(entry.contentRect.height, 150) });
      }
    });
    observer.observe(container);

    return () => {
      container.removeEventListener('dblclick', handleDblClick);
      observer.disconnect();
      if (plotRef.current) { plotRef.current.destroy(); plotRef.current = null; }
    };
  }, [data, isLight, modeTimeline]);

  if (!data) {
    return (
      <div className="mt-2 rounded-lg border border-subtle bg-surface-overlay-subtle p-3">
        <div className="text-xs text-content-secondary">
          No {marker.type} data available{marker.startS != null || marker.endS != null ? ' in the requested time window' : ''}.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-subtle bg-surface overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-overlay-subtle border-b border-subtle">
        <svg className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <span className="text-xs font-medium text-content truncate" title={title}>
          {title}
        </span>
        <span className="ml-auto text-[10px] text-content-tertiary tabular-nums flex-shrink-0">
          {data.series.length} {data.series.length === 1 ? 'series' : 'series'} · drag to zoom
        </span>
        {onOpenInExplorer && (
          <button
            onClick={() => onOpenInExplorer(marker)}
            className="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/25 transition-colors flex-shrink-0"
            title="Open the same fields in the Log Explorer"
          >
            Open in Explorer
          </button>
        )}
      </div>
      <div ref={chartRef} style={{ height: 180 }} className="w-full" />
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 py-1.5 border-t border-subtle">
        {data.series.map((s, i) => (
          <span key={s.label} className="inline-flex items-center gap-1 text-[10px] whitespace-nowrap">
            <span className="w-3 h-[3px] rounded-full shrink-0" style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length]! }} />
            <span className="text-content-secondary tabular-nums">{s.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Jump to the Explorer tab with a marker's fields pre-selected. */
export function openMarkerInExplorer(marker: PlotMarker): void {
  const store = useLogStore.getState();
  const log = store.currentLog;
  if (!log || !log.messages[marker.type]) return;
  store.setSelectedTypes([marker.type]);
  store.setSelectedFields(marker.type, marker.fields.length > 0 ? marker.fields : Object.keys(log.messages[marker.type]![0]!.fields));
  store.setActiveTab('explorer');
}
