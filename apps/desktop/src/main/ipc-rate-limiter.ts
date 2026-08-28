/**
 * IPC Rate Limiter
 * Prevents abuse of IPC channels from compromised renderer
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class IPCRateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private readonly defaultMaxRequests: number;
  private readonly defaultWindowMs: number;
  private readonly channelLimits: Map<string, { max: number; windowMs: number }> = new Map();

  constructor(defaultMaxRequests = 100, defaultWindowMs = 60000) {
    this.defaultMaxRequests = defaultMaxRequests;
    this.defaultWindowMs = defaultWindowMs;
  }

  setChannelLimit(channel: string, maxRequests: number, windowMs: number): void {
    this.channelLimits.set(channel, { max: maxRequests, windowMs });
  }

  checkLimit(channel: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const limit = this.channelLimits.get(channel) || {
      max: this.defaultMaxRequests,
      windowMs: this.defaultWindowMs,
    };

    const entry = this.limits.get(channel);
    
    if (!entry || now > entry.resetTime) {
      // New window
      this.limits.set(channel, {
        count: 1,
        resetTime: now + limit.windowMs,
      });
      return { allowed: true, remaining: limit.max - 1, resetTime: now + limit.windowMs };
    }

    if (entry.count >= limit.max) {
      return { allowed: false, remaining: 0, resetTime: entry.resetTime };
    }

    entry.count++;
    return { allowed: true, remaining: limit.max - entry.count, resetTime: entry.resetTime };
  }

  reset(channel: string): void {
    this.limits.delete(channel);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [channel, entry] of this.limits.entries()) {
      if (now > entry.resetTime) {
        this.limits.delete(channel);
      }
    }
  }
}

// Global rate limiter instance
export const ipcRateLimiter = new IPCRateLimiter();

// Configure per-channel limits
ipcRateLimiter.setChannelLimit('comms:connect', 10, 60000); // 10 connections/min
ipcRateLimiter.setChannelLimit('mavlink:send', 1000, 1000); // 1000 msg/sec
ipcRateLimiter.setChannelLimit('param:set', 50, 1000); // 50 params/sec
ipcRateLimiter.setChannelLimit('mission:upload', 5, 60000); // 5 uploads/min
ipcRateLimiter.setChannelLimit('firmware:flash', 2, 3600000); // 2 flashes/hour
ipcRateLimiter.setChannelLimit('mavlink:signing-set-key', 5, 3600000); // 5 key changes/hour
ipcRateLimiter.setChannelLimit('mavlink-ftp:*', 30, 60000); // 30 FTP ops/min
ipcRateLimiter.setChannelLimit('log:parse-file', 5, 3600000); // 5 log parses/hour
ipcRateLimiter.setChannelLimit('log:ai-analyze', 10, 3600000); // 10 AI analyzes/hour

// Match channel patterns
function matchChannel(channel: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return channel.startsWith(pattern.slice(0, -1));
  }
  return channel === pattern;
}

export function checkIPCRateLimit(channel: string): { allowed: boolean; remaining: number; resetTime: number } {
  for (const [pattern, _] of ipcRateLimiter['channelLimits']) {
    if (matchChannel(channel, pattern)) {
      return ipcRateLimiter.checkLimit(pattern);
    }
  }
  return ipcRateLimiter.checkLimit(channel);
}