import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import {
  access,
  appendFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { StorageService, STORAGE_DIRECTORY_NAME } from '../../src/main/storage.ts';
import {
  CONFIG_MAX_BYTES,
  HISTORY_MAX_BYTES,
  LOG_MAX_BYTES,
  type ConfigInput,
  type MinuteAggregate,
} from '../../src/shared/storage/schema.ts';

const HASH = 'a'.repeat(64);
const NOW = new Date('2026-07-19T12:00:00.000Z');

function config(withCalibration = false): ConfigInput {
  return {
    setup: { onboardingComplete: withCalibration },
    settings: {
      sensitivity: 'balanced',
      previewEnabled: true,
      reducedMotion: false,
      largeStatus: false,
    },
    selectedCameraId: withCalibration ? 'camera_token-1' : null,
    calibration: withCalibration ? {
      schemaVersion: 1,
      featureSchemaVersion: 1,
      model: { id: 'pose-landmarker-lite', version: '1.0.0', sha256: HASH },
      createdAt: '2026-07-18T00:00:00.000Z',
      deviceIdHash: HASH,
      anchorType: 'ears',
      features: {
        headHeight: { median: 0.7, sigma: 0.01 },
        headForward: { median: 0.3, sigma: 0.01 },
        headLateral: { median: 0, sigma: 0.01 },
        shoulderTilt: { median: 0, sigma: 0.01 },
      },
      quality: { validSamples: 50, durationMs: 10_000, coreCoverage: 1 },
    } : null,
  };
}

function aggregate(minute = '2026-07-19T11:59:00.000Z'): MinuteAggregate {
  return {
    bucketStartUtc: minute,
    localOffsetMinutes: 420,
    monitoredSeconds: 60,
    validSeconds: 45,
    scoreSum: 3_200,
    scoreSampleCount: 45,
    belowThresholdSeconds: 8,
    notificationCount: 1,
  };
}

async function fixture(t: TestContext, options: ConstructorParameters<typeof StorageService>[2] = {}) {
  const userData = await mkdtemp(join(tmpdir(), 'open-posture-storage-'));
  t.after(() => rm(userData, { recursive: true, force: true }));
  return {
    userData,
    root: join(userData, STORAGE_DIRECTORY_NAME),
    storage: new StorageService(userData, '0.1.0', { now: () => NOW, ...options }),
  };
}

test('uses one private child of userData and keeps one known-good backup', async (t) => {
  const { root, storage } = await fixture(t);
  assert.deepEqual(await storage.saveConfig(config()), { ok: true });
  assert.deepEqual(await storage.saveConfig({ ...config(), settings: { ...config().settings, sensitivity: 'strict' } }), { ok: true });

  assert.equal((await stat(root)).mode & 0o777, process.platform === 'win32' ? (await stat(root)).mode & 0o777 : 0o700);
  assert.equal((await stat(join(root, 'config.json'))).mode & 0o777, process.platform === 'win32' ? (await stat(join(root, 'config.json'))).mode & 0o777 : 0o600);
  assert.equal((await stat(join(root, 'config.json.bak'))).mode & 0o777, process.platform === 'win32' ? (await stat(join(root, 'config.json.bak'))).mode & 0o777 : 0o600);
  assert.equal(JSON.parse(await readFile(join(root, 'config.json.bak'), 'utf8')).settings.sensitivity, 'balanced');
  assert.equal((await storage.loadConfig()).value.settings.sensitivity, 'strict');
});

test('prepares only the dedicated private data directory for reveal', async (t) => {
  const { root, storage } = await fixture(t);
  assert.equal(await storage.prepareDataDirectory(), root);
  const metadata = await lstat(root);
  assert.equal(metadata.isDirectory(), true);
  assert.equal(metadata.isSymbolicLink(), false);
  if (process.platform !== 'win32') assert.equal(metadata.mode & 0o777, 0o700);
});

test('quarantines malformed and oversized configuration and loads safe defaults', async (t) => {
  const { root, storage } = await fixture(t);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'config.json'), '{');
  const malformed = await storage.loadConfig();
  assert.equal(malformed.source, 'default');
  assert.equal(malformed.value.setup.onboardingComplete, false);
  assert.ok(malformed.notices.includes('corrupt-quarantined'));
  assert.equal(await readFile(join(root, 'config.json.corrupt'), 'utf8'), '{');

  await writeFile(join(root, 'config.json'), Buffer.alloc(CONFIG_MAX_BYTES + 1));
  const oversized = await storage.loadConfig();
  assert.equal(oversized.source, 'default');
  assert.ok(oversized.notices.includes('oversized-quarantined'));
  assert.equal((await stat(join(root, 'config.json.corrupt'))).size, CONFIG_MAX_BYTES + 1);

  await writeFile(join(root, 'history.json'), Buffer.alloc(HISTORY_MAX_BYTES + 1));
  const history = await storage.loadHistory();
  assert.equal(history.source, 'default');
  assert.ok(history.notices.includes('oversized-quarantined'));
  assert.equal((await stat(join(root, 'history.json.corrupt'))).size, HISTORY_MAX_BYTES + 1);
});

test('recovers a valid backup after quarantining a corrupt primary', async (t) => {
  const { root, storage } = await fixture(t);
  assert.deepEqual(await storage.saveConfig(config()), { ok: true });
  assert.deepEqual(await storage.saveConfig({ ...config(), settings: { ...config().settings, sensitivity: 'strict' } }), { ok: true });
  await writeFile(join(root, 'config.json'), 'not-json');
  const loaded = await storage.loadConfig();
  assert.equal(loaded.source, 'backup');
  assert.equal(loaded.value.settings.sensitivity, 'balanced');
  assert.ok(loaded.notices.includes('corrupt-quarantined'));
  assert.ok(loaded.notices.includes('backup-recovered'));
});

