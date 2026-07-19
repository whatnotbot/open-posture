export function attachCameraPreview(
  previous: HTMLVideoElement | null,
  next: HTMLVideoElement | null,
  stream: MediaStream | null,
): HTMLVideoElement | null {
  if (previous && next && stream && previous.srcObject === stream) {
    next.replaceWith(previous);
    return previous;
  }
  if (previous) previous.srcObject = null;
  if (!next) return null;
  if (stream) next.srcObject = stream;
  return next;
}
