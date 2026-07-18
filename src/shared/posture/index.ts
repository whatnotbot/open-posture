/** Pure, deterministic posture comparison engine. No Electron, DOM, or model dependency. */

export const POSTURE_SCHEMA_VERSION = 1;
export const FEATURE_SCHEMA_VERSION = 1;

export type AnchorType = "ears" | "eyes";
export type FeatureName =
  | "headHeight"
  | "headForward"
  | "headLateral"
  | "shoulderTilt"
  | "torsoHeight"
  | "torsoForward";
export type CoreFeatureName = Exclude<FeatureName, "torsoHeight" | "torsoForward">;
export type FeatureVector = Partial<Record<FeatureName, number>>;
export type FeatureStatistics = Partial<Record<FeatureName, { median: number; sigma: number }>>;
export type CueKey = FeatureName;

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
}

export interface PoseInput {
  normalized: readonly Landmark[];
  world?: readonly Landmark[];
}

export interface ModelIdentity {
  id: string;
  version: string;
  sha256: string;
}

export interface CalibrationProfile {
  schemaVersion: number;
  featureSchemaVersion: number;
  model: ModelIdentity;
  createdAt: string;
  deviceIdHash: string;
  anchorType: AnchorType;
  features: FeatureStatistics;
  quality: {
    validSamples: number;
    durationMs: number;
    coreCoverage: number;
  };
}

export interface CalibrationSample {
  timestampMs: number;
  features: FeatureVector;
  anchorType: AnchorType;
}

export type SensitivityName = "gentle" | "balanced" | "strict";
export interface SensitivityPreset {
  alertBelow: number;
  dwellMs: number;
  cooldownMs: number;
}

export const SENSITIVITY_PRESETS: Readonly<Record<SensitivityName, SensitivityPreset>> = {
  gentle: { alertBelow: 55, dwellMs: 30_000, cooldownMs: 15 * 60_000 },
  balanced: { alertBelow: 65, dwellMs: 15_000, cooldownMs: 10 * 60_000 },
  strict: { alertBelow: 75, dwellMs: 8_000, cooldownMs: 5 * 60_000 },
};

export interface EngineSettings {
  sensitivity: SensitivityName;
  alertBelow: number;
  dwellMs: number;
  cooldownMs: number;
  recoveryAt: number;
  recoveryMs: number;
  resetDwellAt: number;
  emaTimeConstantMs: number;
  resumeGuardMs: number;
}

export function settingsForPreset(name: SensitivityName): EngineSettings {
  const preset = SENSITIVITY_PRESETS[name];
  return {
    sensitivity: name,
    ...preset,
    recoveryAt: 75,
    recoveryMs: 3_000,
    resetDwellAt: 70,
    emaTimeConstantMs: 2_000,
    resumeGuardMs: 15_000,
  };
}

export const DEFAULT_ENGINE_SETTINGS: Readonly<EngineSettings> = settingsForPreset("balanced");

export function validateEngineSettings(value: unknown): EngineSettings | undefined {
  if (!isRecord(value)) return undefined;
  const sensitivity = value.sensitivity;
  if (sensitivity !== "gentle" && sensitivity !== "balanced" && sensitivity !== "strict") return undefined;
  const keys = [
    "alertBelow",
    "dwellMs",
    "cooldownMs",
    "recoveryAt",
    "recoveryMs",
    "resetDwellAt",
    "emaTimeConstantMs",
    "resumeGuardMs",
  ] as const;
  for (const key of keys) if (!finite(value[key])) return undefined;
  const parsed: EngineSettings = {
    sensitivity,
    alertBelow: value.alertBelow as number,
    dwellMs: value.dwellMs as number,
    cooldownMs: value.cooldownMs as number,
    recoveryAt: value.recoveryAt as number,
    recoveryMs: value.recoveryMs as number,
    resetDwellAt: value.resetDwellAt as number,
    emaTimeConstantMs: value.emaTimeConstantMs as number,
    resumeGuardMs: value.resumeGuardMs as number,
  };
  if (
    parsed.alertBelow < 0 || parsed.alertBelow > 100 ||
    parsed.resetDwellAt <= parsed.alertBelow || parsed.resetDwellAt > 100 ||
    parsed.recoveryAt < parsed.resetDwellAt || parsed.recoveryAt > 100 ||
    parsed.dwellMs <= 0 || parsed.cooldownMs < 0 || parsed.recoveryMs <= 0 ||
    parsed.emaTimeConstantMs <= 0 || parsed.resumeGuardMs < 0
  ) return undefined;
  return parsed;
}

