# Changelog

All notable changes to Jawji are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

Every pull request must add an entry here (see [Unreleased](#unreleased)) — CI rejects PRs that don't touch this file. Releases before this file was introduced are documented on the [GitHub Releases](https://github.com/utachicodes/jawjideck/releases) page.

## [Unreleased]

### Added
- Manual stick control (RC_CHANNELS_OVERRIDE) for MAVLink/ArduPilot vehicles in the Flight Control panel — previously only MSP (Betaflight/iNav) vehicles had GCS-driven joystick/throttle control. Opt-in toggle; never starts automatically.

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
