import { TileLayer } from 'react-leaflet';
import { useOverlayStore } from '../../../stores/overlay-store';

export function WeatherRadarOverlay() {
  const radarMeta = useOverlayStore((s) => s.radarMeta);

  if (!radarMeta) return null;

  // Encode the radar path into the layer name for tile-cache
  const layerName = `radar-${radarMeta.path}`;

  return (
    <TileLayer
      key={radarMeta.path}
      url={`tile-cache://${layerName}/{z}/{x}/{y}.png`}
      opacity={0.6}
      maxNativeZoom={6}
      maxZoom={22}
      zIndex={10}
    />
  );
}
