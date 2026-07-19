# Release process

Open Posture uses SemVer and always publishes source tags, release notes, and GitHub-generated source archives. A release may additionally attach macOS arm64/x64 DMGs only after the exact artifacts pass the protected signing, notarization, stapling, checksum, and installed-app gates. Never attach a local unsigned/ad-hoc DMG, App Store package, updater, container, or unrelated CI artifact.

## Before a release candidate

1. Choose the exact candidate commit from protected `main`.
2. Confirm scope in the changelog and roadmap; no placeholder behavior or copied asset remains.
3. Confirm behavior changes have focused tests and update only the affected architecture, privacy, data, testing, troubleshooting, or contributor docs.
4. Confirm dependency/model versions, checksums, licenses, notices, and provenance.
5. Confirm migration and rollback behavior from the previous source or installed release.
6. For a macOS installer candidate, finalize the immutable bundle identifier and confirm the generated application contains the local model/WASM assets and required license notices.

## Automated gates

On the exact candidate commit require:

- locked install, typecheck, deterministic tests, model verification, and production compile;
- Electron fake-camera smoke on macOS, Windows, and Linux/Xvfb;
- offline, CSP, permission, IPC, storage-escape, and privacy tests;
- no critical/serious automated accessibility finding;
- enforced 90% posture-engine and 80% overall shared branch coverage, with no accidental focused/skipped test;
- CodeQL, dependency review, license/notices, and checksum checks;
- no generated app binary/DMG or signing secret committed to Git, no personal camera data, unsafe diagnostics, secret, or unlicensed asset;
- ordinary pull-request/fork jobs cannot access release credentials or publish signed artifacts.

No unresolved release-blocking defect, privacy regression, critical shipped vulnerability, data-loss bug, or known release-suite flake may remain.

## macOS artifact gates

`npm run make:mac` creates a host-architecture local unsigned/ad-hoc test DMG. It may prove packaging and installed runtime behavior, but it cannot prove Developer ID trust, notarization, stapling, or public download behavior and must not be published as the production download.

For each public `arm64` and `x64` DMG require:

- clean build from the exact protected tag commit on the corresponding macOS runner;
- correct product/version/architecture filename and packaged build commit;
- video-only camera purpose string, correct icon/bundle identity, local model/WASM assets, and license/notices;
- valid Developer ID Application signatures on all nested code, Hardened Runtime, secure timestamp, and reviewed minimal entitlements;
- Apple notarization accepted, ticket stapled and validated, strict `codesign` verification, and Gatekeeper `spctl` acceptance;
- SHA-256 manifest generated after stapling and reverified after downloading the GitHub release assets;
- installed-DMG smoke on a clean account, including application copy, offline model load, upgrade/data preservation, and documented uninstall path.

Use the protected secret and ownership contract in [macOS distribution](macos-distribution.md). A failed mandatory artifact gate stops publication. Release credentials are never exposed to fork/pull-request jobs, application bundles, logs, caches, or repository files.

The protected workflow produces per-architecture GitHub Actions artifacts and sidecar hashes as evidence; it does not publish a GitHub Release. The release maintainer must download and verify both, create the combined `SHA256SUMS.txt`, attach the approved files to a draft release, redownload and verify them, and only then publish.

## Reliability gates

- Current two-hour fake-camera soak for every public release.
- Current eight-hour soak before a stable release.
- Startup, model, responsiveness, inference, queue, memory, CPU, pause, storage, and alert-rate budgets recorded with reference hardware/OS.
- Prior-version migration succeeds; forced migration failure preserves the original.

A privacy, retained-camera, unbounded-queue, data-loss, unsafe-cue, critical-accessibility, or alert-flood failure cannot be waived. Another performance miss requires a public issue, evidence, and an honestly narrowed platform claim.

## Platform evidence

- macOS source claim: current physical permission/camera/tray/alert/fallback/pause/snooze/quit checklist.
- macOS installer claim: the same physical checklist run from the final installed DMG, plus matching-architecture Gatekeeper/signing/notarization/checksum evidence. A local unsigned/ad-hoc DMG is not public-release evidence.
- Windows: hosted x64 CI and ARM VM. Physical Windows 11 x64 is mandatory before saying **Windows verified**; otherwise say **CI-tested / physical verification wanted**.
- Linux: fake-camera/Xvfb is automated. State current X11/Wayland physical evidence and limitations separately.
- Fresh-clone commands pass on every platform carrying a verified claim.

Use [manual smoke](manual-smoke.md) and [Windows testing](testing-windows.md). Never turn CI evidence into a physical-hardware claim.

## Human-facing review

Maintainer signs off on exact alert/correction wording, personal-reference/non-medical boundary, privacy inventory, accessibility evidence, and original asset provenance. User anecdotes, stars, and social engagement are not efficacy evidence.

## Tag and notes

Use an annotated SemVer tag. Release notes contain:

```text
Summary
Source prerequisites and exact run commands
macOS artifact names, architecture choice, install/upgrade/uninstall instructions, and signing/notarization status
Changes: Added / Changed / Fixed / Security
Data migration and rollback
Model/algorithm changes and calibration compatibility
Platform status: CI-tested vs physically verified, with dates
Known limitations and unsupported contexts
Privacy/offline statement
Test, soak, accessibility, and manual evidence links
Dependency/model/license notice changes
Upgrade instructions: source users stop/pull/checkout/npm ci/verify/run; macOS users Quit and replace the Applications copy from the new DMG
```

Always verify the tag points to the tested commit. Source-only releases attach no files. A macOS binary release attaches only the final signed/notarized/stapled `Open Posture-<version>-arm64.dmg`, `Open Posture-<version>-x64.dmg`, and `SHA256SUMS.txt`; GitHub-generated source archives remain available. If either architecture is not ready, omit it and narrow the release claim rather than substituting an unsigned artifact.

## After release

- Recheck the documented source commands from the tag and, when published, redownload and verify each macOS DMG/checksum.
- Watch private security reports and structured issues.
- Classify regressions by severity and add deterministic tests where reproducible.
- Patch from protected `main`; do not rewrite published tags.
- Keep platform claims tied to the release line and evidence date.

## Branch protection

Protect `main`: pull requests, required CI/CodeQL/dependency checks, resolved review threads, and one maintainer approval for non-maintainer changes. Use squash merge by default. Protect the `macos-release` environment with reviewer approval; do not expose signing/notary secrets to fork or ordinary pull-request workflows.
