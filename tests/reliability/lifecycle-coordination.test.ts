import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HistoryWriteCoordinator,
  isActiveAlertEpisode,
  monitoringUpdateDecision,
  recoveryPercent,
  requestAlertAndShowFallback,
  resolveCurrentCalibrationBinding,
  shouldCancelCalibrationOnNavigation,
} from '../../src/renderer/history-write-coordinator.ts';

test('history deletion drains an in-flight write and invalidates the queued snapshot', async () => {
  const coordinator = new HistoryWriteCoordinator();
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });

  void coordinator.enqueue(async () => {
    events.push('first-started');
    await firstBlocked;
    events.push('first-finished');
  });
  void coordinator.enqueue(async () => { events.push('stale-queued-write'); });

  await Promise.resolve();
  const draining = coordinator.suspendAndDrain().then(() => events.push('safe-to-delete'));
  assert.equal(coordinator.suspended, true);
  releaseFirst();
  await draining;

  assert.deepEqual(events, ['first-started', 'first-finished', 'safe-to-delete']);
  coordinator.resume();
  await coordinator.enqueue(async () => { events.push('post-delete-write'); });
  assert.deepEqual(events, ['first-started', 'first-finished', 'safe-to-delete', 'post-delete-write']);
});

test('alert fallback validation rejects stale, paused, and recovered episodes', () => {
  assert.equal(isActiveAlertEpisode('episode-1', 'episode-1', true, 'alert'), true);
  assert.equal(isActiveAlertEpisode('episode-1', null, true, 'alert'), false);
  assert.equal(isActiveAlertEpisode('episode-1', 'episode-2', true, 'alert'), false);
  assert.equal(isActiveAlertEpisode('episode-1', 'episode-1', false, 'alert'), false);
  assert.equal(isActiveAlertEpisode('episode-1', 'episode-1', true, 'paused'), false);
});

test('recovery progress advances with constant score dwell and stops for stale episodes', () => {
  assert.equal(recoveryPercent(0, 3_000, 'episode-1'), 0);
  assert.equal(recoveryPercent(1_500, 3_000, 'episode-1'), 50);
  assert.equal(recoveryPercent(3_000, 3_000, 'episode-1'), 100);
  assert.equal(recoveryPercent(1_500, 3_000, null), 0);
});

test('leaving calibration cancels countdown and sampling but preserves completed review', () => {
  assert.equal(shouldCancelCalibrationOnNavigation({ currentScreen: 'calibration', destination: 'settings', countdownSeconds: 2, progress: 0, replacing: false, candidateReady: false }), true);
  assert.equal(shouldCancelCalibrationOnNavigation({ currentScreen: 'calibration', destination: 'dashboard', countdownSeconds: 0, progress: 40, replacing: false, candidateReady: false }), true);
  assert.equal(shouldCancelCalibrationOnNavigation({ currentScreen: 'calibration', destination: 'settings', countdownSeconds: 0, progress: 0, replacing: true, candidateReady: false }), true);
  assert.equal(shouldCancelCalibrationOnNavigation({ currentScreen: 'calibration', destination: 'notifications', countdownSeconds: 0, progress: 100, replacing: false, candidateReady: false }), false);
  assert.equal(shouldCancelCalibrationOnNavigation({ currentScreen: 'settings', destination: 'dashboard', countdownSeconds: 2, progress: 20, replacing: false, candidateReady: false }), false);
});

test('a rejected native notification still reveals only the current fallback', async () => {
  let current = true;
  let unavailable = 0;
  let fallbacks = 0;
  await requestAlertAndShowFallback({
    isCurrent: () => current,
    requestNative: async () => { throw new Error('native failure'); },
    showFallback: async () => { fallbacks++; },
    markUnavailable: () => { unavailable++; },
  });
  assert.equal(unavailable, 1);
  assert.equal(fallbacks, 1);

  current = false;
  await requestAlertAndShowFallback({
    isCurrent: () => current,
    requestNative: async () => ({ status: 'requested' }),
    showFallback: async () => { fallbacks++; },
    markUnavailable: () => { unavailable++; },
  });
  assert.equal(fallbacks, 1);
});

test('constant rounded score still applies live recovery dwell without tray churn', () => {
  const decision = monitoringUpdateDecision(
    { score: 80, status: 'alert', correction: 'head-forward', recoveryProgress: 0 },
    { score: 80, status: 'alert', correction: 'head-forward', recoveryProgress: 33 },
  );
  assert.deepEqual(decision, { apply: true, semanticChange: false });
  assert.deepEqual(monitoringUpdateDecision(
    { score: 80, status: 'alert', correction: 'head-forward', recoveryProgress: 33 },
    { score: 80, status: 'alert', correction: 'head-forward', recoveryProgress: 33 },
  ), { apply: false, semanticChange: false });
});

test('navigation cancellation wins while camera binding hash is pending', async () => {
  let current = true;
  let releaseHash!: (value: string) => void;
  const pendingHash = new Promise<string>((resolve) => { releaseHash = resolve; });
  const resolved = resolveCurrentCalibrationBinding(() => pendingHash, () => current);
  current = false;
  releaseHash('camera-hash');
  assert.equal(await resolved, null);
  assert.equal(await resolveCurrentCalibrationBinding(async () => 'camera-hash', () => true), 'camera-hash');
});
