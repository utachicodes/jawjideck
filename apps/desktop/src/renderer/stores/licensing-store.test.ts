import { describe, expect, it } from 'vitest';
import { isCacheStale, STALE_THRESHOLD_MS } from './licensing-store';

describe('isCacheStale', () => {
  const now = 1_700_000_000_000;

  it('treats a missing cachedAt as stale', () => {
    expect(isCacheStale(null, now)).toBe(true);
  });

  it('is not stale just under the threshold', () => {
    expect(isCacheStale(now - (STALE_THRESHOLD_MS - 1), now)).toBe(false);
  });

  it('is stale just over the threshold', () => {
    expect(isCacheStale(now - (STALE_THRESHOLD_MS + 1), now)).toBe(true);
  });

  it('is not stale for a cache from a moment ago', () => {
    expect(isCacheStale(now - 1000, now)).toBe(false);
  });
});
