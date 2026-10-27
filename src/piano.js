/**
 * The piano model the UI drives: the visible keyboard, notes held by several
 * pointers and keys, sustain, recording, the note trail and learn mode.
 * Methods that change what sounds return the NoteActions the synth performs.
 * Pure module with no DOM or Web Audio access.
 * @module piano
 */
import { createKeyboard, ensureVisible, keyboardRange, shiftOctave } from './keyboard.js';
import { createLesson, expectedNote, pressLessonKey } from './learn.js';
import { addRecording, createRecorder } from './recorder.js';
import { createNoteTracker } from './tracker.js';

/** Number of recent notes kept in the trail. */
export const TRAIL_LENGTH = 12;

/**
 * @typedef {object} LessonState
 * @property {string} melodyId
 * @property {number} index Notes played correctly so far.
 * @property {number} total Notes in the melody.
 * @property {number | null} expected Next note to press; null when done.
 * @property {number} mistakes
 * @property {boolean} done
 * @property {'hit'|'miss'|null} last Result of the latest counted key press.
 */

/**
 * @typedef {object} PianoState
 * @property {{ baseOctave: number, octaves: number, low: number, high: number }} keyboard The keys on screen.
 * @property {number} keysOctave Octave played by the lower row of computer keys (Z .. M).
 * @property {number[]} held Notes pressed right now, ascending.
 * @property {number[]} sounding Notes ringing (held or kept by sustain), ascending.
 * @property {boolean} sustain
 * @property {boolean} recording
 * @property {import('./recorder.js').Recording[]} recordings Saved takes, oldest first.
 * @property {{ seq: number, midi: number }[]} trail Recent notes, oldest first; seq grows by 1 per note.
 * @property {LessonState | null} lesson
 */

/**
 * Creates the piano model.
 * @param {object} options
 * @param {() => number} options.now Clock in milliseconds that times recordings.
 * @param {number} [options.octaves=2] Visible octaves; 1 suits phones.
 * @param {number} [options.baseOctave] Lowest visible octave; by default middle C is centred.
 * @param {import('./recorder.js').Recording[]} [options.recordings=[]] Saved takes to start with.
 */
export function createPiano({ now, octaves = 2, baseOctave, recordings = [] }) {
  const tracker = createNoteTracker();
  const recorder = createRecorder({ now });
  let keyboard = createKeyboard({ octaves, baseOctave });
  // Only octave changes move the computer keys. Scrolling the view (playback,
  // lessons, an off-screen computer key) does not, so a key keeps its note.
  let keysOctave = keyboard.baseOctave;
  let takes = recordings;
  let trail = [];
  let trailSeq = 0;
  let lesson = null;
  let lastResult = null;

  function perform(actions) {
    for (const { type, midi } of actions) {
      if (type === 'start') {
        recorder.noteOn(midi);
        trailSeq += 1;
        trail = [...trail, { seq: trailSeq, midi }].slice(-TRAIL_LENGTH);
      } else {
        recorder.noteOff(midi);
      }
    }
    return actions;
  }

  function checkLesson(midi) {
    if (lesson === null || expectedNote(lesson) === null) return;
    const result = pressLessonKey(lesson, midi);
    lesson = result.lesson;
    lastResult = result.hit ? 'hit' : 'miss';
    revealNext();
  }

  function revealNext() {
    const next = expectedNote(lesson);
    if (next !== null) keyboard = ensureVisible(keyboard, next);
  }

  function lessonState() {
    const expected = expectedNote(lesson);
    return {
      melodyId: lesson.melodyId,
      index: lesson.index,
      total: lesson.notes.length,
      expected,
      mistakes: lesson.mistakes,
      done: expected === null,
      last: lastResult,
    };
  }

  return {
    /**
     * Presses a key. In learn mode every newly started note is checked.
     * @param {string} source e.g. "pointer:1" or "key:KeyZ".
     * @param {number} midi
     * @returns {import('./tracker.js').NoteAction[]}
     */
    press(source, midi) {
      const actions = perform(tracker.press(source, midi));
      if (actions.some((action) => action.type === 'start' && action.midi === midi)) checkLesson(midi);
      return actions;
    },
    /** Releases the key a source holds. */
    release: (source) => perform(tracker.release(source)),
    /** Lets go of every key and lifts the pedal, e.g. when the page loses focus. */
    releaseAll: () => perform(tracker.releaseAll()),
    /** Puts the sustain pedal down (true) or lifts it (false). */
    setSustain: (on) => perform(tracker.setSustain(on)),
    /**
     * Moves the keyboard by whole octaves inside C2..C7. The computer keys
     * follow: their lower row then plays the lowest octave on screen.
     * @param {number} delta
     */
    shiftOctave(delta) {
      keyboard = shiftOctave(keyboard, delta);
      keysOctave = keyboard.baseOctave;
    },
    /**
     * Moves the keyboard as little as possible so the notes low..high are on
     * screen (at least `low` when the span is too wide), e.g. during playback
     * or for a computer key whose note is off screen. The computer keys stay
     * in their octave.
     * @param {number} low
     * @param {number} [high=low]
     */
    reveal(low, high = low) {
      keyboard = ensureVisible(keyboard, low, high);
    },
    /** Changes how many octaves are visible, e.g. when the screen gets narrow. */
    setOctaves(count) {
      keyboard = createKeyboard({ octaves: count, baseOctave: keyboard.baseOctave });
      if (lesson !== null) revealNext();
    },
    /** Starts a new take; anything recorded but not stopped is discarded. */
    startRecording: () => recorder.start(),
    /**
     * Stops recording and saves the take.
     * @returns {import('./recorder.js').Recording | null} The numbered take, or null if nothing was played.
     */
    stopRecording() {
      const take = recorder.stop();
      if (take === null) return null;
      takes = addRecording(takes, take);
      return takes[takes.length - 1];
    },
    /** Deletes all saved takes. */
    clearRecordings() {
      takes = [];
    },
    /**
     * Starts learn mode and moves the keyboard so the melody (or at least its
     * first note) is visible.
     * @param {import('./melodies.js').Melody} melody
     */
    startLesson(melody) {
      lesson = createLesson(melody);
      lastResult = null;
      keyboard = ensureVisible(keyboard, Math.min(...lesson.notes), Math.max(...lesson.notes));
      revealNext();
    },
    /** Leaves learn mode. */
    stopLesson() {
      lesson = null;
      lastResult = null;
    },
    /** @returns {PianoState} A snapshot for rendering. */
    getState() {
      return {
        keyboard: { ...keyboard, ...keyboardRange(keyboard) },
        keysOctave,
        held: tracker.held(),
        sounding: tracker.sounding(),
        sustain: tracker.isSustained(),
        recording: recorder.isRecording(),
        recordings: takes,
        trail,
        lesson: lesson === null ? null : lessonState(),
      };
    },
  };
}
