import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Program, Song } from '../../shared/musicTypes';
import { useListeningHistoryStore } from '../state/listeningHistoryStore';
import { usePlayerStore } from '../state/playerStore';
import { AudioEngine } from './AudioEngine';

const song: Song = {
  id: 'qq:compact-row',
  providerId: 'qq',
  platformSongId: 'compact-row',
  title: 'Compact Row',
  artist: 'Layout Artist',
  album: 'Layout Album',
  durationMs: 240000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  coverUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000ALBUMMID.jpg'
};

describe('AudioEngine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useListeningHistoryStore.getState().resetForTest();
    usePlayerStore.getState().resetForTest();
  });

  it('syncs the shared player volume to the audio element', () => {
    const { container } = render(<AudioEngine />);
    const audio = container.querySelector<HTMLAudioElement>('audio');

    act(() => {
      usePlayerStore.getState().setVolume(24);
    });

    expect(audio?.volume).toBe(0.24);
  });

  it('updates shared playback progress from native audio events', () => {
    usePlayerStore.setState({
      currentSong: song,
      currentPlaybackUrl: 'https://example.test/song.mp3',
      isPlaying: false
    });

    const { container } = render(<AudioEngine />);
    const audio = container.querySelector<HTMLAudioElement>('audio');
    expect(audio).toBeTruthy();

    Object.defineProperty(audio, 'duration', { configurable: true, value: 240 });
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 76 });

    fireEvent.loadedMetadata(audio as HTMLAudioElement);
    fireEvent.timeUpdate(audio as HTMLAudioElement);

    const state = usePlayerStore.getState() as typeof usePlayerStore extends { getState: () => infer State }
      ? State & { playbackPositionMs?: number; playbackDurationMs?: number }
      : never;
    expect(state.playbackPositionMs).toBe(76000);
    expect(state.playbackDurationMs).toBe(240000);
  });

  it('records one qualified listen after 30 seconds of natural playback', () => {
    usePlayerStore.setState({
      currentQueueItemId: 'queue:history',
      currentSong: song,
      currentPlaybackUrl: 'https://example.test/song.mp3',
      isPlaying: true
    });
    const { container } = render(<AudioEngine />);
    const audio = container.querySelector<HTMLAudioElement>('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { configurable: true, value: 240 });
    Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 0 });

    fireEvent.loadedMetadata(audio);
    for (let seconds = 1; seconds <= 35; seconds += 1) {
      audio.currentTime = seconds;
      fireEvent.timeUpdate(audio);
    }

    expect(useListeningHistoryStore.getState().entries).toEqual([
      expect.objectContaining({ song, qualifiedPlayCount: 1 })
    ]);
  });

  it('uses half the duration as the threshold for songs shorter than one minute', () => {
    const shortSong = { ...song, id: 'qq:short-song', platformSongId: 'short-song', durationMs: 20_000 };
    usePlayerStore.setState({
      currentQueueItemId: 'queue:short-history',
      currentSong: shortSong,
      currentPlaybackUrl: 'https://example.test/short-song.mp3',
      isPlaying: true
    });
    const { container } = render(<AudioEngine />);
    const audio = container.querySelector<HTMLAudioElement>('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { configurable: true, value: 20 });
    Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 0 });

    fireEvent.loadedMetadata(audio);
    for (let seconds = 1; seconds <= 10; seconds += 1) {
      audio.currentTime = seconds;
      fireEvent.timeUpdate(audio);
    }

    expect(useListeningHistoryStore.getState().entries).toEqual([
      expect.objectContaining({ song: shortSong, qualifiedPlayCount: 1 })
    ]);
  });

  it('resets natural progress on queue changes and records each playback at most once', () => {
    const nextSong = { ...song, id: 'qq:next-song', platformSongId: 'next-song', title: 'Next Song' };
    usePlayerStore.setState({
      currentQueueItemId: 'queue:first-history',
      currentSong: song,
      currentPlaybackUrl: 'https://example.test/song.mp3',
      isPlaying: true
    });
    const { container } = render(<AudioEngine />);
    const audio = container.querySelector<HTMLAudioElement>('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { configurable: true, value: 240 });
    Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 0 });
    fireEvent.loadedMetadata(audio);
    for (let seconds = 1; seconds <= 20; seconds += 1) {
      audio.currentTime = seconds;
      fireEvent.timeUpdate(audio);
    }

    act(() => usePlayerStore.setState({
      currentQueueItemId: 'queue:next-history',
      currentSong: nextSong,
      currentPlaybackUrl: 'https://example.test/next-song.mp3'
    }));
    audio.currentTime = 0;
    fireEvent.loadedMetadata(audio);
    for (let seconds = 1; seconds <= 40; seconds += 1) {
      audio.currentTime = seconds;
      fireEvent.timeUpdate(audio);
    }

    expect(useListeningHistoryStore.getState().entries).toEqual([
      expect.objectContaining({ song: nextSong, qualifiedPlayCount: 1 })
    ]);
  });

  it('does not record Program playback in song listening history', () => {
    const program: Program = {
      id: 'netease:program:history',
      mediaType: 'program',
      providerId: 'netease',
      platformProgramId: 'history',
      title: 'History Program',
      description: '',
      durationMs: 240_000,
      coverTone: '#30343b',
      podcast: {
        id: 'netease:podcast:history',
        providerId: 'netease',
        platformPodcastId: 'history',
        title: 'History Podcast',
        description: '',
        author: 'History Author',
        coverTone: '#30343b'
      },
      sourceContext: {
        type: 'podcast',
        providerId: 'netease',
        podcastId: 'netease:podcast:history',
        podcastTitle: 'History Podcast'
      }
    };
    usePlayerStore.setState({
      currentQueueItemId: 'queue:program-history',
      currentMedia: program,
      currentSong: undefined,
      currentPlaybackUrl: 'https://example.test/program.mp3',
      isPlaying: true
    });
    const { container } = render(<AudioEngine />);
    const audio = container.querySelector<HTMLAudioElement>('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { configurable: true, value: 240 });
    Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 0 });
    fireEvent.loadedMetadata(audio);
    for (let seconds = 1; seconds <= 35; seconds += 1) {
      audio.currentTime = seconds;
      fireEvent.timeUpdate(audio);
    }

    expect(useListeningHistoryStore.getState().entries).toEqual([]);
  });

  it('does not count an explicit seek as natural listening time', () => {
    usePlayerStore.setState({
      currentQueueItemId: 'queue:seek-history',
      currentSong: song,
      currentPlaybackUrl: 'https://example.test/song.mp3',
      isPlaying: true
    });
    const { container } = render(<AudioEngine />);
    const audio = container.querySelector<HTMLAudioElement>('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { configurable: true, value: 240 });
    Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 0 });
    fireEvent.loadedMetadata(audio);

    act(() => usePlayerStore.getState().seekPlayback(120_000, 240_000));
    fireEvent.timeUpdate(audio);

    expect(useListeningHistoryStore.getState().entries).toEqual([]);
  });

  it('seeks native audio to the restored playback position when metadata loads', () => {
    usePlayerStore.setState({
      currentSong: song,
      currentPlaybackUrl: 'https://example.test/song.mp3',
      playbackPositionMs: 76000,
      playbackDurationMs: 240000,
      isPlaying: false
    });

    const { container } = render(<AudioEngine />);
    const audio = container.querySelector<HTMLAudioElement>('audio');
    expect(audio).toBeTruthy();

    Object.defineProperty(audio, 'duration', { configurable: true, value: 240 });
    Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 0 });

    fireEvent.loadedMetadata(audio as HTMLAudioElement);

    expect(audio?.currentTime).toBe(76);
    expect(usePlayerStore.getState().playbackPositionMs).toBe(76000);
  });

  it('does not treat regular native playback progress as an explicit seek', () => {
    usePlayerStore.setState({
      currentSong: song,
      currentPlaybackUrl: 'https://example.test/song.mp3',
      playbackPositionMs: 0,
      playbackDurationMs: 240000,
      isPlaying: false
    });

    const { container } = render(<AudioEngine />);
    const audio = container.querySelector<HTMLAudioElement>('audio');
    expect(audio).toBeTruthy();

    Object.defineProperty(audio, 'duration', { configurable: true, value: 240 });
    Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 0 });
    fireEvent.loadedMetadata(audio as HTMLAudioElement);

    act(() => {
      usePlayerStore.getState().setPlaybackProgress(45000, 240000);
    });

    expect(audio?.currentTime).toBe(0);
  });

  it('exposes its media element and applies short explicit seeks without tolerance suppression', () => {
    const mediaRef = { current: null as HTMLAudioElement | null };
    usePlayerStore.setState({
      currentSong: song,
      currentPlaybackUrl: 'https://example.test/song.mp3',
      playbackPositionMs: 10000,
      playbackDurationMs: 240000,
      isPlaying: false
    });

    const { container } = render(<AudioEngine mediaRef={mediaRef} />);
    const audio = container.querySelector<HTMLAudioElement>('audio');
    expect(audio).toBeTruthy();
    expect(mediaRef.current).toBe(audio);

    Object.defineProperty(audio, 'duration', { configurable: true, value: 240 });
    Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 10 });

    act(() => {
      usePlayerStore.getState().seekPlayback(10100, 240000);
    });

    expect(audio?.currentTime).toBe(10.1);
  });

  it('ignores interrupted play rejections caused by superseded native audio loads', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
      Promise.reject(new DOMException('The play() request was interrupted by a call to load().', 'AbortError'))
    );
    usePlayerStore.setState({
      currentSong: song,
      currentPlaybackUrl: 'https://example.test/song.mp3',
      playbackRestriction: null,
      playbackStatus: 'ready',
      isPlaying: true
    });

    render(<AudioEngine />);

    await act(async () => {
      await Promise.resolve();
    });

    const state = usePlayerStore.getState();
    expect(state.currentPlaybackUrl).toBe('https://example.test/song.mp3');
    expect(state.playbackRestriction).toBeNull();
    expect(state.playbackStatus).toBe('ready');
    expect(state.isPlaying).toBe(true);
  });

  it('ignores a delayed error from the source replaced during a rapid song switch', () => {
    usePlayerStore.setState({
      currentSong: song,
      currentPlaybackUrl: 'https://example.test/new-song.mp3',
      playbackRestriction: null,
      playbackStatus: 'ready',
      isPlaying: true
    });

    const { container } = render(<AudioEngine />);
    const audio = container.querySelector<HTMLAudioElement>('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'currentSrc', {
      configurable: true,
      value: 'https://example.test/old-song.mp3'
    });

    fireEvent.error(audio);

    expect(usePlayerStore.getState()).toMatchObject({
      currentPlaybackUrl: 'https://example.test/new-song.mp3',
      playbackRestriction: null,
      playbackStatus: 'ready',
      isPlaying: true
    });
  });

  it('reports an error that belongs to the currently selected source', () => {
    const playbackUrl = 'https://example.test/current-song.mp3';
    usePlayerStore.setState({
      currentSong: song,
      currentPlaybackUrl: playbackUrl,
      playbackRestriction: null,
      playbackStatus: 'ready',
      isPlaying: true
    });

    const { container } = render(<AudioEngine />);
    const audio = container.querySelector<HTMLAudioElement>('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'currentSrc', { configurable: true, value: playbackUrl });

    fireEvent.error(audio);

    expect(usePlayerStore.getState()).toMatchObject({
      currentPlaybackUrl: null,
      playbackStatus: 'error',
      isPlaying: false
    });
  });

  it('defers a seek that the native element rejects before metadata is ready', () => {
    const playbackUrl = 'https://example.test/seek-race.mp3';
    usePlayerStore.setState({
      currentSong: song,
      currentPlaybackUrl: playbackUrl,
      playbackPositionMs: 0,
      playbackDurationMs: 240000,
      isPlaying: false
    });

    const { container } = render(<AudioEngine />);
    const audio = container.querySelector<HTMLAudioElement>('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { configurable: true, value: Number.NaN });
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => 0,
      set: () => {
        throw new DOMException('Media metadata is not available', 'InvalidStateError');
      }
    });

    expect(() => {
      act(() => usePlayerStore.getState().seekPlayback(12000, 240000));
    }).not.toThrow();

    Object.defineProperty(audio, 'duration', { configurable: true, value: 240 });
    Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 0 });
    fireEvent.loadedMetadata(audio);

    expect(audio.currentTime).toBe(12);
  });
});
