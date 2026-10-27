/**
 * Entry point: connects the piano model, the synth and the views to the page.
 * This is the only module that touches the DOM when it is imported.
 * @module main
 */
import { createDemoPiano } from './demo.js';
import { setText } from './dom.js';
import { formatClock, formatHz, formatPercent, noteLabel, normalizeLanguage, plural, spokenNoteLabel, translate } from './i18n.js';
import { INSTRUMENTS, getInstrument } from './instruments.js';
import { canShiftOctave, midiForCode } from './keyboard.js';
import { createKeysView } from './keys-view.js';
import { MELODIES } from './melodies.js';
import { midiToFrequency } from './music.js';
import { createPiano } from './piano.js';
import { activeNotesAt, scheduleDuration, scheduleFromMelody, scheduleFromRecording } from './player.js';
import { recordingsFromJSON, recordingsToJSON } from './recorder.js';
import { loadText, saveText } from './storage.js';
import { createSynth } from './synth.js';
import { renderTakes } from './takes-view.js';
import { createTrailView } from './trail-view.js';

/** "?demo" shows a fixed mid-session state for the README screenshot. */
const DEMO = new URLSearchParams(location.search).has('demo');
/** Two octaves and the keys up to E above them (17 white keys) fit once each stays at least 40 px wide. */
const WIDE = matchMedia('(min-width: 780px)');
const DEFAULT_VOLUME = 80;
const CLEAR_CONFIRM_MS = 3000;
const RECORDING_TICK_MS = 500;
const OCTAVE_KEYS = new Map([
  ['ArrowLeft', -1],
  ['ArrowRight', 1],
]);
const FORM_FIELDS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

const byId = (id) => document.getElementById(id);
const ui = {
  langToggle: byId('lang-toggle'),
  instrument: byId('instrument'),
  volume: byId('volume'),
  volumeValue: byId('volume-value'),
  octaveDown: byId('octave-down'),
  octaveUp: byId('octave-up'),
  octaveRange: byId('octave-range'),
  sustain: byId('sustain'),
  labels: byId('labels'),
  readout: byId('readout'),
  readoutNote: byId('readout-note'),
  readoutHz: byId('readout-hz'),
  trail: byId('trail'),
  trailEmpty: byId('trail-empty'),
  keys: byId('keys'),
  record: byId('rec-record'),
  stop: byId('rec-stop'),
  play: byId('rec-play'),
  clear: byId('rec-clear'),
  clearLabel: byId('rec-clear-label'),
  recStatus: byId('rec-status'),
  takesTitle: byId('takes-title'),
  takes: byId('takes'),
  melody: byId('melody'),
  melodyPlay: byId('mel-play'),
  melodyPlayLabel: byId('mel-play-label'),
  learn: byId('mel-learn'),
  learnLabel: byId('mel-learn-label'),
  progress: byId('learn-progress'),
  melodyStatus: byId('mel-status'),
  melodyDetail: byId('mel-detail'),
};

/** The demo neither reads nor writes storage, so it always looks the same. */
const load = (key) => (DEMO ? null : loadText(key));

function save(key, value) {
  if (!DEMO) saveText(key, value);
}

const settings = {
  language: normalizeLanguage(load('lang')),
  instrument: getInstrument(load('instrument')).id,
  volume: savedVolume(),
  labels: load('labels') !== 'off',
  melody: MELODIES.find((melody) => melody.id === load('melody'))?.id ?? MELODIES[0].id,
};

const now = () => performance.now();
const octaveCount = () => (WIDE.matches ? 2 : 1);
const piano = DEMO
  ? createDemoPiano({ now, octaves: octaveCount() })
  : createPiano({ now, octaves: octaveCount(), recordings: recordingsFromJSON(load('recordings')) });
const synth = createSynth();
const keysView = createKeysView(ui.keys, { press: pressNote, release: releaseNote });
const trailView = createTrailView(ui.trail);

let sustainLatched = false; // the Sustain button
let spaceDown = false; // the Space key
let recordingSince = 0;
let recordingTimer = null;
let clearTimer = null; // set while Clear waits for a second click
let notice = null; // i18n key of a one-off recorder message
let playback = null; // { kind: 'take'|'melody', id, schedule, origin, length, active }
let frame = 0;
let shownTakes = {};

function savedVolume() {
  const value = Number(load('volume') ?? DEFAULT_VOLUME);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : DEFAULT_VOLUME;
}

