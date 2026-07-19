import './styles.css';
import type {
  ConfigInput,
  DesktopEvent,
  DesktopPlatform,
  LifecycleLogEntry,
  MinuteAggregate,
  MonitoringState,
  StoredHistory,
} from '../preload/api-types';
import {
  settingsForPreset,
  type CalibrationProfile,
  type CueKey,
  type SensitivityName,
} from '../shared/posture/index.ts';
import {
  LocalCameraPoseController,
  type CameraErrorCode,
  type CameraPipelineEvent,
  type PoseAnalysisEvent,
} from './camera/index.ts';
import {
  initialModel,
  positioningReady,
  reduce,
  type Action,
  type CameraGuidance,
  type DeleteScope,
  type Model,
  type MonitorStatus,
  type Screen,
} from './state';
import {
  HistoryWriteCoordinator,
  isActiveAlertEpisode,
  monitoringUpdateDecision,
  recoveryPercent,
  requestAlertAndShowFallback,
  resolveCurrentCalibrationBinding,
  shouldCancelCalibrationOnNavigation,
} from './history-write-coordinator';
import { attachCameraPreview } from './camera-preview';
import { renderApp } from './views';

const app = document.querySelector<HTMLDivElement>('#app')!;
const announcer = document.querySelector<HTMLDivElement>('#announcer')!;
if (!app || !announcer) throw new Error('Renderer root is missing');

let model: Model = reduce(initialModel, { type: 'bridge', available: Boolean(window.openPosture) });
let previousRenderedScreen: Screen | null = null;
let previewStream: MediaStream | null = null;
let unsubscribeDesktop: (() => void) | null = null;
let unsubscribeCamera: (() => void) | null = null;
let cameraController: LocalCameraPoseController | null = null;
let calibrationProfile: CalibrationProfile | null = null;
let calibrationCandidate: CalibrationProfile | null = null;
let selectedCameraId: string | null = null;
let cameraDevices: readonly { deviceId: string; label: string }[] = [];
let snoozeTimer: number | undefined;
let snoozeTickTimer: number | undefined;
let historyFlushTimer: number | undefined;
const historyWrites = new HistoryWriteCoordinator();
let currentBucket: MinuteAggregate | null = null;
let storedHistory: StoredHistory = { schemaVersion: 1, retentionDays: 30, buckets: [] };
let lastAnalysisTimestampMs: number | undefined;
let lastAssessmentValid = false;
let lastMonitoringScore: number | undefined;
let alertCooldownUntilWallMs = 0;
let inferenceTimings: number[] = [];
let storageWarning: string | null = null;
let desktopPlatform: DesktopPlatform | null = null;
let appVersion = '0.1.0';
let buildCommit = 'uncommitted';
let packagedDistribution = false;
let trayAvailable = false;
let cameraConsentGiven = false;
let monitoringSessionActive = false;
let activeAlertEpisodeId: string | null = null;
let diagnosticsPreview: string | null = null;
let notificationTestResult: 'requested' | 'unavailable' | null = null;
let calibrationCountdownSeconds = 0;
let calibrationCountdownGeneration = 0;
let preparingToQuit = false;

const MODEL_IDENTITY = {
  id: 'mediapipe-pose-landmarker-lite',
  version: 'float16-lite-2026-07-18',
  sha256: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
} as const;

function dispatch(action: Action): void {
  model = reduce(model, action);
  render();
}

function render(): void {
  const previousVideo = document.querySelector<HTMLVideoElement>('#camera-preview');
  const activeElement = document.activeElement instanceof HTMLElement && app.contains(document.activeElement)
    ? focusIdentity(document.activeElement)
    : null;
  const priorSnoozeOptions = document.querySelector<HTMLElement>('#snooze-options');
  const snoozeWasOpen = Boolean(priorSnoozeOptions && !priorSnoozeOptions.hasAttribute('hidden'));
  const sameScreen = previousRenderedScreen === model.screen;
  document.body.classList.toggle('force-reduced-motion', model.settings.reducedMotion);
  app.innerHTML = renderApp({
    model,
    cameraDevices,
    selectedCameraId,
    storedHistory,
    currentBucket,
    storageWarning,
    trayAvailable,
    hasPreviewStream: Boolean(previewStream),
    diagnosticsPreview,
    calibrationCountdownSeconds,
  });
  announcer.textContent = model.announcement;

  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog')) {
    if (!dialog.open) dialog.showModal();
  }

  if (sameScreen && snoozeWasOpen) document.querySelector<HTMLElement>('#snooze-options')?.removeAttribute('hidden');

  if (previousRenderedScreen !== model.screen) {
    previousRenderedScreen = model.screen;
    requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus());
  } else if (activeElement) {
    requestAnimationFrame(() => {
      const replacement = [...app.querySelectorAll<HTMLElement>('button, input, select, a[href], [tabindex]')]
        .find((element) => focusIdentity(element) === activeElement);
      replacement?.focus({ preventScroll: true });
    });
  }
  const video = document.querySelector<HTMLVideoElement>('#camera-preview');
  attachCameraPreview(previousVideo, video, previewStream);
}

function focusIdentity(element: HTMLElement): string {
  if (element.matches('main h1')) return 'main-heading';
  if (element.id) return `id:${element.id}`;
  if (element.dataset.focus) return `focus:${element.dataset.focus}`;
  return JSON.stringify({
    action: element.dataset.action ?? '',
    screen: element.dataset.screen ?? '',
    scope: element.dataset.scope ?? '',
    minutes: element.dataset.minutes ?? '',
    setting: element.dataset.setting ?? '',
  });
}

function ensureCameraController(): LocalCameraPoseController | null {
  if (cameraController) return cameraController;
  if (!navigator.mediaDevices?.getUserMedia) {
    showRecoverableError({ title: 'No camera API is available', message: 'This environment cannot open a local video camera.', action: 'Return to setup', code: 'camera-unavailable' });
    return null;
  }
  try {
    cameraController = new LocalCameraPoseController();
    unsubscribeCamera = cameraController.subscribe(handleCameraEvent);
    return cameraController;
  } catch {
    showRecoverableError({ title: 'No camera API is available', message: 'This environment cannot open a local video camera.', action: 'Return to setup', code: 'camera-unavailable' });
    return null;
  }
}

