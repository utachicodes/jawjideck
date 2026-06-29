import type { DisplayUnits } from '../../stores/settings-store';

export function fmtWeight(g: number, units: DisplayUnits): string {
  return units === 'large' ? `${+(g / 1000).toFixed(1)}kg` : `${g}g`;
}

export function fmtLength(mm: number, units: DisplayUnits): string {
  return units === 'large' ? `${+(mm / 1000).toFixed(2)}m` : `${mm}mm`;
}

export function fmtCapacity(mah: number, units: DisplayUnits): string {
  return units === 'large' ? `${+(mah / 1000).toFixed(1)}Ah` : `${mah}mAh`;
}

export function unitLabel(smallUnit: string, units: DisplayUnits): string {
  if (units !== 'large') return smallUnit;
  return ({ g: 'kg', mm: 'm', mAh: 'Ah' } as Record<string, string>)[smallUnit] ?? smallUnit;
}

export const LARGE_UNIT_FIELDS: Record<string, number> = {
  weight: 1000, wingspan: 1000, hullLength: 1000, wheelbase: 1000,
  batteryCapacity: 1000, displacement: 1000,
};
