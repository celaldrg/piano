import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAIL_LENGTH, createPiano } from '../src/piano.js';
import { recordingsFromJSON, recordingsToJSON } from '../src/recorder.js';

const start = (midi) => ({ type: 'start', midi });
const stop = (midi) => ({ type: 'stop', midi });
const on = (midi, time) => ({ type: 'on', midi, time });
const off = (midi, time) => ({ type: 'off', midi, time });

/** A clock the test moves by hand. */
function fakeClock() {
  const clock = { time: 0, now: () => clock.time };
  return clock;
}

/** Taps a key: press and release at once. */
function tap(piano, midi) {
  piano.press('pointer:1', midi);
  piano.release('pointer:1');
}

test('a new piano shows two octaves around middle C and is silent', () => {
  const state = createPiano({ now: () => 0 }).getState();
  assert.deepEqual(state.keyboard, { baseOctave: 3, octaves: 2, low: 48, high: 76 });
  assert.equal(state.keysOctave, 3, 'the lower row of computer keys plays the lowest octave on screen');
  assert.deepEqual([state.held, state.sounding, state.trail, state.recordings], [[], [], [], []]);
  assert.equal(state.sustain, false);
  assert.equal(state.recording, false);
  assert.equal(state.lesson, null);
});

test('key presses return synth actions and update the state', () => {
  const piano = createPiano({ now: () => 0 });
  assert.deepEqual(piano.press('pointer:1', 60), [start(60)]);
  piano.setSustain(true);
  assert.deepEqual(piano.release('pointer:1'), []);
  const state = piano.getState();
  assert.deepEqual([state.held, state.sounding, state.sustain], [[], [60], true]);
  assert.deepEqual(piano.setSustain(false), [stop(60)]);
  piano.press('key:KeyE', 64);
  assert.deepEqual(piano.releaseAll(), [stop(64)]);
});

test('records what is played, timed by the injected clock', () => {
  const clock = fakeClock();
  const piano = createPiano({ now: clock.now });
  piano.startRecording();
  assert.equal(piano.getState().recording, true);
  clock.time = 100;
  piano.press('pointer:1', 60);
  clock.time = 400;
  piano.release('pointer:1');
  clock.time = 500;
  piano.press('key:KeyE', 64);
  clock.time = 900;
  piano.release('key:KeyE');
  const take = piano.stopRecording();
  assert.deepEqual(take, { id: 1, events: [on(60, 0), off(60, 300), on(64, 400), off(64, 800)], duration: 800 });
  assert.deepEqual(piano.getState().recordings, [take]);
  assert.equal(piano.getState().recording, false);
});

test('sustained notes are recorded until the pedal is lifted', () => {
  const clock = fakeClock();
  const piano = createPiano({ now: clock.now });
  piano.startRecording();
  piano.setSustain(true);
  piano.press('pointer:1', 60);
  clock.time = 200;
  piano.release('pointer:1');
  clock.time = 700;
  piano.setSustain(false);
  assert.deepEqual(piano.stopRecording().events, [on(60, 0), off(60, 700)]);
});

test('takes are numbered, restored from JSON and cleared', () => {
  const piano = createPiano({ now: () => 0 });
  for (const midi of [60, 62]) {
    piano.startRecording();
    tap(piano, midi);
    piano.stopRecording();
  }
  piano.startRecording();
  assert.equal(piano.stopRecording(), null, 'an empty take is not saved');
  const { recordings } = piano.getState();
  assert.deepEqual(
    recordings.map((take) => take.id),
    [1, 2],
  );
  const restored = createPiano({ now: () => 0, recordings: recordingsFromJSON(recordingsToJSON(recordings)) });
  assert.deepEqual(restored.getState().recordings, recordings);
  piano.clearRecordings();
  assert.deepEqual(piano.getState().recordings, []);
});

test('the trail keeps the latest notes in order', () => {
  const piano = createPiano({ now: () => 0 });
  for (let midi = 48; midi < 68; midi += 1) piano.press('pointer:1', midi);
  const { trail } = piano.getState();
  assert.equal(trail.length, TRAIL_LENGTH);
  assert.equal(trail[trail.length - 1].midi, 67);
  assert.ok(trail.every((entry, index) => index === 0 || entry.seq === trail[index - 1].seq + 1));
});

