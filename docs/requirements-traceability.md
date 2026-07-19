# P0 requirements traceability

This matrix records implementation and evidence; it is not a platform, efficacy, signed-distribution, or stable-release claim. A source file proves that a component exists, and a locally generated DMG proves only its tested packaging boundary. Automated evidence and synthetic fixtures do not replace Gatekeeper/notarization evidence, a physical camera, or a participant.

Status vocabulary:

- **Implemented/local:** the integrated source behavior and its required local automated evidence exist; for packaging this may mean an unsigned/ad-hoc local artifact only.
- **Implemented/evidence pending:** the source behavior exists, but hosted, physical, assistive-technology, soak, or research evidence is still required for a stronger claim.
- **Pending:** required implementation does not exist.

## P0 feature matrix

| Feature | Current implementation | Automated evidence | Manual/research evidence | Status and remaining gate |
|---|---|---|---|---|
| FEAT-001 Setup/distribution | Locked Node/npm source workflow plus macOS arm64/x64 Forge package/make commands and installer docs | Repository gates; hosted macOS/Windows/Ubuntu install/check/smoke; local arm64 package evidence | Physical fresh-clone checks and signed/notarized downloaded-DMG install pending | **Implemented/evidence pending:** source CI passes; local unsigned/ad-hoc macOS installer candidate only |
| FEAT-002 Privacy onboarding | Complete welcome/privacy screen and persisted setup state | Renderer state/repository tests; Electron smoke opens the real welcome surface | Moderated comprehension evidence pending | **Implemented/local** |
| FEAT-003 Camera permission/selection | Video-only controller, explicit request, enumeration and persisted device ID | Camera/session, security and Electron smoke tests | Physical permission/device checks pending | **Implemented/local** |
| FEAT-004 Positioning preview | Live preview driven by worker quality/qualification events and non-color checks | Camera pipeline tests; Electron fake-camera preview smoke | Varied physical lighting/camera/body-context evidence pending | **Implemented/local** |
| FEAT-005 Personal calibration | Worker calibration, compatibility-checked derived baseline and replacement/cancel flow | Posture, pipeline, storage and state tests | Physical full-body-context calibration checklist pending | **Implemented/local** |
| FEAT-006 Local monitoring | Qualification, explainable features, score, EMA and alert state drive the dashboard | Posture, pipeline, reliability and state tests | Measured physical session/resources pending | **Implemented/local** |
| FEAT-007 Low-noise alerts | Dwell, recovery, cooldown, snooze, native attempt, stale guards and a top-right non-focus-stealing desktop alert | Posture/reliability, overlay-position and typed desktop-contract tests | Physical always-on-top/native-delivery checks pending | **Implemented/evidence pending** |
| FEAT-008 Corrective experience | Live cue, strongest-change explanation, recovery state and personal-reference copy | Posture cue, state and repository copy tests | Participant helpfulness/comparative evidence pending | **Implemented/evidence pending** |
| FEAT-009 Pause/snooze/resume | All controls stop capture; restart guard and countdown restore monitoring | State, lifecycle/controller and 100-cycle reliability tests | OS camera indicator, lock and sleep checks pending | **Implemented/local** |
| FEAT-010 Tray/background | Cross-platform tray menu, close education, focus/start/pause/snooze/quit commands | Desktop contract and repository tests | Physical macOS/Windows/Linux tray checklists pending | **Implemented/evidence pending** |
| FEAT-011 Today history | Derived minute aggregates, retention, real history bars and empty states | Storage/schema and state tests | Long physical-session comparison pending | **Implemented/local** |
| FEAT-012 Settings | Camera, sensitivity, notifications, retention, reduced motion and setup state persist | Storage/schema, preload and state tests; smoke reaches real settings | Restart checklist pending | **Implemented/local** |
| FEAT-013 Data controls | Separate calibration/history/all-data confirmations and scoped typed deletion | Storage deletion, state and repository tests | Manual failure/success copy check pending | **Implemented/local** |
| FEAT-014 Recovery/diagnostics | Recoverable camera/model/storage states and sanitized diagnostic copy | Camera/storage/security/repository tests | Driver failure and clipboard manual checks pending | **Implemented/local** |
| FEAT-015 Accessibility | Semantic HTML, keyboard/focus/live region, zoom/reflow, reduced motion and non-color UI | Repository semantics gates; Electron surface audit | VoiceOver, Narrator, Orca, 200% zoom and disabled-participant evidence pending | **Implemented/evidence pending** |
| FEAT-016 Offline/security | Sandbox, context isolation, confined custom protocol, local model, CSP, network/navigation/download denial, narrow IPC, and hardened packaged Electron fuses | Security boundary tests, model gate and Electron external-fetch/custom-protocol smoke | Packet observation on release platforms pending | **Implemented/local** |
| FEAT-017 Cross-platform verification | Immutable-SHA GitHub Actions matrix, macOS package requirements, and versioned manual/Windows checklists | Hosted Apple-silicon/Intel macOS, Windows x64, and Ubuntu Xvfb suites/smokes pass | macOS signed/notarized artifact and all physical checklists pending | **Implemented/evidence pending:** CI-tested; do not claim physical Windows/Linux or public macOS installer verification |
| FEAT-018 Open-source project surface | License/notices, governance, community files, source workflows, controlled macOS distribution docs, and original assets | Repository gates | GitHub protection/private reporting and protected release environment require public repository | **Implemented/local** |

