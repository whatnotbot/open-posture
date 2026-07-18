import type { CameraDevice, CameraErrorCode, StopReason } from "./types.ts";

export class CameraSession {
  private readonly mediaDevices: Pick<MediaDevices, "getUserMedia" | "enumerateDevices">;
  private current: MediaStream | null = null;
  private stopping = false;
  private endedListener: (() => void) | undefined;
  private trackListeners = new Map<MediaStreamTrack, () => void>();

  constructor(mediaDevices: Pick<MediaDevices, "getUserMedia" | "enumerateDevices">) {
    this.mediaDevices = mediaDevices;
  }

  get stream(): MediaStream | null {
    return this.current;
  }

  get activeDeviceId(): string | null {
    if (!this.current) return null;
    const tracks = typeof this.current.getVideoTracks === "function"
      ? this.current.getVideoTracks()
      : this.current.getTracks();
    return tracks[0]?.getSettings?.().deviceId || null;
  }

  onUnexpectedEnd(listener: () => void): () => void {
    this.endedListener = listener;
    return () => {
      if (this.endedListener === listener) this.endedListener = undefined;
    };
  }

  async start(deviceId?: string): Promise<MediaStream> {
    this.stop("restart");
    const video: MediaTrackConstraints = {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 15, max: 30 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "user" } }),
    };
    const stream = await this.mediaDevices.getUserMedia({ audio: false, video });
    this.current = stream;
    for (const track of stream.getTracks()) {
      const listener = (): void => {
        if (!this.stopping && this.current === stream) this.endedListener?.();
      };
      this.trackListeners.set(track, listener);
      track.addEventListener("ended", listener);
    }
    return stream;
  }

  stop(_reason: StopReason = "manual"): void {
    const stream = this.current;
    this.current = null;
    if (!stream) return;
    this.stopping = true;
    for (const track of stream.getTracks()) {
      const listener = this.trackListeners.get(track);
      if (listener) track.removeEventListener("ended", listener);
      this.trackListeners.delete(track);
      track.stop();
    }
    this.stopping = false;
  }

  async restart(deviceId?: string): Promise<MediaStream> {
    this.stop("restart");
    return this.start(deviceId);
  }

  async devices(): Promise<readonly CameraDevice[]> {
    return (await this.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === "videoinput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label }));
  }
}

export function classifyCameraError(error: unknown): CameraErrorCode {
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission_denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "no_device";
  if (name === "NotReadableError" || name === "TrackStartError") return "busy";
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError" || name === "TypeError") {
    return "unsupported_constraints";
  }
  if (name === "AbortError") return "disconnected";
  return "unknown";
}
