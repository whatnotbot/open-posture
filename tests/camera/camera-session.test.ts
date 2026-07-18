import assert from "node:assert/strict";
import test from "node:test";

import { CameraSession, classifyCameraError } from "../../src/renderer/camera/index.ts";

class FakeTrack extends EventTarget {
  stopCalls = 0;
  readyState: MediaStreamTrackState = "live";
  private readonly deviceId: string;

  constructor(deviceId = "camera-default") {
    super();
    this.deviceId = deviceId;
  }

  stop(): void {
    this.stopCalls++;
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }

  endUnexpectedly(): void {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }

  getSettings(): MediaTrackSettings {
    return { deviceId: this.deviceId };
  }
}

class FakeStream {
  readonly tracks: FakeTrack[];

  constructor(count = 1, deviceId = "camera-default") {
    this.tracks = Array.from({ length: count }, () => new FakeTrack(deviceId));
  }

  getTracks(): MediaStreamTrack[] {
    return this.tracks as unknown as MediaStreamTrack[];
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.getTracks();
  }
}

test("camera start requests only ideal bounded video and never audio", async () => {
  const stream = new FakeStream();
  const calls: MediaStreamConstraints[] = [];
  const session = new CameraSession({
    getUserMedia: async (constraints) => {
      calls.push(constraints ?? {});
      return stream as unknown as MediaStream;
    },
    enumerateDevices: async () => [],
  });

  await session.start();
  assert.deepEqual(calls, [{
    audio: false,
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 15, max: 30 },
      facingMode: { ideal: "user" },
    },
  }]);
  assert.equal(session.stream, stream);
  assert.equal(session.activeDeviceId, "camera-default");
});

test("selected device is exact and restart stops every prior track", async () => {
  const first = new FakeStream(2, "camera-a");
  const second = new FakeStream(1, "camera-b");
  const streams = [first, second];
  const calls: MediaStreamConstraints[] = [];
  const session = new CameraSession({
    getUserMedia: async (constraints) => {
      calls.push(constraints ?? {});
      return streams.shift() as unknown as MediaStream;
    },
    enumerateDevices: async () => [],
  });

  await session.start("camera-a");
  await session.restart("camera-b");
  assert.equal(first.tracks[0]?.stopCalls, 1);
  assert.equal(first.tracks[1]?.stopCalls, 1);
  assert.deepEqual(calls[0]?.video, {
    width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 30 }, deviceId: { exact: "camera-a" },
  });
  assert.deepEqual(calls[1]?.video, {
    width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 30 }, deviceId: { exact: "camera-b" },
  });
  session.stop("pause");
  assert.equal(second.tracks[0]?.stopCalls, 1);
  assert.equal(session.stream, null);
  assert.equal(session.activeDeviceId, null);
});

test("intentional stop suppresses ended callback; device loss emits once", async () => {
  const stream = new FakeStream();
  const session = new CameraSession({
    getUserMedia: async () => stream as unknown as MediaStream,
    enumerateDevices: async () => [],
  });
  let ended = 0;
  session.onUnexpectedEnd(() => ended++);
  await session.start();
  stream.tracks[0]?.endUnexpectedly();
  assert.equal(ended, 1);
  session.stop("pause");
  assert.equal(ended, 1);
});

test("device enumeration exposes video inputs only", async () => {
  const session = new CameraSession({
    getUserMedia: async () => new FakeStream() as unknown as MediaStream,
    enumerateDevices: async () => [
      { kind: "videoinput", deviceId: "v1", label: "Camera" },
      { kind: "audioinput", deviceId: "a1", label: "Microphone" },
    ] as MediaDeviceInfo[],
  });
  assert.deepEqual(await session.devices(), [{ deviceId: "v1", label: "Camera" }]);
});

test("camera errors map to stable sanitized codes", () => {
  const named = (name: string): Error => {
    const error = new Error(name);
    error.name = name;
    return error;
  };
  assert.equal(classifyCameraError(named("NotAllowedError")), "permission_denied");
  assert.equal(classifyCameraError(named("NotFoundError")), "no_device");
  assert.equal(classifyCameraError(named("NotReadableError")), "busy");
  assert.equal(classifyCameraError(named("OverconstrainedError")), "unsupported_constraints");
  assert.equal(classifyCameraError(named("AbortError")), "disconnected");
  assert.equal(classifyCameraError(new Error("private details")), "unknown");
});
