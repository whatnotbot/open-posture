# v0.1.0 local release-candidate evidence

Evidence date: 2026-07-19 (Asia/Ho_Chi_Minh)

This record describes the current untagged working tree. It is local evidence, not a claim that GitHub-hosted CI, another operating system, physical camera behavior, participant outcomes, Developer ID signing, notarization, stapling, or public installer delivery have passed.

## Reference environment

| Item | Value |
|---|---|
| Operating system | macOS 26.5.1 (25F80), arm64 |
| Hardware class | Apple M1 Pro, 16 GiB memory |
| Node.js | 24.14.0 |
| npm | 11.18.0 |
| Electron | 43.1.1 |
| Webpack | 5.108.4 |
| MediaPipe Tasks Vision | 0.10.35 |
| Pose model | Pose Landmarker Lite; SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |

## Passed locally

| Check | Result |
|---|---|
| Fresh locked dependency install | `npm ci`: 547 packages installed, 548 packages audited, 0 vulnerabilities |
| Complete dependency audit | `npm audit --audit-level=low`: 0 vulnerabilities |
| TypeScript | `npm run typecheck`: pass |
| Deterministic suite | `npm test`: 108 passed, 0 failed/skipped/todo |
| Branch coverage | Posture engine 91.10% (minimum 90%); shared pure logic 84.79% (minimum 80%) |
| Model integrity | `npm run model:verify`: pass |
| Production compilation | Main, preload and renderer Webpack builds: pass |
| Electron integration | `npm run test:smoke`: 1 passed, 0 failed |
| Source entrypoint | `npm start`: production build passed and Electron remained running until intentionally stopped |

The Electron smoke launches the production-built app with an isolated user-data directory and Chromium synthetic camera. It verifies the privacy welcome screen, explicit camera-consent gate, camera-off initial state, video-only capture, microphone denial, external-fetch denial, the fixed preload API, storage loading, visible-screen accessibility semantics, focus restoration, scoped Settings controls, navigation through camera/positioning/settings, and release of the active video track.

Deterministic reliability coverage includes 100 camera restart/stop cycles, 5,000 scheduler ticks with one-in-flight backpressure, 100,000 pure-engine samples, two virtual monitoring hours, timestamp disorder, cooldown spacing, and alert-storm prevention. Virtual time is not a measured wall-clock resource soak.

## macOS distribution evidence state

The repository now defines host/arm64/x64 Forge DMG commands, an artifact verifier, and a protected signing/notarization workflow. The final clean local Apple-silicon build produced `Open Posture-0.1.0-arm64.dmg` (128 MiB on disk), SHA-256 `4bf90af9f793723a3af7e0866921ebab117cd0244d1a52cd52d27acc7a520b1c`. The mounted-DMG verifier passed bundle identity/version/architecture, DMG integrity/layout, camera-only permission metadata, ATS restrictions, model/WASM/legal resources, prohibited-content scans, and a complete deep ad-hoc signature. The packaged app rendered from its own `app.asar`, reached the positioning/model path using Chromium's synthetic video-only camera, and quit cleanly.

This proves a local arm64 installer candidate only. Intel packaging is configured but not locally built. The artifact is not Developer ID signed, notarized, transferred/downloaded, real-camera verified, or a public production download. Record a public artifact pass only after each final architecture DMG is signed, notarized, stapled, checksummed, downloaded again, and installed/tested on matching hardware. No such signed/notarized public artifact is claimed in this evidence snapshot. See [macOS distribution requirements](macos-distribution.md).

## Generated visual evidence

- [Welcome](assets/open-posture-welcome.png)
- [Camera choice](assets/open-posture-camera.png)
- [Synthetic-camera positioning](assets/open-posture-positioning.png)
- [Settings](assets/open-posture-settings.png)

The positioning screenshot contains Chromium's synthetic camera feed and must not be presented as physical-camera evidence.

## Required external evidence before stronger claims

- Push the exact commit and record passing Apple-silicon macOS, Intel macOS, Windows and Ubuntu GitHub Actions links.
- Build and verify the Intel DMG; then obtain protected Apple release inputs and record final-DMG Developer ID, Hardened Runtime, notarization/stapling, Gatekeeper, checksum/redownload, install/upgrade/uninstall evidence before publishing any installer.
- Complete the physical macOS checklist and a Windows 11 x64 volunteer checklist; Linux X11/Wayland evidence remains separate.
- Record VoiceOver, Narrator and Orca checks plus 200% zoom, keyboard and reduced-motion results.
- Run and record the measured two-hour resource soak; run eight hours before calling a release stable.
- Observe runtime packets on release platforms to supplement the enforced request blocker/CSP test.
- Conduct privacy-preserving formative/comparative research before claiming reminders are helpful; never claim medical or health benefit.
- Create the GitHub repository, replace the README clone placeholder, configure branch protection/private reporting, make the first commit, and tag only after the exact commit's gates pass.

See [requirements traceability](requirements-traceability.md), [manual smoke](manual-smoke.md), [macOS distribution](macos-distribution.md), [Windows testing](testing-windows.md), and the [release process](release-process.md).
