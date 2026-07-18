import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalCameraPoseController,
  WorkerPoseEstimator,
  type CloseableImageSource,
  type FrameSource,
  type PoseEstimator,
  type PoseWorkerCommand,
  type PoseWorkerResponse,
  type Scheduler,
  type WorkerLike,
} from "../../src/renderer/camera/index.ts";
import {
  initialAlertState,
  initialQualificationState,
  inspectFrame,
  resumeAlertState,
  scorePosture,
  settingsForPreset,
  updateAlertState,
  updateQualification,
  updateScoreEma,
  type CalibrationDraft,
  type CalibrationProfile,
  type EngineSettings,
} from "../../src/shared/posture/index.ts";
import {
  REFERENCE_FEATURES,
  calibrationProfile,
  validPose,
} from "../fixtures/posture/index.ts";

class ManualScheduler implements Scheduler {
  private nextId = 0;
  private readonly callbacks = new Map<number, () => void>();
  maximumActive = 0;

  set(callback: () => void, _delayMs: number): number {
    const id = ++this.nextId;
    this.callbacks.set(id, callback);
    this.maximumActive = Math.max(this.maximumActive, this.callbacks.size);
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

class TrackingTrack extends EventTarget {
  stopCalls = 0;

  stop(): void {
    this.stopCalls++;
    this.dispatchEvent(new Event("ended"));
  }
}

class TrackingStream {
  readonly track = new TrackingTrack();

  getTracks(): MediaStreamTrack[] {
    return [this.track as unknown as MediaStreamTrack];
  }
}

class TrackingFrameSource implements FrameSource {
  active = false;
  starts = 0;
  stops = 0;
  captures = 0;
  closes = 0;

  async start(_stream: MediaStream): Promise<void> {
    assert.equal(this.active, false);
    this.active = true;
    this.starts++;
  }

  async capture(): Promise<CloseableImageSource> {
    this.captures++;
    return {
      image: {} as ImageBitmap,
      close: () => this.closes++,
    };
  }

  stop(): void {
    if (this.active) this.stops++;
    this.active = false;
  }
}

class TrackingWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<PoseWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly commands: PoseWorkerCommand[] = [];
  terminated = false;

  postMessage(message: PoseWorkerCommand): void {
    this.commands.push(message);
    if (message.type === "initialize") {
      this.onmessage?.({ data: { type: "ready" } } as MessageEvent<PoseWorkerResponse>);
    }
  }

  terminate(): void {
    this.terminated = true;
  }
}

test("100 camera start/restart/stop cycles release every track, timer, frame source, and worker", async () => {
  const streams: TrackingStream[] = [];
  const workers: TrackingWorker[] = [];
  const scheduler = new ManualScheduler();
  const frameSource = new TrackingFrameSource();
  const estimator = new WorkerPoseEstimator(() => {
    const worker = new TrackingWorker();
    workers.push(worker);
    return worker;
  });
  const controller = new LocalCameraPoseController({
    mediaDevices: {
      getUserMedia: async () => {
        const stream = new TrackingStream();
        streams.push(stream);
        return stream as unknown as MediaStream;
      },
      enumerateDevices: async () => [],
    },
    estimator,
    frameSource,
    scheduler,
  });

  for (let cycle = 0; cycle < 100; cycle++) {
    await controller.start(`primary-${cycle}`);
    assert.equal(scheduler.size, 1);
    await controller.restart(`secondary-${cycle}`);
    assert.equal(scheduler.size, 1);
    await controller.stop("manual");
    assert.equal(scheduler.size, 0);
    assert.equal(frameSource.active, false);
  }

  assert.equal(streams.length, 200);
  assert.equal(workers.length, 200);
  assert.equal(frameSource.starts, 200);
  assert.equal(frameSource.stops, 200);
  assert.equal(scheduler.maximumActive, 1);
  assert.ok(streams.every((stream) => stream.track.stopCalls === 1));
  assert.ok(workers.every((worker) => worker.terminated));
  assert.ok(workers.every((worker) => worker.commands.at(-1)?.type === "close"));
});

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

class DeferredEstimator implements PoseEstimator {
  active = false;
  calls = 0;
  result = deferred<readonly []>();

  async start(): Promise<void> { this.active = true; }
  setPositioning(): void {}
  beginCalibration(_draft: CalibrationDraft): void {}
  startMonitoring(_profile: CalibrationProfile, _settings: EngineSettings): void {}
  stopAnalysis(): void {}

  infer(_image: ImageBitmap, _timestampMs: number): Promise<readonly []> {
    this.calls++;
    return this.result.promise;
  }

