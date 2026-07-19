import { BrowserWindow, Notification, screen, shell } from 'electron';

import type {
  DesktopEvent,
  NotificationAttempt,
} from '../preload/api-types';
import { DESKTOP_ALERT_WINDOW_OPTIONS, topRightOverlayBounds } from './overlay-position';

type NotificationKind = 'test' | 'posture';

const COPY: Record<NotificationKind, { title: string; body: string }> = {
  test: {
    title: 'Test alert received',
    body: 'Desktop posture alerts will appear here, even while the main window is hidden.',
  },
  posture: {
    title: 'Hey — posture check',
    body: 'If comfortable, ease back toward your calibrated position.',
  },
};

export class NotificationController {
  readonly #active = new Set<Notification>();
  readonly #episodeIds = new Set<string>();
  #overlay: BrowserWindow | undefined;
  #overlayTimer: NodeJS.Timeout | undefined;

  constructor(private readonly emit: (event: DesktopEvent) => void) {}

  isSupported(): boolean {
    return Notification.isSupported();
  }

  showTest(): NotificationAttempt {
    this.#showOverlay('test');
    return this.#show('test');
  }

  showPostureOverlay(): void {
    this.#showOverlay('posture');
  }

  showPostureAlert(episodeId: string): NotificationAttempt {
    if (this.#episodeIds.has(episodeId)) return { status: 'requested' };
    this.#episodeIds.add(episodeId);
    const attempt = this.#show('posture', episodeId);
    if (attempt.status === 'unavailable') this.#episodeIds.delete(episodeId);
    return attempt;
  }

  #show(kind: NotificationKind, episodeId?: string): NotificationAttempt {
    if (!this.isSupported()) return { status: 'unavailable' };

    let cleanup = (): void => {};
    try {
      const notification = new Notification({ ...COPY[kind], silent: true });
      this.#active.add(notification);
      cleanup = (): void => {
        this.#active.delete(notification);
        if (episodeId) this.#episodeIds.delete(episodeId);
      };
      notification.once('click', () => {
        this.emit({
          type: 'notification-clicked',
          notification: kind,
          ...(episodeId ? { episodeId } : {}),
        });
        cleanup();
      });
      notification.once('failed', () => {
        this.emit({
          type: 'notification-failed',
          notification: kind,
          ...(episodeId ? { episodeId } : {}),
        });
        cleanup();
      });
      notification.once('close', cleanup);
      notification.show();
      return { status: 'requested' };
    } catch {
      cleanup();
      return { status: 'unavailable' };
    }
  }

  #showOverlay(kind: NotificationKind): void {
    shell.beep();
    if (this.#overlay && !this.#overlay.isDestroyed()) this.#overlay.destroy();
    clearTimeout(this.#overlayTimer);

    const width = 380;
    const height = 148;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const overlay = new BrowserWindow({
      ...topRightOverlayBounds(display.workArea, width, height),
      ...DESKTOP_ALERT_WINDOW_OPTIONS,
    });
    this.#overlay = overlay;
    overlay.setIgnoreMouseEvents(true);
    if (process.platform === 'darwin') overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    overlay.webContents.on('will-navigate', (event) => event.preventDefault());
    overlay.once('ready-to-show', () => {
      if (this.#overlay === overlay && !overlay.isDestroyed()) overlay.showInactive();
    });
    overlay.once('closed', () => {
      if (this.#overlay === overlay) this.#overlay = undefined;
    });
    const copy = COPY[kind];
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>*{box-sizing:border-box}html,body{margin:0;background:transparent;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}body{padding:4px}.alert{height:140px;padding:18px 20px;border:1px solid rgba(143,225,191,.5);border-radius:18px;color:#f1f8f4;background:rgba(16,34,28,.94);box-shadow:0 14px 38px rgba(0,0,0,.32);backdrop-filter:blur(16px)}header{display:flex;align-items:center;gap:10px;margin-bottom:10px;color:#8fe1bf;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.dot{width:10px;height:10px;border-radius:50%;background:#8fe1bf;box-shadow:0 0 0 4px rgba(143,225,191,.14)}h1{margin:0 0 7px;font-size:20px;letter-spacing:-.02em}p{margin:0;color:#c5d2cb;font-size:14px;line-height:1.45}</style></head><body><main class="alert" role="alert"><header><span class="dot"></span>Open Posture</header><h1>${copy.title}</h1><p>${copy.body}</p></main></body></html>`;
    void overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => overlay.destroy());
    this.#overlayTimer = setTimeout(() => {
      if (!overlay.isDestroyed()) overlay.destroy();
    }, 12_000);
  }
}
