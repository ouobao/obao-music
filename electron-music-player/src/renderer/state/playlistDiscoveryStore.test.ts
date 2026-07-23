import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DiscoveredPlaylist,
  PlaylistCategory,
  PlaylistDiscoveryPage,
  RemoteProviderId
} from '../../shared/musicTypes';
import { installMusicPlayerApiMock } from '../test/fixtures/musicPlayerApi';
import {
  getPlaylistDiscoveryCollectionKey,
  usePlaylistDiscoveryStore
} from './playlistDiscoveryStore';

const qqCategory: PlaylistCategory = { id: 'all', providerId: 'qq', name: '全部' };
const neteaseCategory: PlaylistCategory = { id: 'all', providerId: 'netease', name: '全部' };

function createPlaylist(
  providerId: RemoteProviderId,
  platformPlaylistId: string,
  title: string
): DiscoveredPlaylist {
  return {
    id: `${providerId}:${platformPlaylistId}`,
    providerId,
    platformPlaylistId,
    title,
    description: '',
    songIds: [],
    coverTone: providerId === 'qq'
      ? 'linear-gradient(135deg, #31c27c, #2f6f90)'
      : 'linear-gradient(135deg, #d94b55, #30343b)'
  };
}

function createPage(
  providerId: RemoteProviderId,
  categoryId: string,
  playlists: DiscoveredPlaylist[],
  options: { offset?: number; limit?: number; total?: number; hasMore?: boolean } = {}
): PlaylistDiscoveryPage {
  return {
    providerId,
    categoryId,
    playlists,
    offset: options.offset ?? 0,
    limit: options.limit ?? 30,
    total: options.total ?? playlists.length,
    hasMore: options.hasMore ?? false
  };
}

