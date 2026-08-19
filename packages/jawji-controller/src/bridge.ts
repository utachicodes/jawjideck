// bridge.ts
// Auto-configures the TCP/UDP bridge so the desktop app can connect
// to the flight controller without manual network setup.
// Bridges: FC UART -> mavlink-router -> UDP:14550 + TCP:5760
// Also sets up a UDP proxy for the desktop app's GCS connection.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { log } from './logs.js';
import type { FlightController } from './fc-detect.js';

const exec = promisify(execFile);

export interface BridgeStatus {
  fcConnected: boolean;
  fcDevice: string;
  fcBaud: number;
  mavlinkRunning: boolean;
  udpPort: number;
  tcpPort: number;
  desktopReachable: boolean;
  uptime: number;  // seconds since bridge started
}

export interface BridgeConfig {
  udpPort?: number;   // default: 14550
  tcpPort?: number;   // default: 5760
  fcBaud?: number;    // default: 57600
}

const DEFAULT_UDP_PORT = 14550;
const DEFAULT_TCP_PORT = 5760;

let bridgeStartTime = 0;

export async function getBridgeStatus(): Promise<BridgeStatus> {
  const udpPort = parseInt(process.env.JAWJI_MAVLINK_UDP_PORT || String(DEFAULT_UDP_PORT), 10);
  const tcpPort = parseInt(process.env.JAWJI_MAVLINK_TCP_PORT || String(DEFAULT_TCP_PORT), 10);

  const fcConnected = await checkFcConnected();
  const mavlinkRunning = await checkMavlinkRunning();
  const desktopReachable = mavlinkRunning ? await checkPortOpen(udpPort) : false;

  return {
    fcConnected,
    fcDevice: process.env.JAWJI_FC_DEVICE || '/dev/serial0',
    fcBaud: parseInt(process.env.JAWJI_FC_BAUD || '57600', 10),
    mavlinkRunning,
    udpPort,
    tcpPort,
    desktopReachable,
    uptime: bridgeStartTime > 0 ? Math.floor((Date.now() - bridgeStartTime) / 1000) : 0,
  };
}

async function checkFcConnected(): Promise<boolean> {
  try {
    const dev = process.env.JAWJI_FC_DEVICE || '/dev/serial0';
    await exec('stat', [dev]);
    return true;
  } catch {
    return false;
  }
}

async function checkMavlinkRunning(): Promise<boolean> {
  try {
    const { stdout } = await exec('systemctl', ['is-active', 'mavlink-router']);
    return stdout.trim() === 'active';
  } catch {
    try {
      await exec('pgrep', ['-x', 'mavlink-routerd']);
      return true;
    } catch {
      return false;
    }
  }
}

async function checkPortOpen(port: number): Promise<boolean> {
  try {
    const { stdout } = await exec('ss', ['-tuln']);
    return stdout.includes(`:${port}`);
  } catch {
    try {
      await exec('netstat', ['-tuln']);
      const { stdout: ns } = await exec('netstat', ['-tuln']);
      return ns.includes(`:${port}`);
    } catch {
      return false;
    }
  }
}

export async function autoSetupBridge(fc: FlightController, config: BridgeConfig): Promise<{ success: boolean; error?: string }> {
  const udpPort = config.udpPort || DEFAULT_UDP_PORT;
  const tcpPort = config.tcpPort || DEFAULT_TCP_PORT;
  const fcBaud = config.fcBaud || fc.baudRate || 57600;

  log.info(`Auto-configuring bridge: ${fc.path} @ ${fcBaud} -> UDP :${udpPort} TCP :${tcpPort}`);

  // Check if mavlink-router is already configured correctly
  const status = await getBridgeStatus();
  if (status.mavlinkRunning && status.fcDevice === fc.path && status.fcBaud === fcBaud) {
    log.info('Bridge already configured correctly, skipping setup');
    bridgeStartTime = Date.now();
    return { success: true };
  }

  // Import and use mavlink-setup
  const { configureMavlinkRouter } = await import('./mavlink-setup.js');
  const result = await configureMavlinkRouter({
    fcDevice: fc.path,
    fcBaud,
    udpPort,
    tcpPort,
  });

  if (result.success) {
    bridgeStartTime = Date.now();
    log.info(`Bridge configured: ${fc.path} @ ${fcBaud} -> UDP :${udpPort} TCP :${tcpPort}`);
  }

  return result;
}

export function resetBridgeTimer(): void {
  bridgeStartTime = 0;
}
