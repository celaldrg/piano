import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LANGUAGES,
  STRINGS,
  formatClock,
  formatHz,
  formatPercent,
  normalizeLanguage,
  noteLabel,
  plural,
  spokenNoteLabel,
  translate,
} from '../src/i18n.js';
import { INSTRUMENTS } from '../src/instruments.js';
import { MELODIES } from '../src/melodies.js';

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const hasKey = (language, key) => key in STRINGS[language] || `${key}.one` in STRINGS[language];

test('both languages have the same keys and placeholders and no empty strings', () => {
  assert.deepEqual(LANGUAGES, ['en', 'tr']);
  assert.deepEqual(Object.keys(STRINGS.tr).sort(), Object.keys(STRINGS.en).sort());
  for (const [key, english] of Object.entries(STRINGS.en)) {
    assert.ok(english.trim() && STRINGS.tr[key].trim(), key);
    assert.deepEqual(placeholders(STRINGS.tr[key]), placeholders(english), key);
  }
});

test('every Turkish string is translated', () => {
  const sameInBothLanguages = ['readout.hz'];
  for (const [key, english] of Object.entries(STRINGS.en)) {
    if (!sameInBothLanguages.includes(key)) assert.notEqual(STRINGS.tr[key], english, key);
  }
  assert.equal(STRINGS.en['lang.button'], 'TR', 'the toggle names the other language');
  assert.equal(STRINGS.tr['lang.button'], 'EN');
});

test('every instrument and melody has a display name in both languages', () => {
  for (const language of LANGUAGES) {
    for (const { id } of INSTRUMENTS) assert.ok(hasKey(language, `instrument.${id}`), `${language} instrument.${id}`);
    for (const { id } of MELODIES) assert.ok(hasKey(language, `melody.${id}`), `${language} melody.${id}`);
  }
});

test('every key used by the page and the UI code exists', () => {
  const html = read('../index.html');
  const htmlKeys = [...html.matchAll(/data-i18n(?:-label)?="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(htmlKeys.length >= 20, 'the page marks its strings');
  const code = ['main.js', 'takes-view.js'].map((file) => read(`../src/${file}`)).join('\n');
  const codeKeys = [...code.matchAll(/'((?:rec|take|mel|learn|readout|app)\.[\w.]+)'/g)].map((match) => match[1]);
  assert.ok(codeKeys.length >= 15, 'the UI code uses translated strings');
  for (const key of [...htmlKeys, ...codeKeys]) {
    for (const language of LANGUAGES) assert.ok(hasKey(language, key), `${language}: ${key}`);
  }
});

test('translate fills placeholders and falls back to English, then to the key', () => {
  assert.equal(translate('en', 'take.name', { id: 3 }), 'Take 3');
  assert.equal(translate('tr', 'take.name', { id: 3 }), 'Kayıt 3');
  assert.equal(translate('tr', 'learn.next', {}), 'Sıradaki tuş: {note}', 'a missing value keeps its placeholder');
  assert.equal(translate('de', 'rec.play'), 'Play', 'unknown languages use English');
  assert.equal(translate('en', 'no.such.key'), 'no.such.key');
  assert.equal(normalizeLanguage('tr'), 'tr');
  assert.equal(normalizeLanguage(null), 'en');
});

test('plural picks the form for one or many', () => {
  assert.equal(plural('en', 'take.notes', 1), '1 note');
  assert.equal(plural('en', 'take.notes', 14), '14 notes');
  assert.equal(plural('en', 'rec.saved', 2), '2 takes saved in this browser.');
  assert.equal(plural('tr', 'take.notes', 14), '14 nota');
});

test('note names use letters in English and do-re-mi in Turkish', () => {
  assert.equal(noteLabel(60, 'en'), 'C4');
  assert.equal(noteLabel(61, 'en'), 'C#4');
  assert.equal(noteLabel(60, 'tr'), 'Do4');
  assert.equal(noteLabel(67, 'tr'), 'Sol4');
  assert.equal(noteLabel(70, 'tr'), 'La#4');
  assert.equal(noteLabel(71, 'tr'), 'Si4');
  assert.equal(noteLabel(36, 'tr'), 'Do2');
  assert.throws(() => noteLabel(128, 'tr'), RangeError);
});

test('screen readers hear a sharp as a word in either language', () => {
  assert.equal(spokenNoteLabel(61, 'en'), 'C sharp 4');
  assert.equal(spokenNoteLabel(70, 'tr'), 'La diyez 4');
  assert.equal(spokenNoteLabel(60, 'en'), 'C4');
  assert.equal(spokenNoteLabel(67, 'tr'), 'Sol4');
});

test('numbers and times follow the language', () => {
  assert.equal(formatHz(261.6256, 'en'), '261.63');
  assert.equal(formatHz(261.6256, 'tr'), '261,63');
  assert.equal(formatHz(440, 'en'), '440.00');
  assert.equal(formatPercent(0.8, 'en'), '80%');
  assert.equal(formatPercent(0.8, 'tr'), '%80');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(9875), '0:10');
  assert.equal(formatClock(65400), '1:05');
});
