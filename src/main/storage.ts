import { constants } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  CONFIG_MAX_BYTES,
  DIAGNOSTICS_MAX_BYTES,
  HISTORY_MAX_BYTES,
  LOG_MAX_BYTES,
  createDefaultConfig,
  createDefaultHistory,
  createStoredConfig,
  isRetentionDays,
  isStoredLogLine,
  parseConfigInput,
  parseLifecycleLogEntry,
  parseMinuteAggregate,
  parseStoredConfig,
  parseStoredHistory,
  pruneHistory,
  upsertMinuteAggregate,
  type ConfigInput,
  type DiagnosticsResult,
  type HistoryUpsertResult,
  type LifecycleLogEntry,
  type MinuteAggregate,
  type RetentionDays,
  type StorageLoadResult,
  type StorageMutationResult,
  type StorageNotice,
  type StoredConfig,
  type StoredHistory,
} from '../shared/storage/schema.ts';

export const STORAGE_DIRECTORY_NAME = 'open-posture';

type JsonFileName = 'config.json' | 'history.json';
type ManagedFileName = JsonFileName | 'app.log';
type Candidate =
  | { status: 'valid'; bytes: Buffer }
  | { status: 'missing' | 'invalid' | 'oversized' | 'unavailable' };

export interface StorageServiceOptions {
  now?: () => Date;
  beforeReplace?: (fileName: ManagedFileName) => void | Promise<void>;
}

export class StorageService {
  readonly rootPath: string;

  private readonly appVersion: string;
  private readonly now: () => Date;
  private readonly beforeReplace?: StorageServiceOptions['beforeReplace'];
  private queue: Promise<void> = Promise.resolve();
  private lastPruneLocalDay?: string;

  constructor(userDataPath: string, appVersion: string, options: StorageServiceOptions = {}) {
    const base = resolve(userDataPath);
    const root = resolve(base, STORAGE_DIRECTORY_NAME);
    if (dirname(root) !== base) throw new TypeError('Invalid storage root.');
    this.rootPath = root;
    this.appVersion = appVersion;
    this.now = options.now ?? (() => new Date());
    this.beforeReplace = options.beforeReplace;
  }

  loadConfig(): Promise<StorageLoadResult<StoredConfig>> {
    return this.enqueue(() => this.loadConfigInternal());
  }

  prepareDataDirectory(): Promise<string | null> {
    return this.enqueue(async () => {
      try {
        await ensurePrivateDirectory(this.rootPath);
        return this.rootPath;
      } catch {
        return null;
      }
    });
  }

  saveConfig(value: unknown): Promise<StorageMutationResult> {
    return this.enqueue(async () => {
      const input = parseConfigInput(value);
      if (!input) return { ok: false, error: 'invalid-input' };
      try {
        const config = createStoredConfig(input, this.appVersion);
        await this.writeJson('config.json', config, CONFIG_MAX_BYTES, parseStoredConfig);
        return { ok: true };
      } catch {
        return { ok: false, error: 'storage-unavailable' };
      }
    });
  }

  loadHistory(): Promise<StorageLoadResult<StoredHistory>> {
    return this.enqueue(() => this.loadHistoryInternal(true));
  }

  setHistoryRetention(value: unknown): Promise<StorageMutationResult> {
    return this.enqueue(async () => {
      if (!isRetentionDays(value)) return { ok: false, error: 'invalid-input' };
      try {
        const loaded = await this.loadHistoryInternal(false);
        const history = pruneHistory({ ...loaded.value, retentionDays: value }, this.now().getTime());
        await this.writeJson('history.json', history, HISTORY_MAX_BYTES, parseStoredHistory);
        this.lastPruneLocalDay = localDay(this.now());
        return { ok: true };
      } catch {
        return { ok: false, error: 'storage-unavailable' };
      }
    });
  }

