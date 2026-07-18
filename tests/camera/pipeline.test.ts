import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalCameraPoseController,
  WorkerPoseEstimator,
  type CameraPipelineEvent,
  type CloseableImageSource,
  type FrameSource,
  type PoseEstimator,
  type PoseWorkerCommand,
  type PoseWorkerResponse,
  type Scheduler,
  type WorkerLike,
} from "../../src/renderer/camera/index.ts";
import { mapPoseLandmarkerResult } from "../../src/renderer/camera/landmark-mapping.ts";
import { calibrationProfile } from "../fixtures/posture/index.ts";
import { settingsForPreset, type CalibrationDraft } from "../../src/shared/posture/index.ts";

class FakeTrack extends EventTarget {
  stopCalls = 0;
  stop(): void {
    this.stopCalls++;
    this.dispatchEvent(new Event("ended"));
  }

  getSettings(): MediaTrackSettings {
    return { deviceId: "camera-1" };
  }
}

class FakeStream {
  readonly track = new FakeTrack();
  getTracks(): MediaStreamTrack[] {
    return [this.track as unknown as MediaStreamTrack];
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.getTracks();
  }
}

class ManualScheduler implements Scheduler {
  private nextId = 0;
  private callbacks = new Map<number, () => void>();

  set(callback: () => void, _delayMs: number): number {
    const id = ++this.nextId;
    this.callbacks.set(id, callback);
    return id;
  }

  clear(handle: unknown): void {
    this.callbacks.delete(handle as number);
  }

  runNext(): void {
    const entry = this.callbacks.entries().next().value as [number, () => void] | undefined;
    if (!entry) throw new Error("No scheduled callback");
    this.callbacks.delete(entry[0]);
    entry[1]();
  }

  get size(): number {
    return this.callbacks.size;
  }
}

class FakeFrameSource implements FrameSource {
  starts = 0;
  stops = 0;
  captures = 0;
  closes = 0;

  async start(_stream: MediaStream): Promise<void> {
    this.starts++;
  }

  async capture(): Promise<CloseableImageSource> {
    this.captures++;
    return {
      image: { close: () => undefined } as unknown as ImageBitmap,
      close: () => this.closes++,
    };
  }

  stop(): void {
    this.stops++;
  }
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

class FakeEstimator implements PoseEstimator {
  starts = 0;
  stops = 0;
  calls = 0;
  next = deferred<readonly []>();
  commands: string[] = [];

  async start(): Promise<void> {
    this.starts++;
  }

  setPositioning(): void {
    this.commands.push("positioning");
  }

  beginCalibration(_draft: CalibrationDraft): void {
    this.commands.push("calibrating");
  }

  startMonitoring(): void {
    this.commands.push("monitoring");
  }

  stopAnalysis(): void {
    this.commands.push("stopped");
  }

  infer(_image: ImageBitmap, _timestampMs: number): Promise<readonly []> {
    this.calls++;
    return this.next.promise;
  }

