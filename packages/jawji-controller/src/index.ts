// index.ts
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { CONTROLLER_PROTOCOL_VERSION } from '@jawji/companion-types';
import type { WsMessage, HelloMessage, MetricsData, ProcessInfo, LogEntry } from '@jawji/companion-types';
import { loadOrCreateToken, validateToken } from './auth.js';
import { startDiscovery, stopDiscovery, getMdnsServiceName, MDNS_SERVICE_TYPE } from './discovery.js';
import { loadConfig, CONTROLLER_AGENT_VERSION } from './config.js';
import { collectMetrics } from './metrics.js';
import { listProcesses, killProcess } from './processes.js';
import { listServices, controlService } from './services.js';
import { listDirectory, readFile, writeFile } from './files.js';
import { collectNetworkInfo } from './network.js';
import { isDockerAvailable, listContainers, controlContainer, getContainerLogs } from './docker.js';
import { isBlueOSAvailable, listInstalledExtensions, listAvailableExtensions, installExtension, removeExtension, getExtensionLogs } from './blueos.js';
import { getMediaMtxStatus } from './mediamtx.js';
import { createSession, writeToSession, resizeSession, destroySession, destroyAllSessions, isTerminalAvailable } from './terminal.js';
import { startLogTailing, onLogEntry, stopLogTailing, log } from './logs.js';
import { subnetMiddleware } from './subnet.js';
import { detectFlightControllers, type FlightController } from './fc-detect.js';
import { getMavlinkRouterStatus, configureMavlinkRouter } from './mavlink-setup.js';
import { getMediaMtxSetupStatus, detectCameras, configureMediaMTX } from './mediamtx-setup.js';
import { autoSetupBridge, getBridgeStatus } from './bridge.js';
import { validateDevicePath, validateBaudRate, validatePort } from './validation.js';
import os from 'os';

const config = loadConfig();
const token = loadOrCreateToken(config.tokenPath);

// ---- Express REST API ----
const app = express();
app.use(express.json());

// --- Subnet enforcement (before auth middleware) ---
app.use(subnetMiddleware(config.subnetOnly));

// Auth middleware for REST
function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization' });
    return;
  }
  if (!validateToken(auth.slice(7), token)) {
    res.status(403).json({ error: 'Invalid token' });
    return;
  }
  next();
}

// Health endpoint (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- Platform detection (run once at startup) ---
let dockerAvailable = false;
let blueosDetected = false;
let setupComplete = false;

async function detectPlatforms(): Promise<void> {
  dockerAvailable = await isDockerAvailable();
  blueosDetected = await isBlueOSAvailable();
  log.info(`Platform detection — Docker: ${dockerAvailable}, BlueOS: ${blueosDetected}`);
}

// --- Auto-setup: detect FC, configure mavlink + video + bridge ---
async function autoSetup(): Promise<void> {
  log.info('Starting auto-setup (flight controller detection, mavlink, video, bridge)');

  try {
    // 1. Detect connected flight controllers
    const fcResult = await detectFlightControllers();
    if (fcResult.bestPath) {
      log.info(`Flight controller detected: ${fcResult.bestPath} (${fcResult.controllers.length} total)`);

      // 2. Auto-configure mavlink-router if not already running
      const mavlink = await getMavlinkRouterStatus();
      if (!mavlink.running) {
        log.info('mavlink-router not running — auto-configuring...');
        const fc = fcResult.controllers.find(c => c.path === fcResult.bestPath) ?? fcResult.controllers[0];
        if (fc) await autoSetupBridge(fc, {
          udpPort: parseInt(process.env.JAWJI_MAVLINK_UDP_PORT || '14550', 10),
          tcpPort: parseInt(process.env.JAWJI_MAVLINK_TCP_PORT || '5760', 10),
        });
      }
    } else {
      log.info('No flight controller detected — mavlink setup skipped');
    }

    // 3. Detect cameras and auto-configure MediaMTX if a camera is found
    const cameras = await detectCameras();
    if (cameras.length > 0) {
      const mtx = await getMediaMtxSetupStatus();
      if (!mtx.running) {
        const cam = cameras[0];
        if (cam) {
          log.info(`Camera detected (${cam.path}) — auto-configuring MediaMTX...`);
          await configureMediaMTX({ cameraDevice: cam.path });
        }
      }
    } else {
      log.info('No camera detected — video setup skipped');
    }

    setupComplete = true;
    log.info('Auto-setup complete');
  } catch (err) {
    log.error(`Auto-setup failed: ${(err as Error).message}`);
    setupComplete = true; // mark as complete even on failure so we don't retry
  }
}

