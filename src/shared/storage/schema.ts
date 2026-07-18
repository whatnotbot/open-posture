import type { CalibrationProfile, FeatureName } from '../posture/index';

export const STORAGE_SCHEMA_VERSION = 1 as const;
export const CONFIG_MAX_BYTES = 256 * 1024;
export const HISTORY_MAX_BYTES = 32 * 1024 * 1024;
export const LOG_MAX_BYTES = 5 * 1024 * 1024;
export const DIAGNOSTICS_MAX_BYTES = 256 * 1024;

export type RetentionDays = 0 | 7 | 30 | 90;
export type Sensitivity = 'gentle' | 'balanced' | 'strict';

export interface StoredSettings {
  sensitivity: Sensitivity;
  previewEnabled: boolean;
  reducedMotion: boolean;
  largeStatus: boolean;
}

export interface ConfigInput {
  setup: { onboardingComplete: boolean };
  settings: StoredSettings;
  selectedCameraId: string | null;
  calibration: CalibrationProfile | null;
}

export interface StoredConfig extends ConfigInput {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  appVersion: string;
}

export interface MinuteAggregate {
  bucketStartUtc: string;
  localOffsetMinutes: number;
  monitoredSeconds: number;
  validSeconds: number;
  scoreSum: number;
  scoreSampleCount: number;
  belowThresholdSeconds: number;
  notificationCount: number;
}

export interface StoredHistory {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  retentionDays: RetentionDays;
  buckets: MinuteAggregate[];
}

export type StorageNotice =
  | 'backup-recovered'
  | 'corrupt-quarantined'
  | 'oversized-quarantined'
  | 'history-pruned'
  | 'storage-unavailable';

export interface StorageLoadResult<T> {
  value: T;
  source: 'disk' | 'backup' | 'default';
  notices: StorageNotice[];
}

export type StorageMutationResult =
  | { ok: true }
  | { ok: false; error: 'invalid-input' | 'storage-unavailable' };

export type HistoryUpsertResult =
  | { ok: true; stored: boolean }
  | { ok: false; error: 'invalid-input' | 'storage-unavailable' };

export type LifecycleLogEntry =
  | {
      kind: 'lifecycle';
      code:
        | 'app-start'
        | 'app-ready'
        | 'monitoring-started'
        | 'monitoring-paused'
        | 'monitoring-snoozed'
        | 'calibration-started'
        | 'calibration-completed'
        | 'camera-stopped'
        | 'suspend'
        | 'lock'
        | 'quit';
    }
  | {
      kind: 'error';
      code:
        | 'camera-permission'
        | 'camera-unavailable'
        | 'camera-disconnected'
        | 'model-load'
        | 'worker-crash'
        | 'storage-read'
        | 'storage-write'
        | 'storage-delete';
    }
  | { kind: 'model-load'; durationMs: number }
  | {
      kind: 'inference-summary';
      sampleCount: number;
      averageMs: number;
      p95Ms: number;
    };

export interface DiagnosticsResult {
  text: string;
  notices: StorageNotice[];
}

export const DEFAULT_CONFIG_INPUT: Readonly<ConfigInput> = {
  setup: { onboardingComplete: false },
  settings: {
    sensitivity: 'balanced',
    previewEnabled: true,
    reducedMotion: false,
    largeStatus: false,
  },
  selectedCameraId: null,
  calibration: null,
};

export function createDefaultConfig(appVersion: string): StoredConfig {
  return createStoredConfig(DEFAULT_CONFIG_INPUT, appVersion);
}

export function createDefaultHistory(): StoredHistory {
  return { schemaVersion: STORAGE_SCHEMA_VERSION, retentionDays: 30, buckets: [] };
}

export function parseConfigInput(value: unknown): ConfigInput | undefined {
  if (!recordWithKeys(value, ['setup', 'settings', 'selectedCameraId', 'calibration'])) return;
  if (!recordWithKeys(value.setup, ['onboardingComplete']) || typeof value.setup.onboardingComplete !== 'boolean') return;
  if (!recordWithKeys(value.settings, ['sensitivity', 'previewEnabled', 'reducedMotion', 'largeStatus'])) return;
  const sensitivity = value.settings.sensitivity;
  if (sensitivity !== 'gentle' && sensitivity !== 'balanced' && sensitivity !== 'strict') return;
  if (
    typeof value.settings.previewEnabled !== 'boolean' ||
    typeof value.settings.reducedMotion !== 'boolean' ||
    typeof value.settings.largeStatus !== 'boolean'
  ) return;
  const selectedCameraId = value.selectedCameraId;
  if (selectedCameraId !== null && !safeToken(selectedCameraId, 256)) return;
  let calibration: CalibrationProfile | null;
  if (value.calibration === null) {
    calibration = null;
  } else {
    const parsed = parseCalibration(value.calibration);
    if (!parsed) return;
    calibration = parsed;
  }
  return {
    setup: { onboardingComplete: value.setup.onboardingComplete },
    settings: {
      sensitivity,
      previewEnabled: value.settings.previewEnabled,
      reducedMotion: value.settings.reducedMotion,
      largeStatus: value.settings.largeStatus,
    },
    selectedCameraId,
    calibration,
  };
}

