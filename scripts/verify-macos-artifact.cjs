#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { basename, extname, join, resolve } = require('node:path');

const HELP = `Usage: node scripts/verify-macos-artifact.cjs <app-or-dmg> [--arch arm64|x64] [--release]

Checks bundle metadata, packaged resources, Electron fuses, architecture, and code-signing integrity.
Unsigned and ad-hoc signatures are accepted by default. --release requires a hardened,
Developer ID-signed, notarized, and stapled application inside a notarized and stapled final DMG.`;

function fail(message) {
  throw new Error(`macOS artifact verification failed: ${message}`);
}

function parseArguments(argv) {
  const options = { artifact: '', arch: '', release: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--release') options.release = true;
    else if (argument === '--arch') options.arch = argv[++index] ?? '';
    else if (argument.startsWith('--arch=')) options.arch = argument.slice('--arch='.length);
    else if (argument.startsWith('-')) fail(`unknown option ${argument}`);
    else if (!options.artifact) options.artifact = argument;
    else fail(`unexpected argument ${argument}`);
  }
  if (!options.artifact) fail('provide an .app bundle or .dmg image');
  if (options.arch && !['arm64', 'x64'].includes(options.arch)) fail('--arch must be arm64 or x64');
  return options;
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
  const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.status !== 0) fail(`${commandName} ${args.join(' ')}: ${result.error?.message ?? detail}`);
  return detail;
}

function plistValue(plist, key, required = true) {
  const result = spawnSync('plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' });
  if (result.status === 0) return result.stdout.trim();
  if (!required) return '';
  fail(`Info.plist is missing ${key}`);
}

function appsBelow(directory) {
  const matches = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = join(directory, entry.name);
    if (entry.isDirectory() && entry.name.endsWith('.app')) matches.push(child);
    else if (entry.isDirectory()) matches.push(...appsBelow(child));
  }
  return matches;
}

function mountedApplication(dmg) {
  const mountPoint = mkdtempSync(join(tmpdir(), 'open-posture-dmg-'));
  command('hdiutil', ['verify', dmg]);
  command('hdiutil', ['attach', dmg, '-readonly', '-nobrowse', '-mountpoint', mountPoint]);
  const applications = appsBelow(mountPoint);
  if (applications.length !== 1) {
    command('hdiutil', ['detach', mountPoint]);
    rmSync(mountPoint, { recursive: true, force: true });
    fail(`expected one application in ${basename(dmg)}, found ${applications.length}`);
  }
  return {
    app: applications[0],
    cleanup() {
      command('hdiutil', ['detach', mountPoint]);
      rmSync(mountPoint, { recursive: true, force: true });
    },
  };
}

function resolveApplication(artifact) {
  const absolute = resolve(artifact);
  if (!existsSync(absolute)) fail(`artifact does not exist: ${absolute}`);
  if (absolute.endsWith('.app') && statSync(absolute).isDirectory()) return { app: absolute, cleanup() {} };
  if (absolute.endsWith('.dmg') && statSync(absolute).isFile()) return mountedApplication(absolute);
  if (statSync(absolute).isDirectory()) {
    const applications = appsBelow(absolute);
    if (applications.length === 1) return { app: applications[0], cleanup() {} };
    fail(`expected one application below ${absolute}, found ${applications.length}`);
  }
  fail('artifact must be an .app bundle, .dmg image, or directory containing one application');
}

