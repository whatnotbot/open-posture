import assert from 'node:assert/strict';
import test from 'node:test';

import { IPC_CHANNELS, isDesktopEvent } from '../../src/preload/api-types.ts';

test('preload contract exposes only fixed named channels', () => {
  assert.deepEqual(Object.keys(IPC_CHANNELS).sort(), [
    'appendLifecycleLog',
    'deleteAllData',
    'deleteCalibration',
    'deleteHistory',
    'desktopEvent',
    'getCapabilities',
    'getDiagnosticsText',
    'getRuntimeInfo',
    'loadConfig',
    'loadHistory',
    'openExternalLink',
    'readyToQuit',
    'reportPostureAlert',
    'revealDataFolder',
    'saveConfig',
    'sendTestNotification',
    'setHistoryRetention',
    'setMonitoringState',
    'showPostureFallback',
    'upsertHistory',
  ]);
  assert.equal(new Set(Object.values(IPC_CHANNELS)).size, Object.keys(IPC_CHANNELS).length);
  assert.ok(Object.values(IPC_CHANNELS).every((channel) => /^(desktop|storage):/.test(channel)));
});

test('desktop event parser accepts the documented fixed vocabulary', () => {
  assert.equal(isDesktopEvent({ type: 'tray-command', command: 'start' }), true);
  assert.equal(isDesktopEvent({ type: 'tray-snooze', minutes: 15 }), true);
  assert.equal(isDesktopEvent({ type: 'system-pause', reason: 'lock-screen' }), true);
  assert.equal(isDesktopEvent({ type: 'prepare-to-quit' }), true);
  assert.equal(isDesktopEvent({ type: 'notification-clicked', notification: 'posture', episodeId: 'episode-1' }), true);
});

test('desktop event parser rejects unknown, malformed, and expanded-capability events', () => {
  const rejected: unknown[] = [
    null,
    [],
    { type: 'tray-command', command: 'shell' },
    { type: 'tray-snooze', minutes: 1 },
    { type: 'system-pause', reason: 'unknown' },
    { type: 'prepare-to-quit', command: 'force' },
    { type: 'notification-clicked', notification: 'custom' },
    { type: 'notification-failed', notification: 'posture', episodeId: 3 },
    { type: 'arbitrary-ipc', channel: 'anything' },
  ];
  for (const value of rejected) assert.equal(isDesktopEvent(value), false);
});
