/**
 * The note trail: a row of small pills for the latest notes, newest on the
 * right. Pills are kept between renders, so only new notes slide in.
 * Nothing touches the DOM at import time.
 * @module trail-view
 */
import { el } from './dom.js';

/**
 * Creates the trail renderer.
 * @param {HTMLElement} list The list element that holds the pills.
 * @returns {{ render: (trail: { seq: number, midi: number }[], nameOf: (midi: number) => string, language: string) => void }}
 */
export function createTrailView(list) {
  let shownLanguage = '';

  return {
    /**
     * Shows the trail; entries are oldest first and `seq` identifies a note.
     * @param {{ seq: number, midi: number }[]} trail
     * @param {(midi: number) => string} nameOf Note name in the current language.
     * @param {string} language A change of language redraws every pill.
     */
    render(trail, nameOf, language) {
      if (language !== shownLanguage) {
        shownLanguage = language;
        list.replaceChildren();
      }
      const wanted = new Set(trail.map((entry) => String(entry.seq)));
      [...list.children].filter((pill) => !wanted.has(pill.dataset.seq)).forEach((pill) => pill.remove());
      const shown = new Set([...list.children].map((pill) => pill.dataset.seq));
      for (const { seq, midi } of trail) {
        if (shown.has(String(seq))) continue;
        const pill = el('li', 'pill', nameOf(midi));
        pill.dataset.seq = String(seq);
        list.append(pill);
      }
      const pills = [...list.children];
      pills.forEach((pill, index) => pill.style.setProperty('--age', String(pills.length - 1 - index)));
    },
  };
}