const LANDMARK = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
} as const;

const CORE_FEATURES: readonly CoreFeatureName[] = [
  "headHeight",
  "headForward",
  "headLateral",
  "shoulderTilt",
];

export const FEATURE_LIMITS: Readonly<Record<FeatureName, { floor: number; severeRange: number }>> = {
  headHeight: { floor: 0.08, severeRange: 0.30 },
  headForward: { floor: 0.10, severeRange: 0.40 },
  headLateral: { floor: 0.08, severeRange: 0.25 },
  shoulderTilt: { floor: 0.06, severeRange: 0.20 },
  torsoHeight: { floor: 0.10, severeRange: 0.35 },
  torsoForward: { floor: 0.10, severeRange: 0.35 },
};

const CUE_PRIORITY: readonly CueKey[] = [
  "headForward",
  "headHeight",
  "torsoForward",
  "torsoHeight",
  "headLateral",
  "shoulderTilt",
];

export const CUE_COPY: Readonly<Record<CueKey, string>> = {
  headHeight: "If comfortable, raise your head slightly toward your reference.",
  headForward: "If comfortable, ease your head back toward your reference.",
  headLateral: "If comfortable, re-center your head toward your reference.",
  shoulderTilt: "If comfortable, relax your shoulders toward your reference.",
  torsoHeight: "If comfortable, sit a little taller toward your reference.",
  torsoForward: "If comfortable, bring your torso back toward your reference.",
};

export type PoseFailureReason =
  | "malformed"
  | "head_missing"
  | "shoulders_missing"
  | "poor_confidence"
  | "too_far"
  | "too_close"
  | "off_center"
  | "unsupported_view"
  | "world_missing";

export interface QualifiedPose {
  pose: PoseInput;
  anchorType: AnchorType;
  shoulderWidth2d: number;
  shoulderWidthWorld: number;
  coreQuality: number;
  hipsAvailable: boolean;
}

export type PoseQualification =
  | { ok: true; value: QualifiedPose }
  | { ok: false; reason: PoseFailureReason };