## Current automated evidence

| Area | Test files | What they establish |
|---|---|---|
| Posture intelligence | `tests/posture-engine.test.ts` | Qualification, calibration, features, scoring, smoothing, dwell, recovery, presets and safe parsing |
| Camera/model pipeline | `tests/camera/*.test.ts` | Video-only lifecycle, local worker protocol, derived-only analysis, backpressure and fault handling |
| Reliability | `tests/reliability/reliability.test.ts` | 100 restart cycles, 5,000-tick backpressure, two virtual hours, timestamp disorder and alert-storm limits |
| Desktop security | `tests/security/*.test.ts` | Trusted URL/network policy, permission policy and narrow preload contract |
| Local data | `tests/storage/*.test.ts` | Validation, atomic backup/recovery, retention, scoped deletion, diagnostics and storage-root confinement |
| Renderer state | `src/renderer/state.test.ts` | Readiness, saved calibration, snooze/privacy state, deletion separation and alert/error transitions |
| Repository gates | `tests/repository/repository-gates.test.ts` | OSS surface, source/package scripts, generated-artifact and privacy/API bans, copy, screens, accessibility semantics, SHA-pinned workflows and model provenance |
| Electron smoke | `tests/smoke/electron.test.ts` | Real process boundaries, initial camera-off state, video-only synthetic capture, runtime network denial, typed storage bridge and track stop |

Passing these tests does not replace a real OS camera/notification/tray check, assistive-technology testing, measured resource soak, physical Windows, or user research.

## Release-candidate evidence still pending

- Developer ID signed/notarized/stapled macOS arm64/x64 DMGs, final-download checksum/Gatekeeper evidence, and protected release-environment validation. No such public artifact is currently claimed.
- Physical camera/permission/tray/alert/fallback/lock/sleep/quit checks.
- VoiceOver, Narrator and Orca checks plus recorded keyboard, contrast and 200% zoom results.
- Measured two-hour resource/alert-rate soak; eight hours before a stable claim.
- Full runtime packet observation on release platforms.
- Physical Windows 11 x64 volunteer result; no such result is claimed.
- Formative/comparative study showing whether reminders help users return toward their personal reference; no health benefit is claimed.

## Platform evidence status

| Platform | Deterministic/hosted CI | VM | Physical/manual | Allowed current claim |
|---|---|---|---|---|
| macOS 13+ | Hosted Apple-silicon and Intel suite/smoke pass; local arm64 unsigned/ad-hoc package path passes | Not required | Physical installed-app checklist not recorded; signing/notarization pending | CI-tested source and local installer candidate, not a public signed release |
| Windows 11 x64 | Hosted `windows-2025` suite and synthetic-camera smoke pass | ARM64 VM pending | Physical x64 pending | CI-tested; physical verification wanted |
| Ubuntu 24.04 | Hosted suite and Xvfb synthetic-camera smoke pass | Not required | X11/Wayland pending | CI-tested; not real-camera verified |
| Tier 2 variants | No blocking matrix | Optional | Community evidence only | Experimental/community-supported |

## Evidence update rule

Every implementation pull request identifies affected requirement/test groups. Update this matrix when a component, integration, test, manual checklist, support claim, or user-study result changes. Link hosted/manual evidence to the exact commit; never convert a configured workflow, anecdote, star count, VM result, or synthetic fixture into stronger evidence than it provides.