  stop(): void { this.active = false; }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test("one-in-flight backpressure stays bounded during 5,000 virtual scheduler ticks", async () => {
  const scheduler = new ManualScheduler();
  const frameSource = new TrackingFrameSource();
  const estimator = new DeferredEstimator();
  const stream = new TrackingStream();
  const controller = new LocalCameraPoseController({
    mediaDevices: {
      getUserMedia: async () => stream as unknown as MediaStream,
      enumerateDevices: async () => [],
    },
    estimator,
    frameSource,
    scheduler,
    now: () => 1_000,
  });

  await controller.start();
  scheduler.runNext();
  await flush();
  for (let tick = 0; tick < 5_000; tick++) scheduler.runNext();

  assert.equal(estimator.calls, 1);
  assert.equal(frameSource.captures, 1);
  assert.equal(controller.droppedFrames, 5_000);
  assert.equal(scheduler.size, 1);
  assert.equal(scheduler.maximumActive, 1);

  estimator.result.resolve([]);
  await flush();
  assert.equal(frameSource.closes, 1);
  await controller.stop("manual");
  assert.equal(scheduler.size, 0);
  assert.equal(estimator.active, false);
  assert.equal(stream.track.stopCalls, 1);
});

test("two virtual monitoring hours preserve cooldown spacing and resume guard", () => {
  const settings = settingsForPreset("balanced");
  const durationMs = 2 * 60 * 60 * 1_000;
  const resumeAtMs = 3_710_000;
  let state = resumeAlertState(initialAlertState(), 0, settings);
  const alertTimes: number[] = [];

  for (let timestampMs = 1_000; timestampMs <= durationMs; timestampMs += 1_000) {
    if (timestampMs === resumeAtMs) {
      const paused = updateAlertState(state, {
        timestampMs,
        monitoring: true,
        paused: true,
        validity: "valid",
        score: 0,
      }, settings);
      assert.equal(paused.accepted, true);
      state = resumeAlertState(paused.state, timestampMs, settings);
      continue;
    }
    const update = updateAlertState(state, {
      timestampMs,
      monitoring: true,
      validity: "valid",
      score: 0,
      primaryCue: "headForward",
    }, settings);
    assert.equal(update.accepted, true);
    state = update.state;
    if (update.alertTriggered) {
      alertTimes.push(timestampMs);
      assert.equal(state.phase, "cooldown");
      assert.equal(state.cooldownUntilMs, timestampMs + settings.cooldownMs);
    }
  }

  assert.equal(state.lastTimestampMs, durationMs);
  assert.equal(state.alertCount, 12);
  assert.equal(alertTimes.length, 12);
  assert.equal(alertTimes.find((timestampMs) => timestampMs > resumeAtMs), resumeAtMs + settings.resumeGuardMs + settings.dwellMs);
  for (let index = 1; index < alertTimes.length; index++) {
    assert.ok(alertTimes[index] - alertTimes[index - 1] >= settings.cooldownMs + settings.dwellMs);
  }
});

test("duplicate, reversed, and non-finite clocks are stale without mutating engine state", () => {
  const inspection = inspectFrame([validPose()]);
  const qualified = updateQualification(initialQualificationState(), 1_000, inspection).state;
  for (const timestampMs of [1_000, 999, Number.NaN]) {
    const stale = updateQualification(qualified, timestampMs, inspection);
    assert.equal(stale.status, "stale");
    assert.equal(stale.state, qualified);
  }

  const ema = updateScoreEma({}, 80, 1_000).state;
  for (const timestampMs of [1_000, 999]) {
    const stale = updateScoreEma(ema, 20, timestampMs);
    assert.equal(stale.accepted, false);
    assert.equal(stale.reason, "stale");
    assert.equal(stale.state, ema);
  }

  const alert = resumeAlertState(initialAlertState(), 1_000);
  for (const timestampMs of [1_000, 999, Number.NaN]) {
    const stale = updateAlertState(alert, {
      timestampMs,
      monitoring: true,
      validity: "valid",
      score: 0,
    });
    assert.equal(stale.accepted, false);
    assert.equal(stale.reason, "stale");
    assert.equal(stale.state, alert);
  }
});

test("100,000 pure-engine ticks retain only bounded finite state", () => {
  const profile = calibrationProfile();
  const settings = settingsForPreset("balanced");
  const good = REFERENCE_FEATURES;
  const bad = { ...REFERENCE_FEATURES, headForward: 0.80 };
  let ema = updateScoreEma({}, 100, 0).state;
  let alert = resumeAlertState(initialAlertState(), 0, settings);

  for (let iteration = 1; iteration <= 100_000; iteration++) {
    const scored = scorePosture(iteration % 2 === 0 ? good : bad, "ears", profile);
    if (!scored.ok) throw new Error(scored.reason);
    const timestampMs = iteration * 200;
    const smoothed = updateScoreEma(ema, scored.value.rawScore, timestampMs, false, settings.emaTimeConstantMs);
    if (!smoothed.accepted || smoothed.score === undefined) throw new Error(smoothed.reason);
    ema = smoothed.state;
    const updated = updateAlertState(alert, {
      timestampMs,
      monitoring: true,
      validity: "valid",
      score: smoothed.score,
      primaryCue: scored.value.primaryCue,
    }, settings);
    if (!updated.accepted) throw new Error(updated.reason);
    alert = updated.state;
  }

  assert.equal(ema.lastTimestampMs, 20_000_000);
  assert.equal(alert.lastTimestampMs, 20_000_000);
  assert.ok(Number.isFinite(ema.score));
  assert.ok(alert.alertCount > 0);
  assert.ok(JSON.stringify({ ema, alert }).length < 512);
  assert.deepEqual(Object.keys(ema).sort(), ["lastTimestampMs", "score"]);
  assert.ok(Object.keys(alert).length <= 7);
});
