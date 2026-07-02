/**
 * Fleet Monitor — lightweight, read-only status connection for one roster
 * vehicle that is NOT the currently-focused vehicle. Deliberately minimal:
 * it parses just enough (armed/mode/battery/position) for a fleet overview
 * tile, and does not touch parameters, missions, or commands. This is a
 * self-contained parser instance per vehicle — it does not share the main
 * connection's transport, mutex, or telemetry pipeline in ipc-handlers.ts.
 *
 * Note on MAVLink CRC: this parser does not register message CRC-extra
 * values, matching how the main connection's own MAVLinkParser is used
 * elsewhere in this codebase (see ipc-handlers.ts) — packets are accepted
 * based on msgid alone. This is a deliberate simplification appropriate for
 * a monitoring-only feed, not the full command/control connection.
 */

import { TcpTransport, UdpTransport, SerialTransport } from '@jawji/comms';
import type { Transport } from '@jawji/comms';
import {
  MAVLinkParser,
  HEARTBEAT_ID,
  deserializeHeartbeat,
  GLOBAL_POSITION_INT_ID,
  deserializeGlobalPositionInt,
  SYS_STATUS_ID,
  deserializeSysStatus,
} from '@jawji/mavlink-ts';
import {
  MSPParser,
  MSP,
  buildMspV1Request,
  deserializeStatus,
  deserializeRawGps,
  deserializeAnalog,
  isArmed as isMspArmed,
} from '@jawji/msp-ts';
import type { FleetVehicleEntry, FleetVehicleStatus } from '../../shared/ipc-channels.js';

export interface FleetMonitorHandle {
  stop(): void;
}

interface StartMonitorOptions {
  /** Test seam: inject a fake transport instead of constructing a real one. */
  createTransport?: (entry: FleetVehicleEntry) => Transport;
}

const MAV_MODE_FLAG_SAFETY_ARMED = 0x80;

function createRealTransport(entry: FleetVehicleEntry): Transport {
  if (entry.transportType === 'tcp') {
    return new TcpTransport({ host: entry.host!, port: entry.port! });
  }
  if (entry.transportType === 'udp') {
    return new UdpTransport({ remoteHost: entry.host, remotePort: entry.port, localPort: 0 });
  }
  return new SerialTransport(entry.serialPath!, { baudRate: entry.baudRate ?? 115200 });
}

function emptyStatus(vehicleId: string): FleetVehicleStatus {
  return {
    vehicleId,
    connected: false,
    armed: false,
    modeNumber: null,
    batteryPercent: null,
    batteryVoltage: null,
    lat: null,
    lon: null,
    lastSeenAt: null,
    error: null,
  };
}

export function startMonitor(
  entry: FleetVehicleEntry,
  onStatus: (status: FleetVehicleStatus) => void,
  options: StartMonitorOptions = {},
): FleetMonitorHandle {
  const transport = (options.createTransport ?? createRealTransport)(entry);
  let status = emptyStatus(entry.id);
  let stopped = false;
  let mspPollInterval: ReturnType<typeof setInterval> | null = null;

  const emit = (patch: Partial<FleetVehicleStatus>) => {
    if (stopped) return;
    status = { ...status, ...patch, lastSeenAt: Date.now() };
    onStatus(status);
  };

  if (entry.protocol === 'mavlink') {
    const parser = new MAVLinkParser();
    transport.on('data', (data: Uint8Array) => {
      parser.feed(data);
      let packet;
      while ((packet = parser.parseNext()) !== null) {
        if (packet.msgid === HEARTBEAT_ID) {
          const hb = deserializeHeartbeat(packet.payload);
          emit({ connected: true, armed: (hb.baseMode & MAV_MODE_FLAG_SAFETY_ARMED) !== 0, modeNumber: hb.customMode, error: null });
        } else if (packet.msgid === GLOBAL_POSITION_INT_ID) {
          const pos = deserializeGlobalPositionInt(packet.payload);
          emit({ connected: true, lat: pos.lat / 1e7, lon: pos.lon / 1e7 });
        } else if (packet.msgid === SYS_STATUS_ID) {
          const sys = deserializeSysStatus(packet.payload);
          emit({ connected: true, batteryVoltage: sys.voltageBattery / 1000, batteryPercent: sys.batteryRemaining >= 0 ? sys.batteryRemaining : null });
        }
      }
    });
  } else {
    startMspPolling();
  }

  transport.on('error', (err: Error) => {
    emit({ connected: false, error: err.message });
  });
  transport.on('close', () => {
    emit({ connected: false });
  });

  transport.open().catch((err: Error) => {
    emit({ connected: false, error: err.message });
  });

  function startMspPolling(): void {
    const parser = new MSPParser();
    let pending: { command: number; resolve: (payload: Uint8Array) => void; timeout: ReturnType<typeof setTimeout> } | null = null;

    transport.on('data', (data: Uint8Array) => {
      const packets = parser.parseSync(data);
      for (const packet of packets) {
        if (pending && packet.command === pending.command) {
          clearTimeout(pending.timeout);
          pending.resolve(packet.payload);
          pending = null;
        }
      }
    });

    const request = (command: number, timeoutMs = 500): Promise<Uint8Array> => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pending = null; reject(new Error('MSP request timed out')); }, timeoutMs);
        pending = { command, resolve, timeout };
        transport.write(buildMspV1Request(command)).catch((err: Error) => {
          clearTimeout(timeout);
          pending = null;
          reject(err);
        });
      });
    };

    const pollOnce = async () => {
      if (!transport.isOpen) return;
      try {
        const statusPayload = await request(MSP.STATUS_EX);
        const mspStatus = deserializeStatus(statusPayload);
        emit({ connected: true, armed: isMspArmed(mspStatus.flightModeFlags), modeNumber: null, error: null });
      } catch { /* one poll failing doesn't flip the tile to disconnected — transport 'close'/'error' events handle that */ }

      try {
        const gpsPayload = await request(MSP.RAW_GPS);
        const gps = deserializeRawGps(gpsPayload);
        emit({ connected: true, lat: gps.lat / 1e7, lon: gps.lon / 1e7 });
      } catch { /* ignore */ }

      try {
        const analogPayload = await request(MSP.ANALOG);
        const analog = deserializeAnalog(analogPayload);
        emit({ connected: true, batteryVoltage: analog.voltage, batteryPercent: null });
      } catch { /* ignore */ }
    };

    transport.on('open', () => {
      mspPollInterval = setInterval(pollOnce, 2000);
      pollOnce();
    });
  }

  return {
    stop() {
      stopped = true;
      if (mspPollInterval) clearInterval(mspPollInterval);
      transport.close().catch(() => { /* already closing/closed */ });
    },
  };
}
