import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const SOURCE_DIR = new URL('../src/', import.meta.url);
const LOGIC_MODULES = [
  'demo.js',
  'i18n.js',
  'instruments.js',
  'keyboard.js',
  'learn.js',
  'melodies.js',
  'music.js',
  'piano.js',
  'player.js',
  'recorder.js',
  'tracker.js',
];

const read = (file) => readFileSync(new URL(file, SOURCE_DIR), 'utf8');

test('logic modules use no browser globals and no unseeded randomness', () => {
  for (const file of LOGIC_MODULES) {
    assert.doesNotMatch(read(file), /\b(window|document|localStorage|navigator|AudioContext)\b|Math\.random/, file);
  }
});

test('no source module uses eval, the Function constructor or console.log', () => {
  const files = readdirSync(SOURCE_DIR).filter((file) => file.endsWith('.js'));
  assert.ok(files.length >= LOGIC_MODULES.length);
  for (const file of files) {
    assert.doesNotMatch(read(file), /\beval\s*\(|new Function\s*\(|console\.log/, file);
  }
});

test('no source module builds markup from strings', () => {
  for (const file of readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.js'))) {
    assert.doesNotMatch(read(file), /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/, file);
  }
});

test('only the storage helper touches localStorage', () => {
  for (const file of readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.js') && name !== 'storage.js')) {
    assert.doesNotMatch(read(file), /localStorage|sessionStorage/, file);
  }
});
