import type {
  AnchorType,
  CalibrationProfile,
  CalibrationSample,
  FeatureVector,
  Landmark,
  ModelIdentity,
  PoseInput,
} from "../../../src/shared/posture/index.ts";

export const TEST_MODEL: ModelIdentity = {
  id: "pose-landmarker-lite",
  version: "test-1",
  sha256: "a".repeat(64),
};

export const REFERENCE_FEATURES: Readonly<Required<FeatureVector>> = {
  headHeight: 0.70,
  headForward: 0.30,
  headLateral: 0,
  shoulderTilt: 0,
  torsoHeight: 1.0,
  torsoForward: 0.20,
};

export function calibrationSamples(
  overrides: Partial<FeatureVector> = {},
  options: { count?: number; durationMs?: number; anchorType?: AnchorType; jitter?: number } = {},
): CalibrationSample[] {
  const count = options.count ?? 50;
  const durationMs = options.durationMs ?? 10_000;
  const jitter = options.jitter ?? 0;
  const features = { ...REFERENCE_FEATURES, ...overrides };
  return Array.from({ length: count }, (_, index) => {
    const direction = index % 3 === 0 ? -1 : index % 3 === 1 ? 0 : 1;
    const changed = Object.fromEntries(
      Object.entries(features).map(([name, value]) => [name, (value as number) + direction * jitter]),
    ) as FeatureVector;
    return {
      timestampMs: index * durationMs / (count - 1),
      features: changed,
      anchorType: options.anchorType ?? "ears",
    };
  });
}

export function calibrationProfile(overrides: Partial<CalibrationProfile> = {}): CalibrationProfile {
  return {
    schemaVersion: 1,
    featureSchemaVersion: 1,
    model: TEST_MODEL,
    createdAt: "2026-07-18T00:00:00.000Z",
    deviceIdHash: "device-test",
    anchorType: "ears",
    features: Object.fromEntries(
      Object.entries(REFERENCE_FEATURES).map(([name, value]) => [name, { median: value, sigma: 0 }]),
    ),
    quality: { validSamples: 50, durationMs: 10_000, coreCoverage: 1 },
    ...overrides,
  };
}

export function validPose(options: {
  quality?: number;
  shoulderWidth?: number;
  shoulderCenterX?: number;
  shoulderY?: number;
  anchor?: AnchorType;
  includeHips?: boolean;
  worldShoulderWidth?: number;
} = {}): PoseInput {
  const quality = options.quality ?? 0.95;
  const shoulderWidth = options.shoulderWidth ?? 0.30;
  const centerX = options.shoulderCenterX ?? 0.50;
  const shoulderY = options.shoulderY ?? 0.45;
  const includeHips = options.includeHips ?? true;
  const worldShoulderWidth = options.worldShoulderWidth ?? 0.30;
  const normalized = landmarks();
  const world = landmarks();
  const set = (array: Landmark[], index: number, x: number, y: number, z: number, q = quality): void => {
    array[index] = { x, y, z, visibility: q, presence: q };
  };
  set(normalized, 0, centerX, shoulderY - 0.26, -0.05);
  set(normalized, 2, centerX - 0.035, shoulderY - 0.22, -0.04);
  set(normalized, 5, centerX + 0.035, shoulderY - 0.22, -0.04);
  set(normalized, 7, centerX - 0.06, shoulderY - 0.20, -0.05);
  set(normalized, 8, centerX + 0.06, shoulderY - 0.20, -0.05);
  set(normalized, 11, centerX - shoulderWidth / 2, shoulderY, 0);
  set(normalized, 12, centerX + shoulderWidth / 2, shoulderY, 0);
  set(normalized, 23, centerX - 0.10, shoulderY + 0.30, 0.10, includeHips ? quality : 0.20);
  set(normalized, 24, centerX + 0.10, shoulderY + 0.30, 0.10, includeHips ? quality : 0.20);

  set(world, 0, 0, -0.30, -0.13);
  set(world, 2, -0.035, -0.25, -0.12);
  set(world, 5, 0.035, -0.25, -0.12);
  set(world, 7, -0.06, -0.20, -0.10);
  set(world, 8, 0.06, -0.20, -0.10);
  set(world, 11, -worldShoulderWidth / 2, 0, 0);
  set(world, 12, worldShoulderWidth / 2, 0, 0);
  set(world, 23, -0.10, 0.30, 0.10);
  set(world, 24, 0.10, 0.30, 0.10);
  if (options.anchor === "eyes") {
    normalized[7].visibility = normalized[7].presence = 0.20;
    normalized[8].visibility = normalized[8].presence = 0.20;
  }
  return { normalized, world };
}

function landmarks(): Landmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0, presence: 0 }));
}
