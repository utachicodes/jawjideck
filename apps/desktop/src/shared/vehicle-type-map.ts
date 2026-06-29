import type { VehicleType } from '../renderer/stores/settings-store';

/**
 * Map MAV_TYPE enum values to our internal vehicle types.
 * Single source of truth — used by App.tsx and settings-store.ts.
 * @see https://mavlink.io/en/messages/common.html#MAV_TYPE
 */
export const mavTypeToVehicleType: Record<number, VehicleType> = {
  0: 'copter',    // MAV_TYPE_GENERIC
  1: 'plane',     // MAV_TYPE_FIXED_WING
  2: 'copter',    // MAV_TYPE_QUADROTOR
  3: 'copter',    // MAV_TYPE_COAXIAL
  4: 'copter',    // MAV_TYPE_HELICOPTER
  10: 'rover',    // MAV_TYPE_GROUND_ROVER
  11: 'boat',     // MAV_TYPE_SURFACE_BOAT
  12: 'sub',      // MAV_TYPE_SUBMARINE
  13: 'copter',   // MAV_TYPE_HEXAROTOR
  14: 'copter',   // MAV_TYPE_OCTOROTOR
  15: 'copter',   // MAV_TYPE_TRICOPTER
  16: 'plane',    // MAV_TYPE_FLAPPING_WING (legacy APM uses this for planes!)
  19: 'vtol',     // MAV_TYPE_VTOL_DUOROTOR
  20: 'vtol',     // MAV_TYPE_VTOL_QUADROTOR
  21: 'vtol',     // MAV_TYPE_VTOL_TILTROTOR
  22: 'vtol',     // MAV_TYPE_VTOL_RESERVED2
  23: 'vtol',     // MAV_TYPE_VTOL_RESERVED3
  24: 'vtol',     // MAV_TYPE_VTOL_RESERVED4
  25: 'vtol',     // MAV_TYPE_VTOL_RESERVED5
};
