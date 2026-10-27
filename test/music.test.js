import test from 'node:test';
import assert from 'node:assert/strict';
import { frequencyToMidi, isBlackKey, midiToFrequency, midiToNoteName, noteNameToMidi, octaveOf } from '../src/music.js';

test('A4 is 440 Hz and A5 is 880 Hz', () => {
  assert.equal(midiToFrequency(69), 440);
  assert.equal(midiToFrequency(noteNameToMidi('A4')), 440);
  assert.equal(midiToFrequency(noteNameToMidi('A5')), 880);
});

test('middle C (C4) is 261.63 Hz to two decimals', () => {
  assert.equal(noteNameToMidi('C4'), 60);
  assert.equal(midiToFrequency(60).toFixed(2), '261.63');
});

test('every semitone step has the ratio 2^(1/12)', () => {
  const ratio = 2 ** (1 / 12);
  for (let midi = 0; midi < 127; midi += 1) {
    const step = midiToFrequency(midi + 1) / midiToFrequency(midi);
    assert.ok(Math.abs(step - ratio) < 1e-9, `MIDI ${midi} -> ${midi + 1}: ${step}`);
  }
});

test('the A4 reference is configurable', () => {
  assert.equal(midiToFrequency(69, 432), 432);
  assert.equal(midiToFrequency(57, 432), 216);
  assert.ok(Math.abs(frequencyToMidi(432, 432) - 69) < 1e-12);
});

test('frequencyToMidi inverts midiToFrequency', () => {
  for (let midi = 0; midi <= 127; midi += 1) {
    assert.ok(Math.abs(frequencyToMidi(midiToFrequency(midi)) - midi) < 1e-9, `MIDI ${midi}`);
  }
  assert.ok(Math.abs(frequencyToMidi(452.893) - 69.5) < 1e-3, 'a quarter tone above A4');
});

test('note names round-trip over the whole MIDI range using sharps', () => {
  for (let midi = 0; midi <= 127; midi += 1) {
    const name = midiToNoteName(midi);
    assert.match(name, /^[A-G]#?(-1|\d)$/);
    assert.equal(noteNameToMidi(name), midi, name);
  }
  assert.equal(midiToNoteName(0), 'C-1');
  assert.equal(midiToNoteName(61), 'C#4');
  assert.equal(midiToNoteName(127), 'G9');
});

test('flats and lower-case names are accepted on input', () => {
  const cases = { Db4: 61, Bb3: 58, eb5: 75, 'f#2': 42, Cb4: 59, 'B#3': 60, 'E#4': 65, Fb4: 64, 'C-1': 0 };
  for (const [name, midi] of Object.entries(cases)) assert.equal(noteNameToMidi(name), midi, name);
});

test('malformed or out-of-range names throw a RangeError', () => {
  for (const name of ['', 'H4', 'C', '4', 'C#', 'Cx4', 'C##4', 'C 4', 'C10', 'G#9', 'Cb-1', undefined]) {
    assert.throws(() => noteNameToMidi(name), RangeError, String(name));
  }
});

test('midiToNoteName rejects values that are not MIDI notes', () => {
  for (const midi of [-1, 128, 60.5, Number.NaN]) assert.throws(() => midiToNoteName(midi), RangeError);
});

test('octaves and black keys follow the piano layout', () => {
  assert.equal(octaveOf(60), 4);
  assert.equal(octaveOf(59), 3);
  assert.equal(octaveOf(0), -1);
  const pattern = Array.from({ length: 12 }, (_, step) => isBlackKey(60 + step));
  assert.deepEqual(pattern, [false, true, false, true, false, false, true, false, true, false, true, false]);
});
