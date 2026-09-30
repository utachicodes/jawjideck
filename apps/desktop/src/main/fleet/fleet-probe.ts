/**
 * Fleet Probe — briefly opens a roster entry's connection before it is saved
 * and reports what answered: firmware, vehicle type and system ID. MAVLink
 * vehicles are identified from their HEARTBEAT, MSP boards from FC_VARIANT.
 */

import type { Transport } from '@jawji/comms';
import { HEARTBEAT_ID, deserializeHeartbeat } from '@jawji/mavlink-ts';
import { MSPParser, MSP, buildMspV1Request } from '@jawji/msp-ts';
import type { FleetVehicleEntry, FleetTestResult } from '../../shared/ipc-channels.js';
import { firmwareFromAutopilot, firmwareFromMspVariant, vehicleTypeFromMavType } from '../../shared/fleet-vehicle.js';
import { createRealTransport, createMavlinkParser, gcsHeartbeatFrame, isTrackedVehicleHeartbeat } from './fleet-monitor.js';

export const PROBE_TIMEOUT_MS = 5000;

/** Turn socket/serial errors into something a user can act on. */
export function describeProbeError(entry: Omit<FleetVehicleEntry, 'id'>, message: string): string {
  if (/EADDRINUSE/.test(message)) {
    return `UDP port ${entry.port} is already in use (another roster vehicle or app is listening on it)`;
  }
  if (/busy|lock|EBUSY|Access denied/i.test(message) && entry.transportType === 'serial') {
    return `${entry.serialPath} is in use (connected in Jawji or another app)`;
  }
  if (/ECONNREFUSED/.test(message)) return `Nothing is listening at ${entry.host}:${entry.port}`;
  if (/ENOTFOUND|EAI_AGAIN/.test(message)) return `Can't resolve host ${entry.host}`;
  return message;
}

export async function probeConnection(
  entry: Omit<FleetVehicleEntry, 'id'>,
  options: { timeoutMs?: number; createTransport?: (entry: Omit<FleetVehicleEntry, 'id'>) => Transport } = {},
): Promise<FleetTestResult> {
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  let transport: Transport;
  try {
    transport = (options.createTransport ?? createRealTransport)(entry);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const result = await new Promise<FleetTestResult>((resolve) => {
    let done = false;
    const finish = (r: FleetTestResult) => {
      if (done) return;
      done = true;
      resolve(r);
    };

    timer = setTimeout(() => finish({
      success: false,
      error: entry.protocol === 'mavlink'
        ? `No MAVLink heartbeat within ${timeoutMs / 1000} s`
        : `No MSP reply within ${timeoutMs / 1000} s`,
    }), timeoutMs);

    transport.on('error', (err: Error) => finish({ success: false, error: describeProbeError(entry, err.message) }));

    if (entry.protocol === 'mavlink') {
      const parser = createMavlinkParser();
      transport.on('data', (data: Uint8Array) => {
        parser.feed(data);
        let packet;
        while ((packet = parser.parseNext()) !== null) {
          if (packet.msgid !== HEARTBEAT_ID) continue;
          const hb = deserializeHeartbeat(packet.payload);
          if (!isTrackedVehicleHeartbeat(entry, packet.sysid, hb.autopilot)) continue;
          finish({
            success: true,
            firmware: firmwareFromAutopilot(hb.autopilot),
            vehicleType: vehicleTypeFromMavType(hb.type),
            systemId: packet.sysid,
          });
        }
      });
    } else {
      const parser = new MSPParser();
      transport.on('data', (data: Uint8Array) => {
        for (const packet of parser.parseSync(data)) {
          if (packet.command !== MSP.FC_VARIANT) continue;
          const variant = new TextDecoder().decode(packet.payload.slice(0, 4));
          const firmware = firmwareFromMspVariant(variant);
          finish(firmware
            ? { success: true, firmware }
            : { success: false, error: `Unsupported MSP firmware "${variant}"` });
        }
      });
    }

    transport.open()
      .then(() => {
        const send = () => {
          const frame = entry.protocol === 'mavlink' ? gcsHeartbeatFrame() : buildMspV1Request(MSP.FC_VARIANT);
          transport.write(frame).catch(() => { /* reported via 'error' */ });
        };
        send();
        heartbeat = setInterval(send, 1000);
      })
      .catch((err: Error) => finish({ success: false, error: describeProbeError(entry, err.message) }));
  });

  if (timer) clearTimeout(timer);
  if (heartbeat) clearInterval(heartbeat);
  await transport.close().catch(() => { /* already closed */ });
  return result;
}
