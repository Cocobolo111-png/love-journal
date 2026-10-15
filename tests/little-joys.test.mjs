import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LITTLE_JOYS_KEY, createDefaultLittleJoys, loadLittleJoys,
  redeemCoupon, saveLittleJoys, validateLittleJoys, visibleMessages,
} from '../lib/little-joys.ts';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('defaults initialize once with all supplied messages and coupons', () => {
  const storage = memoryStorage();
  const first = loadLittleJoys(storage, 123);
  assert.equal(first.messages.length, 11);
  assert.equal(first.coupons.length, 12);
  assert.equal(first.messages[0].content, '演示留言：愿今天有一件让你微笑的小事。');
  assert.equal(first.coupons[3].quantity, 10);
  assert.equal(first.coupons[3].initialQuantity, 10);
  assert.equal(first.messages[0].createdAt, 123);
  assert.ok(storage.values.has(LITTLE_JOYS_KEY));
  assert.deepEqual(loadLittleJoys(storage, 999), first);
});

test('existing quantity-only coupons migrate without losing edits', () => {
  const storage = memoryStorage();
  const old = createDefaultLittleJoys(123);
  old.coupons[0].title = '我们改过的券';
  old.coupons[0].quantity = 2;
  const legacy = { ...old, coupons: old.coupons.map(({ initialQuantity: _initialQuantity, ...coupon }) => coupon) };
  storage.setItem(LITTLE_JOYS_KEY, JSON.stringify(legacy));
  const loaded = loadLittleJoys(storage);
  assert.equal(loaded.coupons[0].title, '我们改过的券');
  assert.equal(loaded.coupons[0].quantity, 2);
  assert.equal(loaded.coupons[0].initialQuantity, 2);
  assert.equal(JSON.parse(storage.getItem(LITTLE_JOYS_KEY)).coupons[0].initialQuantity, 2);
});

test('redeeming, editing, and adding coupons survive reload; zero cannot redeem', () => {
  const storage = memoryStorage();
  let data = loadLittleJoys(storage, 100);
  data = saveLittleJoys(storage, redeemCoupon(data, data.coupons[0].id, 200));
  assert.equal(loadLittleJoys(storage).coupons[0].quantity, 2);
  assert.equal(loadLittleJoys(storage).coupons[0].initialQuantity, 3);
  assert.equal(loadLittleJoys(storage).coupons[0].updatedAt, 200);
  data = saveLittleJoys(storage, { ...data, coupons: data.coupons.map((coupon, index) => index === 0 ? { ...coupon, title: '肩颈按摩券', description: '下次见面兑现', quantity: 1, initialQuantity: 4 } : coupon) });
  const added = { ...data.coupons[0], id: 'coupon_new', title: '散步券', quantity: 2, initialQuantity: 2 };
  data = saveLittleJoys(storage, { ...data, coupons: [...data.coupons, added] });
  assert.equal(loadLittleJoys(storage).coupons[0].title, '肩颈按摩券');
  assert.equal(loadLittleJoys(storage).coupons[0].description, '下次见面兑现');
  assert.equal(loadLittleJoys(storage).coupons.at(-1).title, '散步券');
  data = saveLittleJoys(storage, redeemCoupon(data, data.coupons[0].id, 300));
  assert.equal(data.coupons[0].quantity, 0);
  assert.throws(() => redeemCoupon(data, data.coupons[0].id), /兑完/);
  assert.throws(() => saveLittleJoys(storage, { ...data, coupons: [{ ...data.coupons[0], quantity: 5, initialQuantity: 4 }, ...data.coupons.slice(1)] }), /无效兑换券/);
});

test('edits and deletions persist without restoring deleted defaults', () => {
  const storage = memoryStorage();
  const initial = loadLittleJoys(storage);
  const changed = {
    ...initial,
    messages: [{ ...initial.messages[0], content: '后来写的一句', pinned: true }, ...initial.messages.slice(2)],
    coupons: initial.coupons.map((coupon, index) => index === 0 ? { ...coupon, quantity: 0, enabled: false } : coupon),
  };
  saveLittleJoys(storage, changed);
  assert.deepEqual(loadLittleJoys(storage), changed);
  assert.equal(loadLittleJoys(storage).messages.length, 10);
});

test('hidden messages stay out of browsing; pinned messages lead', () => {
  const defaults = createDefaultLittleJoys(1);
  const edited = defaults.messages.map((message, index) => ({
    ...message,
    pinned: index === 7,
    enabled: index !== 2,
  }));
  const selected = visibleMessages(edited, '2026-09-24');
  assert.equal(selected.length, 10);
  assert.equal(selected[0].id, edited[7].id);
  assert.ok(!selected.some((message) => message.id === edited[2].id));
  assert.deepEqual(visibleMessages(edited, '2026-09-24'), selected);
});

test('invalid local content is rejected without resetting storage', () => {
  const storage = memoryStorage();
  storage.setItem(LITTLE_JOYS_KEY, '{invalid-json');
  assert.throws(() => loadLittleJoys(storage), /未重新初始化/);
  assert.equal(storage.getItem(LITTLE_JOYS_KEY), '{invalid-json');
  const defaults = createDefaultLittleJoys();
  assert.throws(() => validateLittleJoys({ ...defaults, messages: [defaults.messages[0], defaults.messages[0]] }));
  assert.throws(() => validateLittleJoys({ ...defaults, coupons: [{ ...defaults.coupons[0], quantity: -1 }] }));
});