// --- Info endpoint ---
// Deliberately exempt from authMiddleware (registered below): this is the
// endpoint desktop clients probe to confirm "is there a Jawji Controller here"
// before pairing, when they don't have a token yet. Only exposes
// non-sensitive identity info (hostname, OS, versions) -- nothing that
// requires auth to justify gating it.
app.get('/api/v1/info', (_req, res) => {
  res.json({
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    uptime: os.uptime(),
    agentVersion: CONTROLLER_AGENT_VERSION,
    protocolVersion: CONTROLLER_PROTOCOL_VERSION,
    dockerAvailable,
    blueosDetected,
    terminalAvailable: isTerminalAvailable() && config.terminalEnabled,
  });
});

app.use('/api/v1', authMiddleware);

// --- Auto-setup status ---
app.get('/api/v1/setup', async (_req, res) => {
  try {
    const [fcResult, mavlink, video, bridge] = await Promise.all([
      detectFlightControllers(),
      getMavlinkRouterStatus(),
      getMediaMtxSetupStatus(),
      getBridgeStatus(),
    ]);
    res.json({
      complete: setupComplete,
      fc: { controllers: fcResult.controllers, bestPath: fcResult.bestPath },
      mavlink: { installed: mavlink.installed, running: mavlink.running, fcDevice: mavlink.fcDevice, udpPort: mavlink.udpPort, tcpPort: mavlink.tcpPort },
      video: { installed: video.installed, running: video.running, cameras: video.cameras, rtspPort: video.rtspPort, webrtcPort: video.webrtcPort },
      bridge: { fcConnected: bridge.fcConnected, mavlinkRunning: bridge.mavlinkRunning, udpPort: bridge.udpPort, tcpPort: bridge.tcpPort },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Force re-scan for flight controllers ---
app.post('/api/v1/setup/rescan', async (_req, res) => {
  const { invalidateFcCache } = await import('./fc-detect.js');
  invalidateFcCache();
  const fcResult = await detectFlightControllers();
  res.json(fcResult);
});

// --- Reconfigure mavlink-router ---
app.post('/api/v1/setup/mavlink', async (req, res) => {
  const { fcDevice, fcBaud, udpPort, tcpPort } = req.body;
  const validatedDevice = validateDevicePath(fcDevice, 'serial');
  const validatedBaud = validateBaudRate(fcBaud);
  const validatedUdp = validatePort(udpPort);
  const validatedTcp = validatePort(tcpPort);
  if (fcDevice && !validatedDevice) { res.status(400).json({ error: 'Invalid device path' }); return; }
  if (fcBaud && !validatedBaud) { res.status(400).json({ error: 'Invalid baud rate' }); return; }
  if (udpPort && !validatedUdp) { res.status(400).json({ error: 'Invalid UDP port' }); return; }
  if (tcpPort && !validatedTcp) { res.status(400).json({ error: 'Invalid TCP port' }); return; }
  const result = await configureMavlinkRouter({
    fcDevice: validatedDevice ?? undefined,
    fcBaud: validatedBaud ?? undefined,
    udpPort: validatedUdp ?? undefined,
    tcpPort: validatedTcp ?? undefined,
  });
  res.status(result.success ? 200 : 400).json(result);
});

// --- Reconfigure MediaMTX ---
app.post('/api/v1/setup/video', async (req, res) => {
  const { cameraDevice, rtspPort, webrtcPort, hlsPort } = req.body;
  const validatedCamera = validateDevicePath(cameraDevice, 'video');
  const validatedRtsp = validatePort(rtspPort);
  const validatedWebrtc = validatePort(webrtcPort);
  const validatedHls = validatePort(hlsPort);
  if (cameraDevice && !validatedCamera) { res.status(400).json({ error: 'Invalid camera device path' }); return; }
  if (rtspPort && !validatedRtsp) { res.status(400).json({ error: 'Invalid RTSP port' }); return; }
  if (webrtcPort && !validatedWebrtc) { res.status(400).json({ error: 'Invalid WebRTC port' }); return; }
  if (hlsPort && !validatedHls) { res.status(400).json({ error: 'Invalid HLS port' }); return; }
  const result = await configureMediaMTX({
    cameraDevice: validatedCamera ?? undefined,
    rtspPort: validatedRtsp ?? undefined,
    webrtcPort: validatedWebrtc ?? undefined,
    hlsPort: validatedHls ?? undefined,
  });
  res.status(result.success ? 200 : 400).json(result);
});

// --- Network ---
app.get('/api/v1/network', async (_req, res) => {
  res.json(await collectNetworkInfo());
});

// --- MediaMTX (if installed by companion-scripts' install_mediamtx) ---
app.get('/api/v1/mediamtx', async (_req, res) => {
  res.json(await getMediaMtxStatus());
});

// --- Processes ---
app.get('/api/v1/processes', async (_req, res) => {
  res.json(await listProcesses(config.protectedProcesses));
});

app.post('/api/v1/processes/:pid/kill', async (req, res) => {
  const pid = parseInt(req.params.pid, 10);
  if (isNaN(pid)) { res.status(400).json({ error: 'Invalid PID' }); return; }
  const result = await killProcess(pid, config.protectedProcesses);
  res.status(result.success ? 200 : 400).json(result);
});

// --- Services ---
app.get('/api/v1/services', async (_req, res) => {
  res.json(await listServices());
});

app.post('/api/v1/services/:name/:action', async (req, res) => {
  const { name, action } = req.params;
  if (!['start', 'stop', 'restart'].includes(action)) {
    res.status(400).json({ error: 'Invalid action' }); return;
  }
  const result = await controlService(name, action as 'start' | 'stop' | 'restart');
  res.status(result.success ? 200 : 400).json(result);
});

// --- Files ---
app.get('/api/v1/files', async (req, res) => {
  try {
    const dirPath = (req.query.path as string) || '/';
    const entries = await listDirectory(config.fileRoot, dirPath);
    res.json(entries);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/v1/files/read', async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ error: 'path required' }); return; }
    const content = await readFile(config.fileRoot, filePath);
    res.send(content);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/v1/files/write', async (req, res) => {
  try {
    const { path: filePath, data } = req.body;
    if (!filePath || !data) { res.status(400).json({ error: 'path and data required' }); return; }
    await writeFile(config.fileRoot, filePath, Buffer.from(data, 'base64'));
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// --- Docker (Layer 3) ---
app.get('/api/v1/docker/containers', async (_req, res) => {
  if (!dockerAvailable) { res.json([]); return; }
  res.json(await listContainers());
});

app.post('/api/v1/docker/containers/:id/:action', async (req, res) => {
  if (!dockerAvailable) { res.status(404).json({ error: 'Docker not available' }); return; }
  const { id, action } = req.params;
  if (!['start', 'stop', 'restart'].includes(action)) {
    res.status(400).json({ error: 'Invalid action' }); return;
  }
  const result = await controlContainer(id, action as 'start' | 'stop' | 'restart');
  res.status(result.success ? 200 : 400).json(result);
});

app.get('/api/v1/docker/containers/:id/logs', async (req, res) => {
  if (!dockerAvailable) { res.status(404).json({ error: 'Docker not available' }); return; }
  const logs = await getContainerLogs(req.params.id);
  res.type('text/plain').send(logs);
});

// --- BlueOS Extensions (Layer 3) ---
app.get('/api/v1/extensions', async (_req, res) => {
  if (!blueosDetected) { res.json([]); return; }
  res.json(await listInstalledExtensions());
});

app.get('/api/v1/extensions/available', async (_req, res) => {
  if (!blueosDetected) { res.json([]); return; }
  res.json(await listAvailableExtensions());
});

app.post('/api/v1/extensions/install', async (req, res) => {
  if (!blueosDetected) { res.status(404).json({ error: 'BlueOS not available' }); return; }
  const { identifier, version } = req.body;
  const result = await installExtension(identifier, version);
  res.status(result.success ? 200 : 400).json(result);
});

app.delete('/api/v1/extensions/:identifier', async (req, res) => {
  if (!blueosDetected) { res.status(404).json({ error: 'BlueOS not available' }); return; }
  const result = await removeExtension(req.params.identifier);
  res.status(result.success ? 200 : 400).json(result);
});

app.get('/api/v1/extensions/:identifier/logs', async (req, res) => {
  if (!blueosDetected) { res.status(404).json({ error: 'BlueOS not available' }); return; }
  const logs = await getExtensionLogs(req.params.identifier);
  res.type('text/plain').send(logs);
});

// ---- HTTP + WebSocket Server ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket, req) => {
  // Auth check on WebSocket upgrade
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const wsToken = url.searchParams.get('token')
    || req.headers.authorization?.slice(7)
    || '';

  if (!validateToken(wsToken, token)) {
    log.warn('Rejected WebSocket connection: bad or missing token');
    ws.close(4001, 'Unauthorized');
    return;
  }

  log.info('Desktop client connected (WebSocket)');

  // Send hello message
  const hello: WsMessage<HelloMessage> = {
    channel: 'hello',
    data: {
      protocolVersion: CONTROLLER_PROTOCOL_VERSION,
      agentVersion: CONTROLLER_AGENT_VERSION,
      hostname: os.hostname(),
    },
  };
  ws.send(JSON.stringify(hello));

  // --- Metrics stream (every 1s) ---
  const metricsInterval = setInterval(async () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const data = await collectMetrics();
    const msg: WsMessage<MetricsData> = { channel: 'metrics', data };
    ws.send(JSON.stringify(msg));
  }, 1000);

  // --- Process list stream (every 5s) ---
  const processInterval = setInterval(async () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const data = await listProcesses(config.protectedProcesses);
    const msg: WsMessage<ProcessInfo[]> = { channel: 'processes', data };
    ws.send(JSON.stringify(msg));
  }, 5000);

  // --- Log streaming ---
  const removeLogListener = onLogEntry((entry: LogEntry) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const msg: WsMessage<LogEntry> = { channel: 'logs', data: entry };
    ws.send(JSON.stringify(msg));
  });

  // --- Terminal PTY ---
  const sessionId = `ws-${Date.now()}`;
  let terminalActive = false;

  // --- Handle incoming messages ---
  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as WsMessage;

      if (msg.channel === 'terminal' && config.terminalEnabled) {
        if (!terminalActive) {
          terminalActive = createSession(
            sessionId,
            config.terminalTimeoutMs,
            (data: string) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ channel: 'terminal', data }));
              }
            },
            () => {
              terminalActive = false;
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ channel: 'terminal', data: '\r\n[Session ended]\r\n' }));
              }
            }
          );
        }
        if (typeof msg.data === 'string') {
          writeToSession(sessionId, msg.data);
        } else if (msg.data && typeof msg.data === 'object' && 'cols' in msg.data) {
          const resize = msg.data as { cols: number; rows: number };
          resizeSession(sessionId, resize.cols, resize.rows);
        }
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    log.info('Desktop client disconnected (WebSocket)');
    clearInterval(metricsInterval);
    clearInterval(processInterval);
    removeLogListener();
    if (terminalActive) destroySession(sessionId);
  });
});

