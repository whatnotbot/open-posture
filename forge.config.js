const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const { version } = require('./package.json');

const root = __dirname;
const macIcon = path.join(root, 'assets', 'packaging', 'OpenPosture.icns');
const entitlements = path.join(root, 'assets', 'packaging', 'entitlements.mac.plist');
const signingIdentity = process.env.MACOS_SIGN_IDENTITY;
const notarizationValues = [
  process.env.APPLE_API_KEY,
  process.env.APPLE_API_KEY_ID,
  process.env.APPLE_API_ISSUER,
];
const wantsNotarization = notarizationValues.some(Boolean);

if (wantsNotarization && (!signingIdentity || !notarizationValues.every(Boolean))) {
  throw new Error(
    'Notarization requires MACOS_SIGN_IDENTITY, APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER.',
  );
}

function ignoreFromPackage(candidate) {
  if (path.resolve(candidate) === root) return false;
  const relative = path.relative(root, candidate);
  const normalized = (
    relative && !relative.startsWith('..') && !path.isAbsolute(relative)
      ? relative
      : candidate.replace(/^[/\\]+/, '')
  )
    .split(path.sep)
    .join('/');
  if (normalized.endsWith('.map')) return true;
  if (
    normalized === '.webpack/build/main' ||
    normalized.startsWith('.webpack/build/main/')
  ) {
    return true;
  }
  return !(
    normalized === 'package.json' ||
    normalized === 'LICENSE' ||
    normalized === 'NOTICE' ||
    normalized === 'THIRD_PARTY_NOTICES.md' ||
    normalized === '.webpack' ||
    normalized === '.webpack/main' ||
    normalized.startsWith('.webpack/main/') ||
    normalized === '.webpack/build' ||
    normalized.startsWith('.webpack/build/') ||
    normalized === 'assets' ||
    normalized === 'assets/icons' ||
    normalized.startsWith('assets/icons/')
  );
}

const packagerConfig = {
  name: 'Open Posture',
  executableName: 'Open Posture',
  appBundleId: 'io.openposture.app',
  appCategoryType: 'public.app-category.healthcare-fitness',
  appCopyright: 'Copyright © 2026 Open Posture contributors',
  asar: true,
  icon: macIcon,
  ignore: ignoreFromPackage,
  extraResource: [
    path.join(root, 'LICENSE'),
    path.join(root, 'NOTICE'),
    path.join(root, 'THIRD_PARTY_NOTICES.md'),
  ],
  afterCopyExtraResources: [
    (stagingPath, _electronVersion, platform, _arch, callback) => {
      try {
        if (platform === 'darwin') {
          const appPath = path.join(stagingPath, 'Open Posture.app');
          const pending = [appPath];
          while (pending.length) {
            const current = pending.pop();
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
              const candidate = path.join(current, entry.name);
              if (entry.isDirectory()) {
                pending.push(candidate);
              } else if (entry.name === 'Info.plist') {
                const info = JSON.parse(
                  execFileSync(
                    '/usr/bin/plutil',
                    ['-convert', 'json', '-o', '-', candidate],
                    { encoding: 'utf8' },
                  ),
                );
                for (const key of Object.keys(info)) {
                  if (
                    /^NS.*UsageDescription$/.test(key) &&
                    key !== 'NSCameraUsageDescription'
                  ) {
                    execFileSync('/usr/libexec/PlistBuddy', [
                      '-c',
                      `Delete :${key}`,
                      candidate,
                    ]);
                  }
                }
              }
            }
          }
        }
        callback();
      } catch (error) {
        callback(error);
      }
    },
  ],
  usageDescription: {
    Camera:
      'Open Posture uses video from your camera on this device to compare your posture with your private calibration. Video is not recorded or uploaded.',
  },
  extendInfo: {
    LSMinimumSystemVersion: '13.0',
    NSAppTransportSecurity: {
      NSAllowsArbitraryLoads: false,
    },
    NSSupportsAutomaticGraphicsSwitching: true,
  },
};

if (signingIdentity) {
  packagerConfig.osxSign = {
    identity: signingIdentity,
    optionsForFile: () => ({
      entitlements,
      hardenedRuntime: true,
    }),
  };
}

if (wantsNotarization) {
  packagerConfig.osxNotarize = {
    appleApiKey: process.env.APPLE_API_KEY,
    appleApiKeyId: process.env.APPLE_API_KEY_ID,
    appleApiIssuer: process.env.APPLE_API_ISSUER,
  };
}

module.exports = {
  packagerConfig,
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: (arch) => ({
        icon: macIcon,
        name: `Open Posture-${version}-${arch}`,
        overwrite: true,
      }),
    },
  ],
  hooks: {
    prePackage: async () => {
      execFileSync(
        process.execPath,
        [
          path.join(root, 'node_modules', 'webpack-cli', 'bin', 'cli.js'),
          '--mode',
          'production',
          '--config',
          path.join(root, 'webpack.build.config.js'),
        ],
        { cwd: root, stdio: 'inherit' },
      );
    },
    postPackage: async (_forgeConfig, result) => {
      if (result.platform !== 'darwin' || signingIdentity) return;
      for (const outputPath of result.outputPaths) {
        execFileSync(
          '/usr/bin/codesign',
          ['--force', '--deep', '--sign', '-', path.join(outputPath, 'Open Posture.app')],
          { stdio: 'inherit' },
        );
      }
    },
  },
};
