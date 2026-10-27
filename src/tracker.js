/**
 * Tracks which notes sound while several sources (fingers, mouse, computer
 * keys) hold them and a sustain pedal may keep released notes ringing.
 * Pure module with no DOM access.
 * @module tracker
 */

/**
 * What the synth has to do, in order.
 * @typedef {{ type: 'start'|'stop', midi: number }} NoteAction
 */

/**
 * Creates a note tracker. A source is any string id, e.g. "pointer:3" or
 * "key:KeyZ"; each source holds at most one note at a time, so sliding a finger
 * to the next key releases the previous one (glissando).
 */
export function createNoteTracker() {
  const heldBy = new Map();
  const ringing = new Set();
  let sustain = false;

  const isHeld = (midi) => [...heldBy.values()].includes(midi);

  /**
   * Releases whatever `source` holds. The note stops unless another source
   * still holds it or the sustain pedal is down.
   * @param {string} source
   * @returns {NoteAction[]}
   */
  function release(source) {
    if (!heldBy.has(source)) return [];
    const midi = heldBy.get(source);
    heldBy.delete(source);
    if (sustain || isHeld(midi)) return [];
    ringing.delete(midi);
    return [{ type: 'stop', midi }];
  }

  /**
   * Presses `midi` with `source`. A note another source already holds is not
   * started twice; a note kept ringing by the pedal is struck again.
   * @param {string} source
   * @param {number} midi
   * @returns {NoteAction[]}
   */
  function press(source, midi) {
    if (heldBy.get(source) === midi) return [];
    const actions = release(source);
    const shared = isHeld(midi);
    heldBy.set(source, midi);
    if (shared) return actions;
    if (ringing.has(midi)) actions.push({ type: 'stop', midi });
    ringing.add(midi);
    actions.push({ type: 'start', midi });
    return actions;
  }

  /**
   * Puts the sustain pedal down or lifts it; lifting stops every ringing note
   * that no source holds.
   * @param {boolean} on
   * @returns {NoteAction[]}
   */
  function setSustain(on) {
    sustain = on;
    if (on) return [];
    const released = sorted(ringing).filter((midi) => !isHeld(midi));
    released.forEach((midi) => ringing.delete(midi));
    return released.map((midi) => ({ type: 'stop', midi }));
  }

  /**
   * Silences everything: all sources let go and the pedal is lifted.
   * @returns {NoteAction[]}
   */
  function releaseAll() {
    const stopped = sorted(ringing);
    heldBy.clear();
    ringing.clear();
    sustain = false;
    return stopped.map((midi) => ({ type: 'stop', midi }));
  }

  return {
    press,
    release,
    setSustain,
    releaseAll,
    /** @returns {number[]} Notes pressed right now, ascending. */
    held: () => sorted(new Set(heldBy.values())),
    /** @returns {number[]} Notes ringing (held or sustained), ascending. */
    sounding: () => sorted(ringing),
    /** @returns {boolean} Whether the sustain pedal is down. */
    isSustained: () => sustain,
  };
}

function sorted(notes) {
  return [...notes].sort((a, b) => a - b);
}
