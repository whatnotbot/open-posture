import assert from "node:assert/strict";
import test from "node:test";

import {
  CUE_COPY,
  DEFAULT_ENGINE_SETTINGS,
  FEATURE_LIMITS,
  SENSITIVITY_PRESETS,
  buildCalibration,
  extractFeatures,
  initialAlertState,
  initialQualificationState,
  inspectFrame,
  parseCalibration,
  qualifyPose,
  replaceCalibration,
  resumeAlertState,
  scorePosture,
  serializeCalibration,
  settingsForPreset,
  updateAlertState,
  updateQualification,
  updateScoreEma,
  validateEngineSettings,
  type AlertState,
  type CalibrationSample,
  type FeatureName,
  type FeatureVector,
  type Landmark,
} from "../src/shared/posture/index.ts";
import {
  REFERENCE_FEATURES,
  TEST_MODEL,
  calibrationProfile,
  calibrationSamples,
  validPose,
} from "./fixtures/posture/index.ts";

test("presets expose the exact gentle, balanced, and strict defaults", () => {
  assert.deepEqual(SENSITIVITY_PRESETS.gentle, { alertBelow: 55, dwellMs: 30_000, cooldownMs: 900_000 });
  assert.deepEqual(SENSITIVITY_PRESETS.balanced, { alertBelow: 65, dwellMs: 15_000, cooldownMs: 600_000 });
  assert.deepEqual(SENSITIVITY_PRESETS.strict, { alertBelow: 75, dwellMs: 8_000, cooldownMs: 300_000 });
  assert.equal(DEFAULT_ENGINE_SETTINGS.recoveryAt, 75);
  assert.equal(DEFAULT_ENGINE_SETTINGS.resetDwellAt, 70);
});

test("settings validation rejects malformed and unsafe thresholds", () => {
  assert.deepEqual(validateEngineSettings(settingsForPreset("balanced")), settingsForPreset("balanced"));
  assert.equal(validateEngineSettings({}), undefined);
  assert.equal(validateEngineSettings({ ...settingsForPreset("balanced"), alertBelow: Number.NaN }), undefined);
  assert.equal(validateEngineSettings({ ...settingsForPreset("balanced"), resetDwellAt: 60 }), undefined);
  assert.equal(validateEngineSettings({ ...settingsForPreset("balanced"), dwellMs: 0 }), undefined);
});

test("qualifies a supported single pose and optional hips", () => {
  const result = qualifyPose(validPose());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.anchorType, "ears");
  assert.equal(result.value.hipsAvailable, true);
  assert.ok(Math.abs(result.value.shoulderWidth2d - 0.30) < 1e-12);
});

test("quality threshold is inclusive but mean quality must be at least 0.70", () => {
  const inclusive = validPose();
  inclusive.normalized[0].visibility = inclusive.normalized[0].presence = 0.55;
  assert.equal(qualifyPose(inclusive).ok, true);
  const lowMean = validPose({ quality: 0.69 });
  assert.deepEqual(qualifyPose(lowMean), { ok: false, reason: "poor_confidence" });
  const exactMean = validPose({ quality: 0.70 });
  assert.equal(qualifyPose(exactMean).ok, true);
});

test("framing boundaries are inclusive", () => {
  assert.equal(qualifyPose(validPose({ shoulderWidth: 0.119 })).ok, false);
  assert.equal(qualifyPose(validPose({ shoulderWidth: 0.12 })).ok, true);
  assert.equal(qualifyPose(validPose({ shoulderWidth: 0.65 })).ok, true);
  assert.equal(qualifyPose(validPose({ shoulderWidth: 0.651 })).ok, false);
  assert.deepEqual(qualifyPose(validPose({ shoulderCenterX: 0.10 })), { ok: false, reason: "off_center" });
});

test("eye fallback is explicit and cannot silently switch a required ear anchor", () => {
  const eyes = validPose({ anchor: "eyes" });
  const fallback = qualifyPose(eyes);
  assert.equal(fallback.ok && fallback.value.anchorType, "eyes");
  assert.deepEqual(qualifyPose(eyes, "ears"), { ok: false, reason: "head_missing" });
});

test("missing hips keep core assessment while malformed world coordinates fail safely", () => {
  const noHips = qualifyPose(validPose({ includeHips: false }));
  assert.equal(noHips.ok && noHips.value.hipsAvailable, false);
  const zeroWorld = validPose({ worldShoulderWidth: 0 });
  assert.deepEqual(qualifyPose(zeroWorld), { ok: false, reason: "world_missing" });
  const nan = validPose();
  (nan.normalized[11] as Landmark).x = Number.NaN;
  assert.deepEqual(qualifyPose(nan), { ok: false, reason: "shoulders_missing" });
});

