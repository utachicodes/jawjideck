import { describe, expect, it } from 'vitest';
import { mapDetectionToOverlayRect } from './camera-overlay-math';

describe('mapDetectionToOverlayRect', () => {
  it('maps a detection with no letterboxing (matching aspect ratios)', () => {
    // 16:9 frame in a 16:9 element — content fills the element exactly.
    const detection = { label: 'person', confidence: 0.9, x1: 0.25, y1: 0.25, x2: 0.75, y2: 0.75 };
    const naturalSize = { width: 1280, height: 720 };
    const elementRect = { width: 640, height: 360 };

    const result = mapDetectionToOverlayRect(detection, naturalSize, elementRect);

    expect(result.left).toBeCloseTo(160, 1); // 0.25 * 640
    expect(result.top).toBeCloseTo(90, 1);   // 0.25 * 360
    expect(result.width).toBeCloseTo(320, 1); // 0.5 * 640
    expect(result.height).toBeCloseTo(180, 1); // 0.5 * 360
  });

  it('accounts for horizontal letterboxing (tall element, wide frame)', () => {
    // 16:9 frame (1280x720) inside a taller-than-wide 400x400 element:
    // content renders at 400x225, vertically centered, with bars top/bottom.
    const detection = { label: 'car', confidence: 0.8, x1: 0, y1: 0, x2: 1, y2: 1 };
    const naturalSize = { width: 1280, height: 720 };
    const elementRect = { width: 400, height: 400 };

    const result = mapDetectionToOverlayRect(detection, naturalSize, elementRect);

    expect(result.width).toBeCloseTo(400, 1);
    expect(result.height).toBeCloseTo(225, 1);
    expect(result.left).toBeCloseTo(0, 1);
    expect(result.top).toBeCloseTo(87.5, 1); // (400 - 225) / 2
  });

  it('accounts for vertical letterboxing (wide element, tall-relative frame)', () => {
    // 4:3 frame (640x480) inside a very wide 800x300 element:
    // content renders at 400x300, horizontally centered, with bars left/right.
    const detection = { label: 'box', confidence: 0.7, x1: 0, y1: 0, x2: 1, y2: 1 };
    const naturalSize = { width: 640, height: 480 };
    const elementRect = { width: 800, height: 300 };

    const result = mapDetectionToOverlayRect(detection, naturalSize, elementRect);

    expect(result.width).toBeCloseTo(400, 1);
    expect(result.height).toBeCloseTo(300, 1);
    expect(result.left).toBeCloseTo(200, 1); // (800 - 400) / 2
    expect(result.top).toBeCloseTo(0, 1);
  });
});
