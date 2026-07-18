import { CameraSession, classifyCameraError } from "./camera-session.ts";
import { WorkerPoseEstimator } from "./worker-estimator.ts";
import type { CalibrationDraft, CalibrationProfile, EngineSettings } from "../../shared/posture/index.ts";
import type {
  CameraDevice,
  CameraErrorCode,
  CameraPipelineController,
  CameraPipelineEvent,
  CameraPipelineOptions,
  CloseableImageSource,
  FrameSource,
  PipelineState,
  PoseEstimator,
  Scheduler,
  StopReason,
} from "./types.ts";

const browserScheduler: Scheduler = {
  set: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clear: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type AnalysisConfig =
  | { mode: "positioning" }
  | { mode: "calibrating"; draft: CalibrationDraft }
  | { mode: "monitoring"; profile: CalibrationProfile; settings: EngineSettings }
  | { mode: "stopped" };

export class LocalCameraPoseController implements CameraPipelineController {
  private readonly camera: CameraSession;
  private readonly frameSource: FrameSource;
  private readonly estimator: PoseEstimator;
  private readonly scheduler: Scheduler;
  private readonly now: () => number;
  private readonly sampleIntervalMs: number;
  private readonly listeners = new Set<(event: CameraPipelineEvent) => void>();
  private timer: unknown;
  private generation = 0;
  private busy = false;
  private workerRestarts = 0;
  private currentState: PipelineState = "stopped";
  private dropped = 0;
  private analysis: AnalysisConfig = { mode: "positioning" };

  constructor(options: CameraPipelineOptions = {}) {
    const mediaDevices = options.mediaDevices ?? globalThis.navigator?.mediaDevices;
    if (!mediaDevices) throw new Error("Camera media APIs are unavailable");
    this.camera = new CameraSession(mediaDevices);
    this.frameSource = options.frameSource ?? new VideoElementFrameSource();
    this.estimator = options.estimator ?? new WorkerPoseEstimator();
    this.scheduler = options.scheduler ?? browserScheduler;
    this.now = options.now ?? (() => performance.now());
    this.sampleIntervalMs = options.sampleIntervalMs ?? 200;
    this.camera.onUnexpectedEnd(() => void this.fail("disconnected"));
  }

  get state(): PipelineState {
    return this.currentState;
  }

  get stream(): MediaStream | null {
    return this.camera.stream;
  }

  get activeDeviceId(): string | null {
    return this.camera.activeDeviceId;
  }

  get droppedFrames(): number {
    return this.dropped;
  }

  subscribe(listener: (event: CameraPipelineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async devices(): Promise<readonly CameraDevice[]> {
    return this.camera.devices();
  }

  setPositioning(): void {
    this.analysis = { mode: "positioning" };
    if (this.currentState === "running") this.estimator.setPositioning();
  }

  beginCalibration(draft: CalibrationDraft): void {
    this.analysis = { mode: "calibrating", draft };
    if (this.currentState === "running") this.estimator.beginCalibration(draft);
  }

  startMonitoring(profile: CalibrationProfile, settings: EngineSettings): void {
    this.analysis = { mode: "monitoring", profile, settings };
    if (this.currentState === "running") this.estimator.startMonitoring(profile, settings);
  }

  stopAnalysis(): void {
    this.analysis = { mode: "stopped" };
    if (this.currentState === "running") this.estimator.stopAnalysis();
  }

  async start(deviceId?: string): Promise<void> {
    if (this.currentState !== "stopped" && this.currentState !== "error") await this.stop("restart");
    const generation = ++this.generation;
    this.dropped = 0;
    this.workerRestarts = 0;
    this.setState("starting");
    let stage: "model" | "camera" | "frame" = "model";
    try {
      await this.estimator.start();
      if (generation !== this.generation) return;
      this.applyAnalysis();
      stage = "camera";
      const stream = await this.camera.start(deviceId);
      if (generation !== this.generation) {
        this.camera.stop("restart");
        return;
      }
      stage = "frame";
      await this.frameSource.start(stream);
      if (generation !== this.generation) {
        this.frameSource.stop();
        this.camera.stop("restart");
        return;
      }
      this.emit({ type: "stream", stream });
      this.setState("running");
      this.schedule(generation, 0);
    } catch (error) {
      if (generation === this.generation) {
        const code = stage === "model" ? "model_failed" : stage === "camera" ? classifyCameraError(error) : "unknown";
        await this.fail(code);
      }
    }
  }

  async stop(reason: StopReason = "manual"): Promise<void> {
    ++this.generation;
    if (this.currentState === "stopped") return;
    this.setState("stopping");
    if (this.timer !== undefined) this.scheduler.clear(this.timer);
    this.timer = undefined;
    this.frameSource.stop();
    this.camera.stop(reason);
    this.estimator.stop();
    this.busy = false;
    this.emit({ type: "stream", stream: null });
    this.setState("stopped");
  }

  async restart(deviceId?: string): Promise<void> {
    await this.stop("restart");
    await this.start(deviceId);
  }

  private schedule(generation: number, delayMs: number): void {
    this.timer = this.scheduler.set(() => {
      if (generation !== this.generation || this.currentState !== "running") return;
      this.schedule(generation, this.sampleIntervalMs);
      void this.sample(generation);
    }, delayMs);
  }

  private async sample(generation: number): Promise<void> {
    if (generation !== this.generation || this.currentState !== "running") return;
    if (this.busy) {
      this.dropped++;
      this.emit({ type: "frame_dropped", total: this.dropped });
      return;
    }
    this.busy = true;
    let frame: CloseableImageSource | undefined;
    try {
      frame = await this.frameSource.capture();
      const timestampMs = this.now();
      const startedAt = this.now();
      let events: Awaited<ReturnType<PoseEstimator["infer"]>>;
      try {
        events = await this.estimator.infer(frame.image, timestampMs);
      } catch {
        if (generation !== this.generation) return;
        if (this.workerRestarts === 0) {
          this.workerRestarts = 1;
          this.estimator.stop();
          await this.estimator.start();
          this.applyAnalysis();
          this.emit({ type: "worker_restarted" });
          return;
        }
        await this.fail("model_failed");
        return;
      }
      if (generation === this.generation && this.currentState === "running") {
        this.emit({ type: "analysis", timestampMs, events, inferenceMs: Math.max(0, this.now() - startedAt) });
      }
    } catch {
      if (generation === this.generation) await this.fail("unknown");
    } finally {
      frame?.close();
      if (generation === this.generation) this.busy = false;
    }
  }

  private async fail(code: CameraErrorCode): Promise<void> {
    ++this.generation;
    if (this.timer !== undefined) this.scheduler.clear(this.timer);
    this.timer = undefined;
    this.frameSource.stop();
    this.camera.stop("error");
    this.estimator.stop();
    this.busy = false;
    this.emit({ type: "stream", stream: null });
    this.setState("error");
    this.emit({ type: "error", code });
  }

  private applyAnalysis(): void {
    if (this.analysis.mode === "positioning") this.estimator.setPositioning();
    else if (this.analysis.mode === "calibrating") this.estimator.beginCalibration(this.analysis.draft);
    else if (this.analysis.mode === "monitoring") this.estimator.startMonitoring(this.analysis.profile, this.analysis.settings);
    else this.estimator.stopAnalysis();
  }

  private setState(state: PipelineState): void {
    this.currentState = state;
    this.emit({ type: "state", state });
  }

  private emit(event: CameraPipelineEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

class VideoElementFrameSource implements FrameSource {
  private video: HTMLVideoElement | null = null;

  async start(stream: MediaStream): Promise<void> {
    this.stop();
    const video = document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;
    this.video = video;
    await video.play();
  }

  async capture(): Promise<CloseableImageSource> {
    if (!this.video) throw new Error("Frame source is stopped");
    const image = await createImageBitmap(this.video);
    return { image, close: () => image.close() };
  }

  stop(): void {
    if (!this.video) return;
    this.video.pause();
    this.video.srcObject = null;
    this.video = null;
  }
}
