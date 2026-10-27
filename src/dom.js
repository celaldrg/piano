/**
 * Small DOM helpers shared by the views. Nothing touches the DOM at import time.
 * @module dom
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_PATHS = {
  play: 'M8 5.5v13l10.5-6.5z',
  stop: 'M7 8a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z',
};

/**
 * Creates an element with an optional class name and text.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * Creates a small decorative SVG icon.
 * @param {'play'|'stop'} name
 * @returns {SVGSVGElement}
 */
export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

/**
 * Sets the text of a node only when it changed, so screen readers and layout
 * are not disturbed by identical updates.
 * @param {Node} node
 * @param {string} text
 */
export function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}
