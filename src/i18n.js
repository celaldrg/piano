/**
 * English and Turkish UI strings plus language-aware formatting: plural forms,
 * note names (letters in English, do-re-mi in Turkish), numbers and times.
 * Pure module with no DOM access.
 * @module i18n
 */
import { midiToNoteName, octaveOf } from './music.js';

/** Supported languages; the first one is the default. */
export const LANGUAGES = ['en', 'tr'];

const LOCALES = { en: 'en-US', tr: 'tr-TR' };
const SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

/**
 * UI strings by language. `{name}` marks a placeholder; keys ending in `.one`
 * and `.other` are plural forms used by plural().
 * @type {Record<string, Record<string, string>>}
 */
export const STRINGS = {
  en: {
    'app.title': 'Web Piano',
    'lang.button': 'TR',
    'lang.switch': 'TR – switch to Turkish',
    'stage.label': 'Piano',
    'control.instrument': 'Instrument',
    'control.volume': 'Volume',
    'control.octave': 'Octave',
    'control.octaveDown': 'Octave down',
    'control.octaveUp': 'Octave up',
    'control.sustain': 'Sustain',
    'control.sustainKey': 'Space',
    'control.labels': 'Labels',
    'instrument.epiano': 'Electric piano',
    'instrument.soft': 'Soft',
    'instrument.flute': 'Flute',
    'instrument.chip': 'Chip (8-bit)',
    'trail.label': 'Recent notes',
    'trail.empty': 'Tap a key or use your computer keyboard',
    'readout.hz': '{hz} Hz',
    'keys.label': 'Piano keys',
    'note.sharp': 'sharp',
    'help.keys':
      'Computer keys: Z S X D C V G B H N J M lower octave · Q 2 W 3 E R 5 T 6 Y 7 U I O P upper octave · hold Space to sustain · ← → change octave',
    'rec.title': 'Recorder',
    'rec.record': 'Record',
    'rec.stop': 'Stop',
    'rec.play': 'Play',
    'rec.clear': 'Clear',
    'rec.confirm': 'Sure?',
    'rec.empty': 'No takes yet. Press Record, then play.',
    'rec.recording': 'Recording… {time}',
    'rec.playing': 'Playing take {id}…',
    'rec.nothing': 'No notes were played, so nothing was saved.',
    'rec.saved.one': '{count} take saved in this browser.',
    'rec.saved.other': '{count} takes saved in this browser.',
    'rec.takes': 'Saved takes',
    'rec.snap': 'Snap to 1/16',
    'rec.tempo': 'Snap tempo',
    'rec.bpm': '{bpm} BPM',
    'take.name': 'Take {id}',
    'take.play': 'Play take {id}',
    'take.stop': 'Stop take {id}',
    'take.notes.one': '{count} note',
    'take.notes.other': '{count} notes',
    'mel.title': 'Melodies',
    'mel.pick': 'Melody',
    'mel.play': 'Play',
    'mel.stop': 'Stop',
    'mel.learn': 'Learn',
    'mel.end': 'End lesson',
    'mel.idle': 'Listen first, then learn it key by key.',
    'mel.playing': 'Playing {name}…',
    'melody.ode': 'Ode to Joy (Beethoven)',
    'melody.twinkle': 'Twinkle Twinkle Little Star',
    'melody.frere': 'Frère Jacques',
    'learn.next': 'Next key: {note}',
    'learn.miss': 'Not that one. Try {note}.',
    'learn.done': 'Well done! You played all {total} notes.',
    'learn.progress': '{index} / {total} notes · mistakes: {mistakes}',
    'learn.progressLabel': 'Lesson progress',
    'footer.source': 'MIT · Source on GitHub',
  },
  tr: {
    'app.title': 'Web Piyano',
    'lang.button': 'EN',
    'lang.switch': 'EN – İngilizceye geç',
    'stage.label': 'Piyano',
    'control.instrument': 'Enstrüman',
    'control.volume': 'Ses düzeyi',
    'control.octave': 'Oktav',
    'control.octaveDown': 'Bir oktav aşağı',
    'control.octaveUp': 'Bir oktav yukarı',
    'control.sustain': 'Uzatma',
    'control.sustainKey': 'Boşluk',
    'control.labels': 'Etiketler',
    'instrument.epiano': 'Elektrikli piyano',
    'instrument.soft': 'Yumuşak',
    'instrument.flute': 'Flüt',
    'instrument.chip': 'Çip (8-bit)',
    'trail.label': 'Son notalar',
    'trail.empty': 'Bir tuşa dokun ya da bilgisayar klavyesini kullan',
    'readout.hz': '{hz} Hz',
    'keys.label': 'Piyano tuşları',
    'note.sharp': 'diyez',
    'help.keys':
      'Bilgisayar tuşları: Z S X D C V G B H N J M alt oktav · Q 2 W 3 E R 5 T 6 Y 7 U I O P üst oktav · uzatmak için Boşluk tuşunu basılı tut · ← → oktav değiştir',
    'rec.title': 'Kayıt',
    'rec.record': 'Kaydet',
    'rec.stop': 'Durdur',
    'rec.play': 'Çal',
    'rec.clear': 'Temizle',
    'rec.confirm': 'Onayla',
    'rec.empty': 'Henüz kayıt yok. Kaydet’e bas, sonra çal.',
    'rec.recording': 'Kaydediliyor… {time}',
    'rec.playing': '{id}. kayıt çalınıyor…',
    'rec.nothing': 'Hiç nota çalınmadı, bu yüzden kayıt saklanmadı.',
    'rec.saved.one': '{count} kayıt bu tarayıcıda saklı.',
    'rec.saved.other': '{count} kayıt bu tarayıcıda saklı.',
    'rec.takes': 'Saklanan kayıtlar',
    'rec.snap': '1/16’ya hizala',
    'rec.tempo': 'Hizalama temposu',
    'rec.bpm': '{bpm} vuruş/dk',
    'take.name': 'Kayıt {id}',
    'take.play': '{id}. kaydı çal',
    'take.stop': '{id}. kaydı durdur',
    'take.notes.one': '{count} nota',
    'take.notes.other': '{count} nota',
    'mel.title': 'Melodiler',
    'mel.pick': 'Melodi',
    'mel.play': 'Çal',
    'mel.stop': 'Durdur',
    'mel.learn': 'Öğren',
    'mel.end': 'Dersi bitir',
    'mel.idle': 'Önce dinle, sonra tuş tuş öğren.',
    'mel.playing': '{name} çalınıyor…',
    'melody.ode': 'Neşeye Övgü (Beethoven)',
    'melody.twinkle': 'Parla Parla Küçük Yıldız',
    'melody.frere': 'Tembel Çocuk (Frère Jacques)',
    'learn.next': 'Sıradaki tuş: {note}',
    'learn.miss': 'O değil. {note} tuşunu dene.',
    'learn.done': 'Harika! {total} notanın hepsini çaldın.',
    'learn.progress': '{index} / {total} nota · hata: {mistakes}',
    'learn.progressLabel': 'Ders ilerlemesi',
    'footer.source': 'MIT · Kaynak kodu GitHub’da',
  },
};

