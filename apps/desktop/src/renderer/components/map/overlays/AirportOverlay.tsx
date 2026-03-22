import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { useOverlayStore } from '../../../stores/overlay-store';
import type { AirportData } from '../../../../shared/overlay-types';

function getPrimaryFrequency(airport: AirportData): string | null {
  if (airport.frequencies.length === 0) return null;
  const twr = airport.frequencies.find((f) => f.type === 14);
  const app = airport.frequencies.find((f) => f.type === 13);
  const freq = twr ?? app ?? airport.frequencies[0];
  return freq ? `${freq.valueMhz.toFixed(3)} MHz` : null;
}

const airportIcon = L.divIcon({
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  html: `<div style="width:16px;height:16px;border-radius:50%;background:rgba(26,26,42,0.9);border:1.5px solid #4488CC;display:flex;align-items:center;justify-content:center"><svg width="10" height="10" viewBox="0 0 24 24" fill="#4488CC"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg></div>`,
});

export function AirportOverlay() {
  const airportData = useOverlayStore((s) => s.airportData);

  return (
    <>
      {airportData.map((ap) => {
        const freq = getPrimaryFrequency(ap);
        return (
          <Marker key={`${ap.icaoCode || ap.name}-${ap.lat}-${ap.lon}`} position={[ap.lat, ap.lon]} icon={airportIcon}>
            <Tooltip permanent direction="right" offset={[12, 0]}>
              <div className="font-mono text-[9px] leading-tight">
                <div className="font-bold">{ap.icaoCode || ap.name}</div>
                <div>{Math.round(ap.elevationM)}m MSL</div>
                {freq && <div>{freq}</div>}
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
