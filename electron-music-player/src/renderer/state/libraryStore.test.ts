import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Playlist, Song } from '../../shared/musicTypes';
import type { ProviderIpcResult } from '../../shared/providerTypes';
import { getPlaylistTracksKey, useLibraryStore } from './libraryStore';
import { createMusicPlayerApi } from '../test/fixtures/musicPlayerApi';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const neteasePlaylist: Playlist = {
  id: 'netease:6688',
  providerId: 'netease',
  title: '我喜欢的音乐',
  description: '私人收藏',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  coverUrl: 'https://p1.music.126.net/cover.jpg',
  sourceLabel: '网易云'
};

const neteaseSong: Song = {
  id: 'netease:42',
  providerId: 'netease',
  platformSongId: '42',
  title: '晴天',
  artist: '周杰伦',
  album: '叶惠美',
  durationMs: 269000,
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  sourceContext: {
    type: 'playlist',
    providerId: 'netease',
    playlistId: 'netease:6688',
    playlistTitle: '我喜欢的音乐'
  }
};

const refreshedNeteaseSong: Song = {
  ...neteaseSong,
  id: 'netease:43',
  platformSongId: '43',
  title: 'Refreshed Netease Song'
};

const qqPlaylistWithoutCover: Playlist = {
  id: 'qq:liked',
  providerId: 'qq',
  title: 'QQ Liked',
  description: '6 songs',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  sourceLabel: 'QQ Music'
};

const qqSongWithCover: Song = {
  id: 'qq:track-1',
  providerId: 'qq',
  platformSongId: 'track-1',
  title: 'QQ Track',
  artist: 'QQ Artist',
  album: 'QQ Album',
  durationMs: 180000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  coverUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000ALBUMMID.jpg'
};