test('a pre-replacement failure leaves the prior target byte-for-byte unchanged', async (t) => {
  let fail = false;
  const { root, storage } = await fixture(t, {
    beforeReplace: (name) => {
      if (fail && name === 'config.json') throw new Error('injected replacement failure');
    },
  });
  assert.deepEqual(await storage.saveConfig(config()), { ok: true });
  const before = await readFile(join(root, 'config.json'));
  fail = true;
  assert.deepEqual(
    await storage.saveConfig({ ...config(), settings: { ...config().settings, sensitivity: 'strict' } }),
    { ok: false, error: 'storage-unavailable' },
  );
  assert.deepEqual(await readFile(join(root, 'config.json')), before);
  assert.equal((await readdir(root)).some((name) => name.endsWith('.tmp')), false);
});

test('upserts whole minute aggregates, prunes by retention, and writes nothing while Off', async (t) => {
  const { storage } = await fixture(t);
  assert.deepEqual(await storage.setHistoryRetention(7), { ok: true });
  assert.deepEqual(await storage.upsertHistory(aggregate()), { ok: true, stored: true });
  assert.deepEqual(await storage.upsertHistory({ ...aggregate(), notificationCount: 2 }), { ok: true, stored: true });
  assert.deepEqual(
    await storage.upsertHistory(aggregate('2026-07-12T11:59:00.000Z')),
    { ok: true, stored: false },
  );
  assert.deepEqual((await storage.loadHistory()).value.buckets, [{ ...aggregate(), notificationCount: 2 }]);

  assert.deepEqual(await storage.setHistoryRetention(0), { ok: true });
  assert.deepEqual((await storage.loadHistory()).value.buckets, []);
  assert.deepEqual(await storage.upsertHistory(aggregate()), { ok: true, stored: false });
});

test('delete history, calibration, and all remove only the documented scope', async (t) => {
  const { root, storage } = await fixture(t);
  assert.deepEqual(await storage.saveConfig(config(true)), { ok: true });
  assert.deepEqual(await storage.saveConfig(config(true)), { ok: true });
  assert.deepEqual(await storage.upsertHistory(aggregate()), { ok: true, stored: true });
  assert.deepEqual(await storage.appendLifecycleLog({ kind: 'lifecycle', code: 'app-start' }), { ok: true });

  assert.deepEqual(await storage.deleteHistory(), { ok: true });
  assert.equal((await readdir(root)).some((name) => name.startsWith('history.json')), false);
  assert.equal((await storage.loadConfig()).value.calibration !== null, true);

  assert.deepEqual(await storage.deleteCalibration(), { ok: true });
  const loaded = await storage.loadConfig();
  assert.equal(loaded.value.calibration, null);
  assert.equal(loaded.value.setup.onboardingComplete, false);
  assert.equal(loaded.value.selectedCameraId, 'camera_token-1');
  const configFiles = (await readdir(root)).filter((name) => name.startsWith('config.json'));
  for (const name of configFiles) assert.equal((await readFile(join(root, name), 'utf8')).includes(HASH), false);
  await access(join(root, 'logs', 'app.log'));

  assert.deepEqual(await storage.deleteAll(), { ok: true });
  await assert.rejects(access(root));
});

test('diagnostics emit only schema-valid log lines and rotate an oversized log', async (t) => {
  const { root, storage } = await fixture(t);
  assert.deepEqual(await storage.appendLifecycleLog({ kind: 'lifecycle', code: 'app-start' }), { ok: true });
  const log = join(root, 'logs', 'app.log');
  await appendFile(log, `${JSON.stringify({
    timestampUtc: NOW.toISOString(),
    appVersion: '0.1.0',
    kind: 'lifecycle',
    code: 'app-ready',
    path: '/Users/fake-person/private',
  })}\n`);
  const diagnostics = await storage.getDiagnosticsText();
  assert.match(diagnostics.text, /Open Posture diagnostics/);
  assert.match(diagnostics.text, /app-start/);
  assert.doesNotMatch(diagnostics.text, /fake-person|private|path/);

  await writeFile(log, Buffer.alloc(LOG_MAX_BYTES + 1, 0x61));
  assert.deepEqual(await storage.appendLifecycleLog({ kind: 'lifecycle', code: 'app-ready' }), { ok: true });
  assert.ok((await stat(log)).size <= LOG_MAX_BYTES);
  assert.match((await storage.getDiagnosticsText()).text, /app-ready/);
});

test('a symlinked storage root cannot write outside the dedicated child', { skip: process.platform === 'win32' }, async (t) => {
  const userData = await mkdtemp(join(tmpdir(), 'open-posture-symlink-'));
  const outside = await mkdtemp(join(tmpdir(), 'open-posture-outside-'));
  t.after(() => Promise.all([
    rm(userData, { recursive: true, force: true }),
    rm(outside, { recursive: true, force: true }),
  ]));
  await symlink(outside, join(userData, STORAGE_DIRECTORY_NAME));
  const storage = new StorageService(userData, '0.1.0', { now: () => NOW });
  assert.deepEqual((await storage.loadConfig()).notices, ['storage-unavailable']);
  assert.deepEqual(await storage.saveConfig(config()), { ok: false, error: 'storage-unavailable' });
  assert.deepEqual(await storage.deleteHistory(), { ok: false, error: 'storage-unavailable' });
  assert.deepEqual(await readdir(outside), []);
  assert.equal((await lstat(join(userData, STORAGE_DIRECTORY_NAME))).isSymbolicLink(), true);
  assert.deepEqual(await storage.deleteAll(), { ok: true });
  assert.deepEqual(await readdir(outside), []);
  await assert.rejects(lstat(join(userData, STORAGE_DIRECTORY_NAME)));
});
