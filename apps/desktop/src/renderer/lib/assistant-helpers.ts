import { useTelemetryStore } from '../stores/telemetry-store';
import { useMissionStore } from '../stores/mission-store';
import { useConnectionStore } from '../stores/connection-store';

/**
 * Snapshot the current drone state into a structured JSON object for the
 * VLM. This is what the assistant "sees" — make it rich enough for the
 * model to answer position, heading, speed, altitude, waypoint, and
 * status questions.
 */
export function buildTelemetryContext(): Record<string, unknown> {
  const telemetry = useTelemetryStore.getState();
  const mission = useMissionStore.getState();
  const connection = useConnectionStore.getState();

  return {
    position: {
      lat: telemetry.position.lat,
      lon: telemetry.position.lon,
      alt: telemetry.position.alt,
      relativeAlt: telemetry.position.relativeAlt,
      vx: telemetry.position.vx,
      vy: telemetry.position.vy,
      vz: telemetry.position.vz,
    },
    attitude: {
      roll: telemetry.attitude.roll,
      pitch: telemetry.attitude.pitch,
      yaw: telemetry.attitude.yaw,
    },
    vfrHud: {
      airspeed: telemetry.vfrHud.airspeed,
      groundspeed: telemetry.vfrHud.groundspeed,
      heading: telemetry.vfrHud.heading,
      throttle: telemetry.vfrHud.throttle,
      alt: telemetry.vfrHud.alt,
      climb: telemetry.vfrHud.climb,
    },
    battery: {
      voltage: telemetry.battery.voltage,
      current: telemetry.battery.current,
      remaining: telemetry.battery.remaining,
    },
    flight: {
      mode: telemetry.flight.mode,
      armed: telemetry.flight.armed,
      isFlying: telemetry.flight.isFlying,
    },
    gps: {
      fixType: telemetry.gps.fixType,
      satellites: telemetry.gps.satellites,
      hdop: telemetry.gps.hdop,
    },
    wind: telemetry.wind ? {
      direction: telemetry.wind.direction,
      speed: telemetry.wind.speed,
    } : null,
    homePosition: mission.homePosition,
    currentWaypoint: mission.currentSeq,
    totalWaypoints: mission.missionItems.length,
    connection: {
      protocol: connection.connectionState?.protocol,
      fcVariant: connection.connectionState?.fcVariant,
      vehicleType: connection.connectionState?.vehicleType,
    },
  };
}

/**
 * Capture a JPEG frame from the CameraPanel's DOM elements.
 * Looks for a <video> (WebRTC) or <img> (MJPEG) element inside the
 * CameraPanel container. Returns base64 JPEG data or null if no
 * camera stream is active.
 */
export function captureCameraFrame(): string | null {
  // Try WebRTC video element first (higher quality)
  const video = document.querySelector('[data-camera-panel] video') as HTMLVideoElement | null;
  if (video && video.readyState >= 2 && video.videoWidth > 0) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1] || null;
    }
  }

  // Fall back to MJPEG img element
  const img = document.querySelector('[data-camera-panel] img') as HTMLImageElement | null;
  if (img && img.complete && img.naturalWidth > 0) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1] || null;
    }
  }

  return null;
}
