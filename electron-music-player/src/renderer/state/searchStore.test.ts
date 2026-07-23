import { beforeEach, describe, expect, it } from 'vitest';
import type { ProviderId, RemoteProviderId, Song } from '../../shared/musicTypes';
import type { SearchEntityResults } from '../../shared/providerTypes';
import { createMusicPlayerApi } from '../test/fixtures/musicPlayerApi';
import { useSearchStore } from './searchStore';

describe('search store', () => {
  beforeEach(() => {
    window.musicPlayer = {
      app: {
        getVersion: async () => '0.1.0'
      },
      window: {
        minimize: () => undefined,
        toggleMaximize: () => undefined,
        toggleFullscreen: () => undefined,
        close: () => undefined
      },
      music: {
        ...createMusicPlayerApi().music,
        getLoginStatus: async (providerId) => ({ ok: true, data: { providerId, loggedIn: true } }),
        login: async (providerId) => ({ ok: true, data: { providerId, loggedIn: true } }),
        logout: async () => ({ ok: true, data: undefined }),
        search: async (providerId, keyword) => ({ ok: true, data: [createSearchSong(providerId, keyword)] }),
        searchEntities: async (providerId, keyword) => ({
          ok: true,
          data: createSearchEntityResults(providerId, keyword, [createSearchSong(providerId, keyword)])
        }),
        getUserPlaylists: async () => ({ ok: true, data: [] }),
        getPlaylistTracks: async () => ({ ok: true, data: [] }),
        getSongUrl: async (_providerId, song, quality) => ({
          ok: true,
          data: {
            ok: true,
            providerId: song.providerId,
            quality,
            url: 'https://example.test/song.mp3'
          }
        }),
        getLyrics: async (_providerId, song) => ({
          ok: true,
          data: {
            ok: true,
            providerId: song.providerId,
            lrc: '[00:01.00]Test lyric'
          }
        }),
        setSongLiked: async (providerId, _song, liked) => ({ ok: true, data: { providerId, operation: liked ? 'like' : 'unlike' } }),
        addSongToPlaylist: async (providerId) => ({ ok: true, data: { providerId, operation: 'add_to_playlist' } }),
        removeSongFromPlaylist: async (providerId) => ({ ok: true, data: { providerId, operation: 'remove_from_playlist' } }),
        getCharts: async () => ({ ok: true, data: [] }),
        getChartTracks: async () => ({ ok: true, data: [] }),
        importLocalFiles: async () => ({ ok: true, data: [] })
      }
    };
    useSearchStore.getState().resetForTest();
  });

  it('loads search results for the selected provider', async () => {
    const results = await useSearchStore.getState().search('qq', 'neon');

    expect(results).toHaveLength(1);
    expect(useSearchStore.getState()).toMatchObject({
      keyword: 'neon',
      providerId: 'qq',
      isLoading: false,
      errorMessage: null
    });
    expect(useSearchStore.getState().entityResults?.sections.songs.items).toHaveLength(1);
  });

  it('does not call the remote entity endpoint for blank keywords', async () => {
    let calls = 0;
    window.musicPlayer.music.searchEntities = async () => {
      calls += 1;
      return { ok: true, data: createSearchEntityResults('qq', '', []) };
    };

    const results = await useSearchStore.getState().search('qq', '   ');

    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });

  it('appends a selected remote entity section without replacing the current result set', async () => {
    const offsets: number[] = [];
    window.musicPlayer.music.searchEntities = async (providerId, keyword, options) => {
      const offset = options?.offset ?? 0;
      offsets.push(offset);
      const song = createSearchSong(providerId, keyword, offset === 0 ? 'song-1' : 'song-2');
      return {
        ok: true,
        data: createSearchEntityResults(providerId, keyword, [song], offset === 0)
      };
    };

    await useSearchStore.getState().search('netease', '晴天');
    await useSearchStore.getState().loadMore('song');

    expect(offsets).toEqual([0, 1]);
    expect(useSearchStore.getState().entityResults?.sections.songs.items.map((song) => song.id)).toEqual([
      'netease:song-1',
      'netease:song-2'
    ]);
  });

  it('leaves the search surface in a recoverable state when a remote request rejects', async () => {
    window.musicPlayer.music.searchEntities = async () => {
      throw new Error('搜索网络不可用');
    };

    const results = await useSearchStore.getState().search('qq', '夜曲');

    expect(results).toEqual([]);
    expect(useSearchStore.getState()).toMatchObject({
      keyword: '夜曲',
      providerId: 'qq',
      isLoading: false,
      isLoadingMore: false,
      errorMessage: '搜索网络不可用'
    });
  });
});

function createSearchSong(providerId: ProviderId, keyword: string, platformSongId = 'song-1'): Song {
  return {
    id: `${providerId}:${platformSongId}`,
    providerId,
    platformSongId,
    title: `${keyword} result`,
    artist: 'Search Artist',
    album: 'Search Album',
    durationMs: 180000,
    coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
  };
}

function createSearchEntityResults(
  providerId: RemoteProviderId,
  keyword: string,
  songs: Song[],
  songHasMore = false
): SearchEntityResults {
  return {
    providerId,
    keyword,
    sections: {
      songs: { available: true, items: songs, total: songs.length + (songHasMore ? 1 : 0), hasMore: songHasMore, errorMessage: null },
      artists: { available: true, items: [], total: 0, hasMore: false, errorMessage: null },
      albums: { available: true, items: [], total: 0, hasMore: false, errorMessage: null },
      playlists: { available: true, items: [], total: 0, hasMore: false, errorMessage: null }
    }
  };
}
