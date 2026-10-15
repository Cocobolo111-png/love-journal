'use client';
/* oxlint-disable next/no-html-link-for-pages -- vinext's client Link navigation fails for this route; native navigation is verified */

import { useEffect, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  ArrowLeft, ArrowRight, CalendarHeart, Clock3, Coffee, Film, Gift,
  HandHeart, HeartHandshake, MessagesSquare, MoreHorizontal, Plus,
  RotateCcw, SmilePlus, Sparkles, WandSparkles,
} from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetTitle,
} from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { MusicToggle, useAudioSystem } from '@/components/audio-provider';
import { today } from '@/lib/journal';
import {
  couponIcons, loadLittleJoys, redeemCoupon, saveLittleJoys, visibleMessages,
  type Coupon, type CouponIcon, type LittleJoys, type Message,
} from '@/lib/little-joys';
import './little-joys.css';

const iconNames: Record<CouponIcon, string> = {
  massage: '按摩', film: '电影', truce: '和好', tea: '奶茶', hug: '拥抱',
  time: '陪伴', comfort: '哄哄', praise: '夸夸', wish: '心愿',
  date: '约会', surprise: '惊喜', restart: '重新开始',
};
const iconComponents = {
  massage: HandHeart, film: Film, truce: MessagesSquare, tea: Coffee,
  hug: HeartHandshake, time: Clock3, comfort: SmilePlus, praise: Sparkles,
  wish: WandSparkles, date: CalendarHeart, surprise: Gift, restart: RotateCcw,
};
const notesPerView = 5;
type EditorView = 'list' | 'message' | 'coupon' | 'delete';
type Deletion = { kind: 'message' | 'coupon'; id: string; name: string };

const emptyMessage = (): Message => ({
  id: `message_${crypto.randomUUID()}`, content: '', signature: '', pinned: false,
  enabled: true, createdAt: Date.now(), updatedAt: Date.now(),
});
const emptyCoupon = (): Coupon => ({
  id: `coupon_${crypto.randomUUID()}`, title: '', description: '', quantity: 1, initialQuantity: 1,
  icon: 'surprise', enabled: true, createdAt: Date.now(), updatedAt: Date.now(),
});