// ---- playing notes -------------------------------------------------------

function perform(actions) {
  synth.perform(actions);
  render();
}

function pressNote(source, midi) {
  perform(piano.press(source, midi));
}

function releaseNote(source) {
  perform(piano.release(source));
}

function applySustain() {
  perform(piano.setSustain(sustainLatched || spaceDown));
}

/** Lets go of every key, e.g. when the page loses focus mid-chord; a latched pedal stays down. */
function releaseEverything() {
  spaceDown = false;
  perform([...piano.releaseAll(), ...piano.setSustain(sustainLatched)]);
}

function shiftOctave(delta) {
  piano.shiftOctave(delta);
  render();
}

function onKeyDown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const midi = midiForCode(event.code, piano.getState().keysOctave);
  if (event.code === 'Space') {
    event.preventDefault();
    if (!event.repeat) {
      spaceDown = true;
      applySustain();
    }
  } else if (midi !== null) {
    event.preventDefault();
    if (!event.repeat) {
      piano.reveal(midi); // an off-screen note scrolls into view, so its key can glow
      pressNote(`key:${event.code}`, midi);
    }
  } else if (OCTAVE_KEYS.has(event.code) && !FORM_FIELDS.has(event.target.tagName)) {
    event.preventDefault();
    shiftOctave(OCTAVE_KEYS.get(event.code));
  }
}

function onKeyUp(event) {
  if (event.code === 'Space') {
    event.preventDefault();
    spaceDown = false;
    applySustain();
  } else {
    releaseNote(`key:${event.code}`);
  }
}

// ---- recorder ------------------------------------------------------------

function toggleRecording() {
  if (piano.getState().recording) finishRecording();
  else startRecording();
}

function startRecording() {
  if (playback?.kind === 'take') stopPlayback();
  notice = null;
  piano.startRecording();
  recordingSince = now();
  recordingTimer = setInterval(render, RECORDING_TICK_MS);
  render();
}

function finishRecording() {
  clearInterval(recordingTimer);
  const take = piano.stopRecording();
  notice = take === null ? 'rec.nothing' : null;
  if (take !== null) saveTakes();
  render();
}

function stopRecorder() {
  if (piano.getState().recording) finishRecording();
  if (playback?.kind === 'take') stopPlayback();
}

function playNewestTake() {
  const { recordings } = piano.getState();
  if (recordings.length > 0) playTake(recordings[recordings.length - 1]);
}

function toggleTake(id) {
  const { recording, recordings } = piano.getState();
  const take = recordings.find((candidate) => candidate.id === id);
  if (playback?.kind === 'take' && playback.id === id) stopPlayback();
  else if (take && !recording) playTake(take);
}

function playTake(take) {
  notice = null;
  startPlayback('take', take.id, scheduleFromRecording(take));
}

/** The first click arms Clear; a second click within a few seconds deletes every take. */
function clearTakes() {
  if (clearTimer === null) {
    clearTimer = setTimeout(() => {
      clearTimer = null;
      render();
    }, CLEAR_CONFIRM_MS);
  } else {
    clearTimeout(clearTimer);
    clearTimer = null;
    if (playback?.kind === 'take') stopPlayback();
    piano.clearRecordings();
    notice = null;
    saveTakes();
  }
  render();
}

function saveTakes() {
  save('recordings', recordingsToJSON(piano.getState().recordings));
}

// ---- melodies and playback -------------------------------------------------

const selectedMelody = () => MELODIES.find((melody) => melody.id === settings.melody);

function toggleMelody() {
  if (playback?.kind === 'melody') stopPlayback();
  else startPlayback('melody', settings.melody, scheduleFromMelody(selectedMelody()));
}

function toggleLesson() {
  if (piano.getState().lesson) piano.stopLesson();
  else piano.startLesson(selectedMelody());
  render();
}

function chooseMelody() {
  settings.melody = ui.melody.value;
  save('melody', settings.melody);
  if (playback?.kind === 'melody') stopPlayback();
  piano.stopLesson();
  render();
}

function startPlayback(kind, id, schedule) {
  stopPlayback();
  const origin = synth.play(schedule);
  if (origin === null) return;
  const pitches = schedule.map((note) => note.midi);
  piano.reveal(Math.min(...pitches), Math.max(...pitches));
  playback = { kind, id, schedule, origin, length: scheduleDuration(schedule), active: [] };
  frame = requestAnimationFrame(followPlayback);
  render();
}

