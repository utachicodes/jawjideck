import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import {
  speak,
  armDisarmEvent,
  modeChangeEvent,
  connectionEvent,
  linkStaleEvent,
  gpsFixEvent,
  lowBatteryEvent,
  type VoiceEvent,
} from '../../lib/voice-alerts';

interface PrevState {
  armed?: boolean;
  mode?: string;
  connected?: boolean;
  stale?: boolean;
  fixType?: number;
  batteryRemaining?: number;
}

/**
 * Mount once at app root. Speaks arm/disarm, mode changes, connect/disconnect,
 * link loss/recovery, GPS lock and low battery — the same events
 * QGroundControl's audio notifications cover. Detection is pure (see
 * lib/voice-alerts.ts); this component only wires it to the live stores.
 */
export function VoiceAlertsWatcher() {
  const enabled = useSettingsStore((s) => s.voiceAlertsEnabled);
  const categories = useSettingsStore((s) => s.voiceAlertCategories);
  const connectionState = useConnectionStore((s) => s.connectionState);
  const flight = useTelemetryStore((s) => s.flight);
  const gps = useTelemetryStore((s) => s.gps);
  const battery = useTelemetryStore((s) => s.battery);

  // Cleared whenever alerts are (re-)enabled, so the first tick after
  // enabling only seeds a baseline and never announces a stale diff.
  const prev = useRef<PrevState>({});

  useEffect(() => {
    if (!enabled) {
      prev.current = {};
      return;
    }

    const p = prev.current;
    const isConnected = connectionState.isConnected;
    const events: Array<VoiceEvent | null> = [
      categories.connection ? connectionEvent(p.connected, isConnected) : null,
      categories.connection && isConnected ? linkStaleEvent(p.stale, !!connectionState.isStale) : null,
      categories.armDisarm && isConnected ? armDisarmEvent(p.armed, flight.armed) : null,
      categories.modeChange && isConnected ? modeChangeEvent(p.mode, flight.mode) : null,
      categories.gpsFix && isConnected ? gpsFixEvent(p.fixType, gps.fixType) : null,
      categories.lowBattery && isConnected ? lowBatteryEvent(p.batteryRemaining, battery.remaining) : null,
    ];
    for (const event of events) {
      if (event) speak(event.text, event.priority);
    }

    prev.current = {
      armed: flight.armed,
      mode: flight.mode,
      connected: isConnected,
      stale: !!connectionState.isStale,
      fixType: gps.fixType,
      batteryRemaining: battery.remaining,
    };
  }, [
    enabled,
    categories,
    connectionState.isConnected,
    connectionState.isStale,
    flight.armed,
    flight.mode,
    gps.fixType,
    battery.remaining,
  ]);

  return null;
}
