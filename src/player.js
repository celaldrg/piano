/**
 * Turns recordings and built-in melodies into time-sorted playback schedules.
 * Pure module with no DOM or Web Audio access.
 * @module player
 */
import { melodyNotes } from './melodies.js';
import { recordingToNotes } from './recorder.js';

/**
 * @typedef {object} ScheduledNote
 * @property {number} time Start in seconds from the beginning.
 * @property {number} duration Seconds.
 * @property {number} midi
 */

/** Share of its written length a melody note sounds, leaving a short gap. */
const ARTICULATION = 0.9;

/**
 * Schedule of a recording, sorted by start time and then pitch.
 * @param {import('./recorder.js').Recording} recording Times in milliseconds.
 * @returns {ScheduledNote[]}
 */
export function scheduleFromRecording(recording) {
  return recordingToNotes(recording).map(({ midi, start, end }) => ({
    time: start / 1000,
    duration: (end - start) / 1000,
    midi,
  }));
}

/**
 * Schedule of a built-in melody at its own tempo. Each note sounds for 90 % of
 * its length, so repeated notes are heard separately and never overlap.
 * @param {import('./melodies.js').Melody} melody
 * @returns {ScheduledNote[]}
 */
export function scheduleFromMelody(melody) {
  const secondsPerBeat = 60 / melody.bpm;
  let beat = 0;
  return melodyNotes(melody).map(({ midi, beats }) => {
    const note = { time: beat * secondsPerBeat, duration: beats * secondsPerBeat * ARTICULATION, midi };
    beat += beats;
    return note;
  });
}

/**
 * Time in seconds at which the last note of a schedule ends (0 when empty).
 * @param {ScheduledNote[]} schedule
 * @returns {number}
 */
export function scheduleDuration(schedule) {
  return schedule.reduce((end, note) => Math.max(end, note.time + note.duration), 0);
}

/**
 * Notes sounding at a moment of a schedule, for highlighting keys during playback.
 * @param {ScheduledNote[]} schedule
 * @param {number} time Seconds from the beginning.
 * @returns {number[]} MIDI numbers in ascending order.
 */
export function activeNotesAt(schedule, time) {
  const active = new Set();
  for (const note of schedule) {
    if (note.time <= time && time < note.time + note.duration) active.add(note.midi);
  }
  return [...active].sort((a, b) => a - b);
}
