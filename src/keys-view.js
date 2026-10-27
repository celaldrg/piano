/**
 * The on-screen keyboard: white and black keys drawn with CSS and played with
 * any number of pointers at once (fingers, mouse or pen). Sliding a pointer
 * across the keys plays a glissando. Every key is a button named after its
 * note, so screen readers can find and play it. Nothing touches the DOM at
 * import time.
 * @module keys-view
 */
import { el } from './dom.js';
import { visibleKeys } from './keyboard.js';

/** Sideways offset of each black key in white-key widths, by pitch class, as on a real piano. */
const BLACK_KEY_SHIFT = new Map([
  [1, -0.12],
  [3, 0.12],
  [6, -0.14],
  [8, 0],
  [10, 0.14],
]);
/** How long a key sounds when a screen reader presses it. */
const CLICK_NOTE_MS = 400;
/** A click this soon after a pointer let go comes from that pointer, which has already played. */
const POINTER_CLICK_MS = 300;

/**
 * @typedef {object} KeysViewState
 * @property {import('./keyboard.js').Keyboard} keyboard Visible octaves.
 * @property {number} keysOctave Octave played by the lower row of computer keys; sets the key labels.
 * @property {Set<number>} down Notes drawn pressed.
 * @property {Set<number>} ringing Notes drawn as still sounding.
 * @property {number | null} next Key to press next in learn mode.
 * @property {boolean} labels Whether every key shows its name and computer key.
 * @property {string} language Language of the note names.
 * @property {(midi: number) => string} nameOf Note name in that language.
 * @property {(midi: number) => string} speak Note name for screen readers in that language.
 */

/**
 * Wires pointer input on `root` and returns a renderer for the keys inside it.
 * Each pointer is a separate source ("pointer:<id>"), so chords and several
 * fingers work. A click that no pointer made, as screen readers send, plays
 * the key briefly (source "click").
 * @param {HTMLElement} root The element that holds the keys.
 * @param {{ press: (source: string, midi: number) => void, release: (source: string) => void }} handlers
 * @returns {{ render: (state: KeysViewState) => void }}
 */
export function createKeysView(root, { press, release }) {
  const pointers = new Map(); // pointerId -> { frozen }
  const nodes = new Map(); // midi -> key element
  let signature = '';
  let lastPointerUp = -Infinity;
  let clickTimer = 0;

  /** Plays the key under the pointer, or releases the pointer's note off the keys. */
  function follow(event) {
    const source = `pointer:${event.pointerId}`;
    const key = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-midi]');
    if (key && root.contains(key)) press(source, Number(key.dataset.midi));
    else release(source);
  }

  function end(event) {
    lastPointerUp = event.timeStamp;
    if (pointers.delete(event.pointerId)) release(`pointer:${event.pointerId}`);
  }

  function playClicked(event) {
    const key = event.target.closest('[data-midi]');
    if (!key || event.timeStamp - lastPointerUp < POINTER_CLICK_MS) return;
    clearTimeout(clickTimer);
    press('click', Number(key.dataset.midi));
    clickTimer = setTimeout(() => release('click'), CLICK_NOTE_MS);
  }

  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    root.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { frozen: false });
    follow(event);
  });
  root.addEventListener('pointermove', (event) => {
    const pointer = pointers.get(event.pointerId);
    if (pointer && !pointer.frozen) follow(event);
  });
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('lostpointercapture', end);
  root.addEventListener('click', playClicked);
  root.addEventListener('contextmenu', (event) => event.preventDefault());

  function build({ keyboard, keysOctave, nameOf, speak }) {
    const keys = visibleKeys(keyboard, keysOctave);
    root.style.setProperty('--whites', String(keys.filter((key) => !key.black).length));
    nodes.clear();
    root.replaceChildren(
      ...keys.map((key) => {
        const node = buildKey(key, { nameOf, speak });
        nodes.set(key.midi, node);
        return node;
      }),
    );
    // A finger that is down while the keys move keeps its note but stops gliding.
    pointers.forEach((pointer) => {
      pointer.frozen = true;
    });
  }

  return {
    /** @param {KeysViewState} state */
    render(state) {
      const { keyboard, keysOctave, language } = state;
      const next = `${keyboard.baseOctave}/${keyboard.octaves}/${keysOctave}/${language}`;
      if (next !== signature) {
        signature = next;
        build(state);
      }
      root.classList.toggle('show-labels', state.labels);
      for (const [midi, node] of nodes) {
        const down = state.down.has(midi);
        node.classList.toggle('is-down', down);
        node.classList.toggle('is-ringing', !down && state.ringing.has(midi));
        node.classList.toggle('is-next', midi === state.next);
      }
    },
  };
}

function buildKey({ midi, black, whiteIndex, label }, { nameOf, speak }) {
  const node = el('div', `key key--${black ? 'black' : 'white'}`);
  node.dataset.midi = String(midi);
  node.setAttribute('role', 'button');
  node.setAttribute('aria-label', speak(midi));
  if (black) {
    node.style.setProperty('--pos', String(whiteIndex + 1));
    node.style.setProperty('--shift', String(BLACK_KEY_SHIFT.get(midi % 12)));
  }
  if (label) node.append(el('span', 'key__hint', label));
  if (!black) node.append(el('span', midi % 12 === 0 ? 'key__name key__name--c' : 'key__name', nameOf(midi)));
  return node;
}
