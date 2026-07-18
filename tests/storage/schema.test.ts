import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultConfig,
  createDefaultHistory,
  createStoredConfig,
  HISTORY_MAX_BYTES,
  parseConfigInput,
  parseLifecycleLogEntry,
  parseMinuteAggregate,
  parseStoredConfig,
  parseStoredHistory,
  pruneHistory,
  upsertMinuteAggregate,
  type ConfigInput,
  type MinuteAggregate,
} from '../../src/shared/storage/schema.ts';

const HASH = 'a'.repeat(64);

function configInput(): ConfigInput {
  return {
    setup: { onboardingComplete: true },
    settings: {
      sensitivity: 'balanced',
      previewEnabled: true,
      reducedMotion: false,
      largeStatus: false,
    },
    selectedCameraId: 'camera_token-1',
    calibration: {
      schemaVersion: 1,
      featureSchemaVersion: 1,
      model: { id: 'pose-landmarker-lite', version: '1.0.0', sha256: HASH },
      createdAt: '2026-07-18T00:00:00.000Z',
      deviceIdHash: HASH,
      anchorType: 'ears',
      features: {
        headHeight: { median: 0.7, sigma: 0.01 },
        headForward: { median: 0.3, sigma: 0.01 },
        headLateral: { median: 0, sigma: 0.01 },
        shoulderTilt: { median: 0, sigma: 0.01 },
      },
      quality: { validSamples: 50, durationMs: 10_000, coreCoverage: 1 },
    },
  };
}

function bucket(minute = '2026-07-18T00:00:00.000Z'): MinuteAggregate {
  return {
    bucketStartUtc: minute,
    localOffsetMinutes: 420,
    monitoredSeconds: 60,
    validSeconds: 45,
    scoreSum: 3_200,
    scoreSampleCount: 45,
    belowThresholdSeconds: 8,
    notificationCount: 1,
  };
}

test('configuration defaults and current schema round-trip exactly', () => {
  assert.deepEqual(createDefaultConfig('0.1.0'), {
    schemaVersion: 1,
    appVersion: '0.1.0',
    setup: { onboardingComplete: false },
    settings: {
      sensitivity: 'balanced',
      previewEnabled: true,
      reducedMotion: false,
      largeStatus: false,
    },
    selectedCameraId: null,
    calibration: null,
  });
  const stored = createStoredConfig(configInput(), '0.1.0');
  assert.deepEqual(parseStoredConfig(JSON.parse(JSON.stringify(stored))), stored);
});

test('configuration rejects unknown/private fields, paths, future versions, and non-finite values', () => {
  const input = configInput();
  assert.equal(parseConfigInput({ ...input, cameraLabel: 'Built-in camera' }), undefined);
  assert.equal(parseConfigInput({ ...input, selectedCameraId: '/Users/person/camera' }), undefined);
  assert.equal(parseConfigInput({ ...input, frames: [] }), undefined);
  assert.equal(parseConfigInput({ ...input, calibration: { ...input.calibration, rawLandmarks: [] } }), undefined);
  assert.equal(parseConfigInput({
    ...input,
    calibration: { ...input.calibration, featureSchemaVersion: 2 },
  }), undefined);
  const calibration = input.calibration!;
  assert.equal(parseConfigInput({
    ...input,
    calibration: {
      ...calibration,
      features: {
        ...calibration.features,
        headForward: { median: Number.NaN, sigma: 0 },
      },
    },
  }), undefined);
});

test('minute aggregates enforce UTC minute buckets, ranges, and score relationships', () => {
  assert.deepEqual(parseMinuteAggregate(bucket()), bucket());
  assert.equal(parseMinuteAggregate({ ...bucket(), bucketStartUtc: '2026-07-18T00:00:01.000Z' }), undefined);
  assert.equal(parseMinuteAggregate({ ...bucket(), validSeconds: 61 }), undefined);
  assert.equal(parseMinuteAggregate({ ...bucket(), validSeconds: 50, monitoredSeconds: 40 }), undefined);
  assert.equal(parseMinuteAggregate({ ...bucket(), scoreSum: 4_501 }), undefined);
  assert.equal(parseMinuteAggregate({ ...bucket(), scoreSum: Number.POSITIVE_INFINITY }), undefined);
  assert.equal(parseMinuteAggregate({ ...bucket(), rawLandmarks: [] }), undefined);
});

test('history rejects duplicate buckets and upsert replaces one whole aggregate', () => {
  const history = { ...createDefaultHistory(), buckets: [bucket()] };
  assert.deepEqual(parseStoredHistory(history), history);
  assert.equal(parseStoredHistory({ ...history, buckets: [bucket(), bucket()] }), undefined);
  const replacement = { ...bucket(), notificationCount: 2 };
  assert.deepEqual(upsertMinuteAggregate(history, replacement)?.buckets, [replacement]);
});

test('retention Off/7/30/90 uses the UTC cutoff and Off retains no buckets', () => {
  const now = Date.parse('2026-07-19T00:00:00.000Z');
  const atBoundary = bucket('2026-07-12T00:00:00.000Z');
  const expired = bucket('2026-07-11T23:59:00.000Z');
  for (const retentionDays of [7, 30, 90] as const) {
    const cutoff = new Date(now - retentionDays * 86_400_000).toISOString().replace(/:\d{2}\.000Z$/, ':00.000Z');
    const kept = bucket(cutoff);
    assert.deepEqual(pruneHistory({ schemaVersion: 1, retentionDays, buckets: [kept] }, now).buckets, [kept]);
  }
  assert.deepEqual(pruneHistory({ schemaVersion: 1, retentionDays: 7, buckets: [expired, atBoundary] }, now).buckets, [atBoundary]);
  assert.deepEqual(pruneHistory({ schemaVersion: 1, retentionDays: 0, buckets: [atBoundary] }, now).buckets, []);
});

test('representative 30-day minute history stays under 10 MiB and the 90-day maximum is accepted', () => {
  const sample = bucket();
  const thirtyDayBytes = Buffer.byteLength(JSON.stringify({
    schemaVersion: 1,
    retentionDays: 30,
    buckets: Array(30 * 24 * 60).fill(sample),
  }));
  const ninetyDayBytes = Buffer.byteLength(JSON.stringify({
    schemaVersion: 1,
    retentionDays: 90,
    buckets: Array(90 * 24 * 60).fill(sample),
  }));
  assert.ok(thirtyDayBytes < 10 * 1024 * 1024);
  assert.ok(ninetyDayBytes < HISTORY_MAX_BYTES);
});

test('lifecycle logging accepts only fixed codes and bounded aggregate timings', () => {
  assert.deepEqual(parseLifecycleLogEntry({ kind: 'lifecycle', code: 'app-start' }), { kind: 'lifecycle', code: 'app-start' });
  assert.deepEqual(
    parseLifecycleLogEntry({ kind: 'inference-summary', sampleCount: 10, averageMs: 20, p95Ms: 30 }),
    { kind: 'inference-summary', sampleCount: 10, averageMs: 20, p95Ms: 30 },
  );
  assert.equal(parseLifecycleLogEntry({ kind: 'error', code: '/Users/person/private' }), undefined);
  assert.equal(parseLifecycleLogEntry({ kind: 'lifecycle', code: 'app-start', message: 'user content' }), undefined);
  assert.equal(parseLifecycleLogEntry({ kind: 'inference-summary', sampleCount: 1, averageMs: 30, p95Ms: 20 }), undefined);
});