/** Lights the keys of the notes playing now, in step with the audio clock. */
function followPlayback() {
  const elapsed = synth.time() - playback.origin;
  if (elapsed > playback.length) {
    endPlayback();
    return;
  }
  const active = activeNotesAt(playback.schedule, elapsed);
  if (active.join() !== playback.active.join()) {
    playback.active = active;
    if (active.length > 0) piano.reveal(active[0], active[active.length - 1]);
    render();
  }
  frame = requestAnimationFrame(followPlayback);
}

function stopPlayback() {
  if (playback === null) return;
  synth.stopPlayback();
  endPlayback();
}

function endPlayback() {
  cancelAnimationFrame(frame);
  playback = null;
  render();
}

// ---- language and rendering ----------------------------------------------

function applyLanguage() {
  const { language } = settings;
  const t = (key) => translate(language, key);
  document.documentElement.lang = language;
  document.title = t('app.title');
  document.querySelectorAll('[data-i18n]').forEach((node) => setText(node, t(node.dataset.i18n)));
  document.querySelectorAll('[data-i18n-label]').forEach((node) => node.setAttribute('aria-label', t(node.dataset.i18nLabel)));
  fillSelect(ui.instrument, INSTRUMENTS.map(({ id }) => [id, t(`instrument.${id}`)]), settings.instrument);
  fillSelect(ui.melody, MELODIES.map(({ id }) => [id, t(`melody.${id}`)]), settings.melody);
  render();
}

function fillSelect(select, options, value) {
  select.replaceChildren(...options.map(([id, label]) => new Option(label, id)));
  select.value = value;
}

function render() {
  const state = piano.getState();
  const { language } = settings;
  const t = (key, params) => translate(language, key, params);
  const nameOf = (midi) => noteLabel(midi, language);
  renderControls(state, nameOf);
  renderPlayArea(state, t, nameOf);
  renderRecorder(state, t);
  renderMelodies(state, t, nameOf);
}

function renderControls({ keyboard, sustain }, nameOf) {
  setText(ui.octaveRange, `${nameOf(keyboard.low)}–${nameOf(keyboard.high)}`);
  ui.octaveDown.disabled = !canShiftOctave(keyboard, -1);
  ui.octaveUp.disabled = !canShiftOctave(keyboard, 1);
  ui.sustain.setAttribute('aria-pressed', String(sustain));
  ui.labels.setAttribute('aria-pressed', String(settings.labels));
  setText(ui.volumeValue, formatPercent(settings.volume / 100, settings.language));
  ui.volume.style.setProperty('--fill', `${settings.volume}%`);
}

function renderPlayArea(state, t, nameOf) {
  renderKeys(state, nameOf);
  trailView.render(state.trail, nameOf, settings.language);
  const last = state.trail[state.trail.length - 1];
  ui.readout.hidden = !last;
  ui.trail.hidden = !last;
  ui.trailEmpty.hidden = Boolean(last);
  if (last) {
    setText(ui.readoutNote, nameOf(last.midi));
    setText(ui.readoutHz, t('readout.hz', { hz: formatHz(midiToFrequency(last.midi), settings.language) }));
  }
}

function renderKeys(state, nameOf) {
  const { language } = settings;
  keysView.render({
    keyboard: state.keyboard,
    keysOctave: state.keysOctave,
    down: new Set([...state.held, ...(playback ? playback.active : [])]),
    ringing: new Set(state.sounding),
    next: state.lesson ? state.lesson.expected : null,
    labels: settings.labels,
    language,
    nameOf,
    speak: (midi) => spokenNoteLabel(midi, language),
  });
}

function renderRecorder(state, t) {
  const { recording, recordings } = state;
  const playingId = playback?.kind === 'take' ? playback.id : null;
  ui.record.setAttribute('aria-pressed', String(recording));
  ui.stop.disabled = !recording && playingId === null;
  ui.play.disabled = recording || recordings.length === 0;
  ui.clear.disabled = recording || recordings.length === 0;
  ui.clear.classList.toggle('is-armed', clearTimer !== null);
  setText(ui.clearLabel, t(clearTimer === null ? 'rec.clear' : 'rec.confirm'));
  setText(ui.recStatus, recorderStatus(state, playingId, t));
  ui.takesTitle.hidden = recordings.length === 0;
  renderTakeList({ takes: recordings, playingId, disabled: recording, language: settings.language }, t);
}

