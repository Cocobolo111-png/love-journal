export type SoundEffect = 'primary' | 'micro' | 'confirm' | 'transition' | 'redeem';

export const AUDIO_LEVELS = {
  bgm: 0.19,
  primary: 0.20,
  micro: 0.16,
  confirm: 0.22,
  transition: 0.18,
  redeem: 0.25,
} as const;

export const AUDIO_PATHS = {
  bgm: '/audio/00_main_bgm_romantic_immersive_website.wav',
  primary: '/audio/01_primary_soft_tap.wav',
  micro: '/audio/02_micro_glass_touch.wav',
  confirm: '/audio/03_confirm_soft_bloom.wav',
  transition: '/audio/04_section_transition.wav',
  redeem: '/audio/05_lucky_redeem.wav',
} as const;

const ENABLED_KEY = 'love-journal-demo-audio-enabled-v1';
const POSITION_KEY = 'love-journal-demo-audio-position-v1';
const EFFECT_GAPS: Record<SoundEffect, number> = {
  primary: 90,
  micro: 90,
  confirm: 300,
  transition: 500,
  redeem: 800,
};
const UNLOCK_EVENTS = ['pointerdown', 'click', 'touchstart', 'touchmove', 'wheel', 'keydown'] as const;

/** One browser-tab sound world. No Audio object is created during server rendering. */
export class AudioSystem {
  private bgm: HTMLAudioElement | null = null;
  private effects = new Map<SoundEffect, HTMLAudioElement>();
  private listeners = new Set<() => void>();
  private lastEffect = new Map<SoundEffect, number>();
  private fadeFrame = 0;
  private fadeToken = 0;
  private baseVolume = 0;
  private duckGain = 1;
  private duckFrame = 0;
  private duckToken = 0;
  private duckTimer: ReturnType<typeof setTimeout> | null = null;
  private playPending = false;
  private mounted = false;
  private positionSavedAt = 0;
  musicUnlocked = false;
  musicEnabled = true;
  musicPlaying = false;
  readonly targetVolume = AUDIO_LEVELS.bgm;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getEnabled = () => this.musicEnabled;
  getPlaying = () => this.musicPlaying;

  private emit() { this.listeners.forEach((listener) => listener()); }
  private storeEnabled() {
    try { window.localStorage.setItem(ENABLED_KEY, String(this.musicEnabled)); } catch { /* Audio is optional. */ }
  }
  private savePosition = () => {
    if (!this.bgm || !Number.isFinite(this.bgm.currentTime)) return;
    try { window.sessionStorage.setItem(POSITION_KEY, String(this.bgm.currentTime)); } catch { /* Audio is optional. */ }
  };
  private onTimeUpdate = () => {
    const now = Date.now();
    if (now - this.positionSavedAt < 5000) return;
    this.positionSavedAt = now;
    this.savePosition();
  };

