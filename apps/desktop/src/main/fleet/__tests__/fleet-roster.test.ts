import { describe, expect, it, beforeEach, vi } from 'vitest';

// electron-store requires a live Electron app context (it reads app.getPath()
// internally) and can't construct outside one. Fleet-roster.ts only needs
// get/set with a defaults fallback, so a tiny in-memory fake is enough to
// unit-test the roster logic without an Electron runtime.
vi.mock('electron-store', () => {
  class FakeStore<T extends Record<string, unknown>> {
    private data: Partial<T>;
    constructor(options: { defaults?: T }) {
      this.data = (options.defaults ?? {}) as Partial<T>;
    }
    get<K extends keyof T>(key: K, fallback?: T[K]): T[K] {
      return (this.data[key] ?? fallback) as T[K];
    }
    set<K extends keyof T>(key: K, value: T[K]): void {
      this.data[key] = value;
    }
  }
  return { default: FakeStore };
});

const { validateNewEntry, getRoster, addVehicle, updateVehicle, removeVehicle, _resetRosterForTests } = await import('../fleet-roster.js');

describe('fleet-roster', () => {
  beforeEach(() => {
    _resetRosterForTests();
  });

  it('starts with an empty roster', () => {
    expect(getRoster()).toEqual([]);
  });

  it('adds a vehicle and assigns a stable id', () => {
    const entry = addVehicle({ name: 'Drone 1', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 });
    expect(entry.id).toBeTruthy();
    expect(getRoster()).toEqual([entry]);
  });

  it('rejects a duplicate host+port for the same transport', () => {
    addVehicle({ name: 'Drone 1', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 });
    const error = validateNewEntry(getRoster(), { name: 'Drone 2', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 });
    expect(error).toMatch(/already/i);
  });

  it('rejects a duplicate serial path', () => {
    addVehicle({ name: 'Drone 1', protocol: 'msp', transportType: 'serial', serialPath: 'COM3', baudRate: 115200 });
    const error = validateNewEntry(getRoster(), { name: 'Drone 2', protocol: 'msp', transportType: 'serial', serialPath: 'COM3', baudRate: 115200 });
    expect(error).toMatch(/already/i);
  });

  it('allows a non-duplicate entry', () => {
    addVehicle({ name: 'Drone 1', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 });
    const error = validateNewEntry(getRoster(), { name: 'Drone 2', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14551 });
    expect(error).toBeNull();
  });

  it('updates a vehicle by id', () => {
    const entry = addVehicle({ name: 'Drone 1', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 });
    const updated = updateVehicle(entry.id, { name: 'Renamed' });
    expect(updated?.name).toBe('Renamed');
    expect(getRoster()[0]?.name).toBe('Renamed');
  });

  it('returns null when updating an unknown id', () => {
    expect(updateVehicle('nonexistent', { name: 'x' })).toBeNull();
  });

  it('removes a vehicle by id', () => {
    const entry = addVehicle({ name: 'Drone 1', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 });
    removeVehicle(entry.id);
    expect(getRoster()).toEqual([]);
  });

  describe('validation', () => {
    const listen = { name: 'A', protocol: 'mavlink' as const, transportType: 'udp' as const, udpMode: 'listen' as const, port: 14550 };

    it('rejects two UDP listeners on the same port, whatever the host', () => {
      addVehicle(listen);
      expect(validateNewEntry(getRoster(), { ...listen, name: 'B', host: '10.0.0.5' })).toMatch(/already listens on UDP port 14550/);
      expect(validateNewEntry(getRoster(), { ...listen, name: 'B', port: 14551 })).toBeNull();
    });

    it('does not treat a UDP client as clashing with a listener', () => {
      addVehicle(listen);
      expect(validateNewEntry(getRoster(), { ...listen, name: 'B', udpMode: 'client', host: '127.0.0.1' })).toBeNull();
    });

    it('lets an entry keep its own endpoint when edited', () => {
      const entry = addVehicle(listen);
      expect(validateNewEntry(getRoster(), { ...listen, name: 'Renamed' }, entry.id)).toBeNull();
    });

    it('requires a name, a port in range, a host for clients and a serial path', () => {
      expect(validateNewEntry([], { ...listen, name: ' ' })).toMatch(/Name/);
      expect(validateNewEntry([], { ...listen, port: 70000 })).toMatch(/Port/);
      expect(validateNewEntry([], { ...listen, udpMode: 'client' })).toMatch(/Host/);
      expect(validateNewEntry([], { name: 'S', protocol: 'mavlink', transportType: 'serial' })).toMatch(/serial port/);
      expect(validateNewEntry([], { ...listen, systemId: 0 })).toMatch(/System ID/);
    });
  });
});
