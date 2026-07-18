const path = require('node:path');
const { execFileSync } = require('node:child_process');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const rules = require('./webpack.rules');

function buildCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'uncommitted';
  } catch {
    return 'uncommitted';
  }
}

const outputRoot = path.resolve(__dirname, '.webpack', 'build');
const mainOutput = path.resolve(__dirname, '.webpack', 'main');
const common = {
  mode: 'production',
  module: { rules },
  resolve: { extensions: ['.js', '.ts'] },
  performance: { hints: false },
  ignoreWarnings: [
    { module: /@mediapipe\/tasks-vision\/vision_bundle\.mjs/, message: /Critical dependency/ },
  ],
};

module.exports = [
  {
    ...common,
    name: 'main',
    entry: './src/main/index.ts',
    target: 'electron-main',
    output: { path: mainOutput, filename: 'index.js' },
    plugins: [
      new webpack.DefinePlugin({
        OPEN_POSTURE_BUILD_COMMIT: JSON.stringify(buildCommit()),
      }),
    ],
  },
  {
    ...common,
    name: 'preload',
    entry: './src/preload/index.ts',
    target: 'electron-preload',
    output: { path: path.join(outputRoot, 'preload'), filename: 'index.js' },
  },
  {
    ...common,
    name: 'renderer',
    entry: './src/renderer/index.ts',
    target: 'web',
    output: { path: path.join(outputRoot, 'renderer'), filename: 'index.js' },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/renderer/index.html',
        filename: 'index.html',
      }),
    ],
  },
];
