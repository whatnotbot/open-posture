import assert from 'node:assert/strict';
import test from 'node:test';

import { attachCameraPreview } from './camera-preview.ts';

type FakeVideo = {
  srcObject: object | null;
  replacedWith: FakeVideo | null;
  replaceWith(video: FakeVideo): void;
};

function video(srcObject: object | null = null): FakeVideo {
  return {
    srcObject,
    replacedWith: null,
    replaceWith(replacement) {
      this.replacedWith = replacement;
    },
  };
}

test('keeps the live camera player when the renderer updates', () => {
  const stream = {};
  const previous = video(stream);
  const next = video();

  const attached = attachCameraPreview(
    previous as unknown as HTMLVideoElement,
    next as unknown as HTMLVideoElement,
    stream as MediaStream,
  );

  assert.equal(attached, previous);
  assert.equal(next.replacedWith, previous);
});

test('attaches a new stream when there is no reusable player', () => {
  const stream = {};
  const next = video();

  const attached = attachCameraPreview(
    null,
    next as unknown as HTMLVideoElement,
    stream as MediaStream,
  );

  assert.equal(attached, next);
  assert.equal(next.srcObject, stream);
});

test('detaches a preview that is no longer rendered', () => {
  const previous = video({});

  const attached = attachCameraPreview(
    previous as unknown as HTMLVideoElement,
    null,
    null,
  );

  assert.equal(attached, null);
  assert.equal(previous.srcObject, null);
});