test("frame inspection ignores a nonqualifying background detection and stops for two valid people", () => {
  const background = validPose({ shoulderWidth: 0.05 });
  assert.equal(inspectFrame([validPose(), background]).kind, "one");
  assert.deepEqual(inspectFrame([validPose(), validPose()]), { kind: "multiple", count: 2 });
  assert.deepEqual(inspectFrame([]), { kind: "none", reason: "no_pose" });
});

test("qualification requires three valid samples spanning two seconds", () => {
  let state = initialQualificationState();
  let result = updateQualification(state, 0, inspectFrame([validPose()]));
  state = result.state;
  assert.equal(result.status, "finding");
  result = updateQualification(state, 1_000, inspectFrame([validPose()]));
  state = result.state;
  assert.equal(result.status, "finding");
  result = updateQualification(state, 2_000, inspectFrame([validPose()]));
  assert.equal(result.status, "assessable");
  assert.ok(result.pose);
});

test("brief loss is transient; two seconds confirms away and resets temporal state", () => {
  let state = initialQualificationState();
  for (const time of [0, 1_000, 2_000]) state = updateQualification(state, time, inspectFrame([validPose()])).state;
  let result = updateQualification(state, 3_000, inspectFrame([]));
  state = result.state;
  assert.equal(result.status, "transient");
  assert.equal(result.resetTemporalState, false);
  result = updateQualification(state, 4_999, inspectFrame([]));
  state = result.state;
  assert.equal(result.status, "transient");
  result = updateQualification(state, 5_000, inspectFrame([]));
  assert.equal(result.status, "away");
  assert.equal(result.resetTemporalState, true);
});

test("multiple people confirms on the third sample and stale time is ignored", () => {
  let state = initialQualificationState();
  const multiple = inspectFrame([validPose(), validPose()]);
  state = updateQualification(state, 0, multiple).state;
  state = updateQualification(state, 200, multiple).state;
  const confirmed = updateQualification(state, 400, multiple);
  assert.equal(confirmed.status, "multiple_people");
  const stale = updateQualification(confirmed.state, 400, inspectFrame([validPose()]));
  assert.equal(stale.status, "stale");
  assert.equal(stale.state, confirmed.state);
});

test("feature extraction implements normalized and world-coordinate equations", () => {
  const extracted = extractFeatures(validPose());
  assert.equal(extracted.ok, true);
  if (!extracted.ok) return;
  assert.ok(Math.abs((extracted.features.headHeight as number) - 2 / 3) < 1e-12);
  assert.ok(Math.abs((extracted.features.headForward as number) - 1 / 3) < 1e-12);
  assert.equal(extracted.features.headLateral, 0);
  assert.equal(extracted.features.shoulderTilt, 0);
  assert.ok(Math.abs((extracted.features.torsoHeight as number) - 1) < 1e-12);
  assert.ok(Math.abs((extracted.features.torsoForward as number) - 1 / 3) < 1e-12);
  assert.equal(extracted.coverage, 1);
});

test("feature extraction omits torso features when hips are not qualified", () => {
  const extracted = extractFeatures(validPose({ includeHips: false }));
  assert.equal(extracted.ok, true);
  if (!extracted.ok) return;
  assert.equal(extracted.features.torsoHeight, undefined);
  assert.equal(extracted.features.torsoForward, undefined);
  assert.equal(extracted.coverage, 4 / 6);
});

