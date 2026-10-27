import test from 'node:test';
import assert from 'node:assert/strict';
import { MELODIES } from '../src/melodies.js';
import { activeNotesAt, scheduleDuration, scheduleFromMelody, scheduleFromRecording } from '../src/player.js';

const on = (midi, time) => ({ type: 'on', midi, time });
const off = (midi, time) => ({ type: 'off', midi, time });

function assertTimeSorted(schedule, label) {
  schedule.slice(1).forEach((note, index) => {
    assert.ok(note.time >= schedule[index].time, `${label}: note ${index + 1} starts in order`);
  });
}

test('a recording becomes a schedule in seconds sorted by time and pitch', () => {
  const take = {
    events: [on(67, 0), on(60, 0), on(64, 250), off(60, 500), off(64, 600), off(67, 600)],
    duration: 600,
  };
  const schedule = scheduleFromRecording(take);
  assert.deepEqual(schedule, [
    { time: 0, duration: 0.5, midi: 60 },
    { time: 0, duration: 0.6, midi: 67 },
    { time: 0.25, duration: 0.35, midi: 64 },
  ]);
  assertTimeSorted(schedule, 'recording');
});

test('melody schedules are time-sorted and one voice never overlaps itself', () => {
  for (const melody of MELODIES) {
    const schedule = scheduleFromMelody(melody);
    assert.ok(schedule.length > 20, `${melody.id} has notes`);
    assertTimeSorted(schedule, melody.id);
    schedule.forEach((note, index) => {
      assert.ok(note.duration > 0, `${melody.id}: note ${index} has a length`);
      const next = schedule[index + 1];
      if (next) assert.ok(note.time + note.duration <= next.time, `${melody.id}: note ${index} ends before the next starts`);
    });
  }
});

test('melody timing follows the tempo', () => {
  const ode = MELODIES.find((melody) => melody.id === 'ode');
  const schedule = scheduleFromMelody(ode);
  const beat = 60 / ode.bpm;
  assert.ok(Math.abs(schedule[1].time - beat) < 1e-9, 'second note starts one beat in');
  assert.ok(Math.abs(schedule[0].duration - 0.9 * beat) < 1e-9, 'a note sounds for 90 % of its length');
  assert.ok(Math.abs(scheduleDuration(schedule) - (62 + 1.8) * beat) < 1e-9, '16 bars, ending on a half note');
});

test('activeNotesAt lists the notes sounding at a moment', () => {
  const schedule = [
    { time: 0, duration: 1, midi: 64 },
    { time: 0, duration: 0.5, midi: 60 },
    { time: 0.5, duration: 1, midi: 67 },
  ];
  assert.deepEqual(activeNotesAt(schedule, 0), [60, 64]);
  assert.deepEqual(activeNotesAt(schedule, 0.5), [64, 67]);
  assert.deepEqual(activeNotesAt(schedule, 1.2), [67]);
  assert.deepEqual(activeNotesAt(schedule, 2), []);
  assert.equal(scheduleDuration(schedule), 1.5);
  assert.equal(scheduleDuration([]), 0);
});
