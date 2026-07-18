import { contextBridge, ipcRenderer } from 'electron';

import {
  IPC_CHANNELS,
  isDesktopEvent,
  type DesktopApi,
  type DesktopEvent,
  type ExternalLinkTarget,
  type ConfigInput,
  type LifecycleLogEntry,
  type MinuteAggregate,
  type MonitoringState,
  type RetentionDays,
} from './api-types';

const api: DesktopApi = {
  getRuntimeInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getRuntimeInfo),
  getCapabilities: () => ipcRenderer.invoke(IPC_CHANNELS.getCapabilities),
  setMonitoringState: (state: MonitoringState) =>
    ipcRenderer.invoke(IPC_CHANNELS.setMonitoringState, state),
  sendTestNotification: () =>
    ipcRenderer.invoke(IPC_CHANNELS.sendTestNotification),
  reportPostureAlert: (episodeId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.reportPostureAlert, episodeId),
  showPostureFallback: (episodeId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.showPostureFallback, episodeId),
  openExternalLink: (target: ExternalLinkTarget) =>
    ipcRenderer.invoke(IPC_CHANNELS.openExternalLink, target),
  revealDataFolder: () => ipcRenderer.invoke(IPC_CHANNELS.revealDataFolder),
  loadConfig: () => ipcRenderer.invoke(IPC_CHANNELS.loadConfig),
  saveConfig: (config: ConfigInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveConfig, config),
  loadHistory: () => ipcRenderer.invoke(IPC_CHANNELS.loadHistory),
  setHistoryRetention: (retentionDays: RetentionDays) =>
    ipcRenderer.invoke(IPC_CHANNELS.setHistoryRetention, retentionDays),
  upsertHistory: (bucket: MinuteAggregate) =>
    ipcRenderer.invoke(IPC_CHANNELS.upsertHistory, bucket),
  deleteHistory: () => ipcRenderer.invoke(IPC_CHANNELS.deleteHistory),
  deleteCalibration: () => ipcRenderer.invoke(IPC_CHANNELS.deleteCalibration),
  deleteAllData: () => ipcRenderer.invoke(IPC_CHANNELS.deleteAllData),
  appendLifecycleLog: (entry: LifecycleLogEntry) =>
    ipcRenderer.invoke(IPC_CHANNELS.appendLifecycleLog, entry),
  getDiagnosticsText: () => ipcRenderer.invoke(IPC_CHANNELS.getDiagnosticsText),
  readyToQuit: () => ipcRenderer.invoke(IPC_CHANNELS.readyToQuit),
  onDesktopEvent: (listener: (event: DesktopEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isDesktopEvent(payload)) listener(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.desktopEvent, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.desktopEvent, handler);
  },
};

contextBridge.exposeInMainWorld('openPosture', api);
