import { useOverlayStore } from '../../../stores/overlay-store';
import type { OverlayId } from '../../../../shared/overlay-types';

const OVERLAYS: Array<{ id: OverlayId; label: string }> = [
  { id: 'radar', label: 'Radar' },
  { id: 'airspace', label: 'Airspace' },
  { id: 'airports', label: 'Fields' },
];

export function OverlayToggles() {
  const activeOverlays = useOverlayStore((s) => s.activeOverlays);
  const toggleOverlay = useOverlayStore((s) => s.toggleOverlay);

  return (
    <>
      {OVERLAYS.map(({ id, label }) => {
        const isActive = activeOverlays.has(id);
        return (
          <button
            key={id}
            onClick={() => toggleOverlay(id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              isActive
                ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400'
                : 'bg-gray-800/80 border-gray-700/30 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        );
      })}
    </>
  );
}
