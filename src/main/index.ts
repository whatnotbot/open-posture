import {
  app,
  BrowserWindow,
  session,
  type WebContents,
} from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { registerIpcHandlers } from './ipc';
import { LifecycleController } from './lifecycle';
import { installNavigationPolicy, installNetworkPolicy } from './network-policy';
import { NotificationController } from './notifications';
import { installPermissionPolicy } from './permissions';
import { StorageService } from './storage';
import { TrayController } from './tray';
import type { DesktopEvent } from '../preload/api-types';

app.enableSandbox();

let mainWindow: BrowserWindow | undefined;
let lifecycle: LifecycleController | undefined;

function sendDesktopEvent(event: DesktopEvent): void {
  if (
    event.type === 'notification-clicked' ||
    (event.type === 'tray-command' && event.command === 'open')
  ) {
    lifecycle?.focus();
  }
  const webContents: WebContents | undefined = mainWindow?.webContents;
  if (webContents && !webContents.isDestroyed()) {
    webContents.send('desktop:event', event);
  }
}

async function createApplication(): Promise<void> {
  const appRoot = app.getAppPath();
  const entryUrl = pathToFileURL(
    path.join(appRoot, '.webpack', 'build', 'renderer', 'index.html'),
  ).toString();
  const preloadPath = path.join(
    appRoot,
    '.webpack',
    'build',
    'preload',
    'index.js',
  );
  const storage = new StorageService(app.getPath('userData'), app.getVersion());
  await storage.appendLifecycleLog({ kind: 'lifecycle', code: 'app-start' });
  installNetworkPolicy(session.defaultSession, entryUrl);
  installPermissionPolicy(session.defaultSession, entryUrl);

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 600,
    show: false,
    title: 'Open Posture',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      backgroundThrottling: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  installNavigationPolicy(mainWindow.webContents, entryUrl);

  const tray = new TrayController(sendDesktopEvent, () => lifecycle?.requestQuit());
  tray.create();
  const notifications = new NotificationController(sendDesktopEvent);
  lifecycle = new LifecycleController(mainWindow, tray, sendDesktopEvent);
  lifecycle.install();
  registerIpcHandlers({
    window: mainWindow,
    entryUrl,
    tray,
    notifications,
    storage,
    lifecycle,
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  await mainWindow.loadURL(entryUrl);
  await storage.appendLifecycleLog({ kind: 'lifecycle', code: 'app-ready' });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => lifecycle?.focus());
  app.on('activate', () => lifecycle?.focus());
  app.whenReady().then(createApplication).catch(() => app.quit());
}
