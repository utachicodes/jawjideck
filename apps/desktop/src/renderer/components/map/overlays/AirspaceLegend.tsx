const LEGEND_ITEMS = [
  { label: 'CTR', color: 'rgba(0, 100, 255, 0.5)' },
  { label: 'Restricted', color: 'rgba(255, 0, 0, 0.5)' },
  { label: 'Danger', color: 'rgba(255, 150, 0, 0.5)' },
  { label: 'TMA', color: 'rgba(160, 32, 240, 0.5)' },
];

export function AirspaceLegend() {
  return (
    <div className="absolute left-2 top-1/2 -translate-y-1/2 z-[500] flex flex-col gap-1 bg-gray-900/80 backdrop-blur rounded-lg p-2 border border-gray-700/30">
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
          <span className="text-[10px] font-mono text-gray-300">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
