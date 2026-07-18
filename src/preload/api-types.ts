import type {
  ConfigInput,
  DiagnosticsResult,
  HistoryUpsertResult,
  LifecycleLogEntry,
  MinuteAggregate,
  RetentionDays,
  StorageLoadResult,
  StorageMutationResult,
  StoredConfig,
  StoredHistory,
} from '../shared/storage/schema';

export type {
  ConfigInput,
  DiagnosticsResult,
  HistoryUpsertResult,
  LifecycleLogEntry,
  MinuteAggregate,
  RetentionDays,
  StorageLoadResult,
  StorageMutationResult,
  StoredConfig,
  StoredHistory,
} from '../shared/storage/schema';

export type DesktopPlatform = 'darwin' | 'win32' | 'linux';
export type MonitoringState =
  | 'ready'
  | 'finding'
  | 'assessing'
  | 'cannot-assess'
  | 'pending-alert'
  | 'cooldown'
  | 'paused'
  | 'snoozed'
  | 'error';
export type SnoozeMinutes = 5 | 15 | 30 | 60;
export type ExternalLinkTarget =
  | 'license'
  | 'mediapipe'
  | 'electron-security';

export interface RuntimeInfo {
  appVersion: string;
  electronVersion: string;
  platform: DesktopPlatform;
  arch: string;
  isPackaged: boolean;
  buildCommit: string;
}

export interface DesktopCapabilities {
  nativeNotifications: boolean;
  tray: boolean;
  runtimeOffline: true;
  sourceRun: boolean;
}

export type NotificationAttempt =
  | { status: 'requested' }
  | { status: 'unavailable' };

export type DesktopEvent =
  | {
      type: 'tray-command';
      command: 'open' | 'start' | 'pause' | 'recalibrate';
    }
  | { type: 'tray-snooze'; minutes: SnoozeMinutes }
  | { type: 'system-pause'; reason: 'suspend' | 'lock-screen' }
  | { type: 'prepare-to-quit' }
  | {
      type: 'notification-clicked';
      notification: 'test' | 'posture';
      episodeId?: string;
    }
  | {
      type: 'notification-failed';
      notification: 'test' | 'posture';
      episodeId?: string;
    };

export interface DesktopApi {
  getRuntimeInfo(): Promise<RuntimeInfo>;
  getCapabilities(): Promise<DesktopCapabilities>;
  setMonitoringState(state: MonitoringState): Promise<void>;
  sendTestNotification(): Promise<NotificationAttempt>;
  reportPostureAlert(episodeId: string): Promise<NotificationAttempt>;
  showPostureFallback(episodeId: string): Promise<void>;
  openExternalLink(target: ExternalLinkTarget): Promise<boolean>;
  revealDataFolder(): Promise<boolean>;
  loadConfig(): Promise<StorageLoadResult<StoredConfig>>;
  saveConfig(config: ConfigInput): Promise<StorageMutationResult>;
  loadHistory(): Promise<StorageLoadResult<StoredHistory>>;
  setHistoryRetention(retentionDays: RetentionDays): Promise<StorageMutationResult>;
  upsertHistory(bucket: MinuteAggregate): Promise<HistoryUpsertResult>;
  deleteHistory(): Promise<StorageMutationResult>;
  deleteCalibration(): Promise<StorageMutationResult>;
  deleteAllData(): Promise<StorageMutationResult>;
  appendLifecycleLog(entry: LifecycleLogEntry): Promise<StorageMutationResult>;
  getDiagnosticsText(): Promise<DiagnosticsResult>;
  readyToQuit(): Promise<void>;
  onDesktopEvent(listener: (event: DesktopEvent) => void): () => void;
}

export const IPC_CHANNELS = {
  getRuntimeInfo: 'desktop:get-runtime-info',
  getCapabilities: 'desktop:get-capabilities',
  setMonitoringState: 'desktop:set-monitoring-state',
  sendTestNotification: 'desktop:send-test-notification',
  reportPostureAlert: 'desktop:report-posture-alert',
  showPostureFallback: 'desktop:show-posture-fallback',
  openExternalLink: 'desktop:open-external-link',
  revealDataFolder: 'desktop:reveal-data-folder',
  loadConfig: 'storage:load-config',
  saveConfig: 'storage:save-config',
  loadHistory: 'storage:load-history',
  setHistoryRetention: 'storage:set-history-retention',
  upsertHistory: 'storage:upsert-history',
  deleteHistory: 'storage:delete-history',
  deleteCalibration: 'storage:delete-calibration',
  deleteAllData: 'storage:delete-all',
  appendLifecycleLog: 'storage:append-lifecycle-log',
  getDiagnosticsText: 'storage:get-diagnostics-text',
  readyToQuit: 'desktop:ready-to-quit',
  desktopEvent: 'desktop:event',
} as const;

export function isDesktopEvent(value: unknown): value is DesktopEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;

  if (event.type === 'tray-command') {
    return ['open', 'start', 'pause', 'recalibrate'].includes(
      String(event.command),
    );
  }
  if (event.type === 'tray-snooze') {
    return [5, 15, 30, 60].includes(Number(event.minutes));
  }
  if (event.type === 'system-pause') {
    return event.reason === 'suspend' || event.reason === 'lock-screen';
  }
  if (event.type === 'prepare-to-quit') return Object.keys(event).length === 1;
  if (
    event.type === 'notification-failed' ||
    event.type === 'notification-clicked'
  ) {
    return (
      (event.notification === 'test' || event.notification === 'posture') &&
      (event.episodeId === undefined || typeof event.episodeId === 'string')
    );
  }
  return false;
}
