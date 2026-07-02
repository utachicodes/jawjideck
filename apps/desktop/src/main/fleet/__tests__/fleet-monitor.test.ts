import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { startMonitor } from '../fleet-monitor.js';
import type { FleetVehicleEntry } from '../../../shared/ipc-channels.js';

// Minimal fake Transport: an EventEmitter with the subset of the Transport
// interface fleet-monitor.ts actually uses (open/close/write/on/off + isOpen).
class FakeTransport extends EventEmitter {
  isOpen = false;
  async open() { this.isOpen = true; this.emit('open'); }
  async close() { this.isOpen = false; this.emit('close'); }
  async write(_data: Uint8Array) { /* no-op for tests */ }
}

function buildMavlinkV2Packet(msgid: number, payload: Uint8Array, sysid = 1, compid = 1): Uint8Array {
  const header = new Uint8Array([0xfd, payload.length, 0, 0, 0, sysid, compid, msgid & 0xff, (msgid >> 8) & 0xff, (msgid >> 16) & 0xff]);
  const crc = new Uint8Array([0, 0]); // fleet-monitor.ts does not validate CRC (see Step 3 note)
  return new Uint8Array([...header, ...payload, ...crc]);
}

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
});