export function createStoredConfig(value: ConfigInput, appVersion: string): StoredConfig {
  const input = parseConfigInput(value);
  if (!input || !versionString(appVersion)) throw new TypeError('Invalid stored configuration.');
  return { schemaVersion: STORAGE_SCHEMA_VERSION, appVersion, ...input };
}

export function parseStoredConfig(value: unknown): StoredConfig | undefined {
  if (!recordWithKeys(value, ['schemaVersion', 'appVersion', 'setup', 'settings', 'selectedCameraId', 'calibration'])) return;
  if (value.schemaVersion !== STORAGE_SCHEMA_VERSION || !versionString(value.appVersion)) return;
  const input = parseConfigInput({
    setup: value.setup,
    settings: value.settings,
    selectedCameraId: value.selectedCameraId,
    calibration: value.calibration,
  });
  return input ? { schemaVersion: STORAGE_SCHEMA_VERSION, appVersion: value.appVersion, ...input } : undefined;
}

export function parseMinuteAggregate(value: unknown): MinuteAggregate | undefined {
  if (!recordWithKeys(value, [
    'bucketStartUtc',
    'localOffsetMinutes',
    'monitoredSeconds',
    'validSeconds',
    'scoreSum',
    'scoreSampleCount',
    'belowThresholdSeconds',
    'notificationCount',
  ])) return;
  if (!utcMinute(value.bucketStartUtc)) return;
  if (!integerIn(value.localOffsetMinutes, -840, 840)) return;
  if (!finiteIn(value.monitoredSeconds, 0, 60) || !finiteIn(value.validSeconds, 0, 60)) return;
  if (value.validSeconds > value.monitoredSeconds) return;
  if (!integerIn(value.scoreSampleCount, 0, 3_600)) return;
  if (!finiteIn(value.scoreSum, 0, value.scoreSampleCount * 100)) return;
  if (value.scoreSampleCount === 0 && (value.scoreSum !== 0 || value.validSeconds !== 0)) return;
  if (!finiteIn(value.belowThresholdSeconds, 0, value.validSeconds)) return;
  if (!integerIn(value.notificationCount, 0, 60)) return;
  return {
    bucketStartUtc: value.bucketStartUtc,
    localOffsetMinutes: value.localOffsetMinutes,
    monitoredSeconds: value.monitoredSeconds,
    validSeconds: value.validSeconds,
    scoreSum: value.scoreSum,
    scoreSampleCount: value.scoreSampleCount,
    belowThresholdSeconds: value.belowThresholdSeconds,
    notificationCount: value.notificationCount,
  };
}

export function parseStoredHistory(value: unknown): StoredHistory | undefined {
  if (!recordWithKeys(value, ['schemaVersion', 'retentionDays', 'buckets'])) return;
  if (value.schemaVersion !== STORAGE_SCHEMA_VERSION || !isRetentionDays(value.retentionDays) || !Array.isArray(value.buckets)) return;
  if (value.buckets.length > 90 * 24 * 60 + 2) return;
  const buckets: MinuteAggregate[] = [];
  const seen = new Set<string>();
  for (const item of value.buckets) {
    const bucket = parseMinuteAggregate(item);
    if (!bucket || seen.has(bucket.bucketStartUtc)) return;
    seen.add(bucket.bucketStartUtc);
    buckets.push(bucket);
  }
  buckets.sort((a, b) => a.bucketStartUtc.localeCompare(b.bucketStartUtc));
  return { schemaVersion: STORAGE_SCHEMA_VERSION, retentionDays: value.retentionDays, buckets };
}

export function isRetentionDays(value: unknown): value is RetentionDays {
  return value === 0 || value === 7 || value === 30 || value === 90;
}

export function pruneHistory(history: StoredHistory, nowMs: number): StoredHistory {
  if (!Number.isFinite(nowMs)) throw new TypeError('Invalid pruning time.');
  const cutoff = nowMs - history.retentionDays * 86_400_000;
  const buckets = history.retentionDays === 0
    ? []
    : history.buckets.filter((bucket) => Date.parse(bucket.bucketStartUtc) >= cutoff);
  return buckets.length === history.buckets.length ? history : { ...history, buckets };
}

export function upsertMinuteAggregate(history: StoredHistory, value: unknown): StoredHistory | undefined {
  const bucket = parseMinuteAggregate(value);
  if (!bucket || history.retentionDays === 0) return bucket ? history : undefined;
  const buckets = history.buckets.filter((item) => item.bucketStartUtc !== bucket.bucketStartUtc);
  buckets.push(bucket);
  buckets.sort((a, b) => a.bucketStartUtc.localeCompare(b.bucketStartUtc));
  const result = { ...history, buckets };
  return parseStoredHistory(result);
}