  upsertHistory(value: unknown): Promise<HistoryUpsertResult> {
    return this.enqueue(async () => {
      const bucket = parseMinuteAggregate(value);
      if (!bucket) return { ok: false, error: 'invalid-input' };
      const nowMs = this.now().getTime();
      if (Date.parse(bucket.bucketStartUtc) > nowMs + 5 * 60_000) return { ok: false, error: 'invalid-input' };
      try {
        const loaded = await this.loadHistoryInternal(true);
        if (loaded.value.retentionDays === 0) return { ok: true, stored: false };
        const changed = upsertMinuteAggregate(loaded.value, bucket);
        if (!changed) return { ok: false, error: 'invalid-input' };
        const history = pruneHistory(changed, nowMs);
        if (!history.buckets.some((item) => item.bucketStartUtc === bucket.bucketStartUtc)) {
          return { ok: true, stored: false };
        }
        await this.writeJson('history.json', history, HISTORY_MAX_BYTES, parseStoredHistory);
        return { ok: true, stored: true };
      } catch {
        return { ok: false, error: 'storage-unavailable' };
      }
    });
  }

  deleteHistory(): Promise<StorageMutationResult> {
    return this.enqueue(async () => {
      try {
        await this.deleteCopies('history.json', true);
        return { ok: true };
      } catch {
        return { ok: false, error: 'storage-unavailable' };
      }
    });
  }

  deleteCalibration(): Promise<StorageMutationResult> {
    return this.enqueue(async () => {
      try {
        const loaded = await this.loadConfigInternal();
        const input: ConfigInput = {
          setup: { onboardingComplete: false },
          settings: loaded.value.settings,
          selectedCameraId: loaded.value.selectedCameraId,
          calibration: null,
        };
        await this.writeJson(
          'config.json',
          createStoredConfig(input, this.appVersion),
          CONFIG_MAX_BYTES,
          parseStoredConfig,
        );
        await this.deleteCopies('config.json', false);
        return { ok: true };
      } catch {
        return { ok: false, error: 'storage-unavailable' };
      }
    });
  }

  deleteAll(): Promise<StorageMutationResult> {
    return this.enqueue(async () => {
      try {
        await rm(this.rootPath, { recursive: true, force: true });
        this.lastPruneLocalDay = undefined;
        return { ok: true };
      } catch {
        return { ok: false, error: 'storage-unavailable' };
      }
    });
  }

  appendLifecycleLog(value: unknown): Promise<StorageMutationResult> {
    return this.enqueue(async () => {
      const entry = parseLifecycleLogEntry(value);
      if (!entry) return { ok: false, error: 'invalid-input' };
      try {
        const line = Buffer.from(`${JSON.stringify({
          timestampUtc: this.now().toISOString(),
          appVersion: this.appVersion,
          ...entry,
        })}\n`, 'utf8');
        if (line.byteLength > 4_096) return { ok: false, error: 'invalid-input' };
        await this.appendCappedLog(line);
        return { ok: true };
      } catch {
        return { ok: false, error: 'storage-unavailable' };
      }
    });
  }

  getDiagnosticsText(): Promise<DiagnosticsResult> {
    return this.enqueue(async () => {
      const header = [
        'Open Posture diagnostics',
        `appVersion=${this.appVersion}`,
        `platform=${process.platform}`,
        `arch=${process.arch}`,
      ];
      const notices: StorageNotice[] = [];
      try {
        if (!(await this.assertDirectorySafe(this.rootPath))) {
          return { text: `${header.join('\n')}\n`, notices };
        }
        if (!(await this.assertDirectorySafe(join(this.rootPath, 'logs')))) {
          return { text: `${header.join('\n')}\n`, notices };
        }
        const candidate = await this.readCandidate(this.logPath(), LOG_MAX_BYTES);
        if (candidate.status === 'valid') {
          const tail = candidate.bytes.subarray(Math.max(0, candidate.bytes.length - DIAGNOSTICS_MAX_BYTES));
          const lines = tail.toString('utf8').split('\n');
          for (const line of lines) {
            if (!line) continue;
            try {
              const parsed: unknown = JSON.parse(line);
              if (isStoredLogLine(parsed)) header.push(JSON.stringify(parsed));
            } catch {
              // Partial or externally modified lines are excluded.
            }
          }
        } else if (candidate.status !== 'missing') {
          notices.push('storage-unavailable');
        }
      } catch {
        notices.push('storage-unavailable');
      }
      return { text: `${header.join('\n')}\n`, notices };
    });
  }

  private async loadConfigInternal(): Promise<StorageLoadResult<StoredConfig>> {
    return this.loadJson(
      'config.json',
      CONFIG_MAX_BYTES,
      parseStoredConfig,
      () => createDefaultConfig(this.appVersion),
    );
  }

