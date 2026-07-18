import type { PoseAnalysisEvent, PoseEstimator, PoseWorkerResponse, WorkerLike } from "./types.ts";
import type { CalibrationDraft, CalibrationProfile, EngineSettings } from "../../shared/posture/index.ts";

type PendingStart = { resolve: () => void; reject: (error: Error) => void };
type PendingFrame = { timestampMs: number; resolve: (events: readonly PoseAnalysisEvent[]) => void; reject: (error: Error) => void };

export class WorkerPoseEstimator implements PoseEstimator {
  private readonly createWorker: () => WorkerLike;
  private worker: WorkerLike | null = null;
  private starting: PendingStart | null = null;
  private pending: PendingFrame | null = null;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private ready = false;

  constructor(createWorker: () => WorkerLike = defaultWorkerFactory) {
    this.createWorker = createWorker;
  }

  start(): Promise<void> {
    this.stop();
    const worker = this.createWorker();
    this.worker = worker;
    worker.onmessage = (event): void => this.handleMessage(event.data);
    worker.onerror = (): void => this.fail(new Error("Pose worker failed"));
    return new Promise<void>((resolve, reject) => {
      this.starting = { resolve, reject };
      this.timeout = setTimeout(() => this.fail(new Error("Pose worker initialization timed out")), 10_000);
      worker.postMessage({ type: "initialize" });
    });
  }

  setPositioning(): void {
    this.command({ type: "positioning" });
  }

  beginCalibration(draft: CalibrationDraft): void {
    this.command({ type: "begin_calibration", draft });
  }

  startMonitoring(profile: CalibrationProfile, settings: EngineSettings): void {
    this.command({ type: "start_monitoring", profile, settings });
  }

  stopAnalysis(): void {
    this.command({ type: "stop_analysis" });
  }

  infer(image: ImageBitmap, timestampMs: number): Promise<readonly PoseAnalysisEvent[]> {
    if (!this.worker || !this.ready || this.starting) return Promise.reject(new Error("Pose worker is not ready"));
    if (this.pending) return Promise.reject(new Error("Pose inference already in flight"));
    return new Promise<readonly PoseAnalysisEvent[]>((resolve, reject) => {
      this.pending = { timestampMs, resolve, reject };
      this.timeout = setTimeout(() => this.fail(new Error("Pose inference timed out")), 10_000);
      this.worker?.postMessage({ type: "frame", image, timestampMs }, [image]);
    });
  }

  stop(): void {
    const error = new Error("Pose worker stopped");
    this.starting?.reject(error);
    this.pending?.reject(error);
    this.starting = null;
    this.pending = null;
    this.ready = false;
    if (this.timeout !== undefined) clearTimeout(this.timeout);
    this.timeout = undefined;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.postMessage({ type: "close" });
      this.worker.terminate();
      this.worker = null;
    }
  }

  private handleMessage(message: PoseWorkerResponse): void {
    if (message.type === "ready") {
      const starting = this.starting;
      this.starting = null;
      this.ready = true;
      if (this.timeout !== undefined) clearTimeout(this.timeout);
      this.timeout = undefined;
      starting?.resolve();
      return;
    }
    if (message.type === "result") {
      const pending = this.pending;
      if (!pending || pending.timestampMs !== message.timestampMs) return;
      this.pending = null;
      if (this.timeout !== undefined) clearTimeout(this.timeout);
      this.timeout = undefined;
      pending.resolve(message.events);
      return;
    }
    this.fail(new Error(message.code));
  }

  private fail(error: Error): void {
    if (this.timeout !== undefined) clearTimeout(this.timeout);
    this.timeout = undefined;
    this.starting?.reject(error);
    this.pending?.reject(error);
    this.starting = null;
    this.pending = null;
    this.ready = false;
  }

  private command(message: Parameters<WorkerLike["postMessage"]>[0]): void {
    if (!this.worker || !this.ready) throw new Error("Pose worker is not ready");
    this.worker.postMessage(message);
  }
}

function defaultWorkerFactory(): WorkerLike {
  // Webpack 5 turns this statically analyzable URL into a local worker asset.
  // @ts-expect-error NodeNext treats .ts as CJS; the renderer bundle is ESM-capable web code.
  return new Worker(new URL("./pose-worker.ts", import.meta.url), { type: "module", name: "open-posture-pose" });
}