async function startCamera(forSetup = false, explicitPermissionAction = false): Promise<boolean> {
  if (!cameraConsentGiven && !explicitPermissionAction) {
    dispatch({ type: 'navigate', screen: 'camera' });
    dispatch({ type: 'announce', message: 'Review the camera explanation and choose Allow camera before capture can start.' });
    return false;
  }
  const controller = ensureCameraController();
  if (!controller) return false;
  if (controller.state !== 'running' && selectedCameraId) {
    const availableBeforeStart = await controller.devices().catch(() => []);
    if (availableBeforeStart.length > 0 && !availableBeforeStart.some((device) => device.deviceId === selectedCameraId)) {
      selectedCameraId = null;
    }
  }
  if (controller.state !== 'running') await controller.start(selectedCameraId ?? undefined);
  if (controller.state !== 'running') return false;
  cameraConsentGiven = true;
  cameraDevices = await controller.devices().catch(() => []);
  const actualDeviceId = controller.activeDeviceId;
  if (actualDeviceId) selectedCameraId = actualDeviceId;
  else if (selectedCameraId && !cameraDevices.some((device) => device.deviceId === selectedCameraId)) selectedCameraId = null;
  const selected = cameraDevices.find((device) => device.deviceId === selectedCameraId);
  const name = selected?.label || 'Default camera';
  if (calibrationProfile) {
    const compatible = await calibrationMatchesActiveCamera(calibrationProfile);
    if (model.calibrationReady !== compatible) model = { ...model, calibrationReady: compatible };
  }
  if (forSetup) dispatch({ type: 'camera-granted', name });
  else {
    model = { ...model, cameraAllowed: true, cameraName: name };
    render();
  }
  void desktopCommand('allow-camera');
  void persistConfig();
  return true;
}

async function stopCamera(reason: 'pause' | 'snooze' | 'quit' | 'reset' | 'error' | 'manual' = 'manual'): Promise<void> {
  monitoringSessionActive = false;
  activeAlertEpisodeId = null;
  previewStream = null;
  lastAnalysisTimestampMs = undefined;
  lastAssessmentValid = false;
  lastMonitoringScore = undefined;
  await cameraController?.stop(reason);
}

function handleCameraEvent(event: CameraPipelineEvent): void {
  if (event.type === 'stream') {
    previewStream = event.stream;
    render();
    return;
  }
  if (event.type === 'error') {
    void stopCamera('error');
    showRecoverableError(cameraError(event.code));
    void logLifecycle(cameraErrorLog(event.code));
    return;
  }
  if (event.type === 'worker_restarted') {
    dispatch({ type: 'announce', message: 'Local pose processing restarted safely.' });
    void logLifecycle({ kind: 'error', code: 'worker-crash' });
    return;
  }
  if (event.type !== 'analysis') return;
  inferenceTimings.push(event.inferenceMs);
  if (inferenceTimings.length >= 300) {
    const ordered = [...inferenceTimings].sort((left, right) => left - right);
    const averageMs = ordered.reduce((total, value) => total + value, 0) / ordered.length;
    const p95Ms = ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))];
    void logLifecycle({ kind: 'inference-summary', sampleCount: ordered.length, averageMs, p95Ms: Math.max(averageMs, p95Ms) });
    inferenceTimings = [];
  }
  recordMonitoringInterval(event.timestampMs);
  for (const analysisEvent of event.events) handleAnalysisEvent(analysisEvent);
}

function handleAnalysisEvent(event: PoseAnalysisEvent): void {
  if (event.type === 'quality') {
    lastAssessmentValid = event.status === 'assessable';
    applyCameraQuality(qualityFrom(event), guidanceFrom(event));
    if (monitoringSessionActive && ['away', 'multiple_people', 'quality_blocked'].includes(event.status) && model.monitorStatus !== 'cannot-assess') {
      activeAlertEpisodeId = null;
      applyMonitoringUpdate('cannot-assess', null);
      if (model.screen === 'correction') {
        dispatch({ type: 'navigate', screen: 'dashboard' });
        dispatch({ type: 'announce', message: 'The comparison is unavailable, so the prior posture cue was cleared. Restore a clear camera view.' });
      }
      void desktopCommand('cannot-assess');
    }
    return;
  }
  if (event.type === 'calibration_progress') {
    const sampleProgress = Math.min(1, event.validSamples / 35);
    const timeProgress = Math.min(1, event.elapsedMs / 9_000);
    dispatch({ type: 'calibration-progress', progress: Math.floor(100 * Math.min(sampleProgress, timeProgress)) });
    return;
  }
  if (event.type === 'calibration_ready') {
    ensureCameraController()?.stopAnalysis();
    if (calibrationProfile) {
      calibrationCandidate = event.profile;
      dispatch({ type: 'calibration-candidate' });
    } else {
      void acceptCalibration(event.profile);
    }
    return;
  }
  if (event.type === 'calibration_failed') {
    dispatch({ type: 'calibration-cancel', hasExisting: calibrationProfile !== null });
    showRecoverableError({
      title: 'Calibration needs another try',
      message: calibrationFailureMessage(event.reason),
      action: 'Return to positioning',
      code: `calibration-${event.reason}`,
    });
    return;
  }
  if (event.type === 'monitoring') {
    if (event.score === undefined) {
      if (model.monitorStatus !== 'cannot-assess') applyMonitoringUpdate('finding', null);
      return;
    }
    lastMonitoringScore = event.score;
    const score = Math.round(event.score);
    const inCooldown = Date.now() < alertCooldownUntilWallMs;
    const status: MonitorStatus = activeAlertEpisodeId
      ? 'alert'
      : inCooldown
        ? 'cooldown'
        : score < settingsForPreset(model.settings.sensitivity).alertBelow ? 'changing' : 'good';
    if (inCooldown) model = { ...model, cooldownMinutes: Math.max(1, Math.ceil((alertCooldownUntilWallMs - Date.now()) / 60_000)) };
    const correction = event.primaryCue ? cueToCorrection(event.primaryCue) : model.correction;
    const recoveryProgress = recoveryPercent(
      event.recoveryDwellMs ?? 0,
      settingsForPreset(model.settings.sensitivity).recoveryMs,
      activeAlertEpisodeId,
    );
    const update = monitoringUpdateDecision(
      { score: model.score, status: model.monitorStatus, correction: model.correction, recoveryProgress: model.recoveryProgress },
      { score, status, correction, recoveryProgress },
    );
    if (update.apply) {
      applyMonitoringUpdate(status, score, correction, recoveryProgress);
      if (update.semanticChange) void desktopCommand(status === 'changing' || status === 'alert' ? 'pending-alert' : 'assessing');
    }
    return;
  }
  if (event.triggered) {
    if (Date.now() < alertCooldownUntilWallMs) {
      applyMonitoringUpdate('cooldown', Math.round(lastMonitoringScore ?? 0), event.cue ? cueToCorrection(event.cue) : model.correction);
      return;
    }
    alertCooldownUntilWallMs = Date.now() + settingsForPreset(model.settings.sensitivity).cooldownMs;
    model = { ...model, cooldownMinutes: Math.ceil(settingsForPreset(model.settings.sensitivity).cooldownMs / 60_000) };
    const correction = event.cue ? cueToCorrection(event.cue) : model.correction;
    incrementNotificationCount();
    void reportPostureAlert(`episode-${Date.now()}`, correction);
  }
  if (event.recovered) {
    activeAlertEpisodeId = null;
    dispatch({ type: 'recovery-detected', score: Math.round(lastMonitoringScore ?? 75), correction: event.cue ? cueToCorrection(event.cue) : null });
  }
}

