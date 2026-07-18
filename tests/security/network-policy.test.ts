import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { installNavigationPolicy, installNetworkPolicy, isTrustedAppUrl } from '../../src/main/network-policy.ts';
import { installPermissionPolicy } from '../../src/main/permissions.ts';

type RequestDecision = { cancel?: boolean };
type HeaderDecision = { responseHeaders?: Record<string, string[]> };

const appRoot = path.resolve('open-posture-test-app');
const entryUrl = pathToFileURL(path.join(appRoot, 'renderer', 'index.html')).toString();
const modelUrl = pathToFileURL(path.join(appRoot, 'renderer', 'assets', 'model.task')).toString();
const preloadUrl = pathToFileURL(path.join(appRoot, 'preload', 'index.js')).toString();

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
  assert.equal(isTrustedAppUrl(entryUrl, entryUrl), true);
  assert.equal(isTrustedAppUrl(modelUrl, entryUrl), true);
  assert.equal(isTrustedAppUrl(preloadUrl, entryUrl), false);
  assert.equal(isTrustedAppUrl('https://example.com/', entryUrl), false);
});

test('runtime networking denies external and loopback HTTP or WebSocket requests', () => {
  const fixture = fakeSession();
  installNetworkPolicy(fixture.session as never, entryUrl);

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
  installNetworkPolicy(fixture.session as never, entryUrl);

  let headers: HeaderDecision = {};
  fixture.headersReceived({ url: entryUrl }, (value) => { headers = value; });
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
  installPermissionPolicy(fixture.session as never, entryUrl);

  assert.equal(fixture.permissionCheck({}, 'media', entryUrl, { mediaType: 'video', requestingUrl: entryUrl }), true);
  assert.equal(fixture.permissionCheck({}, 'media', entryUrl, { mediaType: 'audio', requestingUrl: entryUrl }), false);
  assert.equal(fixture.permissionCheck({}, 'geolocation', entryUrl, { requestingUrl: entryUrl }), false);
  assert.equal(fixture.permissionCheck({}, 'media', 'https://example.com', { mediaType: 'video' }), false);

  const request = (permission: string, mediaTypes: string[], url = entryUrl): boolean => {
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
  installNavigationPolicy(webContents as never, entryUrl);
  assert.deepEqual(openHandler!(), { action: 'deny' });

  let prevented = false;
  navigate!({ preventDefault: () => { prevented = true; } }, 'https://example.com/');
  assert.equal(prevented, true);
  prevented = false;
  navigate!({ preventDefault: () => { prevented = true; } }, entryUrl);
  assert.equal(prevented, false);
});
