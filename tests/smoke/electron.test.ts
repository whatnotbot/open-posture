import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

type CdpResult = { result?: { value?: unknown }; exceptionDetails?: unknown };

class CdpClient {
  private id = 0;
  private readonly pending = new Map<number, { resolve: (value: CdpResult) => void; reject: (error: Error) => void }>();
  private readonly socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: CdpResult; error?: { message: string } };
      if (message.id === undefined) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result ?? {});
    });
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP WebSocket timed out')), 10_000);
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('CDP WebSocket failed')); }, { once: true });
    });
    return new CdpClient(socket);
  }

  async call(method: string, params: Record<string, unknown> = {}): Promise<CdpResult> {
    const id = ++this.id;
    const response = new Promise<CdpResult>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  async evaluate<T>(expression: string, awaitPromise = false): Promise<T> {
    const response = await this.call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (response.exceptionDetails) throw new Error(`Renderer evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
    return response.result?.value as T;
  }

  close(): void {
    this.socket.close();
  }
}

async function retry<T>(operation: () => Promise<T | undefined>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (value !== undefined) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for Electron');
}

function devtoolsUrl(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Electron did not expose DevTools. ${output}`)), 15_000);
    const inspect = (chunk: Buffer): void => {
      output = `${output}${chunk.toString()}`.slice(-8_000);
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Electron exited before smoke inspection (code ${code}). ${output}`));
    });
  });
}

async function captureScreenshot(client: CdpClient, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const screenshot = await client.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }) as unknown as { data: string };
  await writeFile(target, Buffer.from(screenshot.data, 'base64'));
}

async function accessibilityIssues(client: CdpClient): Promise<string[]> {
  return client.evaluate<string[]>(`(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
    };
    const name = (element) => {
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) return labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
        const label = element.labels?.[0]?.textContent?.trim();
        if (label) return label;
      }
      return (element.getAttribute('aria-label') || element.textContent || element.getAttribute('title') || '').trim();
    };
    const issues = [];
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    for (const id of new Set(ids)) if (ids.filter((value) => value === id).length > 1) issues.push('duplicate id: ' + id);
    for (const element of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')) {
      if (visible(element) && !name(element)) issues.push('unnamed interactive: ' + element.outerHTML.slice(0, 120));
    }
    for (const image of document.querySelectorAll('img')) if (!image.hasAttribute('alt')) issues.push('image missing alt');
    for (const element of document.querySelectorAll('[tabindex]')) {
      if (Number(element.getAttribute('tabindex')) > 0) issues.push('positive tabindex');
    }
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible);
    if (!headings.some((heading) => heading.tagName === 'H1')) issues.push('visible surface has no h1');
    for (let index = 1; index < headings.length; index++) {
      if (Number(headings[index].tagName[1]) > Number(headings[index - 1].tagName[1]) + 1) issues.push('heading level skipped');
    }
    for (const dialog of document.querySelectorAll('dialog[open]')) if (!name(dialog)) issues.push('open dialog is unnamed');
    return issues;
  })()`);
}

async function assertAccessibleSurface(client: CdpClient): Promise<void> {
  assert.deepEqual(await accessibilityIssues(client), []);
}

test('Electron app is secure, camera-off initially, and can acquire video only', { timeout: 35_000 }, async () => {
  const packagedExecutable = process.env.OPEN_POSTURE_EXECUTABLE;
  const executable = packagedExecutable
    ? path.resolve(packagedExecutable)
    : path.join(
        process.cwd(),
        'node_modules',
        'electron',
        'dist',
        (await readFile(path.join(process.cwd(), 'node_modules', 'electron', 'path.txt'), 'utf8')).trim(),
      );
  const userData = await mkdtemp(path.join(os.tmpdir(), 'open-posture-smoke-'));
  const child = spawn(executable, [
    ...(packagedExecutable ? [] : ['.']),
    '--remote-debugging-port=0',
    '--use-fake-device-for-media-stream',
    `--user-data-dir=${userData}`,
  ], { cwd: process.cwd(), env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'false' } });

  let client: CdpClient | undefined;
  try {
    const browserSocket = await devtoolsUrl(child);
    const port = new URL(browserSocket).port;
    const pageSocket = await retry(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json() as { type: string; title: string; webSocketDebuggerUrl?: string }[];
      return targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
    });
    client = await CdpClient.connect(pageSocket);
    await client.call('Runtime.enable');

    const title = await retry(async () => {
      const value = await client!.evaluate<string>('document.title');
      return value || undefined;
    });
    assert.equal(title, 'Open Posture');
    assert.equal(await client.evaluate<string>('location.protocol'), 'open-posture:');
    const inlineScriptRan = await client.evaluate<boolean>("(()=>{window.__openPostureInlineCspTest=false;const script=document.createElement('script');script.textContent='window.__openPostureInlineCspTest=true';document.head.append(script);script.remove();return window.__openPostureInlineCspTest})()");
    assert.equal(inlineScriptRan, false);
    const heading = await retry(async () => {
      const value = await client!.evaluate<string>("document.querySelector('h1')?.textContent ?? ''");
      return value || undefined;
    });
    assert.match(heading, /gentle cue/i);
    await assertAccessibleSurface(client);
    const screenshotPath = process.env.OPEN_POSTURE_CAPTURE_SCREENSHOT;
    if (screenshotPath) await captureScreenshot(client, screenshotPath);
    assert.equal(await client.evaluate<boolean>("Boolean(document.querySelector('video')?.srcObject)"), false);
    const bridgeKeys = await client.evaluate<string[]>('Object.keys(window.openPosture).sort()');
    assert.deepEqual(bridgeKeys, [
      'appendLifecycleLog',
      'deleteAllData',
      'deleteCalibration',
      'deleteHistory',
      'getCapabilities',
      'getDiagnosticsText',
      'getRuntimeInfo',
      'loadConfig',
      'loadHistory',
      'onDesktopEvent',
      'openExternalLink',
      'readyToQuit',
      'reportPostureAlert',
      'revealDataFolder',
      'saveConfig',
      'sendTestNotification',
      'setHistoryRetention',
      'setMonitoringState',
      'showPostureFallback',
      'upsertHistory',
    ]);

    const externalFetch = await client.evaluate<string>("(async()=>{try{await fetch('https://example.com/open-posture-smoke');return 'allowed'}catch{return 'blocked'}})()", true);
    assert.equal(externalFetch, 'blocked');

    await client.evaluate<void>("document.querySelector('[data-action=go][data-screen=settings]').click()");
    await retry(async () => (await client!.evaluate<boolean>("Boolean(document.querySelector('[data-action=go][data-screen=positioning]'))")) || undefined);
    await client.evaluate<void>("document.querySelector('[data-action=go][data-screen=positioning]').click()");
    await retry(async () => (await client!.evaluate<boolean>("Boolean(document.querySelector('[data-action=allow-camera]'))")) || undefined);
    assert.equal(await client.evaluate<boolean>("Boolean(document.querySelector('video')?.srcObject)"), false);

    await assertAccessibleSurface(client);
    if (screenshotPath) await captureScreenshot(client, path.join(path.dirname(screenshotPath), 'open-posture-camera.png'));
    await client.evaluate<void>("document.querySelector('[data-action=allow-camera]').click()");
    const tracks = await retry(async () => {
      const value = await client!.evaluate<{ video: number; audio: number; error?: string } | null>("(()=>{const s=document.querySelector('video')?.srcObject;if(s)return {video:s.getVideoTracks().length,audio:s.getAudioTracks().length};const h=document.querySelector('h1')?.textContent??'';return /camera.+(off|start)|no camera/i.test(h)?{video:0,audio:0,error:h}:null})()");
      if (value?.error) throw new Error(`Camera smoke failed: ${value.error}`);
      return value ?? undefined;
    }, 10_000);
    assert.deepEqual(tracks, { video: 1, audio: 0 });
    await assertAccessibleSurface(client);
    if (screenshotPath) await captureScreenshot(client, path.join(path.dirname(screenshotPath), 'open-posture-positioning.png'));
    await client.evaluate<void>("window.__openPostureSmokeStream=document.querySelector('video').srcObject");

    const microphone = await client.evaluate<string>("Promise.race([(async()=>{try{const s=await navigator.mediaDevices.getUserMedia({audio:true,video:false});s.getTracks().forEach(t=>t.stop());return 'allowed'}catch{return 'blocked'}})(),new Promise(r=>setTimeout(()=>r('timed-out'),3000))])", true);
    assert.notEqual(microphone, 'allowed');

    const storedKeys = await client.evaluate<string[]>("window.openPosture.loadConfig().then(r=>Object.keys(r.value).sort())", true);
    assert.deepEqual(storedKeys, ['appVersion', 'calibration', 'schemaVersion', 'selectedCameraId', 'settings', 'setup']);

    await client.evaluate<void>("document.querySelector('[data-action=go][data-screen=camera]').click()");
    await retry(async () => (await client!.evaluate<boolean>("Boolean(document.querySelector('[data-action=camera-not-now]'))")) || undefined);
    await client.evaluate<void>("document.querySelector('[data-action=camera-not-now]').click()");
    await retry(async () => (await client!.evaluate<boolean>("window.__openPostureSmokeStream.getTracks().every(t=>t.readyState==='ended')")) || undefined);
    await client.evaluate<void>("delete window.__openPostureSmokeStream");
    await client.evaluate<void>("document.querySelector('[data-action=go][data-screen=settings]').click()");
    await retry(async () => (await client!.evaluate<boolean>("Boolean(document.querySelector('#history-days'))")) || undefined);
    await assertAccessibleSurface(client);
    assert.equal(await client.evaluate<boolean>("Boolean(document.querySelector('[data-action=restore-monitoring-defaults]')&&document.querySelector('[data-action=restore-accessibility-defaults]')&&document.querySelector('[data-action=restore-history-defaults]')&&document.querySelector('[data-action=reveal-data-folder]'))"), true);
    if (screenshotPath) await captureScreenshot(client, path.join(path.dirname(screenshotPath), 'open-posture-settings.png'));
    await client.evaluate<void>("(()=>{const input=document.querySelector('[data-setting=reducedMotion]');input.focus();input.click()})()");
    await retry(async () => (await client!.evaluate<boolean>("document.activeElement?.dataset?.setting==='reducedMotion'")) || undefined);
  } finally {
    if (client) {
      try { await Promise.race([client.call('Browser.close'), new Promise((resolve) => setTimeout(resolve, 500))]); } catch { /* force-killed below */ }
      client.close();
    }
    child.kill('SIGKILL');
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      else {
        const timeout = setTimeout(resolve, 5_000);
        child.once('exit', () => { clearTimeout(timeout); resolve(); });
      }
    });
    await Promise.race([
      rm(userData, { recursive: true, force: true }),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
});
