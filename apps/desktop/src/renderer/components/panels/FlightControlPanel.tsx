/**
 * Flight Control Panel
 *
 * GCS control panel for arm/disarm and flight mode switching.
 * Works by simulating RC input via MSP_SET_RAW_RC.
 *
 * Design follows the visual language of other telemetry panels (BatteryPanel, AttitudePanel).
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useFlightControlStore } from '../../stores/flight-control-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useMessagesStore } from '../../stores/messages-store';
import { useMissionStore } from '../../stores/mission-store';
import { useParameterStore } from '../../stores/parameter-store';
import { useArduPilotSitlStore } from '../../stores/ardupilot-sitl-store';
import { isPreArmMessage, extractPreArmReason, matchPreArmError } from '../../../shared/prearm-checks';
import { PreArmParamFix } from '../prearm/PreArmParamFix';
import { PanelContainer, SectionTitle } from './panel-utils';
import { getVehicleClass, ARDUPILOT_COMMON_MODES, VEHICLE_CAPABILITIES, type ArduPilotVehicleClass } from '../../../shared/telemetry-types';
import { executeTakeoff, presentTakeoff } from './takeoff-strategies';

// =============================================================================
// Visual Components
// =============================================================================

const JOYSTICK_SIZE = 200;
const JOYSTICK_KNOB = 44;
const THROTTLE_HEIGHT = 240;
const THROTTLE_WIDTH = 64;

/**
 * ThrottleLever — tall vertical slider with a draggable knob.
 */
function ThrottleLever({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const pct = ((value - 1000) / 1000) * 100;
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const color = pct < 10 ? '#10b981' : pct < 50 ? '#f59e0b' : '#ef4444';
  const textColor = pct < 10 ? 'text-emerald-400' : pct < 50 ? 'text-amber-400' : 'text-red-400';

  // Knob Y position: top of track = 2000 (100%), bottom = 1000 (0%)
  const trackH = THROTTLE_HEIGHT - 40; // reserve space for knob overflow
  const knobY = ((2000 - value) / 1000) * (trackH - JOYSTICK_KNOB);

  const interact = useCallback((clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const pwm = Math.round(2000 - rel * 1000);
    onChange(Math.max(1000, Math.min(2000, pwm)));
  }, [onChange]);

  const onDown = (e: React.MouseEvent) => { setDragging(true); interact(e.clientY); };

  useEffect(() => {
    if (!dragging) return;
    const mv = (e: MouseEvent) => interact(e.clientY);
    const up = () => setDragging(false);
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
  }, [dragging, interact]);

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-content-secondary">THR</div>
      <div
        className="relative cursor-pointer"
        style={{ width: THROTTLE_WIDTH, height: THROTTLE_HEIGHT }}
        onMouseDown={onDown}
      >
        {/* Track background */}
        <div className="absolute left-1/2 -translate-x-1/2 top-5 bottom-5 w-3 rounded-full bg-black/40 border border-white/5">
          {/* Fill */}
          <div
            className="absolute bottom-0 w-full rounded-full"
            style={{
              height: `${pct}%`,
              background: `linear-gradient(to top, ${color}44, ${color}88)`,
              transition: dragging ? 'none' : 'height 0.1s ease-out',
            }}
          />
        </div>
        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((t) => (
          <div key={t} className="absolute left-0 right-0 flex items-center" style={{ bottom: `${t}%`, transform: 'translateY(50%)' }}>
            <div className="w-2 h-px bg-white/20" />
            <div className="flex-1 h-px bg-white/10" />
            <div className="w-2 h-px bg-white/20" />
          </div>
        ))}
        {/* Knob */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full border-2 shadow-xl cursor-grab active:cursor-grabbing"
          style={{
            width: JOYSTICK_KNOB, height: JOYSTICK_KNOB,
            top: 5 + knobY,
            borderColor: color,
            background: `radial-gradient(circle at 35% 35%, ${color}, ${color}99)`,
            boxShadow: `0 0 16px ${color}55, 0 4px 12px rgba(0,0,0,0.5)`,
            transition: dragging ? 'none' : 'top 0.1s ease-out',
          }}
        >
          {/* Grip lines */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <div className="w-5 h-0.5 rounded-full bg-white/40" />
            <div className="w-5 h-0.5 rounded-full bg-white/40" />
            <div className="w-5 h-0.5 rounded-full bg-white/40" />
          </div>
        </div>
      </div>
      <div className="text-center">
        <div className={`text-2xl font-bold font-mono ${textColor}`}>{Math.round(pct)}%</div>
        <div className="text-content-secondary text-[10px] font-mono">{value} us</div>
      </div>
    </div>
  );
}

/**
 * BigJoystick — large circular 2D stick pad with a visible grabbable knob.
 * Looks and feels like an RC transmitter gimbal.
 */
function BigJoystick({
  x, y, onChangeX, onChangeY, label, xLabel, yLabel,
}: {
  x: number; y: number;
  onChangeX: (v: number) => void; onChangeY: (v: number) => void;
  label: string; xLabel: string; yLabel: string;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const normX = (x - 1500) / 500; // -1..+1
  const normY = (y - 1500) / 500;

  // Knob position: center-origin, clamped to circle
  const maxR = (JOYSTICK_SIZE - JOYSTICK_KNOB) / 2;
  const rawPxX = normX * maxR;
  const rawPxY = -normY * maxR; // invert Y for screen coords

  // Clamp to circular boundary
  const dist = Math.sqrt(rawPxX * rawPxX + rawPxY * rawPxY);
  const clampX = dist > maxR ? (rawPxX / dist) * maxR : rawPxX;
  const clampY = dist > maxR ? (rawPxY / dist) * maxR : rawPxY;

  const interact = useCallback((clientX: number, clientY: number) => {
    if (!padRef.current) return;
    const rect = padRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const clamped = d > maxR ? { x: (dx / d) * maxR, y: (dy / d) * maxR } : { x: dx, y: dy };
    onChangeX(Math.round(1500 + (clamped.x / maxR) * 500));
    onChangeY(Math.round(1500 - (clamped.y / maxR) * 500));
  }, [onChangeX, onChangeY, maxR]);

  const onDown = (e: React.MouseEvent) => { setDragging(true); interact(e.clientX, e.clientY); };

  useEffect(() => {
    if (!dragging) return;
    const mv = (e: MouseEvent) => interact(e.clientX, e.clientY);
    const up = () => setDragging(false);
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
  }, [dragging, interact]);

  const cx = JOYSTICK_SIZE / 2;
  const cy = JOYSTICK_SIZE / 2;

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-content-secondary">{label}</div>
      <div
        ref={padRef}
        className="relative rounded-full cursor-crosshair"
        style={{
          width: JOYSTICK_SIZE, height: JOYSTICK_SIZE,
          background: 'radial-gradient(circle, rgba(30,30,30,0.9) 0%, rgba(15,15,15,0.95) 100%)',
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.06)',
        }}
        onMouseDown={onDown}
      >
        {/* Concentric circle guides */}
        {[0.3, 0.6, 0.9].map((s) => (
          <div key={s} className="absolute rounded-full border border-white/[0.06]" style={{
            width: JOYSTICK_SIZE * s, height: JOYSTICK_SIZE * s,
            left: (JOYSTICK_SIZE - JOYSTICK_SIZE * s) / 2,
            top: (JOYSTICK_SIZE - JOYSTICK_SIZE * s) / 2,
          }} />
        ))}
        {/* Crosshair */}
        <div className="absolute left-1/2 top-5 bottom-5 w-px bg-white/[0.08] -translate-x-px" />
        <div className="absolute top-1/2 left-5 right-5 h-px bg-white/[0.08] -translate-y-px" />
        {/* Center dot */}
        <div className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full bg-white/20 -translate-x-1/2 -translate-y-1/2" />
        {/* Knob */}
        <div
          className="absolute rounded-full border-2 border-blue-400 shadow-2xl cursor-grab active:cursor-grabbing z-10"
          style={{
            width: JOYSTICK_KNOB, height: JOYSTICK_KNOB,
            left: cx + clampX - JOYSTICK_KNOB / 2,
            top: cy + clampY - JOYSTICK_KNOB / 2,
            background: 'radial-gradient(circle at 35% 35%, #3b82f6, #1d4ed8)',
            boxShadow: '0 0 20px rgba(59,130,246,0.4), 0 4px 12px rgba(0,0,0,0.5)',
            transition: dragging ? 'none' : 'left 0.06s ease-out, top 0.06s ease-out',
          }}
        >
          {/* Inner highlight */}
          <div className="absolute inset-1 rounded-full border border-white/20" />
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-3 h-1 rounded-full bg-white/30" />
        </div>
      </div>
      <div className="flex gap-4 text-xs font-mono">
        <span className="text-content-secondary">{xLabel}: <span className="text-content">{x}</span></span>
        <span className="text-content-secondary">{yLabel}: <span className="text-content">{y}</span></span>
      </div>
    </div>
  );
}

