import { useSettingsStore, type VehicleProfile } from '../../stores/settings-store';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

export function TipsSection({ vehicle }: { vehicle: VehicleProfile | null }) {
  const { missionDefaults } = useSettingsStore();
  const tips: { type: 'info' | 'warning' | 'success'; message: string }[] = [];

  if (vehicle) {
    if ((vehicle._avgPowerDraw ?? 0) > 500) tips.push({ type: 'info', message: 'High power draw - consider larger battery for longer flights' });
    if ((vehicle._cruiseSpeed ?? 0) > 15 && vehicle.type === 'copter') tips.push({ type: 'info', message: 'High cruise speed reduces efficiency on multirotors' });
    if (vehicle.batteryCapacity < 3000 && vehicle.weight > 2000) tips.push({ type: 'warning', message: 'Small battery for vehicle weight - flight time may be limited' });
  }
  if (missionDefaults.safeAltitudeBuffer < 20) tips.push({ type: 'warning', message: 'Low safe altitude buffer - increase for mountainous terrain' });
  if (tips.length === 0) tips.push({ type: 'success', message: 'Your settings look good! Ready for flight planning.' });

  const Icon = ({ type }: { type: string }) => {
    switch (type) {
      case 'warning': return <AlertTriangle size={16} className="text-amber-400" />;
      case 'success': return <CheckCircle size={16} className="text-emerald-400" />;
      default: return <Info size={16} className="text-blue-400" />;
    }
  };

  return (
    <div className="space-y-2">
      {tips.map((tip, i) => (
        <div key={i} className={`flex items-start gap-2 p-3 rounded-lg ${tip.type === 'warning' ? 'bg-amber-500/10' : tip.type === 'success' ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
          <Icon type={tip.type} />
          <span className="text-sm text-content">{tip.message}</span>
        </div>
      ))}
    </div>
  );
}
