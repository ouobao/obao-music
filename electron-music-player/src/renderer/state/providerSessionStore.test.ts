import { beforeEach, describe, expect, it } from 'vitest';
import { createMusicPlayerApi } from '../test/fixtures/musicPlayerApi';
import { useProviderSessionStore } from './providerSessionStore';

describe('provider session store', () => {
  beforeEach(() => {
    useProviderSessionStore.getState().resetForTest();
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
        getLoginStatus: async (providerId) => ({
          ok: true,
          data: { providerId, loggedIn: false, playbackReady: false }
        }),
        login: async (providerId) => ({
          ok: true,
          data: {
            providerId,
            loggedIn: true,
            nickname: `${providerId} user`,
            playbackReady: providerId !== 'qq'
          }
        }),
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

  it('keeps separate default session states for login providers', () => {
    const { statuses } = useProviderSessionStore.getState();

    expect(Object.keys(statuses).sort()).toEqual(['netease', 'qq']);
    expect(statuses.netease).toMatchObject({ providerId: 'netease', loggedIn: false });
    expect(statuses.qq).toMatchObject({ providerId: 'qq', loggedIn: false, playbackReady: false });
  });

  it('stores successful login status and marks the provider active', async () => {
    await useProviderSessionStore.getState().login('netease');

    const state = useProviderSessionStore.getState();
    expect(state.activeProviderId).toBe('netease');
    expect(state.statuses.netease).toMatchObject({
      providerId: 'netease',
      loggedIn: true,
      nickname: 'netease user',
      playbackReady: true
    });
  });

  it('stores structured provider errors without throwing', async () => {
    window.musicPlayer.music.login = async () => ({
      ok: false,
      error: {
        code: 'provider_not_ready',
        providerId: 'netease',
        message: '网易云音乐 Provider 尚未接入'
      }
    });

    await useProviderSessionStore.getState().login('netease');

    expect(useProviderSessionStore.getState().statuses.netease).toMatchObject({
      providerId: 'netease',
      loggedIn: false,
      playbackReady: false,
      message: '网易云音乐 Provider 尚未接入'
    });
  });

  it('hydrates persisted provider status and restores the stored active provider', async () => {
    localStorage.setItem('musicplayer.activeProviderId', 'qq');
    window.musicPlayer.music.getLoginStatus = async (providerId) => ({
      ok: true,
      data: {
        providerId,
        loggedIn: providerId === 'qq',
        nickname: providerId === 'qq' ? 'QQ User' : undefined,
        playbackReady: false
      }
    });

    await useProviderSessionStore.getState().hydrateStatuses();

    const state = useProviderSessionStore.getState();
    expect(state.activeProviderId).toBe('qq');
    expect(state.statuses.qq).toMatchObject({
      providerId: 'qq',
      loggedIn: true,
      nickname: 'QQ User',
      playbackReady: false
    });
  });

  it('keeps multiple hydrated provider sessions and restores the stored default provider', async () => {
    localStorage.setItem('musicplayer.defaultProviderId', 'qq');
    window.musicPlayer.music.getLoginStatus = async (providerId) => ({
      ok: true,
      data: {
        providerId,
        loggedIn: true,
        nickname: `${providerId} user`,
        playbackReady: true
      }
    });

    await useProviderSessionStore.getState().hydrateStatuses();

    const state = useProviderSessionStore.getState();
    expect(state.defaultProviderId).toBe('qq');
    expect(state.activeProviderId).toBe('qq');
    expect(state.statuses.netease.loggedIn).toBe(true);
    expect(state.statuses.qq.loggedIn).toBe(true);
  });

  it('falls back to another logged-in provider when logging out the default provider', async () => {
    await useProviderSessionStore.getState().login('netease');
    await useProviderSessionStore.getState().login('qq');

    expect(useProviderSessionStore.getState().defaultProviderId).toBe('qq');

    await useProviderSessionStore.getState().logout('qq');

    const state = useProviderSessionStore.getState();
    expect(state.defaultProviderId).toBe('netease');
    expect(state.activeProviderId).toBe('netease');
    expect(localStorage.getItem('musicplayer.defaultProviderId')).toBe('netease');
  });

  it('does not auto-activate a provider when startup hydration finds no login', async () => {
    await useProviderSessionStore.getState().hydrateStatuses();

    expect(useProviderSessionStore.getState().activeProviderId).toBeNull();
  });

  it('persists and clears the active provider preference', async () => {
    await useProviderSessionStore.getState().login('netease');
    expect(localStorage.getItem('musicplayer.activeProviderId')).toBe('netease');

    await useProviderSessionStore.getState().logout('netease');
    expect(localStorage.getItem('musicplayer.activeProviderId')).toBeNull();
  });

  it('does not let stale startup hydration overwrite a manual login', async () => {
    const pendingStatusResolvers = new Map<string, (result: Awaited<ReturnType<typeof window.musicPlayer.music.getLoginStatus>>) => void>();
    window.musicPlayer.music.getLoginStatus = (providerId) =>
      new Promise((resolve) => {
        pendingStatusResolvers.set(providerId, resolve);
      });

    const hydration = useProviderSessionStore.getState().hydrateStatuses();
    await useProviderSessionStore.getState().login('qq');

    pendingStatusResolvers.get('netease')?.({
      ok: true,
      data: { providerId: 'netease', loggedIn: false, playbackReady: false }
    });
    pendingStatusResolvers.get('qq')?.({
      ok: true,
      data: { providerId: 'qq', loggedIn: false, playbackReady: false }
    });
    await hydration;

    const state = useProviderSessionStore.getState();
    expect(state.activeProviderId).toBe('qq');
    expect(state.statuses.qq.loggedIn).toBe(true);
  });
});
