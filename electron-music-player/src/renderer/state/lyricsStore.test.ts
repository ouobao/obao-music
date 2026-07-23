import { beforeEach, describe, expect, it } from 'vitest';
import type { Song } from '../../shared/musicTypes';
import { createMusicPlayerApi } from '../test/fixtures/musicPlayerApi';
import { createLyricsRequestKey, useLyricsStore } from './lyricsStore';

const neteaseSong: Song = {
  id: 'netease:42',
  providerId: 'netease',
  platformSongId: '42',
  title: 'Song with lyrics',
  artist: 'Artist',
  album: 'Album',
  durationMs: 180000,
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
};

describe('lyrics store', () => {
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
        search: async () => ({ ok: true, data: [] }),
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
            lrc: '[00:01.00]First line',
            tlyric: '[00:01.00]第一句'
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
    useLyricsStore.getState().resetForTest();
  });

  it('loads lyrics through the provider bridge', async () => {
    const lrc = await useLyricsStore.getState().loadLyrics(neteaseSong);

    expect(lrc).toBe('[00:01.00]First line');
    expect(useLyricsStore.getState()).toMatchObject({
      songId: 'netease:42',
      songKey: createLyricsRequestKey(neteaseSong),
      lrc: '[00:01.00]First line',
      tlyric: '[00:01.00]第一句',
      isLoading: false,
      errorMessage: null
    });
  });

  it('clears stale lyrics while loading fresh lyrics for a song change', async () => {
    let resolveLyrics: ((value: Awaited<ReturnType<typeof window.musicPlayer.music.getLyrics>>) => void) | undefined;
    window.musicPlayer.music.getLyrics = async (_providerId, song) =>
      new Promise((resolve) => {
        resolveLyrics = resolve;
      });
    const nextSong: Song = {
      ...neteaseSong,
      id: 'netease:43',
      platformSongId: '43',
      title: 'Next song'
    };
    useLyricsStore.setState({
      songId: neteaseSong.id,
      songKey: createLyricsRequestKey(neteaseSong),
      lrc: '[00:01.00]Cached line',
      tlyric: null,
      isLoading: false,
      errorMessage: null
    });

    const pendingLyrics = useLyricsStore.getState().loadLyrics(nextSong);

    expect(useLyricsStore.getState()).toMatchObject({
      songId: nextSong.id,
      songKey: createLyricsRequestKey(nextSong),
      lrc: null,
      tlyric: null,
      isLoading: true,
      errorMessage: null
    });

    resolveLyrics?.({
      ok: true,
      data: {
        ok: true,
        providerId: 'netease',
        lrc: '[00:02.00]Fresh line',
        tlyric: '[00:02.00]新译文'
      }
    });

    await expect(pendingLyrics).resolves.toBe('[00:02.00]Fresh line');
    expect(useLyricsStore.getState()).toMatchObject({
      songId: nextSong.id,
      lrc: '[00:02.00]Fresh line',
      tlyric: '[00:02.00]新译文',
      isLoading: false,
      errorMessage: null
    });
  });

  it('reuses cached lyrics for the same song without starting another load', async () => {
    let requestCount = 0;
    window.musicPlayer.music.getLyrics = async (_providerId, song) => {
      requestCount += 1;
      return {
        ok: true,
        data: {
          ok: true,
          providerId: song.providerId,
          lrc: '[00:01.00]Fresh line'
        }
      };
    };
    useLyricsStore.setState({
      songId: neteaseSong.id,
      songKey: createLyricsRequestKey(neteaseSong),
      lrc: '[00:01.00]Cached line',
      tlyric: '[00:01.00]Cached translation',
      isLoading: false,
      errorMessage: null
    });

    const lrc = await useLyricsStore.getState().loadLyrics(neteaseSong);

    expect(lrc).toBe('[00:01.00]Cached line');
    expect(requestCount).toBe(0);
    expect(useLyricsStore.getState()).toMatchObject({
      songId: neteaseSong.id,
      songKey: createLyricsRequestKey(neteaseSong),
      lrc: '[00:01.00]Cached line',
      tlyric: '[00:01.00]Cached translation',
      isLoading: false,
      errorMessage: null
    });
  });

  it('stores provider restriction messages when lyrics are unavailable', async () => {
    window.musicPlayer.music.getLyrics = async (_providerId, song) => ({
      ok: true,
      data: {
        ok: false,
        providerId: song.providerId,
        reason: {
          category: 'url_unavailable',
          message: 'No lyrics',
          action: 'none'
        }
      }
    });

    const lrc = await useLyricsStore.getState().loadLyrics(neteaseSong);

    expect(lrc).toBeNull();
    expect(useLyricsStore.getState()).toMatchObject({
      songId: 'netease:42',
      lrc: null,
      tlyric: null,
      isLoading: false,
      errorMessage: 'No lyrics'
    });
  });

  it('shares one provider request between concurrent loads for the same song', async () => {
    let requestCount = 0;
    let resolveLyrics: ((value: Awaited<ReturnType<typeof window.musicPlayer.music.getLyrics>>) => void) | undefined;
    window.musicPlayer.music.getLyrics = async (_providerId, song) => {
      requestCount += 1;
      return new Promise((resolve) => {
        resolveLyrics = resolve;
      });
    };

    const firstLoad = useLyricsStore.getState().loadLyrics(neteaseSong);
    const secondLoad = useLyricsStore.getState().loadLyrics(neteaseSong);

    expect(requestCount).toBe(1);
    resolveLyrics?.({
      ok: true,
      data: {
        ok: true,
        providerId: neteaseSong.providerId,
        lrc: '[00:03.00]Shared line'
      }
    });

    await Promise.all([firstLoad, secondLoad]);
    expect(useLyricsStore.getState()).toMatchObject({
      songKey: createLyricsRequestKey(neteaseSong),
      lrc: '[00:03.00]Shared line',
      isLoading: false,
      errorMessage: null
    });
  });

  it('keeps the newest song selection authoritative across an X to Y to X race', async () => {
    const nextSong: Song = {
      ...neteaseSong,
      id: 'netease:43',
      platformSongId: '43',
      title: 'Next song'
    };
    const resolvers = new Map<string, (value: Awaited<ReturnType<typeof window.musicPlayer.music.getLyrics>>) => void>();
    window.musicPlayer.music.getLyrics = async (_providerId, song) =>
      new Promise((resolve) => {
        resolvers.set(createLyricsRequestKey(song), resolve);
      });

    const firstSongLoad = useLyricsStore.getState().loadLyrics(neteaseSong);
    const nextSongLoad = useLyricsStore.getState().loadLyrics(nextSong);
    const latestSongLoad = useLyricsStore.getState().loadLyrics(neteaseSong);

    resolvers.get(createLyricsRequestKey(nextSong))?.({
      ok: true,
      data: {
        ok: true,
        providerId: nextSong.providerId,
        lrc: '[00:02.00]Stale next-song line'
      }
    });
    await nextSongLoad;
    expect(useLyricsStore.getState()).toMatchObject({
      songKey: createLyricsRequestKey(neteaseSong),
      lrc: null,
      isLoading: true
    });

    resolvers.get(createLyricsRequestKey(neteaseSong))?.({
      ok: true,
      data: {
        ok: true,
        providerId: neteaseSong.providerId,
        lrc: '[00:04.00]Newest selected line'
      }
    });
    await Promise.all([firstSongLoad, latestSongLoad]);

    expect(useLyricsStore.getState()).toMatchObject({
      songKey: createLyricsRequestKey(neteaseSong),
      lrc: '[00:04.00]Newest selected line',
      isLoading: false,
      errorMessage: null
    });
  });

  it('rejects malformed lyric payloads before they reach the renderer', async () => {
    window.musicPlayer.music.getLyrics = async () => ({
      ok: true,
      data: {
        ok: true,
        providerId: neteaseSong.providerId,
        lrc: { text: '[00:01.00]Not a string' }
      }
    }) as never;

    const lrc = await useLyricsStore.getState().loadLyrics(neteaseSong);

    expect(lrc).toBeNull();
    expect(useLyricsStore.getState()).toMatchObject({
      songKey: createLyricsRequestKey(neteaseSong),
      lrc: null,
      tlyric: null,
      isLoading: false,
      errorMessage: '歌词数据格式无效'
    });
  });

  it('rejects oversized LRC and TLYRIC payloads at the provider boundary', async () => {
    window.musicPlayer.music.getLyrics = async () => ({
      ok: true,
      data: {
        ok: true,
        providerId: neteaseSong.providerId,
        lrc: '[00:01.00]valid line',
        tlyric: `译文${'a'.repeat(512 * 1024)}`
      }
    });

    const lrc = await useLyricsStore.getState().loadLyrics(neteaseSong);

    expect(lrc).toBeNull();
    expect(useLyricsStore.getState()).toMatchObject({
      songKey: createLyricsRequestKey(neteaseSong),
      lrc: null,
      tlyric: null,
      isLoading: false,
      errorMessage: '歌词内容超过 512 KiB'
    });
  });

  it('reports lyrics service unavailable when the bridge has no lyrics API', async () => {
    (window.musicPlayer.music as { getLyrics?: unknown }).getLyrics = undefined;

    const lrc = await useLyricsStore.getState().loadLyrics(neteaseSong);

    expect(lrc).toBeNull();
    expect(useLyricsStore.getState()).toMatchObject({
      songId: 'netease:42',
      lrc: null,
      tlyric: null,
      isLoading: false,
      errorMessage: '歌词服务不可用'
    });
  });
});
