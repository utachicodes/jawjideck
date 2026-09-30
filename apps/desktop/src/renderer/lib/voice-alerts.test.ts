import { describe, it, expect } from 'vitest';
import {
  armDisarmEvent,
  modeChangeEvent,
  connectionEvent,
  linkStaleEvent,
  gpsFixEvent,
  lowBatteryEvent,
} from './voice-alerts';

describe('armDisarmEvent', () => {
  it('announces a real transition', () => {
    expect(armDisarmEvent(false, true)).toEqual({ text: 'Armed', priority: 'high' });
    expect(armDisarmEvent(true, false)).toEqual({ text: 'Disarmed', priority: 'high' });
  });
  it('stays quiet with no previous state or no change', () => {
    expect(armDisarmEvent(undefined, true)).toBeNull();
    expect(armDisarmEvent(true, true)).toBeNull();
  });
});

describe('modeChangeEvent', () => {
  it('announces any mode label change, regardless of firmware', () => {
    expect(modeChangeEvent('Hold', 'Stabilized')).toEqual({ text: 'Mode Stabilized', priority: 'normal' });
    expect(modeChangeEvent('AltHold', 'Loiter')).toEqual({ text: 'Mode Loiter', priority: 'normal' });
  });
  it('ignores the placeholder mode and no-ops', () => {
    expect(modeChangeEvent(undefined, 'Unknown')).toBeNull();
    expect(modeChangeEvent('Loiter', 'Unknown')).toBeNull();
    expect(modeChangeEvent('Loiter', 'Loiter')).toBeNull();
    expect(modeChangeEvent(undefined, 'Loiter')).toBeNull();
  });
});

describe('connectionEvent', () => {
  it('announces connect and disconnect with the right priority', () => {
    expect(connectionEvent(false, true)).toEqual({ text: 'Vehicle connected', priority: 'normal' });
    expect(connectionEvent(true, false)).toEqual({ text: 'Vehicle disconnected', priority: 'high' });
  });
  it('does not announce on first observation', () => {
    expect(connectionEvent(undefined, true)).toBeNull();
  });
});

describe('linkStaleEvent', () => {
  it('announces loss and recovery', () => {
    expect(linkStaleEvent(false, true)).toEqual({ text: 'Data link lost', priority: 'high' });
    expect(linkStaleEvent(true, false)).toEqual({ text: 'Link regained', priority: 'high' });
  });
});

describe('gpsFixEvent', () => {
  it('announces crossing the 3D-fix threshold in either direction', () => {
    expect(gpsFixEvent(2, 3)).toEqual({ text: 'GPS lock acquired', priority: 'normal' });
    expect(gpsFixEvent(3, 1)).toEqual({ text: 'GPS lock lost', priority: 'high' });
  });
  it('ignores movement that does not cross the threshold', () => {
    expect(gpsFixEvent(0, 2)).toBeNull();
    expect(gpsFixEvent(4, 6)).toBeNull();
  });
});

describe('lowBatteryEvent', () => {
  it('fires once on the downward crossing', () => {
    expect(lowBatteryEvent(25, 20)).toEqual({ text: 'Battery low', priority: 'high' });
  });
  it('does not re-fire while already low, or on unknown readings', () => {
    expect(lowBatteryEvent(18, 15)).toBeNull();
    expect(lowBatteryEvent(undefined, -1)).toBeNull();
    expect(lowBatteryEvent(50, -1)).toBeNull();
  });
});
