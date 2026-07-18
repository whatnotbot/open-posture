import type {
  CalibrationDraft,
  CalibrationProfile,
  CalibrationResult,
  CueKey,
  EngineSettings,
  FeatureName,
  QualificationStatus,
} from "../../shared/posture/index.ts";

export type CameraErrorCode =
  | "permission_denied"
  | "no_device"
  | "busy"
  | "disconnected"
  | "unsupported_constraints"
  | "model_failed"
  | "unknown";

export type StopReason = "pause" | "snooze" | "restart" | "quit" | "reset" | "error" | "manual";
export type PipelineState = "stopped" | "starting" | "running" | "stopping" | "error";

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export type CameraPipelineEvent =
  | { type: "state"; state: PipelineState }
  | { type: "stream"; stream: MediaStream | null }
  | { type: "analysis"; timestampMs: number; events: readonly PoseAnalysisEvent[]; inferenceMs: number }
  | { type: "frame_dropped"; total: number }
  | { type: "worker_restarted" }
  | { type: "error"; code: CameraErrorCode };

export interface CloseableImageSource {
  readonly image: ImageBitmap;
  close(): void;
}

export interface FrameSource {
  start(stream: MediaStream): Promise<void>;
  capture(): Promise<CloseableImageSource>;
  stop(): void;
}

export interface PoseEstimator {
  start(): Promise<void>;
  setPositioning(): void;
  beginCalibration(draft: CalibrationDraft): void;
  startMonitoring(profile: CalibrationProfile, settings: EngineSettings): void;
  stopAnalysis(): void;
  infer(image: ImageBitmap, timestampMs: number): Promise<readonly PoseAnalysisEvent[]>;
  stop(): void;
}

export interface Scheduler {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

export interface CameraPipelineOptions {
  mediaDevices?: Pick<MediaDevices, "getUserMedia" | "enumerateDevices">;
  frameSource?: FrameSource;
  estimator?: PoseEstimator;
  scheduler?: Scheduler;
  now?: () => number;
  sampleIntervalMs?: number;
}

export interface CameraPipelineController {
  readonly state: PipelineState;
  readonly stream: MediaStream | null;
  readonly activeDeviceId: string | null;
  readonly droppedFrames: number;
  start(deviceId?: string): Promise<void>;
  setPositioning(): void;
  beginCalibration(draft: CalibrationDraft): void;
  startMonitoring(profile: CalibrationProfile, settings: EngineSettings): void;
  stopAnalysis(): void;
  stop(reason?: StopReason): Promise<void>;
  restart(deviceId?: string): Promise<void>;
  devices(): Promise<readonly CameraDevice[]>;
  subscribe(listener: (event: CameraPipelineEvent) => void): () => void;
}

export interface WorkerLike {
  onmessage: ((event: MessageEvent<PoseWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: PoseWorkerCommand, transfer?: readonly Transferable[]): void;
  terminate(): void;
}

export type PoseWorkerCommand =
  | { type: "initialize" }
  | { type: "positioning" }
  | { type: "begin_calibration"; draft: CalibrationDraft }
  | { type: "start_monitoring"; profile: CalibrationProfile; settings: EngineSettings }
  | { type: "stop_analysis" }
  | { type: "frame"; image: ImageBitmap; timestampMs: number }
  | { type: "close" };

export type PoseWorkerResponse =
  | { type: "ready" }
  | { type: "result"; timestampMs: number; events: PoseAnalysisEvent[] }
  | { type: "error"; code: "model_failed" };

export type PoseAnalysisEvent =
  | {
      type: "quality";
      status: QualificationStatus;
      reason?: string;
      resetTemporalState: boolean;
    }
  | {
      type: "calibration_progress";
      validSamples: number;
      elapsedMs: number;
    }
  | {
      type: "calibration_ready";
      profile: CalibrationProfile;
    }
  | {
      type: "calibration_failed";
      reason: Extract<CalibrationResult, { ok: false }>["reason"];
      feature?: FeatureName;
    }
  | {
      type: "monitoring";
      score?: number;
      severities?: Partial<Record<FeatureName, number>>;
      primaryCue?: CueKey;
      coverage?: number;
      recoveryDwellMs?: number;
    }
  | {
      type: "alert";
      triggered: boolean;
      recovered: boolean;
      cue?: CueKey;
    };