export function parseLifecycleLogEntry(value: unknown): LifecycleLogEntry | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') return;
  if (value.kind === 'lifecycle' && recordWithKeys(value, ['kind', 'code']) && LIFECYCLE_CODES.has(String(value.code))) {
    return { kind: 'lifecycle', code: value.code as Extract<LifecycleLogEntry, { kind: 'lifecycle' }>['code'] };
  }
  if (value.kind === 'error' && recordWithKeys(value, ['kind', 'code']) && ERROR_CODES.has(String(value.code))) {
    return { kind: 'error', code: value.code as Extract<LifecycleLogEntry, { kind: 'error' }>['code'] };
  }
  if (value.kind === 'model-load' && recordWithKeys(value, ['kind', 'durationMs']) && finiteIn(value.durationMs, 0, 600_000)) {
    return { kind: 'model-load', durationMs: value.durationMs };
  }
  if (
    value.kind === 'inference-summary' &&
    recordWithKeys(value, ['kind', 'sampleCount', 'averageMs', 'p95Ms']) &&
    integerIn(value.sampleCount, 1, 1_000_000) &&
    finiteIn(value.averageMs, 0, 60_000) &&
    finiteIn(value.p95Ms, value.averageMs, 60_000)
  ) {
    return {
      kind: 'inference-summary',
      sampleCount: value.sampleCount,
      averageMs: value.averageMs,
      p95Ms: value.p95Ms,
    };
  }
  return;
}

export function isStoredLogLine(value: unknown): boolean {
  if (!isRecord(value) || !utcTimestamp(value.timestampUtc) || !versionString(value.appVersion)) return false;
  const entry = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'timestampUtc' && key !== 'appVersion'));
  return parseLifecycleLogEntry(entry) !== undefined;
}

const FEATURE_NAMES: readonly FeatureName[] = [
  'headHeight',
  'headForward',
  'headLateral',
  'shoulderTilt',
  'torsoHeight',
  'torsoForward',
];
const CORE_FEATURES: readonly FeatureName[] = ['headHeight', 'headForward', 'headLateral', 'shoulderTilt'];
const LIFECYCLE_CODES = new Set([
  'app-start',
  'app-ready',
  'monitoring-started',
  'monitoring-paused',
  'monitoring-snoozed',
  'calibration-started',
  'calibration-completed',
  'camera-stopped',
  'suspend',
  'lock',
  'quit',
]);
const ERROR_CODES = new Set([
  'camera-permission',
  'camera-unavailable',
  'camera-disconnected',
  'model-load',
  'worker-crash',
  'storage-read',
  'storage-write',
  'storage-delete',
]);

function parseCalibration(value: unknown): CalibrationProfile | undefined {
  if (!recordWithKeys(value, ['schemaVersion', 'featureSchemaVersion', 'model', 'createdAt', 'deviceIdHash', 'anchorType', 'features', 'quality'])) return;
  if (value.schemaVersion !== 1 || value.featureSchemaVersion !== 1) return;
  if (!recordWithKeys(value.model, ['id', 'version', 'sha256'])) return;
  if (!safeToken(value.model.id, 80) || !safeToken(value.model.version, 80) || !sha256(value.model.sha256)) return;
  if (!utcTimestamp(value.createdAt) || !sha256(value.deviceIdHash)) return;
  if (value.anchorType !== 'ears' && value.anchorType !== 'eyes') return;
  if (!isRecord(value.features)) return;
  const featureKeys = Object.keys(value.features);
  if (featureKeys.some((name) => !FEATURE_NAMES.includes(name as FeatureName))) return;
  if (CORE_FEATURES.some((name) => !featureKeys.includes(name))) return;
  const features: CalibrationProfile['features'] = {};
  for (const name of featureKeys as FeatureName[]) {
    const statistics = value.features[name];
    if (!recordWithKeys(statistics, ['median', 'sigma'])) return;
    if (!finiteIn(statistics.median, -100, 100) || !finiteIn(statistics.sigma, 0, 10)) return;
    features[name] = { median: statistics.median, sigma: statistics.sigma };
  }
  if (!recordWithKeys(value.quality, ['validSamples', 'durationMs', 'coreCoverage'])) return;
  if (!integerIn(value.quality.validSamples, 35, 10_000)) return;
  if (!finiteIn(value.quality.durationMs, 9_000, 3_600_000)) return;
  if (!finiteIn(value.quality.coreCoverage, 0, 1)) return;
  return {
    schemaVersion: 1,
    featureSchemaVersion: 1,
    model: { id: value.model.id, version: value.model.version, sha256: value.model.sha256 },
    createdAt: value.createdAt,
    deviceIdHash: value.deviceIdHash,
    anchorType: value.anchorType,
    features,
    quality: {
      validSamples: value.quality.validSamples,
      durationMs: value.quality.durationMs,
      coreCoverage: value.quality.coreCoverage,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function recordWithKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function finiteIn(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function integerIn(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && finiteIn(value, minimum, maximum);
}

function safeToken(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength &&
    !value.includes('..') &&
    /^[A-Za-z0-9._+=:-]+$/.test(value)
  );
}

function versionString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 && /^[0-9A-Za-z.+-]+$/.test(value);
}

function sha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function utcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === canonical;
}

function utcMinute(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
