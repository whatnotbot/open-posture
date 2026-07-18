import path from 'node:path';

import type { Session, WebContents } from 'electron';

export const APP_SCHEME = 'open-posture';
export const APP_HOST = 'app';
export const APP_ENTRY_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;

export function isTrustedAppUrl(candidateValue: string, entryValue: string): boolean {
  try {
    const candidate = new URL(candidateValue);
    const entry = new URL(entryValue);
    return (
      entry.protocol === `${APP_SCHEME}:` &&
      entry.hostname === APP_HOST &&
      !entry.port &&
      !entry.username &&
      !entry.password &&
      candidate.protocol === entry.protocol &&
      candidate.hostname === entry.hostname &&
      !candidate.port &&
      !candidate.username &&
      !candidate.password
    );
  } catch {
    return false;
  }
}

export function resolveAppResourcePath(
  candidateValue: string,
  rendererRootValue: string,
): string | undefined {
  try {
    const candidate = new URL(candidateValue);
    if (
      candidate.protocol !== `${APP_SCHEME}:` ||
      candidate.hostname !== APP_HOST ||
      candidate.port ||
      candidate.username ||
      candidate.password
    ) {
      return undefined;
    }

    const rendererRoot = path.resolve(rendererRootValue);
    const relativeUrlPath = decodeURIComponent(candidate.pathname).replace(/^\/+/, '');
    if (!relativeUrlPath || relativeUrlPath.includes('\0')) return undefined;
    const candidatePath = path.resolve(rendererRoot, relativeUrlPath);
    const relativePath = path.relative(rendererRoot, candidatePath);
    if (
      relativePath === '' ||
      relativePath.startsWith('..') ||
      path.isAbsolute(relativePath)
    ) {
      return undefined;
    }
    return candidatePath;
  } catch {
    return undefined;
  }
}

function contentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "connect-src 'none'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function installNetworkPolicy(session: Session, entryUrl: string): void {
  session.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (_details, callback) => callback({ cancel: true }),
  );

  session.webRequest.onHeadersReceived((details, callback) => {
    if (!isTrustedAppUrl(details.url, entryUrl)) {
      callback(
        details.responseHeaders
          ? { responseHeaders: details.responseHeaders }
          : {},
      );
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy()],
      },
    });
  });

  session.on('will-download', (event) => event.preventDefault());
}

export function installNavigationPolicy(
  webContents: WebContents,
  entryUrl: string,
): void {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event, url) => {
    if (!isTrustedAppUrl(url, entryUrl)) event.preventDefault();
  });
}