test("calibration uses robust medians and scaled MAD", () => {
  const samples = calibrationSamples({}, { jitter: 0.01 });
  samples[49].features.headHeight = 50;
  const result = buildCalibration(samples, {
    model: TEST_MODEL,
    createdAt: "2026-07-18T00:00:00.000Z",
    deviceIdHash: "device-test",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(Math.abs((result.profile.features.headHeight?.median as number) - 0.70) <= 0.01);
  assert.ok((result.profile.features.headHeight?.sigma as number) < 0.02);
  assert.equal(result.profile.quality.validSamples, 50);
});

test("calibration enforces sample count, duration, anchor consistency, and core coverage", () => {
  const draft = { model: TEST_MODEL, createdAt: "2026-07-18T00:00:00Z", deviceIdHash: "x" };
  assert.equal(buildCalibration(calibrationSamples({}, { count: 34 }), draft).ok, false);
  assert.deepEqual(buildCalibration(calibrationSamples({}, { durationMs: 8_999 }), draft), { ok: false, reason: "duration_too_short" });
  const mixed = calibrationSamples();
  mixed[20].anchorType = "eyes";
  assert.deepEqual(buildCalibration(mixed, draft), { ok: false, reason: "mixed_anchor" });
  const missing = calibrationSamples();
  for (const sample of missing) delete sample.features.headForward;
  assert.deepEqual(buildCalibration(missing, draft), { ok: false, reason: "missing_core", feature: "headForward" });
});

test("unstable calibration fails and does not replace a prior baseline", () => {
  const draft = { model: TEST_MODEL, createdAt: "2026-07-18T00:00:00Z", deviceIdHash: "x" };
  const unstable = calibrationSamples({}, { jitter: 0.20 });
  const failed = buildCalibration(unstable, draft);
  assert.equal(failed.ok, false);
  const old = calibrationProfile();
  assert.equal(replaceCalibration(old, failed, true), old);
});

test("valid replacement requires explicit confirmation", () => {
  const old = calibrationProfile({ createdAt: "old" });
  const candidate = buildCalibration(calibrationSamples(), {
    model: TEST_MODEL,
    createdAt: "new",
    deviceIdHash: "device-test",
  });
  assert.equal(replaceCalibration(old, candidate, false), old);
  assert.equal(replaceCalibration(old, candidate, true)?.createdAt, "new");
});

test("severity is exactly zero at dead zone, half at half range, and one at full range", () => {
  const profile = calibrationProfile();
  const cases: [number, number][] = [[0.10, 0], [0.10 + FEATURE_LIMITS.headForward.severeRange / 2, 0.5], [0.50, 1]];
  for (const [deviation, expected] of cases) {
    const features = { ...REFERENCE_FEATURES, headForward: REFERENCE_FEATURES.headForward + deviation };
    const score = scorePosture(features, "ears", profile);
    assert.equal(score.ok, true);
    if (score.ok) assert.ok(Math.abs((score.value.severities.headForward as number) - expected) < 1e-12);
  }
});

test("one head-forward severity of 0.35 yields score 65 and the correct cue", () => {
  const features = { ...REFERENCE_FEATURES, headForward: REFERENCE_FEATURES.headForward + 0.10 + 0.35 * 0.40 };
  const result = scorePosture(features, "ears", calibrationProfile());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.rawScore, 65);
  assert.equal(result.value.primaryCue, "headForward");
  assert.match(CUE_COPY[result.value.primaryCue], /^If comfortable,/);
});

test("directional features do not penalize movement in the non-drift direction", () => {
  const result = scorePosture({ ...REFERENCE_FEATURES, headHeight: 1.5, headForward: -1, torsoHeight: 2, torsoForward: -1 }, "ears", calibrationProfile());
  assert.equal(result.ok && result.value.rawScore, 100);
});

test("worst available feature drives score and ties use deterministic priority", () => {
  const features = {
    ...REFERENCE_FEATURES,
    headForward: 0.30 + 0.10 + 0.20,
    headHeight: 0.70 - 0.08 - 0.15,
    torsoForward: 0.20 + 0.10 + 0.30,
  };
  const result = scorePosture(features, "ears", calibrationProfile());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.primaryCue, "torsoForward");
  const tied = scorePosture({ ...REFERENCE_FEATURES, headForward: 0.60, headHeight: 0.47 }, "ears", calibrationProfile());
  assert.equal(tied.ok && tied.value.primaryCue, "headForward");
});

test("score fails closed for anchor mismatch, missing core, and nonfinite values", () => {
  assert.deepEqual(scorePosture(REFERENCE_FEATURES, "eyes", calibrationProfile()), { ok: false, reason: "anchor_mismatch" });
  const missing: FeatureVector = { headHeight: 0.7, headForward: 0.3 };
  assert.deepEqual(scorePosture(missing, "ears", calibrationProfile()), { ok: false, reason: "missing_core" });
  assert.deepEqual(scorePosture({ ...REFERENCE_FEATURES, headForward: Number.NaN }, "ears", calibrationProfile()), { ok: false, reason: "malformed_features" });
});

test("time-based EMA is sample-rate independent for a constant signal", () => {
  const run = (step: number): number => {
    let state = updateScoreEma({}, 100, 0).state;
    for (let timestamp = step; timestamp <= 2_000; timestamp += step) state = updateScoreEma(state, 0, timestamp).state;
    return state.score as number;
  };
  assert.ok(Math.abs(run(200) - run(500)) < 1e-12);
  assert.ok(Math.abs(run(200) - 100 / Math.E) < 1e-10);
});

