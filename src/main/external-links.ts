import { shell } from 'electron';

import type { ExternalLinkTarget } from '../preload/api-types';

const EXTERNAL_LINKS: Readonly<Record<ExternalLinkTarget, string>> = {
  license: 'https://www.apache.org/licenses/LICENSE-2.0',
  mediapipe: 'https://github.com/google-ai-edge/mediapipe',
  'electron-security': 'https://www.electronjs.org/docs/latest/tutorial/security',
};

export function isExternalLinkTarget(
  value: unknown,
): value is ExternalLinkTarget {
  return typeof value === 'string' && value in EXTERNAL_LINKS;
}

export async function openExternalLink(
  target: ExternalLinkTarget,
): Promise<boolean> {
  const url = EXTERNAL_LINKS[target];
  if (!url) return false;
  await shell.openExternal(url, { activate: true });
  return true;
}