export default function LittleJoysPage() {
  const audio = useAudioSystem();
  const [data, setData] = useState<LittleJoys | null>(null);
  const [error, setError] = useState('');
  const [messagePage, setMessagePage] = useState(0);
  const [displayDay, setDisplayDay] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorView, setEditorView] = useState<EditorView>('list');
  const [messageDraft, setMessageDraft] = useState<Message | null>(null);
  const [couponDraft, setCouponDraft] = useState<Coupon | null>(null);
  const [deletion, setDeletion] = useState<Deletion | null>(null);
  const [detailCouponId, setDetailCouponId] = useState<string | null>(null);
  const [confirmingCoupon, setConfirmingCoupon] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [quantityMotion, setQuantityMotion] = useState<{ id: string; from: number; to: number } | null>(null);
  const quantityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redeemLock = useRef(false);
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setDisplayDay(today());
      try { setData(loadLittleJoys(window.localStorage)); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '小确幸暂时无法读取。'); }
    });
    return () => { active = false; };
  }, []);

  const ordered = data && displayDay ? visibleMessages(data.messages, displayDay) : [];
  const pageCount = Math.max(1, Math.ceil(ordered.length / notesPerView));
  const visibleNotes = Array.from({ length: Math.min(notesPerView, ordered.length) }, (_, index) =>
    ordered[(messagePage * notesPerView + index) % ordered.length]);
  const visibleCoupons = data?.coupons.filter((coupon) => coupon.enabled) ?? [];
  const selectedCoupon = data?.coupons.find((coupon) => coupon.id === detailCouponId);

  useEffect(() => () => { if (quantityTimer.current) clearTimeout(quantityTimer.current); }, []);

  useEffect(() => {
    const root = pageRef.current;
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.classList.add('joy-enhanced');
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    root.querySelectorAll('.joy-note').forEach((element) => observer.observe(element));
    let frame = 0;
    const scroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        root.style.setProperty('--note-drift', `${Math.min(window.scrollY, 700)}px`);
      });
    };
    scroll();
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', scroll);
      if (frame) cancelAnimationFrame(frame);
      root.classList.remove('joy-enhanced');
    };
  }, [data, messagePage]);

  function persist(next: LittleJoys, effect: 'confirm' | 'redeem' = 'confirm'): boolean {
    try {
      setData(saveLittleJoys(window.localStorage, next));
      if (effect === 'redeem') audio.playRedeem();
      else audio.playConfirm();
      setMessagePage(0);
      setError('');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请检查浏览器的本地存储空间。');
      return false;
    }
  }
  function saveMessage(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !messageDraft) return;
    const next = { ...messageDraft, content: messageDraft.content.trim(), signature: messageDraft.signature.trim(), updatedAt: Date.now() };
    if (!next.content) return;
    const exists = data.messages.some((message) => message.id === next.id);
    if (persist({ ...data, messages: exists ? data.messages.map((message) => message.id === next.id ? next : message) : [...data.messages, next] }))
      setEditorView('list');
  }
  function saveCoupon(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !couponDraft) return;
    const next = { ...couponDraft, title: couponDraft.title.trim(), description: couponDraft.description.trim(), updatedAt: Date.now() };
    if (!next.title) return;
    if (next.initialQuantity < next.quantity) {
      setError('初始数量不能小于剩余数量。');
      return;
    }
    const exists = data.coupons.some((coupon) => coupon.id === next.id);
    if (persist({ ...data, coupons: exists ? data.coupons.map((coupon) => coupon.id === next.id ? next : coupon) : [...data.coupons, next] }))
      setEditorView('list');
  }
  function changeMessage(id: string, changes: Partial<Message>) {
    if (!data) return;
    persist({ ...data, messages: data.messages.map((message) => message.id === id ? { ...message, ...changes, updatedAt: Date.now() } : message) });
  }
  function changeCoupon(id: string, changes: Partial<Coupon>) {
    if (!data) return;
    persist({ ...data, coupons: data.coupons.map((coupon) => coupon.id === id ? { ...coupon, ...changes, updatedAt: Date.now() } : coupon) });
  }
  function confirmDelete() {
    if (!data || !deletion) return;
    const next = deletion.kind === 'message'
      ? { ...data, messages: data.messages.filter((message) => message.id !== deletion.id) }
      : { ...data, coupons: data.coupons.filter((coupon) => coupon.id !== deletion.id) };
    if (persist(next)) { setDeletion(null); setEditorView('list'); }
  }
  function openMessage(message?: Message) { setMessageDraft(message ? { ...message } : emptyMessage()); setEditorView('message'); }
  function openCoupon(coupon?: Coupon) { setCouponDraft(coupon ? { ...coupon } : emptyCoupon()); setEditorView('coupon'); setError(''); }
  function openCouponDetail(id: string) {
    setCouponError('');
    setConfirmingCoupon(false);
    setDetailCouponId(id);
  }
  function confirmRedeem() {
    if (!detailCouponId || redeemLock.current) return;
    redeemLock.current = true;
    try {
      const current = loadLittleJoys(window.localStorage);
      const coupon = current.coupons.find((item) => item.id === detailCouponId);
      if (!coupon) throw Error('这张券暂时无法兑换。');
      const next = redeemCoupon(current, detailCouponId);
      if (!persist(next, 'redeem')) {
        setCouponError('兑换未保存，数量保持不变。请检查浏览器存储空间。');
        return;
      }
      setQuantityMotion({ id: detailCouponId, from: coupon.quantity, to: coupon.quantity - 1 });
      if (quantityTimer.current) clearTimeout(quantityTimer.current);
      quantityTimer.current = setTimeout(() => setQuantityMotion(null), 320);
      setConfirmingCoupon(false);
      setCouponError('');
    } catch (cause) {
      setCouponError(cause instanceof Error ? cause.message : '兑换失败，数量未改变。');
    } finally {
      redeemLock.current = false;
    }
  }

  return (
    <main className="little-joys-page" ref={pageRef}>
      <a className="skip-link" href="#little-joys-content">跳到小确幸内容</a>
      <div className="joy-atmosphere" aria-hidden="true" />
      <header className="joy-topbar">
        <a href="/#world-menu" data-audio="transition" className="joy-back"><ArrowLeft size={17} aria-hidden="true" /> 返回我们的世界</a>
        <span className="joy-mark">OUR LITTLE WORLD · SECRET DRAWER</span>
        <div className="joy-topbar-actions">
          <MusicToggle />
          <button className="joy-more" type="button" data-audio="micro" aria-label="编辑小确幸" title="编辑小确幸" onClick={() => { setEditorView('list'); setEditorOpen(true); }} disabled={!data}>
            <MoreHorizontal size={22} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div id="little-joys-content" className="joy-content">
        {error && <p className="joy-error" role="alert">{error}</p>}
        <section className="joy-messages" aria-labelledby="joy-messages-title">
          <div className="joy-section-heading">
            <span className="joy-kicker">MESSAGES</span>
            <h1 id="joy-messages-title">路过你的生活，留句话</h1>
            <p>像抽屉里偶然翻到的几张纸，刚好写给今天的你。</p>
          </div>
          {data && (visibleNotes.length ? (
            <div className="joy-notes" key={messagePage}>
              {visibleNotes.map((message, index) => (
                <div className={`joy-note joy-note-${index % notesPerView}`} key={message.id}>
                  <article className="joy-note-paper">
                    <span className="joy-note-mark" aria-hidden="true">“</span>
                    <p>{message.content}</p>
                    {message.signature && <small>— {message.signature}</small>}
                  </article>
                </div>
              ))}
            </div>
          ) : <p className="joy-empty">这里暂时没有露面的留言。也许，下一句正等你写下。</p>)}
          {ordered.length > notesPerView && (
            <button type="button" className="joy-more-notes" data-audio="micro" onClick={() => setMessagePage((page) => (page + 1) % pageCount)}>
              再看看 <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </section>

        <section className="joy-coupons" aria-labelledby="joy-coupons-title">
          <div className="joy-section-heading joy-coupon-heading">
            <span className="joy-kicker">COUPONS</span>
            <h2 id="joy-coupons-title">爱情兑换券</h2>
            <p>不是优惠，是我们悄悄留给彼此的小小约定。</p>
          </div>
          <button type="button" className="joy-add-coupon" disabled={!data} onClick={() => { openCoupon(); setEditorOpen(true); }}><Plus size={16} aria-hidden="true" /> 新增兑换券</button>
          {data && (visibleCoupons.length ? (
            <div className="joy-ticket-grid">
              {visibleCoupons.map((coupon, index) => {
                const Icon = iconComponents[coupon.icon];
                return <article className={`joy-ticket joy-ticket-${index % 3}`} key={coupon.id}>
                  <button type="button" className="joy-ticket-open" data-audio="primary" aria-label={`查看${coupon.title}，${coupon.quantity > 0 ? `剩余${coupon.quantity}张` : '已兑完'}`} onClick={() => openCouponDetail(coupon.id)} />
                  <div className="joy-ticket-top"><Icon size={24} strokeWidth={1.35} aria-hidden="true" /><span>PRIVATE PROMISE</span></div>
                  <div className="joy-ticket-middle"><h3>{coupon.title}</h3><strong className={coupon.quantity === 0 ? 'joy-ticket-empty-count' : undefined}>{coupon.quantity > 0 ? `×${coupon.quantity}` : '已兑完'}</strong></div>
                  <p>{coupon.description}</p>
                  <div className="joy-ticket-foot"><span>FOR US, ALWAYS</span><span aria-hidden="true">✦</span></div>
                </article>;
              })}
            </div>
          ) : <p className="joy-empty">这叠票根暂时收起来了。下一张约定，留给以后。</p>)}
        </section>
        <footer className="joy-footer">一点点喜欢，藏在日常的缝隙里。</footer>
      </div>

      <Dialog open={!!selectedCoupon} onOpenChange={(open) => { if (!open) { setDetailCouponId(null); setConfirmingCoupon(false); setCouponError(''); } }}>
        <DialogContent className="joy-coupon-dialog" showCloseButton={false}>
          {selectedCoupon && (confirmingCoupon ? <>
            <span className="joy-dialog-kicker">A LITTLE PROMISE</span>
            <DialogTitle>使用一张{selectedCoupon.title}？</DialogTitle>
            <DialogDescription>使用后剩余 {Math.max(0, selectedCoupon.quantity - 1)} 张</DialogDescription>
            {couponError && <p className="joy-dialog-error" role="alert">{couponError}</p>}
            <div className="joy-dialog-actions">
              <button type="button" className="joy-dialog-secondary" data-audio="micro" onClick={() => { setConfirmingCoupon(false); setCouponError(''); }}>取消</button>
              <button type="button" className="joy-dialog-primary" data-audio="none" disabled={selectedCoupon.quantity < 1} onClick={confirmRedeem}>确认兑换</button>
            </div>
          </> : <>
            <span className="joy-dialog-kicker">PRIVATE PROMISE</span>
            <DialogTitle>{selectedCoupon.title}</DialogTitle>
            <DialogDescription className="joy-coupon-description">{selectedCoupon.description}</DialogDescription>
            <div className="joy-coupon-count" aria-live="polite">
              <span>剩余</span>
              <strong aria-label={`${selectedCoupon.quantity} 张`}>
                {quantityMotion?.id === selectedCoupon.id ? <span className="joy-number-stack" aria-hidden="true"><span className="joy-number-old">{quantityMotion.from}</span><span className="joy-number-new">{quantityMotion.to}</span></span> : selectedCoupon.quantity}
              </strong>
              <span>张</span>
            </div>
            {couponError && <p className="joy-dialog-error" role="alert">{couponError}</p>}
            <button type="button" className="joy-dialog-primary joy-redeem-start" disabled={selectedCoupon.quantity < 1} onClick={() => setConfirmingCoupon(true)}>{selectedCoupon.quantity > 0 ? '兑换一张' : '已兑完'}</button>
            <div className="joy-dialog-links">
              <button type="button" data-audio="micro" onClick={() => { setDetailCouponId(null); openCoupon(selectedCoupon); setEditorOpen(true); }}>编辑券</button>
              <button type="button" data-audio="micro" onClick={() => setDetailCouponId(null)}>关闭</button>
            </div>
          </>)}
        </DialogContent>
      </Dialog>

      <Sheet open={editorOpen} onOpenChange={(open) => { setEditorOpen(open); if (!open) { setEditorView('list'); setDeletion(null); } }}>
        <SheetContent className="joy-sheet" side="right" showCloseButton={false}>
          <div className="joy-sheet-head">
            <div>
              {editorView !== 'list' && <button type="button" className="joy-sheet-back" data-audio="micro" onClick={() => setEditorView('list')}><ArrowLeft size={16} /> 返回收藏</button>}
              <SheetTitle>{editorView === 'list' ? '整理小确幸' : editorView === 'message' ? '写一张留言' : editorView === 'coupon' ? '留一张约定' : '确认删除'}</SheetTitle>
              <SheetDescription>{editorView === 'list' ? '只在这里整理，不打扰平时的翻阅。内容仅存在当前浏览器，不包含在手账备份中。' : '写下的内容会保存在这台设备的浏览器里。'}</SheetDescription>
            </div>
            <button type="button" className="joy-sheet-close" data-audio="micro" aria-label="关闭编辑模式" onClick={() => setEditorOpen(false)}>关闭</button>
          </div>

          {editorView === 'list' && data && <div className="joy-manager">
            <section aria-labelledby="manage-messages">
              <div className="joy-manager-title"><h3 id="manage-messages">MESSAGES <span>留言</span></h3><button type="button" onClick={() => openMessage()}><Plus size={16} /> 添加留言</button></div>
              <div className="joy-manager-list">{data.messages.map((message) => <article className="joy-manager-row" key={message.id}>
                <p>{message.content}</p>
                <div className="joy-manager-meta">{message.pinned && <span>置顶</span>}{!message.enabled && <span>已隐藏</span>}{message.signature && <span>— {message.signature}</span>}</div>
                <div className="joy-manager-actions">
                  <button type="button" aria-label={`编辑留言：${message.content.slice(0, 20)}`} onClick={() => openMessage(message)}>编辑</button>
                  <button type="button" aria-label={`${message.pinned ? '取消置顶' : '置顶'}留言：${message.content.slice(0, 20)}`} aria-pressed={message.pinned} onClick={() => changeMessage(message.id, { pinned: !message.pinned })}>{message.pinned ? '取消置顶' : '置顶'}</button>
                  <button type="button" aria-label={`${message.enabled ? '隐藏' : '显示'}留言：${message.content.slice(0, 20)}`} aria-pressed={!message.enabled} onClick={() => changeMessage(message.id, { enabled: !message.enabled })}>{message.enabled ? '隐藏' : '显示'}</button>
                  <button type="button" aria-label={`删除留言：${message.content.slice(0, 20)}`} onClick={() => { setDeletion({ kind: 'message', id: message.id, name: message.content.slice(0, 18) }); setEditorView('delete'); }}>删除</button>
                </div>
              </article>)}</div>
            </section>
            <section aria-labelledby="manage-coupons">
              <div className="joy-manager-title"><h3 id="manage-coupons">COUPONS <span>兑换券</span></h3><button type="button" onClick={() => openCoupon()}><Plus size={16} /> 添加兑换券</button></div>
              <div className="joy-manager-list">{data.coupons.map((coupon) => <article className="joy-manager-row" key={coupon.id}>
                <p>{coupon.title} <span>×{coupon.quantity}</span></p>
                <div className="joy-manager-meta">{!coupon.enabled && <span>已隐藏</span>}<span>{coupon.description.replaceAll('\n', ' ')}</span></div>
                <div className="joy-manager-actions">
                  <button type="button" data-audio="micro" aria-label={`编辑兑换券：${coupon.title}`} onClick={() => openCoupon(coupon)}>编辑</button>
                  <button type="button" aria-label={`${coupon.enabled ? '隐藏' : '显示'}兑换券：${coupon.title}`} aria-pressed={!coupon.enabled} onClick={() => changeCoupon(coupon.id, { enabled: !coupon.enabled })}>{coupon.enabled ? '隐藏' : '显示'}</button>
                  <button type="button" aria-label={`删除兑换券：${coupon.title}`} onClick={() => { setDeletion({ kind: 'coupon', id: coupon.id, name: coupon.title }); setEditorView('delete'); }}>删除</button>
                </div>
              </article>)}</div>
            </section>
          </div>}

          {editorView === 'message' && messageDraft && <form className="joy-editor-form" onSubmit={saveMessage}>
            <label>想说的话<textarea required maxLength={1000} rows={7} value={messageDraft.content} onChange={(event) => setMessageDraft({ ...messageDraft, content: event.target.value })} placeholder="想对宝贝说些什么？" /></label>
            <label>署名（可选）<input maxLength={40} value={messageDraft.signature} onChange={(event) => setMessageDraft({ ...messageDraft, signature: event.target.value })} placeholder="留空也很好" /></label>
            <label className="joy-check"><input type="checkbox" checked={messageDraft.pinned} onChange={(event) => setMessageDraft({ ...messageDraft, pinned: event.target.checked })} /> 优先翻到这张留言</label>
            <label className="joy-check"><input type="checkbox" checked={messageDraft.enabled} onChange={(event) => setMessageDraft({ ...messageDraft, enabled: event.target.checked })} /> 在普通页面展示</label>
            <button type="submit" className="joy-save">保存留言 <ArrowRight size={16} /></button>
          </form>}

          {editorView === 'coupon' && couponDraft && <form className="joy-editor-form" onSubmit={saveCoupon}>
            <label>券名称<input required maxLength={80} value={couponDraft.title} onChange={(event) => setCouponDraft({ ...couponDraft, title: event.target.value })} placeholder="例如：散步券" /></label>
            <label>一句小约定<textarea maxLength={500} rows={4} value={couponDraft.description} onChange={(event) => setCouponDraft({ ...couponDraft, description: event.target.value })} placeholder="什么时候兑现，怎么兑现？" /></label>
            <div className="joy-form-pair">
              <label>剩余数量<input required type="number" min={0} max={999} step={1} value={couponDraft.quantity} onChange={(event) => setCouponDraft({ ...couponDraft, quantity: Number(event.target.value) })} /></label>
              <label>初始数量<input required type="number" min={couponDraft.quantity} max={999} step={1} value={couponDraft.initialQuantity} onChange={(event) => setCouponDraft({ ...couponDraft, initialQuantity: Number(event.target.value) })} /></label>
            </div>
            <div className="joy-form-pair">
              <label>小图标<select value={couponDraft.icon} onChange={(event) => setCouponDraft({ ...couponDraft, icon: event.target.value as CouponIcon })}>{couponIcons.map((icon) => <option value={icon} key={icon}>{iconNames[icon]}</option>)}</select></label>
            </div>
            <label className="joy-check"><input type="checkbox" checked={couponDraft.enabled} onChange={(event) => setCouponDraft({ ...couponDraft, enabled: event.target.checked })} /> 在普通页面展示</label>
            <button type="submit" className="joy-save" data-audio="none">保存兑换券 <ArrowRight size={16} /></button>
          </form>}

          {editorView === 'delete' && deletion && <div className="joy-delete-confirm">
            <p>要删掉「{deletion.name}」吗？删除后不会再出现在这台设备里。</p>
            <div><button type="button" onClick={() => setEditorView('list')}>先留着</button><button type="button" className="joy-delete-button" onClick={confirmDelete}>确认删除</button></div>
          </div>}
          {error && <p className="joy-sheet-error" role="alert">{error}</p>}
        </SheetContent>
      </Sheet>
    </main>
  );
}