describe('playlist discovery store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    installMusicPlayerApiMock();
    usePlaylistDiscoveryStore.getState().resetForTest();
  });

  it('loads and caches categories in separate provider buckets', async () => {
    const getPlaylistCategories = vi.fn(async (providerId: RemoteProviderId) => ({
      ok: true as const,
      data: providerId === 'qq' ? [qqCategory] : [neteaseCategory]
    }));
    installMusicPlayerApiMock({ getPlaylistCategories });

    await Promise.all([
      usePlaylistDiscoveryStore.getState().loadCategories('qq'),
      usePlaylistDiscoveryStore.getState().loadCategories('netease')
    ]);
    await usePlaylistDiscoveryStore.getState().loadCategories('qq');

    const state = usePlaylistDiscoveryStore.getState();
    expect(state.categoriesByProvider.qq).toEqual([qqCategory]);
    expect(state.categoriesByProvider.netease).toEqual([neteaseCategory]);
    expect(getPlaylistCategories).toHaveBeenCalledTimes(2);
  });

  it('keeps playlist pages isolated by provider and native category', async () => {
    const getDiscoveredPlaylists = vi.fn(async (providerId: RemoteProviderId, query: { categoryId: string }) => ({
      ok: true as const,
      data: createPage(providerId, query.categoryId, [
        createPlaylist(providerId, `${query.categoryId}-1`, `${providerId} ${query.categoryId}`)
      ])
    }));
    installMusicPlayerApiMock({ getDiscoveredPlaylists });

    await usePlaylistDiscoveryStore.getState().loadPlaylists('qq', 'all');
    await usePlaylistDiscoveryStore.getState().loadPlaylists('qq', '165');
    await usePlaylistDiscoveryStore.getState().loadPlaylists('netease', 'all');

    const collections = usePlaylistDiscoveryStore.getState().collectionsByKey;
    expect(collections[getPlaylistDiscoveryCollectionKey('qq', 'all')].playlists[0].title).toBe('qq all');
    expect(collections[getPlaylistDiscoveryCollectionKey('qq', '165')].playlists[0].title).toBe('qq 165');
    expect(collections[getPlaylistDiscoveryCollectionKey('netease', 'all')].playlists[0].title).toBe('netease all');
  });

  it('reports initial playlist loading until the first page settles', async () => {
    let resolveRequest: ((value: PlaylistDiscoveryPage) => void) | undefined;
    const response = new Promise<PlaylistDiscoveryPage>((resolve) => {
      resolveRequest = resolve;
    });
    installMusicPlayerApiMock({
      getDiscoveredPlaylists: async () => ({ ok: true as const, data: await response })
    });

    const load = usePlaylistDiscoveryStore.getState().loadPlaylists('qq', 'all');
    const collectionKey = getPlaylistDiscoveryCollectionKey('qq', 'all');

    expect(usePlaylistDiscoveryStore.getState().collectionsByKey[collectionKey].loadingKind).toBe('initial');

    resolveRequest?.(createPage('qq', 'all', [createPlaylist('qq', '1', 'First')]));
    await load;

    expect(usePlaylistDiscoveryStore.getState().collectionsByKey[collectionKey].loadingKind).toBeNull();
  });

  it('reports refresh loading while preserving the current page', async () => {
    const first = createPlaylist('qq', '1', 'First');
    const refreshed = createPlaylist('qq', '2', 'Refreshed');
    let resolveRefresh: ((value: PlaylistDiscoveryPage) => void) | undefined;
    const refreshResponse = new Promise<PlaylistDiscoveryPage>((resolve) => {
      resolveRefresh = resolve;
    });
    const getDiscoveredPlaylists = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, data: createPage('qq', 'all', [first]) })
      .mockImplementationOnce(async () => ({ ok: true as const, data: await refreshResponse }));
    installMusicPlayerApiMock({ getDiscoveredPlaylists });

    await usePlaylistDiscoveryStore.getState().loadPlaylists('qq', 'all');
    const refresh = usePlaylistDiscoveryStore.getState().loadPlaylists('qq', 'all', { forceRefresh: true });
    const collectionKey = getPlaylistDiscoveryCollectionKey('qq', 'all');
    const pendingCollection = usePlaylistDiscoveryStore.getState().collectionsByKey[collectionKey];

    expect(pendingCollection.loadingKind).toBe('refresh');
    expect(pendingCollection.playlists).toEqual([first]);

    resolveRefresh?.(createPage('qq', 'all', [refreshed]));
    await refresh;

    expect(usePlaylistDiscoveryStore.getState().collectionsByKey[collectionKey].loadingKind).toBeNull();
  });

  it('loads the next offset once and removes duplicate playlists while appending', async () => {
    const first = createPlaylist('qq', '1', 'First');
    const duplicate = createPlaylist('qq', '2', 'Second');
    const third = createPlaylist('qq', '3', 'Third');
    const getDiscoveredPlaylists = vi.fn()
      .mockResolvedValueOnce({
        ok: true as const,
        data: createPage('qq', 'all', [first, duplicate], { total: 3, hasMore: true })
      })
      .mockResolvedValueOnce({
        ok: true as const,
        data: createPage('qq', 'all', [duplicate, third], { offset: 2, total: 3, hasMore: false })
      });
    installMusicPlayerApiMock({ getDiscoveredPlaylists });

    await usePlaylistDiscoveryStore.getState().loadPlaylists('qq', 'all');
    await usePlaylistDiscoveryStore.getState().loadPlaylists('qq', 'all', { append: true });

    expect(getDiscoveredPlaylists).toHaveBeenNthCalledWith(2, 'qq', {
      categoryId: 'all',
      limit: 30,
      offset: 2
    });
    const collection = usePlaylistDiscoveryStore.getState().collectionsByKey[
      getPlaylistDiscoveryCollectionKey('qq', 'all')
    ];
    expect(collection.playlists.map((playlist) => playlist.id)).toEqual(['qq:1', 'qq:2', 'qq:3']);
    expect(collection.hasMore).toBe(false);
  });

  it('reports append loading while keeping the current page visible', async () => {
    const first = createPlaylist('qq', '1', 'First');
    const second = createPlaylist('qq', '2', 'Second');
    let resolveAppend: ((value: PlaylistDiscoveryPage) => void) | undefined;
    const appendResponse = new Promise<PlaylistDiscoveryPage>((resolve) => {
      resolveAppend = resolve;
    });
    const getDiscoveredPlaylists = vi.fn()
      .mockResolvedValueOnce({
        ok: true as const,
        data: createPage('qq', 'all', [first], { total: 2, hasMore: true })
      })
      .mockImplementationOnce(async () => ({ ok: true as const, data: await appendResponse }));
    installMusicPlayerApiMock({ getDiscoveredPlaylists });

    await usePlaylistDiscoveryStore.getState().loadPlaylists('qq', 'all');
    const append = usePlaylistDiscoveryStore.getState().loadPlaylists('qq', 'all', { append: true });
    const collectionKey = getPlaylistDiscoveryCollectionKey('qq', 'all');
    const pendingCollection = usePlaylistDiscoveryStore.getState().collectionsByKey[collectionKey];

    expect(pendingCollection.loadingKind).toBe('append');
    expect(pendingCollection.playlists).toEqual([first]);

    resolveAppend?.(createPage('qq', 'all', [second], { offset: 1, total: 2, hasMore: false }));
    await append;

    expect(usePlaylistDiscoveryStore.getState().collectionsByKey[collectionKey].loadingKind).toBeNull();
  });

  it('coalesces duplicate in-flight page loads', async () => {
    let resolveRequest: ((value: ReturnType<typeof createPage>) => void) | undefined;
    const response = new Promise<PlaylistDiscoveryPage>((resolve) => {
      resolveRequest = resolve;
    });
    const getDiscoveredPlaylists = vi.fn(async () => ({ ok: true as const, data: await response }));
    installMusicPlayerApiMock({ getDiscoveredPlaylists });

    const firstLoad = usePlaylistDiscoveryStore.getState().loadPlaylists('qq', 'all');
    const duplicateLoad = usePlaylistDiscoveryStore.getState().loadPlaylists('qq', 'all');
    resolveRequest?.(createPage('qq', 'all', [createPlaylist('qq', '1', 'Only once')]));
    await Promise.all([firstLoad, duplicateLoad]);

    expect(getDiscoveredPlaylists).toHaveBeenCalledTimes(1);
  });

  it('keeps page errors isolated and preserves another provider result', async () => {
    installMusicPlayerApiMock({
      getDiscoveredPlaylists: async (providerId, query) => providerId === 'qq'
        ? {
            ok: false,
            error: {
              code: 'provider_failed',
              providerId,
              message: 'QQ 歌单加载失败'
            }
          }
        : {
            ok: true,
            data: createPage('netease', query.categoryId, [createPlaylist('netease', '1', '网易云歌单')])
          }
    });

    await usePlaylistDiscoveryStore.getState().loadPlaylists('netease', 'all');
    await usePlaylistDiscoveryStore.getState().loadPlaylists('qq', 'all');

    const collections = usePlaylistDiscoveryStore.getState().collectionsByKey;
    expect(collections[getPlaylistDiscoveryCollectionKey('netease', 'all')].playlists).toHaveLength(1);
    expect(collections[getPlaylistDiscoveryCollectionKey('netease', 'all')].errorMessage).toBeNull();
    expect(collections[getPlaylistDiscoveryCollectionKey('qq', 'all')].errorMessage).toBe('QQ 歌单加载失败');
  });

  it('remembers the most recently selected discovery provider', () => {
    usePlaylistDiscoveryStore.getState().setLastProviderId('netease');

    expect(usePlaylistDiscoveryStore.getState().lastProviderId).toBe('netease');
    expect(window.localStorage.getItem('musicplayer.playlist-discovery-provider')).toBe('netease');
  });
});