test('octave controls keep the keyboard inside C2..C7', () => {
  const piano = createPiano({ now: () => 0 });
  piano.shiftOctave(10);
  assert.equal(piano.getState().keyboard.high, 96);
  piano.shiftOctave(-10);
  assert.equal(piano.getState().keyboard.low, 36);
  piano.setOctaves(1);
  assert.deepEqual(piano.getState().keyboard, { baseOctave: 2, octaves: 1, low: 36, high: 48 });
});

test('reveal moves the keyboard only as far as needed', () => {
  const piano = createPiano({ now: () => 0 });
  piano.reveal(60, 76);
  assert.deepEqual(piano.getState().keyboard, { baseOctave: 3, octaves: 2, low: 48, high: 76 }, 'already visible');
  piano.reveal(84, 88);
  assert.deepEqual(piano.getState().keyboard, { baseOctave: 4, octaves: 2, low: 60, high: 88 });
  piano.reveal(90);
  assert.deepEqual(piano.getState().keyboard, { baseOctave: 5, octaves: 2, low: 72, high: 96 });
  piano.reveal(40);
  assert.equal(piano.getState().keyboard.low, 36);
});

test('scrolling the view keeps the computer keys in their octave; octave buttons move both', () => {
  const piano = createPiano({ now: () => 0, octaves: 1 });
  const octaves = () => [piano.getState().keyboard.baseOctave, piano.getState().keysOctave];
  assert.deepEqual(octaves(), [4, 4]);
  piano.reveal(74); // D5, played with the W key, is off a phone screen
  assert.deepEqual(octaves(), [5, 4], 'the view scrolls, W still plays D5');
  piano.reveal(60); // back to C4 with the Z key
  assert.deepEqual(octaves(), [4, 4]);
  piano.startLesson({ id: 'low', bpm: 100, score: 'G3' });
  assert.deepEqual(octaves(), [3, 4], 'a lesson scrolls the view only');
  piano.shiftOctave(1);
  assert.deepEqual(octaves(), [4, 4], 'an octave button moves the computer keys to the view');
  piano.shiftOctave(1);
  assert.deepEqual(octaves(), [5, 5]);
});

test('learn mode reveals the next key and counts mistakes', () => {
  const piano = createPiano({ now: () => 0, octaves: 1 });
  piano.startLesson({ id: 'leap', bpm: 100, score: 'E4 G3 C5' });
  let state = piano.getState();
  assert.deepEqual(state.lesson, { melodyId: 'leap', index: 0, total: 3, expected: 64, mistakes: 0, done: false, last: null });
  assert.equal(state.keyboard.baseOctave, 4, 'E4 is on screen');

  tap(piano, 62);
  state = piano.getState();
  assert.deepEqual([state.lesson.last, state.lesson.mistakes, state.lesson.expected], ['miss', 1, 64]);

  tap(piano, 64);
  state = piano.getState();
  assert.deepEqual([state.lesson.last, state.lesson.expected, state.keyboard.baseOctave], ['hit', 55, 3]);

  tap(piano, 55);
  state = piano.getState();
  assert.deepEqual([state.lesson.expected, state.keyboard.baseOctave], [72, 4]);

  tap(piano, 72);
  state = piano.getState();
  assert.deepEqual([state.lesson.done, state.lesson.expected, state.lesson.index], [true, null, 3]);

  piano.stopLesson();
  assert.equal(piano.getState().lesson, null);
});

test('a key that is already sounding does not count twice in learn mode', () => {
  const piano = createPiano({ now: () => 0 });
  piano.startLesson({ id: 'pair', bpm: 100, score: 'C4 C4' });
  piano.press('pointer:1', 60);
  piano.press('key:KeyQ', 60);
  assert.equal(piano.getState().lesson.index, 1);
  piano.release('key:KeyQ');
  piano.release('pointer:1');
  tap(piano, 60);
  assert.equal(piano.getState().lesson.done, true);
});
