import assert from "node:assert/strict";
import test from "node:test";

import { WorkerAnalysisEngine } from "../../src/renderer/camera/analysis-engine.ts";
import { settingsForPreset, type CalibrationProfile } from "../../src/shared/posture/index.ts";
import { TEST_MODEL, validPose } from "../fixtures/posture/index.ts";
import type { PoseAnalysisEvent } from "../../src/renderer/camera/types.ts";

const draft = {
  model: TEST_MODEL,
  createdAt: "2026-07-18T00:00:00.000Z",
  deviceIdHash: "device-test",
};

function collectCalibration(engine: WorkerAnalysisEngine): { events: PoseAnalysisEvent[]; profile: CalibrationProfile } {
  engine.beginCalibration(draft);
  const events: PoseAnalysisEvent[] = [];
  for (let timestampMs = 0; timestampMs <= 11_000; timestampMs += 200) {
    events.push(...engine.analyze([validPose()], timestampMs));
  }
  const ready = events.find((event): event is Extract<PoseAnalysisEvent, { type: "calibration_ready" }> => event.type === "calibration_ready");
  assert.ok(ready);
  return { events, profile: ready.profile };
}

test("positioning emits neutral quality only and never raw landmark data", () => {
  const engine = new WorkerAnalysisEngine();
  engine.setPositioning();
  const events = engine.analyze([validPose()], 0);
  assert.deepEqual(events, [{ type: "quality", status: "finding", resetTemporalState: false }]);
  assertNoRawPoseData(events);
});

test("calibration keeps samples worker-local and emits a compatible derived profile", () => {
  const engine = new WorkerAnalysisEngine();
  const { events, profile } = collectCalibration(engine);
  assert.equal(profile.model.sha256, TEST_MODEL.sha256);
  assert.equal(profile.anchorType, "ears");
  assert.ok(profile.quality.validSamples >= 35);
  assert.ok(events.some((event) => event.type === "calibration_progress"));
  assertNoRawPoseData(events);
});

test("calibration times out safely without a qualifying pose", () => {
  const engine = new WorkerAnalysisEngine();
  engine.beginCalibration(draft);
  engine.analyze([], 0);
  const events = engine.analyze([], 60_000);
  assert.ok(events.some((event) => event.type === "calibration_failed" && event.reason === "not_enough_samples"));
  assertNoRawPoseData(events);
});

test("monitoring emits derived score, cue, severities, and coverage only", () => {
  const calibrationEngine = new WorkerAnalysisEngine();
  const { profile } = collectCalibration(calibrationEngine);
  const engine = new WorkerAnalysisEngine();
  engine.startMonitoring(profile, settingsForPreset("balanced"));
  const events: PoseAnalysisEvent[] = [];
  for (const timestampMs of [0, 1_000, 2_000]) events.push(...engine.analyze([validPose()], timestampMs));
  const monitoring = events.find((event): event is Extract<PoseAnalysisEvent, { type: "monitoring" }> =>
    event.type === "monitoring" && event.score !== undefined);
  assert.ok(monitoring);
  assert.equal(monitoring.score, 100);
  assert.ok(monitoring.primaryCue);
  assert.ok(monitoring.severities);
  assert.equal(monitoring.coverage, 1);
  assertNoRawPoseData(events);
});

test("away and multiple-person inputs emit neutral quality with no score", () => {
  const calibrationEngine = new WorkerAnalysisEngine();
  const { profile } = collectCalibration(calibrationEngine);
  const engine = new WorkerAnalysisEngine();
  engine.startMonitoring(profile, settingsForPreset("balanced"));
  const away = [
    ...engine.analyze([], 0),
    ...engine.analyze([], 2_000),
  ];
  assert.ok(away.some((event) => event.type === "quality" && event.status === "away"));
  assert.equal(away.some((event) => event.type === "monitoring" && event.score !== undefined), false);

  engine.startMonitoring(profile, settingsForPreset("balanced"));
  const two = [validPose(), validPose()];
  engine.analyze(two, 0);
  engine.analyze(two, 200);
  const multiple = engine.analyze(two, 400);
  assert.ok(multiple.some((event) => event.type === "quality" && event.status === "multiple_people"));
  assert.equal(multiple.some((event) => event.type === "monitoring" && event.score !== undefined), false);
  assertNoRawPoseData([...away, ...multiple]);
});

function assertNoRawPoseData(events: readonly PoseAnalysisEvent[]): void {
  const forbidden = new Set(["normalized", "world", "landmarks", "worldLandmarks", "pose"]);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbidden.has(key), false, `raw pose key escaped worker: ${key}`);
      visit(child);
    }
  };
  visit(events);
}
