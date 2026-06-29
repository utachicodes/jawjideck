import type { VehicleType } from '../stores/settings-store';
import multicopterImage from '../assets/drone-types/multicopter.png';
import fixedWingImage from '../assets/drone-types/fixed-wing.png';
import vtolImage from '../assets/drone-types/vtol.jpg';

// Vehicle type icons (photos for copter/plane/vtol, SVG paths for the rest)
export const VEHICLE_ICONS: Record<VehicleType, React.ReactNode> = {
  copter: <img src={multicopterImage} alt="Multicopter" className="w-full h-full object-contain" />,
  plane: <img src={fixedWingImage} alt="Fixed Wing" className="w-full h-full object-contain" />,
  vtol: <img src={vtolImage} alt="VTOL" className="w-full h-full object-contain" />,
  rover: (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect x="20" y="35" width="60" height="30" rx="5" fill="currentColor" opacity="0.9" />
      <circle cx="30" cy="70" r="10" fill="currentColor" opacity="0.7" />
      <circle cx="70" cy="70" r="10" fill="currentColor" opacity="0.7" />
      <line x1="70" y1="35" x2="75" y2="20" stroke="currentColor" strokeWidth="2" />
      <circle cx="75" cy="18" r="3" fill="currentColor" />
    </svg>
  ),
  boat: (
    <svg viewBox="0 100 475 270" className="w-full h-full" fill="currentColor">
      <path d="M474.057,253.807c-1.334-2.341-3.821-3.788-6.517-3.788H344.527l-31.122-61.4c-0.238-0.471-0.526-0.916-0.858-1.327c-4.803-5.935-12.059-14.904-24.214-14.904H169.711l-14.466-65.499c-0.759-3.436-3.805-5.882-7.323-5.882h-64c-2.219,0-4.324,0.982-5.749,2.684c-1.425,1.701-2.023,3.945-1.635,6.13l13.353,75.051l-60.441,65.147H7.5c-4.143,0-7.5,3.358-7.5,7.5v85.15c0,0.516,0.053,1.03,0.158,1.534c3.612,17.285,19.05,29.83,36.708,29.83H276.16c39.849,0,79.213-10.425,113.838-30.148c34.624-19.723,63.669-48.265,83.993-82.541C475.366,259.026,475.391,256.149,474.057,253.807z M276.16,359.033H36.866c-10.354,0-19.437-7.189-21.866-17.196v-22.311h360.354c4.143,0,7.5-3.358,7.5-7.5s-3.357-7.5-7.5-7.5H15v-39.507h293.02c4.143,0,7.5-3.358,7.5-7.5c0-4.142-3.357-7.5-7.5-7.5H49.91l43.272-46.642l4.788,26.91c0.646,3.634,3.809,6.188,7.375,6.188c0.436,0,0.879-0.039,1.322-0.117c4.078-0.726,6.796-4.62,6.07-8.698L92.873,116.007h49.023l14.467,65.499c0.848,3.84,4.499,6.33,8.329,5.809c0.326,0.043,0.656,0.073,0.995,0.073h122.646c4.083,0,7.319,2.939,12.057,8.73l5.29,10.437h-80.959c-4.143,0-7.5,3.358-7.5,7.5s3.357,7.5,7.5,7.5h88.563l19.948,39.355c1.261,2.488,3.791,4.057,6.568,4.072h119.618c-18.697,29.383-43.785,54.018-72.764,71.524C325.693,350.646,301.148,359.033,276.16,359.033z" />
    </svg>
  ),
  sub: (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <ellipse cx="50" cy="50" rx="35" ry="12" fill="currentColor" opacity="0.9" />
      <rect x="40" y="35" width="15" height="10" rx="2" fill="currentColor" opacity="0.8" />
      <line x1="47" y1="35" x2="47" y2="25" stroke="currentColor" strokeWidth="2" />
      <circle cx="88" cy="50" r="5" fill="currentColor" opacity="0.6" />
    </svg>
  ),
};

export const VEHICLE_TYPE_NAMES: Record<VehicleType, string> = {
  copter: 'Multicopter',
  plane: 'Fixed Wing',
  vtol: 'VTOL',
  rover: 'Rover',
  boat: 'Boat',
  sub: 'Submarine',
};

export const VEHICLE_TYPE_ORDER: VehicleType[] = ['copter', 'plane', 'vtol', 'rover', 'boat', 'sub'];
