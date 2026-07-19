import assert from 'node:assert/strict';
import test from 'node:test';

import { DESKTOP_ALERT_WINDOW_OPTIONS, topRightOverlayBounds } from './overlay-position.ts';

test('desktop alerts sit inside the top-right of the active display', () => {
  assert.deepEqual(topRightOverlayBounds({ x: 0, y: 24, width: 1440, height: 876 }, 380, 148), { x: 1044, y: 40, width: 380, height: 148 });
  assert.deepEqual(topRightOverlayBounds({ x: -1920, y: 0, width: 1920, height: 1080 }, 380, 148), { x: -396, y: 16, width: 380, height: 148 });
});

test('desktop alerts cannot take focus or gain renderer privileges', () => {
  assert.equal(DESKTOP_ALERT_WINDOW_OPTIONS.alwaysOnTop, true);
  assert.equal(DESKTOP_ALERT_WINDOW_OPTIONS.focusable, false);
  assert.equal(DESKTOP_ALERT_WINDOW_OPTIONS.skipTaskbar, true);
  assert.equal(DESKTOP_ALERT_WINDOW_OPTIONS.webPreferences.nodeIntegration, false);
  assert.equal(DESKTOP_ALERT_WINDOW_OPTIONS.webPreferences.contextIsolation, true);
  assert.equal(DESKTOP_ALERT_WINDOW_OPTIONS.webPreferences.sandbox, true);
  assert.equal(DESKTOP_ALERT_WINDOW_OPTIONS.webPreferences.devTools, false);
});
