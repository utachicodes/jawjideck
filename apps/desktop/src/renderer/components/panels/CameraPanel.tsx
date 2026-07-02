/**
 * CameraPanel — displays the focused vehicle's MJPEG video feed. The stream
 * source is either a manually-entered URL or a MAVLink-advertised one
 * (VIDEO_STREAM_INFORMATION, requested on mount for MAVLink vehicles).
 *
 * MJPEG-only by design: an MJPEG multipart stream renders natively in a
 * plain <img> tag, frame by frame, with no decoding library needed. RTSP/
 * H.264 support would need ffmpeg transcoding and is a deliberately separate
 * future addition — see docs/superpowers/specs/2026-07-02-camera-feed-design.md.
 */

import { useEffect, useRef, useState } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useCameraStore } from '../../stores/camera-store';
import { mapDetectionToOverlayRect } from './camera-overlay-math';
import { Video, RefreshCw } from 'lucide-react';

type CameraStream =
  | { type: 'mjpeg'; url: string }
  | { type: 'none' };

export function CameraPanel() {
  const connectionState = useConnectionStore((s) => s.connectionState);
  const isMavlink = connectionState?.protocol === 'mavlink';

  const [stream, setStream] = useState<CameraStream>({ type: 'none' });
  const [urlInput, setUrlInput] = useState('');
  const [detectedUri, setDetectedUri] = useState<string | null>(null);
  const [streamError, setStreamError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const detections = useCameraStore((s) => s.detections);
  const setStoreStreamUrl = useCameraStore((s) => s.setStreamUrl);
  const clearStoreDetections = useCameraStore((s) => s.clearDetections);
  const imgRef = useRef<HTMLImageElement>(null);
  const [overlayTick, setOverlayTick] = useState(0); // forces re-measure on resize/load

  // Request MAVLink auto-detection once per mount, for MAVLink vehicles only.
  useEffect(() => {
    if (!isMavlink || !connectionState.isConnected) return;
    window.electronAPI.mavlinkRequestVideoStreamInfo?.().catch(() => undefined);
  }, [isMavlink, connectionState.isConnected]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onVideoStreamInfo?.((info) => {
      setDetectedUri(info.uri);
    });
    return () => { unsubscribe?.(); };
  }, []);

  const handleUseUrl = (url: string) => {
    setStreamError(false);
    setStream({ type: 'mjpeg', url });
    setStoreStreamUrl(url);
  };

  const handleRetry = () => {
    setStreamError(false);
    setReloadKey((k) => k + 1);
  };

  // Clear the shared camera store when this panel instance unmounts, so a
  // stale module doesn't keep drawing boxes over nothing.
  useEffect(() => {
    return () => {
      setStoreStreamUrl(null);
      clearStoreDetections();
    };
  }, [setStoreStreamUrl, clearStoreDetections]);

  // Re-measure the overlay when the panel is resized or popped out.
  useEffect(() => {
    if (!imgRef.current) return;
    const observer = new ResizeObserver(() => setOverlayTick((t) => t + 1));
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [stream.type]);

  return (
    <div className="h-full w-full bg-black flex flex-col relative">
      {stream.type === 'mjpeg' && !streamError && (
        <div className="relative w-full h-full">
          <img
            ref={imgRef}
            key={reloadKey}
            src={stream.url}
            onError={() => setStreamError(true)}
            onLoad={() => setOverlayTick((t) => t + 1)}
            className="w-full h-full object-contain"
            alt="Vehicle camera feed"
          />
          {imgRef.current?.naturalWidth ? (
            <svg
              key={overlayTick}
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              {detections.map((d, i) => {
                const rect = mapDetectionToOverlayRect(
                  d,
                  { width: imgRef.current!.naturalWidth, height: imgRef.current!.naturalHeight },
                  { width: imgRef.current!.clientWidth, height: imgRef.current!.clientHeight },
                );
                return (
                  <g key={i}>
                    <rect
                      x={rect.left} y={rect.top} width={rect.width} height={rect.height}
                      fill="none" stroke="#22d3ee" strokeWidth={2}
                    />
                    <text
                      x={rect.left} y={Math.max(12, rect.top - 4)}
                      fill="#22d3ee" fontSize={12} fontFamily="monospace"
                    >
                      {d.label} {(d.confidence * 100).toFixed(0)}%
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : null}
        </div>
      )}

      {(stream.type === 'none' || streamError) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <Video className="w-10 h-10 text-content-tertiary" />

          {streamError && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-red-400">Stream unavailable</p>
              <button
                onClick={handleRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface text-content text-xs"
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}

          {detectedUri && (
            <button
              onClick={() => handleUseUrl(detectedUri)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium max-w-full truncate"
              title={detectedUri}
            >
              Detected stream: {detectedUri} — Use this
            </button>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); if (urlInput.trim()) handleUseUrl(urlInput.trim()); }}
            className="flex items-center gap-2 w-full max-w-xs"
          >
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="http://host:port/stream"
              className="flex-1 px-2 py-1.5 rounded-lg bg-surface-raised border border-subtle text-content text-xs"
            />
            <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-surface text-content text-xs">
              Go
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
