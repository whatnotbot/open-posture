import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, parse, resolve } from 'node:path';
import test from 'node:test';

const ROOT = findRepositoryRoot();
const at = (path: string): string => join(ROOT, ...path.split('/'));
const read = (path: string): string => readFileSync(at(path), 'utf8');

function findRepositoryRoot(): string {
  for (const startingPoint of [process.cwd(), dirname(resolve(process.argv[1] ?? '.'))]) {
    let candidate = resolve(startingPoint);
    const filesystemRoot = parse(candidate).root;
    while (candidate !== filesystemRoot) {
      const packagePath = join(candidate, 'package.json');
      if (existsSync(packagePath)) {
        const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: string };
        if (packageJson.name === 'open-posture') return candidate;
      }
      candidate = dirname(candidate);
    }
  }
  throw new Error('Could not locate the open-posture repository root.');
}

function filesBelow(relative: string): string[] {
  const directory = at(relative);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = `${relative}/${entry.name}`;
    return entry.isDirectory() ? filesBelow(child) : [child];
  });
}

function productionRenderer(): string {
  return filesBelow('src/renderer')
    .filter((file) => ['.ts', '.css', '.html'].includes(extname(file)))
    .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
    .map(read)
    .join('\n');
}

test('required open-source, workflow, template, and documentation files exist', () => {
  const required = [
    'README.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md', 'SECURITY.md', 'GOVERNANCE.md', 'ROADMAP.md', 'CHANGELOG.md',
    '.github/workflows/ci.yml', '.github/workflows/codeql.yml',
    '.github/workflows/dependency-review.yml', '.github/dependabot.yml',
    '.npmrc',
    '.github/PULL_REQUEST_TEMPLATE.md', '.github/ISSUE_TEMPLATE/config.yml',
    '.github/ISSUE_TEMPLATE/bug.yml', '.github/ISSUE_TEMPLATE/feature.yml',
    '.github/ISSUE_TEMPLATE/performance.yml', '.github/ISSUE_TEMPLATE/platform.yml',
    'docs/architecture.md', 'docs/algorithm.md', 'docs/privacy.md', 'docs/data.md',
    'docs/model.md', 'docs/testing.md', 'docs/troubleshooting.md',
    'docs/testing-windows.md', 'docs/manual-smoke.md', 'docs/release-process.md',
    'docs/requirements-traceability.md', 'docs/release-evidence-v0.1.0.md',
    'docs/macos-distribution.md', '.github/workflows/release-macos.yml',
    'forge.config.js', 'assets/packaging/OpenPosture.icns',
    'assets/packaging/entitlements.mac.plist',
  ];
  for (const file of required) assert.ok(existsSync(at(file)), `Missing ${file}`);

  for (const form of ['bug', 'feature', 'performance', 'platform']) {
    const source = read(`.github/ISSUE_TEMPLATE/${form}.yml`);
    assert.match(source, /camera (?:footage|material)/i, `${form} form lacks camera-data warning`);
    assert.match(source, /raw landmarks/i, `${form} form lacks landmark warning`);
  }
  const pullRequest = read('.github/PULL_REQUEST_TEMPLATE.md');
  for (const item of ['Affected requirement', 'Tests added', 'Platforms actually tested', 'privacy', 'license', 'personal camera']) {
    assert.match(pullRequest, new RegExp(item, 'i'));
  }
});

test('package retains the direct source runner and adds macOS packaging without a native production dependency', () => {
  const packageJson = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    allowScripts?: Record<string, boolean>;
  };
  assert.equal(packageJson.scripts['make:mac'], 'electron-forge make --platform=darwin');
  assert.equal(packageJson.scripts['make:mac:arm64'], 'electron-forge make --platform=darwin --arch=arm64');
  assert.equal(packageJson.scripts['make:mac:x64'], 'electron-forge make --platform=darwin --arch=x64');
  assert.equal(packageJson.scripts.publish, undefined, 'Publishing must stay an explicit release action');

  const runtimeDependencies = Object.keys(packageJson.dependencies ?? {}).sort();
  assert.deepEqual(runtimeDependencies, ['@mediapipe/tasks-vision']);
  assert.deepEqual(
    Object.keys(packageJson.devDependencies ?? {}).filter((name) => name.startsWith('@electron-forge/')).sort(),
    ['@electron-forge/cli', '@electron-forge/maker-dmg', '@electron-forge/plugin-fuses'],
  );
  assert.equal(packageJson.scripts.start, 'node scripts/check-toolchain.cjs && npm run electron:install && npm run build && electron .');
  assert.deepEqual(packageJson.allowScripts, {
    'fs-xattr@0.3.1': true,
    'macos-alias@0.2.12': true,
  });
  assert.match(read('.npmrc'), /^strict-allow-scripts=true\s*$/);
  const native = /^(?:better-sqlite3|sqlite3|sharp|canvas|ffi-napi|usb|node-gyp|@serialport\/|opencv)/i;
  assert.equal(runtimeDependencies.some((name) => native.test(name)), false);
  assert.ok(read('.gitignore').split(/\r?\n/).includes('out/'), 'Generated installers must stay out of git');

  const forge = read('forge.config.js');
  for (const fuse of [
    'RunAsNode',
    'EnableCookieEncryption',
    'EnableNodeOptionsEnvironmentVariable',
    'EnableNodeCliInspectArguments',
    'EnableEmbeddedAsarIntegrityValidation',
    'OnlyLoadAppFromAsar',
    'GrantFileProtocolExtraPrivileges',
  ]) assert.match(forge, new RegExp(`FuseV1Options\\.${fuse}`));
});

