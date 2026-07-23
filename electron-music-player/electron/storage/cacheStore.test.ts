import { describe, expect, it, vi } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_KEYS, CACHE_TTL_MS } from './schema.cts';
import { createFileCacheStore, createMemoryCacheStore } from './cacheStore.cts';

describe('main process memory cache store', () => {
  it('returns cached values before ttl and reloads after expiration', async () => {
    let now = 1_000;
    const cache = createMemoryCacheStore({ now: () => now });
    const loadValue = vi.fn(async () => ({ value: `load-${now}` }));

    const first = await cache.getOrSet('netease:playlist-tracks:6688', 500, loadValue);
    const second = await cache.getOrSet('netease:playlist-tracks:6688', 500, loadValue);
    now = 1_501;
    const third = await cache.getOrSet('netease:playlist-tracks:6688', 500, loadValue);

    expect(first).toEqual({ value: 'load-1000' });
    expect(second).toEqual({ value: 'load-1000' });
    expect(third).toEqual({ value: 'load-1501' });
    expect(loadValue).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent loads for the same key', async () => {
    const cache = createMemoryCacheStore();
    let resolveLoad!: (value: { tracks: number[] }) => void;
    const loadValue = vi.fn(() => new Promise<{ tracks: number[] }>((resolve) => {
      resolveLoad = resolve;
    }));

    const first = cache.getOrSet('netease:playlist-tracks:6688', 500, loadValue);
    const second = cache.getOrSet('netease:playlist-tracks:6688', 500, loadValue);
    await Promise.resolve();
    resolveLoad({ tracks: [1, 2, 3] });

    await expect(first).resolves.toEqual({ tracks: [1, 2, 3] });
    await expect(second).resolves.toEqual({ tracks: [1, 2, 3] });
    expect(loadValue).toHaveBeenCalledTimes(1);
  });

  it('allows a failed load to be retried', async () => {
    const cache = createMemoryCacheStore();
    const loadValue = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ tracks: [4, 5] });

    await expect(cache.getOrSet('qq:playlist-tracks:8800', 500, loadValue)).rejects.toThrow('temporary failure');
    await expect(cache.getOrSet('qq:playlist-tracks:8800', 500, loadValue)).resolves.toEqual({ tracks: [4, 5] });

    expect(loadValue).toHaveBeenCalledTimes(2);
  });

  it('starts a fresh load after an in-flight key is explicitly invalidated', async () => {
    const cache = createMemoryCacheStore();
    let resolveStaleLoad!: (value: { version: string }) => void;
    const staleLoad = vi.fn(() => new Promise<{ version: string }>((resolve) => {
      resolveStaleLoad = resolve;
    }));
    const freshLoad = vi.fn(async () => ({ version: 'fresh' }));

    const staleResult = cache.getOrSet('netease:playlist-tracks:6688', 500, staleLoad);
    await Promise.resolve();
    cache.delete('netease:playlist-tracks:6688');
    const freshResult = cache.getOrSet('netease:playlist-tracks:6688', 500, freshLoad);
    resolveStaleLoad({ version: 'stale' });

    await expect(staleResult).resolves.toEqual({ version: 'stale' });
    await expect(freshResult).resolves.toEqual({ version: 'fresh' });
    expect(cache.get('netease:playlist-tracks:6688')).toEqual({ version: 'fresh' });
    expect(staleLoad).toHaveBeenCalledTimes(1);
    expect(freshLoad).toHaveBeenCalledTimes(1);
  });

  it('invalidates entries by provider prefix without touching other providers', () => {
    const cache = createMemoryCacheStore();

    cache.set(CACHE_KEYS.loginStatus('netease'), { providerId: 'netease' }, CACHE_TTL_MS.loginStatus);
    cache.set(CACHE_KEYS.loginStatus('qq'), { providerId: 'qq' }, CACHE_TTL_MS.loginStatus);

    cache.deleteByPrefix(CACHE_KEYS.providerPrefix('netease'));

    expect(cache.get(CACHE_KEYS.loginStatus('netease'))).toBeNull();
    expect(cache.get(CACHE_KEYS.loginStatus('qq'))).toEqual({ providerId: 'qq' });
  });

  it('creates provider-scoped normalized search cache keys', () => {
    expect(CACHE_KEYS.searchResults('netease', '  Hello World  ', 30, 0)).toBe(
      'netease:search-results:v2:hello%20world:30:0'
    );
    expect(CACHE_KEYS.searchResults('qq', 'hello world', 30, 0)).toBe(
      'qq:search-results:v2:hello%20world:30:0'
    );
    expect(CACHE_KEYS.searchResults('netease', 'hello world', 10, 30)).toBe(
      'netease:search-results:v2:hello%20world:10:30'
    );
  });

  it('creates distinct cache keys for remote search suggestions, hot lists, and entity sections', () => {
    expect(CACHE_KEYS.searchSuggestions('netease', '  Hello World  ', 8)).toBe(
      'netease:search-suggestions:v1:hello%20world:8'
    );
    expect(CACHE_KEYS.searchHotSearches('qq', 10)).toBe('qq:search-hot-searches:v1:10');
    expect(CACHE_KEYS.searchEntities('netease', 'hello world', 20, 40, ['album', 'song'])).toBe(
      'netease:search-entities:v1:hello%20world:20:40:album,song'
    );
  });

  it('creates provider-scoped lyrics cache keys', () => {
    expect(CACHE_KEYS.lyrics('netease', '42')).toBe('netease:lyrics:v3:42');
    expect(CACHE_KEYS.lyrics('qq', '42')).toBe('qq:lyrics:v3:42');
  });

  it('creates provider-scoped chart directory and track cache keys', () => {
    expect(CACHE_KEYS.chartList('netease')).toBe('netease:charts:v1');
    expect(CACHE_KEYS.chartList('qq')).toBe('qq:charts:v1');
    expect(CACHE_KEYS.chartTracks('netease', 'netease:chart:19723756')).toBe(
      'netease:chart-tracks:v1:netease%3Achart%3A19723756'
    );
    expect(CACHE_KEYS.chartTracks('qq', 'qq:chart:62')).toBe('qq:chart-tracks:v1:qq%3Achart%3A62');
  });

  it('creates provider-scoped playlist discovery category and page cache keys', () => {
    expect(CACHE_KEYS.playlistCategories('netease')).toBe('netease:playlist-categories:v1');
    expect(CACHE_KEYS.playlistCategories('qq')).toBe('qq:playlist-categories:v1');
    expect(CACHE_KEYS.playlistDiscoveryPage('netease', '全部', 30, 0)).toBe(
      'netease:playlist-discovery:v2:%E5%85%A8%E9%83%A8:30:0'
    );
    expect(CACHE_KEYS.playlistDiscoveryPage('qq', '10000000', 20, 40)).toBe(
      'qq:playlist-discovery:v2:10000000:20:40'
    );
  });

  it('creates provider-scoped artist and album detail cache keys', () => {
    expect(CACHE_KEYS).toMatchObject({
      artistDetail: expect.any(Function),
      albumDetail: expect.any(Function)
    });
    expect(CACHE_KEYS.artistDetail('netease', 'netease:artist:6452')).toBe(
      'netease:artist-detail:v2:netease%3Aartist%3A6452'
    );
    expect(CACHE_KEYS.artistDetail('qq', 'qq:artist:000GDDuQ3sGQiT')).toBe(
      'qq:artist-detail:v2:qq%3Aartist%3A000GDDuQ3sGQiT'
    );
    expect(CACHE_KEYS.albumDetail('netease', 'netease:album:34720827')).toBe(
      'netease:album-detail:v1:netease%3Aalbum%3A34720827'
    );
    expect(CACHE_KEYS.albumDetail('qq', 'qq:album:001uZ5Gj0JrA4o')).toBe(
      'qq:album-detail:v1:qq%3Aalbum%3A001uZ5Gj0JrA4o'
    );
  });

  it('persists file cache values across cache instances', async () => {
    const cacheFilePath = createCacheFilePath('persist');
    const firstCache = createFileCacheStore(cacheFilePath, { now: () => 1_000 });

    firstCache.set(CACHE_KEYS.providerPlaylists('netease'), [{ id: 'netease:1' }], 5_000);
    await firstCache.flush();
    const secondCache = createFileCacheStore(cacheFilePath, { now: () => 1_000 });

    expect(secondCache.get(CACHE_KEYS.providerPlaylists('netease'))).toEqual([{ id: 'netease:1' }]);
  });

  it('reuses a serialized value when persisting a large cache entry', async () => {
    const cacheFilePath = createCacheFilePath('serialized-value');
    const cache = createFileCacheStore(cacheFilePath, { now: () => 1_000 });
    const tracks = Array.from({ length: 1_000 }, (_, index) => ({ id: index, title: `Track ${index}` }));
    const value = {
      toJSON: vi.fn(() => ({ tracks }))
    };

    cache.set(CACHE_KEYS.playlistTracks('netease', 'netease:6688'), value, 5_000);
    expect(value.toJSON).toHaveBeenCalledTimes(1);
    await cache.flush();

    expect(value.toJSON).toHaveBeenCalledTimes(1);
    const reloadedCache = createFileCacheStore(cacheFilePath, { now: () => 1_000 });
    expect(reloadedCache.get<{ tracks: typeof tracks }>(CACHE_KEYS.playlistTracks('netease', 'netease:6688'))?.tracks)
      .toEqual(tracks);
  });

  it('does not return expired file cache values', async () => {
    let now = 1_000;
    const cacheFilePath = createCacheFilePath('expired');
    const firstCache = createFileCacheStore(cacheFilePath, { now: () => now });

    firstCache.set(CACHE_KEYS.loginStatus('netease'), { providerId: 'netease' }, 10);
    await firstCache.flush();
    now = 1_011;
    const secondCache = createFileCacheStore(cacheFilePath, { now: () => now });

    expect(secondCache.get(CACHE_KEYS.loginStatus('netease'))).toBeNull();
  });

  it('persists deleteByPrefix changes without removing other file cache entries', async () => {
    const cacheFilePath = createCacheFilePath('prefix');
    const cache = createFileCacheStore(cacheFilePath, { now: () => 1_000 });

    cache.set(CACHE_KEYS.loginStatus('netease'), { providerId: 'netease' }, 5_000);
    cache.set(CACHE_KEYS.loginStatus('qq'), { providerId: 'qq' }, 5_000);
    cache.deleteByPrefix(CACHE_KEYS.providerPrefix('netease'));
    await cache.flush();
    const reloadedCache = createFileCacheStore(cacheFilePath, { now: () => 1_000 });

    expect(reloadedCache.get(CACHE_KEYS.loginStatus('netease'))).toBeNull();
    expect(reloadedCache.get(CACHE_KEYS.loginStatus('qq'))).toEqual({ providerId: 'qq' });
  });

  it('evicts least recently used entries when the configured memory budget is reached', () => {
    let now = 1_000;
    const cache = createMemoryCacheStore({ now: () => now, maxEntries: 2 });
    cache.set('first', { value: 1 }, 5_000);
    now += 1;
    cache.set('second', { value: 2 }, 5_000);
    now += 1;
    expect(cache.get('first')).toEqual({ value: 1 });
    now += 1;
    cache.set('third', { value: 3 }, 5_000);

    expect(cache.get('first')).toEqual({ value: 1 });
    expect(cache.get('second')).toBeNull();
    expect(cache.get('third')).toEqual({ value: 3 });
  });
});

function createCacheFilePath(name: string): string {
  const runtimeDir = join(process.cwd(), '.runtime');
  mkdirSync(runtimeDir, { recursive: true });
  return join(runtimeDir, `cache-store-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}
