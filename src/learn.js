/**
 * Learn mode: walks through a melody note by note and waits for the right key.
 * Lessons are immutable values. Pure module with no DOM access.
 * @module learn
 */
import { melodyNotes } from './melodies.js';

/**
 * @typedef {object} Lesson
 * @property {string} melodyId
 * @property {number[]} notes MIDI notes to play, in order.
 * @property {number} index Position of the next note to play.
 * @property {number} mistakes Wrong keys pressed so far.
 */

/**
 * Starts a lesson at the first note of a melody.
 * @param {import('./melodies.js').Melody} melody
 * @returns {Lesson}
 */
export function createLesson(melody) {
  return { melodyId: melody.id, notes: melodyNotes(melody).map((note) => note.midi), index: 0, mistakes: 0 };
}

/**
 * The note the player should press next.
 * @param {Lesson} lesson
 * @returns {number | null} MIDI number, or null when the lesson is finished.
 */
export function expectedNote(lesson) {
  return lesson.index < lesson.notes.length ? lesson.notes[lesson.index] : null;
}

/**
 * Applies a key press: the expected key advances the lesson, any other key
 * counts as a mistake. Presses after the last note change nothing.
 * @param {Lesson} lesson
 * @param {number} midi
 * @returns {{ lesson: Lesson, hit: boolean }}
 */
export function pressLessonKey(lesson, midi) {
  const expected = expectedNote(lesson);
  if (expected === null) return { lesson, hit: false };
  if (midi === expected) return { lesson: { ...lesson, index: lesson.index + 1 }, hit: true };
  return { lesson: { ...lesson, mistakes: lesson.mistakes + 1 }, hit: false };
}
