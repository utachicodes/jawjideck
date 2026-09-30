/**
 * Voice alerts — spoken announcements for arm/disarm, mode changes,
 * connection state, GPS lock and low battery, the way QGroundControl's
 * audio notifications work. Detection logic here is pure (previous/current
 * state in, an event or null out) so it's unit-testable without a browser;
 * `speak()` is the one bit that touches the real Web Speech API.
 */

export interface VoiceEvent {
  text: string;
  /** High-priority events interrupt whatever is currently speaking. */
  priority: 'normal' | 'high';
}

/** GPS fix >= this is a usable 3D+ lock (matches the rest of the app's convention). */
const GPS_3D_FIX = 3;
/** Announce once when remaining charge drops to/below this percentage. */
const LOW_BATTERY_PERCENT = 20;

function changed<T>(prev: T | undefined, current: T): boolean {
  return prev !== undefined && prev !== current;
}

export function armDisarmEvent(prevArmed: boolean | undefined, armed: boolean): VoiceEvent | null {
  if (!changed(prevArmed, armed)) return null;
  return { text: armed ? 'Armed' : 'Disarmed', priority: 'high' };
}

/** `mode` is the already-decoded human label (works for ArduPilot, PX4 and MSP alike). */
export function modeChangeEvent(prevMode: string | undefined, mode: string): VoiceEvent | null {
  if (!mode || mode === 'Unknown' || !changed(prevMode, mode)) return null;
  return { text: `Mode ${mode}`, priority: 'normal' };
}

export function connectionEvent(prevConnected: boolean | undefined, connected: boolean): VoiceEvent | null {
  if (!changed(prevConnected, connected)) return null;
  return { text: connected ? 'Vehicle connected' : 'Vehicle disconnected', priority: connected ? 'normal' : 'high' };
}

/** Telemetry going stale (link/heartbeat lost) vs. recovering. */
export function linkStaleEvent(prevStale: boolean | undefined, stale: boolean): VoiceEvent | null {
  if (!changed(prevStale, stale)) return null;
  return { text: stale ? 'Data link lost' : 'Link regained', priority: 'high' };
}

export function gpsFixEvent(prevFixType: number | undefined, fixType: number): VoiceEvent | null {
  if (prevFixType === undefined) return null;
  const hadFix = prevFixType >= GPS_3D_FIX;
  const hasFix = fixType >= GPS_3D_FIX;
  if (hadFix === hasFix) return null;
  return { text: hasFix ? 'GPS lock acquired' : 'GPS lock lost', priority: hasFix ? 'normal' : 'high' };
}

/** Fires once on the downward crossing; `remaining` < 0 means "unknown", never announced. */
export function lowBatteryEvent(prevRemaining: number | undefined, remaining: number): VoiceEvent | null {
  if (remaining < 0) return null;
  const wasLow = prevRemaining !== undefined && prevRemaining >= 0 && prevRemaining <= LOW_BATTERY_PERCENT;
  const isLow = remaining <= LOW_BATTERY_PERCENT;
  if (isLow && !wasLow) return { text: 'Battery low', priority: 'high' };
  return null;
}

/**
 * Speak one line via the OS's text-to-speech (Web Speech API — no extra
 * dependency, works offline). No-ops quietly wherever it isn't available.
 * High-priority events cut off whatever is currently queued/speaking.
 */
export function speak(text: string, priority: VoiceEvent['priority'] = 'normal'): void {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return;
  if (priority === 'high') synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  synth.speak(utterance);
}
