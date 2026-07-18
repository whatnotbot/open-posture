import fs from 'node:fs';
import path from 'node:path';

import { app, Menu, Tray } from 'electron';

import type {
  DesktopEvent,
  MonitoringState,
  SnoozeMinutes,
} from '../preload/api-types';

export class TrayController {
  #tray: Tray | undefined;
  #state: MonitoringState = 'ready';

  constructor(
    private readonly emit: (event: DesktopEvent) => void,
    private readonly quit: () => void,
  ) {}

  create(): boolean {
    const icon = this.#findIcon();
    if (!icon) return false;
    this.#tray = new Tray(icon);
    this.#tray.setToolTip('Open Posture · Ready');
    this.#tray.on('click', () => this.emit({ type: 'tray-command', command: 'open' }));
    this.#refreshMenu();
    return true;
  }

  isAvailable(): boolean {
    return Boolean(this.#tray && !this.#tray.isDestroyed());
  }

  isMonitoringActive(): boolean {
    return ['finding', 'assessing', 'cannot-assess', 'pending-alert', 'cooldown'].includes(this.#state);
  }

  setState(state: MonitoringState): void {
    this.#state = state;
    if (!this.#tray) return;
    this.#tray.setToolTip(`Open Posture · ${state.replaceAll('-', ' ')}`);
    this.#refreshMenu();
  }

  destroy(): void {
    this.#tray?.destroy();
    this.#tray = undefined;
  }

  #refreshMenu(): void {
    if (!this.#tray) return;
    const active = ['finding', 'assessing', 'cannot-assess', 'pending-alert', 'cooldown'].includes(
      this.#state,
    );
    const snooze = (minutes: SnoozeMinutes) => () =>
      this.emit({ type: 'tray-snooze', minutes });
    const menu = Menu.buildFromTemplate([
      { label: this.#state === 'pending-alert' ? 'Posture check · Open for details' : `State: ${this.#state.replaceAll('-', ' ')}`, enabled: false },
      { type: 'separator' },
      { label: 'Open', click: () => this.emit({ type: 'tray-command', command: 'open' }) },
      {
        label: active ? 'Pause monitoring' : 'Start monitoring',
        click: () =>
          this.emit({ type: 'tray-command', command: active ? 'pause' : 'start' }),
      },
      {
        label: 'Snooze',
        enabled: active,
        submenu: [5, 15, 30, 60].map((minutes) => ({
          label: `${minutes} minutes`,
          click: snooze(minutes as SnoozeMinutes),
        })),
      },
      {
        label: 'Recalibrate',
        click: () => this.emit({ type: 'tray-command', command: 'recalibrate' }),
      },
      { type: 'separator' },
      { label: 'Quit', click: this.quit },
    ]);
    this.#tray.setContextMenu(menu);
  }

  #findIcon(): string | undefined {
    const root = app.getAppPath();
    const names =
      process.platform === 'darwin'
        ? ['trayTemplate.png', 'trayTemplate@2x.png']
        : process.platform === 'win32'
          ? ['tray.ico', 'icon.ico']
          : ['tray.png', 'icon.png'];
    return names
      .map((name) => path.join(root, 'assets', 'icons', name))
      .find((candidate) => fs.existsSync(candidate));
  }
}
