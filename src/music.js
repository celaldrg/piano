/**
 * Pitch math for 12-tone equal temperament: note names, MIDI numbers and
 * frequencies. Pure functions with no DOM access.
 * @module music
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LETTER_PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTAL_SHIFT = { '': 0, '#': 1, b: -1 };
const NOTE_NAME_PATTERN = /^([A-Ga-g])([#b]?)(-1|\d)$/;
const A4_MIDI = 69;
const DEFAULT_A4 = 440;

/**
 * Frequency of a MIDI note in 12-tone equal temperament.
 * @param {number} midi MIDI note number (fractions give pitches in between).
 * @param {number} [a4=440] Frequency of A4 in Hz.
 * @returns {number} Frequency in Hz.
 */
export function midiToFrequency(midi, a4 = DEFAULT_A4) {
  return a4 * 2 ** ((midi - A4_MIDI) / 12);
}

/**
 * MIDI number of a frequency; the inverse of midiToFrequency.
 * @param {number} frequency Frequency in Hz, greater than 0.
 * @param {number} [a4=440] Frequency of A4 in Hz.
 * @returns {number} MIDI number, fractional between semitones.
 */
export function frequencyToMidi(frequency, a4 = DEFAULT_A4) {
  return A4_MIDI + 12 * Math.log2(frequency / a4);
}

/**
 * Scientific pitch name of a MIDI note spelled with sharps, e.g. 61 -> "C#4"
 * and 0 -> "C-1".
 * @param {number} midi Integer MIDI number 0..127.
 * @returns {string}
 * @throws {RangeError} When midi is not an integer in 0..127.
 */
export function midiToNoteName(midi) {
  assertMidi(midi);
  return NOTE_NAMES[midi % 12] + octaveOf(midi);
}

/**
 * MIDI number of a scientific pitch name. Sharps and flats are accepted in
 * either letter case ("C#4", "Db4", "bb3"); "Cb4" is B3 and "B#3" is C4.
 * @param {string} name
 * @returns {number} Integer MIDI number 0..127.
 * @throws {RangeError} When the name is malformed or outside MIDI 0..127.
 */
export function noteNameToMidi(name) {
  const match = NOTE_NAME_PATTERN.exec(String(name).trim());
  if (!match) throw new RangeError(`Invalid note name: ${name}`);
  const [, letter, accidental, octave] = match;
  const midi = (Number(octave) + 1) * 12 + LETTER_PITCH[letter.toUpperCase()] + ACCIDENTAL_SHIFT[accidental];
  assertMidi(midi);
  return midi;
}

/**
 * Octave number of a MIDI note in scientific pitch notation (60 -> 4).
 * @param {number} midi
 * @returns {number}
 */
export function octaveOf(midi) {
  return Math.floor(midi / 12) - 1;
}

/**
 * Whether a MIDI note is a black key on a piano.
 * @param {number} midi
 * @returns {boolean}
 */
export function isBlackKey(midi) {
  return NOTE_NAMES[((midi % 12) + 12) % 12].length > 1;
}

function assertMidi(midi) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new RangeError(`MIDI note out of range: ${midi}`);
  }
}
