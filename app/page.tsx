'use client';
/* oxlint-disable next/no-img-element -- photos are local IndexedDB data URLs */
/* oxlint-disable jsx-a11y/media-has-caption -- user-provided videos have no caption track to attach; playback uses native controls */
/* oxlint-disable next/no-html-link-for-pages -- vinext's client Link navigation fails for this route; native navigation is verified */
import { useEffect, useRef, useState } from 'react';
import {
  Heart,
  House,
  Camera,
  CalendarDays,
  Star,
  Images,
  ListChecks,
  Plus,
  ArrowUpRight,
  Settings,
  ChevronRight,
  Download,
  Upload,
  Trash2,
  Pencil,
  Check,
  BookHeart,
  Sparkles,
  ArrowDown,
  Play,
  Film,
  ChevronLeft,
  MoveLeft,
  MoveRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MusicToggle, useAudioSystem } from '@/components/audio-provider';
import { PORTAL_MOTION, portalCameraPosition } from '@/lib/portal-motion';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  today,
  dayDiff,
  nextDate,
  initial,
  read,
  write,
  photo,
  prepareVideo,
  readVideo,
  createBackup,
  validateBackup,
  MAX_BACKUP_BYTES,
  MAX_MEDIA_ITEMS,
  entryMedia,
  type Entry,
  type Journal,
  type MediaItem,
  type VideoChanges,
} from '@/lib/journal';
const nav = [
  ['首页', House],
  ['日常记录', Camera],
  ['纪念日', CalendarDays],
  ['心愿清单', Star],
  ['相册', Images],
  ['打卡清单', ListChecks],
] as const;
const kinds: Entry['kind'][] = [
  'diary',
  'anniversary',
  'wish',
  'photo',
  'habit',
];
const hints = [
  '收好日常的小确幸',
  '把重要的日子放在心上',
  '一起把以后变成现在',
  '让照片与视频替我们记得',
  '把陪伴变成小习惯',
];
const names = {
  diary: '日常',
  anniversary: '纪念日',
  wish: '心愿',
  photo: '影像',
  habit: '打卡项目',
};
const revealEase = (progress: number) => 1 - Math.pow(1 - progress, 3);
const blank = (kind: Entry['kind']): Entry => ({
  id: crypto.randomUUID(),
  kind,
  title: '',
  date: today(),
  body: '',
  tag: '',
  image: '',
  done: false,
  annual: true,
  checks: [],
});
export default function Page() {
  const audio = useAudioSystem();
  const [data, setData] = useState<Journal>(initial),
    [ready, setReady] = useState(false),
    [page, setPage] = useState(0),
    [modal, setModal] = useState<'entry' | 'settings' | 'photo' | null>(null),
    [draft, setDraft] = useState<Entry | null>(null),
    [profile, setProfile] = useState(data.profile),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [filter, setFilter] = useState('all'),
    [month, setMonth] = useState(''),
    [day, setDay] = useState(''),
    [now, setNow] = useState(''),
    [remove, setRemove] = useState<Entry | null>(null),
    [imported, setImported] = useState<ReturnType<typeof validateBackup> | null>(null),
    [large, setLarge] = useState<Entry | null>(null),
    [largeIndex, setLargeIndex] = useState(0),
    [largeVideoUrl, setLargeVideoUrl] = useState(''),
    [largeVideoError, setLargeVideoError] = useState(''),
    [pendingVideos, setPendingVideos] = useState<Map<string, File>>(new Map()),
    [mediaProgress, setMediaProgress] = useState('');
  const lock = useRef(false),
    fileRef = useRef<HTMLInputElement>(null),
    portalRef = useRef<HTMLElement>(null),
    portalVisualRef = useRef<((scrollTop: number) => void) | null>(null),
    portalRunRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const localToday = today();
      setDay(localToday);
      setNow(localToday);
    });
    read()
      .then((d) => {
        setData(d);
        setReady(true);
      })
      .catch(() =>
        setError(
          '未能打开本地记录。请允许浏览器保存网站数据，然后刷新；现有数据不会被覆盖。',
        ),
      );
    const timer = setInterval(() => setNow(today()), 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  const selectedMedia = large ? entryMedia(large)[largeIndex] : undefined;
  useEffect(() => {
    if (modal !== 'photo' || selectedMedia?.type !== 'video') return;
    let active = true;
    let url = '';
    readVideo(selectedMedia.id).then((blob) => {
      if (!active) return;
      if (!blob) setLargeVideoError('视频文件未找到，请尝试从完整备份恢复。');
      else {
        url = URL.createObjectURL(blob);
        setLargeVideoUrl(url);
      }
    }).catch(() => {
      if (active) setLargeVideoError('视频读取失败，请检查浏览器存储空间。');
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [selectedMedia?.id, selectedMedia?.type, modal]);
  async function save(next: Journal, msg = '已保存在本地', media: VideoChanges = {}) {
    if (lock.current || !ready) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await write(next, media);
      setData(next);
      setNotice(msg);
      audio.playConfirm();
      return true;
    } catch {
      setError('保存失败，修改尚未保存。请检查浏览器存储空间，或先导出备份。');
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function go(i: number) {
    portalRunRef.current?.();
    if (page === i) audio.playPrimaryClick();
    else audio.playTransition();
    setPage(i);
    setFilter('all');
    setMonth('');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  useEffect(() => {
    if (page !== 0 || !portalRef.current) return;
    const portal = portalRef.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const landscape = portal.querySelector<HTMLElement>('.hero-landscape');
    const foreground = portal.querySelector<HTMLElement>('.hero-foreground');
    const copy = portal.querySelector<HTMLElement>('.hero-copy');
    const memories = portal.querySelector<HTMLElement>('.floating-memories');
    const bottom = portal.querySelector<HTMLElement>('.hero-bottom-line');
    let frame = 0;
    let portalTop = 0;
    let travel = 1;
    let lastProgress = -1;
    let previousProgress: number | null = null;
    let portalSoundPlayed = false;
    const measure = () => {
      portalTop = window.scrollY + portal.getBoundingClientRect().top;
      travel = Math.max(1, portal.offsetHeight - window.innerHeight);
      lastProgress = -1;
    };
    const render = (scrollTop: number) => {
      if (reduced.matches) return;
      const progress = Math.min(1, Math.max(0, (scrollTop - portalTop) / travel));
      if (progress === lastProgress) return;
      if (!portalSoundPlayed && previousProgress !== null && previousProgress < 0.97 && progress >= 0.97) {
        portalSoundPlayed = true;
        audio.playTransition();
      }
      previousProgress = progress;
      lastProgress = progress;
      const departure = Math.min(1, Math.max(0, (progress - 0.3) / 0.55));
      const parallax = Math.min(1, Math.max(0, (progress - 0.3) / 0.3));
      const approach = Math.min(1, Math.max(0, (progress - 0.6) / 0.4));
      if (landscape) landscape.style.transform = `scale(${1.04 + approach * .23})`;
      if (foreground) foreground.style.transform = `translate3d(${-1.6 * parallax - 3 * approach}%, ${1.3 * parallax}%, 0) scale(${1.04 + parallax * .035 + approach * .37})`;
      if (copy) {
        copy.style.transform = `translate3d(0, calc(-42% - ${departure * 65}px), 0)`;
        copy.style.opacity = String(1 - departure * .98);
      }
      if (memories) {
        memories.style.transform = `translate3d(${departure * 6}vw, 0, 0)`;
        memories.style.opacity = String(1 - departure);
      }
      if (bottom) bottom.style.opacity = String(1 - departure);
    };
    const update = () => {
      frame = 0;
      render(window.scrollY);
    };
    const onScroll = () => {
      if (portalRunRef.current) return; // The entrance loop owns both scrolling and visual updates.
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onResize = () => {
      portalRunRef.current?.();
      measure();
      onScroll();
    };
    measure();
    portalVisualRef.current = render;
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      portalRunRef.current?.();
      portalVisualRef.current = null;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [page, audio]);
  function enterWorld() {
    const portal = portalRef.current;
    const menu = document.getElementById('world-menu');
    if (!portal || !menu || portalRunRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      menu.scrollIntoView({ behavior: 'instant' });
      return;
    }
    const start = window.scrollY;
    const travel = Math.max(1, portal.offsetHeight - window.innerHeight);
    const portalTop = start + portal.getBoundingClientRect().top;
    const depthEnd = portalTop + travel;
    const menuEnd = start + menu.getBoundingClientRect().top - (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0);
    const heroEnd = Math.max(start, portalTop + travel * 0.72);
    const positions = [start, heroEnd, depthEnd, menuEnd] as const;
    const intro = menu.querySelector<HTMLElement>('.menu-intro');
    const gateways = [...menu.querySelectorAll<HTMLElement>('.gateway')];
    const revealTargets = [intro, ...gateways].filter((element): element is HTMLElement => !!element);
    const began = performance.now();
    let frame = 0;
    const reveal = (element: HTMLElement, elapsed: number, begins: number, duration: number) => {
      const progress = Math.min(1, Math.max(0, (elapsed - begins) / duration));
      const eased = revealEase(progress);
      element.style.opacity = String(eased);
      element.style.transform = `translate3d(0, ${12 * (1 - eased)}px, 0)`;
    };
    const clear = () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('wheel', clear);
      window.removeEventListener('touchstart', clear);
      window.removeEventListener('pointerdown', clear);
      window.removeEventListener('keydown', clear);
      revealTargets.forEach((element) => {
        element.style.removeProperty('opacity');
        element.style.removeProperty('transform');
      });
      menu.classList.remove('portal-entering');
      if (portalRunRef.current === clear) portalRunRef.current = null;
    };
    const tick = (time: number) => {
      const elapsed = Math.min(PORTAL_MOTION.revealEnd, time - began);
      if (elapsed <= PORTAL_MOTION.cameraEnd) {
        const destination = portalCameraPosition(elapsed, positions);
        window.scrollTo({ top: destination, behavior: 'instant' });
        portalVisualRef.current?.(destination);
      }
      if (intro) reveal(intro, elapsed, 1480, 1000);
      gateways.forEach((gateway, index) => reveal(gateway, elapsed, 1550 + index * 90, 900));
      if (elapsed < PORTAL_MOTION.revealEnd) frame = requestAnimationFrame(tick);
      else clear();
    };
    menu.classList.add('portal-entering');
    portalRunRef.current = clear;
    window.addEventListener('wheel', clear, { passive: true });
    window.addEventListener('touchstart', clear, { passive: true });
    window.addEventListener('pointerdown', clear, { passive: true });
    window.addEventListener('keydown', clear);
    frame = requestAnimationFrame(tick);
  }
  function edit(kind: Entry['kind'], e?: Entry) {
    const source = e ? { ...e } : blank(kind);
    setDraft(['diary', 'photo'].includes(kind)
      ? { ...source, image: '', video: false, videoDuration: undefined, media: [...entryMedia(source)] }
      : source);
    setPendingVideos(new Map());
    setModal('entry');
    setError('');
  }
  function settings() {
    setProfile({ ...data.profile });
    setModal('settings');
  }
  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft || busy) return;
    if (draft.kind === 'photo' && !entryMedia(draft).length) {
      setError('请先选择一张照片或视频');
      return;
    }
    const entry = {
      ...draft,
      title: draft.title.trim(),
      body: draft.body.trim(),
    };
    if (!entry.title) return;
    const next = {
      ...data,
      entries: [...data.entries.filter((x) => x.id !== entry.id), entry],
    };
    const prior = data.entries.find((x) => x.id === entry.id);
    const oldVideos = prior ? entryMedia(prior).filter((m) => m.type === 'video').map((m) => m.id) : [];
    const kept = new Set(entryMedia(entry).map((m) => m.id));
    const media: VideoChanges = {
      put: pendingVideos,
      remove: oldVideos.filter((id) => !kept.has(id)),
    };
    if (await save(next, '已保存在本地', media)) {
      setPendingVideos(new Map());
      setModal(null);
    }
  }
  async function addMedia(files: File[]) {
    if (!draft || busy || !files.length) return;
    const current = entryMedia(draft);
    if (current.length + files.length > MAX_MEDIA_ITEMS) {
      setError(`每条内容最多添加 ${MAX_MEDIA_ITEMS} 项照片或视频`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const additions: MediaItem[] = [];
      const newVideos = new Map(pendingVideos);
      for (const [index, file] of files.entries()) {
        setMediaProgress(`正在处理第 ${index + 1} / ${files.length} 项影像…`);
        const id = crypto.randomUUID();
        if (file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name)) {
          const { poster, duration, blob } = await prepareVideo(file);
          additions.push({ id, type: 'video', poster, duration });
          newVideos.set(id, blob);
        } else {
          additions.push({ id, type: 'image', poster: await photo(file) });
        }
      }
      setPendingVideos(newVideos);
      setDraft((currentDraft) => currentDraft && currentDraft.id === draft.id
        ? { ...currentDraft, media: [...entryMedia(currentDraft), ...additions] } : currentDraft);
    } catch (err) {
      setError(err instanceof Error ? err.message : '影像处理失败，请重新选择');
    } finally {
      setMediaProgress('');
      setBusy(false);
    }
  }
  function removeDraftMedia(id: string) {
    if (!draft) return;
    setDraft({ ...draft, media: entryMedia(draft).filter((m) => m.id !== id) });
    setPendingVideos((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }
  function moveDraftMedia(index: number, direction: -1 | 1) {
    if (!draft) return;
    const media = [...entryMedia(draft)];
    const next = index + direction;
    if (next < 0 || next >= media.length) return;
    [media[index], media[next]] = [media[next], media[index]];
    setDraft({ ...draft, media });
  }
  async function toggle(e: Entry) {
    const checks = e.checks.includes(day)
      ? e.checks.filter((x) => x !== day)
      : [...e.checks, day];
    await save(
      {
        ...data,
        entries: data.entries.map((x) =>
          x.id === e.id
            ? { ...x, ...(e.kind === 'habit' ? { checks } : { done: !x.done }) }
            : x,
        ),
      },
      e.kind === 'habit' ? '打卡已更新' : '心愿状态已更新',
    );
  }
  async function backup() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const blob = await createBackup(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Love Journal-备份-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('备份已导出，包含记录、照片与视频');
    } catch (e) {
      setError(e instanceof Error ? e.message : '备份导出失败');
    } finally {
      setBusy(false);
    }
  }
  async function importFile(f?: File) {
    if (!f) return;
    try {
      if (f.size > MAX_BACKUP_BYTES) throw Error('备份文件超过 500 MB');
      setImported(validateBackup(JSON.parse(await f.text())));
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法读取备份');
    }
  }
  const diaries = data.entries
    .filter((e) => e.kind === 'diary')
    .sort((a, b) => b.date.localeCompare(a.date));
  const anniversaries = now ? data.entries
    .filter((e) => e.kind === 'anniversary')
    .map((e) => ({ ...e, next: nextDate(e.date, e.annual, now) }))
    .sort((a, b) => a.next.localeCompare(b.next)) : [];
  const upcoming = anniversaries.find((e) => e.next >= now);
  const wishes = data.entries.filter((e) => e.kind === 'wish'),
    habits = data.entries.filter((e) => e.kind === 'habit');
  const photos = data.entries
    .filter((e) => entryMedia(e).length)
    .sort((a, b) => b.date.localeCompare(a.date));
  const elapsed =
    data.profile.since && now
      ? Math.max(0, dayDiff(now, data.profile.since))
      : null;
  const currentKind = kinds[page - 1];
  const items =
    page === 1
      ? diaries.filter((e) => !month || e.date.startsWith(month))
      : page === 2
        ? anniversaries
        : page === 3
          ? wishes.filter(
              (e) => filter === 'all' || e.done === (filter === 'done'),
            )
          : page === 4
            ? photos
            : habits;
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool?: (...args: unknown[]) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: 'read_love_journal_summary',
          description:
            'Read counts and currently selected section of the local journal.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: () => ({
            ready,
            section: nav[page][0],
            records: data.entries.length,
          }),
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
    return () => controller.abort();
  }, [data, page, ready]);
  const actions = (e: Entry) => (
    <div className="card-actions">
      <Button
        variant="ghost"
        aria-label={'编辑' + e.title}
        data-audio="micro"
        onClick={() => edit(e.kind, e)}
      >
        <Pencil size={15} />
      </Button>
      <Button
        variant="ghost"
        aria-label={'删除' + e.title}
        data-audio="micro"
        onClick={() => setRemove(e)}
      >
        <Trash2 size={15} />
      </Button>
    </div>
  );
  function openMedia(e: Entry, index = 0) {
    setLargeVideoUrl('');
    setLargeVideoError('');
    setLarge(e);
    setLargeIndex(index);
    setModal('photo');
  }
  const mediaVisual = (item: MediaItem) => (
    <>
      {item.poster ? (
        <img src={item.poster} alt="" loading="lazy" />
      ) : (
        <span className="video-fallback" aria-hidden="true"><Film size={34} /></span>
      )}
      {item.type === 'video' && (
        <span className="video-badge"><Play size={13} fill="currentColor" aria-hidden="true" /> 视频</span>
      )}
    </>
  );
  const empty = (kind: Entry['kind']) => (
    <div className="empty">
      <BookHeart size={38} />
      <h3>
        {kind === 'photo'
          ? '把第一张照片或视频放进来'
          : `还没有${names[kind]}，从第一条开始吧`}
      </h3>
      <p>不用特别盛大，平凡的一天也值得收藏。</p>
      <Button className="primary" onClick={() => edit(kind)} disabled={!ready}>
        <Plus />
        添加{names[kind]}
      </Button>
    </div>
  );
  const diaryCard = (e: Entry) => (
    <article className="diary" key={e.id}>
      <div className="date-block">
        <b>{e.date.slice(8)}</b>
        <span>{e.date.slice(0, 7).replace('-', ' / ')}</span>
      </div>
      <div className="card diary-body">
        {actions(e)}
        <span className="tag">{e.tag || '小小日常'}</span>
        <h3>{e.title}</h3>
        <p className="entry-text">{e.body}</p>
        {entryMedia(e).length > 0 && (
          <div className="entry-media-strip" aria-label={`${e.title}的${entryMedia(e).length}项影像`}>
            {entryMedia(e).map((item, index) => (
              <button key={item.id} type="button" className="image-button"
                aria-label={`${item.type === 'video' ? '播放视频' : '查看照片'}：${e.title}，第${index + 1}项，共${entryMedia(e).length}项`}
                onClick={() => openMedia(e, index)}>
                {mediaVisual(item)}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
  return (
    <>
      <a className="skip-link" href="#journal-main">
        跳到主要内容
      </a>
      <header className={'site-header ' + (page === 0 ? 'over-hero' : 'inner-header')}>
        <button
          className="brand"
          type="button"
          data-audio="none"
          onClick={() => go(0)}
          aria-label="返回首页"
        >
          <span>
            Love Journal<small>OUR WORLD · EST. {data.profile.since?.slice(0, 4) || '∞'}</small>
          </span>
        </button>
        <nav aria-label="主要导航">
          {nav.map(([name, Icon], i) => (
            <Button
              variant="ghost"
              key={name}
              className={page === i ? 'nav active' : 'nav'}
              aria-current={page === i ? 'page' : undefined}
              data-audio="none"
              onClick={() => go(i)}
            >
              <Icon size={15} aria-hidden="true" />
              {name}
            </Button>
          ))}
        </nav>
        <div className="header-controls">
          <MusicToggle />
          <Button
            variant="ghost"
            className="profile"
            aria-label="我们的设置"
            data-audio="micro"
            onClick={settings}
            disabled={!ready}
          >
            <Settings size={19} />
          </Button>
        </div>
      </header>
      <main id="journal-main" className={page === 0 ? 'home-main' : 'chapter-main chapter-' + currentKind}>
        <div className="status-strip" aria-label="手账状态">
          <span>两个人，一本慢慢写的生活手账</span>
          <span className="local-dot">
            {ready ? '本地私藏' : '正在打开手账…'}
          </span>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {page === 0 ? (
          <>
            <section className="portal-journey" ref={portalRef} aria-label="进入我们的世界">
              <div className="hero-scene">
                <div className="hero-landscape" aria-hidden="true" />
                <div className="hero-foreground" aria-hidden="true" />
                <div className="hero-vignette" aria-hidden="true" />
                <div className="hero-copy">
                  <span className="eyebrow">AN INTIMATE ARCHIVE · {data.profile.a} &amp; {data.profile.b}</span>
                  <h1>STEP INTO<br /><em>OUR WORLD</em></h1>
                  <p>A little world built from the moments we kept.</p>
                  <button className="text-cta" onClick={enterWorld}>
                    开始探索 <ArrowUpRight size={17} />
                  </button>
                </div>
                <div className="floating-memories" aria-label="记忆入口">
                  <button className="floating-memory memory-one" onClick={settings}>
                    <span>01 / THE BEGINNING</span>
                    <strong>{elapsed === null ? '写下我们的第一天' : `${elapsed} DAYS TOGETHER`}</strong>
                    <small>{data.profile.since ? data.profile.since.replaceAll('-', ' . ') : 'OUR STORY STARTS HERE'}</small>
                  </button>
                  <button className="floating-memory memory-two" data-audio="none" onClick={() => go(4)}>
                    <span>02 / MOMENTS KEPT</span>
                    {photos[0] && entryMedia(photos[0])[0]?.poster ? <img src={entryMedia(photos[0])[0].poster} alt="" /> : <span className="memory-image" aria-hidden="true" />}
                    <strong>{photos[0]?.title || '留给未来的画面'}</strong>
                    {photos[0] && <small>{entryMedia(photos[0]).length} MOMENT{entryMedia(photos[0]).length > 1 ? 'S' : ''} KEPT</small>}
                  </button>
                  <button className="floating-memory memory-three" data-audio="none" onClick={() => go(2)}>
                    <span>03 / A DATE TO KEEP</span>
                    <strong>{upcoming?.title || '下一场纪念'}</strong>
                    <small>{upcoming?.next || '等待写下'}</small>
                  </button>
                </div>
                <div className="hero-bottom-line"><span>PRIVATE · STORED LOCALLY</span><button onClick={enterWorld}>SCROLL TO ENTER <ArrowDown size={15} /></button><span>01 — 05</span></div>
              </div>
            </section>
            <section id="world-menu" className="world-menu">
              <div className="menu-intro"><span className="eyebrow">THE CHAPTERS</span><h2>OUR LITTLE<br /><em>WORLD</em></h2><p>Four ways to remember us.</p></div>
              <div className="gateway-grid">
                <button className="gateway gateway-daily" data-audio="none" onClick={() => go(1)}><span className="gateway-no">01 / DAILY NOTES</span><span className="gateway-art gateway-words">{diaries[0] ? <><small>{diaries[0].date}</small><i>{diaries[0].title}</i></> : <><small>DEAR US,</small><i>每一个普通的今天，<br />都值得被记住。</i></>}</span><span className="gateway-title">日常记录 <ArrowUpRight /></span><span className="gateway-enter">ENTER CHAPTER ↗</span></button>
                <button className="gateway gateway-gallery" data-audio="none" onClick={() => go(4)}><span className="gateway-no">02 / GALLERY</span><span className="gateway-art gateway-photo">{photos[0] && entryMedia(photos[0])[0]?.poster && <img src={entryMedia(photos[0])[0].poster} alt="" />}{photos[0] && entryMedia(photos[0])[0]?.type === 'video' && <span className="gateway-video-label"><Play size={15} fill="currentColor" /> VIDEO</span>}</span><span className="gateway-title">相册 <ArrowUpRight /></span><span className="gateway-enter">ENTER CHAPTER ↗</span></button>
                <button className="gateway gateway-dates" data-audio="none" onClick={() => go(2)}><span className="gateway-no">03 / ANNIVERSARIES</span><span className="gateway-art gateway-date"><b>{upcoming?.next.slice(8) || now.slice(8)}</b><small>{upcoming ? upcoming.next.slice(0, 7).replace('-', ' / ') : 'A DAY TO REMEMBER'}</small></span><span className="gateway-title">纪念日 <ArrowUpRight /></span><span className="gateway-enter">ENTER CHAPTER ↗</span></button>
                <button className="gateway gateway-wishes" data-audio="none" onClick={() => go(3)}><span className="gateway-no">04 / WISH LIST</span><span className="gateway-art gateway-quote">“{wishes.find((e) => !e.done)?.title || '一起把以后，慢慢变成现在。'}”</span><span className="gateway-title">心愿打卡 <ArrowUpRight /></span><span className="gateway-enter">ENTER CHAPTER ↗</span></button>
              </div>
              <button className="habits-entry" data-audio="none" onClick={() => go(5)}>每日打卡 · 已陪伴 {habits.length} 个小习惯 <ArrowUpRight size={16} /></button>
              <a className="little-joys-entry" data-audio="transition" href="/little-joys"><Sparkles size={14} aria-hidden="true" /> 小确幸 <ArrowUpRight size={14} aria-hidden="true" /></a>
            </section>
            <div className="next-event">
              <div className="event-icon">
                <CalendarDays />
              </div>
              <div>
                <span className="small-label">下一个值得期待的日子</span>
                <h3>{upcoming?.title || '把第一个重要的日子记在这里'}</h3>
                <p>
                  {upcoming
                    ? `${upcoming.next} · ${upcoming.annual ? '每年纪念' : '特别的一天'}`
                    : '生日、初次见面、在一起的那一天…'}
                </p>
              </div>
              {upcoming ? (
                <button className="countdown" data-audio="none" onClick={() => go(2)}>
                    {dayDiff(upcoming.next, now) === 0 ? (
                    '就是今天'
                  ) : (
                    <>
                      <b>{dayDiff(upcoming.next, now)}</b> 天后
                    </>
                  )}
                  <ChevronRight size={16} />
                </button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => edit('anniversary')}
                  disabled={!ready}
                >
                  添加纪念日 <Plus size={17} />
                </Button>
              )}
            </div>
            <section className="home-bottom">
              <div>
                <div className="section-heading">
                  <h2>最近的小日子</h2>
                  <Button variant="ghost" data-audio="none" onClick={() => go(1)}>
                    全部 <ChevronRight />
                  </Button>
                </div>
                {diaries.length ? (
                  diaries.slice(0, 2).map(diaryCard)
                ) : (
                  <div className="blank-note">
                    <span>DEAR US,</span>
                    <h3>
                      今天和你在一起，
                      <br />
                      就是值得记下的一件事。
                    </h3>
                    <Button
                      variant="ghost"
                      onClick={() => edit('diary')}
                      disabled={!ready}
                    >
                      写第一篇日常 <ArrowUpRight />
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <div className="section-heading">
                  <h2>一起，慢慢实现</h2>
                  <Star size={20} />
                </div>
                <div className="wish-preview">
                  {wishes
                    .filter((x) => !x.done)
                    .slice(0, 3)
                    .map((e) => (
                      <button key={e.id} data-audio="none" onClick={() => go(3)}>
                        <span className="empty-circle" />
                        {e.title}
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  {!wishes.some((x) => !x.done) && (
                    <p>
                      一场旅行、一顿晚餐、一个拥抱。
                      <br />
                      我们的以后，从一个小心愿开始。
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => edit('wish')}
                    disabled={!ready}
                  >
                    <Plus />
                    写下一个心愿
                  </Button>
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <h1>{nav[page][0]}</h1>
                <p>{hints[page - 1]}</p>
              </div>
              <Button
                className="primary"
                onClick={() => edit(currentKind)}
                disabled={!ready}
              >
                <Plus />
                添加{names[currentKind]}
              </Button>
            </div>
            <div className="stats" aria-label={`${nav[page][0]}概览`}>
              <div className="tint-0">
                <b>
                  {page === 1
                    ? diaries.filter((e) =>
                        e.date.startsWith(now.slice(0, 7)),
                      ).length
                    : page === 2
                      ? anniversaries.length
                      : page === 3
                        ? wishes.length
                        : page === 4
                          ? photos.length
                          : habits.length}
                </b>
                <span>
                  {
                    [
                      '',
                      '本月记录',
                      '重要日子',
                      '全部心愿',
                      '珍藏影像',
                      '陪伴习惯',
                    ][page]
                  }
                </span>
              </div>
              <div className="tint-2">
                <b>
                  {page === 1
                    ? diaries.length
                    : page === 2
                      ? anniversaries.filter(
                          (e) =>
                            e.next >= now &&
                            dayDiff(e.next, now) <= 30,
                        ).length
                      : page === 3
                        ? wishes.filter((e) => e.done).length
                        : page === 4
                          ? new Set(photos.map((e) => e.date.slice(0, 7))).size
                          : habits.filter((e) => e.checks.includes(day)).length}
                </b>
                <span>
                  {
                    [
                      '',
                      '全部日常',
                      '30 天内到来',
                      '已实现',
                      '有影像的月份',
                      '当天已完成',
                    ][page]
                  }
                </span>
              </div>
              <div className="tint-1">
                <b>{elapsed ?? '—'}</b>
                <span>相恋天数</span>
              </div>
            </div>
            <div className="filters">
              {page === 1 && (
                <label>
                  按月份{' '}
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                  {month && (
                    <Button variant="ghost" data-audio="micro" onClick={() => setMonth('')}>
                      全部
                    </Button>
                  )}
                </label>
              )}
              {page === 3 && (
                <fieldset className="filter-group" aria-label="心愿状态">
                  {['all', 'pending', 'done'].map((f, i) => (
                    <Button
                      variant="ghost"
                      className={filter === f ? 'filter selected' : 'filter'}
                      key={f}
                      aria-pressed={filter === f}
                      data-audio="micro"
                      onClick={() => setFilter(f)}
                    >
                      {['全部', '待实现', '已实现'][i]}
                    </Button>
                  ))}
                </fieldset>
              )}
              {page === 5 && (
                <label>
                  打卡日期{' '}
                  <input
                    type="date"
                    value={day}
                    max={now || undefined}
                    onChange={(e) => {
                      if (e.target.value) setDay(e.target.value);
                    }}
                  />
                </label>
              )}
            </div>
            {!items.length ? (
              (page === 1 && month) || (page === 3 && filter !== 'all') ? (
                <div className="empty">
                  <p>这个筛选下暂时没有记录。</p>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setMonth('');
                      setFilter('all');
                    }}
                  >
                    查看全部
                  </Button>
                </div>
              ) : (
                empty(currentKind)
              )
            ) : page === 1 ? (
              <div className="timeline">{items.map(diaryCard)}</div>
            ) : page === 2 ? (
              <div className="record-grid">
                {anniversaries.map((e) => (
                  <article className="card anniversary" key={e.id}>
                    {actions(e)}
                    <div className="round-icon tint-1">
                      <CalendarDays />
                    </div>
                    <h3>{e.title}</h3>
                    <p>
                      {e.date} · {e.annual ? '每年纪念' : '不重复'}
                    </p>
                    <div className="event-days">
                      {dayDiff(e.next, now) < 0 ? (
                        <>
                          <b>{-dayDiff(e.next, now)}</b>
                          <span>天前</span>
                        </>
                      ) : dayDiff(e.next, now) === 0 ? (
                        <b className="today">
                          <Heart
                            size={24}
                            fill="currentColor"
                            aria-hidden="true"
                          />
                          就是今天
                        </b>
                      ) : (
                        <>
                          <b>{dayDiff(e.next, now)}</b>
                          <span>天后</span>
                        </>
                      )}
                    </div>
                    <p className="entry-text">{e.body}</p>
                  </article>
                ))}
              </div>
            ) : page === 3 ? (
              <div className="record-grid">
                {items.map((e) => (
                  <article
                    className={'card wish ' + (e.done ? 'completed' : '')}
                    key={e.id}
                  >
                    {actions(e)}
                    <span className="tag">{e.tag || '一起完成'}</span>
                    <h3>{e.title}</h3>
                    <p className="entry-text">{e.body}</p>
                    <div className="wish-foot">
                      <span>{e.date} 记下</span>
                      <Button
                        variant="ghost"
                        className={
                          e.done ? 'check-button checked' : 'check-button'
                        }
                        onClick={() => toggle(e)}
                        disabled={busy}
                        aria-label={e.done ? '标为未完成' : '完成心愿'}
                      >
                        <Check />
                        {e.done ? '已实现' : '实现它'}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : page === 4 ? (
              <div className="photo-grid">
                {photos.map((e) => (
                  <article className="photo-card" key={e.id}>
                    <button
                      className="image-button"
                      aria-label={`查看影像：${e.title}，共${entryMedia(e).length}项`}
                      onClick={() => openMedia(e)}
                    >
                      {mediaVisual(entryMedia(e)[0])}
                      {entryMedia(e).length > 1 && <span className="media-count">{entryMedia(e).length} 项影像</span>}
                    </button>
                    <div>
                      <h3>{e.title}</h3>
                      <p>
                        {e.date}
                        {e.kind === 'diary' ? ' · 来自日常' : ''}
                        {' · '}{entryMedia(e).length} 项影像
                      </p>
                      {actions(e)}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="habit-list">
                {habits.map((e) => (
                  <article className="card habit" key={e.id}>
                    <button
                      className={
                        'habit-check ' +
                        (e.checks.includes(day) ? 'checked' : '')
                      }
                      disabled={busy}
                      data-audio="micro"
                      aria-label={
                        (e.checks.includes(day) ? '取消打卡' : '打卡') + e.title
                      }
                      onClick={() => toggle(e)}
                    >
                      {e.checks.includes(day) && <Check />}
                    </button>
                    <div className="habit-main">
                      <h3>{e.title}</h3>
                      <p>{e.body || '小小的坚持，是长长的陪伴。'}</p>
                      <div className="week">
                        {day && Array.from({ length: 7 }, (_, i) => {
                          const d = new Date(day + 'T12:00:00');
                          d.setDate(d.getDate() - 6 + i);
                          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                          return (
                            <span
                              key={ds}
                              className={e.checks.includes(ds) ? 'hit' : ''}
                              title={ds}
                            >
                              {d.getDate()}
                            </span>
                          );
                        })}
                        <small>累计 {e.checks.length} 天</small>
                      </div>
                    </div>
                    {actions(e)}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <footer>
        <Sparkles size={14} aria-hidden="true" />
        把小小日常，过成我们的长长故事
      </footer>
      {notice && (
        <output className="toast" aria-live="polite">
          <Check size={17} />
          {notice}
        </output>
      )}
      <Dialog
        open={modal !== null}
        onOpenChange={(o) => {
          if (!o && !busy) setModal(null);
        }}
      >
        <DialogContent
          className={
            modal === 'photo' ? 'journal-dialog lightbox' : 'journal-dialog'
          }
        >
          <DialogTitle>
            {modal === 'settings'
              ? '我们的故事'
              : modal === 'photo'
                ? large?.title
                : draft
                  ? `${data.entries.some((e) => e.id === draft.id) ? '编辑' : '添加'}${names[draft.kind]}`
                  : ''}
          </DialogTitle>
          <DialogDescription>
            {modal === 'settings'
              ? '名字、起点，还有只属于我们的记忆。'
              : modal === 'photo'
                ? large?.date
                : '把这一刻，轻轻收进手账里。'}
          </DialogDescription>
          {modal === 'entry' && draft && (
            <form onSubmit={submit}>
              <label htmlFor="entry-title">
                标题
                <Input
                  id="entry-title"
                  required
                  maxLength={120}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                  placeholder={
                    draft.kind === 'wish'
                      ? '例如：一起去看一次日出'
                      : '给这段记忆起个名字'
                  }
                />
              </label>
              <div className="form-row">
                <label htmlFor="entry-date">
                  {draft.kind === 'anniversary' ? '纪念日期' : '日期'}
                  <Input
                    id="entry-date"
                    type="date"
                    required
                    value={draft.date}
                    onChange={(e) =>
                      setDraft({ ...draft, date: e.target.value })
                    }
                  />
                </label>
                {['diary', 'wish'].includes(draft.kind) && (
                  <label htmlFor="entry-tag">
                    {draft.kind === 'diary' ? '心情 / 地点' : '分类'}
                    <Input
                      id="entry-tag"
                      maxLength={50}
                      value={draft.tag}
                      onChange={(e) =>
                        setDraft({ ...draft, tag: e.target.value })
                      }
                      placeholder="例如：甜甜的 / 旅行"
                    />
                  </label>
                )}
              </div>
              <label htmlFor="entry-body">
                {draft.kind === 'habit' ? '习惯说明' : '想记住的话'}
                <Textarea
                  id="entry-body"
                  maxLength={10000}
                  rows={4}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  placeholder="慢慢写，不着急。"
                />
              </label>
              {draft.kind === 'anniversary' && (
                <label className="inline-label">
                  <input
                    type="checkbox"
                    checked={draft.annual}
                    onChange={(e) =>
                      setDraft({ ...draft, annual: e.target.checked })
                    }
                  />
                  每年纪念（2 月 29 日在平年按 2 月 28 日）
                </label>
              )}
              {['diary', 'photo'].includes(draft.kind) && (
                <div className="media-field">
                  <label htmlFor="entry-photo">照片与视频 <span className="media-total">{entryMedia(draft).length} / {MAX_MEDIA_ITEMS}</span></label>
                  <input
                    id="entry-photo"
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                    disabled={busy || entryMedia(draft).length >= MAX_MEDIA_ITEMS}
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.target.value = '';
                      await addMedia(files);
                    }}
                  />
                  <p className="help">可一次选择多张照片和视频，也能分次继续添加并调整顺序。照片 JPG / PNG / WebP ≤20 MB；视频 MP4 / WebM / MOV ≤100 MB，原文件只保存在本地浏览器。</p>
                  {mediaProgress && <output className="help" aria-live="polite">{mediaProgress}</output>}
                  {entryMedia(draft).length > 0 && (
                    <div className="media-edit-list" aria-label="已添加的影像">
                      {entryMedia(draft).map((item, index) => (
                        <div className="media-edit-item" key={item.id}>
                          <div className="media-edit-thumb">
                            {mediaVisual(item)}
                          </div>
                          <span className="media-edit-name">{String(index + 1).padStart(2, '0')} · {item.type === 'video' ? `视频${item.duration ? ` · ${Math.round(item.duration)} 秒` : ''}` : '照片'}{pendingVideos.get(item.id)?.name ? ` · ${pendingVideos.get(item.id)?.name}` : ''}</span>
                          <div className="media-edit-actions">
                            <Button type="button" variant="ghost" data-audio="micro" aria-label={`将第${index + 1}项前移`} disabled={busy || index === 0} onClick={() => moveDraftMedia(index, -1)}><MoveLeft size={16} /></Button>
                            <Button type="button" variant="ghost" data-audio="micro" aria-label={`将第${index + 1}项后移`} disabled={busy || index === entryMedia(draft).length - 1} onClick={() => moveDraftMedia(index, 1)}><MoveRight size={16} /></Button>
                            <Button type="button" variant="ghost" data-audio="micro" aria-label={`移除第${index + 1}项${item.type === 'video' ? '视频' : '照片'}`} disabled={busy} onClick={() => removeDraftMedia(item.id)}><Trash2 size={16} /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-footer">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setModal(null)}
                  disabled={busy}
                >
                  取消
                </Button>
                <Button type="submit" className="primary" disabled={busy}>
                  {busy ? '正在处理…' : '保存这份记忆'}
                </Button>
              </div>
            </form>
          )}
          {modal === 'settings' && (
            <>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (profile.since > today()) {
                    setError('相恋日期不能晚于今天');
                    return;
                  }
                  if (
                    await save({
                      ...data,
                      profile: {
                        ...profile,
                        a: profile.a.trim() || '你',
                        b: profile.b.trim() || 'TA',
                      },
                    })
                  )
                    setModal(null);
                }}
              >
                <div className="form-row">
                  <label htmlFor="profile-a">
                    你的名字
                    <Input
                      id="profile-a"
                      maxLength={30}
                      required
                      value={profile.a}
                      onChange={(e) =>
                        setProfile({ ...profile, a: e.target.value })
                      }
                    />
                  </label>
                  <label htmlFor="profile-b">
                    TA 的名字
                    <Input
                      id="profile-b"
                      maxLength={30}
                      required
                      value={profile.b}
                      onChange={(e) =>
                        setProfile({ ...profile, b: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label htmlFor="profile-since">
                  在一起的第一天
                  <Input
                    id="profile-since"
                    type="date"
                    max={now || undefined}
                    value={profile.since}
                    onChange={(e) =>
                      setProfile({ ...profile, since: e.target.value })
                    }
                  />
                </label>
                <p className="help">相恋天数按两个日期之间经过的天数计算。</p>
                {error && <p className="error">{error}</p>}
                <Button className="primary" type="submit" disabled={busy}>
                  保存设置
                </Button>
              </form>
              <div className="backup">
                <h3>把记忆好好保存</h3>
                <p>
                  记录、照片和视频只存在当前浏览器。清理网站数据会移除它们；导出的完整备份会包含视频，文件可能较大。
                </p>
                <div>
                  <Button variant="outline" onClick={backup} disabled={busy}>
                    <Download />
                    {busy ? '正在生成备份…' : '导出完整备份'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                  >
                    <Upload />
                    导入备份
                  </Button>
                  <input
                    hidden
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => {
                      void importFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
            </>
          )}
          {modal === 'photo' && large && (
            <>
              {selectedMedia?.type === 'video' ? (
                largeVideoUrl ? <video key={selectedMedia.id} className="full-video" src={largeVideoUrl} controls playsInline preload="metadata" poster={selectedMedia.poster || undefined} aria-label={`${large.title}，第${largeIndex + 1}项视频`} /> :
                <output className="video-loading">{largeVideoError || '正在打开本地视频…'}</output>
              ) : selectedMedia && <img className="full-photo" src={selectedMedia.poster} alt={`${large.title}，第${largeIndex + 1}张照片`} />}
              {entryMedia(large).length > 1 && (
                <div className="lightbox-pagination" aria-label="浏览这条记录的影像">
                  <Button type="button" variant="ghost" data-audio="none" disabled={largeIndex === 0} onClick={() => { setLargeVideoUrl(''); setLargeVideoError(''); setLargeIndex(largeIndex - 1); }}><ChevronLeft size={17} /> 上一项</Button>
                  <span>{largeIndex + 1} / {entryMedia(large).length}</span>
                  <Button type="button" variant="ghost" data-audio="none" disabled={largeIndex === entryMedia(large).length - 1} onClick={() => { setLargeVideoUrl(''); setLargeVideoError(''); setLargeIndex(largeIndex + 1); }}>下一项 <ChevronRight size={17} /></Button>
                </div>
              )}
              <p className="entry-text">{large.body}</p>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!remove}
        onOpenChange={(o) => {
          if (!o) setRemove(null);
        }}
      >
        <DialogContent className="journal-dialog">
          <DialogTitle>删除这条记忆？</DialogTitle>
          <DialogDescription>
            「{remove?.title}
            」将从本地手账删除。关联的照片、视频或打卡记录也会移除，请确认已保留需要的备份。
          </DialogDescription>
          <div className="form-footer">
            <Button variant="ghost" onClick={() => setRemove(null)}>
              保留
            </Button>
            <Button
              className="primary"
              disabled={busy}
              onClick={async () => {
                if (
                  await save(
                    {
                      ...data,
                      entries: data.entries.filter((e) => e.id !== remove?.id),
                    },
                    '已删除',
                    remove ? { remove: entryMedia(remove).filter((m) => m.type === 'video').map((m) => m.id) } : {},
                  )
                )
                  setRemove(null);
              }}
            >
              确认删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!imported}
        onOpenChange={(o) => {
          if (!o) setImported(null);
        }}
      >
        <DialogContent className="journal-dialog">
          <DialogTitle>用备份恢复手账？</DialogTitle>
          <DialogDescription>
            备份有 {imported?.journal.entries.length} 条记录、{imported?.videos.size} 个视频，将替换当前的{' '}
            {data.entries.length} 条记录。建议先导出当前备份。
          </DialogDescription>
          <div className="form-footer">
            <Button variant="ghost" onClick={backup}>
              先导出当前备份
            </Button>
            <Button
              className="primary"
              disabled={busy}
              onClick={async () => {
                if (imported && (await save(imported.journal, '手账已恢复', { replace: imported.videos }))) {
                  setImported(null);
                  setModal(null);
                }
              }}
            >
              确认替换
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
