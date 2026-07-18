# macOS distribution requirements and ownership

Status: implementation contract for direct distribution outside the Mac App Store. It adds a downloadable installer without changing Open Posture's Apache-2.0 license, offline runtime, local-only data model, or non-medical product boundary.

The first deliverable is a conventional drag-to-Applications disk image (`.dmg`). A `.pkg`, Mac App Store build, login item, privileged helper, auto-updater, and background launch agent are out of scope until a demonstrated user need justifies them.

## Release targets

| Target | Requirement |
|---|---|
| Operating system | macOS 13 Ventura or newer |
| Architectures | Apple silicon (`arm64`) and Intel (`x64`) as separate artifacts |
| Product/bundle name | `Open Posture` / `Open Posture.app` |
| Bundle identifier | Immutable `io.openposture.app`; never change it merely because branding changes |
| Version | `CFBundleShortVersionString`, `CFBundleVersion`, and the release artifact version equal the current `package.json` version (`0.1.0` for this candidate) |
| Minimum OS metadata | `LSMinimumSystemVersion` is `13.0` |
| Distribution channel | GitHub Releases, direct download; not the Mac App Store |

Both architecture artifacts are first-class. An artifact may be called supported only after it is built, installed from its final DMG, and tested on matching hardware or an appropriate hosted runner. Do not describe an `arm64` local pass as Intel evidence.

## Build and package contract

Maintainer commands:

```bash
npm ci
npm run check
npm run make:mac          # host architecture
npm run make:mac:arm64
npm run make:mac:x64
```

Expected unpacked applications:

```text
out/Open Posture-darwin-arm64/Open Posture.app
out/Open Posture-darwin-x64/Open Posture.app
```

Expected DMGs:

```text
out/make/Open Posture-0.1.0-arm64.dmg
out/make/Open Posture-0.1.0-x64.dmg
```

The version shown above is illustrative; filenames must always contain product, exact version, and architecture. If Forge emits a different intermediate name, the release job must rename it to this contract before checksumming or uploading.

Packaging must:

- run the existing production Webpack build and package `.webpack/build`, not development or hot-reload output;
- include the emitted MediaPipe worker, WASM files, and checksum-pinned pose model and prove they load with networking disabled;
- use Electron's ASAR packaging and production dependency pruning, while leaving emitted runtime assets readable at their generated URLs;
- include `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` at the verified root of the packaged `app.asar`;
- include an original `icon.icns` generated from the checked-in Open Posture artwork with 16 through 1024 pixel representations;
- create a DMG containing `Open Posture.app` and an Applications-folder alias; installation must require no terminal, Node.js, npm, administrator privilege, or account;
- preserve the existing sandbox, context isolation, video-only permission policy, runtime network denial, CSP, navigation denial, and packaged-build DevTools denial;
- show installed-build wording in About, permission recovery, and diagnostics; it must not claim the user is running from source or has a clone;
- produce no updater configuration, login item, daemon, kernel/system extension, or extra permission.

The bundle metadata must use `Open Posture` consistently for the display name and data identity. The installed application's build commit must identify the exact release commit rather than `uncommitted`.

## Camera permission and entitlements

The packaged app must declare this or equivalently clear, privacy-accurate copy in `NSCameraUsageDescription`:

> Open Posture uses the camera to compare your position with the personal reference you choose. Video stays on this Mac and is not recorded.

Requirements:

- The application asks for camera access only after the user selects **Allow camera** in onboarding.
- It requests video only. It must not contain `NSMicrophoneUsageDescription`, request an audio track, or gain a microphone entitlement.
- Denial must keep the camera off and direct users to **System Settings → Privacy & Security → Camera → Open Posture**.
- Direct distribution uses Hardened Runtime, not Mac App Store App Sandbox. Use the official Electron signer defaults needed by the pinned Electron/V8 runtime and apply required inherited entitlements to helpers.
- Audit the final effective entitlements. Do not add network client/server, Apple events, location, contacts, accessibility control, file-wide access, `get-task-allow`, or device entitlements that the current app does not use.
- Signing must cover the main app and every nested executable, framework, helper, and native binary. Do not use `codesign --deep` as a substitute for correct inside-out signing.

The stable bundle identifier, Developer ID team, and application name must remain unchanged across upgrades so macOS can associate permissions and application data with the same product.

## Local unsigned build versus public release

### Local trial build

`npm run make:mac` must create an unsigned or ad-hoc-signed host-architecture DMG without Apple credentials. This is the artifact the maintainer can try immediately on the Mac that built it.

