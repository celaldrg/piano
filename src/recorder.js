/**
 * Recorder for note-on/note-off events timed by an injected clock, with 1/16
 * quantization and JSON persistence. Pure module with no DOM access.
 * @module recorder
 */

/**
 * @typedef {object} NoteEvent
 * @property {'on'|'off'} type
 * @property {number} midi
 * @property {number} time Milliseconds since the first note-on of the take.
 */

/**
 * @typedef {object} Recording
 * @property {NoteEvent[]} events In chronological order.
 * @property {number} duration Milliseconds until the last event.
 * @property {number} [id] Take number, set when the take is added to a list.
 */

/**
 * @typedef {object} RecordedNote
 * @property {number} midi
 * @property {number} start Milliseconds.
 * @property {number} end Milliseconds.
 */

/** Most takes kept in a list; the oldest ones are dropped first. */
export const MAX_RECORDINGS = 8;

/**
 * Creates a recorder. Event times are whole milliseconds counted from the first
 * note-on, so silence before the first note is not kept.
 * @param {{ now: () => number }} options `now` returns the time in ms (e.g. performance.now).
 */
export function createRecorder({ now }) {
  let active = false;
  let origin = 0;
  let events = [];
  const open = new Set();

  function record(type, midi) {
    const time = now();
    if (events.length === 0) origin = time;
    events.push({ type, midi, time: Math.round(time - origin) });
  }

  /** Records a note-on; ignored while idle or when the note is already on. */
  function noteOn(midi) {
    if (!active || open.has(midi)) return;
    open.add(midi);
    record('on', midi);
  }

  /** Records a note-off; ignored while idle or when the note is not on. */
  function noteOff(midi) {
    if (active && open.delete(midi)) record('off', midi);
  }

  /** Starts a new, empty take. */
  function start() {
    active = true;
    events = [];
    open.clear();
  }

  /**
   * Stops recording and closes notes that are still on.
   * @returns {Recording | null} The take, or null when no note was played.
   */
  function stop() {
    if (!active) return null;
    [...open].forEach(noteOff);
    active = false;
    return events.length === 0 ? null : { events, duration: events[events.length - 1].time };
  }

  return { start, stop, noteOn, noteOff, isRecording: () => active };
}

/**
 * Length of one sixteenth note in milliseconds.
 * @param {number} bpm Tempo in quarter-note beats per minute.
 * @returns {number}
 * @throws {RangeError} When bpm is not a positive finite number.
 */
export function sixteenthMs(bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError(`Invalid tempo: ${bpm}`);
  return 15000 / bpm;
}

/**
 * Pairs the note-on and note-off events of a recording into notes, sorted by
 * start time and then pitch. A note left on lasts until the recording ends.
 * @param {Recording} recording
 * @returns {RecordedNote[]}
 */
export function recordingToNotes({ events, duration }) {
  const open = new Map();
  const notes = [];
  for (const { type, midi, time } of events) {
    if (type === 'on' && !open.has(midi)) {
      open.set(midi, time);
    } else if (type === 'off' && open.has(midi)) {
      notes.push({ midi, start: open.get(midi), end: time });
      open.delete(midi);
    }
  }
  open.forEach((start, midi) => notes.push({ midi, start, end: Math.max(start, duration) }));
  return notes.sort(byStartThenPitch);
}

/**
 * Snaps a recording to a 1/16-note grid. Every note keeps at least one grid
 * step, and repeated notes of the same pitch never overlap.
 * @param {Recording} recording
 * @param {number} bpm Tempo in quarter-note beats per minute.
 * @returns {Recording} A new recording; other fields such as `id` are kept.
 */
export function quantizeRecording(recording, bpm) {
  const step = sixteenthMs(bpm);
  const snap = (time) => Math.round(time / step) * step;
  const snapped = recordingToNotes(recording).map(({ midi, start, end }) => {
    const from = snap(start);
    return { midi, start: from, end: Math.max(snap(end), from + step) };
  });
  return { ...recording, ...notesToRecording(separateRepeats(snapped)) };
}

