import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboard } from '../src/keyboard.js';
import { createKeysView } from '../src/keys-view.js';

/** Just enough of a DOM element for the keys view. */
class FakeElement {
  parent = null;
  children = [];
  dataset = {};
  attributes = {};
  listeners = {};
  styles = {};
  className = '';
  textContent = '';
  style = { setProperty: (name, value) => (this.styles[name] = value) };
  classList = { toggle: () => {} };

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  append(...nodes) {
    nodes.forEach((node) => {
      node.parent = this;
      this.children.push(node);
    });
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  /** Dispatches a primary-button event with the given fields. */
  fire(type, fields) {
    const event = { button: 0, target: this, preventDefault() {}, ...fields };
    (this.listeners[type] ?? []).forEach((listener) => listener(event));
  }
  /** The view only asks for the nearest key, "[data-midi]". */
  closest() {
    let node = this;
    while (node && !('midi' in node.dataset)) node = node.parent;
    return node;
  }
  contains(node) {
    while (node && node !== this) node = node.parent;
    return node === this;
  }
  setPointerCapture() {}
}

/** Renders a phone keyboard (C5..C6) whose computer keys play from C4; returns the root and a log of calls. */
function setup(t) {
  let underPointer = null;
  globalThis.document = { createElement: () => new FakeElement(), elementFromPoint: () => underPointer };
  t.after(() => delete globalThis.document);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = new FakeElement();
  const log = [];
  const view = createKeysView(root, {
    press: (source, midi) => log.push(`press ${source} ${midi}`),
    release: (source) => log.push(`release ${source}`),
  });
  view.render({
    keyboard: createKeyboard({ octaves: 1, baseOctave: 5 }),
    keysOctave: 4,
    down: new Set(),
    ringing: new Set(),
    next: null,
    labels: true,
    language: 'en',
    nameOf: (midi) => `name ${midi}`,
    speak: (midi) => `spoken ${midi}`,
  });
  return { root, keys: root.children, log, point: (node) => (underPointer = node) };
}

test('every key is a button named after its note, labelled with its computer key', (t) => {
  const { root, keys } = setup(t);
  assert.equal(keys.length, 13);
  assert.equal(root.styles['--whites'], '8');
  assert.deepEqual(keys[0].attributes, { role: 'button', 'aria-label': 'spoken 72' });
  assert.deepEqual(
    keys[0].children.map((child) => child.textContent),
    ['Q', 'name 72'],
    'C5 is the Q key while the lower row plays C4',
  );
  assert.equal(keys[1].attributes['aria-label'], 'spoken 73');
});

test('a click that no pointer made, as from a screen reader, plays the key briefly', (t) => {
  const { root, keys, log } = setup(t);
  root.fire('click', { target: keys[1], timeStamp: 1000 });
  assert.deepEqual(log, ['press click 73']);
  t.mock.timers.tick(399);
  assert.equal(log.length, 1);
  t.mock.timers.tick(1);
  assert.deepEqual(log, ['press click 73', 'release click']);
});

test('the click that follows a tap does not play the key a second time', (t) => {
  const { root, keys, log, point } = setup(t);
  point(keys[2].children[1]); // the name on D5
  root.fire('pointerdown', { pointerId: 7, timeStamp: 2000 });
  root.fire('pointerup', { pointerId: 7, timeStamp: 2150 });
  root.fire('click', { target: keys[2], timeStamp: 2160 });
  t.mock.timers.tick(1000);
  assert.deepEqual(log, ['press pointer:7 74', 'release pointer:7']);
  root.fire('click', { target: keys[2], timeStamp: 2600 });
  assert.equal(log.at(-1), 'press click 74', 'a later click without a pointer plays again');
});
