import type { ReactNode } from 'react';

export function formatNumber(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}

export function PanelContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`h-full bg-surface p-3 overflow-auto ${className}`}>
      {children}
    </div>
  );
}

export function StatRow({ label, value, unit, highlight = false }: { label: string; value: string | number; unit?: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-0.5">
      <span className="text-content-secondary text-xs">{label}</span>
      <span className={`font-mono text-sm ${highlight ? 'text-content' : 'text-content'}`}>
        {value}
        {unit && <span className="text-content-tertiary text-[10px] ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[10px] font-medium text-content-secondary uppercase tracking-wider mb-2">{children}</h3>
  );
}
