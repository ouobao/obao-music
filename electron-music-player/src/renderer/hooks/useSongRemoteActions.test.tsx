import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Playlist, Song } from '../../shared/musicTypes';
import { createMusicPlayerApi } from '../test/fixtures/musicPlayerApi';
import { useLibraryStore } from '../state/libraryStore';
import { useSongRemoteActions } from './useSongRemoteActions';

const song: Song = {
  id: 'qq:test-song',
  providerId: 'qq',
  platformSongId: 'test-song',
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  durationMs: 180000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
};

const likedPlaylist: Playlist = {
  id: 'qq:201',
  providerId: 'qq',
  title: 'Liked Songs',
  description: '',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  ownership: 'liked',
  isLiked: true
};

const ownedPlaylist: Playlist = {
  id: 'qq:owned',
  providerId: 'qq',
  title: 'Owned Playlist',
  description: '',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  ownership: 'created'
};

describe('useSongRemoteActions', () => {
  beforeEach(() => {
    useLibraryStore.getState().resetForTest();
  });

  it('derives remote song state and writes through the library store', async () => {
    const remoteTracksByPlaylist = new Map<string, Song[]>([
      [likedPlaylist.id, [song]],
      [ownedPlaylist.id, []]
    ]);
    const setSongLiked = vi.fn(async (_providerId: Song['providerId'], _song: Song, liked: boolean) => {
      remoteTracksByPlaylist.set(likedPlaylist.id, liked ? [song] : []);
      return {
        ok: true as const,
        data: { providerId: 'qq' as const, operation: liked ? 'like' as const : 'unlike' as const }
      };
    });
    const addSongToPlaylist = vi.fn(async () => {
      remoteTracksByPlaylist.set(ownedPlaylist.id, [song]);
      return {
        ok: true as const,
        data: { providerId: 'qq' as const, operation: 'add_to_playlist' as const }
      };
    });
    const getPlaylistTracks = vi.fn(async (_providerId: Song['providerId'], playlistId: string) => ({
      ok: true as const,
      data: remoteTracksByPlaylist.get(playlistId) ?? []
    }));
    window.musicPlayer = createMusicPlayerApi({ setSongLiked, addSongToPlaylist, getPlaylistTracks });
    useLibraryStore.setState({ providerPlaylists: { qq: [likedPlaylist, ownedPlaylist] } });
    const onNotice = vi.fn();

    const { result } = renderHook(() => useSongRemoteActions({ song, sourcePlaylist: ownedPlaylist, onNotice }));

    await waitFor(() => expect(result.current.isLikedStatusReady).toBe(true));
    expect(result.current.isLiked).toBe(true);
    expect(result.current.addTargets).toEqual([ownedPlaylist]);
    expect(result.current.canRemove).toBe(true);

    await act(async () => {
      await result.current.toggleLiked();
    });
    await act(async () => {
      await result.current.addToPlaylist(ownedPlaylist);
    });

    expect(setSongLiked).toHaveBeenCalledWith('qq', song, false);
    expect(addSongToPlaylist).toHaveBeenCalledWith('qq', song, ownedPlaylist.id);
    expect(onNotice).toHaveBeenCalledWith('已取消喜欢');
    expect(onNotice).toHaveBeenCalledWith('已添加到 Owned Playlist');
  });
});