export function qualifyPose(pose: PoseInput, requiredAnchor?: AnchorType): PoseQualification {
  if (!pose || !Array.isArray(pose.normalized) || pose.normalized.length <= LANDMARK.rightHip) {
    return { ok: false, reason: "malformed" };
  }
  const normalized = pose.normalized;
  const nose = normalized[LANDMARK.nose];
  const leftShoulder = normalized[LANDMARK.leftShoulder];
  const rightShoulder = normalized[LANDMARK.rightShoulder];
  if (!pointFinite(nose)) return { ok: false, reason: "head_missing" };
  if (!pointFinite(leftShoulder) || !pointFinite(rightShoulder)) return { ok: false, reason: "shoulders_missing" };
  if (!pointQualified(nose) || !pointQualified(leftShoulder) || !pointQualified(rightShoulder)) {
    return { ok: false, reason: "poor_confidence" };
  }

  const earPair = pairQualified(normalized, LANDMARK.leftEar, LANDMARK.rightEar);
  const eyePair = pairQualified(normalized, LANDMARK.leftEye, LANDMARK.rightEye);
  const anchorType = requiredAnchor ?? (earPair ? "ears" : eyePair ? "eyes" : undefined);
  if (!anchorType || (anchorType === "ears" ? !earPair : !eyePair)) return { ok: false, reason: "head_missing" };
  const [leftAnchor, rightAnchor] = anchorType === "ears"
    ? [normalized[LANDMARK.leftEar], normalized[LANDMARK.rightEar]]
    : [normalized[LANDMARK.leftEye], normalized[LANDMARK.rightEye]];
  const core = [nose, leftShoulder, rightShoulder, leftAnchor, rightAnchor];
  const coreQuality = mean(core.map(pointQuality));
  if (coreQuality < 0.70) return { ok: false, reason: "poor_confidence" };

  const shoulderWidth2d = distance2d(leftShoulder, rightShoulder);
  if (!finite(shoulderWidth2d) || shoulderWidth2d === 0) return { ok: false, reason: "malformed" };
  if (shoulderWidth2d < 0.12) return { ok: false, reason: "too_far" };
  if (shoulderWidth2d > 0.65) return { ok: false, reason: "too_close" };
  const shoulderMidpoint = midpoint(leftShoulder, rightShoulder);
  if (
    shoulderMidpoint.x < 0.15 || shoulderMidpoint.x > 0.85 ||
    shoulderMidpoint.y < 0.20 || shoulderMidpoint.y > 0.85
  ) return { ok: false, reason: "off_center" };
  if (Math.abs(rightShoulder.x - leftShoulder.x) / shoulderWidth2d < 0.65) {
    return { ok: false, reason: "unsupported_view" };
  }

  const world = pose.world;
  if (!Array.isArray(world) || world.length <= LANDMARK.rightHip) return { ok: false, reason: "world_missing" };
  const worldLeftShoulder = world[LANDMARK.leftShoulder];
  const worldRightShoulder = world[LANDMARK.rightShoulder];
  const worldAnchors = anchorType === "ears"
    ? [world[LANDMARK.leftEar], world[LANDMARK.rightEar]]
    : [world[LANDMARK.leftEye], world[LANDMARK.rightEye]];
  if (!point3dFinite(worldLeftShoulder) || !point3dFinite(worldRightShoulder) || !worldAnchors.every(point3dFinite)) {
    return { ok: false, reason: "world_missing" };
  }
  const shoulderWidthWorld = distance3d(worldLeftShoulder, worldRightShoulder);
  if (!finite(shoulderWidthWorld) || shoulderWidthWorld <= 0) return { ok: false, reason: "world_missing" };
  const hipsAvailable =
    pairQualified(normalized, LANDMARK.leftHip, LANDMARK.rightHip) &&
    point3dFinite(world[LANDMARK.leftHip]) && point3dFinite(world[LANDMARK.rightHip]);
  return {
    ok: true,
    value: { pose, anchorType, shoulderWidth2d, shoulderWidthWorld, coreQuality, hipsAvailable },
  };
}

export type FrameInspection =
  | { kind: "one"; pose: QualifiedPose }
  | { kind: "multiple"; count: number }
  | { kind: "none"; reason: "no_pose" | PoseFailureReason };

export function inspectFrame(poses: readonly PoseInput[], requiredAnchor?: AnchorType): FrameInspection {
  if (poses.length === 0) return { kind: "none", reason: "no_pose" };
  const results = poses.map((pose) => qualifyPose(pose, requiredAnchor));
  const qualified = results.filter((result): result is { ok: true; value: QualifiedPose } => result.ok);
  if (qualified.length > 1) return { kind: "multiple", count: qualified.length };
  if (qualified.length === 1) return { kind: "one", pose: qualified[0].value };
  return { kind: "none", reason: (results[0] as { ok: false; reason: PoseFailureReason }).reason };
}

export type QualificationStatus =
  | "finding"
  | "assessable"
  | "transient"
  | "away"
  | "multiple_people"
  | "quality_blocked"
  | "stale";

export interface QualificationState {
  status: QualificationStatus;
  lastTimestampMs?: number;
  invalidSinceMs?: number;
  validSinceMs?: number;
  validCount: number;
  multipleSinceMs?: number;
  multipleCount: number;
}

export interface QualificationUpdate {
  state: QualificationState;
  status: QualificationStatus;
  pose?: QualifiedPose;
  reason?: FrameInspection extends infer _T ? string : never;
  resetTemporalState: boolean;
}

export function initialQualificationState(): QualificationState {
  return { status: "finding", validCount: 0, multipleCount: 0 };
}

