import {
  buildCalibration,
  extractFeatures,
  initialAlertState,
  initialQualificationState,
  inspectFrame,
  resumeAlertState,
  scorePosture,
  updateAlertState,
  updateQualification,
  updateScoreEma,
  type AlertState,
  type CalibrationDraft,
  type CalibrationProfile,
  type CalibrationSample,
  type EngineSettings,
  type PoseInput,
  type QualificationState,
  type ScoreEmaState,
} from "../../shared/posture/index.ts";
import type { PoseAnalysisEvent } from "./types.ts";

type AnalysisMode = "idle" | "positioning" | "calibrating" | "monitoring";

/** Runs inside the pose worker. Inputs are discarded after each call; only derived events leave it. */
export class WorkerAnalysisEngine {
  private mode: AnalysisMode = "idle";
  private qualification: QualificationState = initialQualificationState();
  private calibrationDraft: CalibrationDraft | null = null;
  private calibrationSamples: CalibrationSample[] = [];
  private calibrationStartedAt: number | undefined;
  private calibrationFirstValidAt: number | undefined;
  private monitoringProfile: CalibrationProfile | null = null;
  private monitoringSettings: EngineSettings | null = null;
  private ema: ScoreEmaState = {};
  private alert: AlertState = initialAlertState();
  private resetEma = true;

  setPositioning(): void {
    this.reset("positioning");
  }

  beginCalibration(draft: CalibrationDraft): void {
    this.reset("calibrating");
    this.calibrationDraft = draft;
  }

  startMonitoring(profile: CalibrationProfile, settings: EngineSettings): void {
    this.reset("monitoring");
    this.monitoringProfile = profile;
    this.monitoringSettings = settings;
  }

  stop(): void {
    this.reset("idle");
  }

  analyze(poses: readonly PoseInput[], timestampMs: number): PoseAnalysisEvent[] {
    if (this.mode === "idle") return [];
    const requiredAnchor = this.mode === "monitoring"
      ? this.monitoringProfile?.anchorType
      : this.calibrationSamples[0]?.anchorType;
    const inspection = inspectFrame(poses, requiredAnchor);
    const updated = updateQualification(this.qualification, timestampMs, inspection);
    this.qualification = updated.state;
    const quality: PoseAnalysisEvent = updated.reason
      ? { type: "quality", status: updated.status, reason: updated.reason, resetTemporalState: updated.resetTemporalState }
      : { type: "quality", status: updated.status, resetTemporalState: updated.resetTemporalState };
    const events: PoseAnalysisEvent[] = [quality];
    if (updated.resetTemporalState) this.resetEma = true;
    if (this.mode === "calibrating") this.analyzeCalibration(updated.pose, timestampMs, events);
    if (this.mode === "monitoring") this.analyzeMonitoring(updated.pose, updated.status, timestampMs, events);
    return events;
  }

  private analyzeCalibration(
    pose: NonNullable<ReturnType<typeof updateQualification>["pose"]> | undefined,
    timestampMs: number,
    events: PoseAnalysisEvent[],
  ): void {
    this.calibrationStartedAt ??= timestampMs;
    if (pose) {
      const extracted = extractFeatures(pose.pose, pose.anchorType);
      if (extracted.ok) {
        this.calibrationFirstValidAt ??= timestampMs;
        this.calibrationSamples.push({ timestampMs, features: extracted.features, anchorType: extracted.anchorType });
        events.push({
          type: "calibration_progress",
          validSamples: this.calibrationSamples.length,
          elapsedMs: timestampMs - this.calibrationFirstValidAt,
        });
      }
    }
    const validDuration = this.calibrationFirstValidAt === undefined ? 0 : timestampMs - this.calibrationFirstValidAt;
    if (this.calibrationDraft && this.calibrationSamples.length >= 35 && validDuration >= 9_000) {
      this.finishCalibration(buildCalibration(this.calibrationSamples, this.calibrationDraft), events);
      return;
    }
    if (this.calibrationDraft && timestampMs - this.calibrationStartedAt >= 60_000) {
      this.finishCalibration(buildCalibration(this.calibrationSamples, this.calibrationDraft), events);
    }
  }

  private finishCalibration(result: ReturnType<typeof buildCalibration>, events: PoseAnalysisEvent[]): void {
    if (result.ok) events.push({ type: "calibration_ready", profile: result.profile });
    else {
      events.push(result.feature
        ? { type: "calibration_failed", reason: result.reason, feature: result.feature }
        : { type: "calibration_failed", reason: result.reason });
    }
    this.reset("positioning");
  }

  private analyzeMonitoring(
    pose: NonNullable<ReturnType<typeof updateQualification>["pose"]> | undefined,
    status: ReturnType<typeof updateQualification>["status"],
    timestampMs: number,
    events: PoseAnalysisEvent[],
  ): void {
    const profile = this.monitoringProfile;
    const settings = this.monitoringSettings;
    if (!profile || !settings) return;
    if (this.alert.lastTimestampMs === undefined) {
      this.alert = resumeAlertState(this.alert, timestampMs, settings);
      events.push({ type: "monitoring" });
      return;
    }
    if (!pose) {
      const validity = status === "transient" || status === "finding" ? "transient" : "invalid";
      this.alert = updateAlertState(this.alert, { timestampMs, monitoring: true, validity }, settings).state;
      events.push({ type: "monitoring" });
      return;
    }
    const extracted = extractFeatures(pose.pose, profile.anchorType);
    if (!extracted.ok) {
      this.alert = updateAlertState(this.alert, { timestampMs, monitoring: true, validity: "invalid" }, settings).state;
      events.push({ type: "monitoring" });
      return;
    }
    const scored = scorePosture(extracted.features, extracted.anchorType, profile);
    if (!scored.ok) {
      this.alert = updateAlertState(this.alert, { timestampMs, monitoring: true, validity: "invalid" }, settings).state;
      events.push({ type: "monitoring" });
      return;
    }
    const smoothed = updateScoreEma(this.ema, scored.value.rawScore, timestampMs, this.resetEma, settings.emaTimeConstantMs);
    if (!smoothed.accepted || smoothed.score === undefined) return;
    this.ema = smoothed.state;
    this.resetEma = false;
    const alertUpdate = updateAlertState(this.alert, {
      timestampMs,
      monitoring: true,
      validity: "valid",
      score: smoothed.score,
      primaryCue: scored.value.primaryCue,
    }, settings);
    this.alert = alertUpdate.state;
    events.push({
      type: "monitoring",
      score: Math.round(smoothed.score),
      severities: scored.value.severities,
      primaryCue: scored.value.primaryCue,
      coverage: scored.value.coverage,
      recoveryDwellMs: this.alert.recoveryDwellMs,
    });
    if (alertUpdate.alertTriggered || alertUpdate.recovered) {
      events.push(alertUpdate.cue
        ? { type: "alert", triggered: alertUpdate.alertTriggered, recovered: alertUpdate.recovered, cue: alertUpdate.cue }
        : { type: "alert", triggered: alertUpdate.alertTriggered, recovered: alertUpdate.recovered });
    }
  }

  private reset(mode: AnalysisMode): void {
    this.mode = mode;
    this.qualification = initialQualificationState();
    this.calibrationDraft = null;
    this.calibrationSamples = [];
    this.calibrationStartedAt = undefined;
    this.calibrationFirstValidAt = undefined;
    this.monitoringProfile = null;
    this.monitoringSettings = null;
    this.ema = {};
    this.alert = initialAlertState();
    this.resetEma = true;
  }
}
