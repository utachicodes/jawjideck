import { create } from 'zustand';
import type { CameraDetection } from '@jawji/module-sdk';

interface CameraStore {
  streamUrl: string | null;
  detections: CameraDetection[];

  setStreamUrl: (url: string | null) => void;
  setDetections: (detections: CameraDetection[]) => void;
  clearDetections: () => void;
}

export const useCameraStore = create<CameraStore>((set) => ({
  streamUrl: null,
  detections: [],

  setStreamUrl: (url) => set({ streamUrl: url }),
  setDetections: (detections) => set({ detections }),
  clearDetections: () => set({ detections: [] }),
}));
