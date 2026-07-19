# Privacy and trust model

Open Posture is local-first by construction. Normal app runtime has no external network access. There is no account, telemetry, analytics, crash upload, update check, remote configuration, advertising, newsletter, or cloud sync.

## Network boundary

`git clone`, `npm ci`, initial source setup, and downloading a published installer require internet access. Electron, npm packages, and the committed model are build/source dependencies. After setup or installation, normal runtime must make zero external DNS/TCP/UDP/HTTP(S)/WS(S) requests attributable to the app.

Every source run and packaged build uses local assets, a restrictive CSP with `connect-src 'none'`, a centralized Electron request blocker, denied downloads/navigation, and allowlisted user-activated external links. There is no development-server, hot-reload, installer, signing, notarization, or update-check network exception during normal app runtime.

## Camera boundary

- Camera permission is requested only after **Allow camera**.
- The request is video-only; microphone and unrelated permissions are denied.
- Frames exist only in renderer/worker memory.
- Frames and raw landmarks never cross IPC or enter storage, logs, diagnostics, tests, or issue attachments.
- Transferred frame objects are closed promptly.
- Pause, Snooze, lock/suspend, fatal capture/model failure, reset, and Quit release every camera track.
- Hiding preview is not camera-off and is never described that way.

The app does not recognize faces, identify people, or infer age, gender, ethnicity, emotion, disability, pain, or health.

## Stored locally

The implemented validated store contains only:

- preferences, onboarding state, selected-device binding, and one aggregate calibration;
- minute-level or coarser history;
- capped sanitized lifecycle/error/performance logs;
- one last-known-good backup or quarantined malformed local file.

It must not contain images, video, audio, screenshots, facial templates, raw landmarks, frame-level scores/features, camera labels, names, email, account IDs, usernames, or home paths. See [data lifecycle](data.md).

## Alerts and lock screens

Native notifications are best effort in source runs and installed applications. Signing/notarization improves macOS application identity and Gatekeeper trust but does not override notification permissions or Do Not Disturb. The fixed posture notification contains no image or score:

> **Hey — posture check**
>
> If comfortable, ease back toward your calibrated position.

Every current alert plays the operating system’s standard alert sound and creates a fixed-copy, non-focus-stealing window at the active monitor’s top-right for 12 seconds. It contains no image or score, accepts no input, opens no link, and works while the main window is hidden. Native notifications still respect operating-system Do Not Disturb; the separate Open Posture alert window and system sound are not native-notification delivery and follow the computer’s alert-volume settings.

## Diagnostics and issues

Diagnostics are local and previewed before copying. They may contain version, timestamps, lifecycle/state codes, non-sensitive error codes, and aggregate inference timing. They may not contain frames, landmarks, posture features, device labels/IDs, usernames, home paths, or user content.

Never attach camera footage, identifiable screenshots, raw landmarks, memory dumps, or unreviewed diagnostics to a public issue. Report a suspected external request, stored frame, microphone access, broad IPC, unsafe diagnostic, or deletion failure privately through GitHub’s repository security reporting.

## Research and future features

Contributor anecdotes and stars are not evidence of health benefit. Any research mode must be separate, explicit, off by default, local, manually exported by the participant, and limited to approved aggregate events. A future network feature requires a public design decision and threat review; it cannot silently weaken the offline promise.

Privacy regressions are release-blocking security vulnerabilities.

macOS packaging does not change this data inventory or trust boundary. Signing credentials and notarization keys are release infrastructure secrets: they never enter the application bundle, repository, ordinary CI, diagnostics, or runtime. See [macOS distribution](macos-distribution.md).