export function updateQualification(
  previous: QualificationState,
  timestampMs: number,
  inspection: FrameInspection,
): QualificationUpdate {
  if (!finite(timestampMs) || (previous.lastTimestampMs !== undefined && timestampMs <= previous.lastTimestampMs)) {
    return { state: previous, status: "stale", resetTemporalState: false };
  }
  if (inspection.kind === "one") {
    const validSinceMs = previous.validSinceMs ?? timestampMs;
    const validCount = previous.validCount + 1;
    const stable = previous.status === "assessable" || (validCount >= 3 && timestampMs - validSinceMs >= 2_000);
    const state: QualificationState = {
      status: stable ? "assessable" : "finding",
      lastTimestampMs: timestampMs,
      validSinceMs,
      validCount,
      multipleCount: 0,
    };
    return { state, status: state.status, pose: stable ? inspection.pose : undefined, resetTemporalState: false };
  }

  const invalidSinceMs = previous.invalidSinceMs ?? timestampMs;
  const invalidForMs = timestampMs - invalidSinceMs;
  if (inspection.kind === "multiple") {
    const multipleSinceMs = previous.multipleSinceMs ?? timestampMs;
    const multipleCount = previous.multipleCount + 1;
    const confirmed = multipleCount >= 3 || timestampMs - multipleSinceMs >= 1_000;
    const state: QualificationState = {
      status: confirmed ? "multiple_people" : "transient",
      lastTimestampMs: timestampMs,
      invalidSinceMs,
      validCount: 0,
      multipleSinceMs,
      multipleCount,
    };
    return { state, status: state.status, reason: "multiple_people", resetTemporalState: confirmed };
  }

  const confirmed = invalidForMs >= 2_000;
  const status: QualificationStatus = confirmed
    ? inspection.reason === "no_pose" ? "away" : "quality_blocked"
    : "transient";
  const state: QualificationState = {
    status,
    lastTimestampMs: timestampMs,
    invalidSinceMs,
    validCount: 0,
    multipleCount: 0,
  };
  return { state, status, reason: inspection.reason, resetTemporalState: confirmed };
}

export type FeatureExtraction =
  | { ok: true; features: FeatureVector; anchorType: AnchorType; coverage: number }
  | { ok: false; reason: PoseFailureReason };

export function extractFeatures(pose: PoseInput, requiredAnchor?: AnchorType): FeatureExtraction {
  const qualification = qualifyPose(pose, requiredAnchor);
  if (!qualification.ok) return qualification;
  const q = qualification.value;
  const normalized = pose.normalized;
  const world = pose.world as readonly Landmark[];
  const leftShoulder = normalized[LANDMARK.leftShoulder];
  const rightShoulder = normalized[LANDMARK.rightShoulder];
  const worldLeftShoulder = world[LANDMARK.leftShoulder];
  const worldRightShoulder = world[LANDMARK.rightShoulder];
  const [leftAnchorIndex, rightAnchorIndex] = q.anchorType === "ears"
    ? [LANDMARK.leftEar, LANDMARK.rightEar]
    : [LANDMARK.leftEye, LANDMARK.rightEye];
  const shoulder = midpoint(leftShoulder, rightShoulder);
  const head = midpoint(normalized[leftAnchorIndex], normalized[rightAnchorIndex]);
  const worldShoulder = midpoint3d(worldLeftShoulder, worldRightShoulder);
  const worldHead = midpoint3d(world[leftAnchorIndex], world[rightAnchorIndex]);
  const features: FeatureVector = {
    headHeight: (shoulder.y - head.y) / q.shoulderWidth2d,
    headForward: (worldShoulder.z - worldHead.z) / q.shoulderWidthWorld,
    headLateral: (head.x - shoulder.x) / q.shoulderWidth2d,
    shoulderTilt: (rightShoulder.y - leftShoulder.y) / q.shoulderWidth2d,
  };
  if (q.hipsAvailable) {
    const hip = midpoint(normalized[LANDMARK.leftHip], normalized[LANDMARK.rightHip]);
    const worldHip = midpoint3d(world[LANDMARK.leftHip], world[LANDMARK.rightHip]);
    features.torsoHeight = (hip.y - shoulder.y) / q.shoulderWidth2d;
    features.torsoForward = (worldHip.z - worldShoulder.z) / q.shoulderWidthWorld;
  }
  if (!Object.values(features).every(finite)) return { ok: false, reason: "malformed" };
  return { ok: true, features, anchorType: q.anchorType, coverage: Object.keys(features).length / 6 };
}

