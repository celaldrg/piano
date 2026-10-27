/**
 * Instrument presets as plain data and the ADSR envelope they use.
 * Pure module with no DOM or Web Audio access.
 * @module instruments
 */

/**
 * @typedef {object} Envelope Linear ADSR envelope.
 * @property {number} attack Seconds from silence to full level.
 * @property {number} decay Seconds from full level down to the sustain level.
 * @property {number} sustain Level (0..1) held while the key stays down.
 * @property {number} release Seconds from the level at note-off down to silence.
 */

/**
 * @typedef {object} Oscillator
 * @property {'sine'|'triangle'|'square'|'sawtooth'} type Web Audio waveform.
 * @property {number} detune Detune in cents.
 * @property {number} gain Mix level; the levels of one preset add up to at most 1.
 */

/**
 * @typedef {object} Instrument
 * @property {string} id Also the i18n key suffix for the display name.
 * @property {Oscillator[]} oscillators
 * @property {Envelope} envelope
 */

/** Id of the preset selected by default. */
export const DEFAULT_INSTRUMENT_ID = 'epiano';

/** @type {Instrument[]} */
export const INSTRUMENTS = [
  {
    id: 'epiano', // two slightly detuned oscillators give a soft chorus
    oscillators: [
      { type: 'sine', detune: -6, gain: 0.6 },
      { type: 'triangle', detune: 6, gain: 0.3 },
    ],
    envelope: { attack: 0.005, decay: 1.4, sustain: 0.2, release: 0.45 },
  },
  {
    id: 'soft',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.9 }],
    envelope: { attack: 0.03, decay: 0.5, sustain: 0.6, release: 0.6 },
  },
  {
    id: 'flute',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.9 }],
    envelope: { attack: 0.08, decay: 0.2, sustain: 0.85, release: 0.3 },
  },
  {
    id: 'chip',
    oscillators: [{ type: 'square', detune: 0, gain: 0.3 }],
    envelope: { attack: 0.002, decay: 0.1, sustain: 0.6, release: 0.08 },
  },
];

/**
 * Looks up a preset by id and falls back to the default one, so a stale saved
 * setting can never break the synth.
 * @param {string} id
 * @returns {Instrument}
 */
export function getInstrument(id) {
  return findInstrument(id) ?? findInstrument(DEFAULT_INSTRUMENT_ID);
}

/**
 * Gain (0..1) of a linear ADSR envelope `t` seconds after note-on. After
 * `releaseAt` the gain falls linearly from the level reached at that moment.
 * @param {number} t Seconds since note-on.
 * @param {Envelope} envelope
 * @param {number} [releaseAt=Infinity] Seconds since note-on when the key was released.
 * @returns {number}
 */
export function adsrGain(t, envelope, releaseAt = Infinity) {
  if (t < releaseAt) return heldGain(t, envelope);
  const progress = envelope.release > 0 ? (t - releaseAt) / envelope.release : 1;
  return progress >= 1 ? 0 : heldGain(releaseAt, envelope) * (1 - progress);
}

function findInstrument(id) {
  return INSTRUMENTS.find((instrument) => instrument.id === id);
}

function heldGain(t, { attack, decay, sustain }) {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
  return sustain;
}
