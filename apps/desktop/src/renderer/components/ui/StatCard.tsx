import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: ReactNode;
  accent?: 'default' | 'amber' | 'red' | 'emerald' | 'blue';
}

const ACCENT_VALUE_CLASS: Record<NonNullable<StatCardProps['accent']>, string> = {
  default: '',
  amber: 'text-amber-400',
  red: 'text-red-400',
  emerald: 'text-emerald-400',
  blue: 'text-blue-400',
};

/** Dense numeric readout card — used across Telemetry, Configure tabs, landing vehicle panel. */
export function StatCard({ label, value, unit, icon, accent = 'default' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <span className="stat-card-label">{label}</span>
        {icon}
      </div>
      <div className={`stat-card-value ${ACCENT_VALUE_CLASS[accent]}`}>
        {value}
        {unit && <span className="stat-card-unit">{unit}</span>}
      </div>
    </div>
  );
}
