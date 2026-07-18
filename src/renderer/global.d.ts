import type { DesktopApi } from '../preload/api-types';

declare global {
  interface Window {
    openPosture?: DesktopApi;
  }
}

export {};
