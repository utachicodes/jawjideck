/**
 * Single survey entry point. Area and Corridor are the same survey with a
 * different geometry (a filled polygon vs a line with parallel strips), so they
 * live behind one button with a type dropdown rather than two sibling buttons.
 * The detailed pattern (grid / crosshatch / perimeter / spiral) is still tuned
 * in the survey config panel after a type is chosen.
 */
import { useEffect, useRef, useState } from 'react';
import { useSurveyStore } from '../../stores/survey-store';
import type { SurveyPattern } from './survey-types';

interface SurveyType {
  pattern: SurveyPattern;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

const AREA_ICON = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
  </svg>
);

const CORRIDOR_ICON = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21L10 3M17 21L14 3" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17v-2.5M12 11.5V9M12 6V4" />
  </svg>
);

const SURVEY_TYPES: SurveyType[] = [
  {
    pattern: 'grid',
    label: 'Area survey',
    desc: 'Draw a polygon, fill it with a lawnmower grid',
    icon: AREA_ICON,
  },
  {
    pattern: 'corridor',
    label: 'Corridor survey',
    desc: 'Draw a centerline (roads, rail, power lines), strips run parallel',
    icon: CORRIDOR_ICON,
  },
];

export function SurveyStartButton() {
  const activateSurvey = useSurveyStore((s) => s.activateSurvey);
  const setPattern = useSurveyStore((s) => s.setPattern);
  const startDrawing = useSurveyStore((s) => s.startDrawing);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const start = (pattern: SurveyPattern) => {
    activateSurvey();
    setPattern(pattern);
    startDrawing();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        data-tour="mission-survey"
        onClick={() => setOpen((o) => !o)}
        className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface-solid border border-purple-400 shadow-sm text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1.5"
        title="Plan a survey: area (polygon grid) or corridor (centerline strips)"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        Survey
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        // Opens upward: the mission toolbar is pinned to the bottom of the map.
        <div className="absolute left-0 bottom-full mb-1 z-[1100] w-64 bg-surface-solid border border-subtle rounded-lg shadow-xl py-1">
          {SURVEY_TYPES.map((t) => (
            <button
              key={t.pattern}
              onClick={() => start(t.pattern)}
              className="w-full text-left px-3 py-2 hover:bg-surface-raised transition-colors flex items-start gap-2.5"
            >
              <span className="text-purple-400 mt-0.5 shrink-0">{t.icon}</span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-content">{t.label}</span>
                <span className="block text-[10px] text-content-tertiary leading-snug">{t.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
