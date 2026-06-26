# Changelog

All notable changes to Jawji are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

Every pull request must add an entry here (see [Unreleased](#unreleased)) — CI rejects PRs that don't touch this file. Releases before this file was introduced are documented on the [GitHub Releases](https://github.com/utachicodes/jawjideck/releases) page.

## [Unreleased]

## [0.0.35] - 2026-06-26

### Added
- Manual stick control (RC_CHANNELS_OVERRIDE) for MAVLink/ArduPilot vehicles in the Flight Control panel — previously only MSP (Betaflight/iNav) vehicles had GCS-driven joystick/throttle control. Opt-in toggle; never starts automatically.
- Bug report issue template, auto-labeled `bug`, aligned with the in-app `.jawjireport` flow.
- `[[wiki link]]` validator (`tools/check-wiki-links.mjs`), wired into the Links CI workflow — `lychee` doesn't understand GitHub's Gollum-style `[[Page Name]]` links.

### Fixed
- Broken wiki links: missing `MAVLink Signing` page (now written), and stale repo URLs in the wiki sidebar footer.
- Windows portable build: `artifactName` had no token distinguishing the NSIS installer from the portable target, so both built to the same filename and the portable .exe silently never made it into releases (confirmed missing from the v0.0.34 release too).
- ArduPilot SITL macOS binary downloads were 404ing: `GITHUB_RELEASES_URL` in `ardupilot-sitl-downloader.ts` pointed at a GitHub repo that doesn't exist. Corrected to the repo that actually hosts the `sitl-v*` releases.
- Two more stale `rubenCodeforges/Jawji` URLs (nonexistent repo) in `wiki/Getting-Started.md`'s download table — corrected and trimmed to Windows-only, matching the rest of this release.
- Links CI: `jawji.com` and `raspberrypi.com` were failing with 403 from bot/WAF protection, not because the links are actually broken — added 403 to the accepted status codes.

## [0.0.34] - 2026-06-25

### Changed
- Release pipeline now builds and publishes Windows only; macOS and Linux build jobs removed from CI.
- README updated to reflect Windows-only distribution and document the project architecture.

### Added
- `CHANGELOG.md` with a required-update CI check on pull requests.
- Security CI: secret scanning, CodeQL, and dependency audit.
- Markdown link checker for README and wiki docs.

### Fixed
- DFU scan breaking normal board connect.
- DFU post-flash reconnect.
- Release pipeline: Linux executable case mismatch and macOS-blocks-all-uploads.
