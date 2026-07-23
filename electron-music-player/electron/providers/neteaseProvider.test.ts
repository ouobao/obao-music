import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createNeteaseProvider,
  NETEASE_ACCOUNT_URL,
  NETEASE_DAILY_RECOMMENDED_SONGS_URL,
  NETEASE_HOMEPAGE_BLOCKS_URL,
  NETEASE_LOGIN_PARTITION,
  NETEASE_LOGIN_URL,
  NETEASE_NEW_ALBUMS_URL,
  NETEASE_PERSONALIZED_NEW_SONGS_URL,
  NETEASE_RECOMMENDATION_HISTORY_DATES_URL,
  NETEASE_RECOMMENDATION_HISTORY_DETAIL_URL
} from './neteaseProvider.cts';
import type { NeteaseCookie, NeteaseRuntime } from './neteaseProvider.cts';
import type { ProviderFetchOptions, Song } from './types.cts';
import { CACHE_KEYS, CACHE_TTL_MS } from '../storage/schema.cts';
import { createMemoryCacheStore } from '../storage/cacheStore.cts';

function createRuntime(cookies: NeteaseCookie[], responses: unknown[] = []): NeteaseRuntime {
  return {
    openLoginWindow: vi.fn(async () => undefined),
    getCookies: vi.fn(async () => cookies),
    clearSession: vi.fn(async () => undefined),
    requestJson: vi.fn(async () => responses.shift())
  } as unknown as NeteaseRuntime;
}

function createPlaylistTrack(id: number) {
  return {
    id,
    name: `Track ${id}`,
    ar: [{ name: 'Artist' }],
    al: { name: 'Album' },
    dt: 180000
  };
}

interface NeteaseSimilarSongsFixture {
  code: number;
  songs: Array<{
    id: number;
    name: string;
    artists: Array<{ id: number; name: string }>;
    album: { id: number; name: string; picUrl: string };
    duration: number;
  }>;
}

interface SimilarSongsTestCapability {
  getSimilarSongs(song: Song, options?: ProviderFetchOptions): Promise<Song[]>;
}

interface NeteaseHomepageBlocksFixture {
  code: number;
  data: {
    blocks: unknown[];
  };
}

interface HomepageBlocksTestCapability {
  getHomepageBlocks(options?: ProviderFetchOptions): Promise<{
    providerId: 'netease';
    blocks: Array<{
      kind: 'song';
      id: string;
      title: string;
      songs: Song[];
    }>;
  }>;
}

interface NeteaseRecommendationHistoryFixture {
  recent: {
    code: number;
    data: {
      dates: string[];
      songs: null;
    };
  };
  detail: {
    code: number;
    data: {
      dates: string[];
      songs: Array<Record<string, unknown>>;
    };
  };
}

interface RecommendationHistoryTestCapability {
  getRecentDates(options?: ProviderFetchOptions): Promise<string[]>;
  getHistory(date: string, options?: ProviderFetchOptions): Promise<{
    providerId: 'netease';
    date: string;
    songs: Song[];
  }>;
}

function readSimilarSongsFixture(): NeteaseSimilarSongsFixture {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'electron/providers/neteaseSimilarSongs.fixture.json'), 'utf8')
  ) as NeteaseSimilarSongsFixture;
}

function getSimilarSongsCapability(
  runtime: NeteaseRuntime,
  cache = createMemoryCacheStore()
): SimilarSongsTestCapability {
  const capabilities = createNeteaseProvider(runtime, cache).capabilities as unknown as {
    similarSongs?: SimilarSongsTestCapability;
  };
  expect(capabilities?.similarSongs).toBeDefined();
  return capabilities.similarSongs!;
}

function readHomepageBlocksFixture(): NeteaseHomepageBlocksFixture {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'electron/providers/neteaseHomepageBlocks.fixture.json'), 'utf8')
  ) as NeteaseHomepageBlocksFixture;
}

function readNewAlbumsFixture() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'electron/providers/neteaseNewAlbums.fixture.json'), 'utf8')
  ) as {
    code: number;
    albums: Array<Record<string, unknown>>;
  };
}

function readRecommendationHistoryFixture(): NeteaseRecommendationHistoryFixture {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'electron/providers/neteaseRecommendationHistory.fixture.json'), 'utf8')
  ) as NeteaseRecommendationHistoryFixture;
}

function getHomepageBlocksCapability(
  runtime: NeteaseRuntime,
  cache = createMemoryCacheStore()
): HomepageBlocksTestCapability {
  const capabilities = createNeteaseProvider(runtime, cache).capabilities as unknown as {
    homepageBlocks?: HomepageBlocksTestCapability;
  };
  expect(capabilities?.homepageBlocks).toBeDefined();
  return capabilities.homepageBlocks!;
}

function getRecommendationHistoryCapability(
  runtime: NeteaseRuntime,
  cache = createMemoryCacheStore()
): RecommendationHistoryTestCapability {
  const capabilities = createNeteaseProvider(runtime, cache).capabilities as unknown as {
    recommendationHistory?: RecommendationHistoryTestCapability;
  };
  expect(capabilities?.recommendationHistory).toBeDefined();
  return capabilities.recommendationHistory!;
}

const mutationSong = {
  id: 'netease:42',
  providerId: 'netease' as const,
  platformSongId: '42',
  title: 'Mutation Song',
  artist: 'Mutation Artist',
  album: 'Mutation Album',
  durationMs: 180000,
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
};

