# Manual platform smoke checklist

Run this checklist on the exact candidate commit. Mark each item **Pass**, **Fail**, or **Not tested** and explain deviations. A passing CI job is not a manual result.

## Evidence header

```text
Commit:
Date:
OS and build:
CPU architecture:
Node/npm:
Run mode (source / local unsigned DMG / signed public DMG):
Artifact filename and SHA-256, if applicable:
Signature/notarization/stapling status, if applicable:
Desktop/session (Linux):
Generic camera class:
Native notification service/status:
Assistive technology, if tested:
Verifier:
```

Do not record serial numbers. Do not capture or attach camera video, identifiable screenshots, raw landmarks, usernames, home paths, secrets, or unreviewed diagnostics.

## A. Fresh source run

- [ ] Clone into a new directory.
- [ ] Node is 24.x and npm is 11.x.
- [ ] `npm ci`, `npm run model:verify`, and `npm run check` pass.
- [ ] `npm start` opens one app window.
- [ ] A second `npm start` focuses the existing process and does not create another camera session.
- [ ] The UI and diagnostics identify this as a source run; no installed identity, updater, or App Store entry is implied.

## A2. macOS DMG install (when testing an installer)

- [ ] Record whether the artifact is local unsigned/ad-hoc or public Developer ID signed/notarized; do not infer trust from the filename.
- [ ] The filename includes exact product version and `arm64`/`x64`, matches the Mac architecture, and its final SHA-256 is recorded.
- [ ] The DMG mounts, contains **Open Posture** plus an Applications alias, copies successfully, ejects, and launches from Applications without Node/npm.
- [ ] Runtime reports the expected version, commit, architecture, and packaged state; wording no longer instructs the user to work in a clone.
- [ ] The model, worker, and WASM load from the installed bundle with networking disabled; licenses/notices are included.
- [ ] Camera is off before **Allow camera** and macOS names Open Posture in the video-only permission prompt/settings; no microphone permission appears.
- [ ] Quit and replace with the next test version preserves valid settings/calibration/history; uninstall/data-removal instructions match the observed packaged data path.
- [ ] No login item, updater, privileged helper, launch agent, Keychain item, or remaining process is created.
- [ ] For a public release only: the final downloaded DMG checksum passes, Developer ID identity and Hardened Runtime are correct, notarization/stapling validate, and Gatekeeper accepts the installed app on a clean account.

A local unsigned/ad-hoc DMG may warn or fail after transfer because it lacks public trust. Record that result, do not publish the artifact, and never disable Gatekeeper or remove quarantine globally. See [macOS distribution](macos-distribution.md).

## B. Consent and camera

- [ ] First launch leaves camera off before the privacy explanation and **Allow camera**.
- [ ] The OS request is video-only.
- [ ] Denial has accurate OS-specific recovery and no prompt loop.
- [ ] Grant/re-enable allows setup.
- [ ] Built-in/external camera selection works where available.
- [ ] Preview is mirrored; hiding preview does not claim camera-off.
- [ ] Busy, absent, and disconnected camera states are specific and neutral.

## C. Positioning and calibration

- [ ] Text and guide cover one person, head/shoulders, scale, confidence/light, and stability.
- [ ] Unsupported view and another person produce Cannot assess, not poor posture.
- [ ] Valid calibration completes and stores no image.
- [ ] Cancel/failed recalibration preserves the previous valid reference.
- [ ] Camera change pauses and requires framing/recalibration.

## D. Monitoring and correction

- [ ] Start enters Finding before an assessable result.
- [ ] Good, changing, Cannot assess, pending/cooldown, paused, snoozed, and error states are clear without color alone.
- [ ] Brief natural movement/absence does not alert or lower assessed history.
- [ ] Sustained synthetic/controlled drift produces at most one alert after complete dwell.
- [ ] Alert copy has no score, image, shame, urgency, or medical claim.
- [ ] Correction is relative to calibration, prefixed **If comfortable**, and recovers only after live criteria.

Do not deliberately hold a painful or unsafe posture to test alerts. Stop if uncomfortable.

## E. Desktop alerts and notifications

- [ ] Test notification reports requested or unavailable honestly.
- [ ] Native behavior is recorded, not assumed.
- [ ] Top-right desktop alert appears without stealing keyboard focus while the main window is visible, hidden, and behind another application.
- [ ] The alert is on the monitor containing the pointer, accepts no input, and disappears after 12 seconds.
- [ ] Clicking a current posture alert opens correction.
- [ ] Clicking a stale alert makes no stale posture claim.
- [ ] Native Do Not Disturb behavior is respected; the separate top-right alert remains honest and does not claim native delivery.

## F. Pause, snooze, tray, lock, and Quit

- [ ] Pause immediately releases the OS camera indicator/track.
- [ ] Snooze releases camera, shows duration, and resumes only as documented.
- [ ] Lock/suspend releases camera and remains paused after return.
- [ ] First close explains continued tray monitoring.
- [ ] Tray Open, Start/Pause, Snooze, Recalibrate, and Quit work.
- [ ] If tray is unavailable, the window remains controllable and close behavior is explicit.
- [ ] Quit leaves no process, worker, or camera track.

## G. History, data, and recovery

- [ ] Monitored and assessed time are distinct; Cannot assess is excluded.
- [ ] Score help says relative to calibration, not health/perfection.
- [ ] History Off still allows live monitoring and creates no bucket.
- [ ] Delete history, calibration, and all data have exact distinct effects.
- [ ] A failed write/delete never claims success.
- [ ] Sanitized diagnostics preview contains no forbidden data.

## H. Accessibility and layout

- [ ] Essential setup, monitoring, correction, history, deletion, and Quit work by keyboard.
- [ ] Focus is visible and task ordered.
- [ ] Status announcements are useful and do not repeat every score.
- [ ] At 200% zoom, essential actions remain visible without two-dimensional task scrolling.
- [ ] Reduced motion removes decorative motion.
- [ ] Preview/chart/color information has a text equivalent.
- [ ] Run VoiceOver, Narrator, or Orca for the core flow when available.

## I. Resources and offline boundary

- [ ] Production runtime completes the core flow with network disabled and no observed external request.
- [ ] Nominal monitoring does not sustain more than one logical CPU core.
- [ ] Paused/snoozed performs no capture/inference and returns near idle.
- [ ] Repeated pause/resume/reconnect shows no continuing resource growth.

Submit failures through the relevant structured issue form. Platform evidence changes a support claim only after maintainer review.
