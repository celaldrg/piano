/**
 * The list of saved takes: a play button, the take's length and a mini piano
 * roll for each. Nothing touches the DOM at import time.
 * @module takes-view
 */
import { el, icon } from './dom.js';
import { formatClock } from './i18n.js';
import { recordingToNotes } from './recorder.js';

/** Most notes drawn in one mini piano roll. */
const MAX_BARS = 160;

/**
 * Bars of a take's mini piano roll in percent of the roll: `x` and `w` along
 * the time axis, `y` the centre line (high notes near the top).
 * @param {import('./recorder.js').Recording} take
 * @param {number} [limit=MAX_BARS] Most bars returned; later notes are left out.
 * @returns {{ x: number, w: number, y: number }[]}
 */
export function rollBars(take, limit = MAX_BARS) {
  const notes = recordingToNotes(take).slice(0, limit);
  if (notes.length === 0) return [];
  const pitches = notes.map((note) => note.midi);
  const low = Math.min(...pitches);
  const high = Math.max(...pitches);
  const length = Math.max(take.duration, 1);
  return notes.map(({ midi, start, end }) => ({
    x: (start / length) * 100,
    w: ((end - start) / length) * 100,
    y: high === low ? 50 : 15 + (70 * (high - midi)) / (high - low),
  }));
}

/**
 * Renders the saved takes, newest first. Each play button carries
 * `data-take` with the take id for one delegated click handler.
 * @param {HTMLElement} list
 * @param {object} options
 * @param {import('./recorder.js').Recording[]} options.takes Oldest first.
 * @param {number | null} options.playingId Take that is playing now.
 * @param {boolean} options.disabled Whether the play buttons are disabled (e.g. while recording).
 * @param {(key: string, params?: Record<string, string | number>) => string} options.t Translates a key.
 * @param {(key: string, count: number) => string} options.count Translates a counted phrase.
 */
export function renderTakes(list, { takes, playingId, disabled, t, count }) {
  const rows = [...takes].reverse().map((take) => takeRow(take, take.id === playingId, { disabled, t, count }));
  list.replaceChildren(...rows);
}

function takeRow(take, playing, { disabled, t, count }) {
  const row = el('li', playing ? 'take is-playing' : 'take');
  const button = el('button', 'btn btn--icon take__play');
  button.type = 'button';
  button.disabled = disabled;
  button.dataset.take = String(take.id);
  button.setAttribute('aria-label', t(playing ? 'take.stop' : 'take.play', { id: take.id }));
  button.append(icon(playing ? 'stop' : 'play'));

  const info = el('div', 'take__info');
  const meta = `${formatClock(take.duration)} · ${count('take.notes', recordingToNotes(take).length)}`;
  info.append(el('span', 'take__name', t('take.name', { id: take.id })), el('span', 'take__meta', meta));

  const roll = el('div', 'take__roll');
  roll.setAttribute('aria-hidden', 'true');
  roll.append(...rollBars(take).map(barNode));

  row.append(button, info, roll);
  return row;
}

function barNode({ x, w, y }) {
  const bar = el('i');
  bar.style.setProperty('--x', x.toFixed(2));
  bar.style.setProperty('--w', w.toFixed(2));
  bar.style.setProperty('--y', y.toFixed(2));
  return bar;
}