describe('netease provider', () => {
  it('maps anonymous personalized new songs without requesting authenticated modules', async () => {
    const runtime = createRuntime([], [{
      code: 200,
      result: [{
        id: 300,
        song: {
          id: 300,
          name: 'Personalized New Song',
          artists: [{ name: 'New Artist' }],
          album: { name: 'New Album', picUrl: 'http://example.test/new-song.jpg' },
          duration: 210000
        }
      }]
    }]);
    const capability = createNeteaseProvider(runtime).capabilities!.recommendations!;

    const feed = await capability.getRecommendationHome();

    expect(feed).toEqual({
      providerId: 'netease',
      loggedIn: false,
      dailySongs: [],
      moduleResults: {
        daily: { status: 'skipped', errorMessage: null },
        new: { status: 'fulfilled', errorMessage: null }
      },
      newSongs: [{
        id: 'netease:300',
        providerId: 'netease',
        platformSongId: '300',
        title: 'Personalized New Song',
        artist: 'New Artist',
        album: 'New Album',
        durationMs: 210000,
        coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
        coverUrl: 'https://example.test/new-song.jpg',
        sourceContext: {
          type: 'recommendation',
          providerId: 'netease'
        }
      }]
    });
    expect(feed).not.toHaveProperty('privatePlaylists');
    expect(feed).not.toHaveProperty('publicPersonalizedPlaylists');
    expect(runtime.requestJson).toHaveBeenCalledTimes(1);
    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_PERSONALIZED_NEW_SONGS_URL,
      method: 'POST',
      form: { limit: '12' }
    });
  });

  it('maps the verified anonymous Netease new-album fixture', async () => {
    const runtime = createRuntime([], [readNewAlbumsFixture()]);
    const capability = createNeteaseProvider(runtime).capabilities!.releaseCatalog!;

    const albums = await capability.getNewAlbums();

    expect(albums).toEqual([
      expect.objectContaining({
        id: 'netease:album:900000',
        providerId: 'netease',
        platformAlbumId: '900000',
        title: 'Fixture Release Album 01',
        artistName: 'Fixture Release Artist 01',
        releaseDate: '2025-07-01',
        trackCount: 10,
        albumType: '专辑'
      }),
      expect.objectContaining({ id: 'netease:album:900001', albumType: 'EP' }),
      expect.objectContaining({ id: 'netease:album:900002', albumType: 'Single' })
    ]);
    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_NEW_ALBUMS_URL,
      method: 'POST',
      form: { area: 'ALL', offset: '0', limit: '12', total: 'true' },
      crypto: 'weapi',
      credentials: 'omit'
    });
  });

  it('rejects malformed Netease album resources without caching an empty success', async () => {
    const cache = createMemoryCacheStore();
    const runtime = createRuntime([], [
      { code: 200, albums: [{ title: 'Unverified Album' }] },
      readNewAlbumsFixture()
    ]);
    const capability = createNeteaseProvider(runtime, cache).capabilities!.releaseCatalog!;

    await expect(capability.getNewAlbums()).rejects.toThrow('网易云新碟速递数据无效');
    expect(cache.get(CACHE_KEYS.releaseCatalog('netease'))).toBeNull();
    await expect(capability.getNewAlbums()).resolves.toHaveLength(3);
  });

  it('filters malformed Netease album resources when verified albums remain', async () => {
    const fixture = readNewAlbumsFixture();
    fixture.albums.push({ name: 'Invalid Album' });
    const capability = createNeteaseProvider(createRuntime([], [fixture])).capabilities!.releaseCatalog!;

    await expect(capability.getNewAlbums()).resolves.toHaveLength(3);
  });

  it('rejects non-success Netease new-album business codes', async () => {
    const capability = createNeteaseProvider(createRuntime([], [{ code: 500, albums: [] }]))
      .capabilities!.releaseCatalog!;

    await expect(capability.getNewAlbums()).rejects.toThrow('网易云新碟速递请求失败');
  });

  it('caches Netease new albums and supports a release-only force refresh', async () => {
    const firstFixture = readNewAlbumsFixture();
    const refreshedFixture = readNewAlbumsFixture();
    refreshedFixture.albums[0].name = 'Refreshed Release Album';
    const runtime = createRuntime([], [firstFixture, refreshedFixture]);
    const capability = createNeteaseProvider(runtime, createMemoryCacheStore()).capabilities!.releaseCatalog!;

    const first = await capability.getNewAlbums();
    const cached = await capability.getNewAlbums();
    const refreshed = await capability.getNewAlbums({ forceRefresh: true });

    expect(first[0].title).toBe('Fixture Release Album 01');
    expect(cached[0].title).toBe('Fixture Release Album 01');
    expect(refreshed[0].title).toBe('Refreshed Release Album');
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('maps the verified recommendation-history fixture with authenticated weapi requests', async () => {
    const fixture = readRecommendationHistoryFixture();
    const runtime = createRuntime([], [fixture.recent, fixture.detail]);
    const capability = getRecommendationHistoryCapability(runtime);

    const dates = await capability.getRecentDates();
    const page = await capability.getHistory(dates[0]);

    expect(dates).toEqual(['2026-07-17', '2026-07-16', '2026-07-15']);
    expect(page).toEqual({
      providerId: 'netease',
      date: '2026-07-17',
      songs: [
        expect.objectContaining({
          id: 'netease:970001',
          platformSongId: '970001',
          title: 'Fixture History Song 01',
          artist: 'Fixture History Artist 01',
          album: 'Fixture History Album 01',
          durationMs: 181000,
          sourceContext: {
            type: 'recommendation',
            providerId: 'netease',
            playlistTitle: '历史日推'
          }
        }),
        expect.objectContaining({ id: 'netease:970002' })
      ]
    });
    expect(runtime.requestJson).toHaveBeenNthCalledWith(1, {
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_RECOMMENDATION_HISTORY_DATES_URL,
      method: 'POST',
      form: {},
      crypto: 'weapi'
    });
    expect(runtime.requestJson).toHaveBeenNthCalledWith(2, {
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_RECOMMENDATION_HISTORY_DETAIL_URL,
      method: 'POST',
      form: { date: '2026-07-17' },
      crypto: 'weapi'
    });
  });

  it('rejects invalid history dates before requesting the provider', async () => {
    const runtime = createRuntime([]);
    const capability = getRecommendationHistoryCapability(runtime);

    await expect(capability.getHistory('2026-02-30')).rejects.toThrow('网易云历史日推日期无效');
    await expect(capability.getHistory('not-a-date')).rejects.toThrow('网易云历史日推日期无效');
    expect(runtime.requestJson).not.toHaveBeenCalled();
  });

  it('filters malformed and duplicate history songs while retaining verified tracks', async () => {
    const fixture = readRecommendationHistoryFixture();
    fixture.detail.data.songs.push(
      { ...fixture.detail.data.songs[0] },
      { id: 970003, name: 'Missing verified relationships' }
    );
    const capability = getRecommendationHistoryCapability(createRuntime([], [fixture.detail]));

    await expect(capability.getHistory('2026-07-17')).resolves.toMatchObject({
      songs: [
        { id: 'netease:970001' },
        { id: 'netease:970002' }
      ]
    });
  });

  it('does not cache failed recommendation-history responses', async () => {
    const fixture = readRecommendationHistoryFixture();
    const cache = createMemoryCacheStore();
    const runtime = createRuntime([], [
      { code: 500, data: { dates: [] } },
      fixture.recent,
      { code: 200, data: { songs: [{ id: 1 }] } },
      fixture.detail
    ]);
    const capability = getRecommendationHistoryCapability(runtime, cache);

    await expect(capability.getRecentDates()).rejects.toThrow('网易云历史日推日期请求失败');
    await expect(capability.getRecentDates()).resolves.toHaveLength(3);
    await expect(capability.getHistory('2026-07-17')).rejects.toThrow('网易云历史日推歌曲数据无效');
    await expect(capability.getHistory('2026-07-17')).resolves.toMatchObject({ songs: [{ id: 'netease:970001' }, { id: 'netease:970002' }] });
    expect(cache.get(CACHE_KEYS.recommendationHistoryDates('netease'))).not.toBeNull();
    expect(cache.get(CACHE_KEYS.recommendationHistory('netease', '2026-07-17'))).not.toBeNull();
    expect(runtime.requestJson).toHaveBeenCalledTimes(4);
  });

  it('caches history dates and each date detail until force refreshed', async () => {
    const first = readRecommendationHistoryFixture();
    const refreshed = readRecommendationHistoryFixture();
    refreshed.recent.data.dates = ['2026-07-18'];
    refreshed.detail.data.songs[0].name = 'Refreshed History Song';
    const runtime = createRuntime([], [first.recent, first.detail, refreshed.detail, refreshed.recent]);
    const capability = getRecommendationHistoryCapability(runtime);

    const dates = await capability.getRecentDates();
    const cachedDates = await capability.getRecentDates();
    const page = await capability.getHistory(dates[0]);
    const cachedPage = await capability.getHistory(dates[0]);
    const refreshedPage = await capability.getHistory(dates[0], { forceRefresh: true });
    const refreshedDates = await capability.getRecentDates({ forceRefresh: true });

    expect(cachedDates).toEqual(dates);
    expect(cachedPage.songs[0].title).toBe(page.songs[0].title);
    expect(refreshedPage.songs[0].title).toBe('Refreshed History Song');
    expect(refreshedDates).toEqual(['2026-07-18']);
    expect(runtime.requestJson).toHaveBeenCalledTimes(4);
  });

  it('maps authenticated daily songs and personalized new songs as recommendation sources', async () => {
    const runtime = createRuntime([{ name: 'MUSIC_U', value: 'authenticated' }], [
      {
        code: 200,
        profile: { userId: 42, nickname: 'Listener' }
      },
      {
        code: 200,
        result: [{ song: createPlaylistTrack(200), id: 200 }]
      },
      {
        code: 200,
        data: {
          dailySongs: [{
            id: 300,
            name: 'Daily Song',
            ar: [{ id: 400, name: 'Daily Artist' }],
            al: { id: 500, name: 'Daily Album', picUrl: 'http://example.test/daily.jpg' },
            dt: 210000
          }]
        }
      }
    ]);
    const capability = createNeteaseProvider(runtime).capabilities!.recommendations!;

    const feed = await capability.getRecommendationHome();

    expect(feed.loggedIn).toBe(true);
    expect(feed.newSongs).toEqual([expect.objectContaining({
      id: 'netease:200',
      title: 'Track 200',
      sourceContext: {
        type: 'recommendation',
        providerId: 'netease'
      }
    })]);
    expect(feed.dailySongs).toEqual([expect.objectContaining({
      id: 'netease:300',
      platformSongId: '300',
      title: 'Daily Song',
      artist: 'Daily Artist',
      album: 'Daily Album',
      durationMs: 210000,
      coverUrl: 'https://example.test/daily.jpg',
      sourceContext: {
        type: 'recommendation',
        providerId: 'netease'
      }
    })]);
    expect(runtime.requestJson).toHaveBeenNthCalledWith(1, {
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_ACCOUNT_URL
    });
    expect(runtime.requestJson).toHaveBeenNthCalledWith(2, {
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_PERSONALIZED_NEW_SONGS_URL,
      method: 'POST',
      form: { limit: '12' }
    });
    expect(runtime.requestJson).toHaveBeenNthCalledWith(3, {
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_DAILY_RECOMMENDED_SONGS_URL,
      method: 'POST',
      form: {}
    });
  });

  it('accepts the historical recommendation response aliases used by the previous app', async () => {
    const runtime = createRuntime([{ name: 'MUSIC_U', value: 'authenticated' }], [
      { code: 200, profile: { userId: 42 } },
      { code: 200, data: [createPlaylistTrack(20)] },
      { code: 200, data: { recommend: [createPlaylistTrack(30)] } }
    ]);

    const feed = await createNeteaseProvider(runtime).capabilities!.recommendations!.getRecommendationHome();

    expect(feed.newSongs[0]).toMatchObject({
      id: 'netease:20',
      title: 'Track 20',
      sourceContext: {
        type: 'recommendation',
        providerId: 'netease'
      }
    });
    expect(feed.dailySongs[0]).toMatchObject({
      id: 'netease:30',
      title: 'Track 30',
      sourceContext: {
        type: 'recommendation',
        providerId: 'netease'
      }
    });
  });

  it('caches a recommendation feed until its ttl expires and refreshes it on demand', async () => {
    let now = 1_000;
    const runtime = createRuntime([], [
      { code: 200, result: [createPlaylistTrack(1)] },
      { code: 200, result: [createPlaylistTrack(2)] },
      { code: 200, result: [createPlaylistTrack(3)] }
    ]);
    const cache = createMemoryCacheStore({ now: () => now });
    const capability = createNeteaseProvider(runtime, cache).capabilities!.recommendations!;

    const first = await capability.getRecommendationHome();
    const cached = await capability.getRecommendationHome();
    now += CACHE_TTL_MS.recommendationHome + 1;
    const expired = await capability.getRecommendationHome();
    const refreshed = await capability.getRecommendationHome({ forceRefresh: true });

    expect(first.newSongs[0].title).toBe('Track 1');
    expect(cached.newSongs[0].title).toBe('Track 1');
    expect(expired.newSongs[0].title).toBe('Track 2');
    expect(refreshed.newSongs[0].title).toBe('Track 3');
    expect(runtime.requestJson).toHaveBeenCalledTimes(3);
    expect(cache.get(CACHE_KEYS.recommendationHome('netease', false))).toEqual(refreshed);
    expect(CACHE_KEYS.recommendationHome('netease', false)).toContain('recommendation-home:v3:');
  });

  it('keeps personalized new songs when the authenticated daily-song module fails', async () => {
    const runtime = createRuntime([{ name: 'MUSIC_U', value: 'authenticated' }], [
      { code: 200, profile: { userId: 42 } },
      { code: 200, result: [createPlaylistTrack(1)] },
      { code: 500 }
    ]);
    const cache = createMemoryCacheStore();
    const capability = createNeteaseProvider(runtime, cache).capabilities!.recommendations!;

    const feed = await capability.getRecommendationHome();

    expect(feed.dailySongs).toEqual([]);
    expect(feed.newSongs[0].title).toBe('Track 1');
    expect(feed.moduleResults).toEqual({
      daily: { status: 'rejected', errorMessage: '网易云每日推荐加载失败' },
      new: { status: 'fulfilled', errorMessage: null }
    });
    expect(cache.get(CACHE_KEYS.recommendationHome('netease', true))).toEqual(feed);
  });

  it('keeps daily songs when the public new-song module fails', async () => {
    const runtime = createRuntime([{ name: 'MUSIC_U', value: 'authenticated' }], [
      { code: 200, profile: { userId: 42 } },
      { code: 500 },
      { code: 200, data: { dailySongs: [createPlaylistTrack(2)] } }
    ]);

    const feed = await createNeteaseProvider(runtime).capabilities!.recommendations!.getRecommendationHome();

    expect(feed.newSongs).toEqual([]);
    expect(feed.dailySongs[0].title).toBe('Track 2');
    expect(feed.moduleResults).toEqual({
      daily: { status: 'fulfilled', errorMessage: null },
      new: { status: 'rejected', errorMessage: '网易云最新音乐加载失败' }
    });
  });

  it('does not cache a recommendation feed when every song module fails', async () => {
    const runtime = createRuntime([{ name: 'MUSIC_U', value: 'authenticated' }], [
      { code: 200, profile: { userId: 42 } },
      { code: 500 },
      { code: 500 }
    ]);
    const cache = createMemoryCacheStore();
    const capability = createNeteaseProvider(runtime, cache).capabilities!.recommendations!;

    await expect(capability.getRecommendationHome()).rejects.toThrow('网易云推荐歌曲请求全部失败');
    expect(cache.get(CACHE_KEYS.recommendationHome('netease', true))).toBeNull();
    expect(runtime.requestJson).toHaveBeenCalledTimes(3);
  });

  it('keeps the verified similar-song fixture allow-listed and fully synthetic', () => {
    const fixture = readSimilarSongsFixture();
    const serialized = JSON.stringify(fixture);

    expect(Object.keys(fixture)).toEqual(['code', 'songs']);
    expect(fixture.songs.length).toBeGreaterThan(0);
    expect(fixture.songs.every((song) => (
      Object.keys(song).join(',') === 'id,name,artists,album,duration'
      && song.artists.every((artist) => Object.keys(artist).join(',') === 'id,name')
      && Object.keys(song.album).join(',') === 'id,name,picUrl'
      && new URL(song.album.picUrl).hostname === 'fixture.invalid'
    ))).toBe(true);
    expect(serialized).not.toMatch(/cookie|token|csrf|uid|userId|nickname|mp3Url|recommendReason|privilege|starred/i);
  });

  it('maps the verified top-level songs response as an independent recommendation capability', async () => {
    const fixture = readSimilarSongsFixture();
    const runtime = createRuntime([], [fixture]);
    const capability = getSimilarSongsCapability(runtime);

    const songs = await capability.getSimilarSongs(mutationSong);

    expect(songs).toEqual([
      expect.objectContaining({
        id: 'netease:910001',
        providerId: 'netease',
        platformSongId: '910001',
        title: 'Fixture Similar Song One',
        artist: 'Fixture Artist One',
        album: 'Fixture Album One',
        durationMs: 201000,
        coverUrl: 'https://fixture.invalid/netease/similar-1.jpg',
        sourceContext: { type: 'recommendation', providerId: 'netease' }
      }),
      expect.objectContaining({
        id: 'netease:910002',
        title: 'Fixture Similar Song Two',
        artist: 'Fixture Artist Two / Fixture Artist Three',
        sourceContext: { type: 'recommendation', providerId: 'netease' }
      })
    ]);
    expect(runtime.getCookies).not.toHaveBeenCalled();
    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: 'https://music.163.com/api/v1/discovery/simiSong',
      method: 'POST',
      form: {
        songid: '42',
        limit: '50',
        offset: '0'
      },
      crypto: 'weapi',
      credentials: 'omit'
    });
  });

  it.each([
    { code: 200 },
    { code: 200, songs: {} },
    { code: 200, data: { songs: readSimilarSongsFixture().songs } }
  ])('rejects an unverified similar-song response path %#', async (response) => {
    const runtime = createRuntime([], [response]);
    const capability = getSimilarSongsCapability(runtime);

    await expect(capability.getSimilarSongs(mutationSong)).rejects.toThrow('网易云相似歌曲响应结构异常');
  });

  it('rejects malformed similar-song tracks instead of guessing aliases', async () => {
    const runtime = createRuntime([], [{
      code: 200,
      songs: [{
        id: 1,
        name: 'Incomplete Track',
        artists: [],
        duration: 120000
      }]
    }]);
    const capability = getSimilarSongsCapability(runtime);

    await expect(capability.getSimilarSongs(mutationSong)).rejects.toThrow('网易云相似歌曲响应结构异常');
  });

  it('does not cache a failed similar-song business response', async () => {
    const runtime = createRuntime([], [
      { code: 500, songs: [] },
      readSimilarSongsFixture()
    ]);
    const cache = createMemoryCacheStore();
    const capability = getSimilarSongsCapability(runtime, cache);

    await expect(capability.getSimilarSongs(mutationSong)).rejects.toThrow('网易云相似歌曲请求失败');
    const recovered = await capability.getSimilarSongs(mutationSong);

    expect(recovered).toHaveLength(2);
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
    expect(cache.get(CACHE_KEYS.similarSongs('netease', '42'))).toEqual(recovered);
  });

  it('caches similar songs per seed and supports expiry and force refresh', async () => {
    let now = 1_000;
    const fixture = readSimilarSongsFixture();
    const secondResponse = structuredClone(fixture);
    secondResponse.songs[0].name = 'Fixture Similar Song Refreshed';
    const thirdResponse = structuredClone(fixture);
    thirdResponse.songs[0].name = 'Fixture Similar Song Forced';
    const runtime = createRuntime([], [fixture, secondResponse, thirdResponse]);
    const cache = createMemoryCacheStore({ now: () => now });
    const capability = getSimilarSongsCapability(runtime, cache);

    const first = await capability.getSimilarSongs(mutationSong);
    const cached = await capability.getSimilarSongs(mutationSong);
    now += CACHE_TTL_MS.similarSongs + 1;
    const expired = await capability.getSimilarSongs(mutationSong);
    const refreshed = await capability.getSimilarSongs(mutationSong, { forceRefresh: true });

    expect(first[0].title).toBe('Fixture Similar Song One');
    expect(cached[0].title).toBe('Fixture Similar Song One');
    expect(expired[0].title).toBe('Fixture Similar Song Refreshed');
    expect(refreshed[0].title).toBe('Fixture Similar Song Forced');
    expect(runtime.requestJson).toHaveBeenCalledTimes(3);
  });

  it('isolates similar-song caches by seed song id', async () => {
    const firstResponse = readSimilarSongsFixture();
    const secondResponse = structuredClone(firstResponse);
    secondResponse.songs[0].name = 'Fixture Different Seed Song';
    const runtime = createRuntime([], [firstResponse, secondResponse]);
    const capability = getSimilarSongsCapability(runtime);
    const secondSeed = { ...mutationSong, id: 'netease:43', platformSongId: '43' };

    const first = await capability.getSimilarSongs(mutationSong);
    const second = await capability.getSimilarSongs(secondSeed);
    const firstCached = await capability.getSimilarSongs(mutationSong);

    expect(first[0].title).toBe('Fixture Similar Song One');
    expect(second[0].title).toBe('Fixture Different Seed Song');
    expect(firstCached[0].title).toBe('Fixture Similar Song One');
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('rejects a non-Netease similar-song seed before making a request', async () => {
    const runtime = createRuntime([], [readSimilarSongsFixture()]);
    const capability = getSimilarSongsCapability(runtime);
    const qqSeed: Song = { ...mutationSong, id: 'qq:42', providerId: 'qq' };

    await expect(capability.getSimilarSongs(qqSeed)).rejects.toThrow('网易云音乐歌曲 ID 无效');
    expect(runtime.requestJson).not.toHaveBeenCalled();
  });

  it.each(['', ' ', 'not-a-song-id', '0', '-1', '123456789012345678901'])('rejects invalid similar-song seed id %j before requesting', async (platformSongId) => {
    const runtime = createRuntime([], [readSimilarSongsFixture()]);
    const capability = getSimilarSongsCapability(runtime);
    const invalidSeed: Song = {
      ...mutationSong,
      id: `netease:${platformSongId}`,
      platformSongId
    };

    await expect(capability.getSimilarSongs(invalidSeed)).rejects.toThrow('网易云音乐歌曲 ID 无效');
    expect(runtime.requestJson).not.toHaveBeenCalled();
  });

  it('maps only verified homepage block song resources and omits every other resource type', async () => {
    const runtime = createRuntime([], [readHomepageBlocksFixture()]);
    const capability = getHomepageBlocksCapability(runtime);

    const feed = await capability.getHomepageBlocks();

    expect(feed).toEqual({
      providerId: 'netease',
      blocks: [{
        kind: 'song',
        id: 'netease:homepage-block:songs',
        title: '多元旋律之旅',
        songs: [
          expect.objectContaining({
            id: 'netease:920001',
            providerId: 'netease',
            platformSongId: '920001',
            title: 'Fixture Homepage Song One',
            artist: 'Fixture Homepage Artist One',
            album: 'Fixture Homepage Album One',
            durationMs: 201000,
            coverUrl: 'https://fixture.invalid/netease/homepage-song-1.jpg',
            sourceContext: { type: 'recommendation', providerId: 'netease' }
          }),
          expect.objectContaining({
            id: 'netease:920002',
            title: 'Fixture Homepage Song Two',
            artist: 'Fixture Homepage Artist Two / Fixture Homepage Artist Three'
          })
        ]
      }]
    });
    expect(runtime.getCookies).not.toHaveBeenCalled();
    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_HOMEPAGE_BLOCKS_URL,
      method: 'POST',
      form: { refresh: 'false' },
      crypto: 'weapi',
      credentials: 'omit'
    });
  });

  it.each([
    { code: 200 },
    { code: 200, data: {} },
    { code: 200, data: { blocks: {} } },
    { code: 500, data: { blocks: [] } }
  ])('rejects an invalid homepage block response path %#', async (response) => {
    const runtime = createRuntime([], [response]);
    const capability = getHomepageBlocksCapability(runtime);

    await expect(capability.getHomepageBlocks()).rejects.toThrow('网易云首页 block 响应结构异常');
  });

  it('filters playlist, chart, topic, malformed, and unknown homepage resources without a fallback', async () => {
    const runtime = createRuntime([], [{
      code: 200,
      data: {
        blocks: [{
          creatives: [{
            resources: [
              { resourceType: 'playlist' },
              { resourceType: 'chart' },
              { resourceType: 'topic', resourceExtInfo: {} },
              { resourceType: 'radio' },
              { resourceType: 'song', resourceExtInfo: {} },
              null
            ]
          }]
        }]
      }
    }]);
    const capability = getHomepageBlocksCapability(runtime);

    await expect(capability.getHomepageBlocks()).resolves.toEqual({
      providerId: 'netease',
      blocks: []
    });
  });

  it('caps mapped homepage block songs at twelve before a playback command can receive them', async () => {
    const resources = Array.from({ length: 13 }, (_, index) => ({
      resourceType: 'song',
      resourceExtInfo: {
        songData: {
          id: 930000 + index,
          name: `Fixture Capped Homepage Song ${index + 1}`,
          artists: [{ id: 931000 + index, name: `Fixture Capped Artist ${index + 1}` }],
          album: {
            id: 932000 + index,
            name: `Fixture Capped Album ${index + 1}`,
            picUrl: `https://fixture.invalid/netease/homepage-capped-${index + 1}.jpg`
          },
          duration: 180000 + index
        }
      }
    }));
    const runtime = createRuntime([], [{
      code: 200,
      data: { blocks: [{ creatives: [{ resources }] }] }
    }]);
    const capability = getHomepageBlocksCapability(runtime);

    const feed = await capability.getHomepageBlocks();

    expect(feed.blocks[0]?.songs).toHaveLength(12);
    expect(feed.blocks[0]?.songs.at(-1)?.title).toBe('Fixture Capped Homepage Song 12');
  });

  it('does not cache failed homepage block responses and refreshes the dedicated cache key', async () => {
    const first = readHomepageBlocksFixture();
    const refreshed = structuredClone(first);
    const refreshedSong = (refreshed.data.blocks[0] as {
      creatives: Array<{
        resources: Array<{
          resourceExtInfo?: { songData?: { name?: string } };
        }>;
      }>;
    }).creatives[0].resources[0].resourceExtInfo?.songData;
    if (refreshedSong) {
      refreshedSong.name = 'Fixture Homepage Song Refreshed';
    }
    const runtime = createRuntime([], [
      { code: 500, data: { blocks: [] } },
      first,
      refreshed
    ]);
    const cache = createMemoryCacheStore();
    const capability = getHomepageBlocksCapability(runtime, cache);

    await expect(capability.getHomepageBlocks()).rejects.toThrow('网易云首页 block 响应结构异常');
    const loaded = await capability.getHomepageBlocks();
    const cached = await capability.getHomepageBlocks();
    const forceRefreshed = await capability.getHomepageBlocks({ forceRefresh: true });

    expect(loaded.blocks[0]?.songs[0]?.title).toBe('Fixture Homepage Song One');
    expect(cached.blocks[0]?.songs[0]?.title).toBe('Fixture Homepage Song One');
    expect(forceRefreshed.blocks[0]?.songs[0]?.title).toBe('Fixture Homepage Song Refreshed');
    expect(runtime.requestJson).toHaveBeenCalledTimes(3);
  });

  it('maps anonymous playlist categories while preserving native groups', async () => {
    const runtime = createRuntime([], [{
      code: 200,
      all: { name: '全部' },
      categories: {
        0: '语种',
        1: '风格'
      },
      sub: [
        { name: '华语', category: 0, hot: true },
        { name: '摇滚', category: 1, hot: false },
        { name: '', category: 1, hot: true }
      ]
    }]);
    const capability = createNeteaseProvider(runtime).capabilities?.playlistDiscovery;

    expect(capability).toBeDefined();
    const categories = await capability!.getPlaylistCategories();

    expect(categories).toEqual([
      { id: 'all', providerId: 'netease', name: '全部' },
      { id: '华语', providerId: 'netease', name: '华语', group: '语种', hot: true },
      { id: '摇滚', providerId: 'netease', name: '摇滚', group: '风格', hot: false }
    ]);
    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: 'https://music.163.com/api/playlist/catalogue'
    });
  });

  it('rejects failed playlist category responses without caching them', async () => {
    const runtime = createRuntime([], [
      { code: 500 },
      { code: 200, all: { name: '全部' }, sub: [] }
    ]);
    const capability = createNeteaseProvider(runtime, createMemoryCacheStore()).capabilities!.playlistDiscovery!;

    await expect(capability.getPlaylistCategories()).rejects.toThrow('网易云歌单分类请求失败');
    await expect(capability.getPlaylistCategories()).resolves.toEqual([
      { id: 'all', providerId: 'netease', name: '全部' }
    ]);
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('maps an anonymous playlist discovery page into provider-scoped summaries', async () => {
    const runtime = createRuntime([], [{
      code: 200,
      total: 41,
      more: true,
      playlists: [{
        id: 6688,
        name: '华语流行精选',
        description: '公开歌单',
        coverImgUrl: 'http://example.test/netease-playlist.jpg',
        creator: { nickname: '歌单作者' },
        playCount: 123456,
        trackCount: 36
      }]
    }]);
    const capability = createNeteaseProvider(runtime).capabilities!.playlistDiscovery!;

    const page = await capability.getDiscoveredPlaylists({ categoryId: '华语', limit: 20, offset: 20 });

    expect(page).toEqual({
      providerId: 'netease',
      categoryId: '华语',
      playlists: [{
        id: 'netease:6688',
        providerId: 'netease',
        platformPlaylistId: '6688',
        title: '华语流行精选',
        description: '公开歌单',
        songIds: [],
        coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
        coverUrl: 'https://example.test/netease-playlist.jpg',
        sourceLabel: '网易云',
        creatorName: '歌单作者',
        playCount: 123456,
        trackCount: 36
      }],
      offset: 20,
      limit: 20,
      total: 41,
      hasMore: true
    });
    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: 'https://music.163.com/api/playlist/list?cat=%E5%8D%8E%E8%AF%AD&order=hot&limit=20&offset=20'
    });
  });

  it('upgrades only undersized discovery cover operations while preserving the image pipeline', async () => {
    const coverImgUrl = [
      'http://p1.music.126.net/cover.jpg',
      '?imageView=1',
      '&thumbnail=800y800',
      '&enlarge=1%7CimageView=1',
      '&watermark=cover-mark',
      '&thumbnail=140y140'
    ].join('');
    const runtime = createRuntime([], [{
      code: 200,
      playlists: [{ id: 6689, name: '高清歌单封面', coverImgUrl }]
    }]);
    const capability = createNeteaseProvider(runtime).capabilities!.playlistDiscovery!;

    const page = await capability.getDiscoveredPlaylists({ categoryId: 'ACG', limit: 20, offset: 0 });
    const normalizedCoverUrl = new URL(page.playlists[0].coverUrl ?? '');

    expect(normalizedCoverUrl.protocol).toBe('https:');
    expect(normalizedCoverUrl.searchParams.getAll('thumbnail')).toEqual(['800y800', '512y512']);
    expect(normalizedCoverUrl.searchParams.get('enlarge')).toBe('1|imageView=1');
    expect(normalizedCoverUrl.searchParams.get('watermark')).toBe('cover-mark');
    expect(page.playlists[0].coverUrl).toContain('enlarge=1%7CimageView=1');
  });

  it('rejects failed playlist discovery responses without caching them', async () => {
    const runtime = createRuntime([], [
      { code: 500 },
      { code: 200, total: 1, more: false, playlists: [{ id: 6688, name: 'Recovered Playlist' }] }
    ]);
    const capability = createNeteaseProvider(runtime, createMemoryCacheStore()).capabilities!.playlistDiscovery!;
    const query = { categoryId: 'all', limit: 30, offset: 0 };

    await expect(capability.getDiscoveredPlaylists(query)).rejects.toThrow('网易云歌单列表请求失败');
    await expect(capability.getDiscoveredPlaylists(query)).resolves.toMatchObject({
      playlists: [{ id: 'netease:6688', title: 'Recovered Playlist' }]
    });
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('uses the stable all category and refreshes cached discovery pages on demand', async () => {
    const runtime = createRuntime([], [
      { code: 200, total: 1, more: false, playlists: [{ id: 1, name: 'Cached Playlist' }] },
      { code: 200, total: 1, more: false, playlists: [{ id: 2, name: 'Fresh Playlist' }] }
    ]);
    const capability = createNeteaseProvider(runtime, createMemoryCacheStore()).capabilities!.playlistDiscovery!;

    const first = await capability.getDiscoveredPlaylists({ categoryId: 'all', limit: 30, offset: 0 });
    const cached = await capability.getDiscoveredPlaylists({ categoryId: 'all', limit: 30, offset: 0 });
    const refreshed = await capability.getDiscoveredPlaylists(
      { categoryId: 'all', limit: 30, offset: 0 },
      { forceRefresh: true }
    );

    expect(first.playlists[0].title).toBe('Cached Playlist');
    expect(cached.playlists[0].title).toBe('Cached Playlist');
    expect(refreshed.playlists[0].title).toBe('Fresh Playlist');
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
    expect(runtime.requestJson).toHaveBeenNthCalledWith(1, {
      partition: NETEASE_LOGIN_PARTITION,
      url: 'https://music.163.com/api/playlist/list?cat=%E5%85%A8%E9%83%A8&order=hot&limit=30&offset=0'
    });
  });

  it('invalidates every cached page in a category when refreshing discovery', async () => {
    const runtime = createRuntime([], [
      { code: 200, total: 60, more: true, playlists: [{ id: 1, name: 'Cached First Page' }] },
      { code: 200, total: 60, more: false, playlists: [{ id: 2, name: 'Cached Second Page' }] },
      { code: 200, total: 60, more: true, playlists: [{ id: 3, name: 'Fresh First Page' }] },
      { code: 200, total: 60, more: false, playlists: [{ id: 4, name: 'Fresh Second Page' }] }
    ]);
    const capability = createNeteaseProvider(runtime, createMemoryCacheStore()).capabilities!.playlistDiscovery!;
    const firstPageQuery = { categoryId: 'all', limit: 30, offset: 0 };
    const secondPageQuery = { categoryId: 'all', limit: 30, offset: 30 };

    await capability.getDiscoveredPlaylists(firstPageQuery);
    await capability.getDiscoveredPlaylists(secondPageQuery);
    await capability.getDiscoveredPlaylists(firstPageQuery, { forceRefresh: true });
    const refreshedSecondPage = await capability.getDiscoveredPlaylists(secondPageQuery);

    expect(refreshedSecondPage.playlists[0].title).toBe('Fresh Second Page');
    expect(runtime.requestJson).toHaveBeenCalledTimes(4);
  });

  it.each([
    { categoryId: '', limit: 30, offset: 0 },
    { categoryId: 'all', limit: 0, offset: 0 },
    { categoryId: 'all', limit: 51, offset: 0 },
    { categoryId: 'all', limit: 30, offset: -1 }
  ])('rejects invalid playlist discovery query %j before requesting the provider', async (query) => {
    const runtime = createRuntime([]);
    const capability = createNeteaseProvider(runtime).capabilities!.playlistDiscovery!;

    await expect(capability.getDiscoveredPlaylists(query)).rejects.toThrow('网易云歌单发现参数无效');
    expect(runtime.requestJson).not.toHaveBeenCalled();
  });

  it('maps an artist detail with hot songs and album summaries', async () => {
    const publishTime = Date.UTC(2003, 6, 31);
    const runtime = createRuntime([], [
      {
        code: 200,
        artist: {
          id: 6452,
          name: '周杰伦',
          alias: ['Jay Chou'],
          briefDesc: '华语创作歌手',
          picUrl: 'http://example.test/netease-artist.jpg',
          musicSize: 560,
          albumSize: 42
        },
        hotSongs: [{
          id: 42,
          name: '晴天',
          ar: [{ id: 6452, name: '周杰伦', picUrl: 'https://example.test/netease-artist.jpg' }],
          al: { id: 34720827, name: '叶惠美', picUrl: 'http://example.test/netease-album.jpg' },
          dt: 269000
        }]
      },
      {
        code: 200,
        hotAlbums: [{
          id: 34720827,
          name: '叶惠美',
          artist: { id: 6452, name: '周杰伦' },
          picUrl: 'http://example.test/netease-album.jpg',
          publishTime,
          size: 11,
          type: '专辑'
        }]
      }
    ]);
    const capability = createNeteaseProvider(runtime).capabilities?.artistCatalog;

    expect(capability).toBeDefined();
    if (!capability) {
      return;
    }

    const detail = await capability.getArtistDetail('netease:artist:6452');

    expect(detail).toEqual({
      id: 'netease:artist:6452',
      providerId: 'netease',
      platformArtistId: '6452',
      name: '周杰伦',
      aliases: ['Jay Chou'],
      description: '华语创作歌手',
      coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
      imageUrl: 'https://example.test/netease-artist.jpg',
      sourceLabel: '网易云',
      songCount: 560,
      albumCount: 42,
      topSongs: [expect.objectContaining({
        id: 'netease:42',
        title: '晴天',
        artists: [{
          id: 'netease:artist:6452',
          providerId: 'netease',
          platformArtistId: '6452',
          name: '周杰伦'
        }],
        albumRef: {
          id: 'netease:album:34720827',
          providerId: 'netease',
          platformAlbumId: '34720827',
          title: '叶惠美'
        },
        sourceContext: {
          type: 'artist',
          providerId: 'netease',
          artistId: 'netease:artist:6452',
          artistName: '周杰伦'
        }
      })],
      albums: [{
        id: 'netease:album:34720827',
        providerId: 'netease',
        platformAlbumId: '34720827',
        title: '叶惠美',
        artistName: '周杰伦',
        coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
        coverUrl: 'https://example.test/netease-album.jpg',
        releaseDate: '2003-07-31',
        trackCount: 11,
        albumType: '专辑',
        sourceLabel: '网易云'
      }]
    });
    expect(runtime.requestJson).toHaveBeenNthCalledWith(1, {
      partition: NETEASE_LOGIN_PARTITION,
      url: 'https://music.163.com/api/v1/artist/6452'
    });
    expect(runtime.requestJson).toHaveBeenNthCalledWith(2, {
      partition: NETEASE_LOGIN_PARTITION,
      url: 'https://music.163.com/api/artist/albums/6452?offset=0&limit=50'
    });
  });

  it('maps an album detail and binds its songs to the album source', async () => {
    const runtime = createRuntime([], [{
      code: 200,
      album: {
        id: 34720827,
        name: '叶惠美',
        description: '录音室专辑',
        artist: { id: 6452, name: '周杰伦' },
        artists: [{ id: 6452, name: '周杰伦' }],
        picUrl: 'http://example.test/netease-album.jpg',
        publishTime: Date.UTC(2003, 6, 31),
        size: 11,
        type: '专辑'
      },
      songs: [{
        id: 42,
        name: '晴天',
        ar: [{ id: 6452, name: '周杰伦' }],
        al: { id: 34720827, name: '叶惠美', picUrl: 'http://example.test/netease-album.jpg' },
        dt: 269000
      }]
    }]);
    const capability = createNeteaseProvider(runtime).capabilities?.artistCatalog;

    expect(capability).toBeDefined();
    if (!capability) {
      return;
    }

    const detail = await capability.getAlbumDetail('netease:album:34720827');

    expect(detail).toMatchObject({
      id: 'netease:album:34720827',
      providerId: 'netease',
      platformAlbumId: '34720827',
      title: '叶惠美',
      artistName: '周杰伦',
      description: '录音室专辑',
      coverUrl: 'https://example.test/netease-album.jpg',
      releaseDate: '2003-07-31',
      trackCount: 11,
      artists: [{
        id: 'netease:artist:6452',
        providerId: 'netease',
        platformArtistId: '6452',
        name: '周杰伦'
      }],
      tracks: [expect.objectContaining({
        id: 'netease:42',
        sourceContext: {
          type: 'album',
          providerId: 'netease',
          albumId: 'netease:album:34720827',
          albumTitle: '叶惠美'
        }
      })]
    });
    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: 'https://music.163.com/api/v1/album/34720827'
    });
  });

  it('rejects non-positive artist and album ids before requesting the provider', async () => {
    const runtime = createRuntime([]);
    const capability = createNeteaseProvider(runtime).capabilities!.artistCatalog!;

    await expect(capability.getArtistDetail('netease:artist:0')).rejects.toThrow('网易云歌手 ID 无效');
    await expect(capability.getAlbumDetail('netease:album:0')).rejects.toThrow('网易云专辑 ID 无效');
    expect(runtime.requestJson).not.toHaveBeenCalled();
  });

  it('does not cache an artist aggregate when its album request fails', async () => {
    const runtime = createRuntime([], [
      { code: 200, artist: { id: 6452, name: '周杰伦' }, hotSongs: [] },
      { code: 500 },
      { code: 200, artist: { id: 6452, name: '周杰伦' }, hotSongs: [] },
      { code: 200, hotAlbums: [] }
    ]);
    const capability = createNeteaseProvider(runtime, createMemoryCacheStore()).capabilities!.artistCatalog!;

    await expect(capability.getArtistDetail('netease:artist:6452')).rejects.toThrow('网易云歌手专辑请求失败');
    await expect(capability.getArtistDetail('netease:artist:6452')).resolves.toMatchObject({
      id: 'netease:artist:6452',
      name: '周杰伦'
    });
    expect(runtime.requestJson).toHaveBeenCalledTimes(4);
  });

  it('does not cache a failed album detail response', async () => {
    const runtime = createRuntime([], [
      { code: 500 },
      {
        code: 200,
        album: {
          id: 34720827,
          name: '叶惠美',
          artist: { id: 6452, name: '周杰伦' },
          artists: [{ id: 6452, name: '周杰伦' }]
        },
        songs: []
      }
    ]);
    const capability = createNeteaseProvider(runtime, createMemoryCacheStore()).capabilities!.artistCatalog!;

    await expect(capability.getAlbumDetail('netease:album:34720827')).rejects.toThrow('网易云专辑详情请求失败');
    await expect(capability.getAlbumDetail('netease:album:34720827')).resolves.toMatchObject({
      id: 'netease:album:34720827',
      title: '叶惠美'
    });
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('caches artist and album details until each entity is force-refreshed', async () => {
    const runtime = createRuntime([], [
      { code: 200, artist: { id: 6452, name: '周杰伦', briefDesc: '初始歌手资料' }, hotSongs: [] },
      { code: 200, hotAlbums: [] },
      { code: 200, artist: { id: 6452, name: '周杰伦', briefDesc: '刷新后的歌手资料' }, hotSongs: [] },
      { code: 200, hotAlbums: [] },
      {
        code: 200,
        album: {
          id: 34720827,
          name: '叶惠美',
          description: '初始专辑资料',
          artist: { id: 6452, name: '周杰伦' },
          artists: [{ id: 6452, name: '周杰伦' }]
        },
        songs: []
      },
      {
        code: 200,
        album: {
          id: 34720827,
          name: '叶惠美',
          description: '刷新后的专辑资料',
          artist: { id: 6452, name: '周杰伦' },
          artists: [{ id: 6452, name: '周杰伦' }]
        },
        songs: []
      }
    ]);
    const capability = createNeteaseProvider(runtime, createMemoryCacheStore()).capabilities!.artistCatalog!;

    const artist = await capability.getArtistDetail('netease:artist:6452');
    const cachedArtist = await capability.getArtistDetail('netease:artist:6452');
    const refreshedArtist = await capability.getArtistDetail('netease:artist:6452', { forceRefresh: true });
    const album = await capability.getAlbumDetail('netease:album:34720827');
    const cachedAlbum = await capability.getAlbumDetail('netease:album:34720827');
    const refreshedAlbum = await capability.getAlbumDetail('netease:album:34720827', { forceRefresh: true });

    expect([artist.description, cachedArtist.description, refreshedArtist.description]).toEqual([
      '初始歌手资料',
      '初始歌手资料',
      '刷新后的歌手资料'
    ]);
    expect([album.description, cachedAlbum.description, refreshedAlbum.description]).toEqual([
      '初始专辑资料',
      '初始专辑资料',
      '刷新后的专辑资料'
    ]);
    expect(runtime.requestJson).toHaveBeenCalledTimes(6);
  });

  it('maps the anonymous toplist directory into chart summaries', async () => {
    const updateTime = 1_710_000_000_000;
    const runtime = createRuntime([], [{
      code: 200,
      list: [{
        id: 19723756,
        name: '飙升榜',
        description: '网易云音乐中每天热度上升最快的歌曲',
        coverImgUrl: 'https://example.test/netease-chart.jpg',
        updateTime,
        updateFrequency: '每日更新',
        tracks: []
      }]
    }]);
    const provider = createNeteaseProvider(runtime);
    const capability = provider.capabilities?.charts;

    expect(capability).toBeDefined();
    const charts = await capability!.getCharts();

    expect(charts).toEqual([{
      id: 'netease:chart:19723756',
      providerId: 'netease',
      platformChartId: '19723756',
      title: '飙升榜',
      description: '网易云音乐中每天热度上升最快的歌曲',
      songIds: [],
      coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
      coverUrl: 'https://example.test/netease-chart.jpg',
      sourceLabel: '网易云',
      updatedAt: new Date(updateTime).toISOString(),
      updateLabel: '每日更新'
    }]);
    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: 'https://music.163.com/api/toplist/detail'
    });
  });

  it('maps toplist detail tracks with the chart source identity', async () => {
    const runtime = createRuntime([], [{
      code: 200,
      playlist: {
        id: 19723756,
        name: '飙升榜',
        tracks: [{
          id: 3397873333,
          name: '艾比还是哭了（Acoustic）',
          ar: [{ id: 36393147, name: 'ABH！' }],
          al: { id: 377322371, name: '艾比还是哭了', picUrl: 'https://example.test/netease-song.jpg' },
          dt: 134086
        }]
      }
    }]);
    const provider = createNeteaseProvider(runtime);
    const capability = provider.capabilities!.charts!;

    const tracks = await capability.getChartTracks('netease:chart:19723756');

    expect(tracks).toEqual([{
      id: 'netease:3397873333',
      providerId: 'netease',
      platformSongId: '3397873333',
      title: '艾比还是哭了（Acoustic）',
      artist: 'ABH！',
      album: '艾比还是哭了',
      artists: [{
        id: 'netease:artist:36393147',
        providerId: 'netease',
        platformArtistId: '36393147',
        name: 'ABH！'
      }],
      albumRef: {
        id: 'netease:album:377322371',
        providerId: 'netease',
        platformAlbumId: '377322371',
        title: '艾比还是哭了'
      },
      durationMs: 134086,
      coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
      coverUrl: 'https://example.test/netease-song.jpg',
      sourceContext: {
        type: 'playlist',
        providerId: 'netease',
        playlistId: 'netease:chart:19723756',
        playlistTitle: '飙升榜'
      }
    }]);
    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: 'https://music.163.com/api/v6/playlist/detail?id=19723756&n=1000'
    });
  });

  it('uses timeout and provider error helpers in the Electron runtime', () => {
    const source = readFileSync(resolve(process.cwd(), 'electron/providers/neteaseProvider.cts'), 'utf8');

    expect(source).toContain('AbortController');
    expect(source).toContain('PROVIDER_REQUEST_TIMEOUT_MS');
    expect(source).toContain("createProviderTimeoutError('网易云音乐')");
    expect(source).toContain("createProviderRequestError('网易云音乐'");
    expect(source).toContain("credentials = 'include'");
    expect(source).toContain('loginSession.fetch(fetchUrl, { ...init, credentials })');
    expect(source).toContain("'User-Agent': NETEASE_WEAPI_USER_AGENT");
    expect(source).not.toContain('Cookie: cookieHeader');
    expect(source).not.toContain('createCookieHeader');
    expect(source).not.toContain('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
  });

  it('maximizes the Electron login window before loading the official login page', () => {
    const source = readFileSync(resolve(process.cwd(), 'electron/providers/neteaseProvider.cts'), 'utf8');

    expect(source).toContain('loginWindow.maximize();');
    expect(source.indexOf('loginWindow.maximize();')).toBeLessThan(source.indexOf('await loginWindow.loadURL(url);'));
  });

  it('creates the Electron login window hidden and shows it maximized when ready', () => {
    const source = readFileSync(resolve(process.cwd(), 'electron/providers/neteaseProvider.cts'), 'utf8');

    expect(source).toContain('show: false');
    expect(source).toContain('getDisplayNearestPoint(electron.screen.getCursorScreenPoint()).workAreaSize');
    expect(source).toContain("loginWindow.once('ready-to-show'");
    expect(source).toContain('loginWindow.show();');
    expect(source).toContain('loginWindow.focus();');
  });

  it('reuses the active Electron login window instead of opening duplicates', () => {
    const source = readFileSync(resolve(process.cwd(), 'electron/providers/neteaseProvider.cts'), 'utf8');

    expect(source).toContain('let activeLoginWindow');
    expect(source).toContain('activeLoginWindow && !activeLoginWindow.isDestroyed()');
    expect(source).toContain('showMaximizedLoginWindow(activeLoginWindow)');
    expect(source).toContain('return activeLoginWindowClosed');
    expect(source).toContain('activeLoginWindow = null');
  });

  it('opens official login in an isolated session partition before reading status', async () => {
    const runtime = createRuntime([{ name: 'MUSIC_U', value: 'sensitive-token' }], [{ code: 200, profile: { userId: 10086 } }]);
    const provider = createNeteaseProvider(runtime);

    const status = await provider.login();

    expect(runtime.openLoginWindow).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_LOGIN_URL
    });
    expect(status).toMatchObject({
      providerId: 'netease',
      loggedIn: true,
      playbackReady: true
    });
    expect(JSON.stringify(status)).not.toContain('sensitive-token');
  });

  it('reports logged out status when auth cookies are absent', async () => {
    const runtime = createRuntime([{ name: '__csrf', value: 'csrf-value' }]);
    const provider = createNeteaseProvider(runtime);

    const status = await provider.getLoginStatus();

    expect(status).toEqual({
      providerId: 'netease',
      loggedIn: false,
      playbackReady: false,
      stale: false,
      message: '网易云音乐未登录'
    });
    expect(JSON.stringify(status)).not.toContain('csrf-value');
  });

  it('hydrates logged-in status from the account endpoint without exposing cookies', async () => {
    const runtime = createRuntime(
      [{ name: 'MUSIC_U', value: 'sensitive-token' }],
      [
        {
          code: 200,
          profile: {
            userId: 10086,
            nickname: '网易云用户',
            avatarUrl: 'https://p1.music.126.net/avatar.jpg',
            vipType: 11
          }
        }
      ]
    );
    const provider = createNeteaseProvider(runtime);

    const status = await provider.getLoginStatus();

    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_ACCOUNT_URL
    });
    expect(status).toMatchObject({
      providerId: 'netease',
      loggedIn: true,
      userId: '10086',
      nickname: '网易云用户',
      avatarUrl: 'https://p1.music.126.net/avatar.jpg',
      vipLabel: 'VIP',
      playbackReady: true
    });
    expect(JSON.stringify(status)).not.toContain('sensitive-token');
  });

  it('caches login status summaries without storing sensitive cookies', async () => {
    const cache = createMemoryCacheStore();
    const runtime = createRuntime(
      [{ name: 'MUSIC_U', value: 'sensitive-token' }],
      [
        {
          code: 200,
          profile: {
            userId: 10086,
            nickname: '网易云用户'
          }
        }
      ]
    );
    const provider = createNeteaseProvider(runtime, cache);

    const first = await provider.getLoginStatus();
    const second = await provider.getLoginStatus();

    expect(first).toEqual(second);
    expect(runtime.requestJson).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(cache.get(CACHE_KEYS.loginStatus('netease')))).not.toContain('sensitive-token');
  });

  it('maps user playlists to provider-scoped playlist models', async () => {
    const runtime = createRuntime(
      [{ name: 'MUSIC_U', value: 'sensitive-token' }],
      [
        { code: 200, profile: { userId: 10086, nickname: '网易云用户' } },
        {
          code: 200,
          playlist: [
            {
              id: 6688,
              name: '我喜欢的音乐',
              description: '私人收藏',
              coverImgUrl: 'https://p1.music.126.net/cover.jpg'
            }
          ]
        }
      ]
    );
    const provider = createNeteaseProvider(runtime);

    const playlists = await provider.getUserPlaylists();

    expect(playlists).toEqual([
      {
        id: 'netease:6688',
        providerId: 'netease',
        title: '我喜欢的音乐',
        description: '私人收藏',
        songIds: [],
        coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
        coverUrl: 'https://p1.music.126.net/cover.jpg',
        ownership: 'subscribed',
        sourceLabel: '网易云'
      }
    ]);
  });

  it('marks only the official owned liked playlist from Netease playlist metadata', async () => {
    const runtime = createRuntime(
      [{ name: 'MUSIC_U', value: 'sensitive-token' }],
      [
        { code: 200, profile: { userId: 10086, nickname: '网易云用户' } },
        {
          code: 200,
          playlist: [
            {
              id: 6688,
              name: '网易云用户喜欢的音乐',
              description: '官方喜欢歌单',
              coverImgUrl: 'https://p1.music.126.net/liked.jpg',
              specialType: 5,
              userId: 10086,
              creator: { userId: 10086 }
            },
            {
              id: 7788,
              name: '我喜欢的音乐',
              description: '用户自建同名歌单',
              coverImgUrl: 'https://p1.music.126.net/manual.jpg',
              specialType: 0,
              userId: 10086,
              creator: { userId: 10086 }
            },
            {
              id: 8899,
              name: '别人喜欢的音乐',
              description: '订阅的他人特殊歌单',
              coverImgUrl: 'https://p1.music.126.net/other-liked.jpg',
              specialType: 5,
              userId: 12345,
              creator: { userId: 12345 }
            }
          ]
        }
      ]
    );
    const provider = createNeteaseProvider(runtime);

    const playlists = await provider.getUserPlaylists();

    expect(playlists[0]).toMatchObject({
      id: 'netease:6688',
      title: '网易云用户喜欢的音乐',
      ownership: 'liked',
      isLiked: true
    });
    expect(playlists[1]).toMatchObject({
      id: 'netease:7788',
      ownership: 'created',
      title: '我喜欢的音乐'
    });
    expect(playlists[1]).not.toHaveProperty('isLiked');
    expect(playlists[2]).toMatchObject({
      id: 'netease:8899',
      ownership: 'subscribed',
      title: '别人喜欢的音乐'
    });
    expect(playlists[2]).not.toHaveProperty('isLiked');
  });

  it('maps playlist detail tracks with playlist source context', async () => {
    const runtime = createRuntime(
      [{ name: 'MUSIC_U', value: 'sensitive-token' }],
      [
        {
          code: 200,
          playlist: {
            id: 6688,
            name: '我喜欢的音乐',
            tracks: [
              {
                id: 42,
                name: '晴天',
                artists: [{ id: 6452, name: '周杰伦' }],
                album: { id: 34720827, name: '叶惠美', picUrl: 'https://p1.music.126.net/song.jpg' },
                duration: 269000
              }
            ]
          }
        }
      ]
    );
    const provider = createNeteaseProvider(runtime);

    const tracks = await provider.getPlaylistTracks('netease:6688');

    expect(tracks).toEqual([
      {
        id: 'netease:42',
        providerId: 'netease',
        platformSongId: '42',
        title: '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        artists: [{
          id: 'netease:artist:6452',
          providerId: 'netease',
          platformArtistId: '6452',
          name: '周杰伦'
        }],
        albumRef: {
          id: 'netease:album:34720827',
          providerId: 'netease',
          platformAlbumId: '34720827',
          title: '叶惠美'
        },
        durationMs: 269000,
        coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
        coverUrl: 'https://p1.music.126.net/song.jpg',
        sourceContext: {
          type: 'playlist',
          providerId: 'netease',
          playlistId: 'netease:6688',
          playlistTitle: '我喜欢的音乐'
        }
      }
    ]);
  });

  it('completes a 60-track playlist returned with only 10 tracks and caches the ordered result', async () => {
    const trackIds = Array.from({ length: 60 }, (_, index) => index + 1);
    const runtime = createRuntime([], [
      {
        code: 200,
        playlist: {
          id: 6688,
          name: 'Sixty Tracks',
          tracks: trackIds.slice(0, 10).map(createPlaylistTrack),
          trackIds: trackIds.map((id) => ({ id }))
        }
      },
      {
        code: 200,
        songs: trackIds.slice(10).reverse().map(createPlaylistTrack)
      }
    ]);
    const provider = createNeteaseProvider(runtime, createMemoryCacheStore());

    const tracks = await provider.getPlaylistTracks('netease:6688');
    const cachedTracks = await provider.getPlaylistTracks('netease:6688');

    expect(tracks.map((track) => track.platformSongId)).toEqual(trackIds.map(String));
    expect(cachedTracks).toEqual(tracks);
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
    const detailRequest = vi.mocked(runtime.requestJson).mock.calls[1][0];
    expect(new URL(detailRequest.url).searchParams.get('ids')).toBe(`[${trackIds.slice(10).join(',')}]`);
  });

  it('uses complete playlist tracks without another request and rebuilds their trackIds order', async () => {
    const runtime = createRuntime([], [{
      code: 200,
      playlist: {
        id: 6688,
        name: 'Complete Playlist',
        tracks: [1, 2, 3].map(createPlaylistTrack),
        trackIds: [3, 1, 2].map((id) => ({ id }))
      }
    }]);
    const provider = createNeteaseProvider(runtime);

    const tracks = await provider.getPlaylistTracks('netease:6688');

    expect(tracks.map((track) => track.platformSongId)).toEqual(['3', '1', '2']);
    expect(runtime.requestJson).toHaveBeenCalledTimes(1);
  });

  it('loads missing playlist tracks in song detail batches of at most 100', async () => {
    const trackIds = Array.from({ length: 205 }, (_, index) => index + 1);
    const runtime = createRuntime([], [
      {
        code: 200,
        playlist: {
          id: 6688,
          name: 'Large Playlist',
          tracks: [],
          trackIds: trackIds.map((id) => ({ id }))
        }
      },
      { code: 200, songs: trackIds.slice(0, 100).map(createPlaylistTrack) },
      { code: 200, songs: trackIds.slice(100, 200).map(createPlaylistTrack) },
      { code: 200, songs: trackIds.slice(200).map(createPlaylistTrack) }
    ]);
    const provider = createNeteaseProvider(runtime);

    const tracks = await provider.getPlaylistTracks('netease:6688');

    const requestedBatches = vi.mocked(runtime.requestJson).mock.calls.slice(1).map(([request]) => {
      const ids = new URL(request.url).searchParams.get('ids');
      return JSON.parse(ids ?? '[]') as number[];
    });
    expect(requestedBatches.map((batch) => batch.length)).toEqual([100, 100, 5]);
    expect(requestedBatches.flat()).toEqual(trackIds);
    expect(tracks.map((track) => track.platformSongId)).toEqual(trackIds.map(String));
  });

  it('keeps available playlist tracks when song detail omits individual ids', async () => {
    const runtime = createRuntime([], [
      {
        code: 200,
        playlist: {
          id: 6688,
          name: 'Partially Available Playlist',
          tracks: [createPlaylistTrack(1)],
          trackIds: [1, 2, 3, 4].map((id) => ({ id }))
        }
      },
      {
        code: 200,
        songs: [createPlaylistTrack(4), createPlaylistTrack(2)]
      }
    ]);
    const provider = createNeteaseProvider(runtime);

    const tracks = await provider.getPlaylistTracks('netease:6688');

    expect(tracks.map((track) => track.platformSongId)).toEqual(['1', '2', '4']);
  });

  it('does not cache playlist tracks when a song detail batch fails', async () => {
    const playlistResponse = {
      code: 200,
      playlist: {
        id: 6688,
        name: 'Retry Playlist',
        tracks: [createPlaylistTrack(1)],
        trackIds: [1, 2].map((id) => ({ id }))
      }
    };
    const runtime = createRuntime([], [
      playlistResponse,
      { code: 500 },
      playlistResponse,
      { code: 200, songs: [createPlaylistTrack(2)] }
    ]);
    const provider = createNeteaseProvider(runtime, createMemoryCacheStore());

    await expect(provider.getPlaylistTracks('netease:6688')).rejects.toThrow('网易云歌曲详情请求失败');
    const tracks = await provider.getPlaylistTracks('netease:6688');

    expect(tracks.map((track) => track.platformSongId)).toEqual(['1', '2']);
    expect(runtime.requestJson).toHaveBeenCalledTimes(4);
  });

  it('maps netease search results into provider songs', async () => {
    const provider = createNeteaseProvider(
      createRuntime([], [
        {
          result: {
            songs: [
              {
                id: 123,
                name: 'Search Song',
                duration: 201000,
                artists: [{ name: 'Artist A', img1v1Url: 'https://p1.music.126.net/artist.jpg' }],
                album: { name: 'Album A', picUrl: 'https://img.example/cover.jpg' }
              }
            ]
          }
        }
      ])
    );

    const songs = await provider.search('search');

    expect(songs).toEqual([
      expect.objectContaining({
        id: 'netease:123',
        providerId: 'netease',
        platformSongId: '123',
        title: 'Search Song',
        artist: 'Artist A',
        album: 'Album A',
        durationMs: 201000,
        coverUrl: 'https://img.example/cover.jpg',
        artistImageUrl: 'https://p1.music.126.net/artist.jpg'
      })
    ]);
    expect(songs[0].sourceContext).toBeUndefined();
  });

  it('uses Netease suggestions, hot search, and all four real entity search types', async () => {
    const runtime = createRuntime([], [
      {
        code: 200,
        result: {
          songs: [{ id: 1, name: 'Suggest Song', ar: [{ id: 10, name: 'Suggest Artist' }], al: { id: 100, name: 'Suggest Album' } }],
          artists: [{ id: 10, name: 'Suggest Artist', img1v1Url: 'https://example.test/artist.jpg', alias: ['Alias'] }],
          albums: [{ id: 100, name: 'Suggest Album', artist: { id: 10, name: 'Suggest Artist' }, picUrl: 'https://example.test/album.jpg' }],
          playlists: [{ id: 1000, name: 'Suggest Playlist', creator: { nickname: 'Creator' }, coverImgUrl: 'https://example.test/playlist.jpg' }]
        }
      },
      {
        code: 200,
        data: [{ searchWord: 'Hot Keyword', content: 'Hot Label', score: 999, iconUrl: 'http://example.test/hot.png' }]
      },
      {
        code: 200,
        result: {
          songCount: 1,
          songs: [{ id: 2, name: 'Search Song', dt: 180000, ar: [{ id: 20, name: 'Search Artist' }], al: { id: 200, name: 'Search Album', picUrl: 'https://example.test/search-album.jpg' } }]
        }
      },
      {
        code: 200,
        result: {
          artistCount: 1,
          artists: [{ id: 20, name: 'Search Artist', img1v1Url: 'https://example.test/search-artist.jpg', musicSize: 11, albumSize: 2 }]
        }
      },
      {
        code: 200,
        result: {
          albumCount: 1,
          albums: [{ id: 200, name: 'Search Album', artist: { id: 20, name: 'Search Artist' }, picUrl: 'https://example.test/search-album.jpg', size: 10 }]
        }
      },
      {
        code: 200,
        result: {
          playlistCount: 1,
          playlists: [{ id: 2000, name: 'Search Playlist', creator: { nickname: 'Creator' }, coverImgUrl: 'https://example.test/search-playlist.jpg', trackCount: 22 }]
        }
      }
    ]);
    const searchExperience = createNeteaseProvider(runtime).capabilities!.searchExperience!;

    await expect(searchExperience.getSuggestions('suggest')).resolves.toMatchObject([
      { providerId: 'netease', kind: 'song', keyword: 'Suggest Song', subtitle: 'Suggest Artist' },
      { providerId: 'netease', kind: 'artist', keyword: 'Suggest Artist', subtitle: 'Alias' },
      { providerId: 'netease', kind: 'album', keyword: 'Suggest Album', subtitle: 'Suggest Artist' },
      { providerId: 'netease', kind: 'playlist', keyword: 'Suggest Playlist', subtitle: 'Creator' }
    ]);
    await expect(searchExperience.getHotSearches()).resolves.toEqual([
      {
        id: 'netease:hot:Hot%20Keyword',
        providerId: 'netease',
        keyword: 'Hot Keyword',
        title: 'Hot Label',
        rank: 1,
        score: 999,
        iconUrl: 'https://example.test/hot.png'
      }
    ]);

    const results = await searchExperience.searchEntities('search', { limit: 10, offset: 0 });

    expect(results).toMatchObject({
      providerId: 'netease',
      keyword: 'search',
      sections: {
        songs: { available: true, total: 1, hasMore: false, errorMessage: null, items: [{ id: 'netease:2', title: 'Search Song' }] },
        artists: { available: true, total: 1, hasMore: false, errorMessage: null, items: [{ id: 'netease:artist:20', name: 'Search Artist', songCount: 11, albumCount: 2 }] },
        albums: { available: true, total: 1, hasMore: false, errorMessage: null, items: [{ id: 'netease:album:200', title: 'Search Album', trackCount: 10 }] },
        playlists: { available: true, total: 1, hasMore: false, errorMessage: null, items: [{ id: 'netease:2000', title: 'Search Playlist', trackCount: 22 }] }
      }
    });
    const requests = vi.mocked(runtime.requestJson).mock.calls.map(([request]) => request);
    expect(requests[0]?.url).toContain('/api/search/suggest/web');
    expect(requests[1]?.url).toContain('/api/search/hot/detail');
    expect(requests[2]?.url).toContain('type=1');
    expect(requests[3]?.url).toContain('type=100');
    expect(requests[4]?.url).toContain('type=10');
    expect(requests[5]?.url).toContain('type=1000');
  });

  it('interleaves Netease suggestion entity kinds before applying the result limit', async () => {
    const runtime = createRuntime([], [{
      code: 200,
      result: {
        songs: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `Suggest Song ${index}` })),
        artists: [{ id: 10, name: 'Suggest Artist' }],
        albums: [{ id: 100, name: 'Suggest Album', artist: { id: 10, name: 'Suggest Artist' } }],
        playlists: [{ id: 1000, name: 'Suggest Playlist', creator: { nickname: 'Creator' } }]
      }
    }]);
    const searchExperience = createNeteaseProvider(runtime).capabilities!.searchExperience!;

    await expect(searchExperience.getSuggestions('suggest', { limit: 5 })).resolves.toEqual([
      expect.objectContaining({ kind: 'song', keyword: 'Suggest Song 0' }),
      expect.objectContaining({ kind: 'artist', keyword: 'Suggest Artist' }),
      expect.objectContaining({ kind: 'album', keyword: 'Suggest Album' }),
      expect.objectContaining({ kind: 'playlist', keyword: 'Suggest Playlist' }),
      expect.objectContaining({ kind: 'song', keyword: 'Suggest Song 1' })
    ]);
  });

  it('returns a per-section Netease error without discarding fulfilled search entities', async () => {
    const runtime = createRuntime([], [
      { code: 200, result: { songCount: 0, songs: [] } },
      { code: 500 },
      { code: 200, result: { albumCount: 0, albums: [] } },
      { code: 200, result: { playlistCount: 0, playlists: [] } }
    ]);
    const searchExperience = createNeteaseProvider(runtime).capabilities!.searchExperience!;

    const results = await searchExperience.searchEntities('search');

    expect(results.sections.songs).toMatchObject({ available: true, errorMessage: null });
    expect(results.sections.artists).toMatchObject({
      available: true,
      items: [],
      total: 0,
      hasMore: false,
      errorMessage: '网易云音乐歌手搜索请求失败'
    });
    expect(results.sections.albums).toMatchObject({ available: true, errorMessage: null });
    expect(results.sections.playlists).toMatchObject({ available: true, errorMessage: null });
  });

  it('hydrates netease search artwork from song detail when search payload omits image fields', async () => {
    const runtime = createRuntime([], [
      {
        result: {
          songs: [
            {
              id: 123,
              name: 'Search Song',
              duration: 201000,
              artists: [{ name: 'Artist A' }],
              album: { name: 'Album A' }
            }
          ]
        }
      },
      {
        songs: [
          {
            id: 123,
            name: 'Search Song',
            dt: 201000,
            ar: [{ name: 'Artist A', img1v1Url: 'https://p1.music.126.net/artist.jpg' }],
            al: { name: 'Album A', picUrl: 'https://p1.music.126.net/detail-cover.jpg' }
          }
        ]
      }
    ]);
    const provider = createNeteaseProvider(runtime);

    const songs = await provider.search('search');

    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: expect.stringContaining('/api/song/detail')
    });
    expect(songs[0]).toMatchObject({
      coverUrl: 'https://p1.music.126.net/detail-cover.jpg',
      artistImageUrl: 'https://p1.music.126.net/artist.jpg'
    });
  });

  it('hydrates netease search artist artwork from artist search when song detail omits artist images', async () => {
    const runtime = createRuntime([], [
      {
        result: {
          songs: [
            {
              id: 123,
              name: 'Search Song',
              duration: 201000,
              artists: [{ name: 'Artist A' }],
              album: { name: 'Album A' }
            }
          ]
        }
      },
      {
        songs: [
          {
            id: 123,
            name: 'Search Song',
            dt: 201000,
            ar: [{ name: 'Artist A' }],
            al: { name: 'Album A', picUrl: 'https://p1.music.126.net/detail-cover.jpg' }
          }
        ]
      },
      {
        result: {
          artists: [
            {
              name: 'Artist A',
              img1v1Url: 'https://p1.music.126.net/artist.jpg'
            }
          ]
        }
      }
    ]);
    const provider = createNeteaseProvider(runtime);

    const songs = await provider.search('Artist A');

    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: expect.stringContaining('type=100')
    });
    expect(songs[0]).toMatchObject({
      coverUrl: 'https://p1.music.126.net/detail-cover.jpg',
      artistImageUrl: 'https://p1.music.126.net/artist.jpg'
    });
  });

  it('maps netease search album pic ids to artwork urls', async () => {
    const provider = createNeteaseProvider(
      createRuntime([], [
        {
          result: {
            songs: [
              {
                id: 123,
                name: 'Search Song',
                duration: 201000,
                artists: [{ name: 'Artist A' }],
                album: { name: 'Album A', picId: 109951169999999999 }
              }
            ]
          }
        }
      ])
    );

    const songs = await provider.search('search');

    expect(songs[0].coverUrl).toMatch(/^https:\/\/p1\.music\.126\.net\/[^/]+\/109951169999999999\.jpg$/);
  });

  it('caches netease search results by normalized keyword and paging', async () => {
    let now = 1_000;
    const cache = createMemoryCacheStore({ now: () => now });
    const runtime = createRuntime(
      [],
      [
        {
          result: {
            songs: [
              {
                id: 123,
                name: 'Cached Search Song',
                duration: 201000,
                artists: [{ name: 'Artist A' }],
                album: { name: 'Album A' }
              }
            ]
          }
        },
        {
          songs: [
            {
              id: 123,
              name: 'Cached Search Song',
              dt: 201000,
              ar: [{ name: 'Artist A', img1v1Url: 'https://p1.music.126.net/artist-a.jpg' }],
              al: { name: 'Album A' }
            }
          ]
        },
        {
          result: {
            songs: [
              {
                id: 124,
                name: 'Fresh Search Song',
                duration: 202000,
                artists: [{ name: 'Artist B' }],
                album: { name: 'Album B' }
              }
            ]
          }
        },
        {
          songs: [
            {
              id: 124,
              name: 'Fresh Search Song',
              dt: 202000,
              ar: [{ name: 'Artist B', img1v1Url: 'https://p1.music.126.net/artist-b.jpg' }],
              al: { name: 'Album B' }
            }
          ]
        }
      ]
    );
    const provider = createNeteaseProvider(runtime, cache);

    const first = await provider.search('  Search  ', { limit: 1, offset: 0 });
    const second = await provider.search('search', { limit: 1, offset: 0 });
    now += CACHE_TTL_MS.searchResults + 1;
    const third = await provider.search('search', { limit: 1, offset: 0 });

    expect(first[0].title).toBe('Cached Search Song');
    expect(second[0].title).toBe('Cached Search Song');
    expect(third[0].title).toBe('Fresh Search Song');
    expect(runtime.requestJson).toHaveBeenCalledTimes(4);
    expect(cache.get(CACHE_KEYS.searchResults('netease', 'search', 1, 0))).toEqual(third);
  });

  it('returns netease lyrics from the lyric endpoint', async () => {
    const runtime = createRuntime([], [{
      lrc: { lyric: '[00:01.00]First line\n' },
      tlyric: { lyric: '[00:01.00]第一句\n' }
    }]);
    const provider = createNeteaseProvider(runtime);

    const result = await provider.getLyrics({
      id: 'netease:42',
      providerId: 'netease',
      platformSongId: '42',
      title: 'Song with lyrics',
      artist: 'Artist',
      album: 'Album',
      durationMs: 180000,
      coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
    });

    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      url: 'https://music.163.com/api/song/lyric?id=42&lv=-1&kv=-1&tv=-1'
    });
    expect(result).toMatchObject({
      ok: true,
      providerId: 'netease',
      lrc: '[00:01.00]First line',
      tlyric: '[00:01.00]第一句'
    });
  });

  it('caches netease lyrics until the cache ttl expires', async () => {
    let now = 1_000;
    const cache = createMemoryCacheStore({ now: () => now });
    const runtime = createRuntime(
      [],
      [
        { lrc: { lyric: '[00:01.00]Cached line\n' } },
        { lrc: { lyric: '[00:01.00]Fresh line\n' } }
      ]
    );
    const provider = createNeteaseProvider(runtime, cache);
    const song = {
      id: 'netease:42',
      providerId: 'netease' as const,
      platformSongId: '42',
      title: 'Song with lyrics',
      artist: 'Artist',
      album: 'Album',
      durationMs: 180000,
      coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
    };

    const first = await provider.getLyrics(song);
    const second = await provider.getLyrics(song);
    now += CACHE_TTL_MS.lyrics + 1;
    const third = await provider.getLyrics(song);

    expect(first).toMatchObject({ ok: true, lrc: '[00:01.00]Cached line' });
    expect(second).toEqual(first);
    expect(third).toMatchObject({ ok: true, lrc: '[00:01.00]Fresh line' });
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('caches netease no-lyrics results', async () => {
    const cache = createMemoryCacheStore();
    const runtime = createRuntime([], [{ lrc: { lyric: '' } }]);
    const provider = createNeteaseProvider(runtime, cache);
    const song = {
      id: 'netease:43',
      providerId: 'netease' as const,
      platformSongId: '43',
      title: 'Instrumental',
      artist: 'Artist',
      album: 'Album',
      durationMs: 180000,
      coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
    };

    const first = await provider.getLyrics(song);
    const second = await provider.getLyrics(song);

    expect(first).toEqual({
      ok: false,
      providerId: 'netease',
      reason: {
        category: 'url_unavailable',
        message: '当前歌曲暂无歌词',
        action: 'none'
      }
    });
    expect(second).toEqual(first);
    expect(runtime.requestJson).toHaveBeenCalledTimes(1);
  });

  it('caches playlist tracks until the cache ttl expires', async () => {
    let now = 1_000;
    const cache = createMemoryCacheStore({ now: () => now });
    const runtime = createRuntime(
      [{ name: 'MUSIC_U', value: 'sensitive-token' }],
      [
        {
          code: 200,
          playlist: {
            id: 6688,
            name: '我喜欢的音乐',
            tracks: [
              {
                id: 42,
                name: '晴天',
                artists: [{ name: '周杰伦' }],
                album: { name: '叶惠美' },
                duration: 269000
              }
            ]
          }
        },
        {
          code: 200,
          playlist: {
            id: 6688,
            name: '我喜欢的音乐',
            tracks: [
              {
                id: 43,
                name: '七里香',
                artists: [{ name: '周杰伦' }],
                album: { name: '七里香' },
                duration: 300000
              }
            ]
          }
        }
      ]
    );
    const provider = createNeteaseProvider(runtime, cache);

    const first = await provider.getPlaylistTracks('netease:6688');
    const second = await provider.getPlaylistTracks('netease:6688');
    now += CACHE_TTL_MS.playlistTracks + 1;
    const third = await provider.getPlaylistTracks('netease:6688');

    expect(first[0].title).toBe('晴天');
    expect(second[0].title).toBe('晴天');
    expect(third[0].title).toBe('七里香');
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('refreshes cached playlist tracks when force refresh is requested', async () => {
    const cache = createMemoryCacheStore();
    const runtime = createRuntime(
      [{ name: 'MUSIC_U', value: 'sensitive-token' }],
      [
        {
          code: 200,
          playlist: {
            id: 6688,
            name: 'Cached Playlist',
            tracks: [
              {
                id: 42,
                name: 'Cached Song',
                artists: [{ name: 'Artist' }],
                album: { name: 'Album' },
                duration: 269000
              }
            ]
          }
        },
        {
          code: 200,
          playlist: {
            id: 6688,
            name: 'Cached Playlist',
            tracks: [
              {
                id: 43,
                name: 'Fresh Song',
                artists: [{ name: 'Artist' }],
                album: { name: 'Fresh Album' },
                duration: 300000
              }
            ]
          }
        }
      ]
    );
    const provider = createNeteaseProvider(runtime, cache);

    const first = await provider.getPlaylistTracks('netease:6688');
    const refreshed = await provider.getPlaylistTracks('netease:6688', { forceRefresh: true });

    expect(first[0].title).toBe('Cached Song');
    expect(refreshed[0].title).toBe('Fresh Song');
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('returns playable song URLs from netease url response', async () => {
    const runtime = createRuntime(
      [{ name: 'MUSIC_U', value: 'sensitive-token' }],
      [
        {
          code: 200,
          data: [
            {
              id: 42,
              url: 'https://m10.music.126.net/song.mp3',
              level: 'standard'
            }
          ]
        }
      ]
    );
    const provider = createNeteaseProvider(runtime);

    const result = await provider.getSongUrl(
      {
        id: 'netease:42',
        providerId: 'netease',
        platformSongId: '42',
        title: '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        durationMs: 269000,
        coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
      },
      'standard'
    );

    expect(result).toEqual({
      ok: true,
      url: 'https://m10.music.126.net/song.mp3',
      providerId: 'netease',
      quality: 'standard'
    });
  });

  it('returns login_required when playback URL is requested without auth cookies', async () => {
    const runtime = createRuntime([{ name: '__csrf', value: 'csrf-value' }]);
    const provider = createNeteaseProvider(runtime);

    const result = await provider.getSongUrl(
      {
        id: 'netease:42',
        providerId: 'netease',
        platformSongId: '42',
        title: '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        durationMs: 269000,
        coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
      },
      'standard'
    );

    expect(result).toEqual({
      ok: false,
      providerId: 'netease',
      quality: 'standard',
      reason: {
        category: 'login_required',
        message: '请先登录网易云音乐后再播放',
        action: 'login'
      }
    });
  });

  it('returns copyright restriction instead of a generic provider error when URL is unavailable', async () => {
    const runtime = createRuntime(
      [{ name: 'MUSIC_U', value: 'sensitive-token' }],
      [
        {
          code: 200,
          data: [
            {
              id: 42,
              url: null,
              fee: 1
            }
          ]
        }
      ]
    );
    const provider = createNeteaseProvider(runtime);

    const result = await provider.getSongUrl(
      {
        id: 'netease:42',
        providerId: 'netease',
        platformSongId: '42',
        title: '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        durationMs: 269000,
        coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
      },
      'standard'
    );

    expect(result).toEqual({
      ok: false,
      providerId: 'netease',
      quality: 'standard',
      reason: {
        category: 'vip_required',
        message: '当前歌曲需要会员权限，无法获取播放地址',
        action: 'upgrade'
      }
    });
  });

  it('caches song-level membership failures only for the configured failure TTL', async () => {
    let now = 1_000;
    const cache = createMemoryCacheStore({ now: () => now });
    const runtime = createRuntime(
      [{ name: 'MUSIC_U', value: 'sensitive-token' }],
      [
        { code: 200, data: [{ id: 42, url: null, fee: 1 }] },
        { code: 200, data: [{ id: 42, url: 'https://m10.music.126.net/recovered.mp3', level: 'standard' }] }
      ]
    );
    const provider = createNeteaseProvider(runtime, cache);

    const first = await provider.getSongUrl(mutationSong, 'standard');
    const cached = await provider.getSongUrl(mutationSong, 'standard');
    now += CACHE_TTL_MS.playbackFailure + 1;
    const recovered = await provider.getSongUrl(mutationSong, 'standard');

    expect(first).toMatchObject({ ok: false, reason: { category: 'vip_required' } });
    expect(cached).toEqual(first);
    expect(recovered).toMatchObject({ ok: true, url: 'https://m10.music.126.net/recovered.mp3' });
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('maps top-level network risk responses as provider-wide retryable failures without caching them per song', async () => {
    const cache = createMemoryCacheStore();
    const runtime = createRuntime(
      [{ name: 'MUSIC_U', value: 'sensitive-token' }],
      [
        { code: -460, message: '检测到您的网络环境存在风险，请稍后再试' },
        {
          code: 200,
          data: [{ id: 42, url: 'https://m10.music.126.net/recovered.mp3', level: 'standard' }]
        }
      ]
    );
    const provider = createNeteaseProvider(runtime, cache);

    const first = await provider.getSongUrl(mutationSong, 'standard');
    const retried = await provider.getSongUrl(mutationSong, 'standard');

    expect(first).toEqual({
      ok: false,
      providerId: 'netease',
      quality: 'standard',
      reason: {
        category: 'provider_risk',
        message: '检测到您的网络环境存在风险，请稍后再试；这不是会员限制',
        action: 'retry'
      }
    });
    expect(retried).toMatchObject({
      ok: true,
      url: 'https://m10.music.126.net/recovered.mp3'
    });
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
    expect(cache.get(CACHE_KEYS.playbackFailure('netease', '42', 'standard'))).toBeNull();
  });

  it('maps top-level expired-session responses to login_required', async () => {
    const runtime = createRuntime(
      [{ name: 'MUSIC_U', value: 'sensitive-token' }],
      [{ code: 301, message: '登录状态已失效' }]
    );

    const result = await createNeteaseProvider(runtime).getSongUrl(mutationSong, 'standard');

    expect(result).toMatchObject({
      ok: false,
      reason: {
        category: 'login_required',
        message: '登录状态已失效',
        action: 'login'
      }
    });
  });

  it('clears only the netease login session on logout', async () => {
    const runtime = createRuntime([{ name: 'MUSIC_U', value: 'sensitive-token' }]);
    const provider = createNeteaseProvider(runtime);

    await provider.logout();

    expect(runtime.clearSession).toHaveBeenCalledWith(NETEASE_LOGIN_PARTITION);
  });

  it.each([
    { liked: true, operation: 'like' },
    { liked: false, operation: 'unlike' }
  ] as const)('submits an authenticated weapi request for $operation', async ({ liked, operation }) => {
    const runtime = createRuntime(
      [
        { name: 'MUSIC_U', value: 'sensitive-token' },
        { name: '__csrf', value: 'csrf-token' }
      ],
      [{ code: 200 }]
    );
    const provider = createNeteaseProvider(runtime);

    const result = await provider.setSongLiked(mutationSong, liked);

    expect(result).toEqual({ providerId: 'netease', operation });
    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: NETEASE_LOGIN_PARTITION,
      method: 'POST',
      url: 'https://music.163.com/api/radio/like',
      form: {
        alg: 'itembased',
        trackId: '42',
        like: liked,
        time: '3',
        csrf_token: 'csrf-token'
      },
      crypto: 'weapi'
    });
  });

  it.each([
    { liked: true, operation: 'like', playlistOperation: 'add' },
    { liked: false, operation: 'unlike', playlistOperation: 'del' }
  ] as const)('falls back to the owned liked playlist when $operation is risk-rejected', async ({
    liked,
    operation,
    playlistOperation
  }) => {
    const runtime = createRuntime(
      [
        { name: 'MUSIC_U', value: 'sensitive-token' },
        { name: '__csrf', value: 'csrf-token' }
      ],
      [
        { code: -460, message: '检测到您的网络环境存在风险，请稍后再试' },
        { code: 200, profile: { userId: 123456, nickname: 'Test User' } },
        {
          code: 200,
          playlist: [{ id: 778899, name: 'Liked Songs', specialType: 5, userId: 123456 }]
        },
        { code: 200 }
      ]
    );
    const provider = createNeteaseProvider(runtime);

    await expect(provider.setSongLiked(mutationSong, liked)).resolves.toEqual({
      providerId: 'netease',
      operation
    });

    expect(runtime.requestJson).toHaveBeenNthCalledWith(4, {
      partition: NETEASE_LOGIN_PARTITION,
      method: 'POST',
      url: 'https://music.163.com/api/playlist/manipulate/tracks',
      form: {
        op: playlistOperation,
        pid: '778899',
        trackIds: '["42"]',
        imme: 'true',
        csrf_token: 'csrf-token'
      },
      crypto: 'weapi'
    });
  });

  it('does not hide non-risk like failures behind the playlist fallback', async () => {
    const runtime = createRuntime(
      [
        { name: 'MUSIC_U', value: 'sensitive-token' },
        { name: '__csrf', value: 'csrf-token' }
      ],
      [{ code: 500, message: 'Provider rejected the mutation' }]
    );

    await expect(createNeteaseProvider(runtime).setSongLiked(mutationSong, true))
      .rejects.toThrow('Provider rejected the mutation');
    expect(runtime.requestJson).toHaveBeenCalledTimes(1);
  });

  it('adds and removes tracks with the authenticated playlist mutation endpoint', async () => {
    const runtime = createRuntime(
      [
        { name: 'MUSIC_U', value: 'sensitive-token' },
        { name: '__csrf', value: 'csrf-token' }
      ],
      [{ code: 200 }, { code: 200 }]
    );
    const provider = createNeteaseProvider(runtime);

    await provider.addSongToPlaylist(mutationSong, 'netease:6688');
    await provider.removeSongFromPlaylist(mutationSong, 'netease:6688');

    expect(runtime.requestJson).toHaveBeenNthCalledWith(1, {
      partition: NETEASE_LOGIN_PARTITION,
      method: 'POST',
      url: 'https://music.163.com/api/playlist/manipulate/tracks',
      form: { op: 'add', pid: '6688', trackIds: '["42"]', imme: 'true', csrf_token: 'csrf-token' },
      crypto: 'weapi'
    });
    expect(runtime.requestJson).toHaveBeenNthCalledWith(2, {
      partition: NETEASE_LOGIN_PARTITION,
      method: 'POST',
      url: 'https://music.163.com/api/playlist/manipulate/tracks',
      form: { op: 'del', pid: '6688', trackIds: '["42"]', imme: 'true', csrf_token: 'csrf-token' },
      crypto: 'weapi'
    });
  });
});
