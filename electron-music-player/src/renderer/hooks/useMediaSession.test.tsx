import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Program, Song } from '../../shared/musicTypes';
import { usePlayerStore } from '../state/playerStore';
import { useMediaSession } from './useMediaSession';

const song: Song = {
  id: 'qq:media-session-song',
  providerId: 'qq',
  title: 'Media Session Song',
  artist: 'Session Artist',
  album: 'Session Album',
  durationMs: 240000,
  coverTone: 'linear-gradient(135deg, #8edfc7, #a8c9ee)',
  coverUrl: 'https://example.test/covers/session.jpg'
};

const program: Program = {
  id: 'netease:program:media-session',
  mediaType: 'program',
  providerId: 'netease',
  platformProgramId: 'media-session',
  title: 'Media Session Program',
  description: 'Program metadata fixture',
  durationMs: 1_800_000,
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  coverUrl: 'https://example.test/covers/program.jpg',
  podcast: {
    id: 'netease:podcast:media-session',
    providerId: 'netease',
    platformPodcastId: 'media-session',
    title: 'Program Podcast',
    description: 'Program podcast fixture',
    author: 'Program Host',
    coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
  },
  sourceContext: {
    type: 'podcast',
    providerId: 'netease',
    podcastId: 'netease:podcast:media-session',
    podcastTitle: 'Program Podcast'
  }
};

const originalPlayerActions = {
  playPrevious: usePlayerStore.getState().playPrevious,
  playNext: usePlayerStore.getState().playNext,
  seekPlayback: usePlayerStore.getState().seekPlayback
};
const originalMediaSessionDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaSession');

class FakeMediaMetadata {
  album: string;
  artist: string;
  artwork: readonly MediaImage[];
  title: string;

  constructor(init: MediaMetadataInit = {}) {
    this.album = init.album ?? '';
    this.artist = init.artist ?? '';
    this.artwork = init.artwork ?? [];
    this.title = init.title ?? '';
  }
}

describe('useMediaSession', () => {
  let mediaSession: MediaSession;
  let handlers: Map<MediaSessionAction, MediaSessionActionHandler>;
  let setActionHandler: ReturnType<typeof vi.fn>;
  let setPositionState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handlers = new Map();
    setActionHandler = vi.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      if (handler) {
        handlers.set(action, handler);
      } else {
        handlers.delete(action);
      }
    });
    setPositionState = vi.fn();
    mediaSession = {
      metadata: null,
      playbackState: 'none',
      setActionHandler,
      setPositionState
    } as unknown as MediaSession;

    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: mediaSession
    });
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata);
    usePlayerStore.getState().resetForTest();
  });

  afterEach(() => {
    usePlayerStore.setState(originalPlayerActions);
    usePlayerStore.getState().resetForTest();
    vi.unstubAllGlobals();
    if (originalMediaSessionDescriptor) {
      Object.defineProperty(navigator, 'mediaSession', originalMediaSessionDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'mediaSession');
    }
  });

  it('publishes song metadata, playback state and clamped position', () => {
    usePlayerStore.setState({
      currentSong: song,
      isPlaying: true,
      playbackPositionMs: 65000,
      playbackDurationMs: 240000
    });

    const { rerender } = renderHook(() => useMediaSession());

    expect(mediaSession.metadata).toMatchObject({
      title: song.title,
      artist: song.artist,
      album: song.album,
      artwork: [{ src: song.coverUrl }]
    });
    expect(mediaSession.playbackState).toBe('playing');
    expect(setPositionState).toHaveBeenLastCalledWith({
      duration: 240,
      playbackRate: 1,
      position: 65
    });

    act(() => {
      usePlayerStore.setState({
        currentSong: { ...song, coverUrl: undefined },
        isPlaying: false,
        playbackPositionMs: 300000
      });
    });
    rerender();

    expect(mediaSession.metadata?.artwork[0]?.src).toContain('assets/branding/oubao-logo.png');
    expect(mediaSession.playbackState).toBe('paused');
    expect(setPositionState).toHaveBeenLastCalledWith({
      duration: 240,
      playbackRate: 1,
      position: 240
    });
  });

  it('publishes program metadata and retains position and remote controls', () => {
    const playNext = vi.fn();
    const seekPlayback = vi.fn();
    usePlayerStore.setState({
      currentMedia: program,
      currentSong: null,
      isPlaying: true,
      playbackPositionMs: 65000,
      playbackDurationMs: program.durationMs,
      playNext,
      seekPlayback
    });

    renderHook(() => useMediaSession());

    expect(mediaSession.metadata).toMatchObject({
      title: program.title,
      artist: program.podcast.author,
      album: program.podcast.title,
      artwork: [{ src: program.coverUrl }]
    });
    expect(mediaSession.playbackState).toBe('playing');
    expect(setPositionState).toHaveBeenLastCalledWith({
      duration: 1800,
      playbackRate: 1,
      position: 65
    });

    act(() => {
      handlers.get('nexttrack')?.({ action: 'nexttrack' });
      handlers.get('seekto')?.({ action: 'seekto', seekTime: 42.5 });
    });
    expect(playNext).toHaveBeenCalledOnce();
    expect(seekPlayback).toHaveBeenCalledWith(42500, program.durationMs);
  });

  it('routes system actions to explicit player operations and clears handlers on unmount', () => {
    const playPrevious = vi.fn();
    const playNext = vi.fn();
    const seekPlayback = vi.fn();
    usePlayerStore.setState({
      currentSong: song,
      currentPlaybackUrl: 'https://example.test/audio/session.mp3',
      playbackDurationMs: 240000,
      isPlaying: false,
      playPrevious,
      playNext,
      seekPlayback
    });

    const { unmount } = renderHook(() => useMediaSession());

    act(() => handlers.get('play')?.({ action: 'play' }));
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    act(() => handlers.get('play')?.({ action: 'play' }));
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    act(() => handlers.get('pause')?.({ action: 'pause' }));
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    act(() => handlers.get('pause')?.({ action: 'pause' }));
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    act(() => {
      handlers.get('previoustrack')?.({ action: 'previoustrack' });
      handlers.get('nexttrack')?.({ action: 'nexttrack' });
      handlers.get('seekto')?.({ action: 'seekto', seekTime: 42.5 });
    });
    expect(playPrevious).toHaveBeenCalledOnce();
    expect(playNext).toHaveBeenCalledOnce();
    expect(seekPlayback).toHaveBeenCalledWith(42500, 240000);

    unmount();

    expect(handlers.size).toBe(0);
    expect(setActionHandler).toHaveBeenCalledWith('play', null);
    expect(setActionHandler).toHaveBeenCalledWith('pause', null);
    expect(setActionHandler).toHaveBeenCalledWith('previoustrack', null);
    expect(setActionHandler).toHaveBeenCalledWith('nexttrack', null);
    expect(setActionHandler).toHaveBeenCalledWith('seekto', null);
    expect(mediaSession.metadata).toBeNull();
    expect(mediaSession.playbackState).toBe('none');
    expect(setPositionState).toHaveBeenLastCalledWith();
  });

  it('remains inert when Media Session is unavailable', () => {
    Reflect.deleteProperty(navigator, 'mediaSession');

    expect(() => renderHook(() => useMediaSession())).not.toThrow();
  });
});
