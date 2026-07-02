/**
 * FleetMapPanel — shows every roster vehicle with a known position as a
 * marker on a shared map. Deliberately minimal compared to MissionMapPanel:
 * no waypoints, no overlays, no drawing tools — just live vehicle positions.
 */

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useFleetStore } from '../../stores/fleet-store';

const VEHICLE_ICON = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export function FleetMapPanel() {
  const roster = useFleetStore((s) => s.roster);
  const statusByVehicleId = useFleetStore((s) => s.statusByVehicleId);

  const vehiclesWithPosition = roster
    .map((entry) => ({ entry, status: statusByVehicleId[entry.id] }))
    .filter((v) => v.status?.lat != null && v.status?.lon != null);

  const center: [number, number] = vehiclesWithPosition[0]
    ? [vehiclesWithPosition[0].status!.lat!, vehiclesWithPosition[0].status!.lon!]
    : [0, 0];

  return (
    <div className="h-full w-full">
      <MapContainer center={center} zoom={vehiclesWithPosition.length ? 15 : 2} className="h-full w-full">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        {vehiclesWithPosition.map(({ entry, status }) => (
          <Marker key={entry.id} position={[status!.lat!, status!.lon!]} icon={VEHICLE_ICON}>
            <Popup>{entry.name}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
