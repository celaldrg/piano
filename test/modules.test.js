import test from 'node:test';
import assert from 'node:assert/strict';
import { rollBars } from '../src/takes-view.js';

const on = (midi, time) => ({ type: 'on', midi, time });
const off = (midi, time) => ({ type: 'off', midi, time });

test('UI modules can be imported without a browser', async () => {
  const modules = ['dom', 'keys-view', 'trail-view', 'takes-view', 'synth', 'storage', 'i18n'];
  for (const name of modules) {
    const exported = await import(`../src/${name}.js`);
    assert.ok(Object.keys(exported).length > 0, name);
  }
});

test('the mini piano roll spans the take: time across, pitch from top to bottom', () => {
  const take = { id: 1, events: [on(60, 0), off(60, 500), on(72, 500), off(72, 1000)], duration: 1000 };
  assert.deepEqual(rollBars(take), [
    { x: 0, w: 50, y: 85 },
    { x: 50, w: 50, y: 15 },
  ]);
  const single = { id: 2, events: [on(64, 0), off(64, 0)], duration: 0 };
  assert.deepEqual(rollBars(single), [{ x: 0, w: 0, y: 50 }], 'one pitch sits in the middle');
  const long = { id: 3, events: [on(60, 0), off(60, 1), on(61, 1), off(61, 2), on(62, 2), off(62, 3)], duration: 3 };
  assert.equal(rollBars(long, 2).length, 2, 'the number of bars is capped');
});
