# Windows verification without an owned Windows PC

The public `windows-2025` workflow is active and has passed the build, deterministic suite, and synthetic-camera Electron smoke on `main`. Describe this as **Windows 11 x64 CI-tested / physical verification wanted**—never fully verified until the physical checklist passes. The live status is linked from the CI badge in the repository README.

Three layers are required because none proves everything.

## Layer 1: GitHub-hosted Windows x64

`.github/workflows/ci.yml` runs on `windows-2025` for every pull request and main-branch push:

- clean Node 24/npm install from the lockfile;
- typecheck, deterministic tests, model checksum, and production compile;
- fake-camera Electron smoke;
- security/offline logic and process teardown as those tests land.

A passing public job proves its exact source commit compiles and its deterministic/synthetic suites pass on hosted Windows x64. A configured workflow alone proves none of that, and even a pass does **not** prove physical camera drivers, native toast policy, tray overflow, GPU/power, sleep, or consumer hardware.

## Layer 2: Windows 11 ARM virtual machine on Apple Silicon

Use a current Windows 11 ARM64 VM in VMware Fusion 13.5 or newer:

1. Install Windows 11 ARM64, not an x64 ISO.
2. Install ARM64 Git and Node 24/npm 11.
3. Enable camera passthrough or attach a USB webcam if supported.
4. In PowerShell:

```powershell
git clone <repository-url>
cd <repository-directory>
node --version
npm --version
npm ci --ignore-scripts
npm run model:verify
npm run check
npm start
```

5. Run [the manual smoke checklist](manual-smoke.md), especially permission, in-app fallback, tray, pause/snooze, close/quit, and lock/resume.

Record Windows build, ARM64 architecture, generic camera class, commit, and checklist results. Do not call optional x64 Node under ARM emulation physical or native x64 verification.

## Layer 3: volunteer physical Windows 11 x64

Before a release line may say **Windows verified**, a volunteer must run the exact candidate commit on a physical Windows 11 x64 computer with a real webcam.

Required focus:

- fresh PowerShell source setup outside WSL;
- camera permission grant, denial, re-enable, busy, disconnect, reconnect;
- positioning, calibration, sustained alert, recovery, and in-app fallback;
- actual native notification status without claiming delivery when absent;
- tray overflow/menu updates, first close, reopen, explicit Quit;
- sleep/lock releases camera and remains paused;
- CPU/memory snapshot and no retained process/camera after Quit;
- keyboard flow and Narrator where possible.

Submit the structured Platform Verification issue. Include no footage, identifiable screenshot, raw landmark, device identifier, username, absolute path, or unreviewed diagnostic.

## Evidence record

```text
Commit:
Date:
Windows edition/build:
Architecture:
Node/npm:
Generic camera class:
Checklist version/commit:
Pass/fail/not-tested by item:
Redacted limitations:
Verifier GitHub handle (optional/public):
Reviewer:
```

One result does not cover the Windows hardware ecosystem. Preserve the exact claim and evidence date in release notes.
