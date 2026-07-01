/**
 * useGamepad — polls the browser Gamepad API and returns the first connected
 * gamepad's axes and buttons at ~60 fps while the hook is mounted.
 *
 * Axis convention matches most controllers:
 *   0 = left stick X (roll)
 *   1 = left stick Y (pitch, inverted)
 *   2 = right stick X (yaw)
 *   3 = right stick Y (throttle, inverted)
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export interface GamepadState {
  connected: boolean;
  name: string;
  /** Raw axis values -1..1, length ≥ 4 */
  axes: number[];
  /** Button pressed flags */
  buttons: boolean[];
}

const DEADZONE = 0.08;

function applyDeadzone(v: number): number {
  return Math.abs(v) < DEADZONE ? 0 : v;
}

const DEFAULT_STATE: GamepadState = {
  connected: false,
  name: '',
  axes: [0, 0, 0, 0],
  buttons: [],
};

export interface GamepadAxisMap {
  roll: number;     // axis index
  pitch: number;
  throttle: number;
  yaw: number;
  invertThrottle: boolean;
  invertPitch: boolean;
}

export const DEFAULT_AXIS_MAP: GamepadAxisMap = {
  roll: 0,
  pitch: 1,
  throttle: 3,
  yaw: 2,
  invertThrottle: true,
  invertPitch: true,
};

const STORAGE_KEY = 'gamepad-axis-map';

export function loadAxisMap(): GamepadAxisMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_AXIS_MAP, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_AXIS_MAP };
}

export function saveAxisMap(map: GamepadAxisMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

/** Returns the first connected gamepad's live state, polled at ~60fps. */
export function useGamepad(): GamepadState {
  const [state, setState] = useState<GamepadState>(DEFAULT_STATE);
  const rafRef = useRef<number>(0);

  const poll = useCallback(() => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) { if (p && p.connected) { pad = p; break; } }

    if (!pad) {
      setState((s) => s.connected ? DEFAULT_STATE : s);
    } else {
      const axes = Array.from(pad.axes).map(applyDeadzone);
      const buttons = Array.from(pad.buttons).map((b) => b.pressed);
      setState({ connected: true, name: pad.id, axes, buttons });
    }

    rafRef.current = requestAnimationFrame(poll);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafRef.current);
  }, [poll]);

  return state;
}
