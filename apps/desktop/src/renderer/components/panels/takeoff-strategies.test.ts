import { describe, it, expect, vi } from 'vitest';
import { executeTakeoff, type TakeoffContext } from './takeoff-strategies';
import { PX4_CAPABILITIES, PX4_MODE } from '../../../shared/px4';
import type { FlightState, GpsData, PositionData } from '../../../shared/telemetry-types';

function px4Context(overrides: { gpsFix?: number; takeoffOk?: boolean } = {}) {
  const flight: FlightState = { mode: 'Hold', modeNum: PX4_MODE.HOLD, armed: false, isFlying: false };
  const gps = { fixType: overrides.gpsFix ?? 3, satellites: 12, hdop: 0.8 } as GpsData;
  const api = {
    mavlinkSetMode: vi.fn(async () => true),
    mavlinkArmDisarm: vi.fn(async () => { flight.armed = true; return true; }),
    mavlinkTakeoff: vi.fn(async () => {
      if (overrides.takeoffOk === false) return false;
      flight.modeNum = PX4_MODE.TAKEOFF;
      return true;
    }),
    mavlinkVtolTakeoff: vi.fn(async () => true),
    setParameter: vi.fn(async () => true),
    sitlRcStart: vi.fn(async () => ({ success: true })),
    sitlRcSend: vi.fn(async () => {}),
  };
  const ctx: TakeoffContext = {
    altitudeM: 5,
    forceArm: false,
    vehicleClass: 'copter',
    autopilot: 'px4',
    capabilities: PX4_CAPABILITIES,
    isSitl: false,
    getFlight: () => flight,
    getGps: () => gps,
    getPosition: () => ({}) as PositionData,
    getParam: () => undefined,
    api,
    setStatus: () => {},
    waitForState: async (check) => check(),
  };
  return { ctx, api };
}

describe('executeTakeoff (PX4)', () => {
  it('arms then sends NAV_TAKEOFF without ArduPilot mode switches', async () => {
    const { ctx, api } = px4Context();
    expect(await executeTakeoff(ctx)).toEqual({ ok: true });
    expect(api.mavlinkArmDisarm).toHaveBeenCalledWith(true, false);
    expect(api.mavlinkTakeoff).toHaveBeenCalledWith(5);
    expect(api.mavlinkSetMode).not.toHaveBeenCalled();
  });

  it('does not arm without a GPS fix', async () => {
    const { ctx, api } = px4Context({ gpsFix: 0 });
    const result = await executeTakeoff(ctx);
    expect(result.ok).toBe(false);
    expect(api.mavlinkArmDisarm).not.toHaveBeenCalled();
  });

  it('reports a rejected takeoff command', async () => {
    const { ctx } = px4Context({ takeoffOk: false });
    expect((await executeTakeoff(ctx)).ok).toBe(false);
  });
});