export interface CalibrationDraft {
  model: ModelIdentity;
  createdAt: string;
  deviceIdHash: string;
}

export type CalibrationResult =
  | { ok: true; profile: CalibrationProfile }
  | { ok: false; reason: "not_enough_samples" | "duration_too_short" | "mixed_anchor" | "missing_core" | "unstable" | "malformed"; feature?: FeatureName };

export function buildCalibration(samples: readonly CalibrationSample[], draft: CalibrationDraft): CalibrationResult {
  if (samples.length < 35) return { ok: false, reason: "not_enough_samples" };
  const ordered = [...samples].sort((a, b) => a.timestampMs - b.timestampMs);
  if (!ordered.every((sample, index) => finite(sample.timestampMs) && (index === 0 || sample.timestampMs > ordered[index - 1].timestampMs))) {
    return { ok: false, reason: "malformed" };
  }
  const durationMs = ordered[ordered.length - 1].timestampMs - ordered[0].timestampMs;
  if (durationMs < 9_000) return { ok: false, reason: "duration_too_short" };
  const anchorType = ordered[0].anchorType;
  if (!ordered.every((sample) => sample.anchorType === anchorType)) return { ok: false, reason: "mixed_anchor" };
  const features: FeatureStatistics = {};
  for (const feature of Object.keys(FEATURE_LIMITS) as FeatureName[]) {
    const values = ordered.map((sample) => sample.features[feature]).filter(finite);
    const required = CORE_FEATURES.includes(feature as CoreFeatureName);
    if (required && values.length < 35) return { ok: false, reason: "missing_core", feature };
    if (values.length < 35) continue;
    const center = median(values);
    const sigma = 1.4826 * median(values.map((value) => Math.abs(value - center)));
    if (!finite(center) || !finite(sigma)) return { ok: false, reason: "malformed", feature };
    if (required && sigma > FEATURE_LIMITS[feature].severeRange * 0.25) {
      return { ok: false, reason: "unstable", feature };
    }
    features[feature] = { median: center, sigma };
  }
  return {
    ok: true,
    profile: {
      schemaVersion: POSTURE_SCHEMA_VERSION,
      featureSchemaVersion: FEATURE_SCHEMA_VERSION,
      model: { ...draft.model },
      createdAt: draft.createdAt,
      deviceIdHash: draft.deviceIdHash,
      anchorType,
      features,
      quality: { validSamples: ordered.length, durationMs, coreCoverage: 1 },
    },
  };
}

export function replaceCalibration(
  current: CalibrationProfile | undefined,
  candidate: CalibrationResult,
  confirmed: boolean,
): CalibrationProfile | undefined {
  return confirmed && candidate.ok ? candidate.profile : current;
}

export interface PostureScore {
  rawScore: number;
  severities: Partial<Record<FeatureName, number>>;
  primaryCue: CueKey;
  coverage: number;
}

export type ScoreResult =
  | { ok: true; value: PostureScore }
  | { ok: false; reason: "anchor_mismatch" | "missing_core" | "malformed_calibration" | "malformed_features" };