test("EMA rejects stale/malformed time and supports explicit reset", () => {
  const first = updateScoreEma({}, 80, 1_000);
  assert.equal(first.accepted, true);
  const stale = updateScoreEma(first.state, 0, 1_000);
  assert.equal(stale.accepted, false);
  assert.equal(stale.state, first.state);
  const reset = updateScoreEma(first.state, 20, 2_000, true);
  assert.equal(reset.score, 20);
  assert.equal(updateScoreEma(reset.state, Number.NaN, 3_000).accepted, false);
});

function balancedWithoutResumeGuard(): ReturnType<typeof settingsForPreset> {
  return { ...settingsForPreset("balanced"), resumeGuardMs: 0 };
}

function runLowUntilAlert(start: AlertState, startMs = 0): AlertState {
  const settings = balancedWithoutResumeGuard();
  let state = resumeAlertState(start, startMs, settings);
  for (let second = 1; second <= 15; second++) {
    state = updateAlertState(state, {
      timestampMs: startMs + second * 1_000,
      monitoring: true,
      validity: "valid",
      score: 64,
      primaryCue: "headForward",
    }, settings).state;
  }
  return state;
}

test("Balanced alerts at 15 valid low seconds, never at 14.999", () => {
  const settings = balancedWithoutResumeGuard();
  let state = resumeAlertState(initialAlertState(), 0, settings);
  let result = updateAlertState(state, { timestampMs: 14_999, monitoring: true, validity: "valid", score: 64 }, settings);
  assert.equal(result.alertTriggered, false);
  state = result.state;
  result = updateAlertState(state, { timestampMs: 15_000, monitoring: true, validity: "valid", score: 64, primaryCue: "headForward" }, settings);
  assert.equal(result.alertTriggered, true);
  assert.equal(result.cue, "headForward");
  assert.equal(result.state.alertCount, 1);
});

test("pending dwell decrements at 65-69 and resets at 70", () => {
  const settings = balancedWithoutResumeGuard();
  let state = resumeAlertState(initialAlertState(), 0, settings);
  state = updateAlertState(state, { timestampMs: 5_000, monitoring: true, validity: "valid", score: 64 }, settings).state;
  assert.equal(state.badDwellMs, 5_000);
  state = updateAlertState(state, { timestampMs: 7_000, monitoring: true, validity: "valid", score: 67 }, settings).state;
  assert.equal(state.badDwellMs, 3_000);
  state = updateAlertState(state, { timestampMs: 8_000, monitoring: true, validity: "valid", score: 70 }, settings).state;
  assert.equal(state.badDwellMs, 0);
});

test("transient invalidity freezes dwell and confirmed invalidity resets it", () => {
  const settings = balancedWithoutResumeGuard();
  let state = resumeAlertState(initialAlertState(), 0, settings);
  state = updateAlertState(state, { timestampMs: 5_000, monitoring: true, validity: "valid", score: 64 }, settings).state;
  state = updateAlertState(state, { timestampMs: 6_000, monitoring: true, validity: "transient" }, settings).state;
  assert.equal(state.badDwellMs, 5_000);
  state = updateAlertState(state, { timestampMs: 7_000, monitoring: true, validity: "valid", score: 64 }, settings).state;
  assert.equal(state.badDwellMs, 5_000);
  state = updateAlertState(state, { timestampMs: 8_000, monitoring: true, validity: "invalid" }, settings).state;
  assert.equal(state.badDwellMs, 0);
});

test("pause and snooze reset dwell and require a fresh resume guard", () => {
  const settings = settingsForPreset("balanced");
  let state = resumeAlertState(initialAlertState(), 0, settings);
  state = updateAlertState(state, { timestampMs: 16_000, monitoring: true, validity: "valid", score: 64 }, settings).state;
  state = updateAlertState(state, { timestampMs: 17_000, monitoring: true, paused: true, validity: "invalid" }, settings).state;
  assert.equal(state.phase, "paused");
  assert.equal(state.badDwellMs, 0);
  state = resumeAlertState(state, 20_000, settings);
  state = updateAlertState(state, { timestampMs: 34_999, monitoring: true, validity: "valid", score: 64 }, settings).state;
  assert.equal(state.badDwellMs, 0);
  state = updateAlertState(state, { timestampMs: 35_000, monitoring: true, snoozed: true, validity: "invalid" }, settings).state;
  assert.equal(state.phase, "snoozed");
});

