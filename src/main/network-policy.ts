import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Session, WebContents } from 'electron';

export function isTrustedAppUrl(candidateValue: string, entryValue: string): boolean {
  try {
    const candidate = new URL(candidateValue);
    const entry = new URL(entryValue);

    if (entry.protocol === 'file:') {
      if (candidate.protocol !== 'file:') return false;
      const root = path.dirname(fileURLToPath(entry));
      const candidatePath = fileURLToPath(candidate);
      const relative = path.relative(root, candidatePath);
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    }

    return candidate.origin === entry.origin;
  } catch {
    return false;
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
