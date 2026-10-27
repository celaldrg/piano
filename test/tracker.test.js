import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteTracker } from '../src/tracker.js';

const start = (midi) => ({ type: 'start', midi });
const stop = (midi) => ({ type: 'stop', midi });

test('pressing and releasing a key starts and stops its note', () => {
  const tracker = createNoteTracker();
  assert.deepEqual(tracker.press('pointer:1', 60), [start(60)]);
  assert.deepEqual(tracker.sounding(), [60]);
  assert.deepEqual(tracker.release('pointer:1'), [stop(60)]);
  assert.deepEqual(tracker.sounding(), []);
  assert.deepEqual(tracker.release('pointer:1'), [], 'releasing twice does nothing');
});

test('several fingers play a chord at once', () => {
  const tracker = createNoteTracker();
  const actions = [tracker.press('pointer:1', 60), tracker.press('pointer:2', 64), tracker.press('key:KeyB', 67)];
  assert.deepEqual(actions.flat(), [start(60), start(64), start(67)]);
  assert.deepEqual(tracker.held(), [60, 64, 67]);
  assert.deepEqual(tracker.release('pointer:2'), [stop(64)]);
  assert.deepEqual(tracker.sounding(), [60, 67]);
});

test('a note held by two sources stops when the last one lets go', () => {
  const tracker = createNoteTracker();
  tracker.press('pointer:1', 60);
  assert.deepEqual(tracker.press('key:KeyZ', 60), [], 'not started twice');
  assert.deepEqual(tracker.release('pointer:1'), []);
  assert.deepEqual(tracker.release('key:KeyZ'), [stop(60)]);
});

test('sliding a finger across keys plays a glissando', () => {
  const tracker = createNoteTracker();
  const actions = [60, 62, 64].flatMap((midi) => tracker.press('pointer:1', midi));
  assert.deepEqual(actions, [start(60), stop(60), start(62), stop(62), start(64)]);
  assert.deepEqual(tracker.press('pointer:1', 64), [], 'staying on a key does nothing');
  assert.deepEqual(tracker.sounding(), [64]);
});

test('sustain keeps released notes ringing until it is lifted', () => {
  const tracker = createNoteTracker();
  assert.deepEqual(tracker.setSustain(true), []);
  assert.equal(tracker.isSustained(), true);
  tracker.press('pointer:1', 60);
  assert.deepEqual(tracker.release('pointer:1'), []);
  tracker.press('pointer:2', 64);
  assert.deepEqual(tracker.sounding(), [60, 64]);
  assert.deepEqual(tracker.held(), [64]);
  assert.deepEqual(tracker.setSustain(false), [stop(60)], 'the held note keeps sounding');
  assert.deepEqual(tracker.release('pointer:2'), [stop(64)]);
});

test('striking a sustained note again restarts it', () => {
  const tracker = createNoteTracker();
  tracker.setSustain(true);
  tracker.press('pointer:1', 60);
  tracker.release('pointer:1');
  assert.deepEqual(tracker.press('pointer:1', 60), [stop(60), start(60)]);
});

test('releaseAll silences everything and lifts the pedal', () => {
  const tracker = createNoteTracker();
  tracker.setSustain(true);
  tracker.press('pointer:1', 67);
  tracker.press('pointer:2', 60);
  tracker.release('pointer:2');
  assert.deepEqual(tracker.releaseAll(), [stop(60), stop(67)]);
  assert.equal(tracker.isSustained(), false);
  assert.deepEqual(tracker.sounding(), []);
  assert.deepEqual(tracker.held(), []);
});