function assertMetadata(app) {
  const plist = join(app, 'Contents', 'Info.plist');
  if (!existsSync(plist)) fail('bundle has no Contents/Info.plist');
  const metadata = JSON.parse(command('plutil', ['-convert', 'json', '-o', '-', plist]));
  const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
  const expected = {
    CFBundleIdentifier: 'io.openposture.app',
    CFBundleName: 'Open Posture',
    CFBundleDisplayName: 'Open Posture',
    CFBundlePackageType: 'APPL',
    CFBundleShortVersionString: packageJson.version,
  };
  for (const [key, value] of Object.entries(expected)) {
    const actual = plistValue(plist, key);
    if (actual !== value) fail(`${key} is ${JSON.stringify(actual)}, expected ${JSON.stringify(value)}`);
  }
  if (!/camera|posture/i.test(plistValue(plist, 'NSCameraUsageDescription'))) {
    fail('NSCameraUsageDescription must explain camera use');
  }
  const extraUsageDescriptions = Object.keys(metadata).filter(
    (key) => key.endsWith('UsageDescription') && key !== 'NSCameraUsageDescription',
  );
  if (extraUsageDescriptions.length) fail(`unexpected privacy permissions: ${extraUsageDescriptions.join(', ')}`);
  if (metadata.NSAppTransportSecurity?.NSAllowsArbitraryLoads === true) fail('NSAllowsArbitraryLoads must not be enabled');
  for (const helper of appsBelow(app)) {
    const helperPlist = join(helper, 'Contents', 'Info.plist');
    if (!existsSync(helperPlist)) fail(`${basename(helper)} has no Info.plist`);
    const helperMetadata = JSON.parse(command('plutil', ['-convert', 'json', '-o', '-', helperPlist]));
    const helperPermissions = Object.keys(helperMetadata).filter(
      (key) => key.endsWith('UsageDescription') && key !== 'NSCameraUsageDescription',
    );
    if (helperPermissions.length) fail(`${basename(helper)} has unexpected privacy permissions: ${helperPermissions.join(', ')}`);
    if (helperMetadata.NSAppTransportSecurity?.NSAllowsArbitraryLoads === true) {
      fail(`${basename(helper)} enables NSAllowsArbitraryLoads`);
    }
  }
  const minimum = plistValue(plist, 'LSMinimumSystemVersion');
  if (minimum.localeCompare('13.0', undefined, { numeric: true }) < 0) fail(`LSMinimumSystemVersion ${minimum} is below 13.0`);
}

function assertArchitecture(app, expectedArchitecture) {
  if (!expectedArchitecture) return;
  const executable = join(app, 'Contents', 'MacOS', 'Open Posture');
  if (!existsSync(executable)) fail('bundle executable is missing');
  const expected = expectedArchitecture === 'x64' ? 'x86_64' : expectedArchitecture;
  const actual = command('lipo', ['-archs', executable]).split(/\s+/).filter(Boolean);
  if (actual.length !== 1 || actual[0] !== expected) fail(`executable architecture is ${actual.join(', ')}, expected ${expected}`);
}

function assertResources(app) {
  const archive = join(app, 'Contents', 'Resources', 'app.asar');
  if (!existsSync(archive) || statSync(archive).size < 100_000) fail('Contents/Resources/app.asar is missing or unexpectedly small');
  let listPackage;
  try {
    ({ listPackage } = require('@electron/asar'));
  } catch {
    fail('@electron/asar is required to inspect the packaged application');
  }
  const entries = listPackage(archive).map((entry) => entry.replaceAll('\\', '/'));
  for (const required of [
    '/package.json',
    '/LICENSE',
    '/NOTICE',
    '/THIRD_PARTY_NOTICES.md',
    '/.webpack/main/index.js',
    '/.webpack/build/preload/index.js',
    '/.webpack/build/renderer/index.html',
    '/.webpack/build/renderer/index.js',
  ]) {
    if (!entries.includes(required)) fail(`app.asar is missing ${required}`);
  }
  if (!entries.some((entry) => /^\/\.webpack\/build\/renderer\/[^/]+\.task$/.test(entry))) fail('app.asar has no packaged pose model');
  if (!entries.some((entry) => /^\/\.webpack\/build\/renderer\/[^/]+\.wasm$/.test(entry))) fail('app.asar has no packaged MediaPipe WASM');

  const sourceMaterial = entries.filter((entry) => /^\/(?:src|tests|docs|node_modules|\.git)(?:\/|$)/.test(entry));
  if (sourceMaterial.length) fail(`app.asar contains non-runtime source material: ${sourceMaterial.slice(0, 3).join(', ')}`);
  const sourceMaps = entries.filter((entry) => entry.endsWith('.map'));
  if (sourceMaps.length) fail(`app.asar contains source maps: ${sourceMaps.slice(0, 3).join(', ')}`);
  const captures = entries.filter((entry) => /\.(?:mov|mp4|m4v|avi|mkv|webm|yuv|nv12|rgba?|heic|heif)$/i.test(extname(entry)));
  if (captures.length) fail(`app.asar contains prohibited capture-like media: ${captures.slice(0, 3).join(', ')}`);
}

function assertFuses(app) {
  const cli = join(__dirname, '..', 'node_modules', '@electron', 'fuses', 'dist', 'bin.js');
  if (!existsSync(cli)) fail('@electron/fuses is required to inspect the packaged executable');
  const output = command(process.execPath, [cli, 'read', '--app', app]);
  for (const expected of [
    'RunAsNode is Disabled',
    'EnableCookieEncryption is Enabled',
    'EnableNodeOptionsEnvironmentVariable is Disabled',
    'EnableNodeCliInspectArguments is Disabled',
    'EnableEmbeddedAsarIntegrityValidation is Enabled',
    'OnlyLoadAppFromAsar is Enabled',
    'GrantFileProtocolExtraPrivileges is Disabled',
  ]) {
    if (!output.includes(expected)) fail(`unexpected Electron fuse state: ${expected}`);
  }
}

