export class HistoryWriteCoordinator {
  #epoch = 0;
  #queue: Promise<void> = Promise.resolve();
  #suspended = false;

  get suspended(): boolean {
    return this.#suspended;
  }

  enqueue(write: () => Promise<void>): Promise<void> {
    const epoch = this.#epoch;
    this.#queue = this.#queue.then(async () => {
      if (this.#suspended || epoch !== this.#epoch) return;
      await write();
    });
    return this.#queue;
  }

  async suspendAndDrain(): Promise<void> {
    this.#suspended = true;
    this.#epoch++;
    await this.#queue;
  }

  resume(): void {
    this.#suspended = false;
  }

  drain(): Promise<void> {
    return this.#queue;
  }
}

export function isActiveAlertEpisode(
  episodeId: string,
  activeEpisodeId: string | null,
  monitoringSessionActive: boolean,
  monitorStatus: string,
): boolean {
  return monitoringSessionActive && monitorStatus === 'alert' && episodeId === activeEpisodeId;
}

export function recoveryPercent(recoveryDwellMs: number, requiredMs: number, activeEpisodeId: string | null): number {
  if (!activeEpisodeId || !Number.isFinite(recoveryDwellMs) || !Number.isFinite(requiredMs) || requiredMs <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((recoveryDwellMs / requiredMs) * 100)));
}

export function shouldCancelCalibrationOnNavigation(input: {
  currentScreen: string;
  destination: string;
  countdownSeconds: number;
  progress: number;
  replacing: boolean;
  candidateReady: boolean;
}): boolean {
  if (input.currentScreen !== 'calibration' || ['positioning', 'calibration'].includes(input.destination) || input.candidateReady) return false;
  return input.countdownSeconds > 0 || (input.progress > 0 && input.progress < 100) || input.replacing;
}

export async function requestAlertAndShowFallback(options: {
  isCurrent: () => boolean;
  requestNative: () => Promise<{ status: 'requested' | 'unavailable' }>;
  showFallback: () => Promise<void>;
  markUnavailable: () => void;
}): Promise<void> {
  try {
    const attempt = await options.requestNative();
    if (attempt.status === 'unavailable') options.markUnavailable();
  } catch {
    options.markUnavailable();
  } finally {
    if (options.isCurrent()) await options.showFallback().catch(() => undefined);
  }
}

export function monitoringUpdateDecision(current: {
  score: number | null;
  status: string;
  correction: string | null;
  recoveryProgress: number;
}, next: {
  score: number | null;
  status: string;
  correction: string | null;
  recoveryProgress: number;
}): { apply: boolean; semanticChange: boolean } {
  const semanticChange = current.score !== next.score || current.status !== next.status || current.correction !== next.correction;
  return { apply: semanticChange || current.recoveryProgress !== next.recoveryProgress, semanticChange };
}

export async function resolveCurrentCalibrationBinding(
  resolveHash: () => Promise<string>,
  isCurrent: () => boolean,
): Promise<string | null> {
  const hash = await resolveHash();
  return isCurrent() ? hash : null;
}
