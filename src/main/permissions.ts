import type { Session } from 'electron';

import { isTrustedAppUrl } from './network-policy.ts';

export function installPermissionPolicy(session: Session, entryUrl: string): void {
  session.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) =>
      permission === 'media' &&
      details.mediaType === 'video' &&
      isTrustedAppUrl(details.requestingUrl ?? requestingOrigin, entryUrl),
  );

  session.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const request = details as { requestingUrl?: string; mediaTypes?: string[] };
      const mediaTypes = request.mediaTypes ?? [];
      const requestingUrl = request.requestingUrl ?? webContents.getURL();
      const allow =
        permission === 'media' &&
        isTrustedAppUrl(requestingUrl, entryUrl) &&
        mediaTypes.length === 1 &&
        mediaTypes[0] === 'video';
      callback(allow);
    },
  );
}
