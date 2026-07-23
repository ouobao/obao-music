import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlbumSummary } from '../../shared/musicTypes';
import { installMusicPlayerApiMock } from '../test/fixtures/musicPlayerApi';
import { useReleaseCatalogStore } from './releaseCatalogStore';

const album: AlbumSummary = {
  id: 'qq:album:release-1',
  providerId: 'qq',
  platformAlbumId: 'release-1',
  title: 'Release One',
  artistName: 'Release Artist',
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  releaseDate: '2026-07-17'
};

describe('release catalog store', () => {
  beforeEach(() => {
    installMusicPlayerApiMock();
    useReleaseCatalogStore.getState().resetForTest();
  });

  it('loads and caches provider albums independently', async () => {
    const getNewAlbums = vi.fn(async () => ({ ok: true as const, data: [album] }));
    installMusicPlayerApiMock({ getNewAlbums });

    await useReleaseCatalogStore.getState().load('qq');
    await useReleaseCatalogStore.getState().load('qq');

    expect(getNewAlbums).toHaveBeenCalledTimes(1);
    expect(getNewAlbums).toHaveBeenCalledWith('qq');
    expect(useReleaseCatalogStore.getState().byProvider.qq.albums).toEqual([album]);
    expect(useReleaseCatalogStore.getState().byProvider.netease.albums).toEqual([]);
  });

  it('keeps stale albums when a force refresh fails', async () => {
    const getNewAlbums = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, data: [album] })
      .mockResolvedValueOnce({
        ok: false as const,
        error: { code: 'provider_failed' as const, providerId: 'qq' as const, message: 'release failed' }
      });
    installMusicPlayerApiMock({ getNewAlbums });

    await useReleaseCatalogStore.getState().load('qq');
    await useReleaseCatalogStore.getState().load('qq', { forceRefresh: true });

    expect(useReleaseCatalogStore.getState().byProvider.qq).toMatchObject({
      albums: [album],
      isLoading: false,
      errorMessage: 'release failed'
    });
  });

  it('does not cache a failed initial request', async () => {
    const getNewAlbums = vi.fn()
      .mockResolvedValueOnce({
        ok: false as const,
        error: { code: 'provider_failed' as const, providerId: 'qq' as const, message: 'release failed' }
      })
      .mockResolvedValueOnce({ ok: true as const, data: [album] });
    installMusicPlayerApiMock({ getNewAlbums });

    await useReleaseCatalogStore.getState().load('qq');
    expect(useReleaseCatalogStore.getState().byProvider.qq).toMatchObject({
      loaded: false,
      loadedAt: null,
      errorMessage: 'release failed'
    });

    await useReleaseCatalogStore.getState().load('qq');
    expect(getNewAlbums).toHaveBeenCalledTimes(2);
    expect(useReleaseCatalogStore.getState().byProvider.qq.albums).toEqual([album]);
  });
});
