# Troubleshooting source runs and the macOS app

Open Posture can run from source on supported desktops or from a generated macOS DMG. The macOS app is copied to Applications but creates no login item, updater, privileged helper, or standalone uninstaller.

## macOS DMG does not build or open

On a Mac with the pinned Node/npm versions, run:

```bash
npm ci
npm run check
npm run make:mac
```

The host-architecture DMG is written under `out/make/`; open it and drag **Open Posture** to **Applications**. The local artifact is unsigned/ad-hoc and intended only for testing on the Mac that built it. Gatekeeper may warn or reject it after transfer or download. Do not disable Gatekeeper, remove quarantine globally, or publish the local artifact as production-ready.

A normal public DMG must be Developer ID signed and notarized, with a stapled ticket and checksum. If such a final downloaded artifact fails Gatekeeper, stop the release and report the exact version, architecture, and non-sensitive Gatekeeper message. See [macOS distribution](macos-distribution.md).

## Wrong Node or npm version

Required: Node 24.11.0 or newer within the 24.x line and npm 11.x. The verified repository pins are Node 24.14.0 and npm 11.18.0.

```bash
node --version
npm --version
```

Use the repository `.nvmrc`/`.node-version`, reopen the shell, then run `npm ci --ignore-scripts` for a source run or `npm ci` for macOS packaging. Do not use a different major version to bypass the toolchain check.

## `npm ci` or Electron download fails

- Confirm internet access is available during source setup.
- Confirm the committed `package-lock.json` is present and unchanged.
- Check any corporate proxy/npm configuration without posting credentials.
- Retry `npm ci --ignore-scripts` for a source run or `npm ci` for macOS packaging; do not replace the locked install with `npm install` for a verification result.

Electron 43 keeps its platform runtime download explicit. `npm start` and `npm run test:smoke` run the pinned installer before launch; use `npm run electron:install` to retry that step by itself.

Normal app runtime is offline after dependencies and assets are present.

## Model checksum fails

Run:

```bash
npm run model:verify
```

Do not run with an unverified or floating model. Restore the exact repository asset through a clean checkout. A legitimate model update follows [the reviewed model procedure](model.md).

## Blank window or startup failure

```bash
npm run typecheck
npm run build
npm run debug
```

Review only sanitized lifecycle/error output. Never post a full environment dump, username, absolute home path, camera frame, or raw landmark data.

Do not disable Electron/Chromium sandboxing, macOS Gatekeeper, Windows security, antivirus, or Linux privacy controls globally.

## Camera permission is off

The app requests video only after **Allow camera**.

- macOS: System Settings → Privacy & Security → Camera. An installed build appears as Open Posture; a source run may appear as Electron or the terminal. Restart the same app mode if required.
- Windows: Settings → Privacy & security → Camera; enable camera access and desktop-app access. Run the desktop app directly, not through WSL.
- Linux: verify the graphical session, `/dev/video*` access, portal/device policy, and the camera in another local app. Distribution details vary.

Choose **Check again** after changing permission. The app must not loop permission prompts.

## No camera, busy, or disconnected

- Close other applications using the camera.
- Refresh the device list or choose another camera.
- Reconnect an external camera and recheck framing.
- Recalibrate after changing camera or geometry.

Camera failure is neutral: it cancels pending alerts and must not lower history.

## Cannot assess or no pose

Use a seated front or three-quarter view. Show nose, both shoulders, and both ears or outer eyes; move closer/farther as the positioning guide requests. Improve front lighting and remove another visible person. Side profile, standing/walking, reclining, extreme angles, and major obstruction are unsupported in v0.x.

Cannot assess is not a posture judgment.

## Notifications do not appear

Native notifications are best effort in every distribution mode:

- An unsigned source run or local macOS DMG has weaker application identity. A signed/notarized app still depends on macOS notification permission and Do Not Disturb.
- Windows source runs set a development AppUserModelID, but reliable toast delivery can still require a matching Start Menu shortcut or signed installer identity.
- Linux requires a compatible notification service.

Use **Send test** and check the in-app alert/tray state. The app respects Do Not Disturb and cannot guarantee visibility over a full-screen application.

## Tray is unavailable

Some Linux desktops do not expose a compatible tray/status notifier. The app should keep a visible window and make Close/Quit explicit; it must never become an invisible uncontrollable process.

## GPU/WASM or high-resource problem

Record the commit, OS/build, architecture, generic hardware class, duration, settings, and numeric measurement. Use the performance issue form. Review profiles locally before sharing. The app should reduce inference from 5 to 3 to 2 FPS when p95 latency is high and perform zero capture/inference while paused.

## Corrupt or unwritable local data

The app should quarantine malformed JSON, preserve the prior valid file, load safe defaults, and report exactly what was reset. A full disk or denied write may allow monitoring to continue, but the UI must not claim history was saved. See [data lifecycle](data.md).

## Reporting safely

Use the structured issue form and include the shortest reproduction. Do not attach camera footage, identifiable screenshots, raw landmarks, usernames, absolute paths, secrets, or unreviewed diagnostics. Report privacy/security regressions privately through the repository Security tab.
