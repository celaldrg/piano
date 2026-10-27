/**
 * Built-in public-domain melodies (melody only, no lyrics), written as scores:
 * "E4" is one beat, "E4:1.5" sets the length in beats and "|" ends a bar.
 * Display names come from i18n keys named after the melody id.
 * @module melodies
 */
import { noteNameToMidi } from './music.js';

/**
 * @typedef {object} Melody
 * @property {string} id
 * @property {number} bpm Tempo in quarter-note beats per minute.
 * @property {string} score
 */

/**
 * @typedef {object} MelodyNote
 * @property {number} midi
 * @property {number} beats Length in beats.
 */

/** @type {Melody[]} */
export const MELODIES = [
  {
    // "Ode to Joy" - Ludwig van Beethoven, theme from the Symphony No. 9 (1824)
    id: 'ode',
    bpm: 108,
    score: [
      'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2',
      'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2',
      'D4 D4 E4 C4 | D4 E4:0.5 F4:0.5 E4 C4 | D4 E4:0.5 F4:0.5 E4 D4 | C4 D4 G3:2',
      'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2',
    ].join(' | '),
  },
  {
    // "Twinkle Twinkle Little Star" - traditional (French tune, 18th century)
    id: 'twinkle',
    bpm: 96,
    score: [
      'C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2',
      'G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2',
      'C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2',
    ].join(' | '),
  },
  {
    // "Frère Jacques" - traditional French round
    id: 'frere',
    bpm: 112,
    score: [
      'C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4:2 | E4 F4 G4:2',
      'G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4',
      'C4 G3 C4:2 | C4 G3 C4:2',
    ].join(' | '),
  },
];

/**
 * Parses a score into bars of notes.
 * @param {string} score e.g. "C4 D4 E4:2 | G3:0.5 A3:0.5 B3 C4:2".
 * @returns {MelodyNote[][]}
 * @throws {RangeError} On an unknown note or a length that is not a positive number.
 */
export function parseScore(score) {
  return score
    .split('|')
    .map((bar) => bar.trim().split(/\s+/).filter(Boolean).map(parseToken))
    .filter((bar) => bar.length > 0);
}

/**
 * All notes of a melody in playing order.
 * @param {Melody} melody
 * @returns {MelodyNote[]}
 */
export function melodyNotes(melody) {
  return parseScore(melody.score).flat();
}

function parseToken(token) {
  const [name, length = '1', extra] = token.split(':');
  const beats = Number(length);
  if (extra !== undefined || !Number.isFinite(beats) || beats <= 0) {
    throw new RangeError(`Invalid note length: ${token}`);
  }
  return { midi: noteNameToMidi(name), beats };
}
