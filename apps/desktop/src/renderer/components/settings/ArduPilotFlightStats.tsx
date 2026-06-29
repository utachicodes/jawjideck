import { useParameterStore } from '../../stores/parameter-store';
import { Clock, Zap, RotateCcw, BarChart3 } from 'lucide-react';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins} min`;
}

export function ArduPilotFlightStats() {
  const { parameters } = useParameterStore();
  const statFlightTime = parameters.get('STAT_FLTTIME')?.value ?? 0;
  const statRuntime = parameters.get('STAT_RUNTIME')?.value ?? 0;
  const statBootCount = parameters.get('STAT_BOOTCNT')?.value ?? 0;

  const stats = [
    { icon: <Clock size={14} />, value: formatTime(statFlightTime), label: 'Flight Time', color: 'bg-blue-500/20 text-blue-400' },
    { icon: <Zap size={14} />, value: formatTime(statRuntime), label: 'Powered Time', color: 'bg-emerald-500/20 text-emerald-400' },
    { icon: <RotateCcw size={14} />, value: statBootCount.toString(), label: 'Boots', color: 'bg-purple-500/20 text-purple-400' },
    { icon: <BarChart3 size={14} />, value: statFlightTime > 0 ? `${Math.round((statFlightTime / statRuntime) * 100)}%` : '--', label: 'Flight Ratio', color: 'bg-amber-500/20 text-amber-400' },
  ];

  return (
    <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4">
      <h3 className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-3">Flight Statistics (from FC)</h3>
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface-raised rounded-lg p-3 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>{s.icon}</div>
            <div>
              <div className="text-lg font-semibold text-content">{s.value}</div>
              <div className="text-xs text-content-secondary">{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
