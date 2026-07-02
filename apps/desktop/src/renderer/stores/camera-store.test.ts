import { describe, expect, it, beforeEach } from 'vitest';
import { useCameraStore } from './camera-store';

describe('camera-store', () => {
  beforeEach(() => {
    useCameraStore.setState({ streamUrl: null, detections: [] });
  });

  it('starts with no stream and no detections', () => {
    expect(useCameraStore.getState().streamUrl).toBeNull();
    expect(useCameraStore.getState().detections).toEqual([]);
  });

  it('sets the stream URL', () => {
    useCameraStore.getState().setStreamUrl('http://192.168.1.50:8080/?action=stream');
    expect(useCameraStore.getState().streamUrl).toBe('http://192.168.1.50:8080/?action=stream');
  });

  it('sets detections', () => {
    const detections = [{ label: 'person', confidence: 0.92, x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.6 }];
    useCameraStore.getState().setDetections(detections);
    expect(useCameraStore.getState().detections).toEqual(detections);
  });

  it('clears detections without touching streamUrl', () => {
    useCameraStore.getState().setStreamUrl('http://x/stream');
    useCameraStore.getState().setDetections([{ label: 'car', confidence: 0.8, x1: 0, y1: 0, x2: 1, y2: 1 }]);
    useCameraStore.getState().clearDetections();
    expect(useCameraStore.getState().detections).toEqual([]);
    expect(useCameraStore.getState().streamUrl).toBe('http://x/stream');
  });
});