async function acceptCalibration(profile: CalibrationProfile): Promise<void> {
  const priorProfile = calibrationProfile;
  calibrationProfile = profile;
  const saved = await persistConfig();
  if (!saved) {
    calibrationProfile = priorProfile;
    calibrationCandidate = null;
    dispatch({ type: 'calibration-cancel', hasExisting: priorProfile !== null });
    ensureCameraController()?.setPositioning();
    showRecoverableError({ title: 'Calibration could not be saved', message: 'Your previous calibration was preserved. Check local storage access, then try again.', action: 'Return to positioning', code: 'storage-calibration' });
    return;
  }
  calibrationCandidate = null;
  dispatch({ type: 'calibration-complete', at: profile.createdAt });
  void logLifecycle({ kind: 'lifecycle', code: 'calibration-completed' });
}

function qualityFrom(event: Extract<PoseAnalysisEvent, { type: 'quality' }>): Partial<Model['cameraQuality']> {
  if (event.status === 'assessable') return { onePerson: true, landmarksVisible: true, scale: true, light: true, stable: true };
  const reason = event.reason ?? '';
  const personPresent = event.status !== 'away' && reason !== 'no_pose';
  return {
    onePerson: personPresent && event.status !== 'multiple_people',
    landmarksVisible: personPresent && !['head_missing', 'shoulders_missing', 'world_missing', 'unsupported_view'].includes(reason),
    scale: !['too_far', 'too_close', 'off_center'].includes(reason),
    light: reason !== 'poor_confidence',
    stable: false,
  };
}

function guidanceFrom(event: Extract<PoseAnalysisEvent, { type: 'quality' }>): CameraGuidance {
  if (event.status === 'assessable') return 'ready';
  return ({
    too_far: 'move-closer',
    too_close: 'move-farther',
    off_center: 'move-center',
    multiple_people: 'one-person',
    head_missing: 'show-head-shoulders',
    shoulders_missing: 'show-head-shoulders',
    world_missing: 'show-head-shoulders',
    unsupported_view: 'face-camera',
    poor_confidence: 'improve-light',
    unstable: 'hold-still',
    no_pose: 'move-into-view',
  } as const)[event.reason ?? 'no_pose'] ?? 'move-into-view';
}

function cueToCorrection(cue: CueKey): Model['correction'] {
  return ({
    headHeight: 'head-height', headForward: 'head-forward', headLateral: 'head-lateral',
    shoulderTilt: 'shoulder-tilt', torsoHeight: 'torso-height', torsoForward: 'torso-forward',
  } as const)[cue];
}

function cameraError(code: CameraErrorCode): NonNullable<Model['error']> {
  const errors: Record<CameraErrorCode, NonNullable<Model['error']>> = {
    permission_denied: { title: 'Camera access is off', message: cameraPermissionRecovery(), action: 'Check again', code: 'camera-permission-denied' },
    no_device: { title: 'No camera was found', message: 'Connect a camera and confirm another local camera app can see it.', action: 'Check again', code: 'camera-no-device' },
    busy: { title: 'Camera is busy', message: 'Close other camera apps, reconnect the camera if needed, then check again.', action: 'Check again', code: 'camera-busy' },
    disconnected: { title: 'Camera disconnected', message: 'Monitoring stopped and the pending alert was cleared. Reconnect the camera to continue.', action: 'Reconnect', code: 'camera-disconnected' },
    unsupported_constraints: { title: 'Camera format is unavailable', message: 'Choose another camera or update its local driver, then try again.', action: 'Choose camera', code: 'camera-constraints' },
    model_failed: { title: 'Local pose model could not start', message: packagedDistribution ? 'Quit and reopen Open Posture, then review local diagnostics if this continues.' : 'Run npm run model:verify, restart the source app, and review local diagnostics if this continues.', action: 'Try model again', code: 'model-load' },
    unknown: { title: 'Camera could not start', message: 'The camera may be unavailable. Close other camera apps and try again.', action: 'Check again', code: 'camera-unknown' },
  };
  return errors[code];
}

function cameraPermissionRecovery(): string {
  if (desktopPlatform === 'darwin') return `Open System Settings → Privacy & Security → Camera, allow ${packagedDistribution ? 'Open Posture' : 'the current development host'}, reopen the app if needed, then check again.`;
  if (desktopPlatform === 'win32') return 'Open Settings → Privacy & security → Camera, enable camera and desktop-app access, then check again.';
  if (desktopPlatform === 'linux') return 'Check the desktop camera portal and /dev/video* access, confirm another local camera app works, then check again.';
  return 'Allow camera access in your operating system privacy settings, reopen the app if needed, then check again.';
}

function cameraErrorLog(code: CameraErrorCode): LifecycleLogEntry {
  if (code === 'permission_denied') return { kind: 'error', code: 'camera-permission' };
  if (code === 'disconnected') return { kind: 'error', code: 'camera-disconnected' };
  if (code === 'model_failed') return { kind: 'error', code: 'model-load' };
  return { kind: 'error', code: 'camera-unavailable' };
}

function calibrationFailureMessage(reason: string): string {
  if (reason === 'not_enough_samples' || reason === 'duration_too_short') return 'Hold a clear, comfortable position a little longer. No partial calibration was saved.';
  if (reason === 'unstable') return 'The reference moved too much to summarize safely. Settle comfortably and try again.';
  if (reason === 'mixed_anchor' || reason === 'missing_core') return 'Keep your head and both shoulders visible in a steady front or three-quarter view.';
  return 'The reference could not be validated. No partial calibration was saved.';
}

