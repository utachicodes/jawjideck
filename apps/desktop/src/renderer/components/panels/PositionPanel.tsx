import { useTelemetryStore } from '../../stores/telemetry-store';
import { PanelContainer, formatNumber } from './panel-utils';

export function PositionPanel() {
  const position = useTelemetryStore((s) => s.position);

  return (
    <PanelContainer>
      <div className="space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="text-content-secondary text-xs">Latitude</span>
          <span className="text-content font-mono text-sm">{formatNumber(position.lat, 6)}°</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-content-secondary text-xs">Longitude</span>
          <span className="text-content font-mono text-sm">{formatNumber(position.lon, 6)}°</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-content-secondary text-xs">Altitude</span>
          <span className="text-content font-mono text-sm">{formatNumber(position.alt, 1)} m</span>
        </div>
      </div>
    </PanelContainer>
  );
}
