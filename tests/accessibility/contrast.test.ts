import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/../g)?.map((value) => Number.parseInt(value, 16) / 255);
  assert.ok(channels && channels.length === 3, `Invalid color ${hex}`);
  const [red, green, blue] = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const source = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8');

test('core light and dark text pairs meet WCAG AA normal-text contrast', () => {
  const requiredPairs = [
    ['#617069', '#f5f3ec', 'light muted on paper'],
    ['#225f4a', '#ffffff', 'light primary on white'],
    ['#ffffff', '#225f4a', 'light primary button'],
    ['#aebdb5', '#111914', 'dark muted on paper'],
    ['#a0ddc5', '#26332d', 'dark primary on control'],
    ['#9fc9dd', '#203742', 'dark informational notice'],
    ['#f0b56d', '#3e2c1a', 'dark warning notice'],
    ['#e18880', '#432522', 'dark danger notice'],
    ['#edf5f0', '#111914', 'dark text on paper'],
    ['#111914', '#73c9a8', 'dark primary button'],
    ['#111914', '#e18880', 'dark danger button'],
  ] as const;

  for (const [foreground, background, label] of requiredPairs) {
    const hasColor = (color: string): boolean => source.includes(color) || (color === '#ffffff' && /\bwhite\b|#fff(?:\W|$)/i.test(source));
    assert.ok(hasColor(foreground) && hasColor(background), `${label} tokens missing from CSS`);
    assert.ok(contrast(foreground, background) >= 4.5, `${label} is below 4.5:1`);
  }
});