// Keep the old names as aliases so existing MSP call sites still compile.
const ThrottleGauge = ThrottleLever;
const JoystickControl = BigJoystick;

/**
 * ARM Button - Large, prominent arm/disarm control
 */
function ArmButton({
  isArmed,
  canArm,
  armSwitchOn,
  onToggle,
  compact = false,
}: {
  isArmed: boolean;
  canArm: boolean;
  armSwitchOn: boolean;
  onToggle: (state: boolean) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      {/* Main ARM button */}
      <button
        onClick={() => onToggle(!armSwitchOn)}
        disabled={!canArm}
        className={`
          relative ${compact ? 'w-14 h-14 border-[3px]' : 'w-24 h-24 border-4'} rounded-full
          transition-all duration-300 ease-out
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-base
          ${canArm ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
          ${isArmed
            ? 'bg-red-500/20 border-red-500 shadow-lg shadow-red-500/30 focus:ring-red-500'
            : armSwitchOn
              ? 'bg-amber-500/20 border-amber-500 focus:ring-amber-500'
              : 'bg-surface border-default hover:border-default focus:ring-gray-500'
          }
        `}
      >
        {/* Inner circle */}
        <div
          className={`
            absolute ${compact ? 'inset-1' : 'inset-2'} rounded-full flex items-center justify-center
            transition-colors duration-300
            ${isArmed ? 'bg-red-500' : armSwitchOn ? 'bg-amber-500' : 'bg-surface-raised'}
          `}
        >
          <svg
            className={`${compact ? 'w-6 h-6' : 'w-10 h-10'} ${isArmed || armSwitchOn ? 'text-white' : 'text-content-secondary'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            {isArmed ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.636 5.636a9 9 0 1012.728 0M12 3v9"
              />
            )}
          </svg>
        </div>
      </button>

      {/* Status text */}
      <div className={`${compact ? 'mt-1.5' : 'mt-3'} text-center`}>
        <div className={`${compact ? 'text-xs' : 'text-lg'} font-bold ${isArmed ? 'text-red-400' : 'text-content-secondary'}`}>
          {isArmed ? 'ARMED' : 'DISARMED'}
        </div>
        {armSwitchOn && !isArmed && (
          <div className="text-amber-400 text-xs">Arming...</div>
        )}
        {!canArm && !compact && (
          <div className="text-content-secondary text-xs">Not configured</div>
        )}
      </div>
    </div>
  );
}

/**
 * Mode Chip - Compact mode toggle button
 */
function ModeChip({
  name,
  isActive,
  isConfigured,
  onClick,
}: {
  name: string;
  isActive: boolean;
  isConfigured: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!isConfigured}
      title={name}
      className={`
        px-3 py-1.5 rounded-full text-xs font-medium truncate
        transition-all duration-200 ease-out
        ${isConfigured ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}
        ${isActive
          ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
          : isConfigured
            ? 'bg-surface-raised text-content hover:bg-surface-raised'
            : 'bg-surface text-content-secondary'
        }
      `}
    >
      {name}
    </button>
  );
}

/**
 * RC Status Indicator
 */
function RcStatusIndicator({ isActive }: { isActive: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
      isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-raised text-content-secondary'
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-content-tertiary'}`} />
      <span>RC {isActive ? 'Active' : 'Idle'}</span>
    </div>
  );
}

// 10Hz matches the MSP RC override cadence (flight-control-store.ts) —
// fast enough for stick feel, slow enough not to flood a slow radio link.
const MANUAL_OVERRIDE_INTERVAL_MS = 100;

/**
 * Manual Stick Control (MAVLink) — full control panel with two large joysticks,
 * throttle lever, and keyboard controls. Streams RC_CHANNELS_OVERRIDE at 10 Hz.
 * Auto-enables for non-SITL MAVLink connections (real drones) since the
 * GCS is the only RC source over USB.
 *
 * Automatically pins FLTMODE_CH to a valid mode (MANUAL) and finds + pins the
 * arm switch channel so ArduPilot pre-arm checks pass while the GCS overrides RC.
 */
function ManualStickControl({ defaultActive = false }: { defaultActive?: boolean }) {
  const [active, setActive] = useState(defaultActive);
  const [busy, setBusy] = useState(false);
  const [roll, setRoll] = useState(1500);
  const [pitch, setPitch] = useState(1500);
  const [throttle, setThrottle] = useState(1000);
  const [yaw, setYaw] = useState(1500);
  const [kbActive, setKbActive] = useState(false);

  const stickRef = useRef({ roll, pitch, throttle, yaw });
  stickRef.current = { roll, pitch, throttle, yaw };

  // Read FLTMODE_CH and find arm switch channel from parameters
  const parameters = useParameterStore((s) => s.parameters);
  const fltmodeCh = useMemo(() => {
    const p = parameters.get('FLTMODE_CH');
    return typeof p?.value === 'number' ? p.value : 5; // default Ch5 for copter
  }, [parameters]);

  const armSwitchCh = useMemo(() => {
    // Scan RCx_OPTION for value 41 (Arm switch)
    for (let ch = 5; ch <= 16; ch++) {
      const p = parameters.get(`RC${ch}_OPTION`);
      if (typeof p?.value === 'number' && p.value === 41) return ch;
    }
    return null;
  }, [parameters]);

  // Build AUX channel map: only pin FLTMODE_CH to a valid mode.
  // Do NOT touch the arm switch — pinning it LOW disarms the drone every tick.
  const auxChannels = useMemo(() => {
    const aux: Record<number, number> = {};
    // Pin FLTMODE_CH to STABILIZE (mode 0, PWM ~1000) so the pre-arm
    // mode check passes without interfering with arm/disarm state.
    aux[fltmodeCh] = 1000;
    return aux;
  }, [fltmodeCh]);

  // Stream the override while active
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const s = stickRef.current;
      const result = window.electronAPI?.rcOverrideSet?.(s.roll, s.pitch, s.throttle, s.yaw, undefined, undefined, auxChannels);
      result?.then?.((r) => {
        if (!r?.success) console.warn('[RCOverride] failed:', r?.error);
      });
    };
    tick();
    const id = setInterval(tick, MANUAL_OVERRIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, auxChannels]);

  // Release on unmount
  useEffect(() => {
    return () => { void window.electronAPI?.rcOverrideRelease?.(); };
  }, []);

  const handleToggle = async () => {
    if (active) {
      setBusy(true);
      setActive(false);
      setRoll(1500); setPitch(1500); setThrottle(1000); setYaw(1500);
      try { await window.electronAPI?.rcOverrideRelease?.(); }
      finally { setBusy(false); }
    } else {
      setRoll(1500); setPitch(1500); setThrottle(1000); setYaw(1500);
      setActive(true);
      console.log('[ManualStick] Activated — AUX channels:', auxChannels);
    }
  };

  // Log on first render with defaultActive
  useEffect(() => {
    if (defaultActive) {
      console.log('[ManualStick] defaultActive=true, fltmodeCh=', fltmodeCh, 'armSwitchCh=', armSwitchCh);
    }
  }, []);

  const centerSticks = () => { setRoll(1500); setPitch(1500); setYaw(1500); };

  // ── Keyboard control ──
  const keysRef = useRef<Record<string, boolean>>({});
  const [keyState, setKeyState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!kbActive || !active) return;

    const STEP = 20;
    const onDown = (e: KeyboardEvent) => {
      const k = e.key;
      if (['w','a','s','d','q','e','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(k)) {
        if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        keysRef.current[k] = true;
        setKeyState({ ...keysRef.current });
      }
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
      setKeyState({ ...keysRef.current });
    };

    document.addEventListener('keydown', onDown);
    document.addEventListener('keyup', onUp);

    const id = setInterval(() => {
      const k = keysRef.current;
      const cur = stickRef.current;
      let newRoll = cur.roll, newPitch = cur.pitch, newYaw = cur.yaw, newThr = cur.throttle;
      if (k.d) newRoll = Math.min(2000, cur.roll + STEP);
      if (k.a) newRoll = Math.max(1000, cur.roll - STEP);
      if (k.s) newPitch = Math.min(2000, cur.pitch + STEP);
      if (k.w) newPitch = Math.max(1000, cur.pitch - STEP);
      if (k.q) newThr = Math.min(2000, cur.throttle + STEP);
      if (k.e) newThr = Math.max(1000, cur.throttle - STEP);
      if (k.ArrowRight) newYaw = Math.min(2000, cur.yaw + STEP);
      if (k.ArrowLeft) newYaw = Math.max(1000, cur.yaw - STEP);
      if (newRoll !== cur.roll || newPitch !== cur.pitch || newYaw !== cur.yaw || newThr !== cur.throttle) {
        stickRef.current = { roll: newRoll, pitch: newPitch, throttle: newThr, yaw: newYaw };
        setRoll(newRoll); setPitch(newPitch); setThrottle(newThr); setYaw(newYaw);
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', onDown);
      document.removeEventListener('keyup', onUp);
      clearInterval(id);
    };
  }, [kbActive, active]);

  return (
    <div className="mt-3 pt-3 border-t border-default">
      {/* Toggle button */}
      <button
        onClick={handleToggle}
        disabled={busy}
        title="Overrides RC1-4 from the GCS — the physical transmitter is ignored on those channels while this is on."
        className={`flex items-center justify-between w-full px-4 py-3 rounded-2xl transition-all text-base
          ${active
            ? 'bg-pink-500/15 border border-pink-500/40 shadow-lg shadow-pink-500/15'
            : 'bg-surface border-2 border-subtle hover:border-pink-500/30 hover:bg-surface-raised'}`}
      >
        <div className="flex items-center gap-3">
          <svg className={`w-5 h-5 ${active ? 'text-pink-400' : 'text-content-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8l4-4 4 4M21 16l-4 4-4-4" />
          </svg>
          <span className={`text-base font-bold ${active ? 'text-pink-300' : 'text-content'}`}>
            {busy ? (active ? 'Releasing…' : 'Starting…') : active ? 'MANUAL CONTROL ACTIVE' : 'Enable Manual Control'}
          </span>
        </div>
        <div className={`w-12 h-6 rounded-full transition-colors relative ${active ? 'bg-pink-500' : 'bg-surface-raised'}`}>
          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </div>
      </button>

      {/* Control panel — visible only when active */}
      {active && (
        <div className="mt-4 p-6 bg-gradient-to-b from-surface-raised to-surface rounded-3xl border border-pink-500/20 shadow-2xl">
          <div className="mb-4 text-sm text-pink-300/60 text-center font-medium">
            RC1-4 Override Active — physical TX ignored
          </div>

          {/* Input mode toggle: Joystick vs Keyboard */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <button
              onClick={() => setKbActive(false)}
              className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-all border-2 ${
                !kbActive ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'border-subtle text-content-secondary hover:bg-surface-raised'
              }`}
            >Joystick</button>
            <button
              onClick={() => setKbActive(true)}
              className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-all border-2 ${
                kbActive ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'border-subtle text-content-secondary hover:bg-surface-raised'
              }`}
            >Keyboard (WASD)</button>
          </div>

          {/* Joystick mode */}
          {!kbActive && (
            <div className="flex items-center justify-center gap-8">
              <ThrottleLever value={throttle} onChange={setThrottle} />
              <BigJoystick
                x={yaw} y={throttle}
                onChangeX={setYaw} onChangeY={setThrottle}
                label="Left Stick" xLabel="YAW" yLabel="THR"
              />
              <BigJoystick
                x={roll} y={pitch}
                onChangeX={setRoll} onChangeY={setPitch}
                label="Right Stick" xLabel="ROLL" yLabel="PITCH"
              />
            </div>
          )}

          {/* Keyboard mode */}
          {kbActive && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="text-sm text-content-secondary text-center">
                Use <span className="font-bold text-content">W/A/S/D</span> for roll/pitch,
                <span className="font-bold text-content"> Q/E</span> for throttle,
                <span className="font-bold text-content"> ←/→</span> for yaw
              </div>
              {/* Live values display */}
              <div className="grid grid-cols-4 gap-4 text-center">
                {[
                  { label: 'ROLL', value: roll },
                  { label: 'PITCH', value: pitch },
                  { label: 'THR', value: throttle },
                  { label: 'YAW', value: yaw },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <span className="text-xs text-content-secondary font-bold">{label}</span>
                    <span className="text-lg font-mono font-bold text-content">{value}</span>
                    <div className="w-20 h-2 rounded-full bg-surface-raised overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-75"
                        style={{ width: `${((value - 1000) / 1000) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Center button */}
          <div className="flex justify-center mt-6">
            <button
              onClick={centerSticks}
              className="px-8 py-3 text-sm font-bold text-content-secondary hover:text-white bg-surface hover:bg-blue-600 rounded-2xl transition-all border-2 border-subtle hover:border-blue-500"
            >
              Center All Sticks
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Auto-configure SITL for testing.
 */
async function configureSitlForTesting(): Promise<boolean> {
  try {
    await window.electronAPI.cliEnterMode();
    await new Promise((r) => setTimeout(r, 500));

    const commands = [
      'set receiver_type = MSP',
      'set failsafe_procedure = DROP',
      'set failsafe_delay = 5',
      'set failsafe_off_delay = 0',
      'set failsafe_throttle = 1000',
      'aux 0 0 0 1700 2100 0',  // ARM on AUX1
      'aux 1 1 1 1300 1700 0',  // ANGLE on AUX2
      'aux 2 28 1 1700 2100 0', // NAV WP on AUX2
      'aux 3 10 2 1700 2100 0', // NAV RTH on AUX3
      'aux 4 11 3 1700 2100 0', // NAV POSHOLD on AUX4
      'set nav_wp_max_safe_distance = 0',
    ];

    for (const cmd of commands) {
      await window.electronAPI.cliSendCommand(cmd);
      await new Promise((r) => setTimeout(r, 100));
    }

    await window.electronAPI.cliSendCommand('save');
    return true;
  } catch (error) {
    console.error('[FlightControl] Failed to configure SITL:', error);
    return false;
  }
}

// Common flight modes (iNav permanent box IDs)
const COMMON_MODES = [
  { boxId: 1, name: 'ANGLE' },
  { boxId: 2, name: 'HORIZON' },
  { boxId: 11, name: 'POS HOLD' },
  { boxId: 28, name: 'NAV WP' },
  { boxId: 10, name: 'RTH' },
  { boxId: 45, name: 'CRUISE' },
];

// =============================================================================
// MAVLink Flight Control (ArduPilot)
// =============================================================================

// AUTO + pause mode numbers per vehicle class. Pause mode is whichever holds
// position cleanly without giving up the mission (BRAKE on copter, LOITER on
// plane, HOLD on rover, POSHOLD on sub) — switching back to AUTO resumes.
const MISSION_MODES: Record<ArduPilotVehicleClass, { auto: number; pause: number; pauseLabel: string }> = {
  copter: { auto: 3,  pause: 17, pauseLabel: 'Brake'   },
  plane:  { auto: 10, pause: 12, pauseLabel: 'Loiter'  },
  // VTOL pause = QLOITER (19): vertical position hold without giving up the
  // mission. Q-modes auto-disarm-tolerant in a way fixed-wing LOITER isn't
  // for tailsitters.
  vtol:   { auto: 10, pause: 19, pauseLabel: 'QLoiter' },
  rover:  { auto: 10, pause: 4,  pauseLabel: 'Hold'    },
  sub:    { auto: 3,  pause: 16, pauseLabel: 'PosHold' },
};

function MavlinkFlightControl() {
  const flight = useTelemetryStore((s) => s.flight);
  const messages = useMessagesStore((s) => s.messages);
  const connectionState = useConnectionStore((s) => s.connectionState);
  // Multi-signal VTOL detection: MAV_TYPE alone is unreliable on first
  // connect (FCU reports FIXED_WING until reboot picks up Q_ENABLE). Pulling
  // the live Q_ENABLE param + the running SITL frame closes both gaps.
  const qEnable = useParameterStore((s) => s.parameters.get('Q_ENABLE')?.value);
  const fsThrEnableVal = useParameterStore((s) => s.parameters.get('FS_THR_ENABLE')?.value);
  const armingRcChecksVal = useParameterStore((s) => s.parameters.get('ARMING_RC_CHECKS')?.value);
  const sitlIsRunning = useArduPilotSitlStore((s) => s.isRunning);
  const sitlFrame = useArduPilotSitlStore((s) => s.model);
  const vehicleClass = getVehicleClass(connectionState.mavType, {
    qEnable: typeof qEnable === 'number' ? qEnable : undefined,
    sitlFrame: sitlIsRunning ? sitlFrame : undefined,
  });
  const availableModes = ARDUPILOT_COMMON_MODES[vehicleClass];
  const capabilities = VEHICLE_CAPABILITIES[vehicleClass];
  const missionItems = useMissionStore((s) => s.missionItems);
  const currentSeq = useMissionStore((s) => s.currentSeq);
  const fetchMission = useMissionStore((s) => s.fetchMission);
  const missionLoaded = missionItems.length > 0;
  const missionModes = MISSION_MODES[vehicleClass];
  const isInAuto = flight.modeNum === missionModes.auto;
  const isInPause = flight.modeNum === missionModes.pause;

  const [isLoading, setIsLoading] = useState(false);
  const [forceArm, setForceArm] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHorizontal, setIsHorizontal] = useState(false);
  const [expandedPreArm, setExpandedPreArm] = useState<Set<string>>(new Set());
  const prevArmedRef = useRef(flight.armed);
  const [modeLoading, setModeLoading] = useState<number | null>(null);
  const [showTakeoffDialog, setShowTakeoffDialog] = useState(false);
  const [takeoffAlt, setTakeoffAlt] = useState(10);

  // Detect panel orientation for responsive layout
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setIsHorizontal(entry.contentRect.width > entry.contentRect.height * 1.5);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Watch for armed state changes to provide feedback
  useEffect(() => {
    if (flight.armed !== prevArmedRef.current) {
      prevArmedRef.current = flight.armed;
      if (isLoading) {
        setIsLoading(false);
        setStatusMsg({
          text: flight.armed ? 'Armed successfully' : 'Disarmed',
          type: 'success',
        });
        setTimeout(() => setStatusMsg(null), 3000);
      }
    }
  }, [flight.armed, isLoading]);

  // Auto-disable RC failsafe params when flying GCS-only (no RC receiver).
  // This lets the drone arm and respond to RC_CHANNELS_OVERRIDE without
  // immediately triggering an RC failsafe.
  const autoFailsafeRef = useRef(false);
  useEffect(() => {
    if (autoFailsafeRef.current) return;
    if (connectionState.protocol !== 'mavlink' || sitlIsRunning) return;
    if (fsThrEnableVal === undefined && armingRcChecksVal === undefined) return;

    autoFailsafeRef.current = true;

    const tasks: Promise<boolean>[] = [];
    const parts: string[] = [];
    const pStore = useParameterStore.getState();

    if (fsThrEnableVal !== undefined && fsThrEnableVal > 0) {
      tasks.push(pStore.setParameter('FS_THR_ENABLE', 0));
      parts.push('FS_THR_ENABLE=0');
    }
    if (armingRcChecksVal !== undefined && armingRcChecksVal > 0) {
      tasks.push(pStore.setParameter('ARMING_RC_CHECKS', 0));
      parts.push('ARMING_RC_CHECKS=0');
    }

    if (tasks.length > 0) {
      setStatusMsg({ text: 'Disabling RC failsafe for GCS-only flight...', type: 'info' });
      Promise.all(tasks).then(() => {
        setStatusMsg({
          text: `Auto-set: ${parts.join(', ')}${parts.some((p) => p.includes('ARMING')) ? ' — reboot FC for ARMING_RC_CHECKS to take effect' : ''}`,
          type: 'success',
        });
        setTimeout(() => setStatusMsg(null), 6000);
      });
    }
  }, [fsThrEnableVal, armingRcChecksVal, connectionState.protocol, sitlIsRunning]);

  // Extract PreArm failure reasons from STATUSTEXT messages
  const preArmReasons = useMemo(() => {
    if (flight.armed) return [];
    return messages
      .filter((m) => isPreArmMessage(m.text))
      .map((m) => {
        const match = matchPreArmError(m.text);
        return match ? { reason: match.reason, fix: match.pattern.fix } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .filter((x, i, arr) => arr.findIndex((a) => a.reason === x.reason) === i)
      .slice(0, 10);
  }, [messages, flight.armed]);

  // Watch for ARM/DISARM command result in messages
  const lastArmResult = useMemo(() => {
    const result = messages.find((m) => m.text.startsWith('ARM/DISARM'));
    if (!result) return null;
    const isAccepted = result.text.includes('accepted');
    return { accepted: isAccepted, text: result.text, timestamp: result.timestamp };
  }, [messages]);

  // Show command result feedback
  useEffect(() => {
    if (lastArmResult && isLoading) {
      if (!lastArmResult.accepted) {
        setIsLoading(false);
        setStatusMsg({ text: lastArmResult.text, type: 'error' });
        setTimeout(() => setStatusMsg(null), 5000);
      }
    }
  }, [lastArmResult, isLoading]);

  const handleArmDisarm = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setStatusMsg(null);
    try {
      const wantArm = !flight.armed;
      // Force flag applies to BOTH arm and disarm. ArduPilot rejects normal
      // DISARM while the FCU thinks the vehicle is airborne — even if a
      // VTOL takeoff aborted with motors back at 0% the FCU stays in the
      // takeoff state for a short window. Forwarding the user's Force
      // toggle to the disarm path is the unstick.
      const ok = await window.electronAPI.mavlinkArmDisarm(wantArm, forceArm);
      if (!ok) {
        setIsLoading(false);
        setStatusMsg({ text: 'Not connected', type: 'error' });
        setTimeout(() => setStatusMsg(null), 3000);
      }
      // If ok, wait for armed state change or COMMAND_ACK result (handled by effects above)
      // Timeout fallback: stop loading after 5s if no state change
      setTimeout(() => {
        setIsLoading((prev) => {
          if (prev) {
            setStatusMsg({ text: 'No response from vehicle', type: 'error' });
            setTimeout(() => setStatusMsg(null), 5000);
          }
          return false;
        });
      }, 5000);
    } catch (err) {
      console.error('[FlightControl] MAVLink arm/disarm failed:', err);
      setIsLoading(false);
      setStatusMsg({ text: 'Command error', type: 'error' });
      setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  // Mode switching
  const handleSetMode = async (modeNum: number) => {
    if (modeLoading !== null) return;
    setModeLoading(modeNum);
    setStatusMsg(null);
    try {
      const ok = await window.electronAPI.mavlinkSetMode(modeNum);
      if (!ok) {
        setStatusMsg({ text: 'Not connected', type: 'error' });
        setModeLoading(null);
        setTimeout(() => setStatusMsg(null), 3000);
      }
      // Mode confirmation comes via heartbeat - timeout clears loading
      setTimeout(() => setModeLoading(null), 3000);
    } catch {
      setStatusMsg({ text: 'Mode change failed', type: 'error' });
      setModeLoading(null);
      setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  // Clear mode loading when heartbeat confirms the switch
  useEffect(() => {
    if (modeLoading !== null && flight.modeNum === modeLoading) {
      setModeLoading(null);
      setStatusMsg({ text: `Mode: ${flight.mode}`, type: 'success' });
      setTimeout(() => setStatusMsg(null), 2000);
    }
  }, [flight.modeNum, modeLoading, flight.mode]);

  // Poll telemetry state until a condition is met, or timeout.
  // Reads directly from Zustand store (no re-renders).
  const waitForState = useCallback(async (
    check: () => boolean,
    timeoutMs: number,
    intervalMs = 200,
  ): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (check()) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return check(); // one last check
  }, []);

  // Takeoff dispatch: each vehicle class has its own self-contained procedure
  // in ./takeoff-strategies.ts (copter NAV_TAKEOFF, plane TAKEOFF mode, VTOL
  // NAV_VTOL_TAKEOFF + Q_GUIDED_MODE on real hw, QHover+RC ramp on SITL).
  // Keep this function thin — it only wires up state + IPC + UI feedback
  // for the chosen strategy.
  const handleTakeoff = async () => {
    setShowTakeoffDialog(false);
    const store = useTelemetryStore.getState;
    const result = await executeTakeoff({
      altitudeM:    takeoffAlt,
      forceArm,
      vehicleClass,
      capabilities,
      isSitl: connectionState.isSitl ?? sitlIsRunning,
      getFlight:   () => store().flight,
      getGps:      () => store().gps,
      getPosition: () => store().position,
      getParam: (id) => {
        const p = useParameterStore.getState().parameters.get(id);
        return p ? { value: p.value, type: p.type } : undefined;
      },
      api: {
        mavlinkSetMode:     window.electronAPI.mavlinkSetMode,
        mavlinkArmDisarm:   window.electronAPI.mavlinkArmDisarm,
        mavlinkTakeoff:     window.electronAPI.mavlinkTakeoff,
        mavlinkVtolTakeoff: window.electronAPI.mavlinkVtolTakeoff,
        setParameter:       window.electronAPI.setParameter,
        sitlRcStart:        window.electronAPI.ardupilotSitlRcStart,
        sitlRcSend:         window.electronAPI.ardupilotSitlRcSend,
      },
      setStatus: setStatusMsg,
      waitForState,
    });
    if (result.ok) {
      setStatusMsg({ text: `Taking off to ${takeoffAlt}m...`, type: 'success' });
    } else {
      setStatusMsg({ text: result.reason, type: 'error' });
    }
    setTimeout(() => setStatusMsg(null), 3000);
  };

  // Per-vehicle button + dialog copy comes from the strategy module.
  const takeoffPresentation = useMemo(() => presentTakeoff(vehicleClass), [vehicleClass]);

  // RTL/Land sourced from the per-vehicle capability matrix.
  const rtlModeNum = capabilities.rtlModeNum;
  const landModeNum = capabilities.land.modeNum;
  const landSupported = capabilities.land.supported;
  const landLabel = capabilities.land.label;
  const landDisabledReason = capabilities.land.disabledReason;

  // Status message color
  const statusColor = statusMsg?.type === 'success' ? 'text-emerald-400' : statusMsg?.type === 'error' ? 'text-red-400' : 'text-content-secondary';

  return (
    <PanelContainer>
      <div ref={containerRef} data-tour="telemetry-flight-control" className="h-full min-h-0">
        {isHorizontal ? (
          /* Horizontal layout — ARM button is THE hero control */
          <div className="h-full flex flex-col justify-center gap-3">
            <div className="flex items-center gap-4">
              {/* Left: Mode + protocol */}
              <div className="shrink-0 w-20">
                <div className="text-content font-medium leading-tight">{flight.mode || 'Unknown'}</div>
                <div className="text-[10px] text-content-secondary">MAVLink</div>
              </div>

              {/* CENTER: The ARM button — primary control */}
              <div className="flex-1 flex justify-center">
                <button
                  onClick={() => handleArmDisarm()}
                  disabled={isLoading}
                  className={`
                    flex items-center justify-center gap-3 min-w-[200px] px-8 py-3.5 rounded-xl
                    font-bold text-base uppercase tracking-wider
                    transition-all duration-200 select-none border-2
                    ${isLoading ? 'cursor-wait' : 'cursor-pointer'}
                    ${flight.armed
                      ? 'bg-red-500/15 border-red-500/50 text-red-400 hover:bg-red-500/25 shadow-lg shadow-red-500/10'
                      : forceArm
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-400 hover:bg-amber-500/25 shadow-lg shadow-amber-500/10'
                        : 'bg-surface border-subtle text-content hover:bg-surface-raised hover:text-content hover:border-default'
                    }
                  `}
                >
                  {isLoading ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>{flight.armed ? 'Disarming...' : 'Arming...'}</span>
                    </>
                  ) : (
                    <>
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        flight.armed ? 'bg-red-400 animate-pulse' : forceArm ? 'bg-amber-400' : 'bg-content-tertiary'
                      }`} />
                      <span>{flight.armed ? 'Disarm' : forceArm ? 'Force Arm' : 'Arm'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Right: Force toggle */}
              <div className="shrink-0 w-20 flex justify-end">
                <button
                  onClick={() => setForceArm(!forceArm)}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg transition-all
                    ${forceArm
                      ? 'bg-amber-500/10 border border-amber-500/30'
                      : 'bg-surface border border-subtle hover:border-default'
                    }
                  `}
                  title="Force ARM bypasses pre-arm safety checks"
                >
                  <svg className={`w-3.5 h-3.5 ${forceArm ? 'text-amber-400' : 'text-content-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className={`text-xs font-medium ${forceArm ? 'text-amber-300' : 'text-content'}`}>Force</span>
                  <div className={`w-7 h-3.5 rounded-full transition-colors relative ${forceArm ? 'bg-amber-500' : 'bg-surface-raised'}`}>
                    <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${forceArm ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                  </div>
                </button>
              </div>
            </div>

            {/* Status feedback — right below the ARM button */}
            {statusMsg && (
              <div className={`text-center text-xs font-medium ${statusColor}`}>{statusMsg.text}</div>
            )}

            {/* Pre-arm reasons as compact chips */}
            {!flight.armed && preArmReasons.length > 0 && (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {preArmReasons.map(({ reason, fix }, i) => {
                    const hasFixContent = fix.params.length > 0 || fix.action || fix.navigateTo;
                    return (
                      <span
                        key={i}
                        className={`px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-[11px] ${hasFixContent ? 'cursor-pointer hover:bg-red-500/15' : ''}`}
                        onClick={hasFixContent ? () => setExpandedPreArm((prev) => {
                          const next = new Set(prev);
                          if (next.has(reason)) next.delete(reason);
                          else next.add(reason);
                          return next;
                        }) : undefined}
                      >
                        {reason} {hasFixContent && (expandedPreArm.has(reason) ? '▾' : '›')}
                      </span>
                    );
                  })}
                </div>
                {preArmReasons.filter(({ reason }) => expandedPreArm.has(reason)).map(({ reason, fix }) => (
                  <PreArmParamFix
                    key={reason}
                    paramIds={fix.params}
                    hint={fix.hint}
                    action={fix.action}
                    navigateTo={fix.navigateTo}
                  />
                ))}
              </div>
            )}

            <ManualStickControl defaultActive={!sitlIsRunning} />
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-auto p-3 gap-3">

            {/* ── STATUS BAR ── */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface border border-subtle">
              <div className={`w-3 h-3 rounded-full shrink-0 ${
                flight.armed ? 'bg-red-400 animate-pulse' : 'bg-content-tertiary'
              }`} />
              <span className={`text-lg font-bold ${flight.armed ? 'text-red-400' : 'text-content-secondary'}`}>
                {flight.armed ? 'ARMED' : 'DISARMED'}
              </span>
              <span className="text-content-tertiary text-lg">·</span>
              <span className="text-lg text-content font-medium">{flight.mode || 'Unknown'}</span>
              <span className="ml-auto text-xs text-content-tertiary shrink-0 px-2 py-0.5 rounded bg-surface-raised">MAVLink</span>
            </div>

            {/* ── ARM / DISARM BUTTON ── */}
            <button
              onClick={() => handleArmDisarm()}
              disabled={isLoading}
              className={`w-full flex items-center justify-center gap-3 px-4 py-4 rounded-2xl
                font-extrabold text-xl uppercase tracking-wider transition-all border-2 select-none
                ${isLoading ? 'cursor-wait opacity-70' : 'cursor-pointer'}
                ${flight.armed
                  ? 'bg-red-500/20 border-red-500/60 text-red-400 hover:bg-red-500/30 shadow-lg shadow-red-500/15'
                  : forceArm
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-400 hover:bg-amber-500/30 shadow-lg shadow-amber-500/15'
                    : 'bg-surface border-subtle text-content hover:bg-surface-raised hover:border-default'
                }`}
            >
              {isLoading ? (
                <>
                  <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>{flight.armed ? 'Disarming...' : 'Arming...'}</span>
                </>
              ) : (
                <>
                  <div className={`w-3.5 h-3.5 rounded-full ${
                    flight.armed ? 'bg-red-400 animate-pulse' : forceArm ? 'bg-amber-400' : 'bg-content-tertiary'
                  }`} />
                  <span>{flight.armed ? 'DISARM' : forceArm ? 'FORCE ARM' : 'ARM'}</span>
                </>
              )}
            </button>

            {statusMsg && (
              <div className={`text-center text-sm font-semibold ${statusColor}`}>{statusMsg.text}</div>
            )}

            {/* ── PRE-ARM FAILURES ── */}
            {!flight.armed && preArmReasons.length > 0 && (
              <div className="bg-red-500/10 border-2 border-red-500/30 rounded-2xl p-3">
                <div className="text-red-400 text-xs font-bold uppercase tracking-wider mb-2">Arming Blocked</div>
                <div className="flex flex-col gap-1.5">
                  {preArmReasons.map(({ reason, fix }, i) => {
                    const isExpanded = expandedPreArm.has(reason);
                    const hasFixContent = fix.params.length > 0 || fix.action || fix.navigateTo;
                    return (
                      <div key={i}>
                        <div
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl ${hasFixContent ? 'cursor-pointer hover:bg-red-500/10' : ''} transition-colors`}
                          onClick={hasFixContent ? () => setExpandedPreArm((prev) => {
                            const next = new Set(prev);
                            if (next.has(reason)) next.delete(reason);
                            else next.add(reason);
                            return next;
                          }) : undefined}
                        >
                          <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span className="flex-1 text-red-300 text-sm font-medium">{reason}</span>
                          {hasFixContent && (
                            <span className="text-xs text-blue-400 shrink-0 font-medium">{isExpanded ? '▾' : 'Fix ›'}</span>
                          )}
                        </div>
                        {isExpanded && (
                          <PreArmParamFix
                            paramIds={fix.params}
                            hint={fix.hint}
                            action={fix.action}
                            navigateTo={fix.navigateTo}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── FORCE ARM TOGGLE ── */}
            <button
              onClick={() => setForceArm(!forceArm)}
              title="Bypass pre-arm checks — use only when the failing check is known-safe."
              className={`flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all
                ${forceArm
                  ? 'bg-amber-500/15 border-2 border-amber-500/40'
                  : 'bg-surface border-2 border-subtle hover:border-default'}`}
            >
              <div className="flex items-center gap-3">
                <svg className={`w-5 h-5 ${forceArm ? 'text-amber-400' : 'text-content-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className={`text-sm font-bold ${forceArm ? 'text-amber-300' : 'text-content'}`}>Force ARM</span>
              </div>
              <div className={`w-10 h-5 rounded-full transition-colors relative ${forceArm ? 'bg-amber-500' : 'bg-surface-raised'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${forceArm ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </button>

            {/* ── FIX PRE-ARM: disable RC checks for GCS-only control ── */}
            {!flight.armed && preArmReasons.length > 0 && (
              <button
                onClick={async () => {
                  const setParam = useParameterStore.getState().setParameter;
                  await Promise.all([
                    setParam('ARMING_RC_CHECKS', 0),
                    setParam('FS_THR_ENABLE', 0),
                  ]);
                  setStatusMsg({ text: 'Set ARMING_RC_CHECKS=0 & FS_THR_ENABLE=0 — reboot FC for ARMING_RC_CHECKS to take effect', type: 'success' });
                  setTimeout(() => setStatusMsg(null), 6000);
                }}
                className="w-full px-4 py-3 text-sm font-bold rounded-xl bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 transition-all"
              >
                Disable RC Failsafe (ARMING_RC_CHECKS=0, FS_THR_ENABLE=0)
              </button>
            )}

            {/* ── FLIGHT MODES ── */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-content-secondary mb-2 px-1">Flight Modes</div>
              <div className="grid grid-cols-3 gap-1.5">
                {availableModes.map((mode) => {
                  const isActive = flight.modeNum === mode.modeNum;
                  return (
                    <button
                      key={mode.modeNum}
                      onClick={() => handleSetMode(mode.modeNum)}
                      title={mode.name}
                      className={`px-2 py-2.5 rounded-xl text-sm font-semibold truncate
                        transition-colors duration-150
                        ${isActive
                          ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                          : 'bg-surface-raised text-content hover:bg-surface-raised hover:text-white border border-transparent hover:border-default'}
                      `}
                    >
                      {mode.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── TAKEOFF ── */}
            {capabilities.takeoff.supported && (
              <button
                onClick={() => setShowTakeoffDialog(true)}
                disabled={flight.armed}
                className="w-full px-4 py-3 text-sm font-bold rounded-xl bg-surface border-2 border-subtle hover:bg-surface-raised hover:border-default disabled:opacity-40 disabled:cursor-not-allowed text-content transition-all"
                title={flight.armed ? 'Already armed — click disarm first' : takeoffPresentation.buttonHint}
              >
                {takeoffPresentation.buttonLabel}
              </button>
            )}

            {/* Takeoff altitude dialog */}
            {showTakeoffDialog && (
              <div className="p-3 bg-surface-raised rounded-xl border border-default">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-content-secondary shrink-0">
                    {takeoffPresentation.dialogPrompt}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={takeoffAlt}
                    onChange={(e) => setTakeoffAlt(Math.max(1, Math.min(100, Number(e.target.value))))}
                    className="w-16 px-2 py-1.5 text-base font-mono bg-surface-input border border-subtle rounded-lg text-content"
                  />
                  <span className="text-sm text-content-secondary">m</span>
                  <button
                    onClick={handleTakeoff}
                    className="ml-auto px-4 py-1.5 text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                  >Go</button>
                  <button
                    onClick={() => setShowTakeoffDialog(false)}
                    className="px-2 py-1.5 text-content-secondary hover:text-content transition-colors text-lg leading-none"
                  >✕</button>
                </div>
                {takeoffPresentation.dialogNote && (
                  <p className="mt-2 text-xs text-content-tertiary leading-tight">
                    {takeoffPresentation.dialogNote}
                  </p>
                )}
              </div>
            )}

            {/* ── MISSION ── */}
            <div className="rounded-xl bg-surface border border-subtle p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-content truncate">
                  {missionLoaded
                    ? <>
                        {missionItems.length} wp
                        <span className="text-content-tertiary"> · </span>
                        <span className="font-mono text-content-secondary">
                          {currentSeq != null
                            ? `→ ${currentSeq + 1}/${missionItems.length}`
                            : (isInAuto ? 'starting…' : 'idle')}
                        </span>
                      </>
                    : <span className="text-content-secondary">No mission</span>}
                </span>
                <button
                  onClick={() => { void fetchMission(); }}
                  className="text-sm text-content-tertiary hover:text-content shrink-0 px-2"
                  title="Reload mission from FC"
                >⟳</button>
              </div>
              {missionLoaded && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSetMode(missionModes.auto)}
                    disabled={!flight.armed || isInAuto}
                    className="flex-1 px-3 py-2 text-sm font-bold rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-300 transition-all"
                    title={!flight.armed ? 'Arm first' : 'Switch to AUTO'}
                  >
                    {isInAuto ? 'Running' : 'Start'}
                  </button>
                  {isInAuto ? (
                    <button
                      onClick={() => handleSetMode(missionModes.pause)}
                      disabled={!flight.armed}
                      className="flex-1 px-3 py-2 text-sm font-bold rounded-lg bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 transition-all"
                    >Pause</button>
                  ) : (
                    <button
                      onClick={() => handleSetMode(missionModes.auto)}
                      disabled={!flight.armed || !isInPause}
                      className="flex-1 px-3 py-2 text-sm font-bold rounded-lg bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-blue-300 transition-all"
                      title={isInPause ? `Resume from ${missionModes.pauseLabel}` : `Pause first`}
                    >Resume</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PanelContainer>
  );
}

// =============================================================================
// Main Component (MSP)
// =============================================================================

export function FlightControlPanel() {
  const flight = useTelemetryStore((s) => s.flight);
  const connectionState = useConnectionStore((state) => state.connectionState);
  const isConnected = connectionState?.isConnected ?? false;
  const protocol = connectionState?.protocol;
  const fcVariant = connectionState?.fcVariant;

  const {
    channels,
    modeMappings,
    modeMappingsLoaded,
    canArm,
    isOverrideActive,
    arm,
    disarm,
    activateMode,
    deactivateMode,
    loadModeRanges,
    stopOverride,
    setChannel,
    startOverride,
  } = useFlightControlStore();

  const [armSwitchOn, setArmSwitchOn] = useState(false);
  const [modeToggles, setModeToggles] = useState<Record<number, boolean>>({});
  const [showSetup, setShowSetup] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  // Load mode ranges when connected to MSP
  useEffect(() => {
    if (isConnected && protocol === 'msp' && !modeMappingsLoaded) {
      loadModeRanges();
    }
  }, [isConnected, protocol, modeMappingsLoaded, loadModeRanges]);

  // Auto-start RC override when MSP is fully connected
  useEffect(() => {
    if (isConnected && protocol === 'msp' && fcVariant && !isOverrideActive) {
      startOverride();
    }
  }, [isConnected, protocol, fcVariant, isOverrideActive, startOverride]);

  // Stop override and reset switches when disconnecting
  useEffect(() => {
    if (!isConnected) {
      if (isOverrideActive) stopOverride();
      setArmSwitchOn(false);
      setModeToggles({});
    }
  }, [isConnected, isOverrideActive, stopOverride]);

  // Sync ARM switch with telemetry
  useEffect(() => {
    if (isConnected && flight.armed && !armSwitchOn) {
      setArmSwitchOn(true);
    }
  }, [isConnected, flight.armed, armSwitchOn]);

  // Handle arm switch toggle
  const handleArmToggle = async (newState: boolean) => {
    setArmSwitchOn(newState);
    if (newState) {
      await arm();
    } else {
      await disarm();
    }
  };

  // Handle mode toggle
  const handleModeToggle = async (boxId: number) => {
    const isCurrentlyOn = modeToggles[boxId] ?? false;
    const newState = !isCurrentlyOn;

    setModeToggles((prev) => ({ ...prev, [boxId]: newState }));

    const success = newState
      ? await activateMode(boxId)
      : await deactivateMode(boxId);

    if (!success) {
      setModeToggles((prev) => ({ ...prev, [boxId]: isCurrentlyOn }));
    }
  };

  // Handle SITL configuration
  const handleConfigureSitl = async () => {
    setIsConfiguring(true);
    setConfigMessage('Configuring...');
    const success = await configureSitlForTesting();
    setConfigMessage(success ? 'Saved! Reconnect after reboot.' : 'Failed. Check console.');
    setIsConfiguring(false);
  };

  // Check if mode is active by channel value
  const isModeActiveByChannel = (boxId: number) => {
    const mapping = modeMappings.find((m) => m.boxId === boxId);
    if (!mapping || mapping.auxChannel === null) return false;
    const channelValue = channels[mapping.auxChannel + 4] || 1000;
    return channelValue >= mapping.rangeStart && channelValue <= mapping.rangeEnd;
  };

  // Center stick controls
  const centerSticks = () => {
    setChannel(0, 1500);
    setChannel(1, 1500);
    setChannel(3, 1500);
  };

  // Not connected state
  if (!isConnected) {
    return (
      <PanelContainer className="flex flex-col items-center justify-center">
        <svg className="w-12 h-12 text-content-tertiary mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
        <div className="text-content-secondary text-sm">Connect to a device</div>
      </PanelContainer>
    );
  }

  // MAVLink mode: show arm/disarm with force-arm option
  if (protocol === 'mavlink') {
    return <MavlinkFlightControl />;
  }

  return (
    <div data-tour="telemetry-flight-control" className="h-full w-full">
      <PanelContainer>
        <div className="flex flex-col h-full">
          {/* Header with status */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="text-content font-medium">{flight.mode || 'Unknown'}</div>
            </div>
            <RcStatusIndicator isActive={isOverrideActive} />
          </div>

        {/* ARM Control - Centered and prominent */}
        <div className="flex justify-center mb-4">
          <ArmButton
            isArmed={flight.armed}
            canArm={canArm}
            armSwitchOn={armSwitchOn}
            onToggle={handleArmToggle}
          />
        </div>

        {/* Arming Blocked Reasons */}
        {!flight.armed && flight.armingDisabledReasons && flight.armingDisabledReasons.length > 0 && (
          <div className="mb-4 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="text-red-400 text-[10px] font-medium uppercase tracking-wider mb-1">Arming Blocked</div>
            <div className="flex flex-wrap gap-1">
              {flight.armingDisabledReasons.map((reason, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-red-500/20 rounded text-red-300 text-[10px]">
                  {reason}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Flight Modes - Chip style */}
        <div className="mb-4">
          <SectionTitle>Flight Modes</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {COMMON_MODES.map((mode) => {
              const mapping = modeMappings.find((m) => m.boxId === mode.boxId);
              const isConfigured = mapping && mapping.auxChannel !== null;
              const isActive = modeToggles[mode.boxId] || isModeActiveByChannel(mode.boxId);

              return (
                <ModeChip
                  key={mode.boxId}
                  name={mode.name}
                  isActive={isActive}
                  isConfigured={!!isConfigured}
                  onClick={() => handleModeToggle(mode.boxId)}
                />
              );
            })}
          </div>
        </div>

        {/* Controls Grid */}
        <div className="flex-1 flex items-center justify-center gap-6">
          {/* Left stick (Throttle/Yaw) */}
          <div className="flex gap-4">
            <ThrottleGauge
              value={channels[2]!}
              onChange={(v) => {
                setChannel(2, v);
                if (!isOverrideActive) startOverride();
              }}
            />
          </div>

          {/* Right stick (Roll/Pitch) */}
          <JoystickControl
            x={channels[0]!}
            y={channels[1]!}
            onChangeX={(v) => {
              setChannel(0, v);
              if (!isOverrideActive) startOverride();
            }}
            onChangeY={(v) => {
              setChannel(1, v);
              if (!isOverrideActive) startOverride();
            }}
            label="Roll / Pitch"
            xLabel="R"
            yLabel="P"
          />
        </div>

        {/* Center button */}
        <button
          onClick={centerSticks}
          className="mt-3 py-1.5 px-3 text-xs text-content-secondary hover:text-content bg-surface hover:bg-surface-raised rounded transition-colors self-center"
        >
          Center Sticks
        </button>

        {/* Setup section (collapsed by default) */}
        {!canArm && modeMappingsLoaded && (
          <div className="mt-4 pt-3 border-t border-default">
            <button
              onClick={() => setShowSetup(!showSetup)}
              className="flex items-center gap-2 text-content-secondary hover:text-content-secondary text-xs transition-colors"
            >
              <svg className={`w-3 h-3 transition-transform ${showSetup ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Setup Required
            </button>

            {showSetup && (
              <div className="mt-2 p-2 bg-surface-raised rounded-lg">
                <p className="text-content-secondary text-xs mb-2">
                  ARM mode not configured. Click below to auto-configure for SITL testing.
                </p>
                <button
                  onClick={handleConfigureSitl}
                  disabled={isConfiguring}
                  className="w-full py-2 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isConfiguring ? 'Configuring...' : 'Setup for SITL'}
                </button>
                {configMessage && (
                  <p className="text-xs text-center text-blue-400 mt-2">{configMessage}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Loading state */}
        {!modeMappingsLoaded && (
          <div className="text-center text-content-secondary text-xs py-4">
            Loading configuration...
          </div>
        )}
      </div>
    </PanelContainer>
    </div>
  );
}
