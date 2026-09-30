import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { serializeV2, HEARTBEAT_CRC_EXTRA, GLOBAL_POSITION_INT_CRC_EXTRA } from '@jawji/mavlink-ts';
import { startMonitor } from '../fleet-monitor.js';
import type { FleetVehicleEntry, FleetVehicleStatus } from '../../../shared/ipc-channels.js';

// Minimal fake Transport: an EventEmitter with the subset of the Transport
// interface fleet-monitor.ts actually uses (open/close/write/on/off + isOpen).
class FakeTransport extends EventEmitter {
  isOpen = false;
  async open() { this.isOpen = true; this.emit('open'); }
  async close() { this.isOpen = false; this.emit('close'); }
  written: Uint8Array[] = [];
  async write(data: Uint8Array) { this.written.push(data); }
}

const CRC_EXTRA: Record<number, number> = { 0: HEARTBEAT_CRC_EXTRA, 33: GLOBAL_POSITION_INT_CRC_EXTRA };

function buildMavlinkV2Packet(msgid: number, payload: Uint8Array, sysid = 1, compid = 1): Uint8Array {
  return serializeV2(msgid, payload, CRC_EXTRA[msgid]!, { sysid, compid });
}

function heartbeatPayload(opts: { autopilot?: number; armed?: boolean; customMode?: number } = {}): Uint8Array {
  const p = new Uint8Array(9);
  new DataView(p.buffer).setUint32(0, opts.customMode ?? 4, true);
  p[4] = 2; // MAV_TYPE_QUADROTOR
  p[5] = opts.autopilot ?? 3; // ArduPilot
  p[6] = opts.armed ? 0x80 : 0;
  p[7] = 4; p[8] = 3;
  return p;
}

async function monitorWith(entry: FleetVehicleEntry) {
  const transport = new FakeTransport();
  const statuses: FleetVehicleStatus[] = [];
  const handle = startMonitor(entry, (s) => statuses.push(s), { createTransport: () => transport as never });
  await new Promise((r) => setTimeout(r, 0));
  return { transport, statuses, handle };
}

const udpEntry: FleetVehicleEntry = { id: 'v1', name: 'Test', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 };

describe('startMonitor (MAVLink)', () => {
  it('reports armed status and position from HEARTBEAT + GLOBAL_POSITION_INT', async () => {
    const entry: FleetVehicleEntry = { id: 'v1', name: 'Test', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 };
    const fakeTransport = new FakeTransport();
    const statuses: unknown[] = [];

    const handle = startMonitor(entry, (status) => statuses.push(status), {
      createTransport: () => fakeTransport as never,
    });
    await new Promise((r) => setTimeout(r, 0)); // let open() resolve

    // HEARTBEAT: type=2(quad), autopilot=3(ardupilotmega), base_mode=0x80 (armed), custom_mode=4, system_status=4
    const hbPayload = new Uint8Array(9);
    new DataView(hbPayload.buffer).setUint32(0, 4, true); // custom_mode
    hbPayload[4] = 2; hbPayload[5] = 3; hbPayload[6] = 0x80; hbPayload[7] = 4; hbPayload[8] = 3;
    fakeTransport.emit('data', buildMavlinkV2Packet(0, hbPayload));

    // GLOBAL_POSITION_INT: lat=370000000 (37.0 deg), lon=-1220000000 (-122.0 deg)
    const posPayload = new Uint8Array(28);
    const posView = new DataView(posPayload.buffer);
    posView.setUint32(0, 1000, true);
    posView.setInt32(4, 370000000, true);
    posView.setInt32(8, -1220000000, true);
    fakeTransport.emit('data', buildMavlinkV2Packet(33, posPayload));

    await new Promise((r) => setTimeout(r, 0));

    expect(statuses.length).toBeGreaterThan(0);
    const last = statuses[statuses.length - 1] as { armed: boolean; modeNumber: number; lat: number; lon: number };
    expect(last.armed).toBe(true);
    expect(last.modeNumber).toBe(4);
    expect(last.lat).toBeCloseTo(37.0, 5);
    expect(last.lon).toBeCloseTo(-122.0, 5);

    handle.stop();
  });

  it('stop() closes the transport', async () => {
    const entry: FleetVehicleEntry = { id: 'v1', name: 'Test', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 };
    const fakeTransport = new FakeTransport();
    const closeSpy = vi.spyOn(fakeTransport, 'close');
    const handle = startMonitor(entry, () => {}, { createTransport: () => fakeTransport as never });
    await new Promise((r) => setTimeout(r, 0));
    handle.stop();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('sends a GCS heartbeat once the link is open', async () => {
    const { transport, handle } = await monitorWith(udpEntry);
    expect(transport.written.length).toBeGreaterThan(0);
    expect(transport.written[0]![0]).toBe(0xfd); // MAVLink 2 frame
    expect(transport.written[0]![7]).toBe(0);    // msgid HEARTBEAT
    handle.stop();
  });

  it('ignores heartbeats from GCSs and companions (MAV_AUTOPILOT_INVALID)', async () => {
    const { transport, statuses, handle } = await monitorWith(udpEntry);
    transport.emit('data', buildMavlinkV2Packet(0, heartbeatPayload({ autopilot: 8, armed: true }), 255, 190));
    expect(statuses.some((s) => s.armed)).toBe(false);
    handle.stop();
  });

  it('tracks only the configured system ID', async () => {
    const { transport, statuses, handle } = await monitorWith({ ...udpEntry, systemId: 2 });
    transport.emit('data', buildMavlinkV2Packet(0, heartbeatPayload({ armed: true }), 1));
    expect(statuses.some((s) => s.armed)).toBe(false);
    transport.emit('data', buildMavlinkV2Packet(0, heartbeatPayload({ armed: true }), 2));
    expect(statuses[statuses.length - 1]!.armed).toBe(true);
    handle.stop();
  });

  it('rejects packets with a bad CRC', async () => {
    const { transport, statuses, handle } = await monitorWith(udpEntry);
    const frame = buildMavlinkV2Packet(0, heartbeatPayload({ armed: true }));
    frame[frame.length - 1] = frame[frame.length - 1]! ^ 0xff;
    transport.emit('data', frame);
    expect(statuses.some((s) => s.connected)).toBe(false);
    handle.stop();
  });
});
