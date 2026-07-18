# Third-party notices

This source project depends on open-source components resolved by the committed package lock. The dependency tree and license metadata are reviewed before each source release.

## Electron

- Project: https://www.electronjs.org/
- Source: https://github.com/electron/electron
- License: MIT
- Version: pinned in `package-lock.json`

Electron contains Chromium, Node.js, and other third-party components. Their notices are included with the Electron dependency downloaded during `npm ci`.

## MediaPipe Tasks Vision

- Package: `@mediapipe/tasks-vision`
- Source: https://github.com/google-ai-edge/mediapipe
- License: Apache License 2.0
- Version: pinned in `package-lock.json`

## Pose Landmarker Lite model

- File: `assets/models/pose_landmarker_lite.task`
- Source and checksum: `assets/models/README.md`
- Upstream: Google MediaPipe
- License: Apache License 2.0; upstream model terms and notices must be rechecked on update

## Build-time dependencies

Webpack, TypeScript, loaders, and type declarations are development-only dependencies. Exact versions and licenses are resolved by `package-lock.json` and audited for each source release.

No SuperShrimp source code, brand assets, screenshots, illustrations, copy, or proprietary material are included.
