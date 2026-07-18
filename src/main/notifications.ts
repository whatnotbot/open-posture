import { Notification } from 'electron';

import type {
  DesktopEvent,
  NotificationAttempt,
} from '../preload/api-types';

type NotificationKind = 'test' | 'posture';

const COPY: Record<NotificationKind, { title: string; body: string }> = {
  test: {
    title: 'Posture check',
    body: "Notifications are ready. We'll only alert after a sustained change from your calibration.",
  },
  posture: {
    title: 'Posture check',
    body: "You've moved away from your calibrated posture. Take a moment to reset.",
  },
};

export class NotificationController {
  readonly #active = new Set<Notification>();
  readonly #episodeIds = new Set<string>();

  constructor(private readonly emit: (event: DesktopEvent) => void) {}

  isSupported(): boolean {
    return Notification.isSupported();
  }

  showTest(): NotificationAttempt {
    return this.#show('test');
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
}
