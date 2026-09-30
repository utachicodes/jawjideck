/**
 * Fleet roster helpers shared by the main-process probe and the Add Vehicle
 * form: firmware/protocol mapping and MAV_TYPE classification.
 */

import type { FleetFirmware, FleetVehicleType } from './ipc-channels';

export const FLEET_FIRMWARE_LABELS: Record<FleetFirmware, string> = {
  ardupilot: 'ArduPilot',
  px4: 'PX4',
  betaflight: 'Betaflight',
  inav: 'iNav',
};

export const FLEET_VEHICLE_TYPE_LABELS: Record<FleetVehicleType, string> = {
  copter: 'Multicopter',
  heli: 'Helicopter',
  plane: 'Plane',
  vtol: 'VTOL',
  rover: 'Rover',
  boat: 'Boat',
  sub: 'Submarine',
  other: 'Other',
};

export function protocolForFirmware(firmware: FleetFirmware): 'mavlink' | 'msp' {
  return firmware === 'betaflight' || firmware === 'inav' ? 'msp' : 'mavlink';
}

/** HEARTBEAT.autopilot → firmware (MAV_AUTOPILOT_ARDUPILOTMEGA = 3, MAV_AUTOPILOT_PX4 = 12). */
export function firmwareFromAutopilot(autopilot: number): FleetFirmware | undefined {
  if (autopilot === 3) return 'ardupilot';
  if (autopilot === 12) return 'px4';
  return undefined;
}

/** MSP_FC_VARIANT identifier → firmware. */
export function firmwareFromMspVariant(variant: string): FleetFirmware | undefined {
  if (variant === 'BTFL') return 'betaflight';
  if (variant === 'INAV') return 'inav';
  return undefined;
}

/** HEARTBEAT.type (MAV_TYPE) → roster vehicle type. */
export function vehicleTypeFromMavType(mavType: number): FleetVehicleType {
  if (mavType === 1) return 'plane';
  if (mavType === 4) return 'heli';
  if ([2, 3, 13, 14, 15, 29, 35].includes(mavType)) return 'copter';
  if (mavType >= 19 && mavType <= 25) return 'vtol';
  if (mavType === 10) return 'rover';
  if (mavType === 11) return 'boat';
  if (mavType === 12) return 'sub';
  return 'other';
}

/** MAV_AUTOPILOT_INVALID: heartbeats from GCSs and companion computers, not vehicles. */
export const MAV_AUTOPILOT_INVALID = 8;

/** Accent colors offered for roster entries. */
export const FLEET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

/** Roster vehicle type -> Settings > Vehicle profile type (VehicleProfile has no 'heli'/'other'). */
export function profileTypeForFleetVehicleType(type: FleetVehicleType): 'copter' | 'plane' | 'vtol' | 'rover' | 'boat' | 'sub' {
  if (type === 'heli' || type === 'other') return 'copter';
  return type;
}