// ---- Start ----
function listIPv4Addresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

function printStartupBanner(): void {
  const hostname = os.hostname();
  const ips = listIPv4Addresses();
  const primaryIp = ips[0] ?? 'localhost';
  const urls = ips.length > 0 ? ips.map((ip) => `http://${ip}:${config.port}`) : [`http://localhost:${config.port}`];

  const lines: string[] = [
    '='.repeat(72),
    `  Jawji Controller v${CONTROLLER_AGENT_VERSION}  (protocol ${CONTROLLER_PROTOCOL_VERSION})`,
    '='.repeat(72),
    `  REST API      : ${urls[0]}/api/v1`,
    `  WebSocket     : ws://${primaryIp}:${config.port}/ws`,
    `  Health check  : curl ${urls[0]}/health   (expects {"status":"ok"})`,
    '',
    '  Controller URLs (one per network interface):',
    ...urls.map((url) => `    - ${url}`),
    '',
    `  mDNS          : ${getMdnsServiceName(hostname)} on _${MDNS_SERVICE_TYPE}._tcp`,
    `                  pair in Jawji as ${hostname}.local:${config.port}`,
    '',
    `  Pairing token : ${token}`,
    '    ^ This secret lets the Jawji desktop app control this device.',
    '      Anyone with it can pair -- keep it private.',
    '',
    '  To connect: open the Jawji desktop app -> Companion Dashboard ->',
    '    Add controller by address (or Scan for controllers) -> paste the token.',
    '='.repeat(72),
  ];
  console.log(`\n${lines.join('\n')}\n`);
}

server.listen(config.port, async () => {
  await detectPlatforms();
  startLogTailing();
  autoSetup();  // fire-and-forget — doesn't block the server
  printStartupBanner();
  startDiscovery(config.port, os.hostname());
});

// Graceful shutdown
function shutdown(signal: string): void {
  log.info(`Received ${signal} — shutting down`);
  stopDiscovery();
  stopLogTailing();
  destroyAllSessions();
  wss.close();
  server.close(() => {
    log.info('Stopped cleanly');
    process.exit(0);
  });
  // Belt-and-braces: never hang a reboot because a socket refused to close.
  setTimeout(() => {
    log.info('Forced exit after graceful shutdown timed out');
    process.exit(0);
  }, 2000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server, wss, config };
