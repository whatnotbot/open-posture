export type WorkArea = { x: number; y: number; width: number; height: number };

export const DESKTOP_ALERT_WINDOW_OPTIONS = {
  show: false,
  frame: false,
  transparent: true,
  resizable: false,
  movable: false,
  minimizable: false,
  maximizable: false,
  closable: false,
  focusable: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  hasShadow: false,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    devTools: false,
  },
} as const;

export function topRightOverlayBounds(workArea: WorkArea, width: number, height: number, margin = 16): WorkArea {
  return {
    x: workArea.x + workArea.width - width - margin,
    y: workArea.y + margin,
    width,
    height,
  };
}
