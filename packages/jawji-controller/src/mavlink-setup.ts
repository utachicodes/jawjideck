// mavlink-setup.ts
// Automatically installs and configures mavlink-router to bridge a local
// flight controller (UART) to a TCP/UDP endpoint the desktop app can reach.
// Also exposes the TCP port 5760 for direct GCS connections.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { log } from './logs.js';
import { validateDevicePath, validateBaudRate, validatePort, sanitizeSystemdPath } from './validation.js';

const exec = promisify(execFile);

export interface MavlinkRouterStatus {
  installed: boolean;
  running: boolean;
  configPath: string;
  fcDevice: string;
  fcBaud: number;
  udpPort: number;
  tcpPort: number;
  pid: number | null;
}

export interface MavlinkSetupConfig {
  fcDevice?: string;   // default: auto-detect
  fcBaud?: number;     // default: 57600
  udpPort?: number;    // default: 14550
  tcpPort?: number;    // default: 5760
}

const CONFIG_PATH = '/etc/mavlink-router/main.conf';
const SYSTEMD_UNIT = '/etc/systemd/system/mavlink-router.service';

let cachedStatus: { status: MavlinkRouterStatus; timestamp: number } | null = null;
const CACHE_TTL_MS = 10000;

export async function getMavlinkRouterStatus(): Promise<MavlinkRouterStatus> {
  if (cachedStatus && Date.now() - cachedStatus.timestamp < CACHE_TTL_MS) {
    return cachedStatus.status;
  }

  const installed = await isInstalled();
  const running = await isRunning();
  const config = await readConfig();

  const status: MavlinkRouterStatus = {
    installed,
    running,
    configPath: CONFIG_PATH,
    fcDevice: config.fcDevice || '',
    fcBaud: config.fcBaud || 57600,
    udpPort: config.udpPort || 14550,
    tcpPort: config.tcpPort || 5760,
    pid: running ? (await getPid() ?? null) : null,
  };

  cachedStatus = { status, timestamp: Date.now() };
  return status;
}

async function isInstalled(): Promise<boolean> {
  try {
    await exec('which', ['mavlink-routerd']);
    return true;
  } catch {
    return existsSync('/usr/local/bin/mavlink-routerd');
  }
}

async function isRunning(): Promise<boolean> {
  try {
    const { stdout } = await exec('systemctl', ['is-active', 'mavlink-router']);
    return stdout.trim() === 'active';
  } catch {
    // Fallback: check process list
    try {
      await exec('pgrep', ['-x', 'mavlink-routerd']);
      return true;
    } catch {
      return false;
    }
  }
}

async function getPid(): Promise<number | null> {
  try {
    const { stdout } = await exec('pgrep', ['-x', 'mavlink-routerd']);
    const pids = stdout.trim().split('\n').map(Number).filter(n => !isNaN(n));
    return pids.length > 0 ? (pids[0] ?? null) : null;
  } catch {
    return null;
  }
}

async function readConfig(): Promise<{ fcDevice: string; fcBaud: number; udpPort: number; tcpPort: number }> {
  const defaults = { fcDevice: '/dev/serial0', fcBaud: 57600, udpPort: 14550, tcpPort: 5760 };
  try {
    const content = await readFile(CONFIG_PATH, 'utf-8');
    const fcDevice = content.match(/Device\s*=\s*(.+)/)?.[1]?.trim() || defaults.fcDevice;
    const fcBaud = parseInt(content.match(/Baud\s*=\s*(\d+)/)?.[1] || String(defaults.fcBaud), 10);
    const udpPort = parseInt(content.match(/Port\s*=\s*(\d+)/)?.[1] || String(defaults.udpPort), 10);
    const tcpPort = parseInt(content.match(/TcpServerPort\s*=\s*(\d+)/)?.[1] || String(defaults.tcpPort), 10);
    return { fcDevice, fcBaud, udpPort, tcpPort };
  } catch {
    return defaults;
  }
}

