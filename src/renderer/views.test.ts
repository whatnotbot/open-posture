import assert from 'node:assert/strict';
import test from 'node:test';

import type { StoredHistory } from '../preload/api-types.ts';
import { initialModel, monitorLabel, type Model, type MonitorStatus, type Screen } from './state.ts';
import { renderApp, type ViewState } from './views.ts';

const emptyHistory: StoredHistory = { schemaVersion: 1, retentionDays: 30, buckets: [] };

function view(model: Model = initialModel): ViewState {
  return {
    model,
    cameraDevices: [],
    selectedCameraId: null,
    storedHistory: emptyHistory,
    currentBucket: null,
    storageWarning: null,
    trayAvailable: true,
    hasPreviewStream: false,
    diagnosticsPreview: null,
    calibrationCountdownSeconds: 0,
  };
}

test('every application screen renders its user-facing surface', () => {
  const screens: Record<Screen, string> = {
    welcome: 'A gentle cue',
    camera: 'Allow camera access',
    positioning: 'Set a clear, comfortable view',
    calibration: 'Set your comfortable reference',
    notifications: 'Choose how you’ll notice',
    ready: 'Your private posture check is ready',
    dashboard: 'Ready to monitor',
    correction: 'Let’s reset',
    history: 'Today, at a glance',
    settings: 'Privacy & local data',
    error: 'Monitoring needs attention',
  };

  for (const [screen, expected] of Object.entries(screens) as [Screen, string][]) {
    const html = renderApp(view({
      ...initialModel,
      screen,
      setupComplete: !['welcome', 'camera', 'positioning', 'calibration', 'notifications', 'ready'].includes(screen),
    }));
    assert.match(html, /<main id="main"[^>]+tabindex="-1"/);
    assert.match(html, /<h1 tabindex="-1">/);
    assert.ok(html.includes(expected), `${screen} did not render its expected surface`);
    assert.doesNotMatch(html, /\b(?:undefined|NaN)\b/);
  }
});

test('monitoring statuses render their semantic label and non-color dashboard cues', () => {
  const statuses: MonitorStatus[] = ['ready', 'finding', 'good', 'changing', 'alert', 'cannot-assess', 'cooldown', 'paused', 'snoozed', 'error'];
  for (const status of statuses) {
    const html = renderApp(view({
      ...initialModel,
      setupComplete: true,
      screen: 'dashboard',
      monitorStatus: status,
      score: status === 'good' ? 91 : null,
    }));
    assert.ok(html.includes(monitorLabel(status)));
    for (const metric of ['Head', 'Shoulders', 'Torso', 'Framing', 'Similarity']) assert.ok(html.includes(metric));
    assert.match(html, /class="posture-mini-metric (?:good|warning|neutral)"/);
  }
});

test('views escape persisted and device-provided text before rendering', () => {
  const html = renderApp({
    ...view({ ...initialModel, setupComplete: true, screen: 'settings', cameraName: '<img src=x onerror=alert(1)>' }),
    storageWarning: '<script>alert(1)</script>',
  });
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('rendered guidance stays personal, conditional, and non-medical', () => {
  const screens: Screen[] = ['calibration', 'dashboard', 'correction', 'settings'];
  const output = screens.map((screen) => renderApp(view({
    ...initialModel,
    screen,
    setupComplete: true,
    monitorStatus: screen === 'correction' ? 'alert' : 'good',
    score: 60,
    correction: 'head-forward',
  }))).join('\n');
  for (const phrase of ['personal comparison, not a medical standard', 'relative to your calibration', 'If comfortable', 'does not diagnose, treat, prevent, or cure any condition']) {
    assert.ok(output.includes(phrase));
  }
  assert.doesNotMatch(output, /\b(?:perfect posture|bad posture|wrong posture|treats? pain|prevents? injury|diagnoses? (?:pain|condition|disease))\b/i);
});

test('destructive and diagnostic dialogs are labelled and opt-in', () => {
  assert.doesNotMatch(renderApp(view()), /<dialog/);
  const deleteHtml = renderApp(view({ ...initialModel, deleteScope: 'all' }));
  assert.match(deleteHtml, /<dialog id="delete-dialog" aria-labelledby="delete-title"/);
  const diagnosticsHtml = renderApp({ ...view(), diagnosticsPreview: 'camera-started' });
  assert.match(diagnosticsHtml, /<dialog id="diagnostics-dialog" aria-labelledby="diagnostics-title"/);
});
