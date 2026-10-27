import test from 'node:test';
import assert from 'node:assert/strict';
import { loadText, saveText } from '../src/storage.js';

/** A Map-backed stand-in for localStorage. */
function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
}

test('values are stored under keys with the app prefix', () => {
  const storage = memoryStorage();
  const area = () => storage;
  assert.equal(saveText('lang', 'tr', area), true);
  assert.deepEqual([...storage.items], [['piano:lang', 'tr']]);
  assert.equal(loadText('lang', null, area), 'tr');
  assert.equal(saveText('volume', 55, area), true);
  assert.equal(loadText('volume', null, area), '55');
});

test('missing values give the fallback', () => {
  const area = () => memoryStorage();
  assert.equal(loadText('lang', null, area), null);
  assert.equal(loadText('lang', 'en', area), 'en');
});

test('blocked, full or missing storage never throws', () => {
  const blocked = () => {
    throw new Error('SecurityError: access denied');
  };
  const full = () => ({
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  });
  const missing = () => undefined;
  for (const area of [blocked, full, missing]) {
    assert.equal(loadText('lang', 'en', area), 'en');
    assert.equal(saveText('lang', 'tr', area), false);
  }
});
