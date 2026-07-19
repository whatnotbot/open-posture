export type WorkArea = { x: number; y: number; width: number; height: number };

export function topRightOverlayBounds(workArea: WorkArea, width: number, height: number, margin = 16): WorkArea {
  return {
    x: workArea.x + workArea.width - width - margin,
    y: workArea.y + margin,
    width,
    height,
  };
}