  mount() {
    if (this.mounted || typeof window === 'undefined') return () => {};
    this.mounted = true;
    try { this.musicEnabled = window.localStorage.getItem(ENABLED_KEY) !== 'false'; } catch { this.musicEnabled = true; }
    if (!this.bgm) {
      this.bgm = new Audio();
      this.bgm.preload = 'metadata';
      this.bgm.loop = true;
      this.bgm.volume = 0;
      this.bgm.src = AUDIO_PATHS.bgm;
    }
    this.baseVolume = 0;
    this.duckGain = 1;
    this.bgm.volume = 0;
    this.bgm.addEventListener('timeupdate', this.onTimeUpdate);
    try {
      const previous = Number(window.sessionStorage.getItem(POSITION_KEY));
      if (Number.isFinite(previous) && previous > 0) {
        const seek = () => {
          if (this.bgm && previous < this.bgm.duration) this.bgm.currentTime = previous;
        };
        if (this.bgm.readyState >= 1) seek();
        else this.bgm.addEventListener('loadedmetadata', seek, { once: true });
      }
    } catch { /* Audio is optional. */ }
    this.addUnlockListeners();
    document.addEventListener('click', this.onDocumentClick, true);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.savePosition);
    window.addEventListener('pageshow', this.onPageShow);
    this.emit();
    return () => this.unmount();
  }

  private unmount() {
    if (!this.mounted) return;
    this.mounted = false;
    this.removeUnlockListeners();
    document.removeEventListener('click', this.onDocumentClick, true);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.savePosition);
    window.removeEventListener('pageshow', this.onPageShow);
    this.bgm?.removeEventListener('timeupdate', this.onTimeUpdate);
    this.savePosition();
    this.cancelFade();
    this.cancelDuck();
    this.bgm?.pause();
    this.musicPlaying = false;
    this.musicUnlocked = false;
    this.emit();
  }

  private addUnlockListeners() {
    for (const event of UNLOCK_EVENTS) window.addEventListener(event, this.onFirstInteraction, { passive: true });
  }
  private removeUnlockListeners() {
    for (const event of UNLOCK_EVENTS) window.removeEventListener(event, this.onFirstInteraction);
  }
  private onFirstInteraction = (event: Event) => {
    if (event instanceof KeyboardEvent && (event.metaKey || event.ctrlKey || event.altKey || ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(event.key))) return;
    if (this.musicEnabled) void this.attemptPlay(2500);
  };
  private onVisibilityChange = () => {
    if (!document.hidden && this.musicEnabled && this.musicUnlocked && this.bgm?.paused) void this.attemptPlay(1250);
  };
  private onPageShow = () => {
    if (this.musicEnabled && this.musicUnlocked && this.bgm?.paused) void this.attemptPlay(1250);
  };

  private async attemptPlay(fadeMs: number) {
    if (!this.bgm || !this.mounted || !this.musicEnabled || this.playPending || !this.bgm.paused) return;
    this.playPending = true;
    this.cancelFade();
    this.cancelDuck();
    this.baseVolume = 0;
    this.syncBgmVolume();
    try {
      await this.bgm.play();
      if (!this.musicEnabled || !this.mounted) { this.bgm.pause(); return; }
      this.musicUnlocked = true;
      this.musicPlaying = true;
      this.removeUnlockListeners();
      this.emit();
      this.fadeTo(this.targetVolume, fadeMs);
    } catch {
      // Autoplay denial and missing assets are non-fatal. A later gesture can retry.
      this.musicPlaying = false;
      this.addUnlockListeners();
      this.emit();
    } finally {
      this.playPending = false;
    }
  }

  private cancelFade() {
    this.fadeToken++;
    if (this.fadeFrame) cancelAnimationFrame(this.fadeFrame);
    this.fadeFrame = 0;
  }
  private syncBgmVolume() {
    if (this.bgm) this.bgm.volume = Math.max(0, Math.min(0.25, this.baseVolume * this.duckGain));
  }
  private cancelDuck() {
    this.duckToken++;
    if (this.duckFrame) cancelAnimationFrame(this.duckFrame);
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.duckFrame = 0;
    this.duckTimer = null;
    this.duckGain = 1;
    this.syncBgmVolume();
  }
  private animateDuck(target: number, durationMs: number, after?: () => void) {
    if (this.duckFrame) cancelAnimationFrame(this.duckFrame);
    const token = ++this.duckToken;
    const start = this.duckGain;
    const began = performance.now();
    const tick = (time: number) => {
      if (token !== this.duckToken) return;
      const progress = Math.min(1, (time - began) / durationMs);
      const eased = progress * progress * (3 - 2 * progress);
      this.duckGain = start + (target - start) * eased;
      this.syncBgmVolume();
      if (progress < 1) this.duckFrame = requestAnimationFrame(tick);
      else { this.duckFrame = 0; after?.(); }
    };
    this.duckFrame = requestAnimationFrame(tick);
  }
  private duckBgm(kind: SoundEffect) {
    if (!this.musicPlaying || !this.musicEnabled || !this.bgm || this.bgm.paused) return;
    const quieter = kind === 'confirm' || kind === 'transition' || kind === 'redeem';
    const target = (quieter ? 0.145 : 0.16) / this.targetVolume;
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.animateDuck(Math.min(this.duckGain, target), 50, () => {
      this.duckTimer = setTimeout(() => {
        this.duckTimer = null;
        this.animateDuck(1, 270);
      }, 20);
    });
  }
  private fadeTo(target: number, durationMs: number, after?: () => void) {
    if (!this.bgm) return;
    this.cancelFade();
    const token = this.fadeToken;
    const start = this.baseVolume;
    const began = performance.now();
    const tick = (time: number) => {
      if (token !== this.fadeToken || !this.bgm) return;
      const progress = Math.min(1, (time - began) / durationMs);
      const ease = progress * progress * (3 - 2 * progress);
      this.baseVolume = start + (target - start) * ease;
      this.syncBgmVolume();
      if (progress < 1) this.fadeFrame = requestAnimationFrame(tick);
      else { this.fadeFrame = 0; after?.(); }
    };
    this.fadeFrame = requestAnimationFrame(tick);
  }

  enableMusic() {
    if (this.musicEnabled && this.musicPlaying) return;
    this.musicEnabled = true;
    this.storeEnabled();
    this.emit();
    if (this.bgm?.paused) void this.attemptPlay(1250);
    else if (this.bgm) { this.musicPlaying = true; this.fadeTo(this.targetVolume, 1250); this.emit(); }
  }
  disableMusic() {
    if (!this.musicEnabled) return;
    this.musicEnabled = false;
    this.storeEnabled();
    this.emit();
    if (!this.bgm || this.bgm.paused) return;
    this.fadeTo(0, 500, () => {
      this.bgm?.pause();
      this.savePosition();
      this.musicPlaying = false;
      this.emit();
    });
  }
  toggleMusic() {
    this.playEffect('micro', true);
    if (this.musicEnabled) this.disableMusic();
    else this.enableMusic();
  }

  private playEffect(kind: SoundEffect, allowWhenMuted = false) {
    if (!this.mounted || (!this.musicEnabled && !allowWhenMuted)) return;
    const now = performance.now();
    if (now - (this.lastEffect.get(kind) ?? -Infinity) < EFFECT_GAPS[kind]) return;
    this.lastEffect.set(kind, now);
    let sound = this.effects.get(kind);
    if (!sound) {
      sound = new Audio();
      sound.preload = 'auto';
      sound.volume = AUDIO_LEVELS[kind];
      sound.src = AUDIO_PATHS[kind];
      this.effects.set(kind, sound);
    }
    try {
      sound.pause();
      sound.currentTime = 0;
      void sound.play().catch(() => {});
      this.duckBgm(kind);
    } catch { /* Optional sound must never interrupt the site. */ }
  }
  playPrimaryClick() { this.playEffect('primary'); }
  playMicroClick() { this.playEffect('micro'); }
  playConfirm() { this.playEffect('confirm'); }
  playTransition() { this.playEffect('transition'); }
  playRedeem() { this.playEffect('redeem'); }

  private onDocumentClick = (event: MouseEvent) => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>('button, a[href]');
    if (!control || control.matches(':disabled, [aria-disabled="true"]')) return;
    const effect = control.dataset.audio;
    if (effect === 'none') return;
    if (effect === 'transition') { this.playTransition(); return; }
    if (effect === 'micro' || control.matches('[data-slot="dialog-close"], [data-slot="sheet-close"]')) this.playMicroClick();
    else this.playPrimaryClick();
  };
}
