import assert from 'node:assert/strict';
import test from 'node:test';

import { topRightOverlayBounds } from './overlay-position.ts';

test('desktop alerts sit inside the top-right of the active display', () => {
  assert.deepEqual(topRightOverlayBounds({ x: 0, y: 24, width: 1440, height: 876 }, 380, 148), { x: 1044, y: 40, width: 380, height: 148 });
  assert.deepEqual(topRightOverlayBounds({ x: -1920, y: 0, width: 1920, height: 1080 }, 380, 148), { x: -396, y: 16, width: 380, height: 148 });
});
