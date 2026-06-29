/**
 * Feature tours are tagged with the app version they were introduced in
 * (e.g. '0.0.33'), not the current app version — so a tour added two
 * releases ago should stop billing itself as "new". Versions in this repo
 * follow the 0.0.X scheme (see package.json), so the release number is the
 * last dot-separated segment.
 */
function releaseNumber(version: string): number {
  const segments = version.split('.').map(Number);
  const last = segments[segments.length - 1];
  return last !== undefined && Number.isFinite(last) ? last : 0;
}

/**
 * Whether a tour's version is recent enough to still show a "New in vX"
 * badge, relative to the running app's current version.
 */
export function isRecentTourVersion(
  tourVersion: string,
  currentVersion: string | null,
  withinReleases = 1,
): boolean {
  if (!currentVersion) return true; // version unknown yet — don't withhold the badge
  return releaseNumber(currentVersion) - releaseNumber(tourVersion) <= withinReleases;
}
