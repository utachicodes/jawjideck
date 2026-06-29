import { useState, useEffect } from 'react';
import { useSettingsStore, type VehicleProfile, type VehicleType, type DisplayUnits } from '../../../stores/settings-store';
import { useParameterStore } from '../../../stores/parameter-store';
import { useNavigationStore } from '../../../stores/navigation-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useConnectionStore } from '../../../stores/connection-store';
import { VehicleTemplatePicker } from '../vehicle-profile/VehicleTemplatePicker';
import { ApplyProfileButton } from '../vehicle-profile/ApplyProfileButton';
import { DriftBadge } from '../vehicle-profile/DriftBadge';
import { SnapshotList } from '../vehicle-profile/SnapshotList';
import { TemplateChip } from '../vehicle-profile/TemplateChip';
import { ConfigSelectors } from '../vehicle-profile/ConfigSelectors';
import { PhysicsAdvanced } from '../vehicle-profile/PhysicsAdvanced';
import { ParamsPreview } from '../vehicle-profile/ParamsPreview';
import { StallSpeedCalcButton } from '../vehicle-profile/StallSpeedCalcButton';
import { inferProfileFromParams } from '../../../lib/vehicle-templates/import';
import { VEHICLE_ICONS, VEHICLE_TYPE_NAMES } from '../../../lib/vehicle-icons';
import { saveParmToFile } from '../../../lib/vehicle-templates/export-parm';
import { getTemplate, defaultTemplateForType } from '../../../lib/vehicle-templates/registry';
import { Download } from 'lucide-react';
import type { VehicleTemplate } from '../../../lib/vehicle-templates/types';
import { mavTypeToVehicleType } from '../../../../shared/vehicle-type-map';
import { CircularGauge } from '../CircularGauge';
import { ProfileCompatibilityBanner } from '../ProfileCompatibilityBanner';
import { WeatherWidget } from '../WeatherWidget';
import { ArduPilotFlightStats } from '../ArduPilotFlightStats';
import { TipsSection } from '../TipsSection';
import { fmtWeight, fmtLength, fmtCapacity, unitLabel } from '../settings-utils';

// Vehicle types supported by each firmware
const FIRMWARE_SUPPORTED_TYPES: Record<string, VehicleType[]> = {
  BTFL: ['copter'],
  CLFL: ['copter'],
  INAV: ['copter', 'plane', 'rover', 'boat'],
};

function checkProfileCompatibility(
  profileType: VehicleType | undefined,
  fcVariant: string | undefined,
  protocol: 'mavlink' | 'msp' | undefined
): { compatible: boolean; message?: string; supportedTypes?: VehicleType[] } {
  if (!profileType || !protocol) return { compatible: true };
  if (protocol === 'mavlink') return { compatible: true };
  const supportedTypes = FIRMWARE_SUPPORTED_TYPES[fcVariant || ''];
  if (!supportedTypes) return { compatible: true };
  if (supportedTypes.includes(profileType)) return { compatible: true };
  return {
    compatible: false,
    message: `${profileType} is not supported by ${fcVariant || 'this firmware'}`,
    supportedTypes,
  };
}

let lastAutoDetectSession: string | null = null;