function assertReleaseEntitlements(app) {
  const directory = mkdtempSync(join(tmpdir(), 'open-posture-entitlements-'));
  const output = join(directory, 'effective.plist');
  try {
    const result = spawnSync('codesign', ['--display', '--xml', '--entitlements', '-', app], { encoding: 'utf8' });
    if (result.status !== 0 || !result.stdout.trim()) {
      fail(`could not read effective release entitlements: ${`${result.stdout}${result.stderr}`.trim()}`);
    }
    writeFileSync(output, result.stdout, { mode: 0o600 });
    const entitlements = JSON.parse(command('plutil', ['-convert', 'json', '-o', '-', output]));
    const required = [
      'com.apple.security.cs.allow-jit',
      'com.apple.security.device.camera',
    ];
    for (const key of required) {
      if (entitlements[key] !== true) fail(`release entitlement ${key} must be true`);
    }

    const forbidden = Object.keys(entitlements).filter((key) =>
      key === 'com.apple.security.get-task-allow' ||
      key === 'com.apple.security.device.audio-input' ||
      key === 'com.apple.security.device.microphone' ||
      key.startsWith('com.apple.security.network.') ||
      key.startsWith('com.apple.security.automation.') ||
      key.startsWith('com.apple.security.personal-information.') ||
      key.startsWith('com.apple.security.accessibility') ||
      key.startsWith('com.apple.security.files.') ||
      (key.startsWith('com.apple.security.device.') && key !== 'com.apple.security.device.camera'),
    );
    if (forbidden.length) fail(`release has prohibited entitlements: ${forbidden.join(', ')}`);

    const unexpected = Object.keys(entitlements).filter((key) => !required.includes(key));
    if (unexpected.length) fail(`release has unapproved entitlements: ${unexpected.join(', ')}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function assertSignature(app, release) {
  const display = spawnSync('codesign', ['--display', '--verbose=4', app], { encoding: 'utf8' });
  const details = `${display.stdout}${display.stderr}`;
  if (display.status !== 0) {
    if (release) fail('release bundle is unsigned');
    if (!/not signed at all/i.test(details)) fail(`codesign could not inspect bundle: ${details.trim()}`);
    console.log('Signature: unsigned (accepted for local/manual artifacts)');
    return;
  }

  command('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  const developerId = /^Authority=Developer ID Application:/m.test(details);
  const adHoc = /^Signature=adhoc$/m.test(details);
  console.log(`Signature: ${developerId ? 'Developer ID Application' : adHoc ? 'ad-hoc' : 'non-Developer ID'}`);
  if (!release) return;

  if (!developerId) fail('release bundle is not signed with Developer ID Application');
  if (!/^TeamIdentifier=(?!not set$).+/m.test(details)) fail('release bundle has no signing team identifier');
  if (!/^CodeDirectory .*flags=.*\bruntime\b/m.test(details)) fail('release bundle does not use the hardened runtime');
  assertReleaseEntitlements(app);
  const assessment = command('spctl', ['--assess', '--type', 'execute', '--verbose=4', app]);
  if (!/source=Notarized Developer ID/i.test(assessment)) fail(`Gatekeeper did not report a notarized Developer ID: ${assessment}`);
  command('xcrun', ['stapler', 'validate', app]);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }
  if (process.platform !== 'darwin') fail('this verifier must run on macOS');
  const artifact = resolve(options.artifact);
  if (!existsSync(artifact)) fail(`artifact does not exist: ${artifact}`);
  if (options.release) {
    if (!artifact.endsWith('.dmg')) fail('--release requires the final .dmg, not an unpackaged application');
    command('xcrun', ['stapler', 'validate', artifact]);
  }
  const mounted = resolveApplication(artifact);
  try {
    assertMetadata(mounted.app);
    assertArchitecture(mounted.app, options.arch);
    assertResources(mounted.app);
    assertFuses(mounted.app);
    assertSignature(mounted.app, options.release);
    console.log(`Verified ${basename(mounted.app)}${options.release ? ' for signed release' : ' for local distribution'}.`);
  } finally {
    mounted.cleanup();
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
