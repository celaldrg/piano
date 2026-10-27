/**
 * Web Audio synth: one voice per sounding note, shaped by the instrument's
 * ADSR envelope, and a lookahead scheduler that plays takes and melodies.
 * The audio context is created only after the page has had a user gesture,
 * and nothing touches Web Audio at import time. A touch counts as a gesture
 * only once the finger lifts, so notes pressed before that wait and sound as
 * soon as audio is allowed: the first tap on a phone is heard too.
 * @module synth
 */
import { DEFAULT_INSTRUMENT_ID, adsrGain, getInstrument } from './instruments.js';
import { midiToFrequency } from './music.js';

const VOICE_PEAK = 0.3; // gain of one voice at full level; the limiter catches big chords
const LOOKAHEAD = 0.3; // seconds of a schedule queued ahead of the audio clock
const SCHEDULE_EVERY_MS = 80;
const START_DELAY = 0.05; // seconds between pressing Play and the first note
const FADE = 0.02; // time constant of the fade when playback is stopped
const DISCONNECT_AFTER_MS = 300;
const LATE_HOLD = 0.08; // seconds a note that waited for audio sounds at least, even if already let go

const ignore = () => {};

/**
 * Creates the synth. Without Web Audio every method is a silent no-op. Before
 * the first user gesture nothing sounds; notes pressed meanwhile start once
 * wake() succeeds.
 */
export function createSynth() {
  let context = null;
  let master = null;
  let instrument = getInstrument(DEFAULT_INSTRUMENT_ID);
  let volume = 0.8;
  let playback = null;
  const live = new Map(); // midi -> voice
  const waiting = new Set(); // notes pressed before audio was allowed

  /**
   * Creates or resumes the audio context once the page has been activated by
   * a user gesture, then starts the notes that were waiting for it. Call it
   * from input handlers.
   * @returns {boolean} Whether audio is available now.
   */
  function wake() {
    if (context) {
      if (context.state !== 'running') context.resume().catch(ignore);
      return true;
    }
    const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    const activation = globalThis.navigator?.userActivation;
    if (!AudioContextClass || (activation && !activation.hasBeenActive)) return false;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = volume;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 4;
    master.connect(limiter).connect(context.destination);
    const at = context.currentTime;
    waiting.forEach((midi) => live.set(midi, { ...startVoice(midi, at, master), holdUntil: at + LATE_HOLD }));
    waiting.clear();
    return true;
  }

  function startVoice(midi, at, output) {
    const { oscillators, envelope } = instrument;
    const amp = context.createGain();
    amp.gain.value = 0;
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(VOICE_PEAK, at + envelope.attack);
    amp.gain.linearRampToValueAtTime(VOICE_PEAK * envelope.sustain, at + envelope.attack + envelope.decay);
    amp.connect(output);
    const sources = oscillators.map(({ type, detune, gain }) => {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = midiToFrequency(midi);
      oscillator.detune.value = detune;
      const mix = context.createGain();
      mix.gain.value = gain;
      oscillator.connect(mix).connect(amp);
      oscillator.start(at);
      return oscillator;
    });
    return { amp, sources, start: at, envelope };
  }

  /** Fades a voice out from the level its envelope has reached at `at`. */
  function release(voice, at) {
    const level = VOICE_PEAK * adsrGain(at - voice.start, voice.envelope);
    const end = at + voice.envelope.release;
    voice.amp.gain.cancelScheduledValues(at);
    voice.amp.gain.linearRampToValueAtTime(level, at);
    voice.amp.gain.linearRampToValueAtTime(0, end);
    voice.sources.forEach((source) => source.stop(end + 0.01));
  }

  /**
   * Plays the note actions of the piano model: 'start' strikes a note and
   * 'stop' releases it. Before audio is allowed, started notes wait for wake().
   * @param {import('./tracker.js').NoteAction[]} actions
   */
  function perform(actions) {
    if (actions.length === 0) return;
    if (actions.some((action) => action.type === 'start')) wake();
    if (!context) {
      for (const { type, midi } of actions) {
        if (type === 'start') waiting.add(midi);
        else waiting.delete(midi);
      }
      return;
    }
    const now = context.currentTime;
    for (const { type, midi } of actions) {
      const voice = live.get(midi);
      if (voice) {
        release(voice, Math.max(now, voice.holdUntil ?? now));
        live.delete(midi);
      }
      if (type === 'start') live.set(midi, startVoice(midi, now, master));
    }
  }

  /**
   * Plays a schedule, replacing any playback that is still running. Notes are
   * queued a little ahead of the audio clock, so timing stays exact.
   * @param {import('./player.js').ScheduledNote[]} schedule
   * @returns {number | null} Audio-clock time of the schedule's start, or null without audio.
   */
  function play(schedule) {
    stopPlayback();
    if (!wake()) return null;
    const bus = context.createGain();
    bus.connect(master);
    const origin = context.currentTime + START_DELAY;
    const queue = [...schedule].sort((a, b) => a.time - b.time);
    const current = { bus, voices: [], timer: null };
    let next = 0;
    const pump = () => {
      const horizon = context.currentTime + LOOKAHEAD;
      while (next < queue.length && origin + queue[next].time < horizon) {
        const note = queue[next];
        const voice = startVoice(note.midi, origin + note.time, bus);
        release(voice, origin + note.time + note.duration);
        current.voices.push(voice);
        next += 1;
      }
      if (next === queue.length) clearInterval(current.timer);
    };
    current.timer = setInterval(pump, SCHEDULE_EVERY_MS);
    playback = current;
    pump();
    return origin;
  }

  /** Stops the running playback with a short fade; live notes keep sounding. */
  function stopPlayback() {
    if (playback === null) return;
    const { bus, voices, timer } = playback;
    playback = null;
    clearInterval(timer);
    const at = context.currentTime;
    bus.gain.setTargetAtTime(0, at, FADE);
    voices.forEach((voice) => voice.sources.forEach((source) => source.stop(at + FADE * 6)));
    setTimeout(() => bus.disconnect(), DISCONNECT_AFTER_MS);
  }

  return {
    wake,
    perform,
    play,
    stopPlayback,
    /** @returns {number} The audio clock in seconds (0 without audio). */
    time: () => (context ? context.currentTime : 0),
    /**
     * Sets the master volume.
     * @param {number} value 0..1.
     */
    setVolume(value) {
      volume = value;
      if (master) master.gain.setTargetAtTime(value, context.currentTime, FADE);
    },
    /**
     * Selects the instrument for notes struck from now on.
     * @param {string} id Unknown ids fall back to the default instrument.
     */
    setInstrument(id) {
      instrument = getInstrument(id);
    },
  };
}
