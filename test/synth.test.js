import test from 'node:test';
import assert from 'node:assert/strict';
import { adsrGain, getInstrument } from '../src/instruments.js';
import { createSynth } from '../src/synth.js';

/** An AudioParam that records its automation calls. */
class FakeParam {
  constructor(value) {
    this.value = value;
    this.events = [];
  }
  setValueAtTime(value, time) {
    this.events.push(['set', value, time]);
  }
  linearRampToValueAtTime(value, time) {
    this.events.push(['ramp', value, time]);
  }
  setTargetAtTime(value, time, constant) {
    this.events.push(['target', value, time, constant]);
  }
  cancelScheduledValues(time) {
    this.events.push(['cancel', time]);
  }
}

class FakeNode {
  constructor() {
    this.outputs = [];
  }
  connect(target) {
    this.outputs.push(target);
    return target;
  }
  disconnect() {
    this.outputs = [];
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
  starts = [];
  stops = [];
  start(time) {
    this.starts.push(time);
  }
  stop(time) {
    this.stops.push(time);
  }
}

class FakeCompressor extends FakeNode {
  threshold = new FakeParam(-24);
  knee = new FakeParam(30);
  ratio = new FakeParam(12);
}

/** Enough of Web Audio for the synth; the test moves `currentTime` by hand. */
class FakeAudioContext {
  static created = [];
  currentTime = 0;
  state = 'running';
  destination = new FakeNode();
  oscillators = [];
  constructor() {
    FakeAudioContext.created.push(this);
  }
  createGain() {
    return new FakeGain();
  }
  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createDynamicsCompressor() {
    return new FakeCompressor();
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}

/** Installs the fake as the global AudioContext for one test. */
function useFakeAudio(t) {
  FakeAudioContext.created = [];
  globalThis.AudioContext = FakeAudioContext;
  t.after(() => delete globalThis.AudioContext);
  return () => FakeAudioContext.created[0];
}

/** A page that has not had a user gesture yet; set `hasBeenActive` to give it one. */
function useUserActivation(t) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const activation = { hasBeenActive: false };
  Object.defineProperty(globalThis, 'navigator', { value: { userActivation: activation }, configurable: true });
  t.after(() => Object.defineProperty(globalThis, 'navigator', saved));
  return activation;
}

const start = (midi) => ({ type: 'start', midi });
const stop = (midi) => ({ type: 'stop', midi });
/** The voice gain behind an oscillator: oscillator -> mix gain -> voice gain. */
const voiceGainOf = (oscillator) => oscillator.outputs[0].outputs[0];

function assertNear(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} ${actual} is not ${expected}`);
}

function assertEvents(actual, expected) {
  assert.equal(actual.length, expected.length, JSON.stringify(actual));
  actual.forEach((event, index) => {
    assert.equal(event[0], expected[index][0]);
    event.slice(1).forEach((value, at) => assertNear(value, expected[index][at + 1], `event ${index}`));
  });
}

test('without Web Audio every call is a silent no-op', () => {
  const synth = createSynth();
  assert.equal(synth.wake(), false);
  synth.perform([start(60), stop(60)]);
  synth.setVolume(0.5);
  assert.equal(synth.play([{ time: 0, duration: 1, midi: 60 }]), null);
  synth.stopPlayback();
  assert.equal(synth.time(), 0);
});

test('no audio context is created before the first user gesture', (t) => {
  const context = useFakeAudio(t);
  const activation = useUserActivation(t);
  const synth = createSynth();
  synth.perform([start(60)]);
  assert.equal(context(), undefined);
  activation.hasBeenActive = true;
  assert.equal(synth.wake(), true);
  assert.ok(context());
  context().state = 'suspended';
  synth.wake();
  assert.equal(context().state, 'running', 'a suspended context is resumed');
});

test('a key pressed before audio is allowed sounds once the gesture completes', (t) => {
  const context = useFakeAudio(t);
  const activation = useUserActivation(t);
  const synth = createSynth();
  synth.setInstrument('flute');
  const { envelope } = getInstrument('flute');
  synth.perform([start(60), start(64)]); // fingers down: a touch is not a gesture yet
  synth.perform([stop(64)]); // let go before audio was allowed: never sounds
  assert.equal(context(), undefined);

  activation.hasBeenActive = true; // the first finger lifts
  synth.wake();
  assert.equal(context().oscillators.length, 1, 'only the note still down starts');
  const [oscillator] = context().oscillators;
  assertNear(oscillator.frequency.value, 261.6255653005986);
  assert.deepEqual(oscillator.starts, [0]);

  synth.perform([stop(60)]); // released at once, it still sounds long enough to be heard
  const gain = voiceGainOf(oscillator).gain;
  const peak = gain.events[1][1];
  assertEvents(gain.events.slice(3), [
    ['cancel', 0.08],
    ['ramp', peak * adsrGain(0.08, envelope), 0.08],
    ['ramp', 0, 0.08 + envelope.release],
  ]);
  synth.wake();
  assert.equal(context().oscillators.length, 1, 'a waiting note starts only once');
});

test('a note sounds at its equal-temperament pitch and follows the envelope', (t) => {
  const context = useFakeAudio(t);
  const synth = createSynth();
  synth.setInstrument('flute');
  synth.perform([start(69)]);
  const [oscillator] = context().oscillators;
  const { envelope } = getInstrument('flute');
  assert.equal(context().oscillators.length, 1);
  assert.equal(oscillator.type, 'sine');
  assertNear(oscillator.frequency.value, 440);
  assert.deepEqual(oscillator.starts, [0]);
  const gain = voiceGainOf(oscillator).gain;
  const peak = gain.events[1][1];
  assert.ok(peak > 0 && peak <= 1);
  assertEvents(gain.events, [
    ['set', 0, 0],
    ['ramp', peak, envelope.attack],
    ['ramp', peak * envelope.sustain, envelope.attack + envelope.decay],
  ]);

  context().currentTime = 0.04; // half way through the attack
  synth.perform([stop(69)]);
  const level = peak * adsrGain(0.04, envelope);
  assertNear(level, peak / 2);
  assertEvents(gain.events.slice(3), [
    ['cancel', 0.04],
    ['ramp', level, 0.04],
    ['ramp', 0, 0.04 + envelope.release],
  ]);
  assert.equal(oscillator.stops.length, 1);
  assertNear(oscillator.stops[0], 0.04 + envelope.release + 0.01);
});

test('the electric piano layers two detuned oscillators and a struck note restarts', (t) => {
  const context = useFakeAudio(t);
  const synth = createSynth();
  synth.perform([start(60)]);
  const [first, second] = context().oscillators;
  assert.deepEqual([first.type, second.type], ['sine', 'triangle']);
  assert.deepEqual([first.detune.value, second.detune.value], [-6, 6]);
  assertNear(first.frequency.value, 261.6255653005986);
  context().currentTime = 0.5;
  synth.perform([start(60)]);
  assert.equal(context().oscillators.length, 4, 'a new voice');
  assert.equal(first.stops.length, 1, 'the old voice is released');
  assert.deepEqual(context().oscillators[2].stops, [], 'the new voice keeps sounding');
});

test('the volume controls the master gain', (t) => {
  const context = useFakeAudio(t);
  const synth = createSynth();
  synth.setVolume(0.5);
  synth.perform([start(60)]);
  const master = voiceGainOf(context().oscillators[0]).outputs[0];
  assert.equal(master.gain.value, 0.5);
  synth.setVolume(0.25);
  assert.deepEqual(master.gain.events.at(-1).slice(0, 2), ['target', 0.25]);
});

test('playback queues notes just ahead of the audio clock and stops with a fade', (t) => {
  const context = useFakeAudio(t);
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const synth = createSynth();
  synth.setInstrument('flute');
  const schedule = [0, 0.5, 1].map((time, index) => ({ time, duration: 0.4, midi: 60 + index }));
  const origin = synth.play(schedule);
  assertNear(origin, 0.05);
  const starts = () => context().oscillators.map((oscillator) => oscillator.starts[0]);
  assert.equal(starts().length, 1, 'only the first note is queued at once');

  context().currentTime = 0.3;
  t.mock.timers.tick(80);
  context().currentTime = 0.8;
  t.mock.timers.tick(80);
  t.mock.timers.tick(80);
  assert.equal(starts().length, 3);
  starts().forEach((time, index) => assertNear(time, origin + schedule[index].time));
  const lastGain = voiceGainOf(context().oscillators[2]).gain;
  assertEvents(lastGain.events.slice(3, 4), [['cancel', origin + 1.4]]);

  synth.perform([start(72)]); // a live note during playback
  context().currentTime = 1;
  synth.stopPlayback();
  const bus = voiceGainOf(context().oscillators[0]).outputs[0];
  assert.deepEqual(bus.gain.events.at(-1), ['target', 0, 1, 0.02]);
  context()
    .oscillators.slice(0, 3)
    .forEach((oscillator) => assert.ok(oscillator.stops.at(-1) <= 1.2, 'queued notes are cut'));
  assert.deepEqual(context().oscillators[3].stops, [], 'the live note is untouched');
  t.mock.timers.tick(300);
  assert.deepEqual(bus.outputs, [], 'the faded bus is disconnected');
  assert.equal(synth.time(), 1);
});
