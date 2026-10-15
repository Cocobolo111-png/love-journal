'use client';

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { Music2 } from 'lucide-react';
import { AudioSystem } from '@/lib/audio-system';
import './audio-control.css';

const audioSystem = new AudioSystem();
const AudioContext = createContext<AudioSystem>(audioSystem);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => audioSystem.mount(), []);
  return <AudioContext.Provider value={audioSystem}>{children}</AudioContext.Provider>;
}

export function useAudioSystem() { return useContext(AudioContext); }

export function MusicToggle() {
  const audio = useAudioSystem();
  const enabled = useSyncExternalStore(audio.subscribe, audio.getEnabled, () => true);
  const playing = useSyncExternalStore(audio.subscribe, audio.getPlaying, () => false);
  const label = enabled ? '关闭背景音乐' : '开启背景音乐';
  return (
    <button
      type="button"
      className="music-toggle"
      data-audio="none"
      aria-label={label}
      aria-pressed={enabled}
      title={enabled ? 'Sound on' : 'Sound off'}
      onClick={() => audio.toggleMusic()}
    >
      <Music2 size={16} strokeWidth={1.6} aria-hidden="true" />
      <span className={playing ? 'music-tick is-playing' : 'music-tick'} aria-hidden="true" />
    </button>
  );
}
