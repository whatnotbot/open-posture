/// <reference lib="webworker" />

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { WorkerAnalysisEngine } from "./analysis-engine.ts";
import { mapPoseLandmarkerResult } from "./landmark-mapping.ts";
import type { PoseWorkerCommand, PoseWorkerResponse } from "./types.ts";

const scope = self as DedicatedWorkerGlobalScope;
let landmarker: PoseLandmarker | null = null;
const analysis = new WorkerAnalysisEngine();

scope.onmessage = (event: MessageEvent<PoseWorkerCommand>): void => {
  void handle(event.data);
};

async function handle(command: PoseWorkerCommand): Promise<void> {
  if (command.type === "initialize") {
    try {
      landmarker?.close();
      const simd = await FilesetResolver.isSimdSupported(false);
      // Webpack resolves these package exports to emitted local assets.
      // @ts-expect-error NodeNext sees .ts as CJS; this file is a Webpack ESM worker entry.
      const simdLoader = new URL("@mediapipe/tasks-vision/vision_wasm_internal.js", import.meta.url).toString();
      // @ts-expect-error See simdLoader.
      const simdBinary = new URL("@mediapipe/tasks-vision/vision_wasm_internal.wasm", import.meta.url).toString();
      // @ts-expect-error See simdLoader.
      const noSimdLoader = new URL("@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js", import.meta.url).toString();
      // @ts-expect-error See simdLoader.
      const noSimdBinary = new URL("@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm", import.meta.url).toString();
      const fileset = simd ? {
        wasmLoaderPath: simdLoader,
        wasmBinaryPath: simdBinary,
      } : {
        wasmLoaderPath: noSimdLoader,
        wasmBinaryPath: noSimdBinary,
      };
      // @ts-expect-error See simdLoader.
      const modelAssetPath = new URL("../../../assets/models/pose_landmarker_lite.task", import.meta.url).toString();
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath },
        runningMode: "VIDEO",
        numPoses: 2,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      post({ type: "ready" });
    } catch {
      post({ type: "error", code: "model_failed" });
    }
    return;
  }
  if (command.type === "positioning") {
    analysis.setPositioning();
    return;
  }
  if (command.type === "begin_calibration") {
    analysis.beginCalibration(command.draft);
    return;
  }
  if (command.type === "start_monitoring") {
    analysis.startMonitoring(command.profile, command.settings);
    return;
  }
  if (command.type === "stop_analysis") {
    analysis.stop();
    return;
  }
  if (command.type === "close") {
    landmarker?.close();
    landmarker = null;
    scope.close();
    return;
  }
  try {
    if (!landmarker) throw new Error("Pose model is not initialized");
    const result = landmarker.detectForVideo(command.image, command.timestampMs);
    const events = analysis.analyze(mapPoseLandmarkerResult(result), command.timestampMs);
    post({ type: "result", timestampMs: command.timestampMs, events });
  } catch {
    post({ type: "error", code: "model_failed" });
  } finally {
    command.image.close();
  }
}

function post(message: PoseWorkerResponse): void {
  scope.postMessage(message);
}