export async function installMavlinkRouter(fcDevice: string, fcBaud: number, udpPort: number, tcpPort: number): Promise<{ success: boolean; error?: string }> {
  // Validate inputs before writing to any config/systemd file
  const validDevice = validateDevicePath(fcDevice, 'serial');
  const validBaud = validateBaudRate(fcBaud);
  const validUdp = validatePort(udpPort);
  const validTcp = validatePort(tcpPort);
  if (!validDevice) return { success: false, error: `Invalid FC device path: ${fcDevice}` };
  if (!validBaud) return { success: false, error: `Invalid baud rate: ${fcBaud}` };
  if (!validUdp) return { success: false, error: `Invalid UDP port: ${udpPort}` };
  if (!validTcp) return { success: false, error: `Invalid TCP port: ${tcpPort}` };
  // Additional systemd-safe sanitization
  if (!sanitizeSystemdPath(validDevice)) return { success: false, error: `Device path contains unsafe characters` };

  log.info(`Installing mavlink-router: ${validDevice} @ ${validBaud} -> UDP :${validUdp} TCP :${validTcp}`);

  try {
    // Build from source (no prebuilt packages exist)
    await exec('apt-get', ['install', '-y', '-qq', 'git', 'build-essential', 'pkg-config', 'ninja-build', 'meson', 'libsystemd-dev']);

    if (!await isInstalled()) {
      log.info('Building mavlink-router from source...');
      const buildDir = `/tmp/mavlink-router-build-${Date.now()}`;
      await exec('git', ['clone', '--depth', '1', 'https://github.com/mavlink-router/mavlink-router.git', buildDir]);
      await exec('git', ['-C', buildDir, 'submodule', 'update', '--init', '--recursive']);
      await exec('meson', ['setup', `${buildDir}/build`, buildDir]);
      await exec('ninja', ['-C', `${buildDir}/build`]);
      await exec('ninja', ['-C', `${buildDir}/build`, 'install']);
      await exec('rm', ['-rf', buildDir]);
      log.info('mavlink-router built and installed');
    }

    // Write config
    await mkdir('/etc/mavlink-router', { recursive: true });
    const config = `[General]
TcpServerPort = ${tcpPort}
ReportStats = false

[UartEndpoint fc]
Device = ${fcDevice}
Baud = ${fcBaud}

[UdpEndpoint gcs]
Mode = Server
Address = 0.0.0.0
Port = ${udpPort}
`;
    await writeFile(CONFIG_PATH, config);

    // Write systemd unit
    const unit = `[Unit]
Description=mavlink-router
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/mavlink-routerd -c ${CONFIG_PATH}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
    await writeFile(SYSTEMD_UNIT, unit);

    // Enable and start
    await exec('systemctl', ['daemon-reload']);
    await exec('systemctl', ['enable', 'mavlink-router']);
    await exec('systemctl', ['restart', 'mavlink-router']);

    // Verify it started
    await new Promise(r => setTimeout(r, 1000));
    if (await isRunning()) {
      log.info('mavlink-router installed and running');
      cachedStatus = null;
      return { success: true };
    } else {
      return { success: false, error: 'mavlink-router installed but failed to start' };
    }
  } catch (err) {
    const msg = (err as Error).message;
    log.error(`mavlink-router install failed: ${msg}`);
    return { success: false, error: msg };
  }
}

export async function configureMavlinkRouter(config: MavlinkSetupConfig): Promise<{ success: boolean; error?: string }> {
  const current = await getMavlinkRouterStatus();
  const fcDevice = config.fcDevice || current.fcDevice || '/dev/serial0';
  const fcBaud = config.fcBaud || current.fcBaud || 57600;
  const udpPort = config.udpPort || current.udpPort || 14550;
  const tcpPort = config.tcpPort || current.tcpPort || 5760;

  // Validate all values before they touch any file or shell command
  const validDevice = validateDevicePath(fcDevice, 'serial');
  const validBaud = validateBaudRate(fcBaud);
  const validUdp = validatePort(udpPort);
  const validTcp = validatePort(tcpPort);
  if (!validDevice) return { success: false, error: `Invalid FC device path: ${fcDevice}` };
  if (!validBaud) return { success: false, error: `Invalid baud rate: ${fcBaud}` };
  if (!validUdp) return { success: false, error: `Invalid UDP port: ${udpPort}` };
  if (!validTcp) return { success: false, error: `Invalid TCP port: ${tcpPort}` };
  if (!sanitizeSystemdPath(validDevice)) return { success: false, error: `Device path contains unsafe characters` };

  if (!current.installed) {
    return installMavlinkRouter(validDevice, validBaud, validUdp, validTcp);
  }

  // Update config and restart
  log.info(`Reconfiguring mavlink-router: ${validDevice} @ ${validBaud} -> UDP :${validUdp} TCP :${validTcp}`);
  try {
    await mkdir('/etc/mavlink-router', { recursive: true });
    const configContent = `[General]
TcpServerPort = ${validTcp}
ReportStats = false

[UartEndpoint fc]
Device = ${validDevice}
Baud = ${validBaud}

[UdpEndpoint gcs]
Mode = Server
Address = 0.0.0.0
Port = ${validUdp}
`;
    await writeFile(CONFIG_PATH, configContent);
    await exec('systemctl', ['restart', 'mavlink-router']);

    await new Promise(r => setTimeout(r, 1000));
    cachedStatus = null;
    if (await isRunning()) {
      return { success: true };
    }
    return { success: false, error: 'Config updated but mavlink-router failed to restart' };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function stopMavlinkRouter(): Promise<{ success: boolean; error?: string }> {
  try {
    await exec('systemctl', ['stop', 'mavlink-router']);
    cachedStatus = null;
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export function invalidateMavlinkCache(): void {
  cachedStatus = null;
}
