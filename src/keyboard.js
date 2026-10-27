/**
 * Keyboard model: the visible keys, octave shifting inside C2..C7 and the
 * computer-keyboard mapping. Pure functions with no DOM access.
 * @module keyboard
 */
import { isBlackKey, midiToNoteName, octaveOf } from './music.js';

/** Lowest playable note, C2. */
export const LOWEST_MIDI = 36;

/** Highest playable note, C7. */
export const HIGHEST_MIDI = 96;

const LOWEST_OCTAVE = octaveOf(LOWEST_MIDI);
const HIGHEST_OCTAVE = octaveOf(HIGHEST_MIDI);
const MIDDLE_C_OCTAVE = 4;

const LOWER_ROW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM'];
const UPPER_ROW = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU'];
const TOP_KEYS = [['KeyI', 24], ['KeyO', 26], ['KeyP', 28]]; // C, D and E above the upper octave

/**
 * Computer-keyboard bindings by physical key (KeyboardEvent.code). `offset` is
 * the number of semitones above the C of the keyboard's base octave and
 * `label` is the key as printed on a US layout.
 * @type {{ code: string, label: string, offset: number }[]}
 */
export const KEY_BINDINGS = [
  ...LOWER_ROW.map((code, index) => binding(code, index)),
  ...UPPER_ROW.map((code, index) => binding(code, 12 + index)),
  ...TOP_KEYS.map(([code, offset]) => binding(code, offset)),
];

const BINDING_BY_CODE = new Map(KEY_BINDINGS.map((bound) => [bound.code, bound]));
const BINDING_BY_OFFSET = new Map(KEY_BINDINGS.map((bound) => [bound.offset, bound]));
/** Semitones from the C of the lower row to the highest computer key (P, two octaves and a third up). */
const KEYS_SPAN = Math.max(...KEY_BINDINGS.map((bound) => bound.offset));

/**
 * @typedef {object} Keyboard
 * @property {number} baseOctave Octave of the lowest visible C.
 * @property {number} octaves Visible octaves; a closing top C is shown as well,
 *   and from two octaves on the D and E above it (see keyboardRange).
 */

/**
 * Creates a keyboard view clamped to C2..C7. Without a base octave the view is
 * centred on middle C (two octaves: C3..E5, one octave: C4..C5).
 * @param {{ octaves?: number, baseOctave?: number }} [options]
 * @returns {Keyboard}
 */
export function createKeyboard({ octaves = 2, baseOctave } = {}) {
  const count = clamp(Math.round(octaves), 1, HIGHEST_OCTAVE - LOWEST_OCTAVE);
  const base = baseOctave === undefined ? MIDDLE_C_OCTAVE - Math.floor(count / 2) : Math.round(baseOctave);
  return { baseOctave: clamp(base, LOWEST_OCTAVE, HIGHEST_OCTAVE - count), octaves: count };
}

/**
 * Inclusive MIDI range shown by a keyboard, from its low C to the closing top C.
 * A keyboard of two octaves or more, which already shows both rows of computer
 * keys, also shows the notes up to the last computer key (P, the E above the
 * top C), so every computer key has a key on screen. The range never goes
 * above C7.
 * @param {Keyboard} keyboard
 * @returns {{ low: number, high: number }}
 */
export function keyboardRange({ baseOctave, octaves }) {
  const low = firstMidiOf(baseOctave);
  const span = octaves >= 2 ? Math.max(12 * octaves, KEYS_SPAN) : 12 * octaves;
  return { low, high: Math.min(low + span, HIGHEST_MIDI) };
}

/**
 * Moves a keyboard by whole octaves, staying inside C2..C7.
 * @param {Keyboard} keyboard
 * @param {number} delta Octaves to move; negative moves down.
 * @returns {Keyboard}
 */
export function shiftOctave(keyboard, delta) {
  return createKeyboard({ octaves: keyboard.octaves, baseOctave: keyboard.baseOctave + delta });
}

/**
 * Whether shifting by `delta` octaves would move the keyboard at all.
 * @param {Keyboard} keyboard
 * @param {number} delta
 * @returns {boolean}
 */
export function canShiftOctave(keyboard, delta) {
  return shiftOctave(keyboard, delta).baseOctave !== keyboard.baseOctave;
}

/**
 * The visible keys, lowest first (see keyboardRange). `whiteIndex` is the
 * position of a white key; a black key gets the index of the white key on its
 * left. `label` is the computer key that plays the note, or "" when none does.
 * @param {Keyboard} keyboard
 * @param {number} [keysOctave=keyboard.baseOctave] Octave played by the lower row of computer keys.
 * @returns {{ midi: number, name: string, black: boolean, whiteIndex: number, label: string }[]}
 */
export function visibleKeys(keyboard, keysOctave = keyboard.baseOctave) {
  const { low, high } = keyboardRange(keyboard);
  const keys = [];
  let whiteIndex = -1;
  for (let midi = low; midi <= high; midi += 1) {
    const black = isBlackKey(midi);
    if (!black) whiteIndex += 1;
    keys.push({ midi, name: midiToNoteName(midi), black, whiteIndex, label: labelFor(midi, keysOctave) });
  }
  return keys;
}

/**
 * MIDI note played by a physical key, or null when the key is not bound or the
 * note would fall outside C2..C7.
 * @param {string} code KeyboardEvent.code, e.g. "KeyZ" or "Digit2".
 * @param {number} baseOctave Octave played by the lower row (Z .. M).
 * @returns {number | null}
 */
export function midiForCode(code, baseOctave) {
  const bound = BINDING_BY_CODE.get(code);
  if (!bound) return null;
  const midi = firstMidiOf(baseOctave) + bound.offset;
  return midi >= LOWEST_MIDI && midi <= HIGHEST_MIDI ? midi : null;
}

/**
 * Shifts a keyboard by as few octaves as possible so that the notes low..high
 * are visible. When the span is wider than the keyboard, `low` is shown.
 * @param {Keyboard} keyboard
 * @param {number} low
 * @param {number} [high=low]
 * @returns {Keyboard} The same object when nothing has to move.
 */
export function ensureVisible(keyboard, low, high = low) {
  if (shows(keyboard, low, high)) return keyboard;
  const positions = allPositions(keyboard.octaves);
  const nearest = (from, to) => closest(keyboard, positions.filter((position) => shows(position, from, to)));
  return nearest(low, high) ?? nearest(low, low) ?? keyboard;
}

function binding(code, offset) {
  return { code, label: code.replace(/^(Key|Digit)/, ''), offset };
}

function labelFor(midi, baseOctave) {
  return BINDING_BY_OFFSET.get(midi - firstMidiOf(baseOctave))?.label ?? '';
}

function firstMidiOf(octave) {
  return (octave + 1) * 12;
}

function shows(keyboard, low, high) {
  const range = keyboardRange(keyboard);
  return range.low <= low && high <= range.high;
}

function allPositions(octaves) {
  const positions = [];
  for (let base = LOWEST_OCTAVE; base <= HIGHEST_OCTAVE - octaves; base += 1) {
    positions.push({ baseOctave: base, octaves });
  }
  return positions;
}

function closest(keyboard, candidates) {
  const distance = (candidate) => Math.abs(candidate.baseOctave - keyboard.baseOctave);
  return candidates.reduce((best, candidate) => (best === null || distance(candidate) < distance(best) ? candidate : best), null);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
