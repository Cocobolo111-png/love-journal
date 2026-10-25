import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStorageServer,migrate,issueInvite} from '../server/storage.mjs';
const origin='https://journal.example.test';
const empty={version:1,profile:{a:'Test A',b:'Test B',since:'2026-01-01'},entries:[]};
const joys={version:1,messages:[],coupons:[]};
async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'love-storage-test-'));
 await migrate(root,{journal:{...empty,media:{}},littleJoys:joys});
 const server=createStorageServer({root,origin});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+server.address().port;
 const token=await issueInvite(root);
 const auth=await fetch(url+'/api/storage/authorize',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token})});
 const cookie=auth.headers.get('set-cookie').split(';')[0];
 return {root,url,token,cookie,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'}};
}
test('public reads work; writes require device authorization and the correct Origin',async t=>{
 const f=await fixture(t);assert.equal((await fetch(f.url+'/api/storage/journal')).status,200);
 assert.equal((await fetch(f.url+'/api/storage/journal',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(f.url+'/api/storage/journal',{method:'PUT',headers:{...f.headers,Origin:'https://evil.example'},body:'{}'})).status,403);
 const replay=await fetch(f.url+'/api/storage/authorize',{method:'POST',headers:f.headers,body:JSON.stringify({token:f.token})});assert.equal(replay.status,401);
 assert.equal((await fetch(f.url+'/api/storage/status',{headers:{Cookie:f.cookie}}).then(r=>r.json())).authorized,true);
});
test('successful writes persist after restart and retain a recoverable previous version',async t=>{
 const f=await fixture(t);const data={...empty,profile:{...empty.profile,a:'Updated A'}};
 const res=await fetch(f.url+'/api/storage/journal',{method:'PUT',headers:{...f.headers,'If-Match':'1'},body:JSON.stringify({data,videos:{}})});
 assert.equal(res.status,200);assert.equal((await res.json()).revision,2);
 assert.deepEqual(JSON.parse(await readFile(path.join(f.root,'journal.json'),'utf8')).data,data);
 assert.deepEqual(JSON.parse(await readFile(path.join(f.root,'backups','journal-1.json'),'utf8')).data,empty);
 const second=createStorageServer({root:f.root,origin});await new Promise(r=>second.listen(0,'127.0.0.1',r));
 try{const r=await fetch('http://127.0.0.1:'+second.address().port+'/api/storage/journal').then(r=>r.json());assert.deepEqual(r.data,data);}finally{await new Promise(r=>second.close(r));}
});
test('concurrent stale edits cannot overwrite a more recent save',async t=>{
 const f=await fixture(t);
 const send=a=>fetch(f.url+'/api/storage/journal',{method:'PUT',headers:{...f.headers,'If-Match':'1'},body:JSON.stringify({data:{...empty,profile:{...empty.profile,a}},videos:{}})});
 const responses=await Promise.all([send('One'),send('Two')]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 assert.equal((await fetch(f.url+'/api/storage/journal').then(r=>r.json())).revision,2);
});
test('media is stored separately; missing or unsafe references are rejected; range reads work',async t=>{
 const f=await fixture(t);const bytes=Buffer.from([255,216,255,217]);
 const media=await fetch(f.url+'/api/storage/media',{method:'POST',headers:{Origin:origin,Cookie:f.cookie,'Content-Type':'image/jpeg'},body:bytes});assert.equal(media.status,201);
 const {url}=await media.json();assert.match(url,/\/media\/[a-f0-9]{64}$/);
 const read=await fetch(f.url+url,{headers:{Range:'bytes=1-2'}});assert.equal(read.status,206);assert.deepEqual(Buffer.from(await read.arrayBuffer()),bytes.subarray(1,3));
 assert.equal((await fetch(f.url+'/api/storage/media',{method:'POST',headers:{Origin:origin,Cookie:f.cookie,'Content-Type':'image/svg+xml'},body:'<svg/>'})).status,415);
 const e={id:'x',kind:'photo',title:'Photo',date:'2026-01-01',body:'',tag:'',image:'/api/storage/media/'+'0'.repeat(64),done:false,annual:false,checks:[]};
 assert.equal((await fetch(f.url+'/api/storage/journal',{method:'PUT',headers:{...f.headers,'If-Match':'1'},body:JSON.stringify({data:{...empty,entries:[e]},videos:{}})})).status,400);
});
test('migrating twice cannot reset existing data',async t=>{
 const f=await fixture(t);await assert.rejects(migrate(f.root,{journal:{...empty,media:{}},littleJoys:joys}),/拒绝/);
});
test('storage service starts correctly when invoked through a release symlink',async t=>{
 const {symlink}=await import('node:fs/promises');const {spawn}=await import('node:child_process');const {fileURLToPath}=await import('node:url');
 const root=await mkdtemp(path.join(os.tmpdir(),'love-symlink-test-')),link=path.join(root,'current-storage.mjs');
 await symlink(fileURLToPath(new URL('../server/storage.mjs',import.meta.url)),link);
 const child=spawn(process.execPath,[link],{env:{...process.env,LOVE_JOURNAL_STORAGE_DIR:root,LOVE_JOURNAL_ORIGIN:origin,PORT:'0'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{child.kill();await new Promise(r=>child.once('exit',r));await rm(root,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('service did not start through symlink')),3000);
  child.stdout.on('data',chunk=>{if(String(chunk).includes('listening')){clearTimeout(timeout);resolve();}});
  child.once('exit',code=>{clearTimeout(timeout);reject(Error('unexpected service exit '+code));});
 });
});
