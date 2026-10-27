/**
 * The deterministic "?demo" state used for the README screenshot.
 * Pure module with no DOM access.
 * @module demo
 */
import { MELODIES } from './melodies.js';
import { createPiano } from './piano.js';
import { scheduleFromMelody } from './player.js';
import { addRecording, createRecorder } from './recorder.js';

const CHORD = [60, 64, 67]; // C4 E4 G4
const TRAIL_NOTES = [48, 52, 55, 60, 64, 67, 72, 67]; // a rising arpeggio played before the chord
const TAKE_NOTES = 14; // the first two phrases of the twinkle melody

/**
 * Builds the demo piano: middle C centred, a C major chord held down, a short
 * note trail and one saved take. The result does not depend on the clock.
 * @param {{ now: () => number, octaves?: number }} options Clock and layout, as for createPiano.
 * @returns {ReturnType<typeof createPiano>}
 */
export function createDemoPiano({ now, octaves = 2 }) {
  const piano = createPiano({ now, octaves, recordings: addRecording([], demoTake()) });
  TRAIL_NOTES.forEach((midi) => piano.press('demo', midi));
  piano.release('demo');
  CHORD.forEach((midi, index) => piano.press(`demo:${index}`, midi));
  return piano;
}

function demoTake() {
  let clock = 0;
  const recorder = createRecorder({ now: () => clock });
  const melody = MELODIES.find((candidate) => candidate.id === 'twinkle');
  recorder.start();
  for (const note of scheduleFromMelody(melody).slice(0, TAKE_NOTES)) {
    clock = note.time * 1000;
    recorder.noteOn(note.midi);
    clock = (note.time + note.duration) * 1000;
    recorder.noteOff(note.midi);
  }
  return recorder.stop();
}
