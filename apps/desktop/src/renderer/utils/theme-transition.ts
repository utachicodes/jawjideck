/**
 * Drives the sunrise/moonrise reveal animation on theme switch.
 * Pairs the browser View Transitions API (clip-path circle reveal, see
 * `theme-reveal` keyframes in globals.css) with a decorative rising
 * sun/moon icon (see ThemeTransitionLayer.tsx), both originating from
 * wherever the theme toggle button was clicked.
 */

export const THEME_TRANSITION_EVENT = 'jawji:theme-transition';

export interface ThemeTransitionDetail {
  id: number;
  x: number;
  y: number;
  mode: 'light' | 'dark';
}

let nextId = 0;

/**
 * Runs the reveal animation and applies the new theme in sync with it.
 * `x`/`y` are viewport coordinates the reveal grows outward from —
 * pass the toggle button's position so it reads as "coming from the side
 * of the screen" rather than an abstract center-screen fade.
 */
export function runThemeTransition(
  x: number,
  y: number,
  mode: 'light' | 'dark',
  applyTheme: () => void,
): void {
  const root = document.documentElement;
  root.style.setProperty('--theme-origin-x', `${x}px`);
  root.style.setProperty('--theme-origin-y', `${y}px`);

  window.dispatchEvent(
    new CustomEvent<ThemeTransitionDetail>(THEME_TRANSITION_EVENT, {
      detail: { id: ++nextId, x, y, mode },
    }),
  );

  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(applyTheme);
  } else {
    // Fallback for environments without View Transitions support — the
    // rising icon still plays, just without the clip-path crossfade.
    applyTheme();
  }
}
