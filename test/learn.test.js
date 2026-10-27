import test from 'node:test';
import assert from 'node:assert/strict';
import { createLesson, expectedNote, pressLessonKey } from '../src/learn.js';
import { MELODIES } from '../src/melodies.js';

const ARPEGGIO = { id: 'arpeggio', bpm: 100, score: 'C4 E4 G4' };

test('a lesson waits for the expected key', () => {
  let lesson = createLesson(ARPEGGIO);
  const hits = [62, 60, 64, 65, 67].map((midi) => {
    const step = pressLessonKey(lesson, midi);
    lesson = step.lesson;
    return step.hit;
  });
  assert.deepEqual(hits, [false, true, true, false, true]);
  assert.equal(lesson.mistakes, 2);
  assert.equal(lesson.index, 3);
  assert.equal(expectedNote(lesson), null);
});

test('the expected key moves only on a hit and lessons are immutable', () => {
  const start = createLesson(ARPEGGIO);
  assert.equal(expectedNote(start), 60);
  assert.equal(expectedNote(pressLessonKey(start, 61).lesson), 60);
  assert.equal(expectedNote(pressLessonKey(start, 60).lesson), 64);
  assert.equal(start.index, 0);
  assert.equal(start.mistakes, 0);
});

test('presses after the last note change nothing', () => {
  const finished = pressLessonKey(createLesson({ id: 'one', bpm: 100, score: 'A4' }), 69).lesson;
  const after = pressLessonKey(finished, 50);
  assert.equal(after.hit, false);
  assert.equal(after.lesson, finished);
});

test('a lesson follows every note of a built-in melody', () => {
  const lesson = createLesson(MELODIES.find((melody) => melody.id === 'twinkle'));
  assert.equal(lesson.melodyId, 'twinkle');
  assert.deepEqual(lesson.notes.slice(0, 7), [60, 60, 67, 67, 69, 69, 67]);
  assert.equal(lesson.notes.length, 42);
});
