# Posture comparison algorithm

Open Posture compares a person’s current pose with a comfortable reference they chose during calibration. The result is a local similarity signal, not an ergonomic, health, diagnostic, or universal posture score.

## Supported context

Version 0.x supports one seated adult in a front or three-quarter view. Nose, both shoulders, and a consistent bilateral head anchor must be visible. Hips improve torso cues but are optional.

Side profile, reclining, standing/walking, extreme camera angles, major obstruction, or multiple qualifying people produce **Cannot assess**, never a low score. Natural reaching, drinking, stretching, turning, standing, and leaving the frame are neutral.

## Model and sampling

| Setting | v0.x value |
|---|---|
| Model | Checksum-pinned local MediaPipe Pose Landmarker Lite |
| Mode | Video; segmentation masks off |
| Requested poses | 2, only to detect another qualifying person |
| Detection/presence/tracking confidence | 0.5 / 0.5 / 0.5 |
| Normal inference | 5 FPS, adapting to 3 then 2 FPS under load |
| Away inference | 1 FPS after 30 seconds away |
| Landmark floor | visibility and presence at least 0.55 |
| Required-point mean | at least 0.70 |

No qualifying pose for two seconds enters Away and resets alert dwell. Return requires three valid samples spanning at least two seconds. Invalid time cannot advance drift, lower history, or trigger an alert.

## Calibration

Calibration samples approximately ten seconds and requires at least 35 valid samples within at most 60 elapsed seconds. It rejects missing required landmarks, excessive movement, low confidence, another qualifying person, or camera loss.

For each normalized feature it stores the median and robust dispersion:

```text
sigma = 1.4826 × median(abs(sample − median))
```

Only aggregate feature references and quality summaries persist. Partial attempts, frames, raw landmarks, and sample time series are discarded. An incompatible model or feature-schema version requires explicit recalibration.

## Personalized features

Let `S` be shoulder midpoint, `H` the calibrated ear/outer-eye midpoint, `P` the optional hip midpoint, `w2` 2D shoulder width, and `w3` world-coordinate shoulder width.

| Feature | Value | Penalized direction | Floor | Severe range |
|---|---|---|---:|---:|
| Head height | `(S.y − H.y) / w2` | lower than baseline | 0.08 | 0.30 |
| Head forward | `(S.z − H.z) / w3` | above baseline | 0.10 | 0.40 |
| Head lateral | `(H.x − S.x) / w2` | absolute change | 0.08 | 0.25 |
| Shoulder tilt | `(right.y − left.y) / w2` | absolute change | 0.06 | 0.20 |
| Torso height, optional | `(P.y − S.y) / w2` | lower than baseline | 0.10 | 0.35 |
| Torso forward, optional | `(P.z − S.z) / w3` | above baseline | 0.10 | 0.35 |

For each available feature:

```text
deadZone = max(floor, 3 × calibration sigma)
severity = clamp((deviation − deadZone) / severeRange, 0, 1)
rawScore = round(100 × (1 − max(available severities)))
```

The worst normalized deviation drives the score and primary cue. Fewer than three core features, unavailable head height/forward, malformed values, or insufficient confidence produce Cannot assess.

Tie priority within severity 0.02 is head forward, head height, torso forward, torso height, head lateral, then shoulder tilt. This deterministic rule avoids opaque learned weights.

## Smoothing and alerts

Elapsed monotonic time drives all behavior:

```text
alpha = 1 − exp(−dt / 2 seconds)
EMA = alpha × rawScore + (1 − alpha) × prior EMA
```

| Preset | Alert threshold/dwell | Cooldown |
|---|---|---|
| Gentle | below 55 for 30 valid seconds | 15 minutes |
| Balanced | below 65 for 15 valid seconds | 10 minutes |
| Strict | below 75 for 8 valid seconds | 5 minutes |

Balanced dwell decreases between 65–69 and resets at 70 or above. Recovery requires 75 or above for three valid seconds. After cooldown, a fresh complete dwell is required; remaining low cannot create repeated notifications.

The worker keeps the frame-level raw score internal. Renderer events contain only the rounded smoothed score, derived severities/cue/coverage/quality, and derived recovery dwell needed for the live reset-progress indicator.

Pause, snooze, confidence loss, camera/model failure, calibration, lock/suspend, and settings invalidation cancel pending dwell. Resume requires 15 seconds of new confident monitoring before an alert is eligible.

## Cues

Cues are conditional, gentle, and always relative to calibration: raise head slightly, ease head back, re-center over shoulders, relax shoulders toward reference, sit a little taller, or bring torso back. Prefix movement guidance with **If comfortable**. Never infer pain, diagnosis, disability, emotion, identity, or a medically correct position.

## Changing the algorithm

A scoring/calibration change requires:

1. public design issue describing the behavior and motivation;
2. deterministic positive, boundary, failure, and natural-movement fixtures;
3. user-visible threshold/cue analysis;
4. calibration compatibility decision and migration/recalibration behavior;
5. full platform, privacy, performance, and model-fixture checks;
6. updated documentation and changelog.

See [model provenance](model.md) and [testing](testing.md).