  stop(): void {
    this.stops++;
  }
}

function fixture() {
  const stream = new FakeStream();
  const constraints: MediaStreamConstraints[] = [];
  const scheduler = new ManualScheduler();
  const frameSource = new FakeFrameSource();
  const estimator = new FakeEstimator();
  let time = 1_000;
  const controller = new LocalCameraPoseController({
    mediaDevices: {
      getUserMedia: async (value) => {
        constraints.push(value ?? {});
        return stream as unknown as MediaStream;
      },
      enumerateDevices: async () => [],
    },
    scheduler,
    frameSource,
    estimator,
    now: () => time += 10,
  });
  const events: CameraPipelineEvent[] = [];
  controller.subscribe((event) => events.push(event));
  return { controller, stream, constraints, scheduler, frameSource, estimator, events };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test("controller start emits local stream and stop tears down every resource", async () => {
  const f = fixture();
  await f.controller.start("camera-1");
  assert.equal(f.controller.state, "running");
  assert.equal(f.controller.stream, f.stream);
  assert.equal(f.controller.activeDeviceId, "camera-1");
  assert.equal(f.estimator.starts, 1);
  assert.deepEqual(f.estimator.commands, ["positioning"]);
  assert.equal(f.frameSource.starts, 1);
  assert.equal(f.scheduler.size, 1);
  assert.deepEqual(f.constraints[0]?.audio, false);
  assert.ok(f.events.some((event) => event.type === "stream" && event.stream === (f.stream as unknown as MediaStream)));

  await f.controller.stop("pause");
  assert.equal(f.controller.state, "stopped");
  assert.equal(f.controller.stream, null);
  assert.equal(f.stream.track.stopCalls, 1);
  assert.equal(f.estimator.stops, 1);
  assert.equal(f.scheduler.size, 0);
  assert.equal(f.events.at(-2)?.type, "stream");
});

test("controller permits one inference in flight and drops scheduler ticks while busy", async () => {
  const f = fixture();
  await f.controller.start();
  f.scheduler.runNext();
  await flush();
  assert.equal(f.estimator.calls, 1);
  assert.equal(f.frameSource.captures, 1);

  f.scheduler.runNext();
  await flush();
  assert.equal(f.estimator.calls, 1);
  assert.equal(f.frameSource.captures, 1);
  assert.equal(f.controller.droppedFrames, 1);

  f.estimator.next.resolve([]);
  await flush();
  assert.equal(f.frameSource.closes, 1);
  assert.ok(f.events.some((event) => event.type === "analysis" && event.events.length === 0));
});

test("stop during inference prevents late pose events and still closes the frame", async () => {
  const f = fixture();
  await f.controller.start();
  f.scheduler.runNext();
  await flush();
  await f.controller.stop("quit");
  f.estimator.next.resolve([]);
  await flush();
  assert.equal(f.frameSource.closes, 1);
  assert.equal(f.events.filter((event) => event.type === "analysis").length, 0);
  assert.equal(f.stream.track.stopCalls, 1);
});

test("restart selects the new device and replaces the stream lifecycle", async () => {
  const f = fixture();
  await f.controller.start("first");
  await f.controller.restart("second");
  assert.equal(f.controller.state, "running");
  assert.equal(f.constraints.length, 2);
  assert.deepEqual((f.constraints[1]?.video as MediaTrackConstraints).deviceId, { exact: "second" });
  assert.equal(f.estimator.starts, 2);
  assert.equal(f.estimator.stops, 1);
  await f.controller.stop();
});

test("one estimator failure restarts the worker; a second stops camera safely", async () => {
  const f = fixture();
  await f.controller.start();
  f.controller.startMonitoring(calibrationProfile(), settingsForPreset("balanced"));
  f.scheduler.runNext();
  await flush();
  f.estimator.next.reject(new Error("worker crash"));
  await flush();
  assert.equal(f.estimator.starts, 2);
  assert.equal(f.estimator.commands.filter((command) => command === "monitoring").length, 2);
  assert.ok(f.events.some((event) => event.type === "worker_restarted"));

  f.estimator.next = deferred<readonly []>();
  f.scheduler.runNext();
  await flush();
  f.estimator.next.reject(new Error("worker crash again"));
  await flush();
  assert.equal(f.controller.state, "error");
  assert.equal(f.stream.track.stopCalls, 1);
  assert.ok(f.events.some((event) => event.type === "error" && event.code === "model_failed"));
});

test("landmark mapping produces posture inputs without changing coordinates", () => {
  const result = mapPoseLandmarkerResult({
    landmarks: [[{ x: 0.1, y: 0.2, z: -0.3, visibility: 0.8 }]],
    worldLandmarks: [[{ x: 1, y: 2, z: 3, visibility: 0.7 }]],
  });
  assert.deepEqual(result, [{
    normalized: [{ x: 0.1, y: 0.2, z: -0.3, visibility: 0.8, presence: 0.8 }],
    world: [{ x: 1, y: 2, z: 3, visibility: 0.7, presence: 0.7 }],
  }]);
  assert.deepEqual(mapPoseLandmarkerResult({ landmarks: [[]], worldLandmarks: [] }), [{ normalized: [] }]);
});

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<PoseWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: { message: PoseWorkerCommand; transfer?: readonly Transferable[] }[] = [];
  terminated = false;

  postMessage(message: PoseWorkerCommand, transfer?: readonly Transferable[]): void {
    this.messages.push(transfer ? { message, transfer } : { message });
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(message: PoseWorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<PoseWorkerResponse>);
  }
}

test("worker estimator initializes, transfers one frame, and rejects a concurrent frame", async () => {
  const worker = new FakeWorker();
  const estimator = new WorkerPoseEstimator(() => worker);
  const starting = estimator.start();
  assert.deepEqual(worker.messages[0]?.message, { type: "initialize" });
  worker.respond({ type: "ready" });
  await starting;
  estimator.startMonitoring(calibrationProfile(), settingsForPreset("balanced"));
  assert.equal(worker.messages[1]?.message.type, "start_monitoring");

  const image = { close: () => undefined } as unknown as ImageBitmap;
  const first = estimator.infer(image, 42);
  await assert.rejects(() => estimator.infer(image, 43), /already in flight/);
  assert.equal(worker.messages[2]?.transfer?.[0], image);
  worker.respond({ type: "result", timestampMs: 42, events: [{ type: "monitoring", score: 90 }] });
  assert.deepEqual(await first, [{ type: "monitoring", score: 90 }]);

  estimator.stop();
  assert.equal(worker.messages.at(-1)?.message.type, "close");
  assert.equal(worker.terminated, true);
});
