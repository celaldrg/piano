import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HIGHEST_MIDI,
  KEY_BINDINGS,
  LOWEST_MIDI,
  canShiftOctave,
  createKeyboard,
  ensureVisible,
  keyboardRange,
  midiForCode,
  shiftOctave,
  visibleKeys,
} from '../src/keyboard.js';

test('the computer-key mapping covers two octaves without duplicates', () => {
  const codes = KEY_BINDINGS.map((bound) => bound.code);
  const offsets = KEY_BINDINGS.map((bound) => bound.offset);
  assert.equal(new Set(codes).size, codes.length, 'no key is bound twice');
  assert.equal(new Set(offsets).size, offsets.length, 'no note has two keys');
  for (let offset = 0; offset < 24; offset += 1) assert.ok(offsets.includes(offset), `semitone ${offset} is bound`);
  assert.deepEqual(
    offsets.filter((offset) => offset >= 24),
    [24, 26, 28],
  );
  assert.equal(KEY_BINDINGS.map((bound) => bound.label).join(' '), 'Z S X D C V G B H N J M Q 2 W 3 E R 5 T 6 Y 7 U I O P');
});

test('the lower row plays the base octave and the upper row the next one', () => {
  const expected = { KeyZ: 48, KeyS: 49, KeyM: 59, KeyQ: 60, Digit2: 61, KeyU: 71, KeyI: 72, KeyO: 74, KeyP: 76 };
  for (const [code, midi] of Object.entries(expected)) assert.equal(midiForCode(code, 3), midi, code);
  assert.equal(midiForCode('KeyA', 3), null);
  assert.equal(midiForCode('Space', 3), null);
});

test('computer keys never play outside C2..C7', () => {
  assert.equal(midiForCode('KeyZ', 2), LOWEST_MIDI);
  assert.equal(midiForCode('KeyI', 5), HIGHEST_MIDI);
  assert.equal(midiForCode('KeyO', 5), null);
  assert.equal(midiForCode('KeyP', 5), null);
  assert.equal(midiForCode('KeyZ', 1), null);
});

test('a new keyboard centres middle C', () => {
  assert.deepEqual(createKeyboard(), { baseOctave: 3, octaves: 2 });
  assert.deepEqual(keyboardRange(createKeyboard()), { low: 48, high: 76 }, 'C3..E5: up to the P key');
  assert.deepEqual(createKeyboard({ octaves: 1 }), { baseOctave: 4, octaves: 1 });
  assert.deepEqual(keyboardRange(createKeyboard({ octaves: 1 })), { low: 60, high: 72 });
});

test('the keys above the top C never go past C7', () => {
  assert.deepEqual(keyboardRange({ baseOctave: 4, octaves: 2 }), { low: 60, high: 88 });
  assert.deepEqual(keyboardRange({ baseOctave: 5, octaves: 2 }), { low: 72, high: HIGHEST_MIDI });
  assert.deepEqual(keyboardRange({ baseOctave: 2, octaves: 3 }), { low: LOWEST_MIDI, high: 72 });
  const top = visibleKeys({ baseOctave: 5, octaves: 2 });
  assert.equal(top.length, 25);
  assert.equal(top[top.length - 1].name, 'C7');
});

test('octave shifts stay inside C2..C7', () => {
  const lowest = shiftOctave(createKeyboard(), -10);
  const highest = shiftOctave(createKeyboard(), 10);
  assert.equal(keyboardRange(lowest).low, LOWEST_MIDI);
  assert.equal(keyboardRange(highest).high, HIGHEST_MIDI);
  assert.equal(shiftOctave(createKeyboard(), 1).baseOctave, 4);
  assert.equal(canShiftOctave(lowest, -1), false);
  assert.equal(canShiftOctave(lowest, 1), true);
  assert.equal(canShiftOctave(highest, 1), false);
  assert.equal(keyboardRange(shiftOctave(createKeyboard({ octaves: 1 }), 10)).high, HIGHEST_MIDI);
  assert.deepEqual(createKeyboard({ octaves: 9, baseOctave: 0 }), { baseOctave: 2, octaves: 5 });
});

test('two visible octaves show 29 keys from C3 to E5, one for every computer key', () => {
  const keys = visibleKeys(createKeyboard());
  assert.equal(keys.length, 29);
  assert.equal(keys.filter((key) => !key.black).length, 17);
  assert.deepEqual(
    [keys[0], keys[12], keys[24], keys[28]].map((key) => key.name),
    ['C3', 'C4', 'C5', 'E5'],
  );
  assert.deepEqual(
    [keys[0], keys[1], keys[11], keys[12], keys[24], keys[26], keys[28]].map((key) => key.label),
    ['Z', 'S', 'M', 'Q', 'I', 'O', 'P'],
  );
  assert.deepEqual(
    keys.filter((key) => key.label).map((key) => key.label),
    KEY_BINDINGS.map((bound) => bound.label),
    'every computer key has its key on screen',
  );
  assert.deepEqual(keys[1], { midi: 49, name: 'C#3', black: true, whiteIndex: 0, label: 'S' });
  assert.equal(keys[2].whiteIndex, 1);
  assert.equal(keys[28].whiteIndex, 16);
});

test('labels follow the octave of the computer keys, not the scrolled view', () => {
  const phone = createKeyboard({ octaves: 1, baseOctave: 5 });
  const labels = (keysOctave) => visibleKeys(phone, keysOctave).map((key) => key.label).join(' ');
  assert.equal(labels(5), 'Z S X D C V G B H N J M Q', 'by default the lower row starts the view');
  assert.equal(labels(4), 'Q 2 W 3 E R 5 T 6 Y 7 U I', 'C5 is the Q key when the lower row plays C4');
  const reached = visibleKeys(phone, 3).filter((key) => key.label);
  assert.deepEqual(
    reached.map((key) => `${key.name}=${key.label}`),
    ['C5=I', 'D5=O', 'E5=P'],
    'only the top keys reach two octaves up',
  );
});

test('a phone keyboard shows one octave plus the top C', () => {
  const keys = visibleKeys(createKeyboard({ octaves: 1 }));
  assert.equal(keys.length, 13);
  assert.equal(keys.filter((key) => !key.black).length, 8);
  assert.deepEqual(
    [keys[0], keys[12]].map((key) => key.name),
    ['C4', 'C5'],
  );
  assert.equal(keys[12].label, 'Q');
});

test('ensureVisible moves the keyboard as little as possible', () => {
  const keyboard = createKeyboard({ baseOctave: 4 });
  assert.equal(ensureVisible(keyboard, 64), keyboard, 'E4 is already visible');
  assert.equal(ensureVisible(keyboard, 84, 88), keyboard, 'C6..E6 are visible above the top C');
  assert.equal(ensureVisible(keyboard, 55).baseOctave, 3, 'G3');
  assert.equal(ensureVisible(keyboard, 90).baseOctave, 5, 'F#6');
  assert.equal(ensureVisible(createKeyboard({ baseOctave: 5 }), 55, 69).baseOctave, 3, 'G3..A4');
  const phone = createKeyboard({ octaves: 1, baseOctave: 6 });
  assert.equal(ensureVisible(phone, 55, 67).baseOctave, 3, 'too wide: the low note wins');
});
