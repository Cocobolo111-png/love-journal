import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoJournal, demoMessages } from '../lib/demo-data.ts';
import { validate, validateBackup } from '../lib/journal.ts';
import { createDefaultLittleJoys, validateLittleJoys, LITTLE_JOYS_KEY } from '../lib/little-joys.ts';

test('fictional demo covers every journal section and imports as a complete backup', () => {
  const demo = createDemoJournal();
  assert.equal(validate(demo), demo);
  assert.equal(new Set(demo.entries.map(e => e.kind)).size, 5);
  assert.ok(demo.entries.every(e => e.title.startsWith('示例：')));
  assert.ok(demo.entries.filter(e => e.image).every(e => e.image.startsWith('data:image/png;base64,')));
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(demo))).journal, demo);
});

test('new demo instances do not inherit edits from other sessions', () => {
  const first = createDemoJournal();
  first.profile.a = 'edited';
  first.entries[0].title = 'edited';
  assert.equal(createDemoJournal().profile.a, '示例 A');
  assert.equal(createDemoJournal().entries[0].title, '示例：花园漫步');
});

test('little joys has fictional content and its own demo namespace', () => {
  const demo = createDefaultLittleJoys(0);
  assert.equal(validateLittleJoys(demo).messages.length, demoMessages.length);
  assert.ok(demo.messages.every(m => m.content.startsWith('演示留言：')));
  assert.ok(demo.coupons.every(c => c.description.startsWith('演示兑换券')));
  assert.ok(LITTLE_JOYS_KEY.startsWith('love-journal-demo-'));
});