export function scorePosture(
  features: FeatureVector,
  anchorType: AnchorType,
  calibration: CalibrationProfile,
): ScoreResult {
  if (anchorType !== calibration.anchorType) return { ok: false, reason: "anchor_mismatch" };
  if (!compatibleFeatureStatistics(calibration.features)) return { ok: false, reason: "malformed_calibration" };
  if (Object.values(features).some((value) => value !== undefined && !finite(value))) {
    return { ok: false, reason: "malformed_features" };
  }
  const presentCore = CORE_FEATURES.filter((feature) => finite(features[feature]) && calibration.features[feature] !== undefined);
  if (!presentCore.includes("headHeight") || !presentCore.includes("headForward") || presentCore.length < 3) {
    return { ok: false, reason: "missing_core" };
  }
  const severities: Partial<Record<FeatureName, number>> = {};
  for (const feature of Object.keys(FEATURE_LIMITS) as FeatureName[]) {
    const current = features[feature];
    const reference = calibration.features[feature];
    if (current === undefined || reference === undefined) continue;
    if (!finite(current)) return { ok: false, reason: "malformed_features" };
    const deviation = directedDeviation(feature, current, reference.median);
    const deadZone = Math.max(FEATURE_LIMITS[feature].floor, 3 * reference.sigma);
    severities[feature] = clamp((deviation - deadZone) / FEATURE_LIMITS[feature].severeRange, 0, 1);
  }
  const available = Object.entries(severities) as [FeatureName, number][];
  if (available.length === 0) return { ok: false, reason: "missing_core" };
  const maximum = Math.max(...available.map(([, severity]) => severity));
  const tied = available.filter(([, severity]) => maximum - severity <= 0.02).map(([feature]) => feature);
  const primaryCue = CUE_PRIORITY.find((feature) => tied.includes(feature)) as CueKey;
  return {
    ok: true,
    value: {
      rawScore: Math.round(100 * (1 - maximum)),
      severities,
      primaryCue,
      coverage: available.length / 6,
    },
  };
}

export interface ScoreEmaState {
  score?: number;
  lastTimestampMs?: number;
}

export interface ScoreEmaUpdate {
  state: ScoreEmaState;
  accepted: boolean;
  score?: number;
  reason?: "stale" | "malformed";
}

export function updateScoreEma(
  previous: ScoreEmaState,
  rawScore: number,
  timestampMs: number,
  reset = false,
  timeConstantMs = DEFAULT_ENGINE_SETTINGS.emaTimeConstantMs,
): ScoreEmaUpdate {
  if (!finite(rawScore) || !finite(timestampMs) || !finite(timeConstantMs) || timeConstantMs <= 0) {
    return { state: previous, accepted: false, score: previous.score, reason: "malformed" };
  }
  if (previous.lastTimestampMs !== undefined && timestampMs <= previous.lastTimestampMs) {
    return { state: previous, accepted: false, score: previous.score, reason: "stale" };
  }
  const score = reset || previous.score === undefined || previous.lastTimestampMs === undefined
    ? rawScore
    : (1 - Math.exp(-(timestampMs - previous.lastTimestampMs) / timeConstantMs)) * rawScore +
      Math.exp(-(timestampMs - previous.lastTimestampMs) / timeConstantMs) * previous.score;
  const state = { score, lastTimestampMs: timestampMs };
  return { state, accepted: true, score };
}

export type AlertPhase = "stopped" | "good" | "pending" | "cooldown" | "paused" | "snoozed" | "cannot_assess";
export type AssessmentValidity = "valid" | "transient" | "invalid";

export interface AlertState {
  phase: AlertPhase;
  lastTimestampMs?: number;
  badDwellMs: number;
  recoveryDwellMs: number;
  cooldownUntilMs?: number;
  eligibilityAtMs?: number;
  alertCount: number;
}

export interface AlertSample {
  timestampMs: number;
  monitoring: boolean;
  paused?: boolean;
  snoozed?: boolean;
  validity: AssessmentValidity;
  score?: number;
  primaryCue?: CueKey;
}

export interface AlertUpdate {
  state: AlertState;
  accepted: boolean;
  alertTriggered: boolean;
  recovered: boolean;
  cue?: CueKey;
  reason?: "stale" | "malformed";
}

export function initialAlertState(): AlertState {
  return { phase: "stopped", badDwellMs: 0, recoveryDwellMs: 0, alertCount: 0 };
}