export function VehicleTab() {
  const {
    vehicles,
    activeVehicleId,
    addVehicle,
    updateVehicle,
    removeVehicle,
    setActiveVehicle,
    getActiveVehicle,
    getEstimatedFlightTime,
    getEstimatedRange,
    displayUnits,
    getCruiseSpeed,
  } = useSettingsStore();

  const scrollTarget = useNavigationStore((s) => s.scrollTarget);
  useEffect(() => {
    if (!scrollTarget) return;
    const el = document.getElementById(scrollTarget);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-blue-500/60');
      const t = setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500/60'), 1800);
      useNavigationStore.getState().clearScrollTarget();
      return () => clearTimeout(t);
    }
    useNavigationStore.getState().clearScrollTarget();
  }, [scrollTarget]);

  const { connectionState } = useConnectionStore();
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const activeVehicle = getActiveVehicle();
  const estimatedFlightTime = getEstimatedFlightTime();
  const estimatedRange = getEstimatedRange();

  useEffect(() => {
    const sessionKey = connectionState.isConnected ? `${connectionState.systemId}-${connectionState.mavType}` : null;
    if (connectionState.isConnected &&
        connectionState.mavType !== undefined &&
        activeVehicleId &&
        sessionKey !== lastAutoDetectSession) {
      const detectedType = mavTypeToVehicleType[connectionState.mavType];
      if (detectedType && activeVehicle && activeVehicle.type !== detectedType) {
        updateVehicle(activeVehicleId, { type: detectedType });
      }
      lastAutoDetectSession = sessionKey;
    }
    if (!connectionState.isConnected) {
      lastAutoDetectSession = null;
    }
  }, [connectionState.isConnected, connectionState.mavType, connectionState.systemId, activeVehicleId, activeVehicle, updateVehicle]);

  const cruiseSpeed = getCruiseSpeed();
  const estimatePower = () => {
    if (!activeVehicle) return 0;
    const weight = activeVehicle.weight || 1000;
    switch (activeVehicle.type) {
      case 'copter': return Math.round((weight / 1000) * 180);
      case 'plane':
      case 'vtol': return Math.round((weight / 1000) * 65);
      default: return Math.round((weight / 1000) * 100);
    }
  };
  const estimatedPower = estimatePower();

  const profileCompatibility = checkProfileCompatibility(
    activeVehicle?.type,
    connectionState.fcVariant,
    connectionState.protocol
  );

  const handleCreateCompatibleProfile = (type: VehicleType) => {
    const boardId = connectionState.boardId || 'Unknown';
    const newVehicleData = {
      name: `${boardId} ${VEHICLE_TYPE_NAMES[type]}`,
      type,
      weight: type === 'copter' ? 500 : type === 'plane' ? 1500 : 1000,
      batteryCells: 4,
      batteryCapacity: type === 'copter' ? 1300 : type === 'plane' ? 3000 : 5000,
      ...(connectionState.boardUid && { boardUid: connectionState.boardUid }),
      ...(connectionState.boardId && { boardId: connectionState.boardId }),
      lastConnected: new Date().toISOString(),
      ...(type === 'copter' && { frameSize: 127, motorCount: 4, motorKv: 2400, propSize: '5x4.5' }),
      ...(type === 'plane' && { wingspan: 1200, wingArea: 24 }),
      ...(type === 'rover' && { driveType: 'differential' as const }),
      ...(type === 'boat' && { hullType: 'displacement' as const }),
    };
    const newVehicleId = addVehicle(newVehicleData);
    setActiveVehicle(newVehicleId);
  };

  return (
    <div className="space-y-4">
      {/* Profile Compatibility Warning */}
      {connectionState.isConnected && !profileCompatibility.compatible && activeVehicle && connectionState.fcVariant && (
        <ProfileCompatibilityBanner
          profileType={activeVehicle.type}
          fcVariant={connectionState.fcVariant}
          boardId={connectionState.boardId}
          supportedTypes={profileCompatibility.supportedTypes || []}
          onCreateNewProfile={handleCreateCompatibleProfile}
        />
      )}

      {/* Top row - Active Vehicle + Performance + Weather */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 text-blue-400 flex-shrink-0">
              {activeVehicle ? VEHICLE_ICONS[activeVehicle.type] : VEHICLE_ICONS.copter}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-medium text-content truncate">
                    {activeVehicle?.name || 'No vehicle'}
                  </div>
                  <div className="text-sm text-content-secondary flex items-center gap-2">
                    <span>{activeVehicle ? VEHICLE_TYPE_NAMES[activeVehicle.type] : ''}</span>
                    {activeVehicle?.boardId && (
                      <span className="text-[10px] bg-surface-raised px-1.5 py-0.5 rounded">{activeVehicle.boardId}</span>
                    )}
                  </div>
                </div>
                {activeVehicle && (
                  <button
                    onClick={() => setEditingVehicleId(activeVehicle.id)}
                    className="p-1.5 text-content-secondary hover:text-content hover:bg-surface-raised rounded transition-colors"
                    title="Edit vehicle"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
          {activeVehicle && (
            <div className="mt-4 pt-4 border-t border-subtle">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/20 rounded-lg p-2">
                  <div className="text-xs text-content-secondary">
                    {activeVehicle.type === 'copter' && 'Frame'}
                    {activeVehicle.type === 'plane' && 'Wingspan'}
                    {activeVehicle.type === 'vtol' && 'Wingspan'}
                    {activeVehicle.type === 'rover' && 'Drive'}
                    {activeVehicle.type === 'boat' && 'Hull'}
                    {activeVehicle.type === 'sub' && 'Depth'}
                  </div>
                  <div className="text-sm text-content font-medium">
                    {activeVehicle.type === 'copter' && `${fmtLength(activeVehicle.frameSize || 127, displayUnits)} ${activeVehicle.motorCount === 6 ? 'Hex' : activeVehicle.motorCount === 8 ? 'Octo' : 'Quad'}`}
                    {activeVehicle.type === 'plane' && fmtLength(activeVehicle.wingspan || 1200, displayUnits)}
                    {activeVehicle.type === 'vtol' && fmtLength(activeVehicle.wingspan || 1500, displayUnits)}
                    {activeVehicle.type === 'rover' && (activeVehicle.driveType === 'ackermann' ? 'Car' : activeVehicle.driveType === 'skid' ? 'Skid' : 'Tank')}
                    {activeVehicle.type === 'boat' && (activeVehicle.hullType ? `${activeVehicle.hullType.charAt(0).toUpperCase()}${activeVehicle.hullType.slice(1)}` : 'Displacement')}
                    {activeVehicle.type === 'sub' && `${activeVehicle.maxDepth || 100}m`}
                  </div>
                </div>
                <div className="bg-black/20 rounded-lg p-2">
                  <div className="text-xs text-content-secondary">Weight</div>
                  <div className="text-sm text-content font-medium">{fmtWeight(activeVehicle.weight, displayUnits)}</div>
                </div>
                <div className="bg-black/20 rounded-lg p-2">
                  <div className="text-xs text-content-secondary">Battery</div>
                  <div className="text-sm text-content font-medium">{activeVehicle.batteryCells}S{activeVehicle.batteryChemistry && activeVehicle.batteryChemistry !== 'lipo' ? ` ${({ lihv: 'LiHV', lion: 'Li-Ion', life: 'LiFe' } as Record<string, string>)[activeVehicle.batteryChemistry] ?? ''}` : ''} {fmtCapacity(activeVehicle.batteryCapacity, displayUnits)}</div>
                </div>
                <div className="bg-black/20 rounded-lg p-2">
                  <div className="text-xs text-content-secondary">
                    {['copter', 'plane', 'vtol'].includes(activeVehicle.type) ? 'Est. Cruise' : 'Est. Speed'}
                  </div>
                  <div className="text-sm text-cyan-400 font-medium">
                    {activeVehicle.type === 'boat'
                      ? `${(cruiseSpeed * 1.944).toFixed(1)} kts`
                      : `${cruiseSpeed.toFixed(1)} m/s`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
          <div className="flex items-center justify-around mb-2">
            <CircularGauge value={Math.round(estimatedFlightTime / 60)} max={60} label="Flight Time" unit="min" color="#3b82f6" size={85} />
            <CircularGauge value={Math.round(estimatedRange / 1000)} max={50} label="Range" unit="km" color="#10b981" size={85} />
          </div>
          <div className="bg-black/20 rounded-lg overflow-hidden">
            <div className="grid grid-cols-3 text-[10px] text-content-secondary uppercase tracking-wider px-2 py-1.5 border-b border-subtle">
              <span>Usage</span>
              <span className="text-center">Time</span>
              <span className="text-right">Range</span>
            </div>
            {[
              { pct: 60, label: '60%', color: 'text-green-400', note: 'Safe' },
              { pct: 80, label: '80%', color: 'text-blue-400', note: 'Normal' },
              { pct: 95, label: '95%', color: 'text-red-400', note: 'Max' },
            ].map(({ pct, label, color, note }) => {
              const scaledTime = Math.round(estimatedFlightTime * (pct / 80));
              const scaledRange = Math.round(estimatedRange * (pct / 80));
              return (
                <div key={pct} className="grid grid-cols-3 px-2 py-1.5 text-xs border-b border-subtle last:border-0">
                  <span className={`${color} font-medium`}>{label} <span className="text-content-tertiary font-normal">{note}</span></span>
                  <span className="text-center text-content">{formatTime(scaledTime)}</span>
                  <span className="text-right text-content">{formatDistance(scaledRange)}</span>
                </div>
              );
            })}
          </div>
        </section>

        <WeatherWidget vehicleType={activeVehicle?.type} />
      </div>

      {/* Stats + Tips row */}
      {connectionState.protocol === 'mavlink' && connectionState.isConnected ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ArduPilotFlightStats />
          <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4">
            <h3 className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-3">Tips & Recommendations</h3>
            <TipsSection vehicle={activeVehicle} />
          </section>
        </div>
      ) : (
        <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4">
          <h3 className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-3">Tips & Recommendations</h3>
          <TipsSection vehicle={activeVehicle} />
        </section>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins} min`;
}

function formatDistance(meters: number): string {
  if (!isFinite(meters) || meters < 0) return '--';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}