async function deviceBindingHash(deviceId: string | null): Promise<string> {
  const source = deviceId || 'default-camera';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function activeCameraBindingId(): string | null {
  return cameraController?.activeDeviceId ?? selectedCameraId;
}

async function calibrationMatchesActiveCamera(profile: CalibrationProfile): Promise<boolean> {
  return profile.deviceIdHash === await deviceBindingHash(activeCameraBindingId());
}

function configInput(): ConfigInput {
  return {
    setup: { onboardingComplete: model.setupComplete && calibrationProfile !== null },
    settings: {
      sensitivity: model.settings.sensitivity,
      previewEnabled: model.settings.preview,
      reducedMotion: model.settings.reducedMotion,
      largeStatus: model.settings.largeStatus,
    },
    selectedCameraId,
    calibration: calibrationProfile,
  };
}

async function persistConfig(): Promise<boolean> {
  const result = await window.openPosture?.saveConfig(configInput());
  if (!result || result.ok) return true;
  storageWarning = 'Local settings could not be saved. Monitoring can continue for this session.';
  dispatch({ type: 'announce', message: 'This change is active for now but could not be saved locally.' });
  void logLifecycle({ kind: 'error', code: 'storage-write' });
  return false;
}

async function logLifecycle(entry: LifecycleLogEntry): Promise<void> {
  await window.openPosture?.appendLifecycleLog(entry).catch(() => undefined);
}

async function deleteStoredData(scope: DeleteScope): Promise<boolean> {
  const bridge = window.openPosture;
  if (!bridge) return false;
  if (scope !== 'history') await stopCamera('reset');
  const deletesHistory = scope === 'history' || scope === 'all';
  const bucketBeforeDelete = currentBucket ? { ...currentBucket } : null;
  if (deletesHistory) {
    window.clearTimeout(historyFlushTimer);
    historyFlushTimer = undefined;
    currentBucket = null;
    await historyWrites.suspendAndDrain();
  }
  const result = scope === 'history'
    ? await bridge.deleteHistory().catch(() => ({ ok: false, error: 'io' } as const))
    : scope === 'calibration'
      ? await bridge.deleteCalibration().catch(() => ({ ok: false, error: 'io' } as const))
      : await bridge.deleteAllData().catch(() => ({ ok: false, error: 'io' } as const));
  if (!result.ok) {
    if (deletesHistory) {
      currentBucket = bucketBeforeDelete;
      historyWrites.resume();
      if (currentBucket) scheduleHistoryFlush();
    }
    storageWarning = 'Local data could not be deleted. No deletion was reported as complete.';
    dispatch({ type: 'cancel-delete' });
    dispatch({ type: 'announce', message: 'Local data could not be deleted. Nothing was reported as removed.' });
    await logLifecycle({ kind: 'error', code: 'storage-delete' });
    return false;
  }
  if (scope === 'history') {
    const retention = await bridge.setHistoryRetention(model.settings.historyDays);
    if (!retention.ok) dispatch({ type: 'announce', message: 'History was deleted, but its retention preference could not be restored.' });
  }
  if (scope === 'history' || scope === 'all') {
    storedHistory = { schemaVersion: 1, retentionDays: scope === 'all' ? 30 : model.settings.historyDays, buckets: [] };
    currentBucket = null;
    refreshHistorySummary();
    historyWrites.resume();
  }
  if (scope === 'calibration' || scope === 'all') calibrationProfile = null;
  if (scope === 'all') selectedCameraId = null;
  return true;
}

async function copyDiagnostics(): Promise<void> {
  try {
    const diagnostics = await window.openPosture?.getDiagnosticsText();
    if (!diagnostics) throw new Error('Diagnostics unavailable');
    diagnosticsPreview = diagnostics.text;
    dispatch({ type: 'announce', message: 'Sanitized diagnostics are ready to review before copying.' });
  } catch {
    dispatch({ type: 'announce', message: 'Sanitized diagnostics could not be copied. No private camera data was accessed.' });
  }
}

async function confirmDiagnosticsCopy(): Promise<void> {
  if (diagnosticsPreview === null) return;
  try {
    await navigator.clipboard.writeText(diagnosticsPreview);
    diagnosticsPreview = null;
    dispatch({ type: 'announce', message: 'The reviewed sanitized diagnostics were copied.' });
  } catch {
    dispatch({ type: 'announce', message: 'Sanitized diagnostics could not be copied. No private camera data was accessed.' });
  }
}

function recordMonitoringInterval(timestampMs: number): void {
  if (!monitoringSessionActive) {
    lastAnalysisTimestampMs = undefined;
    return;
  }
  if (historyWrites.suspended) {
    lastAnalysisTimestampMs = timestampMs;
    return;
  }
  if (lastAnalysisTimestampMs === undefined || timestampMs <= lastAnalysisTimestampMs) {
    lastAnalysisTimestampMs = timestampMs;
    return;
  }
  const elapsedSeconds = Math.min(1, (timestampMs - lastAnalysisTimestampMs) / 1_000);
  lastAnalysisTimestampMs = timestampMs;
  if (storedHistory.retentionDays === 0 || elapsedSeconds <= 0) return;
  const now = new Date();
  const bucketStartUtc = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
  if (!currentBucket || currentBucket.bucketStartUtc !== bucketStartUtc) {
    if (currentBucket) void flushHistory();
    currentBucket = storedHistory.buckets.find((bucket) => bucket.bucketStartUtc === bucketStartUtc) ?? {
      bucketStartUtc,
      localOffsetMinutes: -now.getTimezoneOffset(),
      monitoredSeconds: 0,
      validSeconds: 0,
      scoreSum: 0,
      scoreSampleCount: 0,
      belowThresholdSeconds: 0,
      notificationCount: 0,
    };
  }
  currentBucket.monitoredSeconds = Math.min(60, currentBucket.monitoredSeconds + elapsedSeconds);
  if (lastAssessmentValid && lastMonitoringScore !== undefined) {
    currentBucket.validSeconds = Math.min(currentBucket.monitoredSeconds, currentBucket.validSeconds + elapsedSeconds);
    currentBucket.scoreSum += lastMonitoringScore;
    currentBucket.scoreSampleCount += 1;
    if (lastMonitoringScore < settingsForPreset(model.settings.sensitivity).alertBelow) {
      currentBucket.belowThresholdSeconds = Math.min(currentBucket.validSeconds, currentBucket.belowThresholdSeconds + elapsedSeconds);
    }
  }
  scheduleHistoryFlush();
}

function incrementNotificationCount(): void {
  if (!currentBucket) return;
  currentBucket.notificationCount += 1;
  refreshHistorySummary();
  scheduleHistoryFlush();
}

function scheduleHistoryFlush(): void {
  if (historyWrites.suspended) return;
  if (historyFlushTimer !== undefined) return;
  historyFlushTimer = window.setTimeout(() => {
    historyFlushTimer = undefined;
    void flushHistory();
  }, 5_000);
}

async function flushHistory(): Promise<void> {
  window.clearTimeout(historyFlushTimer);
  historyFlushTimer = undefined;
  if (!currentBucket || storedHistory.retentionDays === 0 || historyWrites.suspended) return historyWrites.drain();
  const snapshot = { ...currentBucket };
  return historyWrites.enqueue(() => writeHistorySnapshot(snapshot));
}

async function writeHistorySnapshot(snapshot: MinuteAggregate): Promise<void> {
  const result = await window.openPosture?.upsertHistory(snapshot).catch(() => undefined);
  if (!result || !result.ok) {
    storageWarning = 'Local history could not be saved. Monitoring remains active without claiming that history was stored.';
    dispatch({ type: 'announce', message: 'Monitoring continues, but local history could not be saved.' });
    void logLifecycle({ kind: 'error', code: 'storage-write' });
    return;
  }
  storedHistory = {
    ...storedHistory,
    buckets: [...storedHistory.buckets.filter((bucket) => bucket.bucketStartUtc !== snapshot.bucketStartUtc), snapshot]
      .sort((left, right) => left.bucketStartUtc.localeCompare(right.bucketStartUtc)),
  };
  refreshHistorySummary();
}

function refreshHistorySummary(): void {
  const buckets = currentBucket
    ? [...storedHistory.buckets.filter((bucket) => bucket.bucketStartUtc !== currentBucket?.bucketStartUtc), currentBucket]
    : storedHistory.buckets;
  const todayKey = localDateKey(Date.now(), -new Date().getTimezoneOffset());
  const today = buckets.filter((bucket) => localDateKey(Date.parse(bucket.bucketStartUtc), bucket.localOffsetMinutes) === todayKey);
  const monitoredSeconds = today.reduce((total, bucket) => total + bucket.monitoredSeconds, 0);
  const validSeconds = today.reduce((total, bucket) => total + bucket.validSeconds, 0);
  const scoreSum = today.reduce((total, bucket) => total + bucket.scoreSum, 0);
  const scoreSamples = today.reduce((total, bucket) => total + bucket.scoreSampleCount, 0);
  dispatch({
    type: 'history',
    history: {
      monitoredMinutes: Math.round(monitoredSeconds / 60),
      assessedMinutes: Math.round(validSeconds / 60),
      averageSimilarity: scoreSamples ? Math.round(scoreSum / scoreSamples) : null,
      notifiedEpisodes: today.reduce((total, bucket) => total + bucket.notificationCount, 0),
    },
  });
}

function localDateKey(timestampMs: number, offsetMinutes: number): string {
  return new Date(timestampMs + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function scheduleSnoozeResume(minutesToSnooze: number): void {
  window.clearTimeout(snoozeTimer);
  window.clearTimeout(snoozeTickTimer);
  const snoozeUntilWallMs = Date.now() + minutesToSnooze * 60_000;
  snoozeTimer = window.setTimeout(() => {
    if (model.monitorStatus !== 'snoozed' || !calibrationProfile) return;
    void resumeAfterSnooze();
  }, minutesToSnooze * 60_000);
  const updateRemaining = (): void => {
    if (model.monitorStatus !== 'snoozed') return;
    const remaining = Math.max(1, Math.ceil((snoozeUntilWallMs - Date.now()) / 60_000));
    if (model.snoozeMinutes !== remaining) {
      model = { ...model, snoozeMinutes: remaining };
      render();
    }
    snoozeTickTimer = window.setTimeout(updateRemaining, 30_000);
  };
  snoozeTickTimer = window.setTimeout(updateRemaining, 30_000);
}

async function resumeAfterSnooze(): Promise<void> {
  await startMonitoringSession('Snooze ended. Monitoring resumed and is finding you.');
}

async function startMonitoringSession(announcement?: string): Promise<boolean> {
  window.clearTimeout(snoozeTimer);
  window.clearTimeout(snoozeTickTimer);
  if (!calibrationProfile) {
    dispatch({ type: 'navigate', screen: model.cameraAllowed ? 'calibration' : 'camera' });
    dispatch({ type: 'announce', message: 'A valid calibration is required before monitoring.' });
    await desktopCommand('ready');
    return false;
  }
  const controller = ensureCameraController();
  if (!controller) return false;
  controller.setPositioning();
  if (!(await startCamera())) return false;
  if (!(await calibrationMatchesActiveCamera(calibrationProfile))) {
    monitoringSessionActive = false;
    activeAlertEpisodeId = null;
    controller.setPositioning();
    model = { ...model, calibrationReady: false };
    dispatch({ type: 'navigate', screen: 'positioning' });
    dispatch({ type: 'announce', message: 'This camera does not match the saved reference. Check framing, then calibrate this camera before monitoring.' });
    await desktopCommand('allow-camera');
    return false;
  }
  controller.startMonitoring(calibrationProfile, settingsForPreset(model.settings.sensitivity));
  monitoringSessionActive = true;
  lastAnalysisTimestampMs = undefined;
  model = { ...model, setupComplete: true, calibrationReady: true };
  dispatch({ type: 'monitor', status: 'finding', score: null });
  dispatch({ type: 'navigate', screen: 'dashboard' });
  if (announcement) dispatch({ type: 'announce', message: announcement });
  await logLifecycle({ kind: 'lifecycle', code: 'monitoring-started' });
  await desktopCommand('monitoring');
  return true;
}

async function pauseMonitoring(announcement?: string): Promise<void> {
  window.clearTimeout(snoozeTimer);
  window.clearTimeout(snoozeTickTimer);
  calibrationCountdownGeneration++;
  calibrationCountdownSeconds = 0;
  await stopCamera('pause');
  await flushHistory();
  dispatch({ type: 'monitor', status: 'paused', score: null });
  dispatch({ type: 'navigate', screen: model.setupComplete ? 'dashboard' : 'camera' });
  if (announcement) dispatch({ type: 'announce', message: announcement });
  await logLifecycle({ kind: 'lifecycle', code: 'monitoring-paused' });
  await desktopCommand('paused');
}

async function snoozeMonitoring(minutesToSnooze: number): Promise<void> {
  if (!calibrationProfile || !monitoringSessionActive) {
    dispatch({ type: 'announce', message: 'Snooze is available while monitoring is active.' });
    await desktopCommand(model.monitorStatus === 'paused' ? 'paused' : 'ready');
    return;
  }
  calibrationCountdownGeneration++;
  calibrationCountdownSeconds = 0;
  await stopCamera('snooze');
  await flushHistory();
  dispatch({ type: 'snooze', minutes: minutesToSnooze });
  dispatch({ type: 'navigate', screen: 'dashboard' });
  await logLifecycle({ kind: 'lifecycle', code: 'monitoring-snoozed' });
  await desktopCommand('snoozed');
  scheduleSnoozeResume(minutesToSnooze);
}

async function preparePositioningCapture(): Promise<boolean> {
  window.clearTimeout(snoozeTimer);
  window.clearTimeout(snoozeTickTimer);
  calibrationCountdownGeneration++;
  calibrationCountdownSeconds = 0;
  await stopCamera('pause');
  await flushHistory();
  dispatch({ type: 'monitor', status: 'paused', score: null });
  await desktopCommand('paused');
  const controller = ensureCameraController();
  controller?.setPositioning();
  return startCamera();
}

async function beginRecalibration(): Promise<void> {
  calibrationCandidate = null;
  if (!(await preparePositioningCapture())) return;
  dispatch({ type: 'calibration-restart' });
  dispatch({ type: 'navigate', screen: 'calibration' });
  await desktopCommand('calibrating');
}

async function startCalibrationCountdown(): Promise<void> {
  if (calibrationCountdownSeconds > 0 || !positioningReady(model)) return;
  if (!(await startCamera())) return;
  const generation = ++calibrationCountdownGeneration;
  for (let seconds = 3; seconds > 0; seconds--) {
    calibrationCountdownSeconds = seconds;
    dispatch({ type: 'announce', message: `Calibration begins in ${seconds}. Choose Cancel to stop.` });
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
    if (generation !== calibrationCountdownGeneration) return;
  }
  calibrationCountdownSeconds = 0;
  if (!positioningReady(model)) {
    dispatch({ type: 'announce', message: 'Framing changed during the countdown. Restore every positioning check, then try again.' });
    return;
  }
  const controller = ensureCameraController();
  if (!controller) return;
  const deviceIdHash = await resolveCurrentCalibrationBinding(
    () => deviceBindingHash(activeCameraBindingId()),
    () => generation === calibrationCountdownGeneration && model.screen === 'calibration' && controller.state === 'running',
  );
  if (!deviceIdHash) return;
  controller.beginCalibration({
    model: MODEL_IDENTITY,
    createdAt: new Date().toISOString(),
    deviceIdHash,
  });
  dispatch({ type: 'announce', message: 'Calibration started. Hold your comfortable reference while progress updates.' });
  dispatch({ type: 'calibration-progress', progress: 1 });
  await logLifecycle({ kind: 'lifecycle', code: 'calibration-started' });
  if (generation !== calibrationCountdownGeneration || model.screen !== 'calibration' || controller.state !== 'running') return;
  await desktopCommand('calibrating');
}

async function cancelCalibrationAttempt(): Promise<void> {
  calibrationCountdownGeneration++;
  calibrationCountdownSeconds = 0;
  calibrationCandidate = null;
  ensureCameraController()?.setPositioning();
  dispatch({ type: 'calibration-cancel', hasExisting: calibrationProfile !== null });
  await desktopCommand('allow-camera');
}

app.addEventListener('click', async (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;

  switch (action) {
    case 'go': {
      const destination = target.dataset.screen as Screen;
      notificationTestResult = null;
      if (destination === 'positioning') {
        if (!(await preparePositioningCapture())) break;
      } else if (['positioning', 'calibration'].includes(model.screen) && !['positioning', 'calibration'].includes(destination)) {
        const abandoningCalibration = shouldCancelCalibrationOnNavigation({
          currentScreen: model.screen,
          destination,
          countdownSeconds: calibrationCountdownSeconds,
          progress: model.calibrationProgress,
          replacing: model.calibrationReplacing,
          candidateReady: model.calibrationCandidateReady,
        });
        calibrationCountdownGeneration++;
        calibrationCountdownSeconds = 0;
        if (abandoningCalibration) {
          calibrationCandidate = null;
          dispatch({ type: 'calibration-cancel', hasExisting: calibrationProfile !== null });
        }
        await stopCamera('manual');
        await flushHistory();
        await desktopCommand('ready');
      }
      dispatch({ type: 'navigate', screen: destination });
      break;
    }
    case 'allow-camera':
      dispatch({ type: 'busy', value: true });
      ensureCameraController()?.setPositioning();
      if (!(await startCamera(true, true))) {
        dispatch({ type: 'busy', value: false });
        break;
      }
      dispatch({ type: 'busy', value: false });
      break;
    case 'camera-not-now':
      await stopCamera('manual');
      await desktopCommand('ready');
      dispatch({ type: 'camera-denied' });
      dispatch({ type: 'navigate', screen: 'ready' });
      break;
    case 'start-calibration': await startCalibrationCountdown(); break;
    case 'cancel-calibration': await cancelCalibrationAttempt(); break;
    case 'restart-calibration': calibrationCandidate = null; ensureCameraController()?.setPositioning(); dispatch({ type: 'calibration-restart' }); break;
    case 'confirm-calibration': if (calibrationCandidate) await acceptCalibration(calibrationCandidate); break;
    case 'keep-calibration': await cancelCalibrationAttempt(); dispatch({ type: 'announce', message: 'The existing saved reference was kept. Select its camera before monitoring, or try recalibration again.' }); break;
    case 'restore-monitoring-defaults':
      dispatch({ type: 'setting', key: 'sensitivity', value: 'balanced' });
      dispatch({ type: 'setting', key: 'preview', value: true });
      await persistConfig();
      if (calibrationProfile && monitoringSessionActive && cameraController?.state === 'running') {
        cameraController.startMonitoring(calibrationProfile, settingsForPreset('balanced'));
        activeAlertEpisodeId = null;
        applyMonitoringUpdate('finding', null);
        await desktopCommand('monitoring');
      }
      dispatch({ type: 'announce', message: 'Monitoring defaults restored: Balanced sensitivity and preview shown.' });
      break;
    case 'restore-accessibility-defaults':
      dispatch({ type: 'setting', key: 'reducedMotion', value: false });
      dispatch({ type: 'setting', key: 'largeStatus', value: false });
      await persistConfig();
      dispatch({ type: 'announce', message: 'Accessibility defaults restored: system motion preference and standard status size.' });
      break;
    case 'restore-history-defaults': {
      const restored = await window.openPosture?.setHistoryRetention(30);
      if (restored?.ok) {
        storedHistory = { ...storedHistory, retentionDays: 30 };
        dispatch({ type: 'setting', key: 'historyDays', value: 30 });
        refreshHistorySummary();
        dispatch({ type: 'announce', message: 'History retention default restored to 30 days.' });
      } else dispatch({ type: 'announce', message: 'History retention could not be restored.' });
      break;
    }
    case 'reveal-data-folder': {
      const revealed = await window.openPosture?.revealDataFolder();
      dispatch({ type: 'announce', message: revealed ? 'The local Open Posture data folder was opened.' : 'The local data folder could not be opened.' });
      break;
    }
    case 'test-notification': {
      notificationTestResult = 'unavailable';
      try {
        if (window.openPosture) notificationTestResult = (await window.openPosture.sendTestNotification()).status;
      } catch {}
      dispatch({ type: 'notification-capability', capability: notificationTestResult === 'requested' ? 'available' : 'unavailable' });
      dispatch({ type: 'announce', message: notificationTestResult === 'requested' ? 'Test alert shown. Native delivery was requested.' : 'Test alert shown. Native notifications are unavailable.' });
      break;
    }
    case 'finish-setup':
      notificationTestResult = null;
      model = { ...model, setupComplete: model.calibrationReady && calibrationProfile !== null };
      await persistConfig();
      await stopCamera('manual');
      await desktopCommand('ready');
      dispatch({ type: 'navigate', screen: 'ready' });
      break;
    case 'start-monitoring': case 'resume-monitoring':
      window.clearTimeout(snoozeTimer);
      await startMonitoringSession();
      break;
    case 'pause-monitoring':
      await pauseMonitoring();
      break;
    case 'snooze-menu': document.querySelector<HTMLElement>('#snooze-options')?.removeAttribute('hidden'); break;
    case 'snooze': {
      const snoozeMinutes = Number(target.dataset.minutes);
      await snoozeMonitoring(snoozeMinutes);
      break;
    }
    case 'recalibrate': await beginRecalibration(); break;
    case 'adjusted': dispatch({ type: 'dismiss-alert' }); dispatch({ type: 'navigate', screen: 'dashboard' }); dispatch({ type: 'announce', message: 'Monitoring continues. Recovery is detected from the live comparison.' }); break;
    case 'confirm-delete': dispatch({ type: 'confirm-delete', scope: target.dataset.scope as DeleteScope }); break;
    case 'cancel-delete': dispatch({ type: 'cancel-delete' }); break;
    case 'delete-now': {
      const scope = target.dataset.scope as DeleteScope;
      if (await deleteStoredData(scope)) dispatch({ type: 'deleted', scope });
      break;
    }
    case 'retry-error': dispatch({ type: 'clear-error' }); ensureCameraController()?.setPositioning(); await startCamera(true); await desktopCommand('retry'); break;
    case 'clear-error': await stopCamera('error'); dispatch({ type: 'clear-error' }); await desktopCommand('ready'); break;
    case 'copy-diagnostics': await copyDiagnostics(); break;
    case 'copy-diagnostics-now': await confirmDiagnosticsCopy(); break;
    case 'cancel-diagnostics': diagnosticsPreview = null; dispatch({ type: 'announce', message: 'Diagnostics were not copied.' }); break;
    case 'open-source': await desktopCommand('open-source'); break;
  }
});

app.addEventListener('change', async (event) => {
  const cameraControl = (event.target as HTMLElement).closest<HTMLSelectElement>('[data-camera-device]');
  if (cameraControl) {
    await stopCamera('pause');
    await flushHistory();
    selectedCameraId = cameraControl.value || null;
    const selected = cameraDevices.find((device) => device.deviceId === selectedCameraId);
    model = { ...model, cameraName: selected?.label || 'Default camera' };
    ensureCameraController()?.setPositioning();
    await startCamera();
    const compatible = calibrationProfile ? await calibrationMatchesActiveCamera(calibrationProfile) : false;
    model = { ...model, calibrationReady: compatible };
    dispatch({ type: 'monitor', status: 'paused', score: null });
    await persistConfig();
    await desktopCommand('allow-camera');
    dispatch({ type: 'announce', message: compatible ? 'Camera changed back to the saved reference. Check framing before monitoring.' : 'Camera changed. Check framing and create a calibration for this camera before monitoring.' });
    return;
  }
  const control = (event.target as HTMLElement).closest<HTMLInputElement | HTMLSelectElement>('[data-setting]');
  if (!control) return;
  const key = control.dataset.setting as keyof Model['settings'];
  const value = control instanceof HTMLInputElement && control.type === 'checkbox' ? control.checked : key === 'historyDays' ? Number(control.value) : control.value;
  dispatch({ type: 'setting', key, value: value as never });
  if (key === 'historyDays') {
    const retention = value as 0 | 7 | 30 | 90;
    const result = await window.openPosture?.setHistoryRetention(retention);
    if (result?.ok) {
      storedHistory = { ...storedHistory, retentionDays: retention, buckets: retention === 0 ? [] : storedHistory.buckets };
      if (retention === 0) currentBucket = null;
      refreshHistorySummary();
    } else {
      storageWarning = 'History retention could not be saved.';
      dispatch({ type: 'announce', message: storageWarning });
    }
  } else {
    await persistConfig();
    if (key === 'sensitivity' && calibrationProfile && monitoringSessionActive && cameraController?.state === 'running') {
      cameraController.startMonitoring(calibrationProfile, settingsForPreset(value as SensitivityName));
      activeAlertEpisodeId = null;
      applyMonitoringUpdate('finding', null);
      await desktopCommand('monitoring');
    }
  }
  await desktopCommand('settings-changed');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && model.deleteScope) dispatch({ type: 'cancel-delete' });
  else if (event.key === 'Escape' && diagnosticsPreview !== null) {
    diagnosticsPreview = null;
    dispatch({ type: 'announce', message: 'Diagnostics were not copied.' });
  }
});

type DesktopIntent = 'allow-camera' | 'calibrating' | 'monitoring' | 'assessing' | 'cannot-assess' | 'pending-alert' | 'paused' | 'snoozed' | 'ready' | 'retry' | 'settings-changed' | 'copy-diagnostics' | 'open-source' | `delete-${DeleteScope}`;

async function desktopCommand(intent: DesktopIntent): Promise<void> {
  // The preload bridge deliberately stays narrow. This adapter is the only renderer
  // location that knows its command/event vocabulary.
  const bridge = window.openPosture;
  if (!bridge) return;
  await dispatchToDesktop(bridge, intent);
}

async function dispatchToDesktop(bridge: NonNullable<Window['openPosture']>, intent: DesktopIntent): Promise<void> {
  const monitoringState: Partial<Record<DesktopIntent, MonitoringState>> = {
    'allow-camera': 'assessing',
    calibrating: 'assessing',
    monitoring: 'finding',
    assessing: 'assessing',
    'cannot-assess': 'cannot-assess',
    'pending-alert': 'pending-alert',
    paused: 'paused',
    snoozed: 'snoozed',
    ready: 'ready',
    retry: 'finding',
  };
  const state = monitoringState[intent];
  if (state) await bridge.setMonitoringState(state);
  if (intent === 'open-source') await bridge.openExternalLink('license');
}

function handleDesktopEvent(event: DesktopEvent): void {
  if (event.type === 'prepare-to-quit') {
    if (!preparingToQuit) void prepareToQuit();
    return;
  }
  if (event.type === 'tray-command') {
    if (event.command === 'open') dispatch({ type: 'navigate', screen: model.setupComplete ? 'dashboard' : 'welcome' });
    if (event.command === 'start') {
      void startMonitoringSession();
    }
    if (event.command === 'pause') {
      void pauseMonitoring();
    }
    if (event.command === 'recalibrate') {
      void beginRecalibration();
    }
  }
  if (event.type === 'tray-snooze') {
    void snoozeMonitoring(event.minutes);
  }
  if (event.type === 'system-pause') {
    void pauseMonitoring('Monitoring paused because the computer was locked or suspended. The camera is off.').then(() =>
      logLifecycle({ kind: 'lifecycle', code: event.reason === 'suspend' ? 'suspend' : 'lock' }),
    );
  }
  if (event.type === 'notification-failed') {
    dispatch({ type: 'notification-capability', capability: 'unavailable' });
    if (event.notification === 'posture' && event.episodeId && isActiveAlertEpisode(event.episodeId, activeAlertEpisodeId, monitoringSessionActive, model.monitorStatus)) {
      dispatch({ type: 'announce', message: 'Native delivery failed. The current top-right desktop alert is available.' });
    }
    else if (event.notification === 'test') {
      notificationTestResult = 'unavailable';
      dispatch({ type: 'announce', message: 'Native notifications are unavailable. The top-right desktop test alert remains available.' });
    }
  }
  if (event.type === 'notification-clicked') {
    if (event.notification === 'test') notificationTestResult = null;
    if (event.notification === 'posture' && event.episodeId === activeAlertEpisodeId && model.monitorStatus === 'alert') dispatch({ type: 'navigate', screen: 'correction' });
    else {
      dispatch({ type: 'navigate', screen: model.setupComplete ? 'dashboard' : 'ready' });
      dispatch({ type: 'announce', message: event.notification === 'posture' ? 'That posture check is no longer active.' : 'Notification test opened.' });
    }
  }
}

async function prepareToQuit(): Promise<void> {
  preparingToQuit = true;
  window.clearTimeout(snoozeTimer);
  window.clearTimeout(snoozeTickTimer);
  calibrationCountdownGeneration++;
  calibrationCountdownSeconds = 0;
  await stopCamera('quit');
  await flushHistory();
  await logLifecycle({ kind: 'lifecycle', code: 'quit' });
  await window.openPosture?.readyToQuit();
}

export function applyMonitoringUpdate(status: MonitorStatus, score: number | null, correction: Model['correction'] = null, recoveryProgress = 0): void {
  const nextRecoveryProgress = status === 'good' ? 100 : status === 'alert' ? recoveryProgress : 0;
  if (model.monitorStatus === status && model.score === score && model.correction === correction && model.recoveryProgress === nextRecoveryProgress && !(status === 'alert' && !model.alertVisible)) return;
  dispatch({ type: 'monitor', status, score, correction, recoveryProgress });
}

export function applyCameraQuality(quality: Partial<Model['cameraQuality']>, guidance: CameraGuidance = model.cameraGuidance): void {
  if (guidance === model.cameraGuidance && Object.entries(quality).every(([key, value]) => model.cameraQuality[key as keyof Model['cameraQuality']] === value)) return;
  dispatch({ type: 'camera-quality', quality, guidance });
}

export function showRecoverableError(error: Model['error']): void {
  if (!error) return;
  void stopCamera('error');
  dispatch({ type: 'error', error });
}

export async function reportPostureAlert(episodeId: string, correction: Model['correction']): Promise<void> {
  activeAlertEpisodeId = episodeId;
  dispatch({ type: 'alert', correction });
  const isCurrent = (): boolean => isActiveAlertEpisode(episodeId, activeAlertEpisodeId, monitoringSessionActive, model.monitorStatus);
  await requestAlertAndShowFallback({
    isCurrent,
    requestNative: async () => {
      await desktopCommand('pending-alert');
      if (!isCurrent() || !window.openPosture) return { status: 'unavailable' };
      return window.openPosture.reportPostureAlert(episodeId);
    },
    showFallback: () => window.openPosture?.showPostureFallback(episodeId) ?? Promise.resolve(),
    markUnavailable: () => dispatch({ type: 'notification-capability', capability: 'unavailable' }),
  });
}

async function initializeDesktop(): Promise<void> {
  const bridge = window.openPosture;
  if (!bridge) return;
  const [capabilities, configResult, historyResult, runtimeInfo] = await Promise.all([
    bridge.getCapabilities(),
    bridge.loadConfig(),
    bridge.loadHistory(),
    bridge.getRuntimeInfo(),
  ]);
  trayAvailable = capabilities.tray;
  const storedCalibration = configResult.value.calibration;
  const calibrationCompatible = storedCalibration !== null &&
    storedCalibration.model.id === MODEL_IDENTITY.id &&
    storedCalibration.model.version === MODEL_IDENTITY.version &&
    storedCalibration.model.sha256 === MODEL_IDENTITY.sha256;
  calibrationProfile = calibrationCompatible ? storedCalibration : null;
  if (storedCalibration && !calibrationCompatible) await bridge.deleteCalibration();
  selectedCameraId = configResult.value.selectedCameraId;
  storedHistory = historyResult.value;
  const setupComplete = configResult.value.setup.onboardingComplete && calibrationProfile !== null;
  cameraConsentGiven = setupComplete;
  model = {
    ...model,
    screen: setupComplete ? 'ready' : 'welcome',
    previousScreen: setupComplete ? 'ready' : 'welcome',
    setupComplete,
    cameraAllowed: setupComplete,
    calibrationReady: calibrationProfile !== null,
    calibratedAt: calibrationProfile?.createdAt ?? null,
    cameraName: selectedCameraId ? 'Saved camera' : 'Default camera',
    settings: {
      sensitivity: configResult.value.settings.sensitivity,
      preview: configResult.value.settings.previewEnabled,
      historyDays: historyResult.value.retentionDays,
      reducedMotion: configResult.value.settings.reducedMotion,
      largeStatus: configResult.value.settings.largeStatus,
    },
  };
  dispatch({ type: 'notification-capability', capability: capabilities.nativeNotifications ? 'available' : 'unavailable' });
  refreshHistorySummary();
  unsubscribeDesktop = bridge.onDesktopEvent(handleDesktopEvent);
  desktopPlatform = runtimeInfo.platform;
  appVersion = runtimeInfo.appVersion;
  buildCommit = runtimeInfo.buildCommit;
  packagedDistribution = runtimeInfo.isPackaged;
  if (configResult.notices.length || historyResult.notices.length) {
    storageWarning = 'Local data needed safe recovery. Review Settings and recalibrate if requested.';
    dispatch({ type: 'announce', message: 'Local data needed safe recovery. Review Settings and recalibrate if requested.' });
  } else if (storedCalibration && !calibrationCompatible) {
    dispatch({ type: 'announce', message: 'The local pose model changed, so a fresh calibration is required.' });
  }
}

render();
window.addEventListener('beforeunload', () => {
  unsubscribeDesktop?.();
  unsubscribeCamera?.();
  window.clearTimeout(snoozeTimer);
  window.clearTimeout(snoozeTickTimer);
  window.clearTimeout(historyFlushTimer);
  void stopCamera('quit');
  void flushHistory();
}, { once: true });
void initializeDesktop().catch(() => {
  dispatch({ type: 'notification-capability', capability: 'unavailable' });
  dispatch({ type: 'announce', message: 'Desktop capabilities could not be read. The local interface remains available.' });
});
