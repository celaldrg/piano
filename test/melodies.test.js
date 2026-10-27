import test from 'node:test';
import assert from 'node:assert/strict';
import { HIGHEST_MIDI, LOWEST_MIDI } from '../src/keyboard.js';
import { MELODIES, melodyNotes, parseScore } from '../src/melodies.js';
import { midiToNoteName } from '../src/music.js';

const melody = (id) => MELODIES.find((candidate) => candidate.id === id);
const opening = (id, count) =>
  melodyNotes(melody(id))
    .slice(0, count)
    .map((note) => midiToNoteName(note.midi));

test('three public-domain melodies are built in', () => {
  assert.deepEqual(
    MELODIES.map((candidate) => candidate.id),
    ['ode', 'twinkle', 'frere'],
  );
});

test('each melody opens with its well-known phrase', () => {
  assert.deepEqual(opening('ode', 8), ['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4']);
  assert.deepEqual(opening('twinkle', 7), ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4']);
  assert.deepEqual(opening('frere', 8), ['C4', 'D4', 'E4', 'C4', 'C4', 'D4', 'E4', 'C4']);
});

test('every bar of every melody holds four beats', () => {
  const barCounts = { ode: 16, twinkle: 12, frere: 8 };
  for (const { id, score } of MELODIES) {
    const bars = parseScore(score);
    assert.equal(bars.length, barCounts[id], `${id} bar count`);
    bars.forEach((bar, index) => {
      const beats = bar.reduce((sum, note) => sum + note.beats, 0);
      assert.equal(beats, 4, `${id} bar ${index + 1}`);
    });
  }
});

test('the melodies fit on a two-octave keyboard inside C2..C7', () => {
  for (const tune of MELODIES) {
    const midis = melodyNotes(tune).map((note) => note.midi);
    const [low, high] = [Math.min(...midis), Math.max(...midis)];
    assert.ok(low >= LOWEST_MIDI && high <= HIGHEST_MIDI, `${tune.id} range`);
    assert.ok(high - low <= 24, `${tune.id} span`);
    assert.ok(tune.bpm >= 60 && tune.bpm <= 160, `${tune.id} tempo`);
  }
});

test('parseScore reads lengths and rejects malformed tokens', () => {
  assert.deepEqual(parseScore(' C4 D4:0.5 | E4:2 | '), [
    [
      { midi: 60, beats: 1 },
      { midi: 62, beats: 0.5 },
    ],
    [{ midi: 64, beats: 2 }],
  ]);
  for (const score of ['C4:0', 'C4:-1', 'C4:abc', 'C4:', 'C4:1:2', 'X4', 'C4 Q']) {
    assert.throws(() => parseScore(score), RangeError, score);
  }
});
