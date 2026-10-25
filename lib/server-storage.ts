import { publishedJournal } from './publication.ts';
import type { Journal, VideoChanges } from './journal.ts';
import type { LittleJoys } from './little-joys.ts';
type Kind = 'journal' | 'joys';
type Phase = 'checking' | 'local' | 'saving' | 'synced' | 'pending' | 'conflict';
type Remote = { revision: number; data: unknown; videos?: Record<string,string>; legacyHash: string; legacy: unknown };
const base: Partial<Record<Kind, Remote>> = {};
const phases: Record<Kind, Phase> = { journal: 'checking', joys: 'checking' };
const details: Partial<Record<Kind,string>> = {};
const queues: Partial<Record<Kind, Promise<unknown>>> = {};
let authentication: Promise<boolean> | undefined;
let isAuthorized = false;
const prefix = 'love-journal-server-';
export function canonical(value: unknown): string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
  return JSON.stringify(value);
}
async function hash(value: string | ArrayBuffer): Promise<string> {
  const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function mark(kind: Kind, phase: Phase, detail = '') {
  phases[kind]=phase;details[kind]=detail;
  if(typeof window!=='undefined')window.dispatchEvent(new Event('love-journal-server-status'));
}
export function storageStatus(kind: Kind) {return {phase: phases[kind], detail:details[kind]??'', authorized:isAuthorized};}
export function pendingServerSave(kind: Kind) {return localStorage.getItem(prefix+kind+'-pending')==='yes';}
function dirty(kind: Kind) {localStorage.setItem(prefix+kind+'-pending-base',String(base[kind]?.revision ?? localStorage.getItem(prefix+kind+'-revision') ?? ''));localStorage.setItem(prefix+kind+'-pending','yes');mark(kind,isAuthorized?'saving':'local');}
function clean(kind: Kind,remote: Remote) {
  base[kind]=remote;localStorage.setItem(prefix+kind+'-revision',String(remote.revision));
  localStorage.removeItem(prefix+kind+'-pending');localStorage.removeItem(prefix+kind+'-pending-base');mark(kind,'synced');
}
async function request(url: string, options: RequestInit = {}) {
  const response=await fetch(url,{...options,cache:'no-store',credentials:'same-origin'});
  if(!response.ok){
    const body=await response.json().catch(()=>({})) as {error?:string};
    const error=Object.assign(Error(body.error??'服务器暂时无法保存'),{status:response.status});throw error;
  }
  return response.json();
}
export async function authorizeDevice(token: string): Promise<void> {
  await request('/api/storage/authorize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
  isAuthorized=true;authentication=Promise.resolve(true);
}
export async function serverAuthorization(): Promise<boolean> {
  if(!publishedJournal)return false;
  authentication??=(async()=>{
    const params=new URLSearchParams(location.hash.slice(1));const token=params.get('device-authorize');
    if(token){
      history.replaceState(null,'',location.pathname+location.search);
      await authorizeDevice(token);
    }
    const status=await request('/api/storage/status') as {authorized:boolean};
    isAuthorized=status.authorized;return isAuthorized;
  })().catch(error=>{authentication=undefined;throw error;});
  return authentication;
}
async function mergeLegacyJournal(local: Journal,remote: Remote): Promise<Journal> {
  const legacy=remote.legacy as {profileHash:string; entries:Record<string,{raw:string;normalized:string}>};
  const current=remote.data as Journal;
  if(!legacy)throw Error('本机存在未上传内容，已保留，请先核对服务器版本');
  const result=structuredClone(current), originals=legacy.entries;
  for(const e of local.entries){
    const old=originals[e.id], target=current.entries.find(n=>n.id===e.id);
    if(old && await hash(canonical(e))===old.raw)continue;
    if(target && old && await hash(canonical(target))!==old.normalized)throw Error('同一条记录在两台设备有不同改动，已保留本机副本，请先合并');
    if(target && !old && canonical(target)!==canonical(e))throw Error('记录ID发生冲突，未覆盖服务器');
    const index=result.entries.findIndex(n=>n.id===e.id);if(index<0)result.entries.push(e);else result.entries[index]=e;
  }
  for(const [id,old] of Object.entries(originals))if(!local.entries.some(e=>e.id===id)){
    const target=current.entries.find(n=>n.id===id);
    if(target && await hash(canonical(target))!==old.normalized)throw Error('删除的记录已被另一设备更新，未覆盖服务器');
    result.entries=result.entries.filter(e=>e.id!==id);
  }
  if(await hash(canonical(local.profile))!==legacy.profileHash){
    if(await hash(canonical(current.profile))!==legacy.profileHash && canonical(current.profile)!==canonical(local.profile))throw Error('两台设备的个人设置不同，已保留本机副本');
    result.profile=local.profile;
  }
  return result;
}
async function mergeLegacyJoys(local: LittleJoys,remote: Remote): Promise<LittleJoys> {
  const original=remote.legacy as {messages:Record<string,string>;coupons:Record<string,string>},current=remote.data as LittleJoys,result=structuredClone(current);
  if(!original)throw Error('本机存在未上传留言，请先核对服务器版本');
  for(const key of ['messages','coupons'] as const){
    const old=original[key], currentItems=current[key] as Array<{id:string}>;
    const merged=[...currentItems];
    for(const item of local[key]){
      const previous=old[item.id], existing=currentItems.find(n=>n.id===item.id);
      if(previous && previous===await hash(canonical(item)))continue;
      if(existing && await hash(canonical(existing))!==previous && canonical(existing)!==canonical(item))throw Error('留言或兑换券在另一设备有改动，已保留本机副本');
      const index=merged.findIndex(n=>n.id===item.id);if(index<0)merged.push(item);else merged[index]=item;
    }
    for(const [id,previous] of Object.entries(old))if(!local[key].some(n=>n.id===id)){
      const existing=currentItems.find(n=>n.id===id);
      if(existing && await hash(canonical(existing))!==previous)throw Error('另一设备已更新待删除内容，未覆盖服务器');
      const index=merged.findIndex(n=>n.id===id);if(index>=0)merged.splice(index,1);
    }
    // Both collections retain the exact validated item shapes.
    (result as unknown as Record<string,unknown>)[key]=merged;
  }
  return result;
}
export async function readServer<T extends Journal | LittleJoys>(kind:Kind, local?:T):Promise<T> {
  try{
    await serverAuthorization();
    const remote=await request('/api/storage/'+kind) as Remote;base[kind]=remote;
    const revision=localStorage.getItem(prefix+kind+'-revision');
    if(local && pendingServerSave(kind)){
      if((localStorage.getItem(prefix+kind+'-pending-base') ?? revision)!==String(remote.revision)){localStorage.setItem(prefix+kind+'-conflict','yes');mark(kind,'conflict','服务器已有新版本，本机内容已保留，未覆盖任何一方');return local;}
      mark(kind,isAuthorized?'pending':'local');return local;
    }
    if(local && !revision && canonical(local)!==canonical(remote.data) && await hash(canonical(local))!==remote.legacyHash){
      let merged:T;
      try { merged=(kind==='journal'?await mergeLegacyJournal(local as Journal,remote):await mergeLegacyJoys(local as LittleJoys,remote)) as T; }
      catch(error){localStorage.setItem(prefix+kind+'-conflict','yes');mark(kind,'conflict',(error as Error).message);return local;}
      localStorage.setItem(prefix+kind+'-revision',String(remote.revision));
      if(canonical(merged)!==canonical(remote.data)){dirty(kind);return merged;}
    }
    clean(kind,remote);return remote.data as T;
  }catch(error){
    mark(kind,local?'pending':'checking',error instanceof Error?error.message:'服务器暂时无法读取');
    if(local)return local;throw error;
  }
}
const uploaded=new Map<string,Promise<string>>();
async function upload(blob:Blob):Promise<string>{
  const bytes=await blob.arrayBuffer(),id=await hash(bytes),url='/api/storage/media/'+id;
  if(!uploaded.has(id))uploaded.set(id,(async()=>{
    const existing=await fetch(url,{method:'HEAD',credentials:'same-origin'});
    if(existing.ok)return url;
    if(existing.status!==404)throw Error('无法核对影像是否已上传');
    const result=await request('/api/storage/media',{method:'POST',headers:{'Content-Type':blob.type},body:blob}) as {url:string};return result.url;
  })().catch(error=>{uploaded.delete(id);throw error;}));
  return uploaded.get(id)!;
}
async function normalizeJournal(data:Journal, media:VideoChanges, reader:(id:string)=>Promise<Blob|null>){
  const result=structuredClone(data),videos:Record<string,string>={};
  const image=async(value:string)=>value.startsWith('data:')?upload(await (await fetch(value)).blob()):value;
  for(const e of result.entries){
    e.image=await image(e.image);
    for(const item of e.media??[])item.poster=await image(item.poster);
    const items=e.media??(e.video?[{id:e.id,type:'video'}]:[]);
    for(const item of items)if(item.type==='video'){
      const provided=media.replace?.get(item.id)??media.put?.get(item.id);
      const existing=base.journal?.videos?.[item.id];
      if(!provided && existing)videos[item.id]=existing;
      else {const blob=provided??await reader(item.id);if(!blob)throw Error('视频原文件不存在，本机内容已保留');videos[item.id]=await upload(blob);}
    }
  }
  return {data:result,videos};
}
async function saveRemote(kind:Kind,data:Journal|LittleJoys,media:VideoChanges={},reader:((id:string)=>Promise<Blob|null>)=async()=>null){
  if(phases[kind]==='conflict' || localStorage.getItem(prefix+kind+'-conflict')==='yes')throw Object.assign(Error(details[kind]??'版本冲突，请先保留备份并合并'),{status:409});
  dirty(kind);
  if(!await serverAuthorization()){mark(kind,'local');return data;}
  if(!base[kind])throw Error('尚未核对服务器版本，请刷新后重试');
  mark(kind,'saving');
  const payload=kind==='journal'?await normalizeJournal(data as Journal,media,reader):{data};
  const response=await request('/api/storage/'+kind,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':String(base[kind]!.revision)},body:JSON.stringify(payload)}) as Remote;
  clean(kind,response);return response.data;
}
export function syncServerJournal(data:Journal,media:VideoChanges,reader:(id:string)=>Promise<Blob|null>):Promise<Journal>{
  const previous=queues.journal??Promise.resolve();
  const task=previous.catch(()=>{}).then(()=>saveRemote('journal',data,media,reader)).catch(error=>{
    mark('journal',(error as {status?:number}).status===409?'conflict':'pending',error.message);throw error;
  });queues.journal=task;return task as Promise<Journal>;
}
export function syncServerJoys(data:LittleJoys):Promise<LittleJoys>{
  const previous=queues.joys??Promise.resolve();
  const task=previous.catch(()=>{}).then(()=>saveRemote('joys',data)).catch(error=>{
    mark('joys',(error as {status?:number}).status===409?'conflict':'pending',error.message);throw error;
  });queues.joys=task;return task as Promise<LittleJoys>;
}
export function serverVideo(id:string):string|undefined{return base.journal?.videos?.[id];}

// Serialize cache/read/save cycles across tabs as well as within a page.
export async function withBrowserStorageLock<T>(kind:Kind, work:()=>Promise<T>):Promise<T>{
  if(typeof navigator!=='undefined' && navigator.locks?.request)
    return await navigator.locks.request('love-journal-storage-'+kind,work);
  return work();
}
