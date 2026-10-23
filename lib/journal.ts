import { publishedJournal, publication } from './publication.ts';
import { createDemoJournal } from './demo-data.ts';
export type MediaItem = {
  id: string;
  type: 'image' | 'video';
  poster: string;
  duration?: number;
};
export type Entry = {
  id: string;
  kind: 'diary' | 'anniversary' | 'wish' | 'photo' | 'habit';
  title: string;
  date: string;
  body: string;
  tag: string;
  image: string;
  video?: boolean;
  videoDuration?: number;
  media?: MediaItem[];
  done: boolean;
  annual: boolean;
  checks: string[];
};
export type Journal = {
  version: 1;
  profile: { a: string; b: string; since: string };
  entries: Entry[];
};
export type VideoChanges = {
  put?: Map<string, Blob>;
  remove?: string[];
  replace?: Map<string, Blob>;
};
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 500 * 1024 * 1024;
export const MAX_MEDIA_ITEMS = 12;
const imageDataUrl = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export function entryMedia(entry: Entry): MediaItem[] {
  if (entry.media) return entry.media;
  if (entry.video) return [{ id: entry.id, type: 'video', poster: entry.image, duration: entry.videoDuration }];
  if (entry.image) return [{ id: `${entry.id}:image`, type: 'image', poster: entry.image }];
  return [];
}
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function validDate(s: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
export function dayDiff(a: string, b: string) {
  return Math.round(
    (Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000,
  );
}
export function nextDate(date: string, annual: boolean, now: string) {
  if (!annual) return date;
  const year = Number(now.slice(0, 4));
  const occurrence = (y: number) => {
    let s = `${y}${date.slice(4)}`;
    if (!validDate(s)) s = `${y}-02-28`;
    return s;
  };
  const current = occurrence(year);
  return current < now ? occurrence(year + 1) : current;
}
export function initial(): Journal {
  return publishedJournal ? { version: 1, profile: { a: '你', b: 'TA', since: '' }, entries: [] } : createDemoJournal();
}
export function validate(value: unknown): Journal {
  const d = value as Journal;
  if (!d || d.version !== 1 || !d.profile || !Array.isArray(d.entries))
    throw Error('备份格式不正确');
  if (
    typeof d.profile.a !== 'string' ||
    typeof d.profile.b !== 'string' ||
    d.profile.a.length > 30 ||
    d.profile.b.length > 30 ||
    typeof d.profile.since !== 'string' ||
    (d.profile.since && !validDate(d.profile.since))
  )
    throw Error('备份中的个人设置不正确');
  const ids = new Set<string>();
  const mediaIds = new Set<string>();
  for (const e of d.entries) {
    const record = e as unknown as Record<string, unknown>;
    if (
      !e ||
      typeof e.id !== 'string' ||
      ids.has(e.id) ||
      !['diary', 'anniversary', 'wish', 'photo', 'habit'].includes(e.kind) ||
      !['title', 'date', 'body', 'tag', 'image'].every(
        (k) => typeof record[k] === 'string',
      ) ||
      !e.title.trim() ||
      e.title.length > 120 ||
      e.body.length > 10000 ||
      !validDate(e.date) ||
      typeof e.done !== 'boolean' ||
      typeof e.annual !== 'boolean' ||
      (e.video !== undefined && typeof e.video !== 'boolean') ||
      (e.video && !['diary', 'photo'].includes(e.kind)) ||
      (e.videoDuration !== undefined &&
        (!Number.isFinite(e.videoDuration) || e.videoDuration < 0)) ||
      !Array.isArray(e.checks) ||
      !e.checks.every((c) => typeof c === 'string' && validDate(c)) ||
      (e.image &&
        !imageDataUrl.test(e.image)) ||
      (e.media !== undefined &&
        (!['diary', 'photo'].includes(e.kind) || !Array.isArray(e.media) || e.media.length > MAX_MEDIA_ITEMS))
    )
      throw Error('备份中存在无效记录或媒体');
    ids.add(e.id);
    for (const item of entryMedia(e)) {
      if (!item || typeof item.id !== 'string' || !item.id || mediaIds.has(item.id) ||
        !['image', 'video'].includes(item.type) || typeof item.poster !== 'string' ||
        (item.poster && !imageDataUrl.test(item.poster)) ||
        (item.type === 'image' && !item.poster) ||
        (item.duration !== undefined && (!Number.isFinite(item.duration) || item.duration < 0)))
        throw Error('备份中存在无效媒体');
      mediaIds.add(item.id);
    }
  }
  return d;
}
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(publishedJournal ? 'yuni-love-journal' : 'love-journal-demo-love-journal', 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('journal'))
        r.result.createObjectStore('journal');
      if (!r.result.objectStoreNames.contains('videos'))
        r.result.createObjectStore('videos');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function read(): Promise<Journal> {
  const db = await openDB();
  const saved = await new Promise<Journal | undefined>((resolve, reject) => {
    const tx = db.transaction('journal', 'readonly');
    const request = tx.objectStore('journal').get('main');
    let result: Journal | undefined;
    request.onsuccess = () => {
      try { result = request.result === undefined ? undefined : validate(request.result); }
      catch (error) { reject(error); }
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(tx.error); };
    tx.onerror = () => reject(tx.error);
  });
  if (saved !== undefined) return saved;
  if (!publishedJournal) return initial();
  const seed = validateBackup((await publication()).journal);
  // Check again inside the write transaction: another tab may have saved while fetching.
  const target = await openDB();
  return new Promise((resolve, reject) => {
    const tx = target.transaction(['journal', 'videos'], 'readwrite');
    const store = tx.objectStore('journal');
    const request = store.get('main');
    let result = seed.journal;
    request.onsuccess = () => {
      if (request.result !== undefined) {
        try { result = validate(request.result); } catch { tx.abort(); }
        return;
      }
      store.add(seed.journal, 'main');
      for (const [id, blob] of seed.videos) tx.objectStore('videos').put(blob, id);
    };
    tx.oncomplete = () => { target.close(); resolve(result); };
    tx.onabort = () => { target.close(); reject(tx.error ?? Error('初始化失败，原数据未覆盖')); };
    tx.onerror = () => reject(tx.error);
  });
}
export async function write(data: Journal, media: VideoChanges = {}) {
  validate(data);
  const wanted = new Set(data.entries.flatMap((e) => entryMedia(e).filter((m) => m.type === 'video').map((m) => m.id)));
  for (const [id, blob] of media.put ?? []) {
    if (!wanted.has(id) || !VIDEO_TYPES.includes(blob.type) || !blob.size || blob.size > MAX_VIDEO_BYTES)
      throw Error('视频数据不正确');
  }
  if (media.replace) {
    if (media.replace.size !== wanted.size) throw Error('备份中的视频数量不正确');
    for (const id of wanted) {
      const blob = media.replace.get(id);
      if (!blob || !VIDEO_TYPES.includes(blob.type) || !blob.size || blob.size > MAX_VIDEO_BYTES)
        throw Error('备份中的视频不完整');
    }
  }
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['journal', 'videos'], 'readwrite');
    tx.objectStore('journal').put(data, 'main');
    const videos = tx.objectStore('videos');
    if (media.replace) {
      videos.clear();
      for (const [id, blob] of media.replace) videos.put(blob, id);
    } else {
      for (const id of media.remove ?? []) videos.delete(id);
      for (const [id, blob] of media.put ?? []) videos.put(blob, id);
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? Error('保存失败'));
    };
    tx.onerror = () => reject(tx.error);
  });
}
export async function readVideo(id: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('videos', 'readonly');
    const r = tx.objectStore('videos').get(id);
    r.onsuccess = () => resolve(r.result instanceof Blob ? r.result : null);
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
export function validateVideoFile(file: File) {
  const inferred = file.name.toLowerCase().endsWith('.mp4') ? 'video/mp4'
    : file.name.toLowerCase().endsWith('.webm') ? 'video/webm'
    : file.name.toLowerCase().endsWith('.mov') ? 'video/quicktime' : '';
  const type = file.type || inferred;
  if (!VIDEO_TYPES.includes(type))
    throw Error('请选择 MP4、WebM 或 MOV 视频；无法播放的 MOV 请转为 H.264 MP4');
  if (file.size > MAX_VIDEO_BYTES)
    throw Error('视频超过 100 MB，请先压缩或裁剪后导入');
  if (!file.size) throw Error('视频文件为空');
  return file.type ? file : new File([file], file.name, { type });
}
export async function prepareVideo(file: File): Promise<{ poster: string; duration: number; blob: File }> {
  const blob = validateVideoFile(file);
  const url = URL.createObjectURL(blob);
  const player = document.createElement('video');
  player.preload = 'metadata';
  player.muted = true;
  player.playsInline = true;
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('视频读取超时，请使用 MP4 / H.264 格式')), 12000);
      player.onloadedmetadata = () => {
        clearTimeout(timer);
        if (!player.videoWidth || !player.videoHeight) reject(Error('无法读取视频画面'));
        else resolve(Number.isFinite(player.duration) ? player.duration : 0);
      };
      player.onerror = () => {
        clearTimeout(timer);
        reject(Error('当前浏览器无法播放此视频，请转为 MP4 / H.264 格式'));
      };
      player.src = url;
    });
    const poster = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve(''), 4500);
      const capture = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          const ratio = Math.min(1, 1000 / Math.max(player.videoWidth, player.videoHeight));
          canvas.width = Math.max(1, Math.round(player.videoWidth * ratio));
          canvas.height = Math.max(1, Math.round(player.videoHeight * ratio));
          canvas.getContext('2d')?.drawImage(player, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.78));
        } catch { resolve(''); }
      };
      player.onseeked = capture;
      player.onloadeddata = capture;
      try { player.currentTime = Math.min(0.3, duration / 2); } catch { resolve(''); }
    });
    return { poster, duration, blob };
  } finally {
    player.removeAttribute('src');
    player.load();
    URL.revokeObjectURL(url);
  }
}
export type JournalBackup = Journal & { media?: Record<string, string> };
export function validateBackup(value: unknown): { journal: Journal; videos: Map<string, Blob> } {
  const source = validate(value) as JournalBackup;
  const { media: backupMedia, ...journal } = source;
  const media = backupMedia ?? {};
  if (!media || typeof media !== 'object' || Array.isArray(media))
    throw Error('备份中的视频格式不正确');
  const videos = new Map<string, Blob>();
  const wanted = new Set(journal.entries.flatMap((e) => entryMedia(e).filter((m) => m.type === 'video').map((m) => m.id)));
  if (Object.keys(media).length !== wanted.size)
    throw Error('备份中的视频数量与记录不一致');
  for (const [id, dataUrl] of Object.entries(media)) {
    if (!wanted.has(id) || typeof dataUrl !== 'string')
      throw Error('备份中存在无效视频');
    const match = /^data:(video\/(?:mp4|webm|quicktime));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match || match[2].length > Math.ceil(MAX_VIDEO_BYTES / 3) * 4 + 4)
      throw Error('备份中的视频格式或大小不正确');
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    videos.set(id, new Blob([bytes], { type: match[1] }));
  }
  return { journal, videos };
}
export async function createBackup(data: Journal): Promise<Blob> {
  validate(data);
  const media: Record<string, string> = {};
  for (const e of data.entries) for (const item of entryMedia(e).filter((m) => m.type === 'video')) {
    const blob = await readVideo(item.id);
    if (!blob) throw Error(`「${e.title}」的视频文件未找到，无法生成完整备份`);
    media[item.id] = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(Error('读取视频备份失败'));
      reader.onerror = () => reject(Error('读取视频备份失败'));
      reader.readAsDataURL(blob);
    });
  }
  const backup = new Blob([JSON.stringify({ ...data, media })], { type: 'application/json' });
  if (backup.size > MAX_BACKUP_BYTES)
    throw Error('备份超过 500 MB，请先减少视频数量或体积');
  return backup;
}
export async function photo(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw Error('请选择 JPG、PNG 或 WebP 图片');
  if (file.size > 20 * 1024 * 1024) throw Error('请选择小于 20 MB 的图片');
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('无法处理图片');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.88);
}
