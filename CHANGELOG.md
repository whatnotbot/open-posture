# Changelog

All notable source changes are documented here using Added, Changed, Fixed, Security, Deprecated, and Removed categories.

## Unreleased

### Added

- Local macOS Forge packaging commands for separate Apple-silicon and Intel drag-to-Applications DMGs.
- macOS distribution requirements covering Gatekeeper, camera permission, signing/notarization, checksums, install/upgrade/uninstall, acceptance gates, and release ownership.

### Changed

- Distribution documentation now distinguishes contributor source runs, local unsigned/ad-hoc macOS test artifacts, and future public Developer ID signed/notarized releases.
- Repository guidance now focuses on observable behavior and verification; renderer views are isolated and tested through their rendered output.

### Security

- Generated applications/DMGs and all signing/notarization material remain excluded from Git; release credentials are restricted to a protected release environment and are never available to fork or pull-request jobs.

## [0.1.0] - 2026-07-18

### Added

- Complete privacy-first onboarding, camera positioning, personal calibration, monitoring, correction, history, settings, deletion, and recovery flows.
- On-device MediaPipe Pose Landmarker Lite worker pipeline with a locally bundled, checksum-pinned model.
- Explainable personal-reference scoring with confidence gates, smoothing, dwell, recovery, cooldown, snooze, and neutral directional cues.
- Cross-platform Electron shell with tray controls, native-notification attempt, in-app fallback, lifecycle camera shutdown, and atomic local storage.
- Original accessible visual system, keyboard navigation, live announcements, reduced-motion support, responsive layouts, and dark mode.
- Architecture, algorithm, privacy, data, testing, troubleshooting, Windows, and release documentation.
- Apache-2.0 licensing, governance, contribution and security policies, issue forms, pull-request template, Dependabot, CodeQL, dependency review, and a three-OS CI matrix.
- Deterministic tests, enforced branch coverage, Electron fake-camera smoke, and packaged-artifact regression checks.
- Race-safe history deletion, renderer-validated in-app alert fallback, live correction recovery progress, exact framing guidance, and scoped Settings defaults.

### Security

- Sandboxed renderer with context isolation, Node integration disabled, restrictive CSP, external runtime network denial, navigation/download denial, video-only permission policy, narrow typed IPC, path confinement, atomic writes, recovery backups, and sanitized capped logs.
- Frames and raw landmarks are kept out of storage, logs, diagnostics, and privileged IPC by construction and regression tests.

### Known limitations

- This release candidate can be run from source and can produce a local unsigned/ad-hoc macOS DMG. No current artifact is claimed to be Developer ID signed, notarized, or physically camera-verified; there is still no updater or App Store package.
- Windows/Linux hosted CI has not run until the repository is pushed; physical Windows and Linux verification is still wanted.
- Assistive-technology manual checks, physical-camera platform checks, and participant-based alert-helpfulness research remain external evidence work.
