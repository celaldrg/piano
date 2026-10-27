import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_INSTRUMENT_ID, INSTRUMENTS, adsrGain, getInstrument } from '../src/instruments.js';

const ENVELOPE = { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.4 };

function assertClose(actual, expected, message = '') {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);
}

test('ADSR gain at the key times of a held note', () => {
  assertClose(adsrGain(-0.1, ENVELOPE), 0, 'before note-on');
  assertClose(adsrGain(0, ENVELOPE), 0, 'note-on');
  assertClose(adsrGain(0.05, ENVELOPE), 0.5, 'half-way up');
  assertClose(adsrGain(0.1, ENVELOPE), 1, 'end of attack');
  assertClose(adsrGain(0.2, ENVELOPE), 0.75, 'half-way down');
  assertClose(adsrGain(0.3, ENVELOPE), 0.5, 'end of decay');
  assertClose(adsrGain(10, ENVELOPE), 0.5, 'sustain');
});

test('ADSR release falls from the sustain level to silence', () => {
  assertClose(adsrGain(1, ENVELOPE, 1), 0.5, 'note-off');
  assertClose(adsrGain(1.2, ENVELOPE, 1), 0.25, 'half-way');
  assertClose(adsrGain(1.4, ENVELOPE, 1), 0, 'end of release');
  assertClose(adsrGain(5, ENVELOPE, 1), 0, 'after release');
});

test('an early release starts from the level reached so far', () => {
  assertClose(adsrGain(0.25, ENVELOPE, 0.05), 0.25, 'released during the attack');
  assertClose(adsrGain(0.4, ENVELOPE, 0.2), 0.375, 'released during the decay');
});

test('zero-length stages jump straight to their target', () => {
  const organ = { attack: 0, decay: 0, sustain: 0.7, release: 0 };
  assertClose(adsrGain(0, organ), 0.7, 'instant sustain');
  assertClose(adsrGain(0.999, organ, 1), 0.7, 'still held');
  assertClose(adsrGain(1, organ, 1), 0, 'instant release');
  const pluck = { attack: 0, decay: 0.5, sustain: 0, release: 0.1 };
  assertClose(adsrGain(0, pluck), 1, 'instant attack');
  assertClose(adsrGain(0.25, pluck), 0.5, 'decaying');
  assertClose(adsrGain(0.5, pluck), 0, 'decayed');
});

test('the four presets use the expected waveforms', () => {
  assert.deepEqual(INSTRUMENTS.map((instrument) => instrument.id).sort(), ['chip', 'epiano', 'flute', 'soft']);
  const waves = (id) => getInstrument(id).oscillators.map((oscillator) => oscillator.type);
  assert.deepEqual(waves('flute'), ['sine']);
  assert.deepEqual(waves('soft'), ['triangle']);
  assert.deepEqual(waves('chip'), ['square']);
});

test('the electric piano layers two slightly detuned oscillators', () => {
  const { oscillators } = getInstrument('epiano');
  assert.equal(oscillators.length, 2);
  assert.notEqual(oscillators[0].detune, oscillators[1].detune);
  for (const { detune } of oscillators) assert.ok(detune !== 0 && Math.abs(detune) <= 15, `detune ${detune}`);
});

test('presets are plain data that never clip', () => {
  for (const instrument of INSTRUMENTS) {
    assert.deepEqual(JSON.parse(JSON.stringify(instrument)), instrument, `${instrument.id} is plain data`);
    const mix = instrument.oscillators.reduce((sum, oscillator) => sum + oscillator.gain, 0);
    assert.ok(mix > 0 && mix <= 1, `${instrument.id} mix ${mix}`);
    const { attack, decay, sustain, release } = instrument.envelope;
    assert.ok(attack >= 0 && decay >= 0 && release > 0 && sustain >= 0 && sustain <= 1, instrument.id);
    for (let step = 0; step <= 300; step += 1) {
      const gain = adsrGain(step / 100, instrument.envelope, 1);
      assert.ok(gain >= 0 && gain <= 1, `${instrument.id} gain ${gain} at ${step / 100} s`);
    }
  }
});

test('unknown instrument ids fall back to the default preset', () => {
  assert.equal(DEFAULT_INSTRUMENT_ID, 'epiano');
  assert.equal(getInstrument('missing').id, DEFAULT_INSTRUMENT_ID);
  assert.equal(getInstrument(undefined).id, DEFAULT_INSTRUMENT_ID);
});
