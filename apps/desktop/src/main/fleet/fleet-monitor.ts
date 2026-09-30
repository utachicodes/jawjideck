/**
 * Fleet Monitor — lightweight, read-only status connection for one roster
 * vehicle that is NOT the currently-focused vehicle. Deliberately minimal:
 * it parses just enough (armed/mode/battery/position) for a fleet overview
 * tile, and does not touch parameters, missions, or commands. This is a
 * self-contained parser instance per vehicle — it does not share the main
 * connection's transport, mutex, or telemetry pipeline in ipc-handlers.ts.
 *
 * The MAVLink parser registers every message's CRC-extra so line noise on a
 * serial link can't pass as a packet. A 1 Hz GCS heartbeat is sent so
 * endpoints that only stream once a GCS talks to them (UDP-in, TCP) start.
 */

import { TcpTransport, UdpTransport, SerialTransport } from '@jawji/comms';
import type { Transport } from '@jawji/comms';
import {
  MAVLinkParser,
  getAllMessageInfos,
  serializeV2,
  HEARTBEAT_ID,
  HEARTBEAT_CRC_EXTRA,
  serializeHeartbeat,
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
import { MAV_AUTOPILOT_INVALID } from '../../shared/fleet-vehicle.js';

export interface FleetMonitorHandle {
  stop(): void;
}

interface StartMonitorOptions {
  /** Test seam: inject a fake transport instead of constructing a real one. */
  createTransport?: (entry: FleetVehicleEntry) => Transport;
}

const MAV_MODE_FLAG_SAFETY_ARMED = 0x80;

export function createRealTransport(entry: Omit<FleetVehicleEntry, 'id'>): Transport {
  if (entry.transportType === 'tcp') {
    return new TcpTransport({ host: entry.host!, port: entry.port! });
  }
  if (entry.transportType === 'udp') {
    return entry.udpMode === 'listen'
      ? new UdpTransport({ localPort: entry.port })
      : new UdpTransport({ remoteHost: entry.host, remotePort: entry.port, localPort: 0 });
  }
  return new SerialTransport(entry.serialPath!, { baudRate: entry.baudRate ?? 57600 });
}

/** A MAVLink parser that validates CRCs for every known message. */
export function createMavlinkParser(): MAVLinkParser {
  const parser = new MAVLinkParser();
  parser.registerMessages(getAllMessageInfos());
  return parser;
}

/** A GCS HEARTBEAT frame (MAV_TYPE_GCS, MAV_AUTOPILOT_INVALID). */
export function gcsHeartbeatFrame(): Uint8Array {
  const payload = serializeHeartbeat({
    type: 6,
    autopilot: MAV_AUTOPILOT_INVALID,
    baseMode: 0,
    customMode: 0,
    systemStatus: 4,
    mavlinkVersion: 3,
  });
  return serializeV2(HEARTBEAT_ID, payload, HEARTBEAT_CRC_EXTRA);
}

/**
 * Whether a HEARTBEAT comes from the vehicle we track: not a GCS/companion
 * (MAV_AUTOPILOT_INVALID), and matching the roster's system ID if one is set.
 */
export function isTrackedVehicleHeartbeat(entry: Pick<FleetVehicleEntry, 'systemId'>, sysid: number, autopilot: number): boolean {
  if (autopilot === MAV_AUTOPILOT_INVALID) return false;
  return entry.systemId === undefined || entry.systemId === sysid;
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
  let gcsHeartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const emit = (patch: Partial<FleetVehicleStatus>) => {
    if (stopped) return;
    status = { ...status, ...patch, lastSeenAt: Date.now() };
    onStatus(status);
  };

  if (entry.protocol === 'mavlink') {
    const parser = createMavlinkParser();
    // Once a heartbeat identifies the vehicle, ignore other systems on the link
    let vehicleSysid: number | null = entry.systemId ?? null;
    transport.on('data', (data: Uint8Array) => {
      parser.feed(data);
      let packet;
      while ((packet = parser.parseNext()) !== null) {
        if (packet.msgid === HEARTBEAT_ID) {
          const hb = deserializeHeartbeat(packet.payload);
          if (!isTrackedVehicleHeartbeat(entry, packet.sysid, hb.autopilot)) continue;
          vehicleSysid = packet.sysid;
          emit({ connected: true, armed: (hb.baseMode & MAV_MODE_FLAG_SAFETY_ARMED) !== 0, modeNumber: hb.customMode, error: null });
        } else if (vehicleSysid !== null && packet.sysid !== vehicleSysid) {
          continue;
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

  transport.open()
    .then(() => {
      if (entry.protocol !== 'mavlink' || stopped) return;
      const beat = () => { transport.write(gcsHeartbeatFrame()).catch(() => { /* link down; close/error events report it */ }); };
      beat();
      gcsHeartbeatInterval = setInterval(beat, 1000);
    })
    .catch((err: Error) => {
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
      if (gcsHeartbeatInterval) clearInterval(gcsHeartbeatInterval);
      transport.close().catch(() => { /* already closing/closed */ });
    },
  };
}