/**
 * A supported language code; anything else becomes the default, English.
 * @param {unknown} value
 * @returns {'en' | 'tr'}
 */
export function normalizeLanguage(value) {
  return LANGUAGES.includes(value) ? value : LANGUAGES[0];
}

/**
 * Looks up a string and fills its `{name}` placeholders. Missing Turkish
 * strings fall back to English and unknown keys to the key itself.
 * @param {string} language
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
export function translate(language, key, params = {}) {
  const text = STRINGS[normalizeLanguage(language)][key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/**
 * Translates a counted phrase: `${key}.one` for exactly one, `${key}.other`
 * otherwise. `{count}` is filled in.
 * @param {string} language
 * @param {string} key Key without the `.one` / `.other` ending.
 * @param {number} count
 * @returns {string}
 */
export function plural(language, key, count) {
  return translate(language, `${key}.${count === 1 ? 'one' : 'other'}`, { count });
}

/**
 * Display name of a note: "C#4" in English, "Do#4" in Turkish.
 * @param {number} midi Integer MIDI number 0..127.
 * @param {string} language
 * @returns {string}
 * @throws {RangeError} When midi is not a MIDI note.
 */
export function noteLabel(midi, language) {
  const name = midiToNoteName(midi);
  return normalizeLanguage(language) === 'tr' ? SOLFEGE[midi % 12] + octaveOf(midi) : name;
}

/**
 * Note name for screen readers, with the sharp as a word: "C sharp 4" in
 * English, "Do diyez 4" in Turkish. Natural notes keep their short name.
 * @param {number} midi Integer MIDI number 0..127.
 * @param {string} language
 * @returns {string}
 * @throws {RangeError} When midi is not a MIDI note.
 */
export function spokenNoteLabel(midi, language) {
  return noteLabel(midi, language).replace('#', ` ${translate(language, 'note.sharp')} `);
}

/**
 * A frequency with two decimals in the language's number format
 * ("261.63" in English, "261,63" in Turkish).
 * @param {number} frequency Hz.
 * @param {string} language
 * @returns {string}
 */
export function formatHz(frequency, language) {
  return new Intl.NumberFormat(localeOf(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(frequency);
}

/**
 * A share as a whole percentage ("80%" in English, "%80" in Turkish).
 * @param {number} share 0..1.
 * @param {string} language
 * @returns {string}
 */
export function formatPercent(share, language) {
  return new Intl.NumberFormat(localeOf(language), { style: 'percent', maximumFractionDigits: 0 }).format(share);
}

/**
 * Milliseconds as a clock time "m:ss", rounded to the nearest second.
 * @param {number} ms
 * @returns {string}
 */
export function formatClock(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function localeOf(language) {
  return LOCALES[normalizeLanguage(language)];
}
