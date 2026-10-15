import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioSystem, AUDIO_LEVELS, AUDIO_PATHS } from '../lib/audio-system.ts';

function setupAudioBrowser() {
  const previous = Object.fromEntries(['window', 'document', 'Audio', 'KeyboardEvent', 'requestAnimationFrame', 'cancelAnimationFrame'].map((name) => [name, globalThis[name]]));
  const localValues = new Map();
  const sessionValues = new Map();
  const storage = (values) => ({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  const browserWindow = new EventTarget();
  browserWindow.localStorage = storage(localValues);
  browserWindow.sessionStorage = storage(sessionValues);
  const browserDocument = new EventTarget();
  browserDocument.hidden = false;
  class FakeAudio extends EventTarget {
    static created = [];
    static rejectNext = false;
    constructor(src) {
      super();
      this.src = src;
      this.volume = 1;
      this.paused = true;
      this.currentTime = 0;
      this.duration = 120;
      this.readyState = 1;
      this.playCalls = 0;
      this.pauseCalls = 0;
      FakeAudio.created.push(this);
    }
    play() {
      this.playCalls++;
      if (FakeAudio.rejectNext) { FakeAudio.rejectNext = false; return Promise.reject(new Error('NotAllowedError')); }
      this.paused = false;
      return Promise.resolve();
    }
    pause() { this.paused = true; this.pauseCalls++; }
  }
  globalThis.window = browserWindow;
  globalThis.document = browserDocument;
  globalThis.Audio = FakeAudio;
  globalThis.KeyboardEvent = class extends Event {};
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now() + 3000), 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  return {
    FakeAudio, localValues, sessionValues, browserWindow, browserDocument,
    restore() { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; } },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test('BGM stays silent until interaction, then unlocks and fades to ambient volume', async () => {
  const browser = setupAudioBrowser();
  const audio = new AudioSystem();
  const unmount = audio.mount();
  try {
    const bgm = browser.FakeAudio.created[0];
    assert.equal(bgm.src, AUDIO_PATHS.bgm);
    assert.equal(bgm.preload, 'metadata');
    assert.equal(bgm.loop, true);
    assert.equal(bgm.playCalls, 0);
    assert.equal(bgm.volume, 0);
    browser.browserWindow.dispatchEvent(new Event('wheel'));
    await settle();
    assert.equal(bgm.playCalls, 1);
    assert.equal(audio.musicUnlocked, true);
    assert.equal(audio.musicPlaying, true);
    assert.equal(bgm.volume, AUDIO_LEVELS.bgm);
    browser.browserWindow.dispatchEvent(new Event('click'));
    assert.equal(bgm.playCalls, 1);
  } finally { unmount(); browser.restore(); }
});

test('autoplay denial is quiet and the next gesture retries', async () => {
  const browser = setupAudioBrowser();
  browser.FakeAudio.rejectNext = true;
  const audio = new AudioSystem();
  const unmount = audio.mount();
  try {
    const bgm = browser.FakeAudio.created[0];
    browser.browserWindow.dispatchEvent(new Event('wheel'));
    await settle();
    assert.equal(audio.musicUnlocked, false);
    assert.equal(audio.musicPlaying, false);
    browser.browserWindow.dispatchEvent(new Event('click'));
    await settle();
    assert.equal(bgm.playCalls, 2);
    assert.equal(audio.musicUnlocked, true);
  } finally { unmount(); browser.restore(); }
});

test('manual mute fades and persists; later gestures cannot restart; unmute resumes position', async () => {
  const browser = setupAudioBrowser();
  const audio = new AudioSystem();
  const unmount = audio.mount();
  try {
    const bgm = browser.FakeAudio.created[0];
    browser.browserWindow.dispatchEvent(new Event('pointerdown'));
    await settle();
    bgm.currentTime = 42;
    audio.disableMusic();
    await settle();
    assert.equal(bgm.paused, true);
    assert.equal(bgm.volume, 0);
    assert.equal(browser.localValues.get('love-journal-demo-audio-enabled-v1'), 'false');
    browser.browserWindow.dispatchEvent(new Event('wheel'));
    assert.equal(bgm.playCalls, 1);
    audio.enableMusic();
    await settle();
    assert.equal(bgm.playCalls, 2);
    assert.equal(bgm.currentTime, 42);
    assert.equal(browser.localValues.get('love-journal-demo-audio-enabled-v1'), 'true');
  } finally { unmount(); browser.restore(); }
});

test('repeated effects share one instance and are rate-limited; success and redeem stay separate', () => {
  const browser = setupAudioBrowser();
  const audio = new AudioSystem();
  const unmount = audio.mount();
  try {
    audio.playPrimaryClick();
    audio.playPrimaryClick();
    audio.playPrimaryClick();
    audio.playConfirm();
    audio.playRedeem();
    assert.equal(browser.FakeAudio.created.find((sound) => sound.src === AUDIO_PATHS.primary).playCalls, 1);
    assert.equal(browser.FakeAudio.created.find((sound) => sound.src === AUDIO_PATHS.confirm).playCalls, 1);
    assert.equal(browser.FakeAudio.created.find((sound) => sound.src === AUDIO_PATHS.redeem).playCalls, 1);
    assert.equal(browser.FakeAudio.created.length, 4);
  } finally { unmount(); browser.restore(); }
});

test('effects duck a playing BGM gently and restore its independent fade level', async () => {
  const browser = setupAudioBrowser();
  const audio = new AudioSystem();
  const unmount = audio.mount();
  try {
    const bgm = browser.FakeAudio.created[0];
    browser.browserWindow.dispatchEvent(new Event('pointerdown'));
    await settle();
    assert.equal(bgm.volume, 0.19);
    audio.playPrimaryClick();
    await settle();
    assert.ok(Math.abs(bgm.volume - 0.16) < 0.001);
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.equal(bgm.volume, 0.19);
    audio.playConfirm();
    await settle();
    assert.ok(Math.abs(bgm.volume - 0.145) < 0.001);
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.equal(bgm.volume, 0.19);
  } finally { unmount(); browser.restore(); }
});

test('a background resume denied by the browser can retry on the next gesture', async () => {
  const browser = setupAudioBrowser();
  const audio = new AudioSystem();
  const unmount = audio.mount();
  try {
    const bgm = browser.FakeAudio.created[0];
    browser.browserWindow.dispatchEvent(new Event('pointerdown'));
    await settle();
    bgm.paused = true; // Mobile browser suspended media in the background.
    browser.FakeAudio.rejectNext = true;
    browser.browserDocument.dispatchEvent(new Event('visibilitychange'));
    await settle();
    assert.equal(audio.musicPlaying, false);
    browser.browserWindow.dispatchEvent(new Event('touchstart'));
    await settle();
    assert.equal(bgm.playCalls, 3);
    assert.equal(audio.musicPlaying, true);
  } finally { unmount(); browser.restore(); }
});

test('a previously saved mute prevents automatic playback after refresh', () => {
  const browser = setupAudioBrowser();
  browser.localValues.set('love-journal-demo-audio-enabled-v1', 'false');
  const audio = new AudioSystem();
  const unmount = audio.mount();
  try {
    browser.browserWindow.dispatchEvent(new Event('wheel'));
    assert.equal(audio.musicEnabled, false);
    assert.equal(browser.FakeAudio.created[0].playCalls, 0);
  } finally { unmount(); browser.restore(); }
});

test('refresh restores the last position but still waits for a fresh gesture', async () => {
  const browser = setupAudioBrowser();
  const first = new AudioSystem();
  const leave = first.mount();
  try {
    browser.browserWindow.dispatchEvent(new Event('pointerdown'));
    await settle();
    browser.FakeAudio.created[0].currentTime = 38;
    browser.browserWindow.dispatchEvent(new Event('pagehide'));
    leave();
    const next = new AudioSystem();
    const unmount = next.mount();
    try {
      const bgm = browser.FakeAudio.created[1];
      assert.equal(bgm.currentTime, 38);
      assert.equal(bgm.playCalls, 0);
      browser.browserWindow.dispatchEvent(new Event('pointerdown'));
      await settle();
      assert.equal(bgm.playCalls, 1);
    } finally { unmount(); }
  } finally { leave(); browser.restore(); }
});
