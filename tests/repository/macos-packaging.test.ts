import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

test('macOS artifact verifier exposes a portable help contract and release checks', () => {
  const verifierPath = join(ROOT, 'scripts', 'verify-macos-artifact.cjs');
  assert.ok(existsSync(verifierPath));
  const help = spawnSync(process.execPath, [verifierPath, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /<app-or-dmg>/);
  assert.match(help.stdout, /--arch arm64\|x64/);
  assert.match(help.stdout, /--release/);
  assert.match(help.stdout, /final DMG/);

  const verifier = read('scripts/verify-macos-artifact.cjs');
  for (const metadata of ['CFBundleIdentifier', 'CFBundleShortVersionString', 'NSCameraUsageDescription', 'LSMinimumSystemVersion', 'NSAllowsArbitraryLoads']) {
    assert.ok(verifier.includes(metadata), `Verifier does not inspect ${metadata}`);
  }
  for (const packagedFile of ['/LICENSE', '/NOTICE', '/THIRD_PARTY_NOTICES.md']) assert.ok(verifier.includes(packagedFile));
  assert.match(verifier, /node_modules/);
  assert.match(verifier, /source maps/);
  for (const command of ['codesign', 'spctl', 'stapler', 'hdiutil', 'lipo']) {
    assert.match(verifier, new RegExp(`['"]${command}['"]`), `Verifier does not use ${command}`);
  }
  assert.match(verifier, /Developer ID Application/);
  assert.match(verifier, /source=Notarized Developer ID/);
  assert.match(verifier, /'--xml', '--entitlements', '-'/);
  for (const entitlement of [
    'com.apple.security.cs.allow-jit',
    'com.apple.security.device.camera',
    'com.apple.security.get-task-allow',
    'com.apple.security.device.audio-input',
    'com.apple.security.network.',
    'com.apple.security.automation.',
    'com.apple.security.personal-information.',
    'com.apple.security.accessibility',
    'com.apple.security.files.',
  ]) assert.ok(verifier.includes(entitlement), `Verifier does not gate ${entitlement}`);
  assert.match(verifier, /release has unapproved entitlements/);
  assert.match(verifier, /\.task/);
  assert.match(verifier, /\.wasm/);
  assert.match(verifier, /mov\|mp4/);
});

test('macOS release workflow builds both architectures and isolates release secrets', () => {
  const workflow = read('.github/workflows/release-macos.yml');
  for (const value of [
    'workflow_dispatch:',
    'macos-15',
    'macos-15-intel',
    'node-version: 24.14.0',
    'npm@11.18.0',
    'npm ci',
    'npm run check',
    'npm run test:smoke',
    'make:mac:arm64',
    'make:mac:x64',
    'verify-macos-artifact.cjs',
    '--release',
    'actions/upload-artifact',
  ]) assert.ok(workflow.includes(value), `Workflow is missing ${value}`);

  assert.match(workflow, /push:\s*\n\s*tags:/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /if: github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.match(workflow, /environment: macos-release/);
  assert.match(workflow, /MACOS_CERTIFICATE: \$\{\{ secrets\.MACOS_CERTIFICATE \}\}/);
  assert.match(workflow, /APPLE_API_PRIVATE_KEY: \$\{\{ secrets\.APPLE_API_PRIVATE_KEY \}\}/);
  assert.match(workflow, /notarytool submit "\$DMG_PATH"/);
  assert.match(workflow, /stapler staple "\$DMG_PATH"/);
  assert.match(workflow, /stapler validate "\$DMG_PATH"/);
  assert.match(workflow, /chmod 600 "\$CERTIFICATE_PATH" "\$API_KEY_PATH"/);
  assert.match(workflow, /rm -f "\$RUNNER_TEMP\/open-posture-developer-id\.p12" "\$RUNNER_TEMP\/AuthKey_\$\{APPLE_API_KEY_ID\}\.p8"/);
  assert.match(workflow, /Remove temporary signing material\s*\n\s*if: always\(\)/);
  assert.doesNotMatch(workflow.split(/^  signed_release:/m)[0] ?? '', /secrets\./, 'Unsigned job must not receive signing secrets');

  for (const line of workflow.split('\n').filter((value) => /^\s*uses:/.test(value))) {
    assert.match(line, /@[0-9a-f]{40}(?:\s|$)/, `Action is not pinned to a full SHA: ${line.trim()}`);
  }
});
