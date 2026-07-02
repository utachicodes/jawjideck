import type { CameraDetection } from '@jawji/module-sdk';

export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

/**
 * Maps a normalized detection box (0-1, relative to the source video frame)
 * into pixel coordinates relative to the top-left of an `<img>` element that
 * displays that frame with `object-contain` (which letterboxes/pillarboxes
 * when the frame's aspect ratio doesn't match the element's).
 */
export function mapDetectionToOverlayRect(
  detection: CameraDetection,
  naturalSize: Size,
  elementRect: Size,
): OverlayRect {
  const frameAspect = naturalSize.width / naturalSize.height;
  const elementAspect = elementRect.width / elementRect.height;

  let contentWidth: number;
  let contentHeight: number;

  if (frameAspect > elementAspect) {
    // Frame is relatively wider than the element -> full width, letterboxed top/bottom.
    contentWidth = elementRect.width;
    contentHeight = elementRect.width / frameAspect;
  } else {
    // Frame is relatively taller than the element -> full height, pillarboxed left/right.
    contentHeight = elementRect.height;
    contentWidth = elementRect.height * frameAspect;
  }

  const offsetX = (elementRect.width - contentWidth) / 2;
  const offsetY = (elementRect.height - contentHeight) / 2;

  return {
    left: offsetX + detection.x1 * contentWidth,
    top: offsetY + detection.y1 * contentHeight,
    width: (detection.x2 - detection.x1) * contentWidth,
    height: (detection.y2 - detection.y1) * contentHeight,
  };
}
