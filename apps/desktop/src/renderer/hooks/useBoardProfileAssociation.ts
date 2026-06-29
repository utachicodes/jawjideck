import { useEffect, useRef } from 'react';
import { useConnectionStore } from '../stores/connection-store';
import { useSettingsStore, type VehicleProfile } from '../stores/settings-store';
import { useParameterStore } from '../stores/parameter-store';
import { useMessagesStore } from '../stores/messages-store';
import type { BoardStats } from '../../shared/ipc-channels';
import type { StatusSeverity } from '../../shared/ipc-channels';
import { inferProfileFromParams } from '../lib/vehicle-templates/import';

/**
 * STAT_* parameter names used by ArduPilot for board-level flight statistics.
 */
const STAT_PARAMS: Record<string, keyof BoardStats> = {
  STAT_FLTTIME: 'totalFlightTime',
  STAT_FLTCNT: 'totalFlightCount',
  STAT_RUNTIME: 'totalRunTime',
  STAT_DISTFLWN: 'totalDistance',
  STAT_BOOTCNT: 'bootCount',
};

/**
 * Fields that inferProfileFromParams can populate from drone params.
 */
const INFERRABLE_FIELDS: (keyof VehicleProfile)[] = [
  'batteryCells', 'batteryCapacity', 'motorCount', 'stallSpeed',
];

/**
 * Compare local profile values against drone-reported params.
 */
function diffProfileVsDrone(
  local: VehicleProfile,
  inferred: Partial<VehicleProfile>,
  autoFilled: Set<string>,
): { field: string; local: string | number; drone: string | number }[] {
  const diffs: { field: string; local: string | number; drone: string | number }[] = [];
  for (const field of INFERRABLE_FIELDS) {
    if (!autoFilled.has(field)) continue;
    const droneVal = (inferred as unknown as Record<string, unknown>)[field];
    const localVal = (local as unknown as Record<string, unknown>)[field];
    if (droneVal === undefined || droneVal === localVal) continue;
    if (typeof droneVal !== 'number' && typeof droneVal !== 'string') continue;
    diffs.push({
      field,
      local: (localVal ?? '(unset)') as string | number,
      drone: droneVal as string | number,
    });
  }
  return diffs;
}

/**
 * Hook that automatically associates connected boards with vehicle profiles.
 *
 * On each new connection:
 * 1. Associates the board with a profile (switch, claim, or create)
 * 2. After params load: infers specs from drone params, updates profile, shows diff
 * 3. Reads STAT_* parameters for board flight statistics
 */
export function useBoardProfileAssociation() {
  const { connectionState } = useConnectionStore();
  const { associateBoard, updateBoardStats, updateVehicle, getActiveVehicle, _isInitialized } = useSettingsStore();
  const { parameters, isLoading } = useParameterStore();
  const addStatusMessage = useMessagesStore((s) => s.addMessage);

  // Track which boardUid we've already handled this session
  const lastAssociatedUid = useRef<string | null>(null);
  // Track whether we've already synced stats for this session
  const statsSyncedForUid = useRef<string | null>(null);
  // Track whether we've already inferred specs for this session
  const specsInferredForUid = useRef<string | null>(null);

  // Board association — runs when boardUid appears in connection state
  useEffect(() => {
    if (!_isInitialized) return;

    const { boardUid, boardId, isConnected, isReconnecting, mavType, vehicleType } = connectionState;

    if (isReconnecting) return;

    if (!isConnected) {
      lastAssociatedUid.current = null;
      statsSyncedForUid.current = null;
      specsInferredForUid.current = null;
      return;
    }

    if (!boardUid || boardUid === lastAssociatedUid.current) return;

    const displayName = boardId || connectionState.vehicleType || undefined;

    associateBoard(boardUid, boardId, displayName, mavType, vehicleType);
    lastAssociatedUid.current = boardUid;
  }, [
    connectionState,
    _isInitialized,
    associateBoard,
  ]);

  // Specs inference — after params load, read drone params and update profile
  useEffect(() => {
    if (!_isInitialized) return;
    if (!connectionState.isConnected || !connectionState.boardUid) return;
    if (isLoading) return;
    if (parameters.size === 0) return;
    if (specsInferredForUid.current === connectionState.boardUid) return;
    if (connectionState.protocol !== 'mavlink') return;

    // Build a value map for inferProfileFromParams
    const valueMap = new Map<string, number>();
    for (const [id, p] of parameters) {
      valueMap.set(id, p.value);
    }

    const result = inferProfileFromParams(valueMap);
    if (!result || result.autoFilled.size === 0) {
      specsInferredForUid.current = connectionState.boardUid;
      return;
    }

    const activeProfile = getActiveVehicle();
    if (!activeProfile) {
      specsInferredForUid.current = connectionState.boardUid;
      return;
    }

    // Diff: local profile vs drone-reported values
    const diffs = diffProfileVsDrone(activeProfile, result.profile, result.autoFilled);

    // Update profile with inferred values (only fill empty/undefined fields)
    const updates: Partial<VehicleProfile> = {};
    for (const field of INFERRABLE_FIELDS) {
      if (!result.autoFilled.has(field)) continue;
      const droneVal = (result.profile as unknown as Record<string, unknown>)[field];
      const localVal = (activeProfile as unknown as Record<string, unknown>)[field];
      if (droneVal !== undefined && (localVal === undefined || localVal === 0)) {
        (updates as Record<string, unknown>)[field] = droneVal;
      }
    }

    if (Object.keys(updates).length > 0) {
      updateVehicle(activeProfile.id, updates);
    }

    // Show diff notification if there are mismatches
    if (diffs.length > 0) {
      const lines = diffs.map(d => `  ${d.field}: profile=${d.local} → drone=${d.drone}`).join('\n');
      addStatusMessage(6, 'INFO' as StatusSeverity, `Drone specs detected — profile updated:\n${lines}`);
    }

    specsInferredForUid.current = connectionState.boardUid;
  }, [
    connectionState,
    _isInitialized,
    isLoading,
    parameters,
    getActiveVehicle,
    updateVehicle,
    addStatusMessage,
  ]);

  // Board stats sync — runs after parameters finish loading
  useEffect(() => {
    if (!_isInitialized) return;
    if (!connectionState.isConnected || !connectionState.boardUid) return;
    if (isLoading) return;
    if (parameters.size === 0) return;
    if (statsSyncedForUid.current === connectionState.boardUid) return;

    if (connectionState.protocol !== 'mavlink') return;

    const stats: BoardStats = {};
    let hasAny = false;

    for (const [paramName, statKey] of Object.entries(STAT_PARAMS)) {
      const param = parameters.get(paramName);
      if (param) {
        (stats as Record<string, number>)[statKey] = param.value;
        hasAny = true;
      }
    }

    if (hasAny) {
      updateBoardStats(stats);
      statsSyncedForUid.current = connectionState.boardUid;
    }
  }, [
    connectionState,
    _isInitialized,
    isLoading,
    parameters,
    updateBoardStats,
  ]);
}
