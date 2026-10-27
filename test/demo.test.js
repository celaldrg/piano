import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoPiano } from '../src/demo.js';
import { recordingsFromJSON, recordingsToJSON } from '../src/recorder.js';

test('the demo shows a held C major chord and one saved take', () => {
  const state = createDemoPiano({ now: () => 0 }).getState();
  assert.deepEqual(state.held, [60, 64, 67]);
  assert.deepEqual(state.sounding, [60, 64, 67]);
  assert.ok(state.keyboard.low <= 60 && state.keyboard.high >= 67, 'the chord is on screen');
  assert.equal(state.recordings.length, 1);
  assert.equal(state.recordings[0].id, 1);
  assert.equal(state.recordings[0].events.length, 28);
  assert.deepEqual(recordingsFromJSON(recordingsToJSON(state.recordings)), state.recordings);
  assert.ok(state.trail.length >= 8, 'the trail has notes');
  assert.equal(state.recording, false);
  assert.equal(state.lesson, null);
});

test('the demo is deterministic on desktop and phone layouts', () => {
  assert.deepEqual(createDemoPiano({ now: () => 0 }).getState(), createDemoPiano({ now: () => 12345 }).getState());
  const phone = createDemoPiano({ now: () => 0, octaves: 1 }).getState();
  assert.deepEqual(phone.keyboard, { baseOctave: 4, octaves: 1, low: 60, high: 72 });
  assert.deepEqual(phone.sounding, [60, 64, 67]);
});