  private async loadHistoryInternal(prune: boolean): Promise<StorageLoadResult<StoredHistory>> {
    const loaded = await this.loadJson(
      'history.json',
      HISTORY_MAX_BYTES,
      parseStoredHistory,
      createDefaultHistory,
    );
    if (!prune || this.lastPruneLocalDay === localDay(this.now())) return loaded;
    this.lastPruneLocalDay = localDay(this.now());
    const history = pruneHistory(loaded.value, this.now().getTime());
    if (history.buckets.length === loaded.value.buckets.length) return loaded;
    const notices = [...loaded.notices, 'history-pruned' as const];
    try {
      await this.writeJson('history.json', history, HISTORY_MAX_BYTES, parseStoredHistory);
    } catch {
      notices.push('storage-unavailable');
    }
    return { ...loaded, value: history, notices };
  }

  private async loadJson<T>(
    name: JsonFileName,
    maximumBytes: number,
    parser: (value: unknown) => T | undefined,
    defaults: () => T,
  ): Promise<StorageLoadResult<T>> {
    const notices: StorageNotice[] = [];
    try {
      if (!(await this.assertDirectorySafe(this.rootPath))) {
        return { value: defaults(), source: 'default', notices };
      }
    } catch {
      return { value: defaults(), source: 'default', notices: ['storage-unavailable'] };
    }
    const target = join(this.rootPath, name);
    const primary = await this.readCandidate(target, maximumBytes);
    if (primary.status === 'valid') {
      const parsed = parseJson(primary.bytes, parser);
      if (parsed) {
        await this.chmodFile(target).catch(() => notices.push('storage-unavailable'));
        return { value: parsed, source: 'disk', notices: unique(notices) };
      }
      await this.quarantine(target, 'corrupt-quarantined', notices);
    } else if (primary.status === 'oversized') {
      await this.quarantine(target, 'oversized-quarantined', notices);
    } else if (primary.status === 'invalid') {
      await this.quarantine(target, 'corrupt-quarantined', notices);
    } else if (primary.status === 'unavailable') {
      notices.push('storage-unavailable');
    }

    const backupPath = `${target}.bak`;
    const backup = await this.readCandidate(backupPath, maximumBytes);
    if (backup.status === 'valid') {
      const parsed = parseJson(backup.bytes, parser);
      if (parsed) {
        await this.chmodFile(backupPath).catch(() => notices.push('storage-unavailable'));
        return { value: parsed, source: 'backup', notices: unique([...notices, 'backup-recovered']) };
      }
      await this.quarantine(backupPath, 'corrupt-quarantined', notices);
    } else if (backup.status === 'oversized') {
      await this.quarantine(backupPath, 'oversized-quarantined', notices);
    } else if (backup.status === 'invalid') {
      await this.quarantine(backupPath, 'corrupt-quarantined', notices);
    } else if (backup.status === 'unavailable') {
      notices.push('storage-unavailable');
    }
    return { value: defaults(), source: 'default', notices: unique(notices) };
  }

  private async writeJson<T>(
    name: JsonFileName,
    value: T,
    maximumBytes: number,
    parser: (value: unknown) => T | undefined,
  ): Promise<void> {
    if (!parser(value)) throw new TypeError('Invalid storage value.');
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
    if (bytes.byteLength > maximumBytes) throw new RangeError('Storage value exceeds its size limit.');
    await this.ensureDirectories(false);
    const target = join(this.rootPath, name);
    const existing = await this.readCandidate(target, maximumBytes);
    if (existing.status === 'valid' && parseJson(existing.bytes, parser)) {
      await this.replaceFile(`${target}.bak`, existing.bytes);
    }
    await this.replaceFile(target, bytes, name);
  }