- A locally created artifact that has not acquired download quarantine may open normally on that Mac.
- Once transferred or downloaded, Gatekeeper may warn or reject it because it lacks a trusted Developer ID signature and notarization ticket. That is expected and is not a product test failure.
- A maintainer may use Finder's explicit **Open** action for their own unsigned test. Public instructions must not tell users to disable Gatekeeper, remove quarantine attributes, or lower system security.
- An unsigned build proves packaging and runtime behavior only. It does not prove signing, notarization, stapling, download, or first-launch trust.
- Never publish or describe an unsigned artifact as the normal production download.

### Public signed release

A public DMG must be built from the exact protected release commit, signed with a valid **Developer ID Application** certificate, use Hardened Runtime and a secure timestamp, be accepted by Apple's notary service, and have the ticket stapled to the final DMG. Checksums are generated only after stapling because stapling changes the file.

Gatekeeper acceptance is a release gate:

```bash
codesign --verify --deep --strict --verbose=2 "Open Posture.app"
codesign --display --verbose=4 "Open Posture.app"
spctl --assess --type execute --verbose=4 "Open Posture.app"
xcrun stapler validate "Open Posture-<version>-<arch>.dmg"
```

The release engineer must also inspect the notarization result/log and verify the final downloaded GitHub asset on a clean macOS account. A successful upload alone is not notarization evidence.

Apple requires Developer ID signing, Hardened Runtime, secure timestamps, and notarization for trusted direct distribution. Use current Apple tooling (`notarytool`, not legacy `altool`). See [Apple's notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) and [Electron's signing guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing).

## Signing and notarization inputs

Local unsigned builds require no paid account or secret. A public signed release requires:

1. Active Apple Developer Program membership.
2. The immutable `io.openposture.app` bundle identifier and Apple Developer Team ID.
3. A Developer ID Application certificate and private key exported as a password-protected PKCS#12 file.
4. A least-privilege App Store Connect API key authorized to use Apple's notary service: private `.p8` key, key ID, and issuer ID.
5. A protected GitHub `macos-release` environment with required reviewer approval.

Use these repository/environment secret names; the repository must contain names only, never values:

| GitHub secret | Purpose |
|---|---|
| `MACOS_CERTIFICATE` | Base64-encoded Developer ID Application certificate and private key |
| `MACOS_CERTIFICATE_PASSWORD` | Password for that PKCS#12 export |
| `MACOS_SIGN_IDENTITY` | Exact Developer ID Application signing identity |
| `APPLE_API_PRIVATE_KEY` | Base64-encoded App Store Connect API private key |
| `APPLE_API_KEY_ID` | App Store Connect API key identifier |
| `APPLE_API_ISSUER` | App Store Connect issuer identifier |

The release job imports the certificate into an ephemeral keychain, writes the API key to a temporary mode-`0600` file, masks values, and deletes both before job completion. Signing secrets are available only to protected tag/manual release jobs after environment approval—never pull requests, forks, ordinary CI, logs, caches, or unsigned artifacts. Pin third-party actions to immutable commit SHAs.

Certificate renewal or API-key rotation must not change the bundle identifier or Developer ID team. Revoke and rotate immediately after suspected disclosure, then document affected releases through the security process.

## Release artifacts and checksums

Attach only these macOS binaries to a GitHub Release:

```text
Open Posture-<version>-arm64.dmg
Open Posture-<version>-x64.dmg
SHA256SUMS.txt
```

The protected per-architecture workflow produces a final DMG plus a `.sha256` sidecar as a bounded GitHub Actions artifact; it does not create a GitHub Release or a combined manifest. The release maintainer downloads both architecture artifacts, verifies each sidecar and DMG, then creates `SHA256SUMS.txt` with lowercase SHA-256 values and exact filenames sorted by filename. After attaching the two DMGs and combined manifest to the draft GitHub Release, the maintainer downloads all three again and verifies them before publication. Release notes state supported OS, architecture choice, privacy boundary, manual install/upgrade instructions, known limitations, and the exact commit.

Do not commit `.app`, `.dmg`, signing material, notarization credentials, keychains, or generated `out/` content to Git. GitHub's source archives remain available independently of installer assets.

## User flows

### Install and first launch

1. User downloads the DMG matching **Apple silicon** or **Intel** and may verify `SHA256SUMS.txt`.
2. User opens the DMG, drags **Open Posture** into **Applications**, ejects the disk image, and opens the installed app.
3. Gatekeeper identifies the signed/notarized developer on first launch without requiring a security bypass.
4. Open Posture opens with the camera off and explains local processing.
5. Only after **Allow camera**, macOS displays the Open Posture camera prompt. The app never asks for microphone access.
6. The user positions themselves, calibrates a comfortable personal reference, and starts monitoring. Tray, notification, correction, pause/snooze, lock/sleep, and Quit behavior remains the same as the verified source app.

