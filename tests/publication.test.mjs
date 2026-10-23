import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.__PUBLISHED_JOURNAL__ = true;
const { initial } = await import('../lib/journal.ts');
const { LITTLE_JOYS_KEY, readLittleJoys, createDefaultLittleJoys } = await import('../lib/little-joys.ts');
const storage = (saved = null) => ({ value: saved, getItem() { return this.value; }, setItem(_key, value) { this.value = value; } });
test('production starts empty and uses the real storage namespace', () => {
  assert.equal(initial().entries.length, 0); assert.equal(initial().profile.since, '');
  assert.equal(LITTLE_JOYS_KEY, 'yuni-little-joys-v1');
});
test('existing edits and remaining quantities take precedence without fetching', async () => {
  const data = createDefaultLittleJoys(1); data.coupons[0].quantity = 0;
  const local = storage(JSON.stringify(data)); globalThis.fetch = () => { throw Error('must not fetch'); };
  assert.deepEqual(await readLittleJoys(local), data);
});
test('new browsers retain published hidden messages and remaining quantities', async () => {
  const data = createDefaultLittleJoys(1); data.messages[0].enabled = false; data.coupons[0].quantity = 1;
  const local = storage(); globalThis.fetch = async (url) => { assert.equal(url, '/published/little-joys.json'); return { ok: true, json: async () => ({ format: 'love-journal-publication-v1', littleJoys: data }) }; };
  assert.deepEqual(await readLittleJoys(local), data); assert.deepEqual(JSON.parse(local.value), data);
});
test('failed or malformed snapshots leave storage untouched for retry', async () => {
  for (const response of [{ ok: false }, { ok: true, json: async () => ({}) }]) {
    const local = storage(); globalThis.fetch = async () => response;
    await assert.rejects(readLittleJoys(local)); assert.equal(local.value, null);
  }
});
test('another tab saving while downloading is never overwritten', async () => {
  const seed = createDefaultLittleJoys(1), edited = createDefaultLittleJoys(2); edited.coupons[0].quantity = 0;
  const local = storage(); globalThis.fetch = async () => { local.value = JSON.stringify(edited); return { ok: true, json: async () => ({ format: 'love-journal-publication-v1', littleJoys: seed }) }; };
  assert.deepEqual(await readLittleJoys(local), edited);
});
test('corrupt existing content is reported and preserved', async () => {
  const local = storage('invalid'); await assert.rejects(readLittleJoys(local)); assert.equal(local.value, 'invalid');
});
