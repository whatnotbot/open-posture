import type { Landmark, PoseInput } from "../../shared/posture/index.ts";

export interface MediaPipeLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface MediaPipePoseResult {
  readonly landmarks: readonly (readonly MediaPipeLandmark[])[];
  readonly worldLandmarks: readonly (readonly MediaPipeLandmark[])[];
}

export function mapPoseLandmarkerResult(result: MediaPipePoseResult): PoseInput[] {
  return result.landmarks.map((normalized, index) => {
    const pose: PoseInput = { normalized: normalized.map(mapLandmark) };
    const world = result.worldLandmarks[index];
    return world ? { ...pose, world: world.map(mapLandmark) } : pose;
  });
}

function mapLandmark(landmark: MediaPipeLandmark): Landmark {
  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    visibility: landmark.visibility,
    // The Web task result omits per-landmark presence. The configured task-level
    // presence gate has already run; visibility is the conservative proxy here.
    presence: landmark.visibility,
  };
}
