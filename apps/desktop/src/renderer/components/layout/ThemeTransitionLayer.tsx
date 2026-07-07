import { useEffect, useState } from 'react';
import { THEME_TRANSITION_EVENT, type ThemeTransitionDetail } from '../../utils/theme-transition';

function SunIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="5" fill="#fbbf24" />
      <g stroke="#fbbf24" strokeWidth="2" strokeLinecap="round">
        <path d="M12 1v3M12 20v3M23 12h-3M4 12H1M19.78 4.22l-2.12 2.12M6.34 17.66l-2.12 2.12M19.78 19.78l-2.12-2.12M6.34 6.34L4.22 4.22" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path
        d="M20 14.5A8.5 8.5 0 119.5 4a6.5 6.5 0 0010.5 10.5z"
        fill="#c7d2fe"
      />
    </svg>
  );
}

/**
 * Mounted once at the app root. Listens for theme-transition events
 * (dispatched by runThemeTransition in utils/theme-transition.ts) and
 * plays a rising sun/moon icon from the toggle button's position,
 * matching the clip-path reveal animation defined in globals.css.
 */
export function ThemeTransitionLayer() {
  const [active, setActive] = useState<ThemeTransitionDetail[]>([]);

  useEffect(() => {
    function onTransition(e: Event) {
      const detail = (e as CustomEvent<ThemeTransitionDetail>).detail;
      setActive((prev) => [...prev, detail]);
    }
    window.addEventListener(THEME_TRANSITION_EVENT, onTransition);
    return () => window.removeEventListener(THEME_TRANSITION_EVENT, onTransition);
  }, []);

  if (active.length === 0) return null;

  return (
    <>
      {active.map((t) => (
        <div
          key={t.id}
          className="theme-celestial-icon"
          style={{ left: t.x - 14, top: t.y - 14 }}
          onAnimationEnd={() => setActive((prev) => prev.filter((item) => item.id !== t.id))}
        >
          {t.mode === 'light' ? <SunIcon /> : <MoonIcon />}
        </div>
      ))}
    </>
  );
}
