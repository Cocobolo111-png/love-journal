import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

globalThis.__PUBLISHED_JOURNAL__ = true;
const { validate, entryMedia, MAX_VIDEO_BYTES } = await import('../lib/journal.ts');
const { validateLittleJoys } = await import('../lib/little-joys.ts');
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export async function atomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.' + randomBytes(8).toString('hex') + '.tmp';
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temporary, file);
}
export async function withLock(dir, work) {
  const file = path.join(dir, '.lock');
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  let lock;
  for (let attempt = 0; attempt < 200; attempt++) {
    try { lock = await fs.open(file, 'wx', 0o600); break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; await new Promise(r => setTimeout(r, 25)); }
  }
  if (!lock) throw Object.assign(Error('服务器正忙，请重试'), { status: 503 });
  try { return await work(); } finally { await lock.close(); await fs.unlink(file); }
}
export async function issueInvite(root, ttl = 15 * 60 * 1000) {
  const token = randomBytes(32).toString('hex');
  await withLock(path.join(root, 'auth'), async () => {
    const file = path.join(root, 'auth', 'devices.json');
    const state = await readJSON(file, { invites: {}, sessions: {} });
    state.invites[digest(token)] = Date.now() + ttl;
    await atomic(file, state);
  });
  return token;
}
const readJSON = async (file, fallback) => {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
};
const fail = (status, message) => { throw Object.assign(Error(message), { status }); };
const MEDIA = /^\/api\/storage\/media\/([a-f0-9]{64})$/;
export async function putMedia(root, bytes, type) {
  if (type === 'image/jpeg' && !(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) fail(400, 'JPEG数据不正确');
  if (type === 'image/png' && !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) fail(400, 'PNG数据不正确');
  if (type === 'image/webp' && !(bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP')) fail(400, 'WebP数据不正确');
  if (!['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'].includes(type)) fail(415, '不支持的影像格式');
  if (!bytes.length || bytes.length > (type.startsWith('video/') ? MAX_VIDEO_BYTES : 20 * 1024 * 1024)) fail(413, '影像文件过大或为空');
  const hash = digest(bytes), dir = path.join(root, 'media');
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  // Metadata is immutable and committed after the bytes. Partial uploads are never referenced.
  try { const h = await fs.open(path.join(dir, hash), 'wx', 0o600); try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); } }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await atomic(path.join(dir, hash + '.json'), { type, size: bytes.length });
  return '/api/storage/media/' + hash;
}
export async function migrate(root, snapshot) {
  if (await fs.stat(path.join(root, 'journal.json')).then(()=>true,()=>false)) throw Error('服务器已有数据，拒绝重新初始化');
  await fs.mkdir(path.join(root, 'media'), { recursive: true, mode: 0o700 });
  const original = snapshot.journal;
  const journal = { ...original, profile: { ...original.profile }, entries: original.entries.map(e => ({ ...e, ...(e.media ? { media: e.media.map(m => ({ ...m })) } : {}) })) }; delete journal.media;
  const originalHash = digest(canonical(journal));
  async function image(value) {
    if (!value) return value;
    const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(value);
    if (!match) throw Error('迁移时遇到无效照片');
    return putMedia(root, Buffer.from(match[2], 'base64'), match[1]);
  }
  for (const e of journal.entries) {
    e.image = await image(e.image);
    for (const m of e.media ?? []) m.poster = await image(m.poster);
  }
  const videos = {};
  for (const [id, value] of Object.entries(original.media ?? {})) {
    const match = /^data:(video\/(?:mp4|webm|quicktime));base64,(.+)$/.exec(value);
    if (!match) throw Error('迁移时遇到无效视频');
    videos[id] = await putMedia(root, Buffer.from(match[2], 'base64'), match[1]);
  }
  validate(journal);
  await atomic(path.join(root, 'journal.json'), { revision: 1, data: journal, videos, legacyHash: originalHash, legacy: { profileHash: digest(canonical(original.profile)), entries: Object.fromEntries(original.entries.map(e=>[e.id,{raw:digest(canonical(e)),normalized:digest(canonical(journal.entries.find(n=>n.id===e.id)))}])) } });
  const joys = validateLittleJoys(snapshot.littleJoys ?? { version: 1, messages: [], coupons: [] });
  await atomic(path.join(root, 'joys.json'), { revision: 1, data: joys, legacyHash: digest(canonical(joys)), legacy: {messages:Object.fromEntries(joys.messages.map(x=>[x.id,digest(canonical(x))])),coupons:Object.fromEntries(joys.coupons.map(x=>[x.id,digest(canonical(x))]))} });
  return { entries: journal.entries.length, mediaFiles: (await fs.readdir(path.join(root,'media'))).filter(n=>!n.endsWith('.json')).length };
}
async function body(req, limit) {
  const size = Number(req.headers['content-length'] ?? 0);
  if (!Number.isFinite(size) || size > limit) fail(413, '上传内容超过限制');
  const chunks = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > limit) fail(413, '上传内容超过限制'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export function createStorageServer({ root, origin }) {
  if (!origin || new URL(origin).protocol !== 'https:') throw Error('必须配置正式 HTTPS origin');
  async function authorized(req) {
    const token = /(?:^|;\s*)love_journal_device=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
    if (!token) return false;
    const state = await readJSON(path.join(root,'auth','devices.json'), {sessions:{}});
    return (state.sessions[digest(token)] ?? 0) > Date.now();
  }
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Cache-Control','no-store');
    const send = (status, data) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); };
    try {
      const pathname = new URL(req.url, origin).pathname;
      if (!['GET','HEAD'].includes(req.method)) {
        if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') fail(403,'请求来源不正确');
        if (pathname !== '/api/storage/authorize' && !await authorized(req)) fail(401,'此设备尚未授权，内容只保存在本机');
      }
      if (pathname === '/api/storage/status' && req.method === 'GET') return send(200,{authorized:await authorized(req)});
      if (pathname === '/api/storage/authorize' && req.method === 'POST') {
        const {token} = JSON.parse((await body(req,2048)).toString());
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail(401,'授权码不正确或已过期');
        const session = randomBytes(32).toString('hex');
        await withLock(path.join(root,'auth'), async()=>{
          const file = path.join(root,'auth','devices.json'), state = await readJSON(file,{invites:{},sessions:{}});
          if ((state.invites[digest(token)]??0) < Date.now()) fail(401,'授权码不正确或已使用');
          delete state.invites[digest(token)];
          state.sessions[digest(session)] = Date.now()+90*86400000;
          for(const [key,expires] of Object.entries(state.sessions)) if(expires<Date.now()) delete state.sessions[key];
          for(const [key,expires] of Object.entries(state.invites)) if(expires<Date.now()) delete state.invites[key];
          await atomic(file,state);
        });
        res.setHeader('Set-Cookie',`love_journal_device=${session}; Path=/api/storage; Max-Age=7776000; HttpOnly; Secure; SameSite=Strict`);
        return send(200,{authorized:true});
      }
      const mediaMatch = MEDIA.exec(pathname);
      if(mediaMatch && ['GET','HEAD'].includes(req.method)) {
        const hash=mediaMatch[1], meta=await readJSON(path.join(root,'media',hash+'.json'));
        res.setHeader('Cache-Control','public, max-age=31536000, immutable');
        res.setHeader('Content-Type',meta.type); res.setHeader('Accept-Ranges','bytes');
        let start=0,end=meta.size-1,status=200;
        if(req.headers.range){
          const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
          if(!range) fail(416,'范围不正确'); start=Number(range[1]); end=range[2]?Math.min(Number(range[2]),end):end;
          if(start>end || start>=meta.size) fail(416,'范围超出文件');
          status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${meta.size}`);
        }
        res.setHeader('Content-Length',end-start+1);res.writeHead(status);
        if(req.method==='HEAD') return res.end();
        const {createReadStream}=await import('node:fs');
        const stream=createReadStream(path.join(root,'media',hash),{start,end});
        stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      if(pathname==='/api/storage/media' && req.method==='POST') {
        const type=(req.headers['content-type']??'').split(';')[0];
        const url=await putMedia(root,await body(req,MAX_VIDEO_BYTES),type);return send(201,{url});
      }
      const kind=pathname==='/api/storage/journal'?'journal':pathname==='/api/storage/joys'?'joys':null;
      if(kind && req.method==='GET') return send(200,await readJSON(path.join(root,kind+'.json')));
      if(kind && req.method==='PUT') {
        const payload=JSON.parse((await body(req,5*1024*1024)).toString());
        const data=kind==='journal'?validate(payload.data):validateLittleJoys(payload.data);
        if(kind==='journal'){
          const references=[];
          for(const entry of data.entries){ if(entry.image) references.push(entry.image); for(const item of entry.media??[]) if(item.poster) references.push(item.poster); }
          const expected=data.entries.flatMap(entryMedia).filter(m=>m.type==='video').map(m=>m.id);
          if(!payload.videos || Array.isArray(payload.videos) || Object.keys(payload.videos).length!==expected.length) fail(400,'视频清单不完整');
          for(const id of expected) references.push(payload.videos[id]);
          for(const value of new Set(references)){
            const match=typeof value==='string' && MEDIA.exec(value);if(!match) fail(400,'照片或视频尚未上传');
            try{await fs.access(path.join(root,'media',match[1]+'.json'));}catch{fail(400,'影像文件不存在');}
          }
        }
        let result;
        await withLock(root,async()=>{
          const file=path.join(root,kind+'.json'), current=await readJSON(file);
          if(req.headers['if-match']!==String(current.revision)) fail(409,'服务器已有更新，本机内容已保留，请先处理版本差异');
          result={...current, revision:current.revision+1, data, ...(kind==='journal'?{videos:payload.videos}:{})};
          await atomic(path.join(root,'backups',`${kind}-${current.revision}.json`),current);
          await atomic(file,result);
        });
        return send(200,result);
      }
      return send(404,{error:'未找到'});
    } catch(error) {
      const status=error.status??(error.code==='ENOENT'?404:error instanceof SyntaxError?400:400);
      if(!res.headersSent) send(status,{error:status===404?'未找到':error.message}); else res.destroy();
    }
  });
}
const invokedFile = process.argv[1] && process.argv[1] !== '-' ? await fs.realpath(process.argv[1]).catch(() => null) : null;
if(invokedFile === fileURLToPath(import.meta.url)) {
  const root=process.env.LOVE_JOURNAL_STORAGE_DIR;if(!root)throw Error('缺少数据目录');
  const server=createStorageServer({root,origin:process.env.LOVE_JOURNAL_ORIGIN});
  server.requestTimeout=120000; server.headersTimeout=15000;
  server.listen(Number(process.env.PORT??3102),'127.0.0.1',()=>console.log('Love Journal storage listening on loopback'));
}