test("cooldown suppresses repeats and expiry requires a fresh full dwell", () => {
  const settings = balancedWithoutResumeGuard();
  let state = runLowUntilAlert(initialAlertState());
  assert.equal(state.phase, "cooldown");
  const during = updateAlertState(state, { timestampMs: 614_999, monitoring: true, validity: "valid", score: 64 }, settings);
  assert.equal(during.alertTriggered, false);
  state = during.state;
  const expiry = updateAlertState(state, { timestampMs: 615_000, monitoring: true, validity: "valid", score: 64 }, settings);
  assert.equal(expiry.alertTriggered, false);
  assert.equal(expiry.state.badDwellMs, 0);
  state = expiry.state;
  const repeat = updateAlertState(state, { timestampMs: 630_000, monitoring: true, validity: "valid", score: 64 }, settings);
  assert.equal(repeat.alertTriggered, true);
  assert.equal(repeat.state.alertCount, 2);
});

test("recovery requires score 75 for three valid seconds during cooldown", () => {
  const settings = balancedWithoutResumeGuard();
  let state = runLowUntilAlert(initialAlertState());
  let result = updateAlertState(state, { timestampMs: 16_000, monitoring: true, validity: "valid", score: 75 }, settings);
  state = result.state;
  assert.equal(result.recovered, false);
  result = updateAlertState(state, { timestampMs: 17_000, monitoring: true, validity: "valid", score: 75 }, settings);
  state = result.state;
  assert.equal(result.recovered, false);
  result = updateAlertState(state, { timestampMs: 18_000, monitoring: true, validity: "valid", score: 75 }, settings);
  assert.equal(result.recovered, true);
});

test("ordinary brief movement streams never accumulate enough dwell", () => {
  const settings = balancedWithoutResumeGuard();
  let state = resumeAlertState(initialAlertState(), 0, settings);
  const stream = [95, 60, 45, 55, 80, 90, 50, 90, 40, 85, 95];
  let alerts = 0;
  for (let index = 0; index < stream.length; index++) {
    const result = updateAlertState(state, {
      timestampMs: (index + 1) * 1_000,
      monitoring: true,
      validity: "valid",
      score: stream[index],
    }, settings);
    state = result.state;
    if (result.alertTriggered) alerts++;
  }
  assert.equal(alerts, 0);
});

test("alert engine rejects stale and malformed samples without mutation", () => {
  const settings = balancedWithoutResumeGuard();
  const state = resumeAlertState(initialAlertState(), 1_000, settings);
  const stale = updateAlertState(state, { timestampMs: 1_000, monitoring: true, validity: "valid", score: 64 }, settings);
  assert.equal(stale.accepted, false);
  assert.equal(stale.state, state);
  const malformed = updateAlertState(state, { timestampMs: 2_000, monitoring: true, validity: "valid", score: Number.NaN }, settings);
  assert.equal(malformed.accepted, false);
  assert.equal(malformed.state, state);
});

test("serialization round-trips exact compatible calibration", () => {
  const profile = calibrationProfile();
  const result = parseCalibration(serializeCalibration(profile), { model: TEST_MODEL });
  assert.deepEqual(result, { ok: true, profile });
});

test("serialization rejects invalid JSON, malformed values, schema changes, and model changes", () => {
  assert.deepEqual(parseCalibration("{", { model: TEST_MODEL }), { ok: false, reason: "invalid_json" });
  assert.deepEqual(parseCalibration("{}", { model: TEST_MODEL }), { ok: false, reason: "invalid_shape" });
  const schema = calibrationProfile({ featureSchemaVersion: 2 });
  assert.deepEqual(parseCalibration(serializeCalibration(schema), { model: TEST_MODEL }), { ok: false, reason: "incompatible_schema" });
  const changedModel = { ...TEST_MODEL, version: "other" };
  assert.deepEqual(parseCalibration(serializeCalibration(calibrationProfile()), { model: changedModel }), { ok: false, reason: "incompatible_model" });
  const malformed = calibrationProfile();
  (malformed.features.headForward as { median: number; sigma: number }).median = Number.NaN;
  assert.deepEqual(parseCalibration(serializeCalibration(malformed), { model: TEST_MODEL }), { ok: false, reason: "invalid_shape" });
});

test("all user-facing cue copy remains relative, comfortable, and non-medical", () => {
  const forbidden = /bad posture|wrong posture|perfect posture|diagnos|treat|prevent pain|damage|spine/i;
  for (const [feature, copy] of Object.entries(CUE_COPY) as [FeatureName, string][]) {
    assert.match(copy, /^If comfortable,/);
    assert.match(copy, /reference/);
    assert.doesNotMatch(`${feature} ${copy}`, forbidden);
  }
});
