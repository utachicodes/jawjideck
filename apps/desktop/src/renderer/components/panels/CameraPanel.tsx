/**
 * CameraPanel — displays the focused vehicle's video feed, either as an
 * MJPEG multipart stream (plain <img>, no decoding library needed — the
 * original, still-default path) or as WebRTC via a WHEP endpoint (e.g. a
 * companion Pi's MediaMTX instance at http://host:8889/camera/whep) for
 * low-latency H.264/H.265 playback. See use-whep-player.ts for the WHEP
 * negotiation itself.
 */

import { useEffect, useRef, useState } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useCameraStore } from '../../stores/camera-store';
import { mapDetectionToOverlayRect } from './camera-overlay-math';
import { useWhepPlayer } from './use-whep-player';
import { Video, RefreshCw } from 'lucide-react';

type CameraStream =
  | { type: 'mjpeg'; url: string }
  | { type: 'webrtc'; url: string }
  | { type: 'none' };

type StreamProtocol = 'mjpeg' | 'webrtc';

export function CameraPanel() {
  const connectionState = useConnectionStore((s) => s.connectionState);
  const isMavlink = connectionState?.protocol === 'mavlink';

  const [stream, setStream] = useState<CameraStream>({ type: 'none' });
  const [urlInput, setUrlInput] = useState('');
  const [protocol, setProtocol] = useState<StreamProtocol>('mjpeg');
  const [detectedUri, setDetectedUri] = useState<string | null>(null);
  const [streamError, setStreamError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const detections = useCameraStore((s) => s.detections);
  const setStoreStreamUrl = useCameraStore((s) => s.setStreamUrl);
  const clearStoreDetections = useCameraStore((s) => s.clearDetections);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [overlayTick, setOverlayTick] = useState(0); // forces re-measure on resize/load

  const whepUrl = stream.type === 'webrtc' ? stream.url : null;
  const whepPlayer = useWhepPlayer(whepUrl, reloadKey);

  useEffect(() => {
    if (videoRef.current && whepPlayer.stream) {
      videoRef.current.srcObject = whepPlayer.stream;
    }
  }, [whepPlayer.stream]);

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

  const handleUseUrl = (url: string, useProtocol: StreamProtocol = protocol) => {
    setStreamError(false);
    if (useProtocol === 'webrtc') {
      // MediaMTX's WHEP endpoint is <path>/whep -- append it if the user
      // (or the pre-filled default) didn't already include it.
      const whep = url.endsWith('/whep') ? url : `${url.replace(/\/$/, '')}/whep`;
      setStream({ type: 'webrtc', url: whep });
      setStoreStreamUrl(whep);
    } else {
      setStream({ type: 'mjpeg', url });
      setStoreStreamUrl(url);
    }
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
    <div className="h-full w-full bg-black flex flex-col relative" data-camera-panel>
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

      {stream.type === 'webrtc' && !streamError && (
        <div className="relative w-full h-full">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
          {whepPlayer.state === 'connecting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <p className="text-xs text-content-secondary">Connecting (WebRTC)…</p>
            </div>
          )}
          {whepPlayer.state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
              <p className="text-sm text-red-400">WebRTC connection failed{whepPlayer.error ? `: ${whepPlayer.error}` : ''}</p>
              <button
                onClick={handleRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface text-content text-xs"
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}
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
              onClick={() => handleUseUrl(detectedUri, 'mjpeg')}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium max-w-full truncate"
              title={detectedUri}
            >
              Detected stream: {detectedUri} — Use this
            </button>
          )}

          <div className="flex flex-col gap-2 w-full max-w-xs">
            <div className="flex items-center justify-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setProtocol('mjpeg')}
                className={`px-2.5 py-1 rounded-lg ${protocol === 'mjpeg' ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'}`}
              >
                MJPEG
              </button>
              <button
                type="button"
                onClick={() => setProtocol('webrtc')}
                className={`px-2.5 py-1 rounded-lg ${protocol === 'webrtc' ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'}`}
              >
                WebRTC
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); if (urlInput.trim()) handleUseUrl(urlInput.trim()); }}
              className="flex items-center gap-2"
            >
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={protocol === 'webrtc' ? 'http://host:8889/camera' : 'http://host:port/stream'}
                className="flex-1 px-2 py-1.5 rounded-lg bg-surface-raised border border-subtle text-content text-xs"
              />
              <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-surface text-content text-xs">
                Go
              </button>
            </form>
            {protocol === 'webrtc' && (
              <p className="text-[10px] text-content-tertiary">
                MediaMTX WHEP endpoint — <code>/whep</code> is appended automatically if you leave it off.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