export function resumeAlertState(previous: AlertState, timestampMs: number, settings = DEFAULT_ENGINE_SETTINGS): AlertState {
  return {
    ...previous,
    phase: "good",
    lastTimestampMs: timestampMs,
    badDwellMs: 0,
    recoveryDwellMs: 0,
    eligibilityAtMs: timestampMs + settings.resumeGuardMs,
  };
}

export function updateAlertState(
  previous: AlertState,
  sample: AlertSample,
  settings = DEFAULT_ENGINE_SETTINGS,
): AlertUpdate {
  if (!finite(sample.timestampMs) || (previous.lastTimestampMs !== undefined && sample.timestampMs <= previous.lastTimestampMs)) {
    return { state: previous, accepted: false, alertTriggered: false, recovered: false, reason: "stale" };
  }
  let dt = previous.lastTimestampMs === undefined ? 0 : sample.timestampMs - previous.lastTimestampMs;
  const returningFromInvalid = previous.phase === "cannot_assess";
  if (!sample.monitoring || sample.paused || sample.snoozed) {
    const phase: AlertPhase = sample.snoozed ? "snoozed" : sample.paused ? "paused" : "stopped";
    return acceptedAlert({ ...previous, phase, lastTimestampMs: sample.timestampMs, badDwellMs: 0, recoveryDwellMs: 0, eligibilityAtMs: undefined });
  }
  if (sample.validity !== "valid") {
    const hard = sample.validity === "invalid";
    return acceptedAlert({
      ...previous,
      phase: "cannot_assess",
      lastTimestampMs: sample.timestampMs,
      badDwellMs: hard ? 0 : previous.badDwellMs,
      recoveryDwellMs: hard ? 0 : previous.recoveryDwellMs,
    });
  }
  if (!finite(sample.score) || (sample.score as number) < 0 || (sample.score as number) > 100) {
    return { state: previous, accepted: false, alertTriggered: false, recovered: false, reason: "malformed" };
  }
  const score = sample.score as number;
  if (previous.cooldownUntilMs !== undefined && sample.timestampMs < previous.cooldownUntilMs) {
    const recoveryDwellMs = score >= settings.recoveryAt ? previous.recoveryDwellMs + (returningFromInvalid ? 0 : dt) : 0;
    const recovered = previous.recoveryDwellMs < settings.recoveryMs && recoveryDwellMs >= settings.recoveryMs;
    return acceptedAlert({
      ...previous,
      phase: "cooldown",
      lastTimestampMs: sample.timestampMs,
      badDwellMs: 0,
      recoveryDwellMs,
    }, false, recovered);
  }
  if (previous.cooldownUntilMs !== undefined) {
    previous = { ...previous, cooldownUntilMs: undefined, badDwellMs: 0, recoveryDwellMs: 0, phase: "good" };
    dt = 0;
  }
  const eligible = previous.eligibilityAtMs === undefined || sample.timestampMs >= previous.eligibilityAtMs;
  if (!eligible) {
    return acceptedAlert({ ...previous, phase: "good", lastTimestampMs: sample.timestampMs, badDwellMs: 0, recoveryDwellMs: 0 });
  }
  if (previous.eligibilityAtMs !== undefined && previous.lastTimestampMs !== undefined && previous.lastTimestampMs < previous.eligibilityAtMs) {
    dt = Math.max(0, sample.timestampMs - previous.eligibilityAtMs);
  }
  if (returningFromInvalid) dt = 0;
  let badDwellMs = previous.badDwellMs;
  if (score < settings.alertBelow) badDwellMs += dt;
  else if (score < settings.resetDwellAt) badDwellMs = Math.max(0, badDwellMs - dt);
  else badDwellMs = 0;
  if (badDwellMs >= settings.dwellMs) {
    const state: AlertState = {
      ...previous,
      phase: "cooldown",
      lastTimestampMs: sample.timestampMs,
      badDwellMs: 0,
      recoveryDwellMs: 0,
      cooldownUntilMs: sample.timestampMs + settings.cooldownMs,
      alertCount: previous.alertCount + 1,
    };
    return acceptedAlert(state, true, false, sample.primaryCue);
  }
  return acceptedAlert({
    ...previous,
    phase: badDwellMs > 0 ? "pending" : "good",
    lastTimestampMs: sample.timestampMs,
    badDwellMs,
    recoveryDwellMs: 0,
  });
}

