# Local data and lifecycle

This document is the implemented persistence contract. The privileged storage service validates, writes, recovers, prunes, and deletes these files; the UI still reports success only after the operation succeeds.

## Location and access

All app-created data lives in one dedicated child directory beneath Electron’s `app.getPath('userData')`, never in the repository. Use user-only `0600` permissions where supported and the current user’s app-data ACL on Windows. Renderer code cannot write files directly.

## Files

| File | Allowed | Forbidden |
|---|---|---|
| `config.json` | Schema/app version, onboarding, validated preferences, selected-device binding, one calibration | Name, email, account, camera label, frames, raw landmarks |
| `history.json` | Retention and UTC minute buckets with valid seconds, score aggregate, below-threshold seconds, notification count | Frame timestamps/scores, images, raw features/landmarks |
| `logs/app.log` | Version, timestamps, lifecycle/state/error codes, aggregate model timing | Calibration/features, device IDs/labels, usernames/home paths, content, frames |
| backup/quarantine | One known-good prior JSON or original malformed file | Any new data category |

Logs are capped at 5 MB. All app-owned settings/history/logs excluding model/cache should remain below 10 MB at default retention.

## Calibration record

The validated record contains schema/model/feature versions, UTC creation time, minimal local device binding, calibrated head-anchor type, sample count, duration, shoulder-scale median, aggregate quality, and feature `{ median, sigma }` values. It never contains a sample series. Unknown or incompatible versions block scoring and request recalibration.

## History bucket

Each minute-or-coarser bucket contains:

```text
bucketStartUtc
localOffsetMinutes
validSeconds              0..60
scoreSum                  finite and non-negative
scoreSampleCount          non-negative integer
belowThresholdSeconds     0..60
notificationCount         non-negative integer
```

Average similarity is `scoreSum / scoreSampleCount` only when the count is positive. Cannot-assess time is excluded. UTC plus the observed offset prevents DST/timezone changes from duplicating buckets.

## Validation and writes

At the privileged boundary, reject unknown keys, invalid types, non-finite values, out-of-range values, unsupported versions, oversized inputs, and unsafe paths. Writes use an adjacent temporary file, flush where practical, atomic replacement, and one last-known-good backup. Never replace valid JSON with a partial file.

A migration works on a copy and commits only after complete validation. Failure leaves the original byte-for-byte intact and produces a visible recovery path.

## Retention and deletion

- Default history: 30 days.
- Supported: Off, 7, 30, or 90 days.
- History Off creates no buckets and does not disable live monitoring.
- Prune on startup and no more than once per local day.
- Delete history removes history and its backups only.
- Delete calibration stops monitoring and returns to setup; history/settings remain.
- Reset all stops the camera, clears memory, removes all app-created files, and returns to first run.

Deletion requires no account, identity check, network, or maintainer service. A failed write, migration, or deletion must be reported accurately; the UI never claims success speculatively.

## Schema changes

A data-format pull request includes current and prior fixtures, forward migration, forced-failure rollback, maximum-size validation, exact deletion effects, privacy review, and changelog/data-document updates.
