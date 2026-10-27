import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RECORDINGS,
  addRecording,
  createRecorder,
  quantizeRecording,
  recordingToNotes,
  recordingsFromJSON,
  recordingsToJSON,
  sixteenthMs,
} from '../src/recorder.js';

const on = (midi, time) => ({ type: 'on', midi, time });
const off = (midi, time) => ({ type: 'off', midi, time });

/** A clock the test moves by hand. */
function fakeClock(start = 0) {
  const clock = { time: start, now: () => clock.time };
  return clock;
}

/** Plays [clockTime, 'on' | 'off', midi] steps into a recorder. */
function play(recorder, clock, steps) {
  for (const [time, type, midi] of steps) {
    clock.time = time;
    if (type === 'on') recorder.noteOn(midi);
    else recorder.noteOff(midi);
  }
}

test('records note events with times from the injected clock', () => {
  const clock = fakeClock(1000);
  const recorder = createRecorder({ now: clock.now });
  recorder.start();
  assert.equal(recorder.isRecording(), true);
  play(recorder, clock, [
    [1500, 'on', 60],
    [1750, 'on', 64],
    [2000, 'off', 60],
    [2100, 'off', 64],
  ]);
  clock.time = 5000;
  assert.deepEqual(recorder.stop(), {
    events: [on(60, 0), on(64, 250), off(60, 500), off(64, 600)],
    duration: 600,
  });
  assert.equal(recorder.isRecording(), false);
});

test('ignores notes while idle, repeated note-ons and stray note-offs', () => {
  const clock = fakeClock();
  const recorder = createRecorder({ now: clock.now });
  recorder.noteOn(60);
  recorder.start();
  play(recorder, clock, [
    [0, 'off', 62],
    [10, 'on', 60],
    [20, 'on', 60],
    [30, 'off', 60],
    [40, 'off', 60],
  ]);
  assert.deepEqual(recorder.stop().events, [on(60, 0), off(60, 20)]);
});

test('stopping closes held notes, and an empty take gives null', () => {
  const clock = fakeClock();
  const recorder = createRecorder({ now: clock.now });
  recorder.start();
  play(recorder, clock, [
    [100, 'on', 60],
    [200, 'on', 67],
  ]);
  clock.time = 450;
  assert.deepEqual(recorder.stop(), {
    events: [on(60, 0), on(67, 100), off(60, 350), off(67, 350)],
    duration: 350,
  });
  recorder.start();
  assert.equal(recorder.stop(), null);
  assert.equal(recorder.stop(), null, 'stopping twice is harmless');
});

test('event times are whole milliseconds', () => {
  const clock = fakeClock(0.25);
  const recorder = createRecorder({ now: clock.now });
  recorder.start();
  play(recorder, clock, [
    [10.4, 'on', 60],
    [133.2, 'off', 60],
  ]);
  assert.deepEqual(recorder.stop().events, [on(60, 0), off(60, 123)]);
});

test('quantizes to a 1/16 grid at the given BPM', () => {
  assert.equal(sixteenthMs(120), 125);
  assert.equal(sixteenthMs(60), 250);
  const take = {
    events: [on(60, 0), off(60, 240), on(62, 260), off(62, 370), on(64, 505), off(64, 990)],
    duration: 990,
  };
  assert.deepEqual(quantizeRecording(take, 120), {
    events: [on(60, 0), off(60, 250), on(62, 250), off(62, 375), on(64, 500), off(64, 1000)],
    duration: 1000,
  });
});

test('a loose performance recorded with a fake clock snaps onto the grid', () => {
  const clock = fakeClock();
  const recorder = createRecorder({ now: clock.now });
  recorder.start();
  play(recorder, clock, [
    [3000, 'on', 60],
    [3110, 'off', 60],
    [3255, 'on', 64],
    [3370, 'off', 64],
    [3490, 'on', 67],
    [3990, 'off', 67],
  ]);
  const quantized = quantizeRecording(recorder.stop(), 120);
  assert.deepEqual(recordingToNotes(quantized), [
    { midi: 60, start: 0, end: 125 },
    { midi: 64, start: 250, end: 375 },
    { midi: 67, start: 500, end: 1000 },
  ]);
});