export interface CalibrationCompatibility {
  model: ModelIdentity;
  schemaVersion?: number;
  featureSchemaVersion?: number;
}

export type CalibrationParseResult =
  | { ok: true; profile: CalibrationProfile }
  | { ok: false; reason: "invalid_json" | "invalid_shape" | "incompatible_schema" | "incompatible_model" };

export function serializeCalibration(profile: CalibrationProfile): string {
  return JSON.stringify(profile);
}

export function parseCalibration(serialized: string, expected: CalibrationCompatibility): CalibrationParseResult {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!validCalibrationShape(value)) return { ok: false, reason: "invalid_shape" };
  if (
    value.schemaVersion !== (expected.schemaVersion ?? POSTURE_SCHEMA_VERSION) ||
    value.featureSchemaVersion !== (expected.featureSchemaVersion ?? FEATURE_SCHEMA_VERSION)
  ) return { ok: false, reason: "incompatible_schema" };
  if (
    value.model.id !== expected.model.id || value.model.version !== expected.model.version ||
    value.model.sha256 !== expected.model.sha256
  ) return { ok: false, reason: "incompatible_model" };
  return { ok: true, profile: value };
}

function acceptedAlert(state: AlertState, alertTriggered = false, recovered = false, cue?: CueKey): AlertUpdate {
  return { state, accepted: true, alertTriggered, recovered, cue };
}

function directedDeviation(feature: FeatureName, value: number, baseline: number): number {
  if (feature === "headHeight" || feature === "torsoHeight") return Math.max(0, baseline - value);
  if (feature === "headForward" || feature === "torsoForward") return Math.max(0, value - baseline);
  return Math.abs(value - baseline);
}

function compatibleFeatureStatistics(value: FeatureStatistics): boolean {
  for (const [feature, stats] of Object.entries(value)) {
    if (!(feature in FEATURE_LIMITS) || !stats || !finite(stats.median) || !finite(stats.sigma) || stats.sigma < 0) return false;
  }
  return true;
}

function validCalibrationShape(value: unknown): value is CalibrationProfile {
  if (!isRecord(value) || !isRecord(value.model) || !isRecord(value.quality) || !isRecord(value.features)) return false;
  if (
    !Number.isInteger(value.schemaVersion) || !Number.isInteger(value.featureSchemaVersion) ||
    !nonEmpty(value.model.id) || !nonEmpty(value.model.version) || !nonEmpty(value.model.sha256) ||
    !nonEmpty(value.createdAt) || !nonEmpty(value.deviceIdHash) ||
    (value.anchorType !== "ears" && value.anchorType !== "eyes") ||
    !Number.isInteger(value.quality.validSamples) || !finite(value.quality.durationMs) || !finite(value.quality.coreCoverage)
  ) return false;
  const stats = value.features as FeatureStatistics;
  if (!compatibleFeatureStatistics(stats)) return false;
  return CORE_FEATURES.every((feature) => stats[feature] !== undefined);
}

function pointQuality(point: Landmark): number {
  return Math.min(point.visibility ?? -Infinity, point.presence ?? -Infinity);
}

function pointQualified(point: Landmark | undefined): point is Landmark {
  return pointFinite(point) && pointQuality(point) >= 0.55;
}

function pairQualified(points: readonly Landmark[], left: number, right: number): boolean {
  return pointQualified(points[left]) && pointQualified(points[right]);
}

function pointFinite(point: Landmark | undefined): point is Landmark {
  return !!point && finite(point.x) && finite(point.y);
}

function point3dFinite(point: Landmark | undefined): point is Landmark & { z: number } {
  return pointFinite(point) && finite(point.z);
}

function distance2d(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distance3d(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z as number) - (b.z as number));
}

function midpoint(a: Landmark, b: Landmark): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function midpoint3d(a: Landmark, b: Landmark): { x: number; y: number; z: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z as number) + (b.z as number)) / 2 };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
