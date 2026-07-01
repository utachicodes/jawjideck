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
  return <div className="w-px h-7 bg-surface-raised shrink-0 mx-1" />;
}

interface MiniBarProps { label: string; value: number; /* PWM 1000-2000 */ color?: string; }
function MiniBar({ label, value, color = 'bg-blue-500' }: MiniBarProps) {
  const pct = pwmToPercent(value);
  const isCentered = value >= 1480 && value <= 1520;
  return (
    <div className="flex flex-col items-center gap-0.5 w-9">
      <div className="w-full h-1.5 rounded-full bg-surface-raised relative overflow-hidden">
        <div
          className={`absolute h-full rounded-full transition-all duration-75 ${isCentered ? 'bg-content-tertiary' : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[9px] text-content-tertiary leading-none">{label}</span>
    </div>
  );
}

interface KeyCapProps { label: string; active?: boolean; small?: boolean; }
function KeyCap({ label, active, small }: KeyCapProps) {
  return (
    <div className={`flex items-center justify-center rounded border text-[9px] font-mono font-bold transition-colors
      ${small ? 'w-5 h-5' : 'w-6 h-5'}
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
  } = useFlightControlStore();

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
  const [kbActive, setKbActive] = useState(false);
  const [gpActive, setGpActive] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showAxisMenu, setShowAxisMenu] = useState(false);
  const [axisMap, setAxisMap] = useState<GamepadAxisMap>(loadAxisMap);
  const [armLoading, setArmLoading] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const axisMenuRef = useRef<HTMLDivElement>(null);

  // ── Setup MSP mode ranges on connect ──────────────────────────────────────
  useEffect(() => {
    if (isConnected && isMsp && !modeMappingsLoaded) loadModeRanges();
  }, [isConnected, isMsp, modeMappingsLoaded, loadModeRanges]);

  useEffect(() => {
    if (isConnected && isMsp && connectionState.fcVariant && !isOverrideActive) startOverride();
  }, [isConnected, isMsp, connectionState.fcVariant, isOverrideActive, startOverride]);

  // ── Gamepad ────────────────────────────────────────────────────────────────
  const gamepad = useGamepad();

  // Push gamepad axes → RC channels at 20 Hz while active
  const gpIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (gpIntervalRef.current) clearInterval(gpIntervalRef.current);
    if (!gpActive || !gamepad.connected || !isConnected || !isMsp) return;

    gpIntervalRef.current = setInterval(() => {
      const axes = gamepad.axes;
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
  }, [gpActive, gamepad.connected, gamepad.axes, isConnected, isMsp, axisMap, setChannel]);

  // ── Keyboard → RC channels ─────────────────────────────────────────────────
  const handleKbChannels = useCallback((dRoll: number, dPitch: number, dThr: number, dYaw: number) => {
    const cur = useFlightControlStore.getState().channels;
    setChannel(0, Math.max(1000, Math.min(2000, (cur[0] ?? 1500) + dRoll)));
    setChannel(1, Math.max(1000, Math.min(2000, (cur[1] ?? 1500) + dPitch)));
    setChannel(2, Math.max(1000, Math.min(2000, (cur[2] ?? 1000) + dThr)));
    setChannel(3, Math.max(1000, Math.min(2000, (cur[3] ?? 1500) + dYaw)));
  }, [setChannel]);

  const keyState = useKeyboardControl(kbActive && isConnected && isMsp, handleKbChannels);

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
    <div className="h-12 shrink-0 border-t border-subtle bg-surface-nav flex items-center px-3 gap-2 z-40">

      {/* ── ARM / DISARM ── */}
      <button
        onClick={handleArmDisarm}
        disabled={armLoading || (!flight.armed && isMsp && !mspCanArm)}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest
          transition-all duration-150 shrink-0 select-none
          ${armLoading ? 'opacity-50 cursor-not-allowed' : ''}
          ${flight.armed
            ? 'bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30'
            : 'bg-surface border border-subtle text-content-secondary hover:bg-surface-raised hover:text-content'
          }
        `}
      >
        <div className={`w-2 h-2 rounded-full shrink-0 ${flight.armed ? 'bg-red-400 animate-pulse' : 'bg-content-tertiary'}`} />
        {armLoading
          ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : <span>{flight.armed ? 'DISARM' : 'ARM'}</span>
        }
      </button>

      {/* Arming-blocked chips */}
      {!flight.armed && preArmReasons.length > 0 && (
        <div className="flex items-center gap-1 overflow-hidden">
          {preArmReasons.slice(0, 3).map((r, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-red-500/15 rounded text-red-300 text-[9px] whitespace-nowrap">
              {r}
            </span>
          ))}
          {preArmReasons.length > 3 && (
            <span className="text-[9px] text-content-tertiary">+{preArmReasons.length - 3}</span>
          )}
        </div>
      )}

      <Divider />

      {/* ── MODE SELECTOR ── */}
      <div className="relative shrink-0" ref={modeMenuRef}>
        <button
          onClick={() => setShowModeMenu((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-subtle hover:bg-surface-raised transition-colors text-xs text-content-secondary hover:text-content"
        >
          <span className="font-medium text-content">{modeLabel}</span>
          <ChevronDown size={11} className={`transition-transform ${showModeMenu ? 'rotate-180' : ''}`} />
        </button>

        {showModeMenu && (
          <div className="absolute bottom-full mb-1 left-0 bg-surface-solid border border-subtle rounded-lg shadow-xl z-50 min-w-36 overflow-hidden py-1 max-h-64 overflow-y-auto">
            {isMavlink && availableModes.map((m) => (
              <button
                key={m.modeNum}
                onClick={() => handleMavlinkMode(m.modeNum)}
                className={`w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-raised
                  ${flight.modeNum === m.modeNum ? 'text-blue-400 bg-blue-500/10' : 'text-content-secondary'}`}
              >
                {m.name}
              </button>
            ))}
            {isMsp && modeMappings.filter((m) => m.boxId !== 0).map((m) => (
              <button
                key={m.boxId}
                onClick={() => handleMspMode(m.boxId)}
                className="w-full px-3 py-1.5 text-left text-xs text-content-secondary hover:bg-surface-raised transition-colors"
              >
                {MSP_MODE_LABELS[m.boxId] ?? `Mode ${m.boxId}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* ── KEYBOARD CONTROLS ── */}
      {isMsp && (
        <>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setKbActive((v) => !v)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors border
                ${kbActive
                  ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                  : 'border-subtle text-content-tertiary hover:text-content hover:bg-surface-raised'
                }`}
              title="Toggle keyboard RC control (WASD + QE + Arrows)"
            >
              <Keyboard size={13} />
              <span className="font-medium">KB</span>
            </button>

            {/* Key indicators */}
            <div className="flex flex-col gap-0.5">
              <div className="flex gap-0.5">
                <KeyCap label="W" active={keyState.w} small />
              </div>
              <div className="flex gap-0.5">
                <KeyCap label="A" active={keyState.a} small />
                <KeyCap label="S" active={keyState.s} small />
                <KeyCap label="D" active={keyState.d} small />
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <KeyCap label="Q" active={keyState.q} small />
              <KeyCap label="E" active={keyState.e} small />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-center">
                <KeyCap label="↑" active={keyState.ArrowUp} small />
              </div>
              <div className="flex gap-0.5">
                <KeyCap label="←" active={keyState.ArrowLeft} small />
                <KeyCap label="↓" active={keyState.ArrowDown} small />
                <KeyCap label="→" active={keyState.ArrowRight} small />
              </div>
            </div>
          </div>

          <Divider />

          {/* ── JOYSTICK / GAMEPAD ── */}
          <div className="flex items-center gap-2 shrink-0" ref={axisMenuRef}>
            <button
              onClick={() => setGpActive((v) => !v)}
              disabled={!gamepad.connected}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors border
                ${gpActive && gamepad.connected
                  ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                  : gamepad.connected
                    ? 'border-subtle text-content-tertiary hover:text-content hover:bg-surface-raised'
                    : 'border-subtle text-content-disabled opacity-40 cursor-not-allowed'
                }`}
              title={gamepad.connected ? gamepad.name : 'No gamepad detected — connect a controller'}
            >
              <Gamepad2 size={13} />
              <span className="font-medium max-w-24 truncate">
                {gamepad.connected ? gpName(gamepad.name) : 'No gamepad'}
              </span>
            </button>

            {/* Live axis bars */}
            {gamepad.connected && (
              <div className="flex items-end gap-1">
                {(['roll','pitch','throttle','yaw'] as const).map((axis) => {
                  const idx = axisMap[axis] as number;
                  const raw = gamepad.axes[idx] ?? 0;
                  const pct = Math.round((raw + 1) / 2 * 100);
                  return (
                    <div key={axis} className="flex flex-col items-center gap-0.5 w-7">
                      <div className="w-full h-1.5 rounded-full bg-surface-raised relative overflow-hidden">
                        <div
                          className="absolute h-full rounded-full bg-blue-500/70 transition-all duration-75"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[8px] text-content-tertiary leading-none uppercase">{axis.slice(0,3)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Axis mapping button */}
            {gamepad.connected && (
              <button
                onClick={() => setShowAxisMenu((v) => !v)}
                className="p-1 rounded text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors"
                title="Axis mapping"
              >
                <Settings2 size={12} />
              </button>
            )}

            {/* Axis mapping popup */}
            {showAxisMenu && gamepad.connected && (
              <div className="absolute bottom-full mb-1 bg-surface-solid border border-subtle rounded-lg shadow-xl z-50 p-3 min-w-56" style={{ left: 'auto', right: 0 }}>
                <p className="text-[10px] font-semibold text-content-secondary uppercase tracking-wider mb-2">Axis Mapping</p>
                {(['roll','pitch','throttle','yaw'] as const).map((ch) => (
                  <div key={ch} className="flex items-center justify-between mb-1.5 gap-3">
                    <span className="text-xs text-content-secondary w-16 capitalize">{ch}</span>
                    <div className="flex items-center gap-1">
                      <select
                        value={axisMap[ch]}
                        onChange={(e) => {
                          const updated = { ...axisMap, [ch]: Number(e.target.value) };
                          setAxisMap(updated);
                          saveAxisMap(updated);
                        }}
                        className="bg-surface-raised border border-subtle rounded px-1.5 py-0.5 text-xs text-content"
                      >
                        {gamepad.axes.map((_, i) => (
                          <option key={i} value={i}>Axis {i}</option>
                        ))}
                      </select>
                      {(ch === 'pitch' || ch === 'throttle') && (
                        <label className="flex items-center gap-1 text-[10px] text-content-tertiary cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ch === 'pitch' ? axisMap.invertPitch : axisMap.invertThrottle}
                            onChange={(e) => {
                              const key = ch === 'pitch' ? 'invertPitch' : 'invertThrottle';
                              const updated = { ...axisMap, [key]: e.target.checked };
                              setAxisMap(updated);
                              saveAxisMap(updated);
                            }}
                            className="w-3 h-3"
                          />
                          inv
                        </label>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => { setAxisMap(DEFAULT_AXIS_MAP); saveAxisMap(DEFAULT_AXIS_MAP); }}
                  className="mt-1 text-[10px] text-content-tertiary hover:text-content transition-colors"
                >
                  Reset to defaults
                </button>
              </div>
            )}
          </div>

          <Divider />
        </>
      )}

      {/* ── RC CHANNEL MINI-BARS ── */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        <MiniBar label="THR" value={channels[2] ?? 1000} color="bg-emerald-500/70" />
        <MiniBar label="ROLL" value={channels[0] ?? 1500} />
        <MiniBar label="PTCH" value={channels[1] ?? 1500} />
        <MiniBar label="YAW" value={channels[3] ?? 1500} />
      </div>
    </div>
  );
}

// Shorten gamepad name (e.g. "Xbox 360 Controller (XInput STANDARD GAMEPAD)" → "Xbox 360")
function gpName(name: string): string {
  return name.split('(')[0]?.trim().slice(0, 20) || 'Gamepad';
}
