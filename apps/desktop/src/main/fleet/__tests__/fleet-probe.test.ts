import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { serializeV2, HEARTBEAT_CRC_EXTRA } from '@jawji/mavlink-ts';
import { probeConnection } from '../fleet-probe.js';
import type { FleetVehicleEntry } from '../../../shared/ipc-channels.js';

class FakeTransport extends EventEmitter {
  isOpen = false;
  written: Uint8Array[] = [];
  closed = false;
  constructor(private reply?: (t: FakeTransport) => void, private failOpen?: string) { super(); }
  async open() {
    if (this.failOpen) throw new Error(this.failOpen);
    this.isOpen = true;
  }
  async close() { this.isOpen = false; this.closed = true; }
  async write(data: Uint8Array) {
    this.written.push(data);
    this.reply?.(this);
  }
}

function heartbeat(sysid: number, type: number, autopilot: number): Uint8Array {
  const p = new Uint8Array(9);
  p[4] = type; p[5] = autopilot; p[7] = 4; p[8] = 3;
  return serializeV2(0, p, HEARTBEAT_CRC_EXTRA, { sysid, compid: 1 });
}

const mavlinkEntry: Omit<FleetVehicleEntry, 'id'> = { name: 'Quad', protocol: 'mavlink', transportType: 'udp', udpMode: 'client', host: '127.0.0.1', port: 14550 };

describe('probeConnection', () => {
  it('identifies a PX4 multicopter from its heartbeat and closes the link', async () => {
    const t = new FakeTransport((self) => self.emit('data', heartbeat(1, 2, 12)));
    const result = await probeConnection(mavlinkEntry, { createTransport: () => t as never, timeoutMs: 500 });
    expect(result).toEqual({ success: true, firmware: 'px4', vehicleType: 'copter', systemId: 1 });
    expect(t.closed).toBe(true);
  });

  it('skips GCS heartbeats and systems other than the configured one', async () => {
    const t = new FakeTransport((self) => {
      self.emit('data', heartbeat(255, 6, 8)); // another GCS
      self.emit('data', heartbeat(1, 1, 3));   // plane, wrong system
      self.emit('data', heartbeat(2, 20, 3));  // VTOL, the one we want
    });
    const result = await probeConnection({ ...mavlinkEntry, systemId: 2 }, { createTransport: () => t as never, timeoutMs: 500 });
    expect(result).toEqual({ success: true, firmware: 'ardupilot', vehicleType: 'vtol', systemId: 2 });
  });

  it('times out when nothing answers', async () => {
    const t = new FakeTransport();
    const result = await probeConnection(mavlinkEntry, { createTransport: () => t as never, timeoutMs: 50 });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No MAVLink heartbeat/);
    expect(t.closed).toBe(true);
  });

  it('reports a port that fails to open', async () => {
    const t = new FakeTransport(undefined, 'Resource busy');
    const result = await probeConnection({ name: 'R', protocol: 'mavlink', transportType: 'serial', serialPath: '/dev/x', baudRate: 57600 }, { createTransport: () => t as never, timeoutMs: 500 });
    expect(result).toEqual({ success: false, error: '/dev/x is in use (connected in Jawji or another app)' });
  });

  it('explains a UDP port that is already bound', async () => {
    const t = new FakeTransport(undefined, 'bind EADDRINUSE 0.0.0.0:14550');
    const result = await probeConnection({ ...mavlinkEntry, udpMode: 'listen' }, { createTransport: () => t as never, timeoutMs: 500 });
    expect(result.error).toMatch(/UDP port 14550 is already in use/);
  });
});
