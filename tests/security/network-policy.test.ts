import assert from 'node:assert/strict';
import test from 'node:test';

import { installNavigationPolicy, installNetworkPolicy, isTrustedAppUrl } from '../../src/main/network-policy.ts';
import { installPermissionPolicy } from '../../src/main/permissions.ts';

type RequestDecision = { cancel?: boolean };
type HeaderDecision = { responseHeaders?: Record<string, string[]> };

function fakeSession() {
  let beforeRequest: ((details: { url: string }, callback: (decision: RequestDecision) => void) => void) | undefined;
  let headersReceived: ((details: { url: string; responseHeaders?: Record<string, string[]> }, callback: (decision: HeaderDecision) => void) => void) | undefined;
  let permissionCheck: ((webContents: unknown, permission: string, origin: string, details: { mediaType?: string; requestingUrl?: string }) => boolean) | undefined;
  let permissionRequest: ((webContents: { getURL(): string }, permission: string, callback: (allowed: boolean) => void, details: { requestingUrl?: string; mediaTypes?: string[] }) => void) | undefined;
  let download: ((event: { preventDefault(): void }) => void) | undefined;

  const session = {
    webRequest: {
      onBeforeRequest: (_filter: unknown, listener: typeof beforeRequest) => { beforeRequest = listener; },
      onHeadersReceived: (listener: typeof headersReceived) => { headersReceived = listener; },
    },
    setPermissionCheckHandler: (listener: typeof permissionCheck) => { permissionCheck = listener; },
    setPermissionRequestHandler: (listener: typeof permissionRequest) => { permissionRequest = listener; },
    on: (name: string, listener: typeof download) => { if (name === 'will-download') download = listener; },
  };

  return {
    session,
    get beforeRequest() { return beforeRequest!; },
    get headersReceived() { return headersReceived!; },
    get permissionCheck() { return permissionCheck!; },
    get permissionRequest() { return permissionRequest!; },
    get download() { return download!; },
  };
}

test('production file trust is confined to the renderer output directory', () => {
  const entry = 'file:///opt/open-posture/renderer/index.html';
  assert.equal(isTrustedAppUrl(entry, entry), true);
  assert.equal(isTrustedAppUrl('file:///opt/open-posture/renderer/assets/model.task', entry), true);
  assert.equal(isTrustedAppUrl('file:///opt/open-posture/preload/index.js', entry), false);
  assert.equal(isTrustedAppUrl('https://example.com/', entry), false);
});

test('runtime networking denies external and loopback HTTP or WebSocket requests', () => {
  const fixture = fakeSession();
  installNetworkPolicy(fixture.session as never, 'file:///opt/open-posture/renderer/index.html');

  const decide = (url: string): RequestDecision => {
    let decision: RequestDecision = {};
    fixture.beforeRequest({ url }, (value) => { decision = value; });
    return decision;
  };

  assert.deepEqual(decide('http://localhost:4321/main.js'), { cancel: true });
  assert.deepEqual(decide('ws://localhost:4321/ws'), { cancel: true });
  assert.deepEqual(decide('https://example.com/collect'), { cancel: true });
  assert.deepEqual(decide('http://127.0.0.1:4321/main.js'), { cancel: true });
  assert.deepEqual(decide('http://localhost:9999/main.js'), { cancel: true });
});

test('production CSP denies connections and downloads', () => {
  const fixture = fakeSession();
  const entry = 'file:///opt/open-posture/renderer/index.html';
  installNetworkPolicy(fixture.session as never, entry);

  let headers: HeaderDecision = {};
  fixture.headersReceived({ url: entry }, (value) => { headers = value; });
  const policy = headers.responseHeaders?.['Content-Security-Policy']?.[0] ?? '';
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);

  let prevented = false;
  fixture.download({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
});

test('permission policy allows trusted video only', () => {
  const fixture = fakeSession();
  const entry = 'file:///opt/open-posture/renderer/index.html';
  installPermissionPolicy(fixture.session as never, entry);

  assert.equal(fixture.permissionCheck({}, 'media', entry, { mediaType: 'video', requestingUrl: entry }), true);
  assert.equal(fixture.permissionCheck({}, 'media', entry, { mediaType: 'audio', requestingUrl: entry }), false);
  assert.equal(fixture.permissionCheck({}, 'geolocation', entry, { requestingUrl: entry }), false);
  assert.equal(fixture.permissionCheck({}, 'media', 'https://example.com', { mediaType: 'video' }), false);

  const request = (permission: string, mediaTypes: string[], url = entry): boolean => {
    let allowed = false;
    fixture.permissionRequest({ getURL: () => url }, permission, (value) => { allowed = value; }, { requestingUrl: url, mediaTypes });
    return allowed;
  };
  assert.equal(request('media', ['video']), true);
  assert.equal(request('media', ['video', 'audio']), false);
  assert.equal(request('media', ['audio']), false);
  assert.equal(request('display-capture', ['video']), false);
});

test('navigation and new windows fail closed', () => {
  let openHandler: (() => { action: string }) | undefined;
  let navigate: ((event: { preventDefault(): void }, url: string) => void) | undefined;
  const webContents = {
    setWindowOpenHandler: (handler: typeof openHandler) => { openHandler = handler; },
    on: (name: string, handler: typeof navigate) => { if (name === 'will-navigate') navigate = handler; },
  };
  const entry = 'file:///opt/open-posture/renderer/index.html';
  installNavigationPolicy(webContents as never, entry);
  assert.deepEqual(openHandler!(), { action: 'deny' });

  let prevented = false;
  navigate!({ preventDefault: () => { prevented = true; } }, 'https://example.com/');
  assert.equal(prevented, true);
  prevented = false;
  navigate!({ preventDefault: () => { prevented = true; } }, entry);
  assert.equal(prevented, false);
});
