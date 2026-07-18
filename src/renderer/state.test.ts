import assert from 'node:assert/strict';
import test from 'node:test';
import { initialModel, positioningReady, reduce } from './state.ts';

test('calibration readiness needs every positioning check', () => {
  const incomplete = reduce(initialModel, { type: 'camera-quality', quality: { onePerson: true } });
  assert.equal(positioningReady(incomplete), false);

  const complete = reduce(incomplete, {
    type: 'camera-quality',
    quality: { landmarksVisible: true, scale: true, light: true, stable: true },
  });
  assert.equal(positioningReady(complete), true);
});

test('pause and snooze clear the score and describe camera state', () => {
  const monitoring = reduce(initialModel, { type: 'monitor', status: 'good', score: 91 });
  const snoozed = reduce(monitoring, { type: 'snooze', minutes: 15 });
  assert.equal(snoozed.monitorStatus, 'snoozed');
  assert.equal(snoozed.score, null);
  assert.match(snoozed.announcement, /camera is off/i);
});

test('deleting calibration returns to setup without deleting history', () => {
  const configured = {
    ...initialModel,
    setupComplete: true,
    calibrationReady: true,
    history: { ...initialModel.history, assessedMinutes: 42 },
  };
  const result = reduce(configured, { type: 'deleted', scope: 'calibration' });
  assert.equal(result.screen, 'welcome');
  assert.equal(result.calibrationReady, false);
  assert.equal(result.history.assessedMinutes, 42);
});

test('an error clears any passive alert', () => {
  const alerted = reduce(initialModel, { type: 'alert', correction: 'head-forward' });
  const failed = reduce(alerted, {
    type: 'error',
    error: { title: 'Camera disconnected', message: 'Reconnect it.', action: 'Try again' },
  });
  assert.equal(failed.screen, 'error');
  assert.equal(failed.alertVisible, false);
});

test('recalibration can be canceled without losing the prior saved reference', () => {
  const saved = reduce(initialModel, { type: 'calibration-complete', at: '2026-07-18T00:00:00.000Z' });
  const replacing = reduce(saved, { type: 'calibration-restart' });
  assert.equal(replacing.calibrationReady, true);
  assert.equal(replacing.calibrationReplacing, true);
  assert.equal(replacing.calibrationProgress, 0);
  const canceled = reduce(replacing, { type: 'calibration-cancel', hasExisting: true });
  assert.equal(canceled.calibrationReady, true);
  assert.equal(canceled.calibratedAt, saved.calibratedAt);
});

test('a replacement candidate needs confirmation and neutral states clear stale guidance', () => {
  const saved = reduce(initialModel, { type: 'calibration-complete', at: '2026-07-18T00:00:00.000Z' });
  const candidate = reduce(reduce(saved, { type: 'calibration-restart' }), { type: 'calibration-candidate' });
  assert.equal(candidate.calibrationCandidateReady, true);
  assert.equal(candidate.calibrationReady, true);

  const alerted = reduce(initialModel, { type: 'alert', correction: 'head-forward' });
  const unavailable = reduce(alerted, { type: 'monitor', status: 'cannot-assess', score: null });
  assert.equal(unavailable.alertVisible, false);
  assert.equal(unavailable.correction, null);
});

test('framing guidance and live recovery progress remain explicit state', () => {
  const far = reduce(initialModel, {
    type: 'camera-quality',
    quality: { scale: false },
    guidance: 'move-closer',
  });
  assert.equal(far.cameraGuidance, 'move-closer');

  const alerted = reduce(initialModel, { type: 'alert', correction: 'head-forward' });
  const recovering = reduce(alerted, {
    type: 'monitor',
    status: 'alert',
    score: 80,
    recoveryProgress: 67,
  });
  assert.equal(recovering.recoveryProgress, 67);
  const recovered = reduce(recovering, { type: 'recovery-detected', score: 82 });
  assert.equal(recovered.recoveryProgress, 100);
  assert.equal(recovered.alertVisible, false);
  assert.equal(recovered.resetDetected, true);
  const cooldown = reduce(recovered, { type: 'monitor', status: 'cooldown', score: 80 });
  assert.equal(cooldown.resetDetected, true);
});
