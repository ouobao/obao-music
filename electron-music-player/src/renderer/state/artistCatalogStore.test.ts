import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlbumDetail, ArtistDetail } from '../../shared/musicTypes';
import type { ProviderFetchOptions, ProviderIpcResult } from '../../shared/providerTypes';
import { installMusicPlayerApiMock } from '../test/fixtures/musicPlayerApi';
import { useArtistCatalogStore } from './artistCatalogStore';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const qqArtist: ArtistDetail = {
  id: 'qq:artist:0025NhlN2yWrP4',
  providerId: 'qq',
  platformArtistId: '0025NhlN2yWrP4',
  name: '周杰伦',
  aliases: ['Jay Chou'],
  description: '华语创作歌手',
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  sourceLabel: 'QQ音乐',
  topSongs: [],
  albums: []
};

const qqAlbum: AlbumDetail = {
  id: 'qq:album:000MkMni19ClKG',
  providerId: 'qq',
  platformAlbumId: '000MkMni19ClKG',
  title: '叶惠美',
  artistName: '周杰伦',
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  sourceLabel: 'QQ音乐',
  description: '录音室专辑',
  artists: [],
  tracks: []
};

describe('artist catalog store', () => {
  beforeEach(() => {
    installMusicPlayerApiMock();
    useArtistCatalogStore.getState().resetForTest();
  });

  it('loads an artist once and caches it by the complete provider-scoped id', async () => {
    const getArtistDetail = vi.fn(async () => ({ ok: true as const, data: qqArtist }));
    installMusicPlayerApiMock({ getArtistDetail });

    const first = await useArtistCatalogStore.getState().loadArtistDetail('qq', qqArtist.id);
    const cached = await useArtistCatalogStore.getState().loadArtistDetail('qq', qqArtist.id);

    expect(getArtistDetail).toHaveBeenCalledTimes(1);
    expect(getArtistDetail).toHaveBeenCalledWith('qq', qqArtist.id);
    expect(first).toEqual(qqArtist);
    expect(cached).toEqual(qqArtist);
    expect(useArtistCatalogStore.getState().artistDetailsById[qqArtist.id]).toEqual(qqArtist);
    expect(useArtistCatalogStore.getState().artistLoadingById[qqArtist.id]).toBe(false);
    expect(useArtistCatalogStore.getState().artistErrorById[qqArtist.id]).toBeNull();
  });

  it('shares an in-flight artist request across local discovery modules', async () => {
    let resolveArtist: ((value: { ok: true; data: ArtistDetail }) => void) | undefined;
    const response = new Promise<{ ok: true; data: ArtistDetail }>((resolve) => {
      resolveArtist = resolve;
    });
    const getArtistDetail = vi.fn(async () => response);
    installMusicPlayerApiMock({ getArtistDetail });

    const first = useArtistCatalogStore.getState().loadArtistDetail('qq', qqArtist.id);
    const second = useArtistCatalogStore.getState().loadArtistDetail('qq', qqArtist.id);
    resolveArtist?.({ ok: true, data: qqArtist });

    await expect(first).resolves.toEqual(qqArtist);
    await expect(second).resolves.toEqual(qqArtist);
    expect(getArtistDetail).toHaveBeenCalledTimes(1);
  });

  it('settles loading and exposes an error when the artist IPC request rejects', async () => {
    const getArtistDetail = vi.fn(async () => {
      throw new Error('artist IPC disconnected');
    });
    installMusicPlayerApiMock({ getArtistDetail });

    await expect(useArtistCatalogStore.getState().loadArtistDetail('qq', qqArtist.id)).resolves.toBeNull();

    const state = useArtistCatalogStore.getState();
    expect(getArtistDetail).toHaveBeenCalledTimes(1);
    expect(state.artistDetailsById[qqArtist.id]).toBeUndefined();
    expect(state.artistLoadingById[qqArtist.id]).toBe(false);
    expect(state.artistErrorById[qqArtist.id]).toBe('artist IPC disconnected');
  });

  it('rejects malformed artist data before it reaches entity state', async () => {
    const malformedArtist = {
      ...qqArtist,
      topSongs: null
    } as unknown as ArtistDetail;
    const getArtistDetail = vi.fn(async () => ({ ok: true as const, data: malformedArtist }));
    installMusicPlayerApiMock({ getArtistDetail });

    await expect(useArtistCatalogStore.getState().loadArtistDetail('qq', qqArtist.id)).resolves.toBeNull();

    const state = useArtistCatalogStore.getState();
    expect(getArtistDetail).toHaveBeenCalledTimes(2);
    expect(state.artistDetailsById[qqArtist.id]).toBeUndefined();
    expect(state.artistLoadingById[qqArtist.id]).toBe(false);
    expect(state.artistErrorById[qqArtist.id]).toMatch(/数据无效/);
  });

  it('bypasses a malformed cached artist response with one forced refresh', async () => {
    const malformedArtist = {
      ...qqArtist,
      aliases: null
    } as unknown as ArtistDetail;
    const getArtistDetail = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, data: malformedArtist })
      .mockResolvedValueOnce({ ok: true as const, data: qqArtist });
    installMusicPlayerApiMock({ getArtistDetail });

    await expect(useArtistCatalogStore.getState().loadArtistDetail('qq', qqArtist.id))
      .resolves.toEqual(qqArtist);

    expect(getArtistDetail).toHaveBeenCalledTimes(2);
    expect(getArtistDetail).toHaveBeenNthCalledWith(1, 'qq', qqArtist.id);
    expect(getArtistDetail).toHaveBeenNthCalledWith(2, 'qq', qqArtist.id, { forceRefresh: true });
    expect(useArtistCatalogStore.getState()).toMatchObject({
      artistLoadingById: { [qqArtist.id]: false },
      artistErrorById: { [qqArtist.id]: null }
    });
    expect(useArtistCatalogStore.getState().artistDetailsById[qqArtist.id]).toEqual(qqArtist);
  });

  it('lets a force refresh supersede an ordinary in-flight request', async () => {
    const ordinaryRequest = createDeferred<ProviderIpcResult<ArtistDetail>>();
    const refreshRequest = createDeferred<ProviderIpcResult<ArtistDetail>>();
    const refreshedArtist = { ...qqArtist, description: 'refreshed artist detail' };
    const getArtistDetail = vi.fn((
      _providerId: string,
      _artistId: string,
      options?: ProviderFetchOptions
    ) => options?.forceRefresh ? refreshRequest.promise : ordinaryRequest.promise);
    installMusicPlayerApiMock({ getArtistDetail });

    const ordinary = useArtistCatalogStore.getState().loadArtistDetail('qq', qqArtist.id);
    const refresh = useArtistCatalogStore.getState().loadArtistDetail('qq', qqArtist.id, { forceRefresh: true });

    expect(getArtistDetail).toHaveBeenCalledTimes(2);
    expect(getArtistDetail).toHaveBeenLastCalledWith('qq', qqArtist.id, { forceRefresh: true });

    refreshRequest.resolve({ ok: true, data: refreshedArtist });
    await expect(refresh).resolves.toEqual(refreshedArtist);
    ordinaryRequest.resolve({ ok: true, data: qqArtist });
    await expect(ordinary).resolves.toEqual(refreshedArtist);

    const state = useArtistCatalogStore.getState();
    expect(state.artistDetailsById[qqArtist.id]).toEqual(refreshedArtist);
    expect(state.artistLoadingById[qqArtist.id]).toBe(false);
    expect(state.artistErrorById[qqArtist.id]).toBeNull();
  });

  it('keeps refresh loading active when the superseded request settles first', async () => {
    const ordinaryRequest = createDeferred<ProviderIpcResult<ArtistDetail>>();
    const refreshRequest = createDeferred<ProviderIpcResult<ArtistDetail>>();
    const refreshedArtist = { ...qqArtist, description: 'newest artist detail' };
    const getArtistDetail = vi.fn((
      _providerId: string,
      _artistId: string,
      options?: ProviderFetchOptions
    ) => options?.forceRefresh ? refreshRequest.promise : ordinaryRequest.promise);
    installMusicPlayerApiMock({ getArtistDetail });

    const ordinary = useArtistCatalogStore.getState().loadArtistDetail('qq', qqArtist.id);
    const refresh = useArtistCatalogStore.getState().loadArtistDetail('qq', qqArtist.id, { forceRefresh: true });

    ordinaryRequest.resolve({ ok: true, data: qqArtist });
    await expect(ordinary).resolves.toBeNull();
    expect(useArtistCatalogStore.getState().artistLoadingById[qqArtist.id]).toBe(true);
    expect(useArtistCatalogStore.getState().artistDetailsById[qqArtist.id]).toBeUndefined();

    refreshRequest.resolve({ ok: true, data: refreshedArtist });
    await expect(refresh).resolves.toEqual(refreshedArtist);
    expect(useArtistCatalogStore.getState().artistLoadingById[qqArtist.id]).toBe(false);
    expect(useArtistCatalogStore.getState().artistDetailsById[qqArtist.id]).toEqual(refreshedArtist);
  });

  it('invalidates an artist cache and prevents an older request from committing', async () => {
    const staleRequest = createDeferred<ProviderIpcResult<ArtistDetail>>();
    const freshRequest = createDeferred<ProviderIpcResult<ArtistDetail>>();
    const refreshedArtist = { ...qqArtist, description: 'fresh artist detail' };
    const getArtistDetail = vi.fn((
      _providerId: string,
      _artistId: string,
      options?: ProviderFetchOptions
    ) => options?.forceRefresh ? freshRequest.promise : staleRequest.promise);
    installMusicPlayerApiMock({ getArtistDetail });

    const stale = useArtistCatalogStore.getState().loadArtistDetail('qq', qqArtist.id);
    useArtistCatalogStore.getState().invalidateArtistDetail('qq', qqArtist.id);
    const fresh = useArtistCatalogStore.getState().loadArtistDetail(
      'qq',
      qqArtist.id,
      { forceRefresh: true }
    );

    expect(useArtistCatalogStore.getState()).toMatchObject({
      artistDetailsById: {},
      artistLoadingById: { [qqArtist.id]: true },
      artistErrorById: { [qqArtist.id]: null }
    });

    freshRequest.resolve({ ok: true, data: refreshedArtist });
    await expect(fresh).resolves.toEqual(refreshedArtist);
    staleRequest.resolve({ ok: true, data: qqArtist });
    await expect(stale).resolves.toEqual(refreshedArtist);

    expect(useArtistCatalogStore.getState().artistDetailsById[qqArtist.id]).toEqual(refreshedArtist);
  });

  it('loads an album once into album-specific entity state', async () => {
    const getAlbumDetail = vi.fn(async () => ({ ok: true as const, data: qqAlbum }));
    installMusicPlayerApiMock({ getAlbumDetail });

    const first = await useArtistCatalogStore.getState().loadAlbumDetail('qq', qqAlbum.id);
    const cached = await useArtistCatalogStore.getState().loadAlbumDetail('qq', qqAlbum.id);

    expect(getAlbumDetail).toHaveBeenCalledTimes(1);
    expect(getAlbumDetail).toHaveBeenCalledWith('qq', qqAlbum.id);
    expect(first).toEqual(qqAlbum);
    expect(cached).toEqual(qqAlbum);
    expect(useArtistCatalogStore.getState().albumDetailsById[qqAlbum.id]).toEqual(qqAlbum);
    expect(useArtistCatalogStore.getState().albumLoadingById[qqAlbum.id]).toBe(false);
    expect(useArtistCatalogStore.getState().albumErrorById[qqAlbum.id]).toBeNull();
  });

  it('lets a force refresh supersede an ordinary in-flight album request', async () => {
    const ordinaryRequest = createDeferred<ProviderIpcResult<AlbumDetail>>();
    const refreshRequest = createDeferred<ProviderIpcResult<AlbumDetail>>();
    const refreshedAlbum = { ...qqAlbum, description: 'refreshed album detail' };
    const getAlbumDetail = vi.fn((
      _providerId: string,
      _albumId: string,
      options?: ProviderFetchOptions
    ) => options?.forceRefresh ? refreshRequest.promise : ordinaryRequest.promise);
    installMusicPlayerApiMock({ getAlbumDetail });

    const ordinary = useArtistCatalogStore.getState().loadAlbumDetail('qq', qqAlbum.id);
    const refresh = useArtistCatalogStore.getState().loadAlbumDetail(
      'qq',
      qqAlbum.id,
      { forceRefresh: true }
    );

    expect(getAlbumDetail).toHaveBeenCalledTimes(2);
    refreshRequest.resolve({ ok: true, data: refreshedAlbum });
    await expect(refresh).resolves.toEqual(refreshedAlbum);
    ordinaryRequest.resolve({ ok: true, data: qqAlbum });
    await expect(ordinary).resolves.toEqual(refreshedAlbum);

    expect(useArtistCatalogStore.getState().albumDetailsById[qqAlbum.id]).toEqual(refreshedAlbum);
  });

  it('prevents a pre-reset album request from returning or committing stale data', async () => {
    const staleRequest = createDeferred<ProviderIpcResult<AlbumDetail>>();
    installMusicPlayerApiMock({ getAlbumDetail: vi.fn(() => staleRequest.promise) });

    const pending = useArtistCatalogStore.getState().loadAlbumDetail('qq', qqAlbum.id);
    useArtistCatalogStore.getState().resetForTest();
    staleRequest.resolve({ ok: true, data: qqAlbum });

    await expect(pending).resolves.toBeNull();
    expect(useArtistCatalogStore.getState()).toMatchObject({
      albumDetailsById: {},
      albumLoadingById: {},
      albumErrorById: {}
    });
  });

  it('restores catalog actions replaced by a test double', () => {
    const originalLoadAlbumDetail = useArtistCatalogStore.getState().loadAlbumDetail;
    useArtistCatalogStore.setState({ loadAlbumDetail: vi.fn(async () => null) });

    useArtistCatalogStore.getState().resetForTest();

    expect(useArtistCatalogStore.getState().loadAlbumDetail).toBe(originalLoadAlbumDetail);
  });

  it('settles album loading and keeps the previous cache when the IPC request rejects', async () => {
    const getAlbumDetail = vi.fn(async () => {
      throw new Error('album IPC disconnected');
    });
    installMusicPlayerApiMock({ getAlbumDetail });

    await expect(useArtistCatalogStore.getState().loadAlbumDetail('qq', qqAlbum.id)).resolves.toBeNull();

    const state = useArtistCatalogStore.getState();
    expect(getAlbumDetail).toHaveBeenCalledTimes(1);
    expect(state.albumDetailsById[qqAlbum.id]).toBeUndefined();
    expect(state.albumLoadingById[qqAlbum.id]).toBe(false);
    expect(state.albumErrorById[qqAlbum.id]).toBe('album IPC disconnected');
  });

  it('rejects malformed album data before it reaches entity state', async () => {
    const malformedAlbum = {
      ...qqAlbum,
      tracks: null
    } as unknown as AlbumDetail;
    const getAlbumDetail = vi.fn(async () => ({ ok: true as const, data: malformedAlbum }));
    installMusicPlayerApiMock({ getAlbumDetail });

    await expect(useArtistCatalogStore.getState().loadAlbumDetail('qq', qqAlbum.id)).resolves.toBeNull();

    const state = useArtistCatalogStore.getState();
    expect(getAlbumDetail).toHaveBeenCalledTimes(1);
    expect(state.albumDetailsById[qqAlbum.id]).toBeUndefined();
    expect(state.albumLoadingById[qqAlbum.id]).toBe(false);
    expect(state.albumErrorById[qqAlbum.id]).toMatch(/数据无效/);
  });

  it('isolates artist failures by complete entity id', async () => {
    const neteaseArtist: ArtistDetail = {
      ...qqArtist,
      id: 'netease:artist:6452',
      providerId: 'netease',
      platformArtistId: '6452',
      sourceLabel: '网易云'
    };
    const getArtistDetail = vi.fn(async (providerId: string) => providerId === 'qq'
      ? {
          ok: false as const,
          error: {
            code: 'provider_failed' as const,
            providerId: 'qq' as const,
            message: 'QQ 歌手加载失败'
          }
        }
      : { ok: true as const, data: neteaseArtist });
    installMusicPlayerApiMock({ getArtistDetail });

    await useArtistCatalogStore.getState().loadArtistDetail('qq', qqArtist.id);
    await useArtistCatalogStore.getState().loadArtistDetail('netease', neteaseArtist.id);

    const state = useArtistCatalogStore.getState();
    expect(state.artistDetailsById[qqArtist.id]).toBeUndefined();
    expect(state.artistErrorById[qqArtist.id]).toBe('QQ 歌手加载失败');
    expect(state.artistDetailsById[neteaseArtist.id]).toEqual(neteaseArtist);
    expect(state.artistErrorById[neteaseArtist.id]).toBeNull();
  });

  it('force refreshes only the requested album entity', async () => {
    const refreshedAlbum = { ...qqAlbum, description: '刷新后的专辑资料' };
    const getAlbumDetail = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, data: qqAlbum })
      .mockResolvedValueOnce({ ok: true as const, data: refreshedAlbum });
    installMusicPlayerApiMock({ getAlbumDetail });

    await useArtistCatalogStore.getState().loadAlbumDetail('qq', qqAlbum.id);
    await useArtistCatalogStore.getState().loadAlbumDetail('qq', qqAlbum.id, { forceRefresh: true });

    expect(getAlbumDetail).toHaveBeenLastCalledWith('qq', qqAlbum.id, { forceRefresh: true });
    expect(useArtistCatalogStore.getState().albumDetailsById[qqAlbum.id]).toEqual(refreshedAlbum);
  });
});
