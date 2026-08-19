// metrics.ts
import si from 'systeminformation';
import type { MetricsData } from '@jawji/companion-types';

// The WebSocket server pushes metrics every 1s per connected client. With
// several clients that's several si.*() calls per second; si.currentLoad()
// and si.fsSize() each stat every CPU / mount point. Cache the result for a
// short window so concurrent polls collapse into one real collection.
let cached: { at: number; data: MetricsData } | null = null;
const CACHE_TTL_MS = 1000;

export async function collectMetrics(): Promise<MetricsData> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const [cpu, mem, disk, temp] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.cpuTemperature(),
  ]);

  const rootDisk = disk.find(d => d.mount === '/') || disk[0];

  const data: MetricsData = {
    cpu: Math.round(cpu.currentLoad * 10) / 10,
    ram: Math.round((mem.used / mem.total) * 1000) / 10,
    ramTotal: mem.total,
    ramUsed: mem.used,
    disk: rootDisk ? Math.round((rootDisk.used / rootDisk.size) * 1000) / 10 : 0,
    diskTotal: rootDisk?.size ?? 0,
    diskUsed: rootDisk?.used ?? 0,
    temp: temp.main ?? -1,
  };

  cached = { at: now, data };
  return data;
}
