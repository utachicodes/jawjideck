// mediamtx-setup.ts
// Automatically installs and configures MediaMTX for camera streaming.
// Detects connected cameras, installs MediaMTX binary, and sets up
// systemd service with WebRTC/RTSP/HLS output.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { log } from './logs.js';
import { validateDevicePath, validatePort, sanitizeSystemdPath } from './validation.js';

const exec = promisify(execFile);

export interface CameraDevice {
  path: string;
  name: string;
  driver: string;
  resolution?: string;
}

export interface MediaMtxSetupStatus {
  installed: boolean;
  running: boolean;
  cameras: CameraDevice[];
  configPath: string;
  rtspPort: number;
  webrtcPort: number;
  hlsPort: number;
  rtmpPort: number;
  apiPort: number;
  activeStreams: number;
}

export interface MediaMtxSetupConfig {
  cameraDevice?: string;    // default: auto-detect
  rtspPort?: number;        // default: 8554
  webrtcPort?: number;      // default: 8889
  hlsPort?: number;         // default: 8888
  rtmpPort?: number;        // default: 1935
  apiPort?: number;         // default: 9997
  publishCamera?: boolean;  // default: true
}

const CONFIG_PATH = '/etc/mediamtx/mediamtx.yml';
const SYSTEMD_UNIT = '/etc/systemd/system/mediamtx.service';
const CAMERA_SERVICE = '/etc/systemd/system/jawji-camera-publish.service';

let cachedStatus: { status: MediaMtxSetupStatus; timestamp: number } | null = null;
const CACHE_TTL_MS = 10000;

export async function getMediaMtxSetupStatus(): Promise<MediaMtxSetupStatus> {
  if (cachedStatus && Date.now() - cachedStatus.timestamp < CACHE_TTL_MS) {
    return cachedStatus.status;
  }

  const installed = await isMtxInstalled();
  const running = await isMtxRunning();
  const cameras = await detectCameras();
  const ports = await readMtxConfig();
  const activeStreams = running ? await countStreams() : 0;

  const status: MediaMtxSetupStatus = {
    installed,
    running,
    cameras,
    configPath: CONFIG_PATH,
    ...ports,
    activeStreams,
  };

  cachedStatus = { status, timestamp: Date.now() };
  return status;
}

async function isMtxInstalled(): Promise<boolean> {
  return existsSync('/usr/local/bin/mediamtx');
}

async function isMtxRunning(): Promise<boolean> {
  try {
    const { stdout } = await exec('systemctl', ['is-active', 'mediamtx']);
    return stdout.trim() === 'active';
  } catch {
    try {
      await exec('pgrep', ['-x', 'mediamtx']);
      return true;
    } catch {
      return false;
    }
  }
}

export async function detectCameras(): Promise<CameraDevice[]> {
  const cameras: CameraDevice[] = [];
  const videoDir = '/dev';

  try {
    const entries = await readdir(videoDir);
    for (const entry of entries) {
      if (!entry.startsWith('video')) continue;
      const path = `${videoDir}/${entry}`;
      try {
        const { stdout } = await exec('udevadm', ['info', '--query=property', '--name', path]);
        const driver = stdout.match(/ID_V4L_MODULES=(.+)/)?.[1]?.trim() || 'unknown';
        const name = stdout.match(/ID_MODEL=(.+)/)?.[1]?.trim() || entry;

        // Skip virtual devices
        if (driver.includes('vim2m') || driver.includes('vivid') || name.includes('Virtual')) continue;

        cameras.push({ path, name, driver });
      } catch {
        // Can't query udev — still try to use it
        cameras.push({ path, name: entry, driver: 'unknown' });
      }
    }
  } catch {
    // /dev not readable
  }

  return cameras;
}

async function readMtxConfig(): Promise<{ rtspPort: number; webrtcPort: number; hlsPort: number; rtmpPort: number; apiPort: number }> {
  const defaults = { rtspPort: 8554, webrtcPort: 8889, hlsPort: 8888, rtmpPort: 1935, apiPort: 9997 };
  try {
    const content = await readFile(CONFIG_PATH, 'utf-8');
    return {
      rtspPort: parseInt(content.match(/rtspAddress: :(\\d+)/)?.[1] || String(defaults.rtspPort), 10),
      webrtcPort: parseInt(content.match(/webrtcAddress: :(\\d+)/)?.[1] || String(defaults.webrtcPort), 10),
      hlsPort: parseInt(content.match(/hlsAddress: :(\\d+)/)?.[1] || String(defaults.hlsPort), 10),
      rtmpPort: parseInt(content.match(/rtmpAddress: :(\\d+)/)?.[1] || String(defaults.rtmpPort), 10),
      apiPort: parseInt(content.match(/apiAddress: 127.0.0.1:(\\d+)/)?.[1] || String(defaults.apiPort), 10),
    };
  } catch {
    return defaults;
  }
}

async function countStreams(): Promise<number> {
  try {
    const res = await fetch('http://127.0.0.1:9997/v3/paths/list', { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return 0;
    const data = (await res.json()) as { items: Array<{ readers: unknown[] }> };
    return data.items.reduce((sum, p) => sum + p.readers.length, 0);
  } catch {
    return 0;
  }
}

export async function installMediaMTX(cameraDevice: string, config: MediaMtxSetupConfig): Promise<{ success: boolean; error?: string }> {
  // Validate camera device before proceeding
  if (cameraDevice) {
    const valid = validateDevicePath(cameraDevice, 'video');
    if (!valid) return { success: false, error: `Invalid camera device path: ${cameraDevice}` };
  }
  // Validate all ports
  if (config.rtspPort && !validatePort(config.rtspPort)) return { success: false, error: `Invalid RTSP port` };
  if (config.webrtcPort && !validatePort(config.webrtcPort)) return { success: false, error: `Invalid WebRTC port` };
  if (config.hlsPort && !validatePort(config.hlsPort)) return { success: false, error: `Invalid HLS port` };
  if (config.rtmpPort && !validatePort(config.rtmpPort)) return { success: false, error: `Invalid RTMP port` };
  if (config.apiPort && !validatePort(config.apiPort)) return { success: false, error: `Invalid API port` };

  log.info(`Installing MediaMTX for camera: ${cameraDevice || '(none)'}`);

  try {
    // Detect architecture
    const { stdout: archRaw } = await exec('uname', ['-m']);
    let arch: string;
    switch (archRaw.trim()) {
      case 'x86_64': arch = 'amd64'; break;
      case 'aarch64': arch = 'arm64'; break;
      case 'armv7l': arch = 'armv7'; break;
      default: return { success: false, error: `Unsupported architecture: ${archRaw.trim()}` };
    }

    // Get latest version
    const versionRes = await fetch('https://api.github.com/repos/bluenviron/mediamtx/releases/latest', { signal: AbortSignal.timeout(10000) });
    if (!versionRes.ok) return { success: false, error: 'Could not fetch MediaMTX version from GitHub' };
    const versionData = await versionRes.json() as { tag_name: string };
    const version = versionData.tag_name.replace(/^v/, '');

    const asset = `mediamtx_${version}_linux_${arch}.tar.gz`;
    const tmpDir = `/tmp/mediamtx-install-${Date.now()}`;

    // Download and extract
    await mkdir(tmpDir, { recursive: true });
    await exec('curl', ['-fsSL', `https://github.com/bluenviron/mediamtx/releases/download/v${version}/${asset}`, '-o', `${tmpDir}/mediamtx.tar.gz`]);
    await exec('tar', ['-xzf', `${tmpDir}/mediamtx.tar.gz`, '-C', tmpDir]);
    await exec('install', ['-m', '755', `${tmpDir}/mediamtx`, '/usr/local/bin/mediamtx']);
    await mkdir('/etc/mediamtx', { recursive: true });

    if (!existsSync(CONFIG_PATH)) {
      const { stdout } = await exec('ls', [`${tmpDir}/mediamtx.yml`]);
      if (stdout.trim()) {
        await exec('install', ['-m', '644', `${tmpDir}/mediamtx.yml`, CONFIG_PATH]);
      }
    }
    await exec('rm', ['-rf', tmpDir]);

    // Write config
    const rtspPort = config.rtspPort || 8554;
    const webrtcPort = config.webrtcPort || 8889;
    const hlsPort = config.hlsPort || 8888;
    const rtmpPort = config.rtmpPort || 1935;
    const apiPort = config.apiPort || 9997;

    const mtxConfig = `# Jawji MediaMTX config (auto-generated by controller)
api: yes
apiAddress: 127.0.0.1:${apiPort}
rtsp: yes
rtspAddress: :${rtspPort}
rtmp: yes
rtmpAddress: :${rtmpPort}
hls: yes
hlsAddress: :${hlsPort}
hlsVariant: lowLatency
hlsSegmentCount: 2
hlsSegmentDuration: 200ms
webrtc: yes
webrtcAddress: :${webrtcPort}
webrtcICEServers2:
  - url: stun:stun.l.google.com:19302
logLevel: info
logDestinations: [stdout]

paths:
  camera: {}
`;
    await writeFile(CONFIG_PATH, mtxConfig);

    // Write systemd unit
    const unit = `[Unit]
Description=MediaMTX media server
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/mediamtx ${CONFIG_PATH}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
    await writeFile(SYSTEMD_UNIT, unit);

    // Enable and start
    await exec('systemctl', ['daemon-reload']);
    await exec('systemctl', ['enable', 'mediamtx']);
    await exec('systemctl', ['restart', 'mediamtx']);

    // Set up camera publisher if a camera is connected
    if (cameraDevice && (config.publishCamera !== false)) {
      await setupCameraPublish(cameraDevice, rtspPort);
    }

    await new Promise(r => setTimeout(r, 1000));
    if (await isMtxRunning()) {
      log.info(`MediaMTX installed and running (RTSP :${rtspPort}, WebRTC :${webrtcPort}, HLS :${hlsPort})`);
      cachedStatus = null;
      return { success: true };
    } else {
      return { success: false, error: 'MediaMTX installed but failed to start' };
    }
  } catch (err) {
    const msg = (err as Error).message;
    log.error(`MediaMTX install failed: ${msg}`);
    return { success: false, error: msg };
  }
}

async function setupCameraPublish(cameraDevice: string, rtspPort: number): Promise<void> {
  // Validate camera device path before writing to systemd unit
  const validCamera = validateDevicePath(cameraDevice, 'video');
  const validPort = validatePort(rtspPort);
  if (!validCamera) { log.warn(`Invalid camera device path: ${cameraDevice}`); return; }
  if (!validPort) { log.warn(`Invalid RTSP port: ${rtspPort}`); return; }
  // systemd ExecStart needs strict path sanitization
  if (!sanitizeSystemdPath(validCamera)) { log.warn(`Camera path contains unsafe characters`); return; }

  try {
    // Install ffmpeg if needed
    try { await exec('which', ['ffmpeg']); } catch {
      await exec('apt-get', ['install', '-y', '-qq', 'ffmpeg']);
    }

    const unit = `[Unit]
Description=Publish ${validCamera} into MediaMTX
After=mediamtx.service
Requires=mediamtx.service

[Service]
Type=simple
ExecStart=/usr/bin/ffmpeg -f v4l2 -framerate 30 -video_size 1280x720 -i ${validCamera} -c:v libx264 -preset ultrafast -tune zerolatency -f rtsp rtsp://127.0.0.1:${validPort}/camera
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
    await writeFile(CAMERA_SERVICE, unit);
    await exec('systemctl', ['daemon-reload']);
    await exec('systemctl', ['enable', 'jawji-camera-publish']);
    await exec('systemctl', ['restart', 'jawji-camera-publish']);
    log.info(`Camera publisher configured: ${cameraDevice} -> MediaMTX :${rtspPort}/camera`);
  } catch (err) {
    log.warn(`Camera publisher setup failed: ${(err as Error).message}`);
  }
}

export async function configureMediaMTX(config: MediaMtxSetupConfig): Promise<{ success: boolean; error?: string }> {
  const current = await getMediaMtxSetupStatus();
  const cameraDevice = config.cameraDevice || current.cameras[0]?.path || '';

  // Validate all values before they touch any file
  if (cameraDevice) {
    const valid = validateDevicePath(cameraDevice, 'video');
    if (!valid) return { success: false, error: `Invalid camera device path: ${cameraDevice}` };
  }
  if (config.rtspPort && !validatePort(config.rtspPort)) return { success: false, error: `Invalid RTSP port` };
  if (config.webrtcPort && !validatePort(config.webrtcPort)) return { success: false, error: `Invalid WebRTC port` };
  if (config.hlsPort && !validatePort(config.hlsPort)) return { success: false, error: `Invalid HLS port` };
  if (config.rtmpPort && !validatePort(config.rtmpPort)) return { success: false, error: `Invalid RTMP port` };
  if (config.apiPort && !validatePort(config.apiPort)) return { success: false, error: `Invalid API port` };

  if (!current.installed) {
    return installMediaMTX(cameraDevice, config);
  }

  // Reconfigure existing installation
  log.info('Reconfiguring MediaMTX...');
  try {
    const rtspPort = config.rtspPort || current.rtspPort;
    const webrtcPort = config.webrtcPort || current.webrtcPort;
    const hlsPort = config.hlsPort || current.hlsPort;
    const rtmpPort = config.rtmpPort || current.rtmpPort;
    const apiPort = config.apiPort || current.apiPort;

    const mtxConfig = `# Jawji MediaMTX config (auto-generated by controller)
api: yes
apiAddress: 127.0.0.1:${apiPort}
rtsp: yes
rtspAddress: :${rtspPort}
rtmp: yes
rtmpAddress: :${rtmpPort}
hls: yes
hlsAddress: :${hlsPort}
hlsVariant: lowLatency
hlsSegmentCount: 2
hlsSegmentDuration: 200ms
webrtc: yes
webrtcAddress: :${webrtcPort}
webrtcICEServers2:
  - url: stun:stun.l.google.com:19302
logLevel: info
logDestinations: [stdout]

paths:
  camera: {}
`;
    await writeFile(CONFIG_PATH, mtxConfig);
    await exec('systemctl', ['restart', 'mediamtx']);

    if (cameraDevice && (config.publishCamera !== false)) {
      await setupCameraPublish(cameraDevice, rtspPort);
    }

    cachedStatus = null;
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function stopMediaMTX(): Promise<{ success: boolean; error?: string }> {
  try {
    try { await exec('systemctl', ['stop', 'jawji-camera-publish']); } catch { /* may not exist */ }
    await exec('systemctl', ['stop', 'mediamtx']);
    cachedStatus = null;
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export function invalidateMtxCache(): void {
  cachedStatus = null;
}
