/**
 * Tiny localStorage helper. Every read and write sits in try/catch, so private
 * mode, blocked storage or a full quota can never break the app. Nothing
 * touches storage at import time.
 * @module storage
 */

/** All apps on celaldrg.github.io share one origin, so keys carry the app name. */
const PREFIX = 'piano:';

/**
 * Reads a saved string.
 * @param {string} key Key without the app prefix.
 * @param {string | null} [fallback=null] Returned when nothing is saved or storage fails.
 * @param {() => Storage} [area] Returns the storage to use; localStorage by default.
 * @returns {string | null}
 */
export function loadText(key, fallback = null, area = browserStorage) {
  try {
    return area().getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Saves a string.
 * @param {string} key Key without the app prefix.
 * @param {string} value
 * @param {() => Storage} [area] Returns the storage to use; localStorage by default.
 * @returns {boolean} Whether the value was stored.
 */
export function saveText(key, value, area = browserStorage) {
  try {
    area().setItem(PREFIX + key, String(value));
    return true;
  } catch {
    return false;
  }
}

function browserStorage() {
  return globalThis.localStorage;
}
