# Pose model provenance and updates

Open Posture uses MediaPipe Pose Landmarker Lite locally. The model and WASM/runtime assets are not fetched while the app runs.

## Current model

| Property | Value |
|---|---|
| File | `assets/models/pose_landmarker_lite.task` |
| Upstream | Google MediaPipe Pose Landmarker Lite, float16 |
| Retrieved | 2026-07-18 |
| SHA-256 | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |
| License | Apache License 2.0; recheck upstream model card/terms on update |

The checksum is also stored in `assets/models/pose_landmarker_lite.sha256` and enforced by `npm run model:verify`.

## Why the model binary is committed

The runtime requires a pinned model asset. Committing the exact model makes offline behavior, review, and reproducible testing possible. Source setup downloads Electron through the locked npm dependency; macOS packaging then includes Electron and the emitted model/WASM assets inside the generated application. Generated applications and DMGs are distribution artifacts and are never committed to Git.

## Runtime configuration

- Video mode.
- Segmentation masks disabled.
- At most two poses, solely to identify a second qualifying person.
- Detection, presence, and tracking thresholds at 0.5.
- Normal sampling at 5 FPS with documented adaptive reduction.
- Raw model output is converted to features and released; it is never persisted or sent over IPC.

## Update procedure

A model change must be a separate pull request that:

1. links a public design issue and upstream model card/source;
2. records retrieval date, exact version, license, notices, file size, and SHA-256;
3. updates the committed checksum and package/runtime references;
4. verifies no runtime download or telemetry is introduced;
5. reruns all deterministic calibration/scoring/natural-movement fixtures;
6. reruns camera, multiple-person, confidence, performance, memory, and platform tests;
7. compares output distributions and user-visible threshold/cue changes;
8. decides explicitly whether existing calibrations remain compatible or require recalibration;
9. updates algorithm, privacy, model, notices, and changelog documents.

For a macOS release, also prove that the checksum-identical model is present and loads from the final packaged application with networking disabled. A package must not replace the committed asset with a runtime download. See [macOS distribution](macos-distribution.md).

Do not replace the model through an automated Dependabot pull request or a floating `latest` download. A checksum alone proves identity, not safety, quality, license compatibility, or behavior.

## Limitations

Model landmarks are estimates and vary with camera angle, lighting, occlusion, clothing, body proportions, hardware, and movement. Confidence gating and personal calibration reduce some variation but do not establish medical or ergonomic correctness. Unsupported or uncertain input must produce Cannot assess.
