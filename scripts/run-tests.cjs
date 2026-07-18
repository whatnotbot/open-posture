const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? collect(child) : child.endsWith('.test.ts') ? [child] : [];
  });
}

const tests = [...collect('src'), ...collect('tests')]
  .filter((file) => !file.split(path.sep).includes('smoke'))
  .sort();
const result = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--test', '--experimental-strip-types', ...tests], { stdio: 'inherit' });
process.exit(result.status ?? 1);
