import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.__PUBLISHED_JOURNAL__ = true;
const { initial, validate } = await import('../lib/journal.ts');
const { LITTLE_JOYS_KEY } = await import('../lib/little-joys.ts');
test('production starts without fabricated records and keeps its real storage namespace',()=>{
 assert.equal(initial().entries.length,0);assert.equal(initial().profile.since,'');assert.equal(LITTLE_JOYS_KEY,'yuni-little-joys-v1');
});
test('published media accepts only exact hash references, never external URLs or paths',()=>{
 const entry={id:'p',kind:'photo',title:'Photo',date:'2026-01-01',body:'',tag:'',image:'/api/storage/media/'+'a'.repeat(64),done:false,annual:false,checks:[]};
 assert.doesNotThrow(()=>validate({...initial(),entries:[entry]}));
 for(const image of ['https://example.com/p.jpg','/api/storage/media/../../auth/devices.json','javascript:alert(1)'])assert.throws(()=>validate({...initial(),entries:[{...entry,image}]}));
});