test('renderer has no remote assets, CDN, web font, Node, storage, or network API', () => {
  const source = productionRenderer();
  assert.doesNotMatch(source, /https?:\/\/|(?:src|href)\s*=\s*["']\/\/|@import\s+url|fonts\.(?:googleapis|gstatic)\.com/i);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/);
  assert.doesNotMatch(source, /\bipcRenderer\b|from\s+["']electron["']|\brequire\s*\(|\bprocess\.(?:env|versions|platform)\b/);
});

test('camera is video-only and model/runtime paths remain local', () => {
  const cameraSource = [read('src/renderer/index.ts'), read('src/renderer/camera/camera-session.ts')].join('\n');
  const audioValues = [...cameraSource.matchAll(/\baudio\s*:\s*([^,}\n]+)/g)].map((match) => match[1]?.trim());
  assert.ok(audioValues.length >= 1, 'Expected an explicit audio constraint');
  assert.deepEqual([...new Set(audioValues)], ['false']);
  assert.doesNotMatch(cameraSource, /getDisplayMedia|webkitGetUserMedia|mozGetUserMedia/);

  const applicationSource = filesBelow('src').filter((file) => file.endsWith('.ts')).map(read).join('\n');
  assert.doesNotMatch(applicationSource, /storage\.googleapis\.com\/mediapipe-models|modelAssetPath\s*:\s*["']https?:/i);
  assert.match(read('src/renderer/camera/pose-worker.ts'), /assets\/models\/pose_landmarker_lite\.task/);
  assert.match(read('src/main/network-policy.ts'), /connect-src 'none'/);
});

test('preload exposes only centralized typed IPC channels', () => {
  const preload = read('src/preload/index.ts');
  const calls = [...preload.matchAll(/ipcRenderer\.(?:invoke|send|sendSync|postMessage|on|once|removeListener)\(\s*([^,)\n]+)/g)];
  assert.ok(calls.length > 0);
  for (const call of calls) assert.match(call[1] ?? '', /^IPC_CHANNELS\.[A-Za-z]+$/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\(['"]openPosture['"], api\)/);
  assert.doesNotMatch(read('src/preload/api-types.ts'), /\b(?:frame|landmark|filesystemPath|shellCommand|notificationText)\b/i);
});

test('required copy is personal-reference based, neutral, and non-medical', () => {
  const source = [read('src/renderer/index.ts'), read('src/renderer/state.ts'), read('src/main/notifications.ts')].join('\n');
  for (const copy of [
    'relative to your calibration',
    'personal comparison, not a medical standard',
    'Cannot assess',
    'If comfortable',
    'You’ve moved away from your calibrated posture. Take a moment to reset.',
    'does not diagnose, treat, prevent, or cure any condition',
  ]) assert.ok(source.includes(copy), `Missing required copy: ${copy}`);
  assert.doesNotMatch(source, /\b(?:perfect posture|bad posture|wrong posture|treats? pain|prevents? injury|diagnoses? (?:pain|condition|disease))\b/i);
});

test('every P0 renderer screen, surface, and monitoring status is represented', () => {
  const state = read('src/renderer/state.ts');
  const renderer = read('src/renderer/index.ts');
  const screens = ['welcome', 'camera', 'positioning', 'calibration', 'notifications', 'ready', 'dashboard', 'correction', 'history', 'settings', 'error'];
  const statuses = ['ready', 'finding', 'good', 'changing', 'alert', 'cannot-assess', 'cooldown', 'paused', 'snoozed', 'error'];
  for (const name of screens) {
    assert.match(state, new RegExp(`["']${name}["']`), `Missing screen state ${name}`);
    assert.match(renderer, new RegExp(`case ["']${name}["']`), `Missing screen renderer ${name}`);
  }
  for (const name of statuses) assert.match(state, new RegExp(`["']${name}["']`), `Missing monitor status ${name}`);
  for (const surface of ['passiveAlert', 'deleteDialog', 'errorScreen', 'correction', 'history', 'settings']) {
    assert.match(renderer, new RegExp(`function ${surface}\\(`), `Missing surface ${surface}`);
  }
});

test('renderer retains key accessibility and non-color semantics', () => {
  const html = read('src/renderer/index.html');
  const renderer = read('src/renderer/index.ts');
  const css = read('src/renderer/styles.css');
  assert.match(html, /class="skip-link"[^>]+href="#main"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-atomic="true"/);
  assert.match(renderer, /<main id="main"[^>]+tabindex="-1"/);
  assert.match(renderer, /<dialog[^>]+aria-labelledby=/);
  assert.match(renderer, /role="progressbar"/);
  assert.match(renderer, /aria-current="page"/);
  assert.match(renderer, /aria-hidden="true"/);
  assert.match(renderer, /monitorLabel\(model\.monitorStatus\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.sr-only/);
  assert.match(css, /@media \(max-width:/);
});

test('workflows are least-privilege and SHA-pinned; only the macOS release workflow uploads installers', () => {
  const workflowFiles = filesBelow('.github/workflows').filter((file) => /\.ya?ml$/.test(file));
  const workflows = workflowFiles.map(read).join('\n');
  const ci = read('.github/workflows/ci.yml');
  const macRelease = read('.github/workflows/release-macos.yml');
  const ordinaryWorkflows = workflowFiles
    .filter((file) => file !== '.github/workflows/release-macos.yml')
    .map(read)
    .join('\n');
  for (const os of ['macos-15', 'macos-15-intel', 'windows-2025', 'ubuntu-24.04']) assert.ok(ci.includes(os));
  for (const command of ['node-version: 24', 'npm ci', 'npm run check']) assert.ok(ci.includes(command));
  assert.match(workflows, /permissions:\s*\n\s+contents: read/);
  assert.match(read('.github/workflows/codeql.yml'), /github\/codeql-action\/(?:init|analyze)@[0-9a-f]{40} # v4\./);
  const checkoutCount = (workflows.match(/uses: actions\/checkout@[0-9a-f]{40}/g) ?? []).length;
  const nonPersistingCheckoutCount = (workflows.match(/persist-credentials: false/g) ?? []).length;
  assert.ok(checkoutCount > 0);
  assert.equal(nonPersistingCheckoutCount, checkoutCount);
  assert.doesNotMatch(ordinaryWorkflows, /upload-artifact|download-artifact|electron-forge\s+(?:make|package|publish)|npm run\s+(?:make|package|publish)/i);
  assert.match(macRelease, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(macRelease, /npm run \$\{\{ matrix\.make_script \}\}/);
  assert.doesNotMatch(macRelease, /pull_request:/, 'Signing and artifact jobs must never run for pull requests');

  for (const line of workflows.split('\n').filter((value) => /^\s*uses:/.test(value))) {
    assert.match(line, /@[0-9a-f]{40}(?:\s|$)/, `Action is not pinned to a full SHA: ${line.trim()}`);
  }
});

test('model binary, checksum, package verifier, provenance, and notices agree', () => {
  const model = readFileSync(at('assets/models/pose_landmarker_lite.task'));
  const actual = createHash('sha256').update(model).digest('hex');
  const checksumFile = read('assets/models/pose_landmarker_lite.sha256').trim().split(/\s+/)[0];
  assert.equal(actual, checksumFile);
  assert.match(actual, /^[0-9a-f]{64}$/);
  assert.ok(read('assets/models/README.md').includes(actual));
  assert.ok(read('docs/model.md').includes(actual));
  assert.ok(read('package.json').includes(actual));
  assert.match(read('assets/models/README.md'), /Source: `https:\/\/storage\.googleapis\.com\/mediapipe-models\//);
  assert.match(read('THIRD_PARTY_NOTICES.md'), /Pose Landmarker Lite model/);
  assert.match(read('THIRD_PARTY_NOTICES.md'), /Apache License 2\.0/);
});
