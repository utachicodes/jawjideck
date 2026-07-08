/**
 * useWhepPlayer — connects to a WHEP (WebRTC-HTTP Egress Protocol) endpoint,
 * the standard MediaMTX exposes for WebRTC playback at
 * `http://<host>:8889/<path>/whep`. Non-trickle: gathers all ICE candidates
 * locally before sending the offer, gets one full answer back — simpler and
 * more broadly compatible than trickle ICE, at the cost of a slightly
 * longer initial connect (bounded by iceGatheringTimeoutMs).
 *
 * Returns a MediaStream once connected, attach it to a <video> element's
 * srcObject. Cleans up the peer connection (and, best-effort, the WHEP
 * resource on the server) on unmount or when the URL changes.
 */
import { useEffect, useRef, useState } from 'react';

export type WhepPlayerState = 'idle' | 'connecting' | 'connected' | 'error';

interface UseWhepPlayerResult {
  state: WhepPlayerState;
  stream: MediaStream | null;
  error: string | null;
}

const ICE_GATHERING_TIMEOUT_MS = 4000;

function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    }, ICE_GATHERING_TIMEOUT_MS);
    function check() {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    }
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export function useWhepPlayer(whepUrl: string | null, retryKey: number = 0): UseWhepPlayerResult {
  const [state, setState] = useState<WhepPlayerState>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const resourceUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!whepUrl) {
      setState('idle');
      setStream(null);
      return;
    }

    let cancelled = false;
    setState('connecting');
    setError(null);
    setStream(null);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (event) => {
      if (cancelled) return;
      setStream(event.streams[0] ?? new MediaStream([event.track]));
      setState('connected');
    };

    pc.oniceconnectionstatechange = () => {
      if (cancelled) return;
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        setState('error');
        setError('WebRTC connection lost');
      }
    };

    (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceGatheringComplete(pc);
        if (cancelled) return;

        const res = await fetch(whepUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription!.sdp,
        });
        if (!res.ok) throw new Error(`WHEP negotiation failed: HTTP ${res.status}`);

        const location = res.headers.get('Location');
        if (location) {
          resourceUrlRef.current = new URL(location, whepUrl).toString();
        }

        const answerSdp = await res.text();
        if (cancelled) return;
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      } catch (err) {
        if (cancelled) return;
        setState('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      pc.close();
      pcRef.current = null;
      // Best-effort: tell the server we're done, per the WHEP spec. Fine if
      // this fails silently (network already torn down, server restarted).
      if (resourceUrlRef.current) {
        fetch(resourceUrlRef.current, { method: 'DELETE' }).catch(() => undefined);
        resourceUrlRef.current = null;
      }
    };
    // retryKey is intentionally in the dependency array with no other use:
    // bumping it forces a fresh connection attempt against the same URL.
  }, [whepUrl, retryKey]);

  return { state, stream, error };
}
