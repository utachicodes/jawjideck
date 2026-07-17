import { describe, it, expect } from 'vitest';
import { planMissionMerge, type SyncedMission } from './sync-store';
import type { MissionSummary } from '../../shared/mission-library-types';

function localMission(overrides: Partial<MissionSummary> = {}): MissionSummary {
  return {
    id: 'm1', name: 'Local', description: '', vehicleProfileId: null, tags: [],
    waypointCount: 1, totalDistanceMeters: 10, boundingBox: null,
    flightCount: 0, lastFlightStatus: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function remoteMission(overrides: Partial<SyncedMission> = {}): SyncedMission {
  return {
    id: 'm1', name: 'Remote', description: '', vehicleProfileId: null, tags: [],
    waypointCount: 1, totalDistanceMeters: 10, boundingBox: null,
    groups: [], items: [], homePosition: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: 1_735_689_600_000, deleted: false,
    ...overrides,
  };
}

describe('planMissionMerge', () => {
  it('pushes a mission that only exists locally', () => {
    const plan = planMissionMerge([localMission()], []);
    expect(plan.toPush.map((m) => m.id)).toEqual(['m1']);
    expect(plan.toPull).toEqual([]);
    expect(plan.toDeleteLocally).toEqual([]);
  });

  it('pulls a mission that only exists remotely (and is not a tombstone)', () => {
    const plan = planMissionMerge([], [remoteMission()]);
    expect(plan.toPull.map((m) => m.id)).toEqual(['m1']);
    expect(plan.toPush).toEqual([]);
  });

  it('ignores a remote tombstone for a mission never seen locally', () => {
    const plan = planMissionMerge([], [remoteMission({ deleted: true })]);
    expect(plan.toPull).toEqual([]);
    expect(plan.toDeleteLocally).toEqual([]);
  });

  it('pulls when the remote copy is newer than the local copy', () => {
    const local = localMission({ updatedAt: '2026-01-01T00:00:00.000Z' });
    const remote = remoteMission({ updatedAt: new Date('2026-01-02T00:00:00.000Z').getTime() });
    const plan = planMissionMerge([local], [remote]);
    expect(plan.toPull.map((m) => m.id)).toEqual(['m1']);
    expect(plan.toPush).toEqual([]);
  });

  it('pushes when the local copy is newer than the remote copy', () => {
    const local = localMission({ updatedAt: '2026-01-02T00:00:00.000Z' });
    const remote = remoteMission({ updatedAt: new Date('2026-01-01T00:00:00.000Z').getTime() });
    const plan = planMissionMerge([local], [remote]);
    expect(plan.toPush.map((m) => m.id)).toEqual(['m1']);
    expect(plan.toPull).toEqual([]);
  });

  it('deletes locally when a newer remote tombstone exists', () => {
    const local = localMission({ updatedAt: '2026-01-01T00:00:00.000Z' });
    const remote = remoteMission({ deleted: true, updatedAt: new Date('2026-01-02T00:00:00.000Z').getTime() });
    const plan = planMissionMerge([local], [remote]);
    expect(plan.toDeleteLocally).toEqual(['m1']);
    expect(plan.toPush).toEqual([]);
    expect(plan.toPull).toEqual([]);
  });

  it('re-pushes (undeletes) when the local copy is newer than a remote tombstone', () => {
    const local = localMission({ updatedAt: '2026-01-02T00:00:00.000Z' });
    const remote = remoteMission({ deleted: true, updatedAt: new Date('2026-01-01T00:00:00.000Z').getTime() });
    const plan = planMissionMerge([local], [remote]);
    expect(plan.toPush.map((m) => m.id)).toEqual(['m1']);
    expect(plan.toDeleteLocally).toEqual([]);
  });

  it('does nothing for a mission that is already in sync', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const local = localMission({ updatedAt: ts });
    const remote = remoteMission({ updatedAt: new Date(ts).getTime() });
    const plan = planMissionMerge([local], [remote]);
    expect(plan.toPush).toEqual([]);
    expect(plan.toPull).toEqual([]);
    expect(plan.toDeleteLocally).toEqual([]);
  });
});