  private async appendCappedLog(line: Buffer): Promise<void> {
    await this.ensureDirectories(true);
    const target = this.logPath();
    const candidate = await this.readCandidate(target, LOG_MAX_BYTES);
    if (candidate.status === 'invalid' || candidate.status === 'unavailable') {
      throw new Error('Unsafe log target.');
    }
    if (candidate.status === 'oversized' || (candidate.status === 'valid' && candidate.bytes.length + line.length > LOG_MAX_BYTES)) {
      const prior = candidate.status === 'valid'
        ? candidate.bytes.subarray(Math.max(0, candidate.bytes.length - Math.floor(LOG_MAX_BYTES / 2)))
        : Buffer.alloc(0);
      const newline = prior.indexOf(0x0a);
      const tail = newline === -1 ? Buffer.alloc(0) : prior.subarray(newline + 1);
      await this.replaceFile(target, Buffer.concat([tail, line]), 'app.log');
      return;
    }
    const noFollow = process.platform === 'win32' ? 0 : constants.O_NOFOLLOW;
    const handle = await open(target, constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | noFollow, 0o600);
    try {
      await handle.write(line);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await this.chmodFile(target);
  }

  private async readCandidate(path: string, maximumBytes: number): Promise<Candidate> {
    let metadata;
    try {
      metadata = await lstat(path);
    } catch (error) {
      return isMissing(error) ? { status: 'missing' } : { status: 'unavailable' };
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) return { status: 'invalid' };
    if (metadata.size > maximumBytes) return { status: 'oversized' };
    const noFollow = process.platform === 'win32' ? 0 : constants.O_NOFOLLOW;
    try {
      const handle = await open(path, constants.O_RDONLY | noFollow);
      try {
        const current = await handle.stat();
        if (!current.isFile()) return { status: 'invalid' };
        if (current.size > maximumBytes) return { status: 'oversized' };
        const bytes = await handle.readFile();
        return bytes.byteLength <= maximumBytes ? { status: 'valid', bytes } : { status: 'oversized' };
      } finally {
        await handle.close();
      }
    } catch {
      return { status: 'unavailable' };
    }
  }

  private async replaceFile(target: string, bytes: Buffer, hookName?: ManagedFileName): Promise<void> {
    await this.ensureDirectories(target === this.logPath());
    const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      if (hookName) await this.beforeReplace?.(hookName);
      await rename(temporary, target);
      await this.chmodFile(target);
      await syncDirectory(dirname(target));
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async quarantine(target: string, notice: StorageNotice, notices: StorageNotice[]): Promise<void> {
    try {
      const quarantine = `${target}.corrupt`;
      await rm(quarantine, { force: true });
      await rename(target, quarantine);
      const metadata = await lstat(quarantine);
      if (metadata.isFile() && !metadata.isSymbolicLink()) await this.chmodFile(quarantine);
      notices.push(notice);
    } catch {
      notices.push('storage-unavailable');
    }
  }

  private async deleteCopies(name: JsonFileName, includeTarget: boolean): Promise<void> {
    if (!(await this.assertDirectorySafe(this.rootPath))) return;
    let names: string[];
    try {
      names = await readdir(this.rootPath);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    for (const candidate of names) {
      const target = candidate === name;
      const auxiliary =
        candidate === `${name}.bak` ||
        candidate === `${name}.corrupt` ||
        candidate === `${name}.bak.corrupt` ||
        (candidate.startsWith(`.${name}.`) && candidate.endsWith('.tmp'));
      if ((includeTarget && target) || auxiliary) {
        await rm(join(this.rootPath, candidate), { force: true });
      }
    }
  }

  private async ensureDirectories(logs: boolean): Promise<void> {
    await ensurePrivateDirectory(this.rootPath);
    if (logs) await ensurePrivateDirectory(join(this.rootPath, 'logs'));
  }

  private async chmodFile(path: string): Promise<void> {
    if (process.platform !== 'win32') await chmod(path, 0o600);
  }

  private async assertDirectorySafe(path: string): Promise<boolean> {
    let metadata;
    try {
      metadata = await lstat(path);
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('Unsafe storage directory.');
    if (process.platform !== 'win32') await chmod(path, 0o700);
    return true;
  }

  private logPath(): string {
    return join(this.rootPath, 'logs', 'app.log');
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }
}

async function ensurePrivateDirectory(path: string): Promise<void> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('Unsafe storage directory.');
  } catch (error) {
    if (!isMissing(error)) throw error;
    await mkdir(path, { mode: 0o700 });
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('Unsafe storage directory.');
  }
  if (process.platform !== 'win32') await chmod(path, 0o700);
}

async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return;
  try {
    const handle = await open(path, constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Some filesystems do not support directory fsync.
  }
}

function parseJson<T>(bytes: Buffer, parser: (value: unknown) => T | undefined): T | undefined {
  try {
    return parser(JSON.parse(bytes.toString('utf8')) as unknown);
  } catch {
    return;
  }
}

function localDay(value: Date): string {
  return `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`;
}

function isMissing(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
