// logs.ts
import { spawn, type ChildProcess } from 'child_process';
import type { LogEntry, LogLevel } from '@jawji/companion-types';

let logProcess: ChildProcess | null = null;
let listeners: Array<(entry: LogEntry) => void> = [];

function parseLogLevel(line: string): LogLevel {
  const lower = line.toLowerCase();
  if (lower.includes('error') || lower.includes('err]')) return 'error';
  if (lower.includes('warn') || lower.includes('warning')) return 'warn';
  if (lower.includes('debug')) return 'debug';
  return 'info';
}

function parseLine(line: string): LogEntry {
  return {
    timestamp: Date.now(),
    level: parseLogLevel(line),
    message: line.trim(),
    source: 'system',
  };
}

function attachLogProcess(proc: ChildProcess, onUnavailable: () => void): void {
  logProcess = proc;

  // spawn() reports a missing binary asynchronously via 'error', not a
  // thrown exception - without this handler an ENOENT here is an uncaught
  // 'error' event that crashes the whole agent process (REST API, WS,
  // mDNS - everything), not just log tailing.
  proc.on('error', () => {
    logProcess = null;
    onUnavailable();
  });

  proc.stdout?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      const entry = parseLine(line);
      for (const listener of listeners) {
        listener(entry);
      }
    }
  });

  proc.on('exit', () => {
    logProcess = null;
  });
}

export function startLogTailing(): void {
  if (logProcess) return;

  // Try journalctl first (systemd), fall back to tail -f /var/log/syslog
  attachLogProcess(
    spawn('journalctl', ['-f', '-n', '0', '--no-pager', '-o', 'short'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
    () => {
      attachLogProcess(
        spawn('tail', ['-f', '-n', '0', '/var/log/syslog'], {
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
        () => {
          console.warn('[logs] Neither journalctl nor /var/log/syslog available');
        }
      );
    }
  );
}

export function onLogEntry(callback: (entry: LogEntry) => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter(l => l !== callback);
  };
}

export function stopLogTailing(): void {
  if (logProcess) {
    logProcess.kill();
    logProcess = null;
  }
  listeners = [];
}
