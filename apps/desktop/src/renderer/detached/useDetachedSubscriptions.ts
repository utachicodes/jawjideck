/**
 * IPC subscription setup for detached (pop-out) windows.
 *
 * Each detached BrowserWindow runs its own React + Zustand context, so it
 * needs to populate its stores from the same IPC broadcasts the main window
 * uses. The set of subscriptions here is the minimum required by every
 * detachable component (telemetry, status, connection). Anything more
 * specialized (params, mission, fence, …) is the component's responsibility
 * if it ever becomes pop-out-relevant.
 */

import { useEffect } from 'react';
import { useConnectionStore } from '../stores/connection-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useMessagesStore } from '../stores/messages-store';
import { startInspector } from '../stores/inspector-store';

export function useDetachedSubscriptions(): void {
  const setConnectionState = useConnectionStore((s) => s.setConnectionState);
  const updateAttitude = useTelemetryStore((s) => s.updateAttitude);
  const updatePosition = useTelemetryStore((s) => s.updatePosition);
  const updateGps = useTelemetryStore((s) => s.updateGps);
  const updateBattery = useTelemetryStore((s) => s.updateBattery);
  const updateVfrHud = useTelemetryStore((s) => s.updateVfrHud);
  const updateFlight = useTelemetryStore((s) => s.updateFlight);
  const updateBatch = useTelemetryStore((s) => s.updateBatch);
  const addStatusMessage = useMessagesStore((s) => s.addMessage);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // Start the inspector pipeline (idempotent — safe to call from every window).
    startInspector();

    const cleanups: Array<() => void> = [];

    cleanups.push(
      api.onConnectionState((state) => {
        setConnectionState(state);
      }),
    );
    cleanups.push(
      api.onTelemetryBatch((batch) => {
        updateBatch(batch);
      }),
    );
    cleanups.push(
      api.onTelemetryUpdate((update) => {
        switch (update.type) {
          case 'attitude': updateAttitude(update.data); break;
          case 'position': updatePosition(update.data); break;
          case 'gps': updateGps(update.data); break;
          case 'battery': updateBattery(update.data); break;
          case 'vfrHud': updateVfrHud(update.data); break;
          case 'flight': updateFlight(update.data); break;
        }
      }),
    );
    cleanups.push(
      api.onStatusText((msg) => {
        addStatusMessage(msg.severity, msg.severityLabel as never, msg.text);
      }),
    );

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [
    setConnectionState,
    updateAttitude,
    updatePosition,
    updateGps,
    updateBattery,
    updateVfrHud,
    updateFlight,
    updateBatch,
    addStatusMessage,
  ]);
}