function recorderStatus({ recording, recordings }, playingId, t) {
  if (recording) return t('rec.recording', { time: formatClock(now() - recordingSince) });
  if (playingId !== null) return t('rec.playing', { id: playingId });
  if (notice !== null) return t(notice);
  if (recordings.length > 0) return plural(settings.language, 'rec.saved', recordings.length);
  return t('rec.empty');
}

/** Redraws the takes only when something they show has changed. */
function renderTakeList(view, t) {
  if (Object.keys(view).every((key) => view[key] === shownTakes[key])) return;
  shownTakes = view;
  renderTakes(ui.takes, { ...view, t, count: (key, n) => plural(view.language, key, n) });
}

function renderMelodies({ lesson }, t, nameOf) {
  const playing = playback?.kind === 'melody';
  ui.melodyPlay.classList.toggle('is-playing', playing);
  setText(ui.melodyPlayLabel, t(playing ? 'mel.stop' : 'mel.play'));
  ui.learn.classList.toggle('is-active', lesson !== null);
  setText(ui.learnLabel, t(lesson ? 'mel.end' : 'mel.learn'));
  ui.progress.hidden = lesson === null;
  ui.melodyDetail.hidden = lesson === null;
  if (lesson) {
    ui.progress.style.setProperty('--progress', String(lesson.index / lesson.total));
    ui.progress.setAttribute('aria-valuemax', String(lesson.total));
    ui.progress.setAttribute('aria-valuenow', String(lesson.index));
    setText(ui.melodyDetail, t('learn.progress', { index: lesson.index, total: lesson.total, mistakes: lesson.mistakes }));
  }
  ui.melodyStatus.classList.toggle('is-miss', Boolean(lesson && !lesson.done && lesson.last === 'miss'));
  ui.melodyStatus.classList.toggle('is-done', Boolean(lesson?.done));
  setText(ui.melodyStatus, melodyStatus(lesson, playing, t, nameOf));
}

function melodyStatus(lesson, playing, t, nameOf) {
  if (lesson?.done) return t('learn.done', { total: lesson.total });
  if (lesson) return t(lesson.last === 'miss' ? 'learn.miss' : 'learn.next', { note: nameOf(lesson.expected) });
  if (playing) return t('mel.playing', { name: t(`melody.${playback.id}`) });
  return t('mel.idle');
}

// ---- wiring --------------------------------------------------------------

ui.langToggle.addEventListener('click', () => {
  settings.language = settings.language === 'en' ? 'tr' : 'en';
  save('lang', settings.language);
  applyLanguage();
});
ui.instrument.addEventListener('change', () => {
  settings.instrument = ui.instrument.value;
  synth.setInstrument(settings.instrument);
  save('instrument', settings.instrument);
});
ui.volume.addEventListener('input', () => {
  settings.volume = Number(ui.volume.value);
  synth.setVolume(settings.volume / 100);
  render();
});
ui.volume.addEventListener('change', () => save('volume', String(settings.volume)));
ui.octaveDown.addEventListener('click', () => shiftOctave(-1));
ui.octaveUp.addEventListener('click', () => shiftOctave(1));
ui.sustain.addEventListener('click', () => {
  sustainLatched = !sustainLatched;
  applySustain();
});
ui.labels.addEventListener('click', () => {
  settings.labels = !settings.labels;
  save('labels', settings.labels ? 'on' : 'off');
  render();
});
ui.record.addEventListener('click', toggleRecording);
ui.stop.addEventListener('click', stopRecorder);
ui.play.addEventListener('click', playNewestTake);
ui.clear.addEventListener('click', clearTakes);
ui.takes.addEventListener('click', (event) => {
  const button = event.target.closest('[data-take]');
  if (button) toggleTake(Number(button.dataset.take));
});
ui.melody.addEventListener('change', chooseMelody);
ui.melodyPlay.addEventListener('click', toggleMelody);
ui.learn.addEventListener('click', toggleLesson);

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('blur', releaseEverything);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  releaseEverything();
  stopPlayback();
});
WIDE.addEventListener('change', () => {
  piano.setOctaves(octaveCount());
  render();
});
// Browsers allow audio only after a gesture; a tap counts once the finger lifts.
['pointerup', 'keydown', 'click'].forEach((type) => document.addEventListener(type, synth.wake, true));

synth.setInstrument(settings.instrument);
synth.setVolume(settings.volume / 100);
ui.volume.value = String(settings.volume);
applyLanguage();
