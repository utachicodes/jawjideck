import type { RendererHostApi, CameraDetection } from '@jawji/module-sdk';

let ptySessionId: string | null = null;
let unsubscribeStream: (() => void) | null = null;
let unsubscribeData: (() => void) | null = null;
let unsubscribeExit: (() => void) | null = null;

interface RawDetection {
  label: string;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

async function startDetection(host: RendererHostApi, streamUrl: string) {
  await stopDetection(host);

  host.log('info', `Starting detection on ${streamUrl}`);
  ptySessionId = await host.pty.create({
    shell: 'python3',
    args: ['detect.py', '--stream-url', streamUrl],
    cwd: host.moduleDir,
  });

  let buffer = '';
  unsubscribeData = host.pty.onData(ptySessionId, (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const raw = JSON.parse(line) as RawDetection[];
        const detections: CameraDetection[] = raw.map((d) => ({
          label: d.label,
          confidence: d.confidence,
          x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
        }));
        host.camera.setDetections(detections);
      } catch (err) {
        host.log('warn', 'Failed to parse detection line', line, err);
      }
    }
  });

  unsubscribeExit = host.pty.onExit(ptySessionId, (code) => {
    host.log(code === 0 ? 'info' : 'error', `detect.py exited with code ${code}`);
    host.camera.setDetections([]);
  });
}

async function stopDetection(host: RendererHostApi) {
  unsubscribeData?.();
  unsubscribeData = null;
  unsubscribeExit?.();
  unsubscribeExit = null;
  if (ptySessionId) {
    await host.pty.kill(ptySessionId);
    ptySessionId = null;
  }
  host.camera.setDetections([]);
}

export async function activate(host: RendererHostApi) {
  host.log('info', 'AI Object Detection module activated');

  const currentUrl = host.camera.getStreamUrl();
  if (currentUrl) {
    await startDetection(host, currentUrl);
  }

  unsubscribeStream = host.camera.subscribe((url) => {
    if (url) {
      startDetection(host, url).catch((err) => host.log('error', 'Failed to start detection', err));
    } else {
      stopDetection(host).catch((err) => host.log('error', 'Failed to stop detection', err));
    }
  });
}

export function deactivate() {
  unsubscribeStream?.();
  unsubscribeStream = null;
  // Best-effort: PTY cleanup on full app shutdown is handled by the main
  // process's killAllForModule(), so an explicit host.pty.kill() here isn't
  // required, but there's no host reference available in deactivate() to
  // call it anyway (matches the existing template module's deactivate() shape).
}