describe('library store', () => {
  let getPlaylistTracks: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useLibraryStore.getState().resetForTest();
    getPlaylistTracks = vi.fn(async () => ({ ok: true as const, data: [neteaseSong] }));
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
        getUserPlaylists: async () => ({ ok: true, data: [neteasePlaylist] }),
        getPlaylistTracks,
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
  });

  it('loads provider playlists through the preload music API', async () => {
    await useLibraryStore.getState().loadProviderPlaylists('netease');

    expect(useLibraryStore.getState().providerPlaylists.netease).toEqual([neteasePlaylist]);
    expect(useLibraryStore.getState().errorMessage).toBeNull();
  });

  it('loads playlists for every logged-in provider and keeps provider buckets separate', async () => {
    const qqPlaylist: Playlist = {
      ...qqPlaylistWithoutCover,
      ownership: 'created'
    };
    const getUserPlaylists = vi.fn(async (providerId) => ({
      ok: true as const,
      data: providerId === 'netease' ? [neteasePlaylist] : [qqPlaylist]
    }));
    window.musicPlayer.music.getUserPlaylists = getUserPlaylists;

    const playlistsByProvider = await useLibraryStore.getState().loadLoggedInProviderPlaylists(['netease', 'qq']);

    expect(getUserPlaylists).toHaveBeenCalledWith('netease');
    expect(getUserPlaylists).toHaveBeenCalledWith('qq');
    expect(playlistsByProvider.netease).toEqual([neteasePlaylist]);
    expect(playlistsByProvider.qq).toEqual([qqPlaylist]);
    expect(useLibraryStore.getState().providerPlaylists).toMatchObject({
      netease: [neteasePlaylist],
      qq: [qqPlaylist]
    });
  });

  it('clears one provider library without removing other providers', () => {
    useLibraryStore.setState({
      providerPlaylists: {
        netease: [neteasePlaylist],
        qq: [qqPlaylistWithoutCover]
      },
      selectedProviderId: 'qq',
      selectedPlaylistId: 'qq:liked',
      selectedPlaylistTracks: [qqSongWithCover],
      playlistTracks: {
        [getPlaylistTracksKey('netease', 'netease:6688')]: [neteaseSong],
        [getPlaylistTracksKey('qq', 'qq:liked')]: [qqSongWithCover]
      }
    });

    useLibraryStore.getState().clearProviderLibrary('qq');

    const state = useLibraryStore.getState();
    expect(state.providerPlaylists.qq).toBeUndefined();
    expect(state.providerPlaylists.netease).toEqual([neteasePlaylist]);
    expect(state.playlistTracks[getPlaylistTracksKey('qq', 'qq:liked')]).toBeUndefined();
    expect(state.playlistTracks[getPlaylistTracksKey('netease', 'netease:6688')]).toEqual([neteaseSong]);
    expect(state.selectedProviderId).toBeNull();
    expect(state.selectedPlaylistId).toBeNull();
    expect(state.selectedPlaylistTracks).toEqual([]);
  });

  it('loads playlist tracks by provider and playlist id', async () => {
    const tracks = await useLibraryStore.getState().loadPlaylistTracks('netease', 'netease:6688');
    const requestKey = getPlaylistTracksKey('netease', 'netease:6688');

    expect(tracks).toEqual([neteaseSong]);
    expect(useLibraryStore.getState().playlistTracks[requestKey]).toEqual([neteaseSong]);
    expect(useLibraryStore.getState().playlistTracksLoadingByKey[requestKey]).toBe(false);
    expect(useLibraryStore.getState().playlistTracksErrorByKey[requestKey]).toBeNull();
  });

  it('selects a provider playlist and stores the current detail tracks', async () => {
    const tracks = await useLibraryStore.getState().selectProviderPlaylist('netease', 'netease:6688');

    const state = useLibraryStore.getState();
    expect(getPlaylistTracks).toHaveBeenCalledWith('netease', 'netease:6688');
    expect(tracks).toEqual([neteaseSong]);
    expect(state.selectedProviderId).toBe('netease');
    expect(state.selectedPlaylistId).toBe('netease:6688');
    expect(state.selectedPlaylistTracks).toEqual([neteaseSong]);
    expect(state.errorMessage).toBeNull();
  });

  it('reuses cached playlist tracks and updates the selection synchronously without another request', async () => {
    await useLibraryStore.getState().selectProviderPlaylist('netease', neteasePlaylist.id);
    getPlaylistTracks.mockClear();
    useLibraryStore.setState({
      selectedProviderId: 'qq',
      selectedPlaylistId: qqPlaylistWithoutCover.id,
      selectedPlaylistTracks: [qqSongWithCover],
      isLoading: true,
      errorMessage: 'Previous selection failed'
    });

    const cachedSelection = useLibraryStore.getState().selectProviderPlaylist('netease', neteasePlaylist.id);

    const state = useLibraryStore.getState();
    expect(getPlaylistTracks).not.toHaveBeenCalled();
    expect(state.selectedProviderId).toBe('netease');
    expect(state.selectedPlaylistId).toBe(neteasePlaylist.id);
    expect(state.selectedPlaylistTracks).toEqual([neteaseSong]);
    expect(state.isLoading).toBe(false);
    expect(state.errorMessage).toBeNull();
    await expect(cachedSelection).resolves.toEqual([neteaseSong]);
  });

  it('treats an empty own playlist track cache entry as cached', async () => {
    useLibraryStore.setState({
      playlistTracks: {
        [getPlaylistTracksKey('qq', qqPlaylistWithoutCover.id)]: []
      },
      isLoading: true,
      errorMessage: 'Previous selection failed'
    });

    const tracks = await useLibraryStore.getState().selectProviderPlaylist('qq', qqPlaylistWithoutCover.id);

    const state = useLibraryStore.getState();
    expect(getPlaylistTracks).not.toHaveBeenCalled();
    expect(tracks).toEqual([]);
    expect(state.selectedProviderId).toBe('qq');
    expect(state.selectedPlaylistId).toBe(qqPlaylistWithoutCover.id);
    expect(state.selectedPlaylistTracks).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.errorMessage).toBeNull();
  });

  it('bypasses cached playlist tracks when force refreshing the selection', async () => {
    useLibraryStore.setState({
      playlistTracks: {
        [getPlaylistTracksKey('netease', neteasePlaylist.id)]: [neteaseSong]
      }
    });
    getPlaylistTracks.mockResolvedValueOnce({ ok: true, data: [refreshedNeteaseSong] });

    const tracks = await useLibraryStore.getState().selectProviderPlaylist(
      'netease',
      neteasePlaylist.id,
      { forceRefresh: true }
    );

    const state = useLibraryStore.getState();
    expect(getPlaylistTracks).toHaveBeenCalledTimes(1);
    expect(getPlaylistTracks).toHaveBeenCalledWith('netease', neteasePlaylist.id, { forceRefresh: true });
    expect(tracks).toEqual([refreshedNeteaseSong]);
    expect(state.playlistTracks[getPlaylistTracksKey('netease', neteasePlaylist.id)]).toEqual([refreshedNeteaseSong]);
    expect(state.selectedPlaylistTracks).toEqual([refreshedNeteaseSong]);
  });

  it('keeps a stale playlist success out of the current selection while caching its tracks', async () => {
    const firstRequest = createDeferred<ProviderIpcResult<Song[]>>();
    const secondRequest = createDeferred<ProviderIpcResult<Song[]>>();
    window.musicPlayer.music.getPlaylistTracks = vi.fn((_providerId, playlistId) => (
      playlistId === neteasePlaylist.id ? firstRequest.promise : secondRequest.promise
    ));

    const firstSelection = useLibraryStore.getState().selectProviderPlaylist('netease', neteasePlaylist.id);
    const secondSelection = useLibraryStore.getState().selectProviderPlaylist('qq', qqPlaylistWithoutCover.id);

    firstRequest.resolve({ ok: true, data: [neteaseSong] });
    await firstSelection;

    let state = useLibraryStore.getState();
    expect(state.playlistTracks[getPlaylistTracksKey('netease', neteasePlaylist.id)]).toEqual([neteaseSong]);
    expect(state.selectedProviderId).toBe('qq');
    expect(state.selectedPlaylistId).toBe(qqPlaylistWithoutCover.id);
    expect(state.selectedPlaylistTracks).toEqual([]);
    expect(state.isLoading).toBe(true);
    expect(state.errorMessage).toBeNull();

    secondRequest.resolve({ ok: true, data: [qqSongWithCover] });
    await secondSelection;

    state = useLibraryStore.getState();
    expect(state.playlistTracks[getPlaylistTracksKey('qq', qqPlaylistWithoutCover.id)]).toEqual([qqSongWithCover]);
    expect(state.selectedProviderId).toBe('qq');
    expect(state.selectedPlaylistId).toBe(qqPlaylistWithoutCover.id);
    expect(state.selectedPlaylistTracks).toEqual([qqSongWithCover]);
    expect(state.isLoading).toBe(false);
  });

  it('keeps a stale playlist failure out of the current selection error state', async () => {
    const firstRequest = createDeferred<ProviderIpcResult<Song[]>>();
    const secondRequest = createDeferred<ProviderIpcResult<Song[]>>();
    window.musicPlayer.music.getPlaylistTracks = vi.fn((_providerId, playlistId) => (
      playlistId === neteasePlaylist.id ? firstRequest.promise : secondRequest.promise
    ));

    const firstSelection = useLibraryStore.getState().selectProviderPlaylist('netease', neteasePlaylist.id);
    const secondSelection = useLibraryStore.getState().selectProviderPlaylist('qq', qqPlaylistWithoutCover.id);

    secondRequest.resolve({ ok: true, data: [qqSongWithCover] });
    await secondSelection;
    firstRequest.resolve({
      ok: false,
      error: {
        code: 'provider_failed',
        providerId: 'netease',
        message: 'Stale playlist failure'
      }
    });
    await firstSelection;

    const state = useLibraryStore.getState();
    expect(state.selectedProviderId).toBe('qq');
    expect(state.selectedPlaylistId).toBe(qqPlaylistWithoutCover.id);
    expect(state.selectedPlaylistTracks).toEqual([qqSongWithCover]);
    expect(state.isLoading).toBe(false);
    expect(state.errorMessage).toBeNull();
    expect(state.playlistTracksErrorByKey[getPlaylistTracksKey('netease', neteasePlaylist.id)]).toBe('Stale playlist failure');
    expect(state.playlistTracksErrorByKey[getPlaylistTracksKey('qq', qqPlaylistWithoutCover.id)]).toBeNull();
  });

  it('deduplicates ordinary A-B-A playlist selection requests by provider and playlist', async () => {
    const aRequest = createDeferred<ProviderIpcResult<Song[]>>();
    const bRequest = createDeferred<ProviderIpcResult<Song[]>>();
    const getTracks = vi.fn((_providerId, playlistId) => (
      playlistId === neteasePlaylist.id ? aRequest.promise : bRequest.promise
    ));
    window.musicPlayer.music.getPlaylistTracks = getTracks;

    const firstASelection = useLibraryStore.getState().selectProviderPlaylist('netease', neteasePlaylist.id);
    const bSelection = useLibraryStore.getState().selectProviderPlaylist('qq', qqPlaylistWithoutCover.id);
    const secondASelection = useLibraryStore.getState().selectProviderPlaylist('netease', neteasePlaylist.id);

    expect(getTracks).toHaveBeenCalledTimes(2);
    expect(useLibraryStore.getState().playlistTracksLoadingByKey).toMatchObject({
      [getPlaylistTracksKey('netease', neteasePlaylist.id)]: true,
      [getPlaylistTracksKey('qq', qqPlaylistWithoutCover.id)]: true
    });

    bRequest.resolve({ ok: true, data: [qqSongWithCover] });
    await bSelection;

    let state = useLibraryStore.getState();
    expect(state.selectedProviderId).toBe('netease');
    expect(state.selectedPlaylistId).toBe(neteasePlaylist.id);
    expect(state.selectedPlaylistTracks).toEqual([]);
    expect(state.isLoading).toBe(true);

    aRequest.resolve({ ok: true, data: [neteaseSong] });
    await expect(Promise.all([firstASelection, secondASelection])).resolves.toEqual([
      [neteaseSong],
      [neteaseSong]
    ]);

    state = useLibraryStore.getState();
    expect(state.playlistTracks[getPlaylistTracksKey('netease', neteasePlaylist.id)]).toEqual([neteaseSong]);
    expect(state.playlistTracks[getPlaylistTracksKey('qq', qqPlaylistWithoutCover.id)]).toEqual([qqSongWithCover]);
    expect(state.selectedProviderId).toBe('netease');
    expect(state.selectedPlaylistId).toBe(neteasePlaylist.id);
    expect(state.selectedPlaylistTracks).toEqual([neteaseSong]);
    expect(state.isLoading).toBe(false);
    expect(state.errorMessage).toBeNull();
    expect(state.playlistTracksLoadingByKey[getPlaylistTracksKey('netease', neteasePlaylist.id)]).toBe(false);
  });

  it('keeps in-flight requests with the same playlist id separate across providers', async () => {
    const neteaseRequest = createDeferred<ProviderIpcResult<Song[]>>();
    const qqRequest = createDeferred<ProviderIpcResult<Song[]>>();
    const getTracks = vi.fn((providerId) => (
      providerId === 'netease' ? neteaseRequest.promise : qqRequest.promise
    ));
    window.musicPlayer.music.getPlaylistTracks = getTracks;

    const neteaseSelection = useLibraryStore.getState().selectProviderPlaylist('netease', 'shared-playlist');
    const qqSelection = useLibraryStore.getState().selectProviderPlaylist('qq', 'shared-playlist');

    expect(getTracks).toHaveBeenCalledTimes(2);
    expect(useLibraryStore.getState().playlistTracksLoadingByKey).toMatchObject({
      [getPlaylistTracksKey('netease', 'shared-playlist')]: true,
      [getPlaylistTracksKey('qq', 'shared-playlist')]: true
    });

    neteaseRequest.resolve({ ok: true, data: [neteaseSong] });
    qqRequest.resolve({ ok: true, data: [qqSongWithCover] });
    await Promise.all([neteaseSelection, qqSelection]);

    const state = useLibraryStore.getState();
    expect(state.selectedProviderId).toBe('qq');
    expect(state.selectedPlaylistTracks).toEqual([qqSongWithCover]);
    expect(state.playlistTracks[getPlaylistTracksKey('netease', 'shared-playlist')]).toEqual([neteaseSong]);
    expect(state.playlistTracks[getPlaylistTracksKey('qq', 'shared-playlist')]).toEqual([qqSongWithCover]);
    expect(state.playlistTracksLoadingByKey[getPlaylistTracksKey('netease', 'shared-playlist')]).toBe(false);
    expect(state.playlistTracksLoadingByKey[getPlaylistTracksKey('qq', 'shared-playlist')]).toBe(false);

    getTracks.mockClear();
    await expect(useLibraryStore.getState().selectProviderPlaylist('netease', 'shared-playlist')).resolves.toEqual([neteaseSong]);
    await expect(useLibraryStore.getState().selectProviderPlaylist('qq', 'shared-playlist')).resolves.toEqual([qqSongWithCover]);
    expect(getTracks).not.toHaveBeenCalled();
  });

  it('keeps a superseded ordinary result from replacing a newer force refresh', async () => {
    const ordinaryRequest = createDeferred<ProviderIpcResult<Song[]>>();
    const refreshRequest = createDeferred<ProviderIpcResult<Song[]>>();
    const requests = [ordinaryRequest, refreshRequest];
    let requestIndex = 0;
    const getTracks = vi.fn(() => requests[requestIndex++].promise);
    window.musicPlayer.music.getPlaylistTracks = getTracks;

    const ordinarySelection = useLibraryStore.getState().selectProviderPlaylist('netease', neteasePlaylist.id);
    const refreshedSelection = useLibraryStore.getState().selectProviderPlaylist(
      'netease',
      neteasePlaylist.id,
      { forceRefresh: true }
    );

    expect(getTracks).toHaveBeenCalledTimes(2);
    expect(getTracks).toHaveBeenNthCalledWith(1, 'netease', neteasePlaylist.id);
    expect(getTracks).toHaveBeenNthCalledWith(2, 'netease', neteasePlaylist.id, { forceRefresh: true });

    refreshRequest.resolve({ ok: true, data: [refreshedNeteaseSong] });
    await refreshedSelection;
    ordinaryRequest.resolve({ ok: true, data: [neteaseSong] });
    await ordinarySelection;

    const state = useLibraryStore.getState();
    expect(state.playlistTracks[getPlaylistTracksKey('netease', neteasePlaylist.id)]).toEqual([refreshedNeteaseSong]);
    expect(state.selectedPlaylistTracks).toEqual([refreshedNeteaseSong]);
    expect(state.isLoading).toBe(false);
    expect(state.errorMessage).toBeNull();
    expect(state.playlistTracksErrorByKey[getPlaylistTracksKey('netease', neteasePlaylist.id)]).toBeNull();
  });

  it('starts a new force refresh and keeps an older refresh result from replacing it', async () => {
    const firstRefresh = createDeferred<ProviderIpcResult<Song[]>>();
    const secondRefresh = createDeferred<ProviderIpcResult<Song[]>>();
    const getTracks = vi.fn()
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(secondRefresh.promise);
    window.musicPlayer.music.getPlaylistTracks = getTracks;

    const firstSelection = useLibraryStore.getState().selectProviderPlaylist(
      'netease',
      neteasePlaylist.id,
      { forceRefresh: true }
    );
    const secondSelection = useLibraryStore.getState().selectProviderPlaylist(
      'netease',
      neteasePlaylist.id,
      { forceRefresh: true }
    );

    expect(getTracks).toHaveBeenCalledTimes(2);
    secondRefresh.resolve({ ok: true, data: [refreshedNeteaseSong] });
    await secondSelection;
    firstRefresh.resolve({ ok: true, data: [neteaseSong] });
    await firstSelection;

    const state = useLibraryStore.getState();
    expect(state.playlistTracks[getPlaylistTracksKey('netease', neteasePlaylist.id)]).toEqual([refreshedNeteaseSong]);
    expect(state.selectedPlaylistTracks).toEqual([refreshedNeteaseSong]);
    expect(state.playlistTracksLoadingByKey[getPlaylistTracksKey('netease', neteasePlaylist.id)]).toBe(false);
  });

  it('hydrates missing provider playlist cover from loaded track artwork', async () => {
    window.musicPlayer.music.getUserPlaylists = async () => ({ ok: true, data: [qqPlaylistWithoutCover] });
    window.musicPlayer.music.getPlaylistTracks = async () => ({ ok: true, data: [qqSongWithCover] });

    await useLibraryStore.getState().loadProviderPlaylists('qq');
    await useLibraryStore.getState().selectProviderPlaylist('qq', 'qq:liked');

    expect(useLibraryStore.getState().providerPlaylists.qq?.[0]).toMatchObject({
      id: 'qq:liked',
      coverUrl: qqSongWithCover.coverUrl
    });
  });

  it('force refreshes provider playlists and selected playlist tracks', async () => {
    const refreshedPlaylist: Playlist = {
      ...qqPlaylistWithoutCover,
      title: 'QQ Refreshed Playlist'
    };
    const refreshedTrack: Song = {
      ...qqSongWithCover,
      id: 'qq:track-2',
      title: 'QQ Refreshed Track'
    };
    const getUserPlaylists = vi.fn(async () => ({ ok: true as const, data: [refreshedPlaylist] }));
    const refreshPlaylistTracks = vi.fn(async () => ({ ok: true as const, data: [refreshedTrack] }));
    window.musicPlayer.music.getUserPlaylists = getUserPlaylists;
    window.musicPlayer.music.getPlaylistTracks = refreshPlaylistTracks;
    useLibraryStore.setState({
      providerPlaylists: {
        qq: [qqPlaylistWithoutCover]
      },
      selectedProviderId: 'qq',
      selectedPlaylistId: 'qq:liked',
      selectedPlaylistTracks: [qqSongWithCover],
      playlistTracks: {
        [getPlaylistTracksKey('qq', 'qq:liked')]: [qqSongWithCover]
      }
    });

    const playlists = await useLibraryStore.getState().refreshProviderLibrary('qq', 'qq:liked');

    const state = useLibraryStore.getState();
    expect(getUserPlaylists).toHaveBeenCalledWith('qq', { forceRefresh: true });
    expect(refreshPlaylistTracks).toHaveBeenCalledWith('qq', 'qq:liked', { forceRefresh: true });
    expect(playlists).toEqual([refreshedPlaylist]);
    expect(state.providerPlaylists.qq?.[0]).toMatchObject({
      ...refreshedPlaylist,
      coverUrl: refreshedTrack.coverUrl
    });
    expect(state.playlistTracks[getPlaylistTracksKey('qq', 'qq:liked')]).toEqual([refreshedTrack]);
    expect(state.selectedPlaylistTracks).toEqual([refreshedTrack]);
    expect(state.errorMessage).toBeNull();
  });

  it('keeps selected playlist context and stores structured track load errors', async () => {
    window.musicPlayer.music.getPlaylistTracks = async () => ({
      ok: false,
      error: {
        code: 'provider_failed',
        providerId: 'netease',
        message: '歌单曲目加载失败'
      }
    });

    const tracks = await useLibraryStore.getState().selectProviderPlaylist('netease', 'netease:6688');

    const state = useLibraryStore.getState();
    expect(tracks).toEqual([]);
    expect(state.selectedProviderId).toBe('netease');
    expect(state.selectedPlaylistId).toBe('netease:6688');
    expect(state.selectedPlaylistTracks).toEqual([]);
    expect(state.errorMessage).toBe('歌单曲目加载失败');
  });

  it('loads remote liked-song IDs and only exposes owned playlists as add targets', async () => {
    const likedPlaylist: Playlist = {
      ...neteasePlaylist,
      id: 'netease:liked',
      ownership: 'liked',
      isLiked: true
    };
    const ownedPlaylist: Playlist = {
      ...neteasePlaylist,
      id: 'netease:owned',
      title: 'Owned playlist',
      ownership: 'created'
    };
    const subscribedPlaylist: Playlist = {
      ...neteasePlaylist,
      id: 'netease:subscribed',
      title: 'Subscribed playlist',
      ownership: 'subscribed'
    };
    window.musicPlayer.music.getUserPlaylists = async () => ({ ok: true, data: [likedPlaylist, ownedPlaylist, subscribedPlaylist] });
    window.musicPlayer.music.getPlaylistTracks = async (_providerId, playlistId) => ({
      ok: true,
      data: playlistId === likedPlaylist.id ? [neteaseSong] : []
    });

    const likedSongIds = await useLibraryStore.getState().ensureLikedSongIds('netease');

    expect(likedSongIds).toEqual(new Set([neteaseSong.id]));
    expect(useLibraryStore.getState().getWritablePlaylists('netease')).toEqual([ownedPlaylist]);
  });

  it('builds liked-song IDs from cached playlist tracks without another request', async () => {
    const likedPlaylist: Playlist = {
      ...neteasePlaylist,
      id: 'netease:liked',
      ownership: 'liked',
      isLiked: true
    };
    const duplicateSong = { ...neteaseSong };
    useLibraryStore.setState({
      providerPlaylists: { netease: [likedPlaylist] },
      playlistTracks: {
        [getPlaylistTracksKey('netease', likedPlaylist.id)]: [neteaseSong, duplicateSong, refreshedNeteaseSong]
      }
    });

    const likedSongIds = await useLibraryStore.getState().ensureLikedSongIds('netease');

    expect(getPlaylistTracks).not.toHaveBeenCalled();
    expect(likedSongIds).toEqual(new Set([neteaseSong.id, refreshedNeteaseSong.id]));
    expect(useLibraryStore.getState().likedSongIdsLoaded.netease).toBe(true);
  });

  it('reuses an in-flight playlist request when initializing liked-song IDs', async () => {
    const likedPlaylist: Playlist = {
      ...neteasePlaylist,
      id: 'netease:liked',
      ownership: 'liked',
      isLiked: true
    };
    const deferred = createDeferred<ProviderIpcResult<Song[]>>();
    const getTracks = vi.fn(() => deferred.promise);
    window.musicPlayer.music.getPlaylistTracks = getTracks;
    useLibraryStore.setState({ providerPlaylists: { netease: [likedPlaylist] } });

    const selection = useLibraryStore.getState().selectProviderPlaylist('netease', likedPlaylist.id);
    const likedSongIdsRequest = useLibraryStore.getState().ensureLikedSongIds('netease');

    expect(getTracks).toHaveBeenCalledTimes(1);
    deferred.resolve({ ok: true, data: [neteaseSong, refreshedNeteaseSong] });
    await expect(Promise.all([selection, likedSongIdsRequest])).resolves.toEqual([
      [neteaseSong, refreshedNeteaseSong],
      new Set([neteaseSong.id, refreshedNeteaseSong.id])
    ]);
    expect(getTracks).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent liked-song requests per provider', async () => {
    const likedPlaylist: Playlist = {
      ...neteasePlaylist,
      id: 'netease:liked',
      ownership: 'liked',
      isLiked: true
    };
    const deferred = createDeferred<{ ok: true; data: Song[] }>();
    const getTracks = vi.fn(() => deferred.promise);
    window.musicPlayer.music.getUserPlaylists = async () => ({ ok: true, data: [likedPlaylist] });
    window.musicPlayer.music.getPlaylistTracks = getTracks;

    const firstRequest = useLibraryStore.getState().ensureLikedSongIds('netease');
    const secondRequest = useLibraryStore.getState().ensureLikedSongIds('netease');
    expect(getTracks).toHaveBeenCalledTimes(0);

    deferred.resolve({ ok: true, data: [neteaseSong] });
    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      new Set([neteaseSong.id]),
      new Set([neteaseSong.id])
    ]);
    expect(getTracks).toHaveBeenCalledTimes(1);
  });

  it('writes through the provider and force refreshes the affected remote playlist', async () => {
    const likedPlaylist: Playlist = {
      ...neteasePlaylist,
      id: 'netease:liked',
      ownership: 'liked',
      isLiked: true
    };
    const ownedPlaylist: Playlist = {
      ...neteasePlaylist,
      id: 'netease:owned',
      title: 'Owned playlist',
      ownership: 'created'
    };
    const setSongLiked = vi.fn(async () => ({ ok: true as const, data: { providerId: 'netease' as const, operation: 'like' as const } }));
    const addSongToPlaylist = vi.fn(async () => ({ ok: true as const, data: { providerId: 'netease' as const, operation: 'add_to_playlist' as const } }));
    const removeSongFromPlaylist = vi.fn(async () => ({ ok: true as const, data: { providerId: 'netease' as const, operation: 'remove_from_playlist' as const } }));
    const refreshTracks = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, data: [neteaseSong] })
      .mockResolvedValueOnce({ ok: true as const, data: [neteaseSong] })
      .mockResolvedValueOnce({ ok: true as const, data: [] as Song[] });
    const refreshPlaylists = vi.fn(async () => ({
      ok: true as const,
      data: [likedPlaylist, ownedPlaylist]
    }));
    window.musicPlayer.music.setSongLiked = setSongLiked;
    window.musicPlayer.music.addSongToPlaylist = addSongToPlaylist;
    window.musicPlayer.music.removeSongFromPlaylist = removeSongFromPlaylist;
    window.musicPlayer.music.getPlaylistTracks = refreshTracks;
    window.musicPlayer.music.getUserPlaylists = refreshPlaylists;
    useLibraryStore.setState({
      providerPlaylists: { netease: [likedPlaylist, ownedPlaylist] },
      playlistTracks: {
        [getPlaylistTracksKey('netease', likedPlaylist.id)]: [neteaseSong],
        [getPlaylistTracksKey('netease', ownedPlaylist.id)]: [neteaseSong]
      }
    });

    await useLibraryStore.getState().setSongLiked(neteaseSong, true);
    await useLibraryStore.getState().addSongToPlaylist(neteaseSong, ownedPlaylist);
    await useLibraryStore.getState().removeSongFromPlaylist(neteaseSong, ownedPlaylist);

    expect(setSongLiked).toHaveBeenCalledWith('netease', neteaseSong, true);
    expect(addSongToPlaylist).toHaveBeenCalledWith('netease', neteaseSong, ownedPlaylist.id);
    expect(removeSongFromPlaylist).toHaveBeenCalledWith('netease', neteaseSong, ownedPlaylist.id);
    expect(refreshTracks).toHaveBeenCalledWith('netease', likedPlaylist.id, { forceRefresh: true });
    expect(refreshTracks).toHaveBeenCalledWith('netease', ownedPlaylist.id, { forceRefresh: true });
    expect(refreshPlaylists).toHaveBeenCalledTimes(3);
    expect(refreshPlaylists).toHaveBeenCalledWith('netease', { forceRefresh: true });
  });

  it('refreshes the affected playlist cover after a verified remote mutation', async () => {
    const ownedPlaylist: Playlist = {
      ...neteasePlaylist,
      id: 'netease:owned',
      title: 'Owned playlist',
      coverUrl: 'https://p1.music.126.net/old-cover.jpg',
      ownership: 'created'
    };
    const unrelatedPlaylist: Playlist = {
      ...ownedPlaylist,
      id: 'netease:unrelated',
      title: 'Unrelated playlist'
    };
    const refreshedPlaylist: Playlist = {
      ...ownedPlaylist,
      coverUrl: 'https://p1.music.126.net/new-cover.jpg'
    };
    const refreshPlaylists = vi.fn(async () => ({
      ok: true as const,
      data: [refreshedPlaylist, { ...unrelatedPlaylist, title: 'Remote unrelated title' }]
    }));
    window.musicPlayer.music.getUserPlaylists = refreshPlaylists;
    window.musicPlayer.music.getPlaylistTracks = vi.fn(async () => ({
      ok: true as const,
      data: [neteaseSong]
    }));
    useLibraryStore.setState({
      providerPlaylists: { netease: [ownedPlaylist, unrelatedPlaylist] }
    });

    const result = await useLibraryStore.getState().addSongToPlaylist(neteaseSong, ownedPlaylist);

    expect(result).toMatchObject({ ok: true });
    expect(refreshPlaylists).toHaveBeenCalledWith('netease', { forceRefresh: true });
    expect(useLibraryStore.getState().providerPlaylists.netease).toEqual([
      refreshedPlaylist,
      unrelatedPlaylist
    ]);
  });

  it('keeps a platform custom cover when the first track changes', async () => {
    const customCoverUrl = 'https://p1.music.126.net/custom-cover.jpg';
    const ownedPlaylist: Playlist = {
      ...neteasePlaylist,
      id: 'netease:owned',
      coverUrl: customCoverUrl,
      ownership: 'created'
    };
    window.musicPlayer.music.getUserPlaylists = vi.fn(async () => ({
      ok: true as const,
      data: [{ ...ownedPlaylist, coverUrl: customCoverUrl }]
    }));
    window.musicPlayer.music.getPlaylistTracks = vi.fn(async () => ({
      ok: true as const,
      data: [] as Song[]
    }));
    useLibraryStore.setState({
      providerPlaylists: { netease: [ownedPlaylist] },
      playlistTracks: {
        [getPlaylistTracksKey('netease', ownedPlaylist.id)]: [neteaseSong]
      }
    });

    const result = await useLibraryStore.getState().removeSongFromPlaylist(neteaseSong, ownedPlaylist);

    expect(result).toMatchObject({ ok: true });
    expect(useLibraryStore.getState().providerPlaylists.netease?.[0].coverUrl).toBe(customCoverUrl);
  });

  it('falls back to the verified first-track cover when refreshed metadata has no cover', async () => {
    const ownedPlaylist: Playlist = {
      ...qqPlaylistWithoutCover,
      id: 'qq:owned',
      ownership: 'created'
    };
    window.musicPlayer.music.getUserPlaylists = vi.fn(async () => ({
      ok: true as const,
      data: [ownedPlaylist]
    }));
    window.musicPlayer.music.getPlaylistTracks = vi.fn(async () => ({
      ok: true as const,
      data: [qqSongWithCover]
    }));
    useLibraryStore.setState({
      providerPlaylists: { qq: [ownedPlaylist] }
    });

    const result = await useLibraryStore.getState().addSongToPlaylist(qqSongWithCover, ownedPlaylist);

    expect(result).toMatchObject({ ok: true });
    expect(useLibraryStore.getState().providerPlaylists.qq?.[0].coverUrl).toBe(qqSongWithCover.coverUrl);
  });

  it('preserves playlist metadata when the post-mutation summary refresh fails', async () => {
    const ownedPlaylist: Playlist = {
      ...neteasePlaylist,
      id: 'netease:owned',
      ownership: 'created'
    };
    window.musicPlayer.music.getUserPlaylists = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: 'provider_failed' as const,
        providerId: 'netease' as const,
        message: '摘要刷新失败'
      }
    }));
    window.musicPlayer.music.getPlaylistTracks = vi.fn(async () => ({
      ok: true as const,
      data: [neteaseSong]
    }));
    useLibraryStore.setState({
      providerPlaylists: { netease: [ownedPlaylist] }
    });

    const result = await useLibraryStore.getState().addSongToPlaylist(neteaseSong, ownedPlaylist);

    expect(result).toMatchObject({ ok: true });
    expect(useLibraryStore.getState().providerPlaylists.netease).toEqual([ownedPlaylist]);
    expect(useLibraryStore.getState().errorMessage).toBeNull();
  });

  it('waits for the remote playlist to reflect a successful mutation before reporting success', async () => {
    vi.useFakeTimers();
    try {
      const ownedPlaylist: Playlist = {
        ...neteasePlaylist,
        id: 'netease:owned',
        ownership: 'created'
      };
      const addSongToPlaylist = vi.fn(async () => ({
        ok: true as const,
        data: { providerId: 'netease' as const, operation: 'add_to_playlist' as const }
      }));
      const refreshTracks = vi.fn()
        .mockResolvedValueOnce({ ok: true as const, data: [] as Song[] })
        .mockResolvedValueOnce({ ok: true as const, data: [neteaseSong] });
      window.musicPlayer.music.addSongToPlaylist = addSongToPlaylist;
      window.musicPlayer.music.getPlaylistTracks = refreshTracks;

      const mutation = useLibraryStore.getState().addSongToPlaylist(neteaseSong, ownedPlaylist);
      await vi.runAllTimersAsync();

      await expect(mutation).resolves.toMatchObject({
        ok: true,
        data: { operation: 'add_to_playlist' }
      });
      expect(refreshTracks).toHaveBeenCalledTimes(2);
      expect(useLibraryStore.getState().playlistTracks[getPlaylistTracksKey('netease', ownedPlaylist.id)])
        .toEqual([neteaseSong]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a provider success response when the remote playlist never reflects the mutation', async () => {
    vi.useFakeTimers();
    try {
      const ownedPlaylist: Playlist = {
        ...neteasePlaylist,
        id: 'netease:owned',
        ownership: 'created'
      };
      window.musicPlayer.music.addSongToPlaylist = vi.fn(async () => ({
        ok: true as const,
        data: { providerId: 'netease' as const, operation: 'add_to_playlist' as const }
      }));
      const refreshTracks = vi.fn(async () => ({ ok: true as const, data: [] as Song[] }));
      window.musicPlayer.music.getPlaylistTracks = refreshTracks;

      const mutation = useLibraryStore.getState().addSongToPlaylist(neteaseSong, ownedPlaylist);
      await vi.runAllTimersAsync();
      const result = await mutation;

      expect(result).toMatchObject({
        ok: false,
        error: {
          providerId: 'netease',
          message: expect.stringContaining('在线歌单同步确认失败')
        }
      });
      expect(refreshTracks).toHaveBeenCalledTimes(3);
      expect(useLibraryStore.getState().errorMessage).toContain('在线歌单同步确认失败');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stores provider errors without throwing', async () => {
    window.musicPlayer.music.getUserPlaylists = async () => ({
      ok: false,
      error: {
        code: 'provider_failed',
        providerId: 'netease',
        message: '网易云音乐未登录'
      }
    });

    await useLibraryStore.getState().loadProviderPlaylists('netease');

    expect(useLibraryStore.getState().providerPlaylists.netease).toEqual([]);
    expect(useLibraryStore.getState().errorMessage).toBe('网易云音乐未登录');
  });
});
