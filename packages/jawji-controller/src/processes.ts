// processes.ts
import si from 'systeminformation';
import type { ProcessInfo } from '@jawji/companion-types';

export function isProtected(name: string, protectedList: string[]): boolean {
  const lower = name.toLowerCase();
  return protectedList.some(p => lower.includes(p.toLowerCase()));
}

// si.processes() reads every entry under /proc — expensive to run once per
// connected WebSocket client every 5s. Cache briefly so concurrent polls
// share one collection. findProcess/killProcess deliberately bypass the
// cache: kill must act on fresh data and the protected-name check iterates
// the FULL list so it can't be bypassed via the truncated top-100 snapshot.
let cachedList: { at: number; data: ProcessInfo[] } | null = null;
const CACHE_TTL_MS = 1000;

export async function listProcesses(protectedList: string[], useCache = true): Promise<ProcessInfo[]> {
  if (useCache && cachedList && Date.now() - cachedList.at < CACHE_TTL_MS) {
    return cachedList.data;
  }

  const data = await si.processes();
  const result = data.list
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, 100)
    .map(p => ({
      pid: p.pid,
      name: p.name,
      cpu: Math.round(p.cpu * 10) / 10,
      ram: p.memRss ?? 0,
      user: p.user ?? '',
      command: p.command ?? p.name,
      isProtected: isProtected(p.name, protectedList),
    }));

  if (useCache) {
    cachedList = { at: Date.now(), data: result };
  }
  return result;
}

/**
 * Look up a single process by PID. Iterates the FULL process list (not the
 * top-N-by-CPU snapshot used for display) so the protected-name check cannot
 * be bypassed by a low-CPU protected process dropping off the truncated list.
 */
export async function findProcess(pid: number): Promise<ProcessInfo | null> {
  const data = await si.processes();
  const p = data.list.find(item => item.pid === pid);
  if (!p) return null;
  return {
    pid: p.pid,
    name: p.name,
    cpu: Math.round(p.cpu * 10) / 10,
    ram: p.memRss ?? 0,
    user: p.user ?? '',
    command: p.command ?? p.name,
    isProtected: isProtected(p.name, []),
  };
}

export async function killProcess(pid: number, protectedList: string[]): Promise<{ success: boolean; error?: string }> {
  // Reject invalid PIDs outright. Negative PIDs have special kernel semantics
  // (e.g. -1 signals every process the caller may signal), so sending SIGTERM
  // to an unvalidated PID could kill unrelated processes.
  if (!Number.isInteger(pid) || pid <= 0) {
    return { success: false, error: `Invalid PID: ${pid}` };
  }

  try {
    // Check if PID exists
    process.kill(pid, 0); // signal 0 = existence check
  } catch {
    return { success: false, error: `Process ${pid} not found` };
  }

  // Look up process name and check if protected
  const target = await findProcess(pid);
  if (!target) {
    return { success: false, error: `Process ${pid} not found` };
  }
  if (target.isProtected || isProtected(target.name, protectedList)) {
    return { success: false, error: `Process '${target.name}' is protected and cannot be killed` };
  }

  try {
    process.kill(pid, 'SIGTERM');
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to kill ${pid}: ${(err as Error).message}` };
  }
}
