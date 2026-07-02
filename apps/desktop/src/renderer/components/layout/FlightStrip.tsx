/**
 * FlightStrip — persistent bottom bar shown on every view when connected.
 *
 * Contains:
 *   • ARM / DISARM button + arming-blocked summary
 *   • Current mode + quick-change dropdown (MAVLink & MSP)
 *   • Keyboard controls toggle (WASD/QE) with live key indicators
 *   • Joystick section (Gamepad API — first connected device, axis live bars)
 *   • RC channel mini-bars (throttle, roll, pitch, yaw)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useFlightControlStore } from '../../stores/flight-control-store';
import { useMessagesStore } from '../../stores/messages-store';
import { useParameterStore } from '../../stores/parameter-store';
import { useArduPilotSitlStore } from '../../stores/ardupilot-sitl-store';
import { isPreArmMessage, extractPreArmReason } from '../../../shared/prearm-checks';
import {
  getVehicleClass,
  ARDUPILOT_COMMON_MODES,
} from '../../../shared/telemetry-types';
import { useGamepad, loadAxisMap, saveAxisMap, DEFAULT_AXIS_MAP, type GamepadAxisMap } from '../../hooks/useGamepad';
import { Gamepad2, Keyboard, ChevronDown, Settings2 } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const MSP_MODE_LABELS: Record<number, string> = {
  0: 'ARM', 1: 'ANGLE', 2: 'HORIZON', 3: 'NAV ALTHOLD', 5: 'HEADING HOLD',
  10: 'NAV RTH', 11: 'NAV POSHOLD', 12: 'MANUAL', 28: 'NAV WP',
};

// ─── Keyboard hook ────────────────────────────────────────────────────────────

interface KeyState { w: boolean; a: boolean; s: boolean; d: boolean; q: boolean; e: boolean; ArrowLeft: boolean; ArrowRight: boolean; ArrowUp: boolean; ArrowDown: boolean; }

const EMPTY_KEYS: KeyState = { w: false, a: false, s: false, d: false, q: false, e: false, ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };

function useKeyboardControl(active: boolean, onChannels: (roll: number, pitch: number, throttleAdj: number, yaw: number) => void) {
  const keysRef = useRef<KeyState>({ ...EMPTY_KEYS });
  const [keyState, setKeyState] = useState<KeyState>({ ...EMPTY_KEYS });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      keysRef.current = { ...EMPTY_KEYS };
      setKeyState({ ...EMPTY_KEYS });
      return;
    }

    const onDown = (e: KeyboardEvent) => {
      const k = e.key as keyof KeyState;
      if (!(k in EMPTY_KEYS)) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      if (!keysRef.current[k]) {
        keysRef.current = { ...keysRef.current, [k]: true };
        setKeyState({ ...keysRef.current });
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key as keyof KeyState;
      if (!(k in EMPTY_KEYS)) return;
      keysRef.current = { ...keysRef.current, [k]: false };
      setKeyState({ ...keysRef.current });
    };

    document.addEventListener('keydown', onDown);
    document.addEventListener('keyup', onUp);

    // Send RC deltas at 20 Hz
    const STEP = 20; // µs per tick
    intervalRef.current = setInterval(() => {
      const k = keysRef.current;
      const roll  = k.d ? STEP : k.a ? -STEP : 0;
      const pitch = k.s ? STEP : k.w ? -STEP : 0;
      const tAdj  = k.q ? STEP : k.e ? -STEP : 0;
      const yaw   = k.ArrowRight ? STEP : k.ArrowLeft ? -STEP : 0;
      if (roll || pitch || tAdj || yaw) onChannels(roll, pitch, tAdj, yaw);
    }, 50);

    return () => {
      document.removeEventListener('keydown', onDown);
      document.removeEventListener('keyup', onUp);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, onChannels]);

  return keyState;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pwmToPercent(pwm: number) { return Math.round(((pwm - 1000) / 1000) * 100); }

function Divider() {
  return <div className="w-px h-8 bg-surface-raised shrink-0 mx-1" />;
}

interface MiniBarProps { label: string; value: number; /* PWM 1000-2000 */ color?: string; }
function MiniBar({ label, value, color = 'bg-blue-500' }: MiniBarProps) {
  const pct = pwmToPercent(value);
  const isCentered = value >= 1480 && value <= 1520;
  return (
    <div className="flex flex-col items-center gap-1 w-12">
      <div className="w-full h-2.5 rounded-full bg-surface-raised relative overflow-hidden">
        <div
          className={`absolute h-full rounded-full transition-all duration-75 ${isCentered ? 'bg-content-tertiary' : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-content-tertiary leading-none font-medium">{label}</span>
    </div>
  );
}

interface KeyCapProps { label: string; active?: boolean; small?: boolean; }
function KeyCap({ label, active, small }: KeyCapProps) {
  return (
    <div className={`flex items-center justify-center rounded-lg border text-xs font-mono font-bold transition-colors
      ${small ? 'w-5 h-5' : 'w-7 h-6'}
      ${active
        ? 'bg-blue-500/30 border-blue-400 text-blue-300'
        : 'bg-surface-raised border-subtle text-content-tertiary'
      }`}>
      {label}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FlightStrip() {
  const flight = useTelemetryStore((s) => s.flight);
  const battery = useTelemetryStore((s) => s.battery);
  const connectionState = useConnectionStore((s) => s.connectionState);
  const messages = useMessagesStore((s) => s.messages);
  const qEnable = useParameterStore((s) => s.parameters.get('Q_ENABLE')?.value);
  const sitlIsRunning = useArduPilotSitlStore((s) => s.isRunning);
  const sitlFrame = useArduPilotSitlStore((s) => s.model);

  const {
    arm: mspArm, disarm: mspDisarm, canArm: mspCanArm,
    modeMappingsLoaded, loadModeRanges,
    isOverrideActive, startOverride,
    channels, setChannel,
    modeMappings, activateMode, deactivateMode,
    kbActive,
    gpActive,
    rxConfigChecked, rxConfigIsMsp, fixRxConfigForGcs,
  } = useFlightControlStore();
  const [fixingRxConfig, setFixingRxConfig] = useState(false);

  const isConnected = connectionState?.isConnected ?? false;
  const protocol = connectionState?.protocol;
  const isMavlink = protocol === 'mavlink';
  const isMsp = protocol === 'msp';

  // Derived vehicle class for MAVLink mode list
  const vehicleClass = getVehicleClass(connectionState?.mavType, {
    qEnable: typeof qEnable === 'number' ? qEnable : undefined,
    sitlFrame: sitlIsRunning ? sitlFrame : undefined,
  });
  const availableModes = ARDUPILOT_COMMON_MODES[vehicleClass] ?? [];

  // ── Input mode state ───────────────────────────────────────────────────────
  // kbActive/gpActive live in flight-control-store — the toggle buttons are in
  // the AppShell header (mutually exclusive), while this component streams RC
  // and shows live indicators.
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showAxisMenu, setShowAxisMenu] = useState(false);
  const [axisMap, setAxisMap] = useState<GamepadAxisMap>(loadAxisMap);
  const [armLoading, setArmLoading] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const axisMenuRef = useRef<HTMLDivElement>(null);

  // ── MAVLink keyboard RC state (absolute values, not deltas) ────────────────
  const mavKbChannelsRef = useRef({ roll: 1500, pitch: 1500, throttle: 1000, yaw: 1500 });
  const [mavKbChannels, setMavKbChannels] = useState({ roll: 1500, pitch: 1500, throttle: 1000, yaw: 1500 });

  // Stream MAVLink RC override at 10 Hz while keyboard is active
  useEffect(() => {
    if (!kbActive || !isConnected || !isMavlink) return;
    const id = setInterval(() => {
      const s = mavKbChannelsRef.current;
      window.electronAPI?.rcOverrideSet?.(s.roll, s.pitch, s.throttle, s.yaw);
    }, 100);
    return () => {
      clearInterval(id);
      window.electronAPI?.rcOverrideRelease?.();
      mavKbChannelsRef.current = { roll: 1500, pitch: 1500, throttle: 1000, yaw: 1500 };
      setMavKbChannels({ roll: 1500, pitch: 1500, throttle: 1000, yaw: 1500 });
    };
  }, [kbActive, isConnected, isMavlink]);

  // Release MAVLink RC override on unmount
  useEffect(() => {
    return () => { void window.electronAPI?.rcOverrideRelease?.(); };
  }, []);

  // ── Setup MSP mode ranges on connect ──────────────────────────────────────
  useEffect(() => {
    if (isConnected && isMsp && !modeMappingsLoaded) loadModeRanges();
  }, [isConnected, isMsp, modeMappingsLoaded, loadModeRanges]);

  useEffect(() => {
    if (isConnected && isMsp && connectionState.fcVariant && !isOverrideActive) startOverride();
  }, [isConnected, isMsp, connectionState.fcVariant, isOverrideActive, startOverride]);

  // ── Gamepad ────────────────────────────────────────────────────────────────
  const gamepad = useGamepad();
  // useGamepad() returns a brand-new object every animation frame (~60Hz),
  // even when nothing changed. Reading it via a ref (kept fresh on every
  // render, no effect dependency) lets the send-intervals below depend only
  // on gamepad.connected/isConnected/etc — if gamepad.axes were in those
  // dependency arrays, the interval would be torn down and recreated ~60
  // times/sec and its 50ms callback would never survive long enough to fire,
  // silently making joystick control a no-op.
  const gamepadRef = useRef(gamepad);
  gamepadRef.current = gamepad;

  // Push gamepad axes → RC channels at 20 Hz while active
  const gpIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (gpIntervalRef.current) clearInterval(gpIntervalRef.current);
    if (!gpActive || !gamepad.connected || !isConnected || !isMsp) return;

    gpIntervalRef.current = setInterval(() => {
      const axes = gamepadRef.current.axes;
      const roll  = Math.round(1500 + (axes[axisMap.roll]  ?? 0) * 500);
      const pitch = Math.round(1500 + (axes[axisMap.pitch] ?? 0) * (axisMap.invertPitch ? -500 : 500));
      const thr   = Math.round(1000 + ((axes[axisMap.throttle] ?? -1) * (axisMap.invertThrottle ? -1 : 1) + 1) / 2 * 1000);
      const yaw   = Math.round(1500 + (axes[axisMap.yaw]   ?? 0) * 500);
      setChannel(0, Math.max(1000, Math.min(2000, roll)));
      setChannel(1, Math.max(1000, Math.min(2000, pitch)));
      setChannel(2, Math.max(1000, Math.min(2000, thr)));
      setChannel(3, Math.max(1000, Math.min(2000, yaw)));
    }, 50);
    return () => { if (gpIntervalRef.current) clearInterval(gpIntervalRef.current); };
  }, [gpActive, gamepad.connected, isConnected, isMsp, axisMap, setChannel]);

  // Push gamepad axes → MAVLink RC override at 20 Hz while active
  const mavGpIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mavGpChannels, setMavGpChannels] = useState({ roll: 1500, pitch: 1500, throttle: 1000, yaw: 1500 });
  useEffect(() => {
    if (mavGpIntervalRef.current) clearInterval(mavGpIntervalRef.current);
    if (!gpActive || !gamepad.connected || !isConnected || !isMavlink) return;

    mavGpIntervalRef.current = setInterval(() => {
      const axes = gamepadRef.current.axes;
      const roll  = Math.round(1500 + (axes[axisMap.roll]  ?? 0) * 500);
      const pitch = Math.round(1500 + (axes[axisMap.pitch] ?? 0) * (axisMap.invertPitch ? -500 : 500));
      const thr   = Math.round(1000 + ((axes[axisMap.throttle] ?? -1) * (axisMap.invertThrottle ? -1 : 1) + 1) / 2 * 1000);
      const yaw   = Math.round(1500 + (axes[axisMap.yaw]   ?? 0) * 500);
      const clamped = {
        roll:  Math.max(1000, Math.min(2000, roll)),
        pitch: Math.max(1000, Math.min(2000, pitch)),
        throttle: Math.max(1000, Math.min(2000, thr)),
        yaw:   Math.max(1000, Math.min(2000, yaw)),
      };
      setMavGpChannels(clamped);
      window.electronAPI?.rcOverrideSet?.(clamped.roll, clamped.pitch, clamped.throttle, clamped.yaw);
    }, 50);
    return () => {
      if (mavGpIntervalRef.current) clearInterval(mavGpIntervalRef.current);
      if (!kbActive) window.electronAPI?.rcOverrideRelease?.();
    };
  }, [gpActive, gamepad.connected, isConnected, isMavlink, axisMap, kbActive]);

  // ── Keyboard → RC channels (MSP) ───────────────────────────────────────────
  const handleKbChannels = useCallback((dRoll: number, dPitch: number, dThr: number, dYaw: number) => {
    const cur = useFlightControlStore.getState().channels;
    setChannel(0, Math.max(1000, Math.min(2000, (cur[0] ?? 1500) + dRoll)));
    setChannel(1, Math.max(1000, Math.min(2000, (cur[1] ?? 1500) + dPitch)));
    setChannel(2, Math.max(1000, Math.min(2000, (cur[2] ?? 1000) + dThr)));
    setChannel(3, Math.max(1000, Math.min(2000, (cur[3] ?? 1500) + dYaw)));
  }, [setChannel]);

  const keyState = useKeyboardControl(kbActive && isConnected && isMsp, handleKbChannels);

  // ── Keyboard → RC channels (MAVLink) ───────────────────────────────────────
  const handleMavKbChannels = useCallback((dRoll: number, dPitch: number, dThr: number, dYaw: number) => {
    const cur = mavKbChannelsRef.current;
    const next = {
      roll:  Math.max(1000, Math.min(2000, cur.roll + dRoll)),
      pitch: Math.max(1000, Math.min(2000, cur.pitch + dPitch)),
      throttle: Math.max(1000, Math.min(2000, cur.throttle + dThr)),
      yaw:   Math.max(1000, Math.min(2000, cur.yaw + dYaw)),
    };
    mavKbChannelsRef.current = next;
    setMavKbChannels(next);
  }, []);

  const mavKeyState = useKeyboardControl(kbActive && isConnected && isMavlink, handleMavKbChannels);

  // ── Pre-arm reasons ────────────────────────────────────────────────────────
  const preArmReasons = useMemo(() => {
    if (flight.armed || !isConnected) return [];
    if (isMavlink) {
      return messages.filter((m) => isPreArmMessage(m.text))
        .map((m) => extractPreArmReason(m.text))
        .filter((r, i, a) => a.indexOf(r) === i)
        .slice(0, 4);
    }
    return (flight.armingDisabledReasons ?? []).slice(0, 4);
  }, [flight.armed, flight.armingDisabledReasons, isConnected, isMavlink, messages]);

  // ── Close dropdowns on outside click ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) setShowModeMenu(false);
      if (axisMenuRef.current && !axisMenuRef.current.contains(e.target as Node)) setShowAxisMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Arm / Disarm ──────────────────────────────────────────────────────────
  const handleArmDisarm = async () => {
    if (armLoading) return;
    setArmLoading(true);
    try {
      if (isMavlink) await window.electronAPI.mavlinkArmDisarm(!flight.armed, false);
      else if (isMsp) { if (flight.armed) await mspDisarm(); else await mspArm(); }
    } catch { /* ignore */ }
    finally { setTimeout(() => setArmLoading(false), 600); }
  };

  // ── Mode switching ─────────────────────────────────────────────────────────
  const handleMavlinkMode = async (modeNum: number) => {
    setShowModeMenu(false);
    try { await window.electronAPI.mavlinkSetMode(modeNum); } catch { /* ignore */ }
  };

  const handleMspMode = async (boxId: number) => {
    setShowModeMenu(false);
    const current = modeMappings.find((m) => m.boxId === boxId);
    if (!current) return;
    // Deactivate all, activate target
    for (const m of modeMappings) {
      if (m.boxId !== 0) await deactivateMode(m.boxId);
    }
    await activateMode(boxId);
  };

  // ── Current mode label ────────────────────────────────────────────────────
  const modeLabel = isMavlink
    ? (flight.mode || 'Unknown')
    : (flight.mode || 'Unknown');

  if (!isConnected) return null;

  return (
    <div className="h-16 shrink-0 border-t border-subtle bg-surface-nav flex items-center px-4 gap-3 z-40">

      {/* ── ARM / DISARM ── */}
      <button
        onClick={handleArmDisarm}
        disabled={armLoading || (!flight.armed && isMsp && !mspCanArm)}
        className={`
          flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-extrabold uppercase tracking-widest
          transition-all duration-150 shrink-0 select-none
          ${armLoading ? 'opacity-50 cursor-not-allowed' : ''}
          ${flight.armed
            ? 'bg-red-500/20 border-2 border-red-500/40 text-red-400 hover:bg-red-500/30 shadow-md shadow-red-500/10'
            : 'bg-surface border-2 border-subtle text-content-secondary hover:bg-surface-raised hover:text-content hover:border-default'
          }
        `}
      >
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${flight.armed ? 'bg-red-400 animate-pulse' : 'bg-content-tertiary'}`} />
        {armLoading
          ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : <span>{flight.armed ? 'DISARM' : 'ARM'}</span>
        }
      </button>

      {/* Arming-blocked chips */}
      {!flight.armed && preArmReasons.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-hidden">
          {preArmReasons.slice(0, 3).map((r, i) => (
            <span key={i} className="px-2 py-0.5 bg-red-500/15 rounded-lg text-red-300 text-xs font-medium whitespace-nowrap">
              {r}
            </span>
          ))}
          {preArmReasons.length > 3 && (
            <span className="text-xs text-content-tertiary">+{preArmReasons.length - 3}</span>
          )}
        </div>
      )}

      {/* Receiver not set to MSP — GCS stick input (throttle/joystick/keyboard)
          won't reach the mixer even though arming and telemetry work fine. */}
      {isMsp && rxConfigChecked && rxConfigIsMsp === false && (
        <div className="flex items-center gap-2 px-2 py-1 bg-amber-500/15 rounded-lg shrink-0">
          <span className="text-xs font-medium text-amber-300 whitespace-nowrap">
            Receiver not set to MSP — GCS control won't reach motors
          </span>
          <button
            onClick={async () => {
              setFixingRxConfig(true);
              await fixRxConfigForGcs();
              setFixingRxConfig(false);
            }}
            disabled={fixingRxConfig}
            className="px-2 py-0.5 rounded-md bg-amber-500/25 hover:bg-amber-500/35 text-amber-200 text-xs font-bold whitespace-nowrap disabled:opacity-50"
          >
            {fixingRxConfig ? 'Fixing…' : 'Fix'}
          </button>
        </div>
      )}

      {/* Couldn't read MSP_RX_CONFIG at all (unsupported FC or read failed) —
          can't safely auto-fix, but still warn while a GCS input mode is on
          since this is the #1 cause of "control does nothing" reports. */}
      {isMsp && rxConfigChecked && rxConfigIsMsp === null && (kbActive || gpActive) && (
        <div className="flex items-center gap-2 px-2 py-1 bg-amber-500/10 rounded-lg shrink-0">
          <span className="text-xs font-medium text-amber-300/80 whitespace-nowrap">
            Couldn't verify receiver config — if controls don't respond, set Receiver Mode to MSP on the FC
          </span>
        </div>
      )}

      <Divider />

      {/* ── MODE SELECTOR ── */}
      <div className="relative shrink-0" ref={modeMenuRef}>
        <button
          onClick={() => setShowModeMenu((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border-2 border-subtle hover:bg-surface-raised transition-colors text-sm text-content-secondary hover:text-content"
        >
          <span className="font-bold text-content">{modeLabel}</span>
          <ChevronDown size={14} className={`transition-transform ${showModeMenu ? 'rotate-180' : ''}`} />
        </button>

        {showModeMenu && (
          <div className="absolute bottom-full mb-2 left-0 bg-surface-solid border border-subtle rounded-xl shadow-2xl z-50 min-w-44 overflow-hidden py-1 max-h-72 overflow-y-auto">
            {isMavlink && availableModes.map((m) => (
              <button
                key={m.modeNum}
                onClick={() => handleMavlinkMode(m.modeNum)}
                className={`w-full px-4 py-2 text-left text-sm font-medium transition-colors hover:bg-surface-raised
                  ${flight.modeNum === m.modeNum ? 'text-blue-400 bg-blue-500/10' : 'text-content-secondary'}`}
              >
                {m.name}
              </button>
            ))}
            {isMsp && modeMappings.filter((m) => m.boxId !== 0).map((m) => (
              <button
                key={m.boxId}
                onClick={() => handleMspMode(m.boxId)}
                className="w-full px-4 py-2 text-left text-sm text-content-secondary hover:bg-surface-raised transition-colors"
              >
                {MSP_MODE_LABELS[m.boxId] ?? `Mode ${m.boxId}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* ── KEYBOARD CONTROL INDICATORS (MSP + MAVLink) ──
          Toggle lives in the header (AppShell) — this just shows live key
          state while keyboard RC control is active. Independent of the
          joystick section below (the two are mutually exclusive, but each
          renders on its own condition so one being off never hides the other). */}
      {(isMsp || isMavlink) && kbActive && (
        <>
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center gap-1.5 text-blue-400" title="Keyboard RC control active">
              <Keyboard size={15} />
              <span className="text-sm font-bold">KB</span>
            </div>

            {/* Key indicators — use protocol-specific keyState */}
            <div className="flex flex-col gap-0.5">
              <div className="flex gap-0.5">
                <KeyCap label="W" active={isMsp ? keyState.w : mavKeyState.w} />
              </div>
              <div className="flex gap-0.5">
                <KeyCap label="A" active={isMsp ? keyState.a : mavKeyState.a} />
                <KeyCap label="S" active={isMsp ? keyState.s : mavKeyState.s} />
                <KeyCap label="D" active={isMsp ? keyState.d : mavKeyState.d} />
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <KeyCap label="Q" active={isMsp ? keyState.q : mavKeyState.q} />
              <KeyCap label="E" active={isMsp ? keyState.e : mavKeyState.e} />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-center">
                <KeyCap label="↑" active={isMsp ? keyState.ArrowUp : mavKeyState.ArrowUp} />
              </div>
              <div className="flex gap-0.5">
                <KeyCap label="←" active={isMsp ? keyState.ArrowLeft : mavKeyState.ArrowLeft} />
                <KeyCap label="↓" active={isMsp ? keyState.ArrowDown : mavKeyState.ArrowDown} />
                <KeyCap label="→" active={isMsp ? keyState.ArrowRight : mavKeyState.ArrowRight} />
              </div>
            </div>
          </div>

          <Divider />
        </>
      )}

      {/* ── JOYSTICK / GAMEPAD INDICATORS ──
          Toggle lives in the header (AppShell) — this shows live axis bars
          and the axis-mapping settings while joystick RC control is active. */}
      {(isMsp || isMavlink) && gpActive && gamepad.connected && (
        <>
          <div className="flex items-center gap-2.5 shrink-0" ref={axisMenuRef}>
            <div className="flex items-center gap-1.5 text-blue-400" title={gamepad.name}>
              <Gamepad2 size={15} />
              <span className="text-sm font-bold max-w-28 truncate">{gpName(gamepad.name)}</span>
            </div>

            {/* Live axis bars */}
            <div className="flex items-end gap-1.5">
              {(['roll','pitch','throttle','yaw'] as const).map((axis) => {
                const idx = axisMap[axis] as number;
                const raw = gamepad.axes[idx] ?? 0;
                const pct = Math.round((raw + 1) / 2 * 100);
                return (
                  <div key={axis} className="flex flex-col items-center gap-0.5 w-8">
                    <div className="w-full h-2 rounded-full bg-surface-raised relative overflow-hidden">
                      <div
                        className="absolute h-full rounded-full bg-blue-500/70 transition-all duration-75"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-content-tertiary leading-none uppercase">{axis.slice(0,3)}</span>
                  </div>
                );
              })}
            </div>

            {/* Axis mapping button */}
            <button
              onClick={() => setShowAxisMenu((v) => !v)}
              className="p-1.5 rounded-lg text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors"
              title="Axis mapping"
            >
              <Settings2 size={14} />
            </button>

            {/* Axis mapping popup */}
            {showAxisMenu && (
              <div className="absolute bottom-full mb-2 bg-surface-solid border border-subtle rounded-xl shadow-2xl z-50 p-4 min-w-60" style={{ left: 'auto', right: 0 }}>
                <p className="text-xs font-bold text-content-secondary uppercase tracking-wider mb-3">Axis Mapping</p>
                {(['roll','pitch','throttle','yaw'] as const).map((ch) => (
                  <div key={ch} className="flex items-center justify-between mb-2 gap-3">
                    <span className="text-sm text-content-secondary w-16 capitalize">{ch}</span>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={axisMap[ch]}
                        onChange={(e) => {
                          const updated = { ...axisMap, [ch]: Number(e.target.value) };
                          setAxisMap(updated);
                          saveAxisMap(updated);
                        }}
                        className="bg-surface-raised border border-subtle rounded-lg px-2 py-1 text-sm text-content"
                      >
                        {gamepad.axes.map((_, i) => (
                          <option key={i} value={i}>Axis {i}</option>
                        ))}
                      </select>
                      {(ch === 'pitch' || ch === 'throttle') && (
                        <label className="flex items-center gap-1 text-xs text-content-tertiary cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ch === 'pitch' ? axisMap.invertPitch : axisMap.invertThrottle}
                            onChange={(e) => {
                              const key = ch === 'pitch' ? 'invertPitch' : 'invertThrottle';
                              const updated = { ...axisMap, [key]: e.target.checked };
                              setAxisMap(updated);
                              saveAxisMap(updated);
                            }}
                            className="w-3.5 h-3.5"
                          />
                          inv
                        </label>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => { setAxisMap(DEFAULT_AXIS_MAP); saveAxisMap(DEFAULT_AXIS_MAP); }}
                  className="mt-2 text-xs text-content-tertiary hover:text-content transition-colors"
                >
                  Reset to defaults
                </button>
              </div>
            )}
          </div>

          <Divider />
        </>
      )}

      {/* ── BATTERY + SIGNAL + RC CHANNEL MINI-BARS ── */}
      <div className="flex items-center gap-3 shrink-0 ml-auto">
        {/* Battery */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-subtle">
          {(() => {
            const unknown = battery.remaining < 0;
            const level = unknown ? 0 : Math.max(0, Math.min(100, battery.remaining));
            const batColor = level > 30 ? 'text-emerald-400' : level > 15 ? 'text-amber-400' : 'text-red-400';
            return (
              <>
                <svg className={`w-5 h-5 ${batColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="2" y="7" width="18" height="10" rx="2" />
                  <rect x="4" y="9" width={unknown ? 0 : Math.max(1, level * 0.7)} height="6" rx="1" fill="currentColor" opacity="0.6" />
                  <path d="M22 11v2" strokeLinecap="round" />
                </svg>
                <div className="flex flex-col">
                  <span className={`text-sm font-bold font-mono leading-none ${batColor}`}>
                    {battery.voltage > 0 ? `${battery.voltage.toFixed(1)}V` : '—'}
                  </span>
                  <span className="text-[10px] text-content-tertiary leading-none mt-0.5">
                    {unknown ? '—' : `${level}%`}
                    {battery.current > 0 && ` · ${Math.abs(battery.current).toFixed(1)}A`}
                  </span>
                </div>
              </>
            );
          })()}
        </div>

        {/* Signal */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-subtle">
          <div className="flex items-end gap-0.5">
            {[1,2,3,4,5].map((bar) => (
              <div
                key={bar}
                className={`w-1.5 rounded-sm transition-colors ${
                  bar <= 4 ? 'bg-emerald-400' : 'bg-content-tertiary'
                }`}
                style={{ height: `${6 + bar * 3}px` }}
              />
            ))}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold font-mono leading-none text-emerald-400">
              {connectionState?.packetsReceived ? `${Math.round(connectionState.packetsReceived / 10)}` : '—'}
            </span>
            <span className="text-[10px] text-content-tertiary leading-none mt-0.5">pkts/s</span>
          </div>
        </div>

        <Divider />

        {/* RC Channels — MSP uses flight-control-store, MAVLink uses keyboard/gamepad state */}
        <MiniBar label="THR" value={isMsp ? (channels[2] ?? 1000) : (isMavlink && kbActive ? mavKbChannels.throttle : isMavlink && gpActive ? mavGpChannels.throttle : 1000)} color="bg-emerald-500/70" />
        <MiniBar label="ROLL" value={isMsp ? (channels[0] ?? 1500) : (isMavlink && kbActive ? mavKbChannels.roll : isMavlink && gpActive ? mavGpChannels.roll : 1500)} />
        <MiniBar label="PTCH" value={isMsp ? (channels[1] ?? 1500) : (isMavlink && kbActive ? mavKbChannels.pitch : isMavlink && gpActive ? mavGpChannels.pitch : 1500)} />
        <MiniBar label="YAW" value={isMsp ? (channels[3] ?? 1500) : (isMavlink && kbActive ? mavKbChannels.yaw : isMavlink && gpActive ? mavGpChannels.yaw : 1500)} />
      </div>
    </div>
  );
}

// Shorten gamepad name (e.g. "Xbox 360 Controller (XInput STANDARD GAMEPAD)" → "Xbox 360")
function gpName(name: string): string {
  return name.split('(')[0]?.trim().slice(0, 20) || 'Gamepad';
}
