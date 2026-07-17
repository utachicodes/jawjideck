import { auth } from './firebase';

export const JAWJI_GCS_URL = import.meta.env.VITE_JAWJI_GCS_URL || 'https://jawji.space';

async function getIdTokenOrThrow(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const idToken = await getIdTokenOrThrow();
  const res = await fetch(`${JAWJI_GCS_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${idToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request to ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}