The app must also run when installed for only the current user in a writable folder, but the documented path is `/Applications/Open Posture.app`.

### Upgrade

1. User quits from the tray and verifies that the camera indicator and process stop.
2. User opens the new DMG and replaces the existing Applications copy when Finder asks.
3. On launch, settings, calibration, and retained aggregate history are preserved through the existing storage migration rules. No camera frame or landmark migration exists.
4. A failed migration preserves the prior data and reports a neutral recovery state; it must not falsely claim success.

There is no automatic update check or background download. Release notes must call out incompatible calibration/model/schema changes and rollback limitations. Downgrades are unsupported unless that exact path is covered by a release test.

### Uninstall and data removal

1. User selects **Quit** from the tray and confirms no Open Posture process or camera indicator remains.
2. For a privacy-complete removal, the user first chooses **Settings → Privacy/Data → Delete all app data**, or manually removes the documented Open Posture directory under `~/Library/Application Support/` after quitting.
3. User moves `/Applications/Open Posture.app` to Trash and empties Trash when desired.

Removing the app does not silently remove user data, and deleting app data does not uninstall the app. The uninstall documentation must name the exact packaged `app.getPath('userData')` location verified from a release build; it must not guess. macOS controls any retained permission/notification preferences, which users can change in System Settings. Open Posture creates no login item, launch agent, privileged helper, kernel extension, or Keychain entry requiring separate cleanup.

## Acceptance criteria

A local trial DMG is ready when all of the following pass on the host Mac:

- clean `npm ci`, `npm run check`, `npm run make:mac`, and the existing Electron smoke test;
- DMG mounts, shows the app and Applications alias, copies successfully, and launches from Applications;
- installed runtime reports `isPackaged: true`, correct version/commit/architecture, and installed—not source-run—copy;
- pose worker, both WASM variants, and model load from the packaged bundle with network disabled;
- camera remains off until explicit consent; video-only permission, calibration, monitoring, alert/fallback, correction, pause, snooze, close-to-tray, lock/sleep, and Quit pass;
- app icon, tray assets, keyboard navigation, 200% zoom, reduced motion, and core VoiceOver flow pass;
- update-over-old-copy preserves valid local data; delete-all and uninstall documentation match the packaged data path;
- no credentials, personal paths, camera material, raw landmarks, updater endpoints, or unexpected outbound request appear in the bundle or logs.

A public release additionally requires, for **each** architecture artifact:

- exact release commit and version; clean build on the corresponding macOS runner;
- Developer ID signature on all nested code, Hardened Runtime, secure timestamp, and no disallowed entitlement;
- notarization accepted, ticket stapled and validated, `codesign` strict verification successful, and `spctl` assessment accepted;
- final-DMG checksum verified after a release-asset download;
- install and first-launch Gatekeeper flow checked from the downloaded DMG on a clean account;
- the complete macOS sections of [the manual smoke checklist](manual-smoke.md), including real camera, native notification, tray, sleep/lock, offline, and VoiceOver evidence;
- no unresolved release-blocking privacy, security, data-loss, camera-lifecycle, accessibility, signing, or packaging defect.

Until the signed/notarized and matching-architecture evidence exists, label artifacts **local unsigned test build** or **CI-tested**, not production-ready or macOS-verified.

## Team ownership

One person may fill multiple roles for this open-source project, but every responsibility must have an explicit owner for a release. The signer and final release approver should be different people when the maintainer pool permits it.

| Role | Accountable responsibilities |
|---|---|
| macOS release engineer | Forge/packager configuration, architecture builds, DMG layout, bundle metadata, signing order, notarization/stapling, checksums, artifact upload, release runbook |
| Electron application engineer | Packaged resource paths, packaged-state copy/capabilities, camera and lifecycle behavior, data migration, runtime offline/security invariants |
| Product security and signing custodian | Apple account/certificate/API-key lifecycle, least-privilege GitHub environment, entitlement review, secret rotation, signature/notary evidence, incident response |
| macOS QA engineer | Clean-account install, Gatekeeper, camera/TCC, notifications, tray, upgrade/uninstall, Intel/Apple-silicon matrix, sleep/lock, offline and soak evidence |
| Accessibility and product reviewer | VoiceOver/keyboard/zoom/reduced-motion pass; privacy, correction, permission, Gatekeeper, and non-medical copy approval |
| Release maintainer | Select exact protected commit, verify required evidence and known limitations, approve tag/release, publish or stop the release |

The release engineer assembles evidence; QA records independent results; the security custodian approves signing inputs and entitlements; the release maintainer owns the final go/no-go decision. A failed mandatory gate stops publication rather than being hidden by release wording.
