import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useFleetStore } from './fleet-store';
import { useSettingsStore } from './settings-store';

// This project has no jsdom configured (renderer tests run under plain
// Node and avoid touching `window`), but fleet-store.ts calls
// `window.electronAPI.*`. Point `window` at `globalThis` so the bare
// `window` identifier resolves, then stub `electronAPI` on it per test.
(globalThis as unknown as { window: unknown }).window = globalThis;

describe('fleet-store', () => {
  beforeEach(() => {
    useFleetStore.setState({ roster: [], statusByVehicleId: {}, focusedVehicleId: null });
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      fleetGetRoster: vi.fn().mockResolvedValue([{ id: 'v1', name: 'Drone 1', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14550 }]),
      fleetAddVehicle: vi.fn().mockResolvedValue({ success: true, entry: { id: 'v2', name: 'Drone 2', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14551 } }),
      fleetSetFocused: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(true),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('loads the roster from the main process', async () => {
    await useFleetStore.getState().loadRoster();
    expect(useFleetStore.getState().roster).toHaveLength(1);
    expect(useFleetStore.getState().roster[0]?.name).toBe('Drone 1');
  });

  it('adds a vehicle and appends it to the roster on success', async () => {
    const result = await useFleetStore.getState().addVehicle({ name: 'Drone 2', protocol: 'mavlink', transportType: 'udp', host: '127.0.0.1', port: 14551 });
    expect(result.success).toBe(true);
    expect(useFleetStore.getState().roster.map((v) => v.id)).toContain('v2');
  });

  it('merges incoming status updates keyed by vehicleId', () => {
    useFleetStore.getState().applyStatus({ vehicleId: 'v1', connected: true, armed: false, modeNumber: 0, batteryPercent: 90, batteryVoltage: 12.4, lat: 1, lon: 2, lastSeenAt: Date.now(), error: null });
    expect(useFleetStore.getState().statusByVehicleId['v1']?.batteryPercent).toBe(90);
  });

  it('focusVehicle disconnects, connects to the new vehicle, and tells the main process which vehicle is focused', async () => {
    const entry = { id: 'v1', name: 'Drone 1', protocol: 'mavlink' as const, transportType: 'udp' as const, host: '127.0.0.1', port: 14550 };
    await useFleetStore.getState().focusVehicle(entry, { type: 'udp', udpMode: 'client', udpRemoteHost: '127.0.0.1', udpRemotePort: 14550 });
    const api = window.electronAPI as unknown as { disconnect: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; fleetSetFocused: ReturnType<typeof vi.fn> };
    expect(api.disconnect).toHaveBeenCalled();
    expect(api.connect).toHaveBeenCalledWith({ type: 'udp', udpMode: 'client', udpRemoteHost: '127.0.0.1', udpRemotePort: 14550 });
    expect(api.fleetSetFocused).toHaveBeenCalledWith('v1');
    expect(useFleetStore.getState().focusedVehicleId).toBe('v1');
  });

  it('focusVehicle switches to the linked Vehicle Profile when the entry has one', async () => {
    const profileId = useSettingsStore.getState().addVehicle({ name: 'Survey Quad', type: 'copter', weight: 900, batteryCells: 6, batteryCapacity: 5000 });
    useSettingsStore.setState({ activeVehicleId: 'default' });

    const entry = { id: 'v1', name: 'Drone 1', protocol: 'mavlink' as const, transportType: 'udp' as const, host: '127.0.0.1', port: 14550, vehicleProfileId: profileId };
    await useFleetStore.getState().focusVehicle(entry, { type: 'udp', udpMode: 'client', udpRemoteHost: '127.0.0.1', udpRemotePort: 14550 });

    expect(useSettingsStore.getState().activeVehicleId).toBe(profileId);
  });

  it('focusVehicle leaves the active profile alone when the entry has no link', async () => {
    useSettingsStore.setState({ activeVehicleId: 'default' });
    const entry = { id: 'v1', name: 'Drone 1', protocol: 'mavlink' as const, transportType: 'udp' as const, host: '127.0.0.1', port: 14550 };
    await useFleetStore.getState().focusVehicle(entry, { type: 'udp', udpMode: 'client', udpRemoteHost: '127.0.0.1', udpRemotePort: 14550 });
    expect(useSettingsStore.getState().activeVehicleId).toBe('default');
  });

  it('focusVehicle releases the roster monitor before connecting, so it does not fight the entry for the same port', async () => {
    const order: string[] = [];
    (window.electronAPI as unknown as { fleetSetFocused: ReturnType<typeof vi.fn> }).fleetSetFocused = vi.fn().mockImplementation(async () => { order.push('fleetSetFocused'); });
    (window.electronAPI as unknown as { connect: ReturnType<typeof vi.fn> }).connect = vi.fn().mockImplementation(async () => { order.push('connect'); return true; });

    const entry = { id: 'v1', name: 'Drone 1', protocol: 'mavlink' as const, transportType: 'udp' as const, udpMode: 'listen' as const, port: 14550 };
    await useFleetStore.getState().focusVehicle(entry, { type: 'udp', udpMode: 'listen', udpPort: 14550, protocol: 'mavlink' });

    expect(order).toEqual(['fleetSetFocused', 'connect']);
  });

  it('focusVehicle gives the entry back to its monitor if connecting fails, instead of leaving it unfocused and unmonitored', async () => {
    (window.electronAPI as unknown as { connect: ReturnType<typeof vi.fn> }).connect = vi.fn().mockResolvedValue(false);
    const fleetSetFocused = window.electronAPI.fleetSetFocused as ReturnType<typeof vi.fn>;

    const entry = { id: 'v1', name: 'Drone 1', protocol: 'mavlink' as const, transportType: 'udp' as const, host: '127.0.0.1', port: 14550 };
    const success = await useFleetStore.getState().focusVehicle(entry, { type: 'udp', udpMode: 'client', udpRemoteHost: '127.0.0.1', udpRemotePort: 14550 });

    expect(success).toBe(false);
    expect(useFleetStore.getState().focusedVehicleId).toBeNull();
    expect(fleetSetFocused).toHaveBeenNthCalledWith(1, 'v1');
    expect(fleetSetFocused).toHaveBeenNthCalledWith(2, null);
  });
});