/** Tempos offered for snapping takes to the 1/16 grid, in BPM. */
export const SNAP_TEMPOS = [60, 80, 100, 120, 140, 160];
/** Tempo used when no valid snap tempo was saved. */
export const DEFAULT_SNAP_TEMPO = 120;

/**
 * Reads a saved snap tempo; anything that is not one of SNAP_TEMPOS gives the default.
 * @param {unknown} value E.g. the text kept in storage.
 * @returns {number} One of SNAP_TEMPOS.
 */
export function snapTempo(value) {
  const bpm = Number(value);
  return SNAP_TEMPOS.includes(bpm) ? bpm : DEFAULT_SNAP_TEMPO;
}

/**
 * The version of a take to play back: snapped to the 1/16 grid when snapping is
 * on, otherwise the take itself. The saved take is never changed.
 * @param {Recording} take
 * @param {{ snap: boolean, bpm: number }} options
 * @returns {Recording}
 */
export function takeForPlayback(take, { snap, bpm }) {
  return snap ? quantizeRecording(take, bpm) : take;
}

/**
 * Appends a take to a list and numbers it with the next free id (1, 2, 3 ...).
 * @param {Recording[]} list
 * @param {Recording} recording
 * @param {number} [limit=MAX_RECORDINGS] Maximum list length; the oldest takes go first.
 * @returns {Recording[]} A new list.
 */
export function addRecording(list, recording, limit = MAX_RECORDINGS) {
  const id = list.reduce((max, take) => Math.max(max, take.id), 0) + 1;
  return [...list, { id, events: recording.events, duration: recording.duration }].slice(-limit);
}

/**
 * Serializes a list of numbered takes.
 * @param {Recording[]} list
 * @returns {string} JSON text.
 */
export function recordingsToJSON(list) {
  return JSON.stringify(list.map(({ id, events, duration }) => ({ id, events, duration })));
}

/**
 * Parses takes saved by recordingsToJSON. Never throws: malformed JSON gives an
 * empty list and invalid takes are dropped.
 * @param {string | null} text
 * @returns {Recording[]}
 */
export function recordingsFromJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  return Array.isArray(data) ? data.map(normalizeRecording).filter(Boolean) : [];
}

function separateRepeats(notes) {
  const lastByPitch = new Map();
  for (const note of [...notes].sort(byStartThenPitch)) {
    const previous = lastByPitch.get(note.midi);
    if (previous && previous.end > note.start) previous.end = note.start;
    lastByPitch.set(note.midi, note);
  }
  return notes.filter((note) => note.end > note.start);
}

function notesToRecording(notes) {
  const events = notes
    .flatMap(({ midi, start, end }) => [
      { type: 'on', midi, time: start },
      { type: 'off', midi, time: end },
    ])
    .sort(byEventOrder);
  return { events, duration: events.length === 0 ? 0 : events[events.length - 1].time };
}

function normalizeRecording(value) {
  if (!value || !Number.isInteger(value.id) || value.id < 1 || !Array.isArray(value.events)) return null;
  const events = value.events.map(normalizeEvent);
  if (events.length === 0 || events.includes(null) || !isChronological(events)) return null;
  const last = events[events.length - 1].time;
  if (!Number.isFinite(value.duration) || value.duration < last) return null;
  return { id: value.id, events, duration: value.duration };
}

function normalizeEvent(event) {
  const valid =
    Boolean(event) &&
    (event.type === 'on' || event.type === 'off') &&
    Number.isInteger(event.midi) &&
    event.midi >= 0 &&
    event.midi <= 127 &&
    Number.isFinite(event.time) &&
    event.time >= 0;
  return valid ? { type: event.type, midi: event.midi, time: event.time } : null;
}

function isChronological(events) {
  return events.every((event, index) => index === 0 || event.time >= events[index - 1].time);
}

function byStartThenPitch(a, b) {
  return a.start - b.start || a.midi - b.midi;
}

/** Chronological; at equal times a note-off comes before a note-on. */
function byEventOrder(a, b) {
  if (a.time !== b.time) return a.time - b.time;
  if (a.type !== b.type) return a.type === 'off' ? -1 : 1;
  return a.midi - b.midi;
}
