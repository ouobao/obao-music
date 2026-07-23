import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Program, Song } from '../../shared/musicTypes';
import type { TrayPlaybackAction, TrayPlaybackState } from '../../shared/global';
import { usePlayerStore } from '../state/playerStore';
import { createMusicPlayerApi } from '../test/fixtures/musicPlayerApi';
import { useTrayPlaybackControls } from './useTrayPlaybackControls';

const song: Song = {
  id: 'netease:tray-song',
  providerId: 'netease',
  title: 'Tray Song',
  artist: 'Tray Artist',
  album: 'Tray Album',
  durationMs: 180000,
  coverTone: 'linear-gradient(135deg, #8edfc7, #a8c9ee)'
};

const program: Program = {
  id: 'netease:program:tray',
  mediaType: 'program',
  providerId: 'netease',
  platformProgramId: 'tray',
  title: 'Tray Program',
  description: 'Tray program fixture',
  durationMs: 1_800_000,
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  podcast: {
    id: 'netease:podcast:tray',
    providerId: 'netease',
    platformPodcastId: 'tray',
    title: 'Tray Podcast',
    description: 'Tray podcast fixture',
    author: 'Tray Host',
    coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
  },
  sourceContext: {
    type: 'podcast',
    providerId: 'netease',
    podcastId: 'netease:podcast:tray',
    podcastTitle: 'Tray Podcast'
  }
};

const originalPlayerActions = {
  playPrevious: usePlayerStore.getState().playPrevious,
  playNext: usePlayerStore.getState().playNext,
  togglePlaying: usePlayerStore.getState().togglePlaying
};

describe('useTrayPlaybackControls', () => {
  let updatePlaybackState: ReturnType<typeof vi.fn<(state: TrayPlaybackState) => void>>;
  let playbackActionListener: ((action: TrayPlaybackAction) => void) | undefined;
  let unsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updatePlaybackState = vi.fn();
    unsubscribe = vi.fn();
    playbackActionListener = undefined;
    window.musicPlayer = createMusicPlayerApi();
    window.musicPlayer.tray = {
      updatePlaybackState,
      onPlaybackAction: vi.fn((listener) => {
        playbackActionListener = listener;
        return unsubscribe;
      })
    };
    usePlayerStore.getState().resetForTest();
  });

  afterEach(() => {
    usePlayerStore.setState(originalPlayerActions);
    usePlayerStore.getState().resetForTest();
  });

  it('publishes the current track and dynamic playback state to the tray', () => {
    const { rerender } = renderHook(() => useTrayPlaybackControls());

    expect(updatePlaybackState).toHaveBeenLastCalledWith({
      title: '',
      artist: '',
      hasSong: false,
      isPlaying: false
    });

    act(() => {
      usePlayerStore.setState({ currentSong: song, isPlaying: true });
    });
    rerender();

    expect(updatePlaybackState).toHaveBeenLastCalledWith({
      title: song.title,
      artist: song.artist,
      hasSong: true,
      isPlaying: true
    });

    act(() => {
      usePlayerStore.setState({ isPlaying: false });
    });
    rerender();

    expect(updatePlaybackState).toHaveBeenLastCalledWith(expect.objectContaining({
      hasSong: true,
      isPlaying: false
    }));
  });

  it('publishes the current program as a playable tray item', () => {
    renderHook(() => useTrayPlaybackControls());

    act(() => {
      usePlayerStore.setState({ currentMedia: program, currentSong: null, isPlaying: true });
    });

    expect(updatePlaybackState).toHaveBeenLastCalledWith({
      title: program.title,
      artist: program.podcast.author,
      hasSong: true,
      isPlaying: true
    });
  });

  it('routes tray actions to player operations and removes the listener on unmount', () => {
    const playPrevious = vi.fn();
    const playNext = vi.fn();
    const togglePlaying = vi.fn();
    usePlayerStore.setState({ playPrevious, playNext, togglePlaying });

    const { unmount } = renderHook(() => useTrayPlaybackControls());

    act(() => {
      playbackActionListener?.('previous');
      playbackActionListener?.('toggle');
      playbackActionListener?.('next');
    });

    expect(playPrevious).toHaveBeenCalledOnce();
    expect(togglePlaying).toHaveBeenCalledOnce();
    expect(playNext).toHaveBeenCalledOnce();

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('remains inert outside the Electron preload environment', () => {
    delete (window as { musicPlayer?: Window['musicPlayer'] }).musicPlayer;

    expect(() => renderHook(() => useTrayPlaybackControls())).not.toThrow();
    expect(updatePlaybackState).not.toHaveBeenCalled();
  });
});
