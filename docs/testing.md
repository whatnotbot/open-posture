# Testing strategy

Tests prove behavior at the cheapest reliable layer. Deterministic logic runs without a camera, network, notification permission, or desktop. Real-platform checks cover only behavior that CI cannot establish.

## Local commands

```bash
npm ci
npm run model:verify
npm run typecheck
npm test
npm run build
npm run test:smoke
npm run make:mac # macOS host architecture only
```

`npm run check` combines typecheck, deterministic tests, model verification, and production compilation. Run it before every pull request. Smoke tests use an isolated user-data directory and fake camera where implemented; they must release all processes, workers, and tracks.

## Levels

| Level | Purpose | When |
|---|---|---|
| Pure unit | Calibration, features, score, EMA, timers, state, validation, aggregation, retention, migration | Every PR, every OS |
| Adapter integration | Worker, IPC, filesystem, camera/notification fakes, network denial, lifecycle | Every PR |
| Electron smoke/E2E | Real process boundaries/UI with synthetic camera and isolated data | Every PR, macOS/Windows/Linux |
| Static/security/license | Sandbox, CSP, endpoints, secrets, notices, model checksum, dependencies, CodeQL | Every PR/schedule |
| Accessibility | Semantics, keyboard, contrast automation plus manual assistive technology | Every PR/release |
| Performance/soak | Queues, resources, leaks, timers, alert rate | Two-hour candidate; eight-hour stable |
| Manual platform | Permissions, physical camera, tray, native alerts, lock/sleep, drivers, AT | Before verified claim |
| macOS package | DMG layout, packaged assets/model, application identity, Gatekeeper, upgrade/uninstall | Every macOS installer candidate |

CI runs `npm ci` and `npm run check` on `macos-15` (Apple silicon), `macos-15-intel`, `windows-2025`, and `ubuntu-24.04`; Electron smoke runs directly on macOS/Windows and under Xvfb on Ubuntu. The Ubuntu job gives Electron's checked-in sandbox helper the root ownership and setuid mode Chromium requires before launch. Ordinary pull-request CI does not sign or upload an application installer. Local/package jobs may retain generated artifacts only for bounded testing, and the protected macOS job may upload final DMGs plus sidecar hashes as GitHub Actions artifacts only after the signing/notarization gates in [macOS distribution](macos-distribution.md). It does not publish a GitHub Release; a maintainer must verify both architecture downloads, assemble `SHA256SUMS.txt`, and publish. Generated applications and DMGs are never committed.

## Fixture rules

Fixtures cover stable calibration, sustained and brief drift, recovery/cooldown, absence, confidence loss, two people, ordinary movement, timestamp disorder, scale changes, storage faults, notification/camera states, sleep/wake, and model/worker failures.

- Synthetic or explicitly consented/licensed only.
- Document provenance and generation.
- Never use copied SuperShrimp material.
- Never commit personal camera footage, raw landmark streams, usernames, home paths, secrets, or unsafe diagnostics.
- Model assertions use semantic states and justified tolerances; pure feature/timer output remains exact.
- A model update requires checksum and full fixture revalidation.

## Coverage and regressions

- The pure posture engine: at least 90% branch coverage.
- Overall shared pure TypeScript business logic: at least 80% branch coverage.
- `npm run test:coverage` enforces both thresholds in CI; storage and schema regressions still require explicit boundary tests even when the aggregate is green.
- Boundary/scenario review matters more than a percentage.
- Every reproducible bug fix adds a failing regression test.
- Skipped or focused release-blocking tests require a linked issue and cannot make CI artificially green.
- A repaired release-blocking flaky test passes ten consecutive runs; the target is zero known flakes.

Test output may log semantic states and monotonic timestamps, never raw landmarks or personal data.

## Pull-request evidence

State the behavior covered, commands, exact platforms actually tested, fixtures, and manual evidence. Do not say “Windows tested” when only GitHub Actions ran; say “Windows x64 CI passed.”

For a local macOS DMG, record that it is unsigned/ad-hoc and do not count it as Gatekeeper or public-distribution evidence. A public macOS artifact requires final downloaded-DMG signature, notarization, stapling, checksum, matching-architecture, and manual evidence; no such evidence is implied by the source smoke test.

See [manual smoke](manual-smoke.md), [macOS distribution](macos-distribution.md), [Windows testing](testing-windows.md), and [release process](release-process.md).