test('quantized notes last at least one step and repeats never overlap', () => {
  const tap = { events: [on(60, 10), off(60, 30)], duration: 30 };
  assert.deepEqual(quantizeRecording(tap, 120).events, [on(60, 0), off(60, 125)]);
  const repeat = { events: [on(60, 0), off(60, 100), on(60, 110), off(60, 300)], duration: 300 };
  assert.deepEqual(quantizeRecording(repeat, 120).events, [on(60, 0), off(60, 125), on(60, 125), off(60, 250)]);
  const merged = { events: [on(60, 0), off(60, 40), on(60, 50), off(60, 200)], duration: 200 };
  assert.deepEqual(quantizeRecording(merged, 120).events, [on(60, 0), off(60, 250)]);
});

test('quantizing keeps the take id and is idempotent', () => {
  const take = { id: 3, events: [on(60, 0), on(64, 130), off(60, 240), off(64, 380)], duration: 380 };
  const once = quantizeRecording(take, 100);
  assert.equal(once.id, 3);
  assert.deepEqual(once.events, [on(60, 0), on(64, 150), off(60, 300), off(64, 450)]);
  assert.deepEqual(quantizeRecording(once, 100), once);
});

test('an invalid tempo is rejected', () => {
  for (const bpm of [0, -90, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => sixteenthMs(bpm), RangeError, String(bpm));
  }
});

test('recordingToNotes pairs events and closes open notes at the end', () => {
  const take = { events: [on(64, 0), on(60, 0), off(64, 200), off(60, 300), on(67, 300)], duration: 450 };
  assert.deepEqual(recordingToNotes(take), [
    { midi: 60, start: 0, end: 300 },
    { midi: 64, start: 0, end: 200 },
    { midi: 67, start: 300, end: 450 },
  ]);
});

test('takes survive a JSON round trip', () => {
  const take = { events: [on(60, 0), on(64, 250), off(60, 500), off(64, 600)], duration: 600 };
  const list = addRecording(addRecording([], take), quantizeRecording(take, 90));
  const json = recordingsToJSON(list);
  assert.equal(typeof json, 'string');
  assert.deepEqual(recordingsFromJSON(json), list);
  assert.deepEqual(
    list.map((saved) => saved.id),
    [1, 2],
  );
});

test('loading never throws and drops invalid takes', () => {
  for (const text of [null, undefined, '', 'not json', '{"id":1}', '42']) {
    assert.deepEqual(recordingsFromJSON(text), [], String(text));
  }
  const valid = { id: 1, events: [on(60, 0), off(60, 5)], duration: 5 };
  const broken = [
    { id: 2, events: 'none', duration: 0 },
    { id: 3, events: [on(200, 0)], duration: 0 },
    { id: 4, events: [on(60, 9), off(60, 3)], duration: 9 },
    { id: 5, events: [], duration: 0 },
    { id: 0, events: [on(60, 0)], duration: 0 },
    { id: 6, events: [{ type: 'hold', midi: 60, time: 0 }], duration: 0 },
    { id: 7, events: [on(60, 0), off(60, 10)], duration: 5 },
    null,
  ];
  assert.deepEqual(recordingsFromJSON(JSON.stringify([valid, ...broken])), [valid]);
});

test('takes are numbered and only the newest are kept', () => {
  const take = { events: [on(60, 0), off(60, 100)], duration: 100 };
  let list = [];
  for (let count = 0; count < 10; count += 1) list = addRecording(list, take, 3);
  assert.deepEqual(
    list.map((saved) => saved.id),
    [8, 9, 10],
  );
  const empty = [];
  assert.equal(addRecording(empty, take).length, 1);
  assert.equal(empty.length, 0, 'the input list is not changed');
  let full = [];
  for (let count = 0; count < MAX_RECORDINGS + 2; count += 1) full = addRecording(full, take);
  assert.equal(full.length, MAX_RECORDINGS);
});
