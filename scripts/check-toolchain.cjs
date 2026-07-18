const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
const packageManager = process.env.npm_config_user_agent ?? '';
const npmMajor = /^npm\/(\d+)/.exec(packageManager)?.[1];

if (nodeMajor !== 24 || nodeMinor < 11) {
  console.error(`Open Posture requires Node.js 24.11 or newer within the 24.x line; found ${process.versions.node}.`);
  process.exit(1);
}
if (packageManager && npmMajor !== '11') {
  console.error('Open Posture supports npm 11 only. Run npm ci instead of another package manager.');
  process.exit(1);
}
