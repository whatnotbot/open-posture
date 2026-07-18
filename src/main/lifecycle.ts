import { app, dialog, powerMonitor, type BrowserWindow } from 'electron';

import type { DesktopEvent } from '../preload/api-types';
import type { TrayController } from './tray';

export class LifecycleController {
  #quitting = false;
  #quitPending = false;
  #quitTimer: ReturnType<typeof setTimeout> | undefined;
  #closeEducationShown = false;
  #handlingClose = false;

  constructor(
    private readonly window: BrowserWindow,
    private readonly tray: TrayController,
    private readonly emit: (event: DesktopEvent) => void,
  ) {}

  install(): void {
    app.on('before-quit', (event) => {
      if (this.#quitting) return;
      event.preventDefault();
      this.requestQuit();
    });
    app.on('window-all-closed', () => {
      if (!this.tray.isAvailable()) this.requestQuit();
    });

    this.window.on('close', (event) => {
      if (this.#quitting) return;
      event.preventDefault();
      if (this.tray.isAvailable()) {
        if (this.tray.isMonitoringActive() && !this.#closeEducationShown) {
          void this.#educateFirstClose();
        } else {
          this.window.hide();
        }
        return;
      }
      this.requestQuit();
    });

    powerMonitor.on('suspend', () => {
      this.emit({ type: 'system-pause', reason: 'suspend' });
    });
    powerMonitor.on('lock-screen', () => {
      this.emit({ type: 'system-pause', reason: 'lock-screen' });
    });
  }

  focus(): void {
    if (this.window.isDestroyed()) return;
    if (this.window.isMinimized()) this.window.restore();
    this.window.show();
    this.window.focus();
  }

  showInactive(): void {
    if (!this.window.isDestroyed()) this.window.showInactive();
  }

  requestQuit(): void {
    if (this.#quitting || this.#quitPending) return;
    this.#quitPending = true;
    this.emit({ type: 'prepare-to-quit' });
    this.#quitTimer = setTimeout(() => this.completeQuit(), 2_000);
  }

  completeQuit(): void {
    if (this.#quitting) return;
    if (this.#quitTimer) clearTimeout(this.#quitTimer);
    this.#quitTimer = undefined;
    this.#quitPending = false;
    this.#quitting = true;
    this.tray.destroy();
    app.quit();
  }

  async #educateFirstClose(): Promise<void> {
    if (this.#handlingClose || this.window.isDestroyed()) return;
    this.#handlingClose = true;
    this.#closeEducationShown = true;
    try {
      const result = await dialog.showMessageBox(this.window, {
        type: 'info',
        title: 'Monitoring continues in the tray',
        message: 'Monitoring continues in the tray',
        detail: 'Keep running hides this window. Pause and hide stops the camera first. Use Quit in the tray to stop Open Posture completely.',
        buttons: ['Keep running', 'Pause and hide', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (result.response === 0) this.window.hide();
      if (result.response === 1) {
        this.emit({ type: 'tray-command', command: 'pause' });
        this.window.hide();
      }
    } finally {
      this.#handlingClose = false;
    }
  }
}
