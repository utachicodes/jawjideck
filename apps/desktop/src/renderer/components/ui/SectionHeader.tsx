import type { ReactNode } from 'react';

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}

/** Eyebrow-label + title pattern, previously inlined ad hoc across the app. */
export function SectionHeader({ eyebrow, title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div>
        {eyebrow && <div className="section-header-eyebrow">{eyebrow}</div>}
        <h3 className="section-header-title">{title}</h3>
      </div>
      {action}
    </div>
  );
}
