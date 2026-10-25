import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {createStorageServer,migrate,issueInvite,canonical,digest} from '../server/storage.mjs';
const originalFetch=globalThis.fetch;
const origin='https://journal.example.test';
const journal={version:1,profile:{a:'A',b:'B',since:'2026-01-01'},entries:[]};
const joys={version:1,messages:[],coupons:[]};let n=0;
async function setup(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'love-client-test-'));await migrate(root,{journal:{...journal,media:{}},littleJoys:joys});
 const server=createStorageServer({root,origin});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;let cookie='';
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 globalThis.window={dispatchEvent:()=>{}};globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={replaceState:()=>{}};
 globalThis.fetch=async(input,options={})=>{
  if(String(input).startsWith('data:'))return originalFetch(input,options);
  const headers=new Headers(options.headers);headers.set('Origin',origin);if(cookie)headers.set('Cookie',cookie);
  const response=await originalFetch(new URL(input,url),{...options,headers});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;
 };
 const client=await import('../lib/server-storage.ts?test='+n++);
 t.after(async()=>{globalThis.fetch=originalFetch;await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
 return {client,root,url,invite:()=>issueInvite(root),values};
}
test('authorized device uploads a new entry and the next read sees the server copy',async t=>{
 const f=await setup(t);assert.deepEqual(await f.client.readServer('journal'),journal);
 await f.client.authorizeDevice(await f.invite());
 const data={...journal,entries:[{id:'diary1',kind:'diary',title:'New note',date:'2026-01-02',body:'Stored remotely',tag:'',image:'',done:false,annual:false,checks:[]}]};
 const saved=await f.client.syncServerJournal(data,{},async()=>null);assert.deepEqual(saved,data);
 assert.deepEqual(JSON.parse(await readFile(path.join(f.root,'journal.json'),'utf8')).data,data);assert.equal(f.client.storageStatus('journal').phase,'synced');
});
test('an unapproved browser keeps changes local without writing shared data',async t=>{
 const f=await setup(t);await f.client.readServer('joys');const data={...joys,messages:[{id:'m',content:'Local only',signature:'',pinned:false,enabled:true,createdAt:1,updatedAt:1}]};
 await f.client.syncServerJoys(data);assert.equal(JSON.parse(await readFile(path.join(f.root,'joys.json'),'utf8')).revision,1);assert.equal(f.client.storageStatus('joys').phase,'local');assert.equal(f.client.pendingServerSave('joys'),true);
});
test('media upload returns a compact reference and does not inline the bytes in shared JSON',async t=>{
 const f=await setup(t);await f.client.readServer('journal');await f.client.authorizeDevice(await f.invite());
 const image='data:image/jpeg;base64,'+Buffer.from([255,216,255,217]).toString('base64');
 const data={...journal,entries:[{id:'p',kind:'photo',title:'Image',date:'2026-01-02',body:'',tag:'',image,done:false,annual:false,checks:[]}]};
 const saved=await f.client.syncServerJournal(data,{},async()=>null);assert.match(saved.entries[0].image,/^\/api\/storage\/media\/[a-f0-9]{64}$/);
 assert.equal((await readFile(path.join(f.root,'journal.json'),'utf8')).includes('base64'),false);
});
test('unpublished changes made before server storage are merged against the original baseline',async t=>{
 const f=await setup(t);const local={...journal,profile:{...journal.profile,a:'Locally updated A'}};
 const merged=await f.client.readServer('journal',local);assert.equal(merged.profile.a,'Locally updated A');assert.equal(f.client.pendingServerSave('journal'),true);
});
test('a stale tab keeps its original base revision even if another tab updated shared metadata',async t=>{
 const f=await setup(t);await f.client.readServer('journal');await f.client.authorizeDevice(await f.invite());
 const other={...journal,profile:{...journal.profile,a:'Other device'}};
 const external=await fetch('/api/storage/journal',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'1'},body:JSON.stringify({data:other,videos:{}})});assert.equal(external.status,200);
 localStorage.setItem('love-journal-server-journal-revision','2');
 const local={...journal,profile:{...journal.profile,a:'Stale tab draft'}};
 await assert.rejects(f.client.syncServerJournal(local,{},async()=>null));
 assert.equal(localStorage.getItem('love-journal-server-journal-pending-base'),'1');
 assert.deepEqual(await f.client.readServer('journal',local),local);
 assert.equal(f.client.storageStatus('journal').phase,'conflict');
 assert.deepEqual(JSON.parse(await readFile(path.join(f.root,'journal.json'),'utf8')).data,other);
});
