import {
  app,
  ipcMain,
  shell,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from 'electron';

import {
  IPC_CHANNELS,
  type DesktopCapabilities,
  type DesktopPlatform,
  type ExternalLinkTarget,
  type MonitoringState,
  type RuntimeInfo,
} from '../preload/api-types';
import { isExternalLinkTarget, openExternalLink } from './external-links';
import { isTrustedAppUrl } from './network-policy';
import type { NotificationController } from './notifications';
import type { LifecycleController } from './lifecycle';
import {
  isRetentionDays,
  parseConfigInput,
  parseLifecycleLogEntry,
  parseMinuteAggregate,
} from '../shared/storage/schema';
import type { StorageService } from './storage';
import type { TrayController } from './tray';

const MONITORING_STATES: ReadonlySet<MonitoringState> = new Set([
  'ready',
  'finding',
  'assessing',
  'cannot-assess',
  'pending-alert',
  'cooldown',
  'paused',
  'snoozed',
  'error',
]);

function assertTrustedSender(
  event: IpcMainInvokeEvent,
  window: BrowserWindow,
  entryUrl: string,
): void {
  if (
    event.sender !== window.webContents ||
    !event.senderFrame ||
    event.senderFrame !== window.webContents.mainFrame ||
    !isTrustedAppUrl(event.senderFrame.url, entryUrl)
  ) {
    throw new Error('Rejected IPC from an untrusted sender.');
  }
}

function isMonitoringState(value: unknown): value is MonitoringState {
  return typeof value === 'string' && MONITORING_STATES.has(value as MonitoringState);
}

function isEpisodeId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

export function registerIpcHandlers(options: {
  window: BrowserWindow;
  entryUrl: string;
  tray: TrayController;
  notifications: NotificationController;
  storage: StorageService;
  lifecycle: LifecycleController;
}): void {
  const { window, entryUrl, tray, notifications, storage, lifecycle } = options;
  const trusted = (event: IpcMainInvokeEvent) =>
    assertTrustedSender(event, window, entryUrl);

  ipcMain.handle(IPC_CHANNELS.getRuntimeInfo, (event): RuntimeInfo => {
    trusted(event);
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform as DesktopPlatform,
      arch: process.arch,
      isPackaged: app.isPackaged,
      buildCommit: OPEN_POSTURE_BUILD_COMMIT,
    };
  });

  ipcMain.handle(IPC_CHANNELS.getCapabilities, (event): DesktopCapabilities => {
    trusted(event);
    return {
      nativeNotifications: notifications.isSupported(),
      tray: tray.isAvailable(),
      runtimeOffline: true,
      sourceRun: !app.isPackaged,
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.setMonitoringState,
    (event, state: unknown): void => {
      trusted(event);
      if (!isMonitoringState(state)) throw new TypeError('Invalid monitoring state.');
      tray.setState(state);
    },
  );

  ipcMain.handle(IPC_CHANNELS.sendTestNotification, (event) => {
    trusted(event);
    return notifications.showTest();
  });

  ipcMain.handle(
    IPC_CHANNELS.reportPostureAlert,
    (event, episodeId: unknown) => {
      trusted(event);
      if (!isEpisodeId(episodeId)) throw new TypeError('Invalid episode ID.');
      const result = notifications.showPostureAlert(episodeId);
      tray.setState('pending-alert');
      return result;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.showPostureFallback,
    (event, episodeId: unknown): void => {
      trusted(event);
      if (!isEpisodeId(episodeId)) throw new TypeError('Invalid episode ID.');
      notifications.showPostureOverlay();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.openExternalLink,
    async (event, target: unknown): Promise<boolean> => {
      trusted(event);
      if (!isExternalLinkTarget(target)) return false;
      return openExternalLink(target as ExternalLinkTarget);
    },
  );

  ipcMain.handle(IPC_CHANNELS.revealDataFolder, async (event, ...args: unknown[]): Promise<boolean> => {
    trusted(event);
    assertNoArguments(args);
    const directory = await storage.prepareDataDirectory();
    if (!directory) return false;
    return (await shell.openPath(directory)) === '';
  });

  ipcMain.handle(IPC_CHANNELS.loadConfig, (event, ...args: unknown[]) => {
    trusted(event);
    assertNoArguments(args);
    return storage.loadConfig();
  });

  ipcMain.handle(
    IPC_CHANNELS.saveConfig,
    (event, value: unknown, ...extra: unknown[]) => {
      trusted(event);
      assertNoArguments(extra);
      const config = parseConfigInput(value);
      if (!config) throw new TypeError('Invalid configuration.');
      return storage.saveConfig(config);
    },
  );

  ipcMain.handle(IPC_CHANNELS.loadHistory, (event, ...args: unknown[]) => {
    trusted(event);
    assertNoArguments(args);
    return storage.loadHistory();
  });

  ipcMain.handle(
    IPC_CHANNELS.setHistoryRetention,
    (event, value: unknown, ...extra: unknown[]) => {
      trusted(event);
      assertNoArguments(extra);
      if (!isRetentionDays(value)) throw new TypeError('Invalid history retention.');
      return storage.setHistoryRetention(value);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.upsertHistory,
    (event, value: unknown, ...extra: unknown[]) => {
      trusted(event);
      assertNoArguments(extra);
      const bucket = parseMinuteAggregate(value);
      if (!bucket) throw new TypeError('Invalid history aggregate.');
      return storage.upsertHistory(bucket);
    },
  );

  ipcMain.handle(IPC_CHANNELS.deleteHistory, (event, ...args: unknown[]) => {
    trusted(event);
    assertNoArguments(args);
    return storage.deleteHistory();
  });

  ipcMain.handle(IPC_CHANNELS.deleteCalibration, async (event, ...args: unknown[]) => {
    trusted(event);
    assertNoArguments(args);
    const result = await storage.deleteCalibration();
    if (result.ok) tray.setState('paused');
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.deleteAllData, async (event, ...args: unknown[]) => {
    trusted(event);
    assertNoArguments(args);
    const result = await storage.deleteAll();
    if (result.ok) tray.setState('paused');
    return result;
  });

  ipcMain.handle(
    IPC_CHANNELS.appendLifecycleLog,
    (event, value: unknown, ...extra: unknown[]) => {
      trusted(event);
      assertNoArguments(extra);
      const entry = parseLifecycleLogEntry(value);
      if (!entry) throw new TypeError('Invalid lifecycle log entry.');
      return storage.appendLifecycleLog(entry);
    },
  );

  ipcMain.handle(IPC_CHANNELS.getDiagnosticsText, (event, ...args: unknown[]) => {
    trusted(event);
    assertNoArguments(args);
    return storage.getDiagnosticsText();
  });

  ipcMain.handle(IPC_CHANNELS.readyToQuit, (event, ...args: unknown[]) => {
    trusted(event);
    assertNoArguments(args);
    lifecycle.completeQuit();
  });
}

function assertNoArguments(values: unknown[]): void {
  if (values.length !== 0) throw new TypeError('Unexpected IPC arguments.');
}
