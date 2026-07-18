# Open Posture — Implementation Ledger

This file is the persistent dependency and progress record for the complete build. It replaces the unavailable `bd` tracker in this workspace.

Status values: `pending`, `active`, `blocked`, `done`.

## Release objective

Deliver the complete open-source v0.x application defined by `open-posture-requirements.md`, with source builds, a low-friction macOS installer, release-blocking tests, privacy/security invariants, platform evidence, documentation, and release gates complete.

## Dependency graph

| ID | Work package | Depends on | Owner | Status | Completion evidence |
|---|---|---|---|---|---|
| W-001 | Repository, toolchain, Webpack/TypeScript/Electron scaffold | — | Desktop | done | Locked install, clean typecheck/build/start; production bundles are shared by source and packaged entrypoints |
| W-002 | Pure posture feature/calibration/scoring/state engine | — | Posture Intelligence | done | 35/35 deterministic Node 24 tests pass in `tests/posture-engine.test.ts` |
| W-003 | Product UI, state surfaces, accessibility, original visual system | W-001 contracts | Product/Experience | done | All P0 surfaces; reducer/typecheck/build clean; 4/4 focused tests pass |
| W-004 | Secure main/preload boundary, permissions, CSP, network denial | W-001 | Security/Desktop | done | Eight boundary tests plus Electron external-fetch denial pass |
| W-005 | Camera/worker/MediaPipe model pipeline | W-001, W-002, W-004 | CV/Desktop | done | Local model/worker/controller integrated; 17 camera tests and smoke capture pass |
| W-006 | Application lifecycle, tray, notification and fallback | W-001, W-003, W-004 | Platform | done | Lifecycle stop paths, tray adapter, native attempt, fallback, and controller cycles implemented/tested |
| W-007 | Calibration/onboarding/monitoring/correction integration | W-002, W-003, W-005 | Product/Desktop/PI | done | Live derived events drive P0 renderer flows, persistence, alerts, and history |
| W-008 | Settings, history, atomic storage, deletion, diagnostics | W-003, W-004 | Security/Desktop | done | Fifteen schema/storage tests plus smoke-tested typed bridge |
| W-009 | Full deterministic/fault/security/accessibility test catalog | W-002–W-008 | Quality | done | 108 deterministic tests, 90%/80% enforced branch gates, and Electron smoke green locally; 233 cases remain the complete manual/automated catalog |
| W-010 | Performance, resource, reconnect and soak hardening | W-005–W-009 | Reliability | active | Backpressure, 100 restart cycles, two virtual hours, timestamp disorder and alert storm tested; measured soaks pending |
| W-011 | macOS/Windows/Linux source and manual verification | W-009, W-010 | Platform/Release | active | Local macOS build/smoke pass; hosted/physical matrix pending |
| W-012 | OSS docs, governance, provenance, contribution and release materials | W-001–W-011 | OSS Program | done | Complete source-release surface, original assets, workflows and traceability |
| W-013 | User-helpfulness formative and comparative validation | W-007, W-009 | Human Factors/Research | pending | Published aggregate evidence/limits |
| W-014 | Final audit and source release | W-001–W-013 | Maintainer/Release | active | Five-pass local release-candidate audit complete with no remaining code blocker; initial commit/remote, hosted/manual/soak/research evidence pending |
| W-015 | macOS application bundle, DMG, packaged-state UX, verification and release automation | W-001, W-004, W-009, W-012 | macOS Packaging/Security/QA | done | Local arm64 DMG, packaged launch/synthetic-camera path, privacy/resource/signature verifier, docs and protected arm64/x64 workflow pass; public signing evidence remains W-014 |

## Non-waivable invariants

- Runtime external network traffic is zero.
- Frames and raw landmarks never enter storage, logs, IPC, diagnostics, or repository artifacts.
- Camera stops on Pause, Snooze, lock/suspend, fatal capture/model error, reset, and Quit.
- Cannot assess never creates drift, history penalty, or alert.
- User feedback is relative to personal calibration and never medical, universal, or shaming.
- Generated application binaries/installers and signing credentials are never committed; release artifacts must be traceable to a tested source tag.
- No sensitive or release-critical change is self-approved.

## Work log

- 2026-07-18: Requirements and team charter completed. Build authorized. Repository initialized. Bundled Node 24 located; npm 11 will run via the bundled package runner. `bd` CLI unavailable, so this ledger is the persistence fallback.
- 2026-07-18: W-002 pure posture engine implemented with calibration, qualification, features, scoring, EMA, alert state, cue, serialization, and privacy-safe fixtures; 35/35 tests pass under Node 24.14.0.
- 2026-07-18: W-003 renderer state/UI code landed; initial reducer suite passes 4/4. Full TypeScript/build integration remains under W-001/W-007.
- 2026-07-18: W-001 scaffold and initial W-004 hardened desktop boundary completed. Node 24/npm 11 locked install, typecheck, production build, model checksum, source launch, and runtime-only audit pass. Combined deterministic suite is 39/39; the default test command includes renderer-local tests.
- 2026-07-18: Integrated the local worker pipeline with every P0 renderer flow, lifecycle stop paths, cooldown/snooze behavior, compatible saved calibration, settings/history/deletion/diagnostics storage, native notification attempt, and in-app correction fallback.
- 2026-07-18: Expanded the initial app suite to 106 deterministic tests, enforced posture/shared branch coverage, and a production Electron smoke test. The smoke proves initial camera-off state, explicit camera-consent gating, video-only acquisition, external-fetch denial, visible-screen semantics, focus restoration, typed storage bridge, and camera-track release. Four original product screenshots were captured from the source build.
- 2026-07-18: Closed third-pass lifecycle races: calibration and framing transitions invalidate old snooze/countdown state; current-alert fallback is renderer validated; pending tray state persists; history deletion drains/invalidate queued snapshots; correction exposes live recovery progress; positioning gives exact guidance; local data reveal is a fixed privileged action.
- 2026-07-18: Prepared v0.1.0 source-release-candidate docs. Hosted three-OS CI, physical-platform checks, assistive-technology checks, measured soaks, and participant research remain deliberately unclaimed.
- 2026-07-18: Removed the unused Electron Forge packaging/development stack after the source dependency audit exposed 26 transitive advisories. Source start now performs one direct production Webpack build and launches Electron with the same zero-connect CSP/network policy used by smoke tests.
- 2026-07-19: User authorized a macOS installer distribution. W-015 opened with separate packaging, product-security and packaged-QA owners. The implementation must retain the direct source runner, keep runtime offline, pass a fresh dependency audit, and distinguish unsigned local testing from a signed/notarized public release.
- 2026-07-19: W-015 completed. The final 128 MiB arm64 DMG mounts with an Applications alias, passes privacy/metadata/resource/architecture/deep ad-hoc-signature verification, renders from packaged `app.asar`, reaches positioning with a synthetic video-only camera, and quits cleanly. The suite is 108/108 and dependency audit is zero; Intel, Developer ID/notarization, real-camera and public-download evidence remain external gates.
