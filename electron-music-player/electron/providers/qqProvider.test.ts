import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createQQProvider,
  QQ_LOGIN_PARTITION,
  QQ_LOGIN_URL,
  QQ_LYRICS_URL,
  QQ_PROFILE_URL,
  QQ_SONG_URL,
  QQ_USER_PLAYLIST_URL
} from './qqProvider.cts';
import type { QQCookie, QQRuntime } from './qqProvider.cts';
import { CACHE_KEYS, CACHE_TTL_MS } from '../storage/schema.cts';
import { createMemoryCacheStore } from '../storage/cacheStore.cts';

type QQCookieSource = QQCookie[] | ((url: string) => QQCookie[]);

function createRuntime(cookies: QQCookieSource, responses: unknown[] = []): QQRuntime {
  return {
    openLoginWindow: vi.fn(async () => undefined),
    getCookies: vi.fn(async (_partition: string, url: string) => (
      typeof cookies === 'function' ? cookies(url) : cookies
    )),
    clearSession: vi.fn(async () => undefined),
    requestJson: vi.fn(async () => responses.shift()),
    requestSignedMusicu: vi.fn(async () => responses.shift())
  } as unknown as QQRuntime;
}

interface QQMusicuTestData {
  comm: Record<string, unknown>;
  req_0: {
    module?: string;
    method?: string;
    param: Record<string, unknown>;
  };
}

function getRequestedMusicuData(runtime: QQRuntime): QQMusicuTestData {
  const request = vi.mocked(runtime.requestJson).mock.calls[0]?.[0];
  const data = request ? new URL(request.url).searchParams.get('data') : null;
  return JSON.parse(data ?? '{}') as QQMusicuTestData;
}

function getRequestedQQMutation(runtime: QQRuntime, requestIndex = 0) {
  return vi.mocked(runtime.requestSignedMusicu).mock.calls[requestIndex]?.[0];
}

function createExpectedQQGtk(sessionKey: string): number {
  let hash = 5381;
  for (const character of sessionKey) {
    hash = (hash + (hash << 5) + character.charCodeAt(0)) & 0x7fffffff;
  }
  return hash;
}

function createToplistDetailResponse(chartTitle: string, songTitle: string, songMid: string) {
  return {
    code: 0,
    req_1: {
      code: 0,
      data: {
        data: { title: chartTitle },
        songInfoList: [{
          mid: songMid,
          title: songTitle,
          singer: [{ name: '测试歌手' }],
          album: { name: '测试专辑' },
          interval: 180
        }]
      }
    }
  };
}

function createArtistCatalogResponse(description: string) {
  return {
    code: 0,
    singer_detail: {
      code: 0,
      data: {
        singer_list: [{
          basic_info: { singer_mid: '0025NhlN2yWrP4', name: '周杰伦' },
          ex_info: { desc: description }
        }]
      }
    },
    singer_albums: { code: 0, data: { total: 0, albumList: [] } },
    singer_songs: { code: 0, data: { totalNum: 0, songList: [] } }
  };
}

function createAlbumCatalogResponse(description: string) {
  return {
    code: 0,
    album_detail: {
      code: 0,
      data: {
        basicInfo: {
          albumMid: '000MkMni19ClKG',
          albumName: '叶惠美',
          desc: description
        },
        singer: {
          singerList: [{ mid: '0025NhlN2yWrP4', name: '周杰伦' }]
        }
      }
    },
    album_songs: { code: 0, data: { totalNum: 0, songList: [] } }
  };
}

function createNewSongResponse(title: string, mid = 'NEW_SONG_MID') {
  return {
    code: 0,
    new_song: {
      code: 0,
      data: {
        songlist: [{
          mid,
          title,
          subtitle: 'New song subtitle',
          singer: [
            { mid: 'NEW_ARTIST_MID', name: 'New Artist' },
            { mid: 'GUEST_ARTIST_MID', name: 'Guest Artist' }
          ],
          album: { mid: 'NEW_ALBUM_MID', title: 'New Album' },
          interval: 213,
          file: { media_mid: 'NEW_MEDIA_MID' },
          pay: { pay_play: 0 },
          mv: { vid: 'NEW_MV_ID' }
        }]
      }
    }
  };
}

function readNewAlbumsFixture() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'electron/providers/qqNewAlbums.fixture.json'), 'utf8')
  ) as {
    code: number;
    new_album: {
      code: number;
      data: { albums: Array<Record<string, unknown>> };
    };
  };
}

const mutationSong = {
  id: 'qq:003test',
  providerId: 'qq' as const,
  platformSongId: '003test',
  platformNumericSongId: 7654321,
  platformSongType: 0,
  title: 'Mutation Song',
  artist: 'Mutation Artist',
  album: 'Mutation Album',
  durationMs: 180000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
};

function createQQMutationCache() {
  const cache = createMemoryCacheStore();
  cache.set(CACHE_KEYS.providerPlaylists('qq'), [{
    id: 'qq:8800',
    providerId: 'qq',
    platformDirectoryId: '4',
    title: 'Mutation Playlist',
    description: '',
    songIds: [],
    coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
    ownership: 'created',
    sourceLabel: 'QQ音乐'
  }], CACHE_TTL_MS.providerPlaylists);
  return cache;
}

describe('qq provider', () => {
  it('posts the native QQ new-song JSON request and maps recommendation tracks', async () => {
    const runtime = createRuntime([], [createNewSongResponse('Native New Song')]);
    const capability = createQQProvider(runtime).capabilities!.recommendations!;

    const feed = await capability.getRecommendationHome();

    expect(feed).toMatchObject({
      providerId: 'qq',
      loggedIn: false,
      dailySongs: [],
      moduleResults: {
        daily: { status: 'skipped', errorMessage: null },
        new: { status: 'fulfilled', errorMessage: null }
      },
      newSongs: [{
        id: 'qq:NEW_SONG_MID',
        providerId: 'qq',
        platformSongId: 'NEW_SONG_MID',
        platformMediaId: 'NEW_MEDIA_MID',
        title: 'Native New Song',
        artist: 'New Artist / Guest Artist',
        album: 'New Album',
        durationMs: 213000,
        coverUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000NEW_ALBUM_MID.jpg?max_age=2592000',
        sourceContext: {
          type: 'recommendation',
          providerId: 'qq'
        }
      }]
    });
    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: QQ_LOGIN_PARTITION,
      url: QQ_SONG_URL,
      method: 'POST',
      json: {
        comm: { ct: 24, cv: 0 },
        new_song: {
          module: 'newsong.NewSongServer',
          method: 'get_new_song_info',
          param: { type: 5, num: 12 }
        }
      },
      anonymous: true
    });
  });

  it('maps the verified QQ new-album fixture through an anonymous release-only request', async () => {
    const runtime = createRuntime([], [readNewAlbumsFixture()]);
    const capability = createQQProvider(runtime).capabilities!.releaseCatalog!;

    const albums = await capability.getNewAlbums();

    expect(albums).toEqual([
      expect.objectContaining({
        id: 'qq:album:RELEASEALBUM01',
        providerId: 'qq',
        platformAlbumId: 'RELEASEALBUM01',
        title: 'Fixture Release Album 01',
        artistName: 'Fixture Release Artist 01',
        releaseDate: '2026-07-01'
      }),
      expect.objectContaining({ id: 'qq:album:RELEASEALBUM02' }),
      expect.objectContaining({ id: 'qq:album:RELEASEALBUM03' })
    ]);
    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: QQ_LOGIN_PARTITION,
      url: QQ_SONG_URL,
      method: 'POST',
      json: {
        comm: { ct: 24, cv: 0 },
        new_album: {
          module: 'newalbum.NewAlbumServer',
          method: 'get_new_album_info',
          param: { area: 1, sin: 0, num: 12 }
        }
      },
      anonymous: true
    });
  });

  it('rejects unverified QQ new-album aliases and does not cache malformed data', async () => {
    const cache = createMemoryCacheStore();
    const runtime = createRuntime([], [
      { code: 0, new_album: { code: 0, data: { albums: [{ id: 'UNVERIFIED', name: 'Unverified' }] } } },
      readNewAlbumsFixture()
    ]);
    const capability = createQQProvider(runtime, cache).capabilities!.releaseCatalog!;

    await expect(capability.getNewAlbums()).rejects.toThrow('QQ 音乐新碟速递数据无效');
    expect(cache.get(CACHE_KEYS.releaseCatalog('qq'))).toBeNull();
    await expect(capability.getNewAlbums()).resolves.toHaveLength(3);
  });

  it('filters malformed QQ album resources when verified albums remain', async () => {
    const fixture = readNewAlbumsFixture();
    fixture.new_album.data.albums.push({ mid: 'INVALID_MID', name: 'Invalid Album' });
    const capability = createQQProvider(createRuntime([], [fixture])).capabilities!.releaseCatalog!;

    await expect(capability.getNewAlbums()).resolves.toHaveLength(3);
  });

  it('rejects nonzero QQ new-album business codes', async () => {
    const capability = createQQProvider(createRuntime([], [{
      code: 0,
      new_album: { code: 500003, data: { albums: [] } }
    }])).capabilities!.releaseCatalog!;

    await expect(capability.getNewAlbums()).rejects.toThrow('QQ 音乐新碟速递请求失败');
  });

  it('caches QQ new albums and force refreshes only the release catalog', async () => {
    const firstFixture = readNewAlbumsFixture();
    const refreshedFixture = readNewAlbumsFixture();
    refreshedFixture.new_album.data.albums[0].name = 'Refreshed Release Album';
    const runtime = createRuntime([], [firstFixture, refreshedFixture]);
    const capability = createQQProvider(runtime, createMemoryCacheStore()).capabilities!.releaseCatalog!;

    const first = await capability.getNewAlbums();
    const cached = await capability.getNewAlbums();
    const refreshed = await capability.getNewAlbums({ forceRefresh: true });

    expect(first[0].title).toBe('Fixture Release Album 01');
    expect(cached[0].title).toBe('Fixture Release Album 01');
    expect(refreshed[0].title).toBe('Refreshed Release Album');
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('returns the current QQ login state with the public new-song feed', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        { code: 0, data: { creator: { nick: 'QQ User' } } },
        createNewSongResponse('Authenticated New Song')
      ]
    );
    const capability = createQQProvider(runtime).capabilities!.recommendations!;

    const feed = await capability.getRecommendationHome();

    expect(feed.loggedIn).toBe(true);
    expect(feed.newSongs[0].title).toBe('Authenticated New Song');
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it.each([
    { code: 1, new_song: { code: 0, data: { songlist: [] } } },
    { code: 0, new_song: { code: 1, data: { songlist: [] } } }
  ])('rejects QQ new-song business failures without caching them', async (failedResponse) => {
    const cache = createMemoryCacheStore();
    const runtime = createRuntime([], [failedResponse, createNewSongResponse('Recovered New Song')]);
    const capability = createQQProvider(runtime, cache).capabilities!.recommendations!;

    await expect(capability.getRecommendationHome()).rejects.toThrow('QQ 音乐新歌推荐请求失败');
    expect(cache.get(CACHE_KEYS.recommendationHome('qq', false))).toBeNull();

    await expect(capability.getRecommendationHome()).resolves.toMatchObject({
      newSongs: [expect.objectContaining({ title: 'Recovered New Song' })]
    });
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed QQ new-song payload without caching an empty success', async () => {
    const cache = createMemoryCacheStore();
    const runtime = createRuntime([], [
      { code: 0, new_song: { code: 0, data: {} } },
      createNewSongResponse('Recovered Structured Song')
    ]);
    const capability = createQQProvider(runtime, cache).capabilities!.recommendations!;

    await expect(capability.getRecommendationHome())
      .rejects.toThrow('QQ 音乐新歌推荐数据无效');
    expect(cache.get(CACHE_KEYS.recommendationHome('qq', false))).toBeNull();

    await expect(capability.getRecommendationHome()).resolves.toMatchObject({
      newSongs: [expect.objectContaining({ title: 'Recovered Structured Song' })]
    });
  });

  it('caches QQ new songs until the recommendation ttl and refreshes them on demand', async () => {
    let now = 1_000;
    const cache = createMemoryCacheStore({ now: () => now });
    const runtime = createRuntime([], [
      createNewSongResponse('Cached New Song', 'CACHED_MID'),
      createNewSongResponse('Expired New Song', 'EXPIRED_MID'),
      createNewSongResponse('Refreshed New Song', 'REFRESHED_MID')
    ]);
    const capability = createQQProvider(runtime, cache).capabilities!.recommendations!;

    const first = await capability.getRecommendationHome();
    const cached = await capability.getRecommendationHome();
    now += CACHE_TTL_MS.recommendationHome + 1;
    const expired = await capability.getRecommendationHome();
    const refreshed = await capability.getRecommendationHome({ forceRefresh: true });

    expect(first.newSongs[0].title).toBe('Cached New Song');
    expect(cached.newSongs[0].title).toBe('Cached New Song');
    expect(expired.newSongs[0].title).toBe('Expired New Song');
    expect(refreshed.newSongs[0].title).toBe('Refreshed New Song');
    expect(runtime.requestJson).toHaveBeenCalledTimes(3);
    expect(cache.get(CACHE_KEYS.recommendationHome('qq', false))).toEqual(refreshed);
  });

  it('maps anonymous playlist categories while preserving native groups', async () => {
    const runtime = createRuntime([], [{
      code: 0,
      data: {
        categories: [
          {
            categoryGroupName: '热门',
            usable: 1,
            items: [
              { categoryId: 10000000, categoryName: '全部歌单', usable: 1 },
              { categoryId: 165, categoryName: '流行', usable: 1 },
              { categoryId: 166, categoryName: 'R&#38;B', usable: 1 }
            ]
          },
          {
            categoryGroupName: '语种',
            usable: 1,
            items: [
              { categoryId: 1, categoryName: '华语', usable: 1 },
              { categoryId: 2, categoryName: '不可用分类', usable: 0 }
            ]
          }
        ]
      }
    }]);
    const capability = createQQProvider(runtime).capabilities?.playlistDiscovery;

    expect(capability).toBeDefined();
    const categories = await capability!.getPlaylistCategories();

    expect(categories).toEqual([
      { id: 'all', providerId: 'qq', name: '全部' },
      { id: '165', providerId: 'qq', name: '流行', group: '热门', hot: true },
      { id: '166', providerId: 'qq', name: 'R&B', group: '热门', hot: true },
      { id: '1', providerId: 'qq', name: '华语', group: '语种', hot: false }
    ]);
    const request = vi.mocked(runtime.requestJson).mock.calls[0]?.[0];
    expect(request).toMatchObject({ partition: QQ_LOGIN_PARTITION, anonymous: true });
    expect(request?.url).toContain('fcg_get_diss_tag_conf.fcg');
    expect(new URL(request?.url ?? '').searchParams.get('g_tk')).toBe('5381');
  });

  it('rejects failed QQ playlist category responses without caching them', async () => {
    const runtime = createRuntime([], [
      { code: 1 },
      { code: 0, data: { categories: [] } }
    ]);
    const capability = createQQProvider(runtime, createMemoryCacheStore()).capabilities!.playlistDiscovery!;

    await expect(capability.getPlaylistCategories()).rejects.toThrow('QQ 音乐歌单分类请求失败');
    await expect(capability.getPlaylistCategories()).resolves.toEqual([
      { id: 'all', providerId: 'qq', name: '全部' }
    ]);
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('normalizes HTML entities from persisted QQ playlist category cache entries', async () => {
    const runtime = createRuntime([]);
    const cache = createMemoryCacheStore();
    cache.set(CACHE_KEYS.playlistCategories('qq'), [{
      id: '166',
      providerId: 'qq',
      name: 'R&#38;B',
      group: '流&#38;派',
      hot: false
    }], CACHE_TTL_MS.playlistCategories);
    const capability = createQQProvider(runtime, cache).capabilities!.playlistDiscovery!;

    await expect(capability.getPlaylistCategories()).resolves.toEqual([{
      id: '166',
      providerId: 'qq',
      name: 'R&B',
      group: '流&派',
      hot: false
    }]);
    expect(runtime.requestJson).not.toHaveBeenCalled();
  });

  it('maps anonymous playlist discovery pages and inclusive QQ pagination', async () => {
    const runtime = createRuntime([], [{
      code: 0,
      data: {
        sin: 20,
        ein: 39,
        sum: 41,
        list: [{
          dissid: '8800',
          dissname: 'QQ 华语精选',
          introduction: '公开歌单',
          imgurl: 'http://example.test/qq-playlist.jpg',
          creator: { name: '歌单作者' },
          listennum: 654321
        }]
      }
    }]);
    const capability = createQQProvider(runtime).capabilities!.playlistDiscovery!;

    const page = await capability.getDiscoveredPlaylists({ categoryId: '1', limit: 20, offset: 20 });

    expect(page).toEqual({
      providerId: 'qq',
      categoryId: '1',
      playlists: [{
        id: 'qq:8800',
        providerId: 'qq',
        platformPlaylistId: '8800',
        title: 'QQ 华语精选',
        description: '公开歌单',
        songIds: [],
        coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
        coverUrl: 'https://example.test/qq-playlist.jpg',
        sourceLabel: 'QQ音乐',
        creatorName: '歌单作者',
        playCount: 654321
      }],
      offset: 20,
      limit: 20,
      total: 41,
      hasMore: true
    });
    const requestUrl = new URL(vi.mocked(runtime.requestJson).mock.calls[0]?.[0]?.url ?? '');
    expect(vi.mocked(runtime.requestJson).mock.calls[0]?.[0]).toMatchObject({ anonymous: true });
    expect(requestUrl.pathname).toContain('fcg_get_diss_by_tag.fcg');
    expect(Object.fromEntries(requestUrl.searchParams.entries())).toMatchObject({
      categoryId: '1',
      sortId: '5',
      sin: '20',
      ein: '39',
      loginUin: '0'
    });
  });

  it('rejects failed QQ playlist discovery responses without caching them', async () => {
    const runtime = createRuntime([], [
      { code: 1 },
      { code: 0, data: { sin: 0, ein: 0, sum: 1, list: [{ dissid: 8800, dissname: 'Recovered Playlist' }] } }
    ]);
    const capability = createQQProvider(runtime, createMemoryCacheStore()).capabilities!.playlistDiscovery!;
    const query = { categoryId: 'all', limit: 30, offset: 0 };

    await expect(capability.getDiscoveredPlaylists(query)).rejects.toThrow('QQ 音乐歌单列表请求失败');
    await expect(capability.getDiscoveredPlaylists(query)).resolves.toMatchObject({
      playlists: [{ id: 'qq:8800', title: 'Recovered Playlist' }]
    });
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('uses the stable all category and refreshes cached QQ discovery pages on demand', async () => {
    const runtime = createRuntime([], [
      { code: 0, data: { sin: 0, ein: 0, sum: 1, list: [{ dissid: 1, dissname: 'Cached Playlist' }] } },
      { code: 0, data: { sin: 0, ein: 0, sum: 1, list: [{ dissid: 2, dissname: 'Fresh Playlist' }] } }
    ]);
    const capability = createQQProvider(runtime, createMemoryCacheStore()).capabilities!.playlistDiscovery!;

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
    const requestUrl = new URL(vi.mocked(runtime.requestJson).mock.calls[0]?.[0]?.url ?? '');
    expect(requestUrl.searchParams.get('categoryId')).toBe('10000000');
  });

  it('invalidates every cached QQ page in a category when refreshing discovery', async () => {
    const runtime = createRuntime([], [
      { code: 0, data: { sin: 0, ein: 29, sum: 60, list: [{ dissid: 1, dissname: 'Cached First Page' }] } },
      { code: 0, data: { sin: 30, ein: 59, sum: 60, list: [{ dissid: 2, dissname: 'Cached Second Page' }] } },
      { code: 0, data: { sin: 0, ein: 29, sum: 60, list: [{ dissid: 3, dissname: 'Fresh First Page' }] } },
      { code: 0, data: { sin: 30, ein: 59, sum: 60, list: [{ dissid: 4, dissname: 'Fresh Second Page' }] } }
    ]);
    const capability = createQQProvider(runtime, createMemoryCacheStore()).capabilities!.playlistDiscovery!;
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
  ])('rejects invalid QQ playlist discovery query %j before requesting the provider', async (query) => {
    const runtime = createRuntime([]);
    const capability = createQQProvider(runtime).capabilities!.playlistDiscovery!;

    await expect(capability.getDiscoveredPlaylists(query)).rejects.toThrow('QQ 音乐歌单发现参数无效');
    expect(runtime.requestJson).not.toHaveBeenCalled();
  });

  it('maps QQ Musicu artist detail, hot songs, and album summaries', async () => {
    const runtime = createRuntime([], [{
      code: 0,
      singer_detail: {
        code: 0,
        data: {
          singer_list: [{
            basic_info: {
              singer_mid: '0025NhlN2yWrP4',
              name: '周杰伦'
            },
            ex_info: {
              foreign_name: 'Jay Chou',
              desc: '华语创作歌手'
            },
            pic: {
              pic: 'http://example.test/qq-artist.jpg'
            }
          }]
        }
      },
      singer_albums: {
        code: 0,
        data: {
          total: 43,
          albumList: [{
            albumMid: '000MkMni19ClKG',
            albumName: '叶惠美',
            publishDate: '2003-07-31',
            totalNum: 11,
            albumType: '录音室专辑',
            singerName: '周杰伦'
          }]
        }
      },
      singer_songs: {
        code: 0,
        data: {
          totalNum: 560,
          songList: [{
            songInfo: {
              mid: '001n4C3p1yv0FU',
              name: '晴天',
              singer: [{ mid: '0025NhlN2yWrP4', name: '周杰伦' }],
              album: { mid: '000MkMni19ClKG', name: '叶惠美' },
              interval: 269
            }
          }]
        }
      }
    }]);
    const capability = createQQProvider(runtime).capabilities?.artistCatalog;

    expect(capability).toBeDefined();
    const detail = await capability!.getArtistDetail('qq:artist:0025NhlN2yWrP4');

    expect(detail).toEqual({
      id: 'qq:artist:0025NhlN2yWrP4',
      providerId: 'qq',
      platformArtistId: '0025NhlN2yWrP4',
      name: '周杰伦',
      aliases: ['Jay Chou'],
      description: '华语创作歌手',
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      imageUrl: 'https://example.test/qq-artist.jpg',
      sourceLabel: 'QQ音乐',
      songCount: 560,
      albumCount: 43,
      topSongs: [expect.objectContaining({
        id: 'qq:001n4C3p1yv0FU',
        title: '晴天',
        artists: [{
          id: 'qq:artist:0025NhlN2yWrP4',
          providerId: 'qq',
          platformArtistId: '0025NhlN2yWrP4',
          name: '周杰伦'
        }],
        albumRef: {
          id: 'qq:album:000MkMni19ClKG',
          providerId: 'qq',
          platformAlbumId: '000MkMni19ClKG',
          title: '叶惠美'
        },
        sourceContext: {
          type: 'artist',
          providerId: 'qq',
          artistId: 'qq:artist:0025NhlN2yWrP4',
          artistName: '周杰伦'
        }
      })],
      albums: [{
        id: 'qq:album:000MkMni19ClKG',
        providerId: 'qq',
        platformAlbumId: '000MkMni19ClKG',
        title: '叶惠美',
        artistName: '周杰伦',
        coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
        coverUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000000MkMni19ClKG.jpg?max_age=2592000',
        releaseDate: '2003-07-31',
        trackCount: 11,
        albumType: '录音室专辑',
        sourceLabel: 'QQ音乐'
      }]
    });

    const request = vi.mocked(runtime.requestJson).mock.calls[0]?.[0];
    const data = JSON.parse(new URL(request!.url).searchParams.get('data') ?? '{}');
    expect(data).toMatchObject({
      singer_detail: {
        module: 'music.musichallSinger.SingerInfoInter',
        method: 'GetSingerDetail',
        param: { singer_mids: ['0025NhlN2yWrP4'] }
      },
      singer_albums: {
        module: 'music.musichallAlbum.AlbumListServer',
        method: 'GetAlbumList',
        param: { singerMid: '0025NhlN2yWrP4', begin: 0, num: 50 }
      },
      singer_songs: {
        module: 'musichall.song_list_server',
        method: 'GetSingerSongList',
        param: { singerMid: '0025NhlN2yWrP4', begin: 0, num: 50 }
      }
    });
  });

  it('maps QQ Musicu album detail and binds its songs to the album source', async () => {
    const runtime = createRuntime([], [{
      code: 0,
      album_detail: {
        code: 0,
        data: {
          basicInfo: {
            albumMid: '000MkMni19ClKG',
            albumName: '叶惠美',
            publishDate: '2003-07-31',
            desc: '录音室专辑',
            albumType: '录音室专辑'
          },
          singer: {
            singerList: [{
              mid: '0025NhlN2yWrP4',
              name: '周杰伦'
            }]
          }
        }
      },
      album_songs: {
        code: 0,
        data: {
          totalNum: 11,
          songList: [{
            songInfo: {
              mid: '001n4C3p1yv0FU',
              name: '晴天',
              singer: [{ mid: '0025NhlN2yWrP4', name: '周杰伦' }],
              album: { mid: '000MkMni19ClKG', name: '叶惠美' },
              interval: 269
            }
          }]
        }
      }
    }]);
    const capability = createQQProvider(runtime).capabilities!.artistCatalog!;

    const detail = await capability.getAlbumDetail('qq:album:000MkMni19ClKG');

    expect(detail).toEqual({
      id: 'qq:album:000MkMni19ClKG',
      providerId: 'qq',
      platformAlbumId: '000MkMni19ClKG',
      title: '叶惠美',
      artistName: '周杰伦',
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      coverUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000000MkMni19ClKG.jpg?max_age=2592000',
      releaseDate: '2003-07-31',
      trackCount: 11,
      albumType: '录音室专辑',
      sourceLabel: 'QQ音乐',
      description: '录音室专辑',
      artists: [{
        id: 'qq:artist:0025NhlN2yWrP4',
        providerId: 'qq',
        platformArtistId: '0025NhlN2yWrP4',
        name: '周杰伦'
      }],
      tracks: [expect.objectContaining({
        id: 'qq:001n4C3p1yv0FU',
        sourceContext: {
          type: 'album',
          providerId: 'qq',
          albumId: 'qq:album:000MkMni19ClKG',
          albumTitle: '叶惠美'
        }
      })]
    });

    const request = vi.mocked(runtime.requestJson).mock.calls[0]?.[0];
    const data = JSON.parse(new URL(request!.url).searchParams.get('data') ?? '{}');
    expect(data).toMatchObject({
      album_detail: {
        module: 'music.musichallAlbum.AlbumInfoServer',
        method: 'GetAlbumDetail',
        param: { albumMid: '000MkMni19ClKG' }
      },
      album_songs: {
        module: 'music.musichallAlbum.AlbumSongList',
        method: 'GetAlbumSongList',
        param: { albumMid: '000MkMni19ClKG', begin: 0, num: 500, order: 2 }
      }
    });
  });

  it('rejects malformed QQ artist and album ids before requesting Musicu', async () => {
    const runtime = createRuntime([]);
    const capability = createQQProvider(runtime).capabilities!.artistCatalog!;

    await expect(capability.getArtistDetail('qq:artist:bad:mid')).rejects.toThrow('QQ 音乐歌手 ID 无效');
    await expect(capability.getAlbumDetail('netease:album:000MkMni19ClKG')).rejects.toThrow('QQ 音乐专辑 ID 无效');
    expect(runtime.requestJson).not.toHaveBeenCalled();
  });

  it('does not cache failed QQ artist or album module responses', async () => {
    const failedArtist = createArtistCatalogResponse('失败资料');
    failedArtist.singer_albums.code = 500;
    const failedAlbum = createAlbumCatalogResponse('失败资料');
    failedAlbum.album_songs.code = 500;
    const runtime = createRuntime([], [
      failedArtist,
      createArtistCatalogResponse('恢复后的歌手资料'),
      failedAlbum,
      createAlbumCatalogResponse('恢复后的专辑资料')
    ]);
    const capability = createQQProvider(runtime, createMemoryCacheStore()).capabilities!.artistCatalog!;

    await expect(capability.getArtistDetail('qq:artist:0025NhlN2yWrP4')).rejects.toThrow('QQ 音乐歌手详情请求失败');
    await expect(capability.getArtistDetail('qq:artist:0025NhlN2yWrP4')).resolves.toMatchObject({
      description: '恢复后的歌手资料'
    });
    await expect(capability.getAlbumDetail('qq:album:000MkMni19ClKG')).rejects.toThrow('QQ 音乐专辑详情请求失败');
    await expect(capability.getAlbumDetail('qq:album:000MkMni19ClKG')).resolves.toMatchObject({
      description: '恢复后的专辑资料'
    });
    expect(runtime.requestJson).toHaveBeenCalledTimes(4);
  });

  it('caches QQ artist and album details until each entity is force-refreshed', async () => {
    const runtime = createRuntime([], [
      createArtistCatalogResponse('初始歌手资料'),
      createArtistCatalogResponse('刷新后的歌手资料'),
      createAlbumCatalogResponse('初始专辑资料'),
      createAlbumCatalogResponse('刷新后的专辑资料')
    ]);
    const capability = createQQProvider(runtime, createMemoryCacheStore()).capabilities!.artistCatalog!;

    const artist = await capability.getArtistDetail('qq:artist:0025NhlN2yWrP4');
    const cachedArtist = await capability.getArtistDetail('qq:artist:0025NhlN2yWrP4');
    const refreshedArtist = await capability.getArtistDetail('qq:artist:0025NhlN2yWrP4', { forceRefresh: true });
    const album = await capability.getAlbumDetail('qq:album:000MkMni19ClKG');
    const cachedAlbum = await capability.getAlbumDetail('qq:album:000MkMni19ClKG');
    const refreshedAlbum = await capability.getAlbumDetail('qq:album:000MkMni19ClKG', { forceRefresh: true });

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
    expect(runtime.requestJson).toHaveBeenCalledTimes(4);
  });

  it('maps the anonymous toplist groups into chart summaries', async () => {
    const runtime = createRuntime([], [{
      code: 0,
      req_1: {
        code: 0,
        data: {
          group: [{
            groupId: 1,
            groupName: '巅峰榜',
            toplist: [{
              topId: 62,
              title: '飙升榜',
              intro: 'QQ 音乐站内播放热度飙升最快的歌曲',
              period: '2026-07-11',
              updateTime: '2026-07-11',
              updateTips: '每日更新',
              frontPicUrl: 'https://example.test/qq-chart.jpg',
              song: []
            }]
          }]
        }
      }
    }]);
    const provider = createQQProvider(runtime);
    const capability = provider.capabilities?.charts;

    expect(capability).toBeDefined();
    const charts = await capability!.getCharts();

    expect(charts).toEqual([{
      id: 'qq:chart:62',
      providerId: 'qq',
      platformChartId: '62',
      title: '飙升榜',
      description: 'QQ 音乐站内播放热度飙升最快的歌曲',
      songIds: [],
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      coverUrl: 'https://example.test/qq-chart.jpg',
      sourceLabel: 'QQ音乐',
      updatedAt: '2026-07-11',
      updateLabel: '每日更新'
    }]);
    const request = vi.mocked(runtime.requestJson).mock.calls[0]?.[0];
    const requestData = JSON.parse(new URL(request?.url ?? '').searchParams.get('data') ?? '{}') as {
      req_1?: { module?: string; method?: string; param?: Record<string, unknown> };
    };
    expect(request).toMatchObject({ partition: QQ_LOGIN_PARTITION });
    expect(request?.method).toBeUndefined();
    expect(requestData.req_1).toEqual({
      module: 'musicToplist.ToplistInfoServer',
      method: 'GetAll',
      param: {}
    });
  });

  it('maps toplist detail tracks without requiring a period in the chart id', async () => {
    const runtime = createRuntime([], [{
      code: 0,
      req_1: {
        code: 0,
        data: {
          data: {
            topId: 62,
            title: '飙升榜',
            period: '2026-07-11'
          },
          songInfoList: [{
            id: 706256154,
            type: 0,
            mid: '003QLx9h4Y71iu',
            title: '想得美',
            singer: [{ id: 123, mid: '004ARZ9b2ZJ4Cs', name: 'TOP登陆少年组合' }],
            album: { id: 456, mid: '002YPc1C0WN5qn', name: '想得美' },
            interval: 195
          }]
        }
      }
    }]);
    const provider = createQQProvider(runtime);
    const capability = provider.capabilities!.charts!;

    const tracks = await capability.getChartTracks('qq:chart:62');

    expect(tracks).toEqual([{
      id: 'qq:003QLx9h4Y71iu',
      providerId: 'qq',
      platformSongId: '003QLx9h4Y71iu',
      platformNumericSongId: 706256154,
      platformSongType: 0,
      platformMediaId: '003QLx9h4Y71iu',
      title: '想得美',
      artist: 'TOP登陆少年组合',
      album: '想得美',
      artists: [{
        id: 'qq:artist:004ARZ9b2ZJ4Cs',
        providerId: 'qq',
        platformArtistId: '004ARZ9b2ZJ4Cs',
        name: 'TOP登陆少年组合'
      }],
      albumRef: {
        id: 'qq:album:002YPc1C0WN5qn',
        providerId: 'qq',
        platformAlbumId: '002YPc1C0WN5qn',
        title: '想得美'
      },
      durationMs: 195000,
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      coverUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000002YPc1C0WN5qn.jpg?max_age=2592000',
      artistImageUrl: 'https://y.gtimg.cn/music/photo_new/T001R300x300M000004ARZ9b2ZJ4Cs.jpg?max_age=2592000',
      sourceContext: {
        type: 'playlist',
        providerId: 'qq',
        playlistId: 'qq:chart:62',
        playlistTitle: '飙升榜'
      }
    }]);
    const request = vi.mocked(runtime.requestJson).mock.calls[0]?.[0];
    const requestData = JSON.parse(new URL(request?.url ?? '').searchParams.get('data') ?? '{}') as {
      req_1?: { module?: string; method?: string; param?: Record<string, unknown> };
    };
    expect(requestData.req_1).toEqual({
      module: 'musicToplist.ToplistInfoServer',
      method: 'GetDetail',
      param: { topId: 62, offset: 0, num: 100 }
    });
  });

  it.each([
    'qq:62',
    'netease:chart:62',
    'qq:chart:0',
    'qq:chart:not-a-number'
  ])('rejects invalid QQ chart id %s before requesting the provider', async (chartId) => {
    const runtime = createRuntime([]);
    const capability = createQQProvider(runtime).capabilities!.charts!;

    await expect(capability.getChartTracks(chartId)).rejects.toThrow('QQ 音乐排行榜 ID 无效');
    expect(runtime.requestJson).not.toHaveBeenCalled();
  });

  it('reuses cached chart tracks and refreshes them when requested', async () => {
    const runtime = createRuntime([], [
      createToplistDetailResponse('飙升榜', '缓存歌曲', 'cached-song'),
      createToplistDetailResponse('飙升榜', '刷新歌曲', 'refreshed-song')
    ]);
    const capability = createQQProvider(runtime, createMemoryCacheStore()).capabilities!.charts!;

    const first = await capability.getChartTracks('qq:chart:62');
    const cached = await capability.getChartTracks('qq:chart:62');
    const refreshed = await capability.getChartTracks('qq:chart:62', { forceRefresh: true });

    expect(first[0].title).toBe('缓存歌曲');
    expect(cached[0].title).toBe('缓存歌曲');
    expect(refreshed[0].title).toBe('刷新歌曲');
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('uses timeout and provider error helpers in the Electron runtime', () => {
    const source = readFileSync(resolve(process.cwd(), 'electron/providers/qqProvider.cts'), 'utf8');

    expect(source).toContain('AbortController');
    expect(source).toContain('PROVIDER_REQUEST_TIMEOUT_MS');
    expect(source).toContain("createProviderTimeoutError('QQ 音乐')");
    expect(source).toContain("createProviderRequestError('QQ 音乐'");
  });

  it('serializes structured JSON bodies with the JSON content type while preserving form requests', () => {
    const source = readFileSync(resolve(process.cwd(), 'electron/providers/qqProvider.cts'), 'utf8');

    expect(source).toContain('JSON.stringify(json)');
    expect(source).toContain("{ 'Content-Type': 'application/json' }");
    expect(source).toContain('new URLSearchParams(form).toString()');
    expect(source).toContain("{ 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }");
  });

  it('keeps authenticated QQ requests in the isolated session and routes public endpoints through stateless fetch', () => {
    const source = readFileSync(resolve(process.cwd(), 'electron/providers/qqProvider.cts'), 'utf8');

    expect(source).toContain('}, anonymous\n        ? fetch\n        : (requestUrl, init) => loginSession.fetch');
    expect(source).toContain("credentials: 'include'");
    expect(source).toContain('loginSession.cookies.get({ url })');
    expect(source).toContain('referrer: getQQRequestReferer(url)');
    expect(source).not.toContain('Referer: getQQRequestReferer(url)');
    expect(source).toContain('createQQBrowserUserAgent(currentUserAgent)');
    expect(source).toContain(".replace(/\\sElectron\\/[\\d.]+/gi, '')");
    expect(source).toContain('loginSession.setUserAgent(compatibleUserAgent, QQ_ACCEPT_LANGUAGE)');
    expect(source).not.toContain('loginSession.cookies.get({})');
    expect(source).not.toContain('Cookie: cookieHeader');
    expect(source).not.toContain('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
  });

  it('keeps QQ authentication popups in the isolated partition and flushes cookies after login', () => {
    const source = readFileSync(resolve(process.cwd(), 'electron/providers/qqProvider.cts'), 'utf8');

    expect(source).toContain("hostname === 'qq.com' || hostname.endsWith('.qq.com')");
    expect(source).toContain('overrideBrowserWindowOptions: createLoginPopupWindowOptions(partition, loginWindow)');
    expect(source).toContain('await loginSession.cookies.flushStore();');
  });

  it('maximizes the Electron login window before loading the official login page', () => {
    const source = readFileSync(resolve(process.cwd(), 'electron/providers/qqProvider.cts'), 'utf8');

    expect(source).toContain('loginWindow.maximize();');
    expect(source.indexOf('loginWindow.maximize();')).toBeLessThan(source.indexOf('await loginWindow.loadURL(url);'));
  });

  it('creates the Electron login window hidden and shows it maximized when ready', () => {
    const source = readFileSync(resolve(process.cwd(), 'electron/providers/qqProvider.cts'), 'utf8');

    expect(source).toContain('show: false');
    expect(source).toContain('getDisplayNearestPoint(electron.screen.getCursorScreenPoint()).workAreaSize');
    expect(source).toContain("loginWindow.once('ready-to-show'");
    expect(source).toContain('loginWindow.show();');
    expect(source).toContain('loginWindow.focus();');
  });

  it('reuses the active Electron login window instead of opening duplicates', () => {
    const source = readFileSync(resolve(process.cwd(), 'electron/providers/qqProvider.cts'), 'utf8');

    expect(source).toContain('let activeLoginWindow');
    expect(source).toContain('activeLoginWindow && !activeLoginWindow.isDestroyed()');
    expect(source).toContain('showMaximizedLoginWindow(activeLoginWindow)');
    expect(source).toContain('return activeLoginWindowClosed');
    expect(source).toContain('activeLoginWindow = null');
  });

  it('opens official login in an isolated session partition before reading status', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'p_skey', value: 'web-account-token' },
        { name: 'ptnick_123456', value: '%E6%B5%8B%E8%AF%95QQ' }
      ],
      [{ code: 0, data: { creator: { nick: '测试QQ' } } }]
    );
    const provider = createQQProvider(runtime);

    const status = await provider.login();

    expect(runtime.openLoginWindow).toHaveBeenCalledWith({
      partition: QQ_LOGIN_PARTITION,
      url: QQ_LOGIN_URL
    });
    expect(status).toMatchObject({
      providerId: 'qq',
      loggedIn: true,
      userId: '123456',
      nickname: '测试QQ',
      playbackReady: false,
      message: 'QQ 音乐已登录，播放授权不完整'
    });
    expect(JSON.stringify(status)).not.toContain('web-account-token');
  });

  it('reports logged out status when account cookies are absent', async () => {
    const runtime = createRuntime([{ name: '__csrf', value: 'csrf-value' }]);
    const provider = createQQProvider(runtime);

    const status = await provider.getLoginStatus();

    expect(status).toEqual({
      providerId: 'qq',
      loggedIn: false,
      playbackReady: false,
      stale: false,
      message: 'QQ 音乐未登录'
    });
  });

  it('does not derive a QQ uin by stripping letters from an opaque identifier', async () => {
    const runtime = createRuntime([
      { name: 'uin', value: 'openid_123456789' },
      { name: 'qqmusic_key', value: 'playback-token' }
    ]);

    const status = await createQQProvider(runtime).getLoginStatus();

    expect(status).toMatchObject({
      providerId: 'qq',
      loggedIn: false,
      playbackReady: false
    });
    expect(runtime.requestJson).not.toHaveBeenCalled();
  });

  it('keeps account login separate from playback authorization', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'p_skey', value: 'web-account-token' },
        { name: 'ptnick_123456', value: '%E6%B5%8B%E8%AF%95QQ' }
      ],
      [{ code: 0, data: { creator: { nick: '测试QQ' } } }]
    );
    const provider = createQQProvider(runtime);

    const status = await provider.getLoginStatus();

    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: QQ_LOGIN_PARTITION,
      url: expect.stringContaining(QQ_PROFILE_URL)
    });
    expect(status).toMatchObject({
      providerId: 'qq',
      loggedIn: true,
      userId: '123456',
      nickname: '测试QQ',
      avatarUrl: 'https://q1.qlogo.cn/g?b=qq&nk=123456&s=100',
      playbackReady: false
    });
  });

  it.each([
    { code: 1000 },
    { code: 0, result: 301 }
  ])('does not report logged in when the QQ profile endpoint rejects authentication', async (response) => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'p_skey', value: 'stale-session-token' },
        { name: 'ptnick_123456', value: '%E6%B5%8B%E8%AF%95QQ' }
      ],
      [response]
    );

    const status = await createQQProvider(runtime).getLoginStatus();

    expect(status).toEqual({
      providerId: 'qq',
      loggedIn: false,
      playbackReady: false,
      stale: false,
      message: 'QQ 音乐未登录'
    });
  });

  it('surfaces non-auth QQ profile business failures instead of using cookie fallback data', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'p_skey', value: 'session-token' }
      ],
      [{ code: 500, message: '账号服务繁忙' }]
    );

    await expect(createQQProvider(runtime).getLoginStatus()).rejects.toThrow('账号服务繁忙');
  });

  it('rejects malformed successful QQ profile responses instead of using cookie fallback data', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'p_skey', value: 'session-token' },
        { name: 'ptnick_123456', value: '%E6%B5%8B%E8%AF%95QQ' }
      ],
      [{ code: 0 }]
    );

    await expect(createQQProvider(runtime).getLoginStatus()).rejects.toThrow('QQ 音乐账号信息响应无效');
  });

  it.each([
    { code: 1000, message: 'legacy profile rejected' },
    { code: 500, message: 'legacy profile unavailable' },
    { code: 0 }
  ])('keeps a durable QQ Music OAuth session usable when the legacy profile endpoint is unavailable', async (response) => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'durable-music-token' },
        { name: 'ptnick_123456', value: '%E5%8F%AF%E8%AF%BB%E6%98%B5%E7%A7%B0' }
      ],
      [response]
    );

    const status = await createQQProvider(runtime).getLoginStatus();

    expect(status).toMatchObject({
      providerId: 'qq',
      loggedIn: true,
      userId: '123456',
      nickname: '可读昵称',
      playbackReady: true
    });
    expect(JSON.stringify(status)).not.toContain('durable-music-token');
  });

  it('marks playbackReady only when a QQ music playback key exists', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          code: 0,
          data: {
            creator: {
              nick: 'QQ 用户',
              headpic: 'https://thirdqq.qlogo.cn/avatar.jpg'
            },
            vipInfo: {
              music_vip_level: 3
            }
          }
        }
      ]
    );
    const provider = createQQProvider(runtime);

    const status = await provider.getLoginStatus();

    expect(status).toMatchObject({
      providerId: 'qq',
      loggedIn: true,
      nickname: 'QQ 用户',
      avatarUrl: 'https://thirdqq.qlogo.cn/avatar.jpg',
      vipLabel: 'VIP',
      playbackReady: true,
      message: 'QQ 音乐已登录'
    });
    expect(JSON.stringify(status)).not.toContain('playback-token');
  });

  it('recognizes the current QQ OAuth cookie shape without legacy login cookies', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: '123456789' },
        { name: 'tmeLoginType', value: '2' },
        { name: 'music_ignore_pskey', value: 'current-web-login' },
        { name: 'qm_keyst', value: 'playback-token' },
        { name: 'qqmusic_key', value: 'playback-token' },
        { name: 'psrf_qqopenid', value: 'opaque-open-id' },
        { name: 'psrf_qqaccess_token', value: 'oauth-access-token' },
        { name: 'psrf_qqrefresh_token', value: 'oauth-refresh-token' }
      ],
      [{ code: 0, data: { creator: { nick: 'Readable QQ User' } } }]
    );

    const status = await createQQProvider(runtime).getLoginStatus();

    expect(status).toMatchObject({
      providerId: 'qq',
      loggedIn: true,
      userId: '123456789',
      nickname: 'Readable QQ User',
      playbackReady: true
    });
    const profileUrl = new URL(vi.mocked(runtime.requestJson).mock.calls[0]?.[0].url ?? '');
    expect(profileUrl.searchParams.get('ct')).toBe('24');
    expect(profileUrl.searchParams.get('reqtype')).toBe('0');
    expect(JSON.stringify(status)).not.toContain('oauth-access-token');
    expect(JSON.stringify(status)).not.toContain('oauth-refresh-token');
    expect(JSON.stringify(status)).not.toContain('opaque-open-id');
  });

  it('loads user playlists with the current QQ OAuth cookies and the legacy 5381 g_tk fallback', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: '123456789' },
        { name: 'tmeLoginType', value: '2' },
        { name: 'euin', value: 'encoded-account-id' },
        { name: 'qm_keyst', value: 'playback-token' },
        { name: 'qqmusic_key', value: 'playback-token' },
        { name: 'psrf_qqopenid', value: 'opaque-open-id' },
        { name: 'psrf_qqaccess_token', value: 'oauth-access-token' }
      ],
      [{
        code: 0,
        req_0: {
          code: 0,
          data: {
            v_playlist: [{
              tid: '8800',
              dirName: '新版 OAuth 歌单',
              songNum: 12
            }]
          }
        }
      }]
    );

    const playlists = await createQQProvider(runtime).getUserPlaylists();

    expect(playlists).toMatchObject([{
      id: 'qq:8800',
      providerId: 'qq',
      title: '新版 OAuth 歌单'
    }]);
    const playlistUrl = new URL(vi.mocked(runtime.requestJson).mock.calls[0]?.[0].url ?? '');
    const requestData = JSON.parse(playlistUrl.searchParams.get('data') ?? '{}') as QQMusicuTestData;
    expect(requestData.comm).toMatchObject({
      uin: '123456789',
      loginUin: '123456789',
      g_tk: 5381,
      g_tk_new_20200303: 5381
    });
    expect(requestData.req_0).toEqual({
      module: 'music.musicasset.PlaylistBaseRead',
      method: 'GetPlaylistByUin',
      param: {
        uin: '123456789',
        bWithoutStatus: false
      }
    });
    expect(playlistUrl.toString()).not.toContain('encoded-account-id');
    expect(playlistUrl.toString()).not.toContain('opaque-open-id');
    expect(playlistUrl.toString()).not.toContain('oauth-access-token');
  });

  it('uses wxopenid presence instead of the removed login_type cookie to select a WeChat uin', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: '123456789' },
        { name: 'wxopenid', value: 'opaque-wechat-open-id' },
        { name: 'wxuin', value: '12345678901234' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [{ code: 0, data: { creator: { nick: 'Readable WeChat User' } } }]
    );

    const status = await createQQProvider(runtime).getLoginStatus();

    expect(status).toMatchObject({
      providerId: 'qq',
      loggedIn: true,
      userId: '12345678901234',
      nickname: 'Readable WeChat User',
      playbackReady: true
    });
  });

  it('preserves a 14-digit WeChat uin instead of coercing away its leading zero', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: '123456789' },
        { name: 'wxopenid', value: 'opaque-wechat-open-id' },
        { name: 'wxuin', value: '01234567890123' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [{ code: 0, data: { creator: { nick: 'Readable WeChat User' } } }]
    );

    const status = await createQQProvider(runtime).getLoginStatus();

    expect(status).toMatchObject({
      loggedIn: true,
      userId: '01234567890123'
    });
  });

  it('uses each request URL scoped session key for profile and musicu g_tk values', async () => {
    const profileSessionKey = 'profile-session-key';
    const playbackSessionKey = 'playback-session-key';
    const scopedSessionKeys: Record<string, string> = {
      [QQ_PROFILE_URL]: profileSessionKey,
      [QQ_SONG_URL]: playbackSessionKey
    };
    const runtime = createRuntime(
      (url) => [
        { name: 'uin', value: 'o123456' },
        { name: 'p_skey', value: scopedSessionKeys[url] ?? 'unexpected-session-key' },
        { name: 'p_skey', value: 'later-duplicate-must-not-overwrite' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        { code: 0, data: { creator: { nick: 'QQ 用户' } } },
        { code: 0, req_0: { code: 0, data: { v_playlist: [] } } },
        {
          req_0: {
            code: 0,
            data: {
              sip: ['https://dl.stream.qqmusic.qq.com/'],
              midurlinfo: [{ purl: 'C400SONG_MID.m4a?vkey=test-vkey' }]
            }
          }
        }
      ]
    );
    const provider = createQQProvider(runtime);

    await provider.getLoginStatus();
    await provider.getUserPlaylists();
    await provider.getSongUrl({
      id: 'qq:SONG_MID',
      providerId: 'qq',
      platformSongId: 'SONG_MID',
      title: 'QQ Song',
      artist: 'QQ Artist',
      album: 'QQ Album',
      durationMs: 180000,
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
    }, 'standard');

    const requests = vi.mocked(runtime.requestJson).mock.calls.map(([request]) => request);
    expect(new URL(requests[0].url).searchParams.get('g_tk')).toBe(String(createExpectedQQGtk(profileSessionKey)));
    const playlistData = JSON.parse(new URL(requests[1].url).searchParams.get('data') ?? '{}') as QQMusicuTestData;
    expect(playlistData.comm).toMatchObject({
      g_tk: createExpectedQQGtk(playbackSessionKey),
      g_tk_new_20200303: createExpectedQQGtk(playbackSessionKey)
    });
    const playbackData = JSON.parse(new URL(requests[2].url).searchParams.get('data') ?? '{}') as QQMusicuTestData;
    expect(playbackData.comm).toMatchObject({
      g_tk: createExpectedQQGtk(playbackSessionKey),
      g_tk_new_20200303: createExpectedQQGtk(playbackSessionKey)
    });
    expect(vi.mocked(runtime.getCookies).mock.calls).toEqual([
      [QQ_LOGIN_PARTITION, QQ_PROFILE_URL],
      [QQ_LOGIN_PARTITION, QQ_LOGIN_URL],
      [QQ_LOGIN_PARTITION, 'https://ptlogin2.qq.com/'],
      [QQ_LOGIN_PARTITION, QQ_USER_PLAYLIST_URL],
      [QQ_LOGIN_PARTITION, QQ_LOGIN_URL],
      [QQ_LOGIN_PARTITION, 'https://ptlogin2.qq.com/'],
      [QQ_LOGIN_PARTITION, QQ_SONG_URL],
      [QQ_LOGIN_PARTITION, QQ_LOGIN_URL],
      [QQ_LOGIN_PARTITION, 'https://ptlogin2.qq.com/']
    ]);
  });

  it('uses account-scoped QQ cookies for playlist and playback requests', async () => {
    const runtime = createRuntime(
      (url) => url === QQ_LOGIN_URL
        ? [
          { name: 'uin', value: 'o123456' },
          { name: 'p_skey', value: 'account-session-key' },
          { name: 'qqmusic_key', value: 'account-playback-key' }
        ]
        : [],
      [
        { code: 0, req_0: { code: 0, data: { v_playlist: [] } } },
        {
          req_0: {
            code: 0,
            data: {
              sip: ['https://dl.stream.qqmusic.qq.com/'],
              midurlinfo: [{ purl: 'C400SONG_MID.m4a?vkey=test-vkey' }]
            }
          }
        }
      ]
    );
    const provider = createQQProvider(runtime);

    await provider.getUserPlaylists();
    const result = await provider.getSongUrl({
      id: 'qq:SONG_MID',
      providerId: 'qq',
      platformSongId: 'SONG_MID',
      title: 'QQ Song',
      artist: 'QQ Artist',
      album: 'QQ Album',
      durationMs: 180000,
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
    }, 'standard');

    const requests = vi.mocked(runtime.requestJson).mock.calls.map(([request]) => request);
    const playlistData = JSON.parse(new URL(requests[0].url).searchParams.get('data') ?? '{}') as QQMusicuTestData;
    const playbackData = JSON.parse(new URL(requests[1].url).searchParams.get('data') ?? '{}') as QQMusicuTestData;
    expect(playlistData.comm).toMatchObject({
      uin: '123456',
      g_tk: createExpectedQQGtk('account-session-key')
    });
    expect(playbackData.comm).toMatchObject({
      authst: 'account-playback-key',
      g_tk: createExpectedQQGtk('account-session-key')
    });
    expect(result).toMatchObject({ ok: true, providerId: 'qq' });
  });

  it('uses the QQ Music legacy 5381 token when p_skey and skey are absent', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'music-token-must-not-be-hashed-as-p-skey' }
      ],
      [
        { code: 0, data: { creator: { nick: 'QQ 用户' } } },
        { code: 0, req_0: { code: 0, data: { v_playlist: [] } } }
      ]
    );
    const provider = createQQProvider(runtime);

    await provider.getLoginStatus();
    await provider.getUserPlaylists();

    const requests = vi.mocked(runtime.requestJson).mock.calls.map(([request]) => request);
    expect(new URL(requests[0].url).searchParams.get('g_tk')).toBe('5381');
    const playlistData = JSON.parse(new URL(requests[1].url).searchParams.get('data') ?? '{}') as QQMusicuTestData;
    expect(playlistData.comm).toMatchObject({
      g_tk: 5381,
      g_tk_new_20200303: 5381
    });
  });

  it.each([
    { creator: { nick: '', hostname: 'encoded-host-identifier' } },
    { creator: { nick: '123456', hostname: 'encoded-host-identifier' } },
    { creator: { nick: 'QQ 123456', hostname: 'encoded-host-identifier' } },
    { creator: { nick: '6d12277e3967df252f89c092d87c8d88' } },
    { creator: { nick: 'openid_7F4e91ca2048b37D6a50f209' } },
    { creator: { nick: 'encoded-host-identifier' } }
  ])('uses a readable Chinese fallback instead of empty or identifier-like QQ nicknames', async (data) => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [{ code: 0, data }]
    );

    const status = await createQQProvider(runtime).getLoginStatus();

    expect(status.nickname).toBe('QQ 音乐用户');
    expect(status.nickname).not.toContain('123456');
    expect(status.nickname).not.toContain('encoded-host-identifier');
  });

  it('never exposes a short encoded account identifier as the QQ nickname', async () => {
    const encodedAccountIdentifier = 'AbC_123-xyz';
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' },
        { name: 'euin', value: encodedAccountIdentifier }
      ],
      [{ code: 0, data: { creator: { nick: encodedAccountIdentifier } } }]
    );

    const status = await createQQProvider(runtime).getLoginStatus();

    expect(status.nickname).toBeTruthy();
    expect(status.nickname).not.toBe(encodedAccountIdentifier);
  });

  it('keeps ordinary mixed-letter QQ nicknames that are not opaque identifiers', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [{ code: 0, data: { creator: { nick: 'Alice2024' } } }]
    );

    const status = await createQQProvider(runtime).getLoginStatus();

    expect(status.nickname).toBe('Alice2024');
  });

  it('uses the first nonblank readable QQ profile field', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [{ code: 0, data: { creator: { nick: '', title: '可读昵称', hostname: 'encoded-host-identifier' } } }]
    );

    const status = await createQQProvider(runtime).getLoginStatus();

    expect(status.nickname).toBe('可读昵称');
  });

  it('maps user playlists to provider-scoped QQ playlist models', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          code: 0,
          req_0: {
            code: 0,
            data: {
              v_playlist: [
                {
                  tid: '8800',
                  dirId: 4,
                  dirName: 'QQ 私人歌单',
                  picUrl: 'https://y.qq.com/cover.jpg',
                  songNum: 18
                }
              ]
            }
          }
        }
      ]
    );
    const provider = createQQProvider(runtime);

    const playlists = await provider.getUserPlaylists();

    expect(playlists).toEqual([
      {
        id: 'qq:8800',
        providerId: 'qq',
        platformDirectoryId: '4',
        title: 'QQ 私人歌单',
        description: '18 首歌曲',
        songIds: [],
        coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
        coverUrl: 'https://y.qq.com/cover.jpg',
        ownership: 'created',
        sourceLabel: 'QQ音乐'
      }
    ]);
  });

  it('uses the QQ automatic album artwork when a playlist has no custom cover', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [{
        code: 0,
        req_0: {
          code: 0,
          data: {
            v_playlist: [{
              tid: '8800',
              dirId: 4,
              dirName: 'QQ 自动封面歌单',
              picUrl: '',
              bigpicUrl: '',
              albumPicUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000AUTO.jpg'
            }]
          }
        }
      }]
    );

    const playlists = await createQQProvider(runtime).getUserPlaylists();

    expect(playlists[0].coverUrl).toBe('https://y.qq.com/music/photo_new/T002R300x300M000AUTO.jpg');
  });

  it.each([
    { code: 1000, message: 'not login' },
    { code: 301, message: 'session expired' },
    { code: 0, req_0: { code: 1000, message: 'modern session expired' } }
  ])('rejects authenticated QQ playlist business failures instead of returning an empty list', async (response) => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [response]
    );

    await expect(createQQProvider(runtime).getUserPlaylists()).rejects.toThrow('QQ 音乐登录已失效，请重新登录');
  });

  it('rejects malformed successful QQ playlist responses instead of caching an empty list', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [{ code: 0 }]
    );

    await expect(createQQProvider(runtime).getUserPlaylists()).rejects.toThrow('QQ 音乐用户歌单请求失败');
  });

  it('marks only the official QQ liked directory metadata as liked', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          code: 0,
          data: {
            disslist: [
              {
                dirid: 201,
                diss_name: '我喜欢',
                diss_cover: 'https://y.qq.com/liked.jpg',
                song_cnt: 12
              },
              {
                dissid: '8800',
                diss_name: '我喜欢',
                diss_cover: 'https://y.qq.com/manual-liked-title.jpg',
                song_cnt: 18
              }
            ]
          }
        }
      ]
    );
    const provider = createQQProvider(runtime);

    const playlists = await provider.getUserPlaylists();

    expect(playlists[0]).toMatchObject({
      id: 'qq:201',
      title: '我喜欢',
      ownership: 'liked',
      isLiked: true
    });
    expect(playlists[1]).toMatchObject({
      id: 'qq:8800',
      ownership: 'created',
      title: '我喜欢'
    });
    expect(playlists[1]).not.toHaveProperty('isLiked');
  });

  it('maps QQ playlist detail tracks with playlist source context', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          code: 0,
          req_0: { code: 0 },
          cdlist: [
            {
              dissname: 'QQ 私人歌单',
              songlist: [
                {
                  songmid: '003OUlho2HcRHC',
                  songname: '红豆',
                  singer: [{ mid: '000GDDuQ3sGQiT', name: '王菲' }],
                  album: { mid: '001uZ5Gj0JrA4o', name: '唱游' },
                  interval: 260
                }
              ]
            }
          ]
        }
      ]
    );
    const provider = createQQProvider(runtime);

    const tracks = await provider.getPlaylistTracks('qq:8800');

    expect(tracks).toEqual([
      {
        id: 'qq:003OUlho2HcRHC',
        providerId: 'qq',
        platformSongId: '003OUlho2HcRHC',
        title: '红豆',
        artist: '王菲',
        album: '唱游',
        artists: [{
          id: 'qq:artist:000GDDuQ3sGQiT',
          providerId: 'qq',
          platformArtistId: '000GDDuQ3sGQiT',
          name: '王菲'
        }],
        albumRef: {
          id: 'qq:album:001uZ5Gj0JrA4o',
          providerId: 'qq',
          platformAlbumId: '001uZ5Gj0JrA4o',
          title: '唱游'
        },
        durationMs: 260000,
        coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
        coverUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000001uZ5Gj0JrA4o.jpg?max_age=2592000',
        artistImageUrl: 'https://y.gtimg.cn/music/photo_new/T001R300x300M000000GDDuQ3sGQiT.jpg?max_age=2592000',
        sourceContext: {
          type: 'playlist',
          providerId: 'qq',
          playlistId: 'qq:8800',
          playlistTitle: 'QQ 私人歌单'
        }
      }
    ]);
  });

  it.each([
    ['top-level code', { code: 1, req_0: { code: 0 } }],
    ['subrequest code', { code: 0, req_0: { code: 1 } }]
  ])('rejects failed QQ Musicu playlist detail %s without caching it', async (_caseName, failedResponse) => {
    const runtime = createRuntime([], [
      failedResponse,
      {
        code: 0,
        req_0: {
          code: 0,
          data: {
            dirinfo: { title: 'Recovered Playlist' },
            songlist: [{
              mid: '003OUlho2HcRHC',
              title: 'Recovered Song',
              singer: [{ name: 'Recovered Artist' }],
              album: { name: 'Recovered Album' },
              interval: 260
            }]
          }
        }
      }
    ]);
    const provider = createQQProvider(runtime, createMemoryCacheStore());

    await expect(provider.getPlaylistTracks('qq:8800')).rejects.toThrow('QQ 音乐歌单详情请求失败');
    await expect(provider.getPlaylistTracks('qq:8800')).resolves.toMatchObject([
      { id: 'qq:003OUlho2HcRHC', title: 'Recovered Song' }
    ]);
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('loads public QQ playlist details through Musicu without login cookies', async () => {
    const runtime = createRuntime([], [{
      code: 0,
      req_0: {
        code: 0,
        data: {
          dirinfo: { title: 'QQ 公开歌单' },
          songlist: [{
            mid: '003OUlho2HcRHC',
            title: '红豆',
            singer: [{ name: '王菲' }],
            album: { mid: '001uZ5Gj0JrA4o', name: '唱游' },
            interval: 260
          }]
        }
      }
    }]);
    const provider = createQQProvider(runtime);

    const tracks = await provider.getPlaylistTracks('qq:8800');

    expect(tracks[0]).toMatchObject({
      id: 'qq:003OUlho2HcRHC',
      title: '红豆',
      sourceContext: {
        type: 'playlist',
        providerId: 'qq',
        playlistId: 'qq:8800',
        playlistTitle: 'QQ 公开歌单'
      }
    });
    const request = vi.mocked(runtime.requestJson).mock.calls[0]?.[0];
    expect(request).toMatchObject({ partition: QQ_LOGIN_PARTITION });
    expect(request?.url).toContain('musicu.fcg');
    const requestData = getRequestedMusicuData(runtime);
    expect(requestData.req_0).toEqual({
      module: 'music.srfDissInfo.aiDissInfo',
      method: 'uniform_get_Dissinfo',
      param: {
        disstid: 8800,
        enc_host_uin: '',
        tag: 1,
        userinfo: 1,
        song_begin: 0,
        song_num: 1000
      }
    });
    expect(requestData.comm).toMatchObject({ loginUin: '0', uin: '0' });
  });

  it('maps QQ search results into provider songs', async () => {
    const runtime = createRuntime([], [
        {
          data: {
            song: {
              list: [
                {
                  mid: '001MID',
                  name: 'QQ Search Song',
                  interval: 200,
                  singer: [{ name: 'QQ Artist', mid: 'ARTISTMID' }],
                  album: { mid: 'ALBUMMID', name: 'QQ Album' }
                }
              ]
            }
          }
        }
      ]);
    const provider = createQQProvider(runtime);

    const songs = await provider.search('qq');

    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: QQ_LOGIN_PARTITION,
      url: expect.stringContaining('search_for_qq_cp')
    });
    expect(runtime.requestJson).not.toHaveBeenCalledWith({
      partition: QQ_LOGIN_PARTITION,
      url: expect.stringContaining('client_search_cp')
    });
    expect(songs).toEqual([
      expect.objectContaining({
        id: 'qq:001MID',
        providerId: 'qq',
        platformSongId: '001MID',
        title: 'QQ Search Song',
        artist: 'QQ Artist',
        album: 'QQ Album',
        durationMs: 200000,
        coverUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000ALBUMMID.jpg?max_age=2592000',
        artistImageUrl: 'https://y.gtimg.cn/music/photo_new/T001R300x300M000ARTISTMID.jpg?max_age=2592000'
      })
    ]);
    expect(songs[0].sourceContext).toBeUndefined();
  });

  it('uses QQ Smartbox, hotkey, and verified song and album searches for the search experience', async () => {
    const runtime = createRuntime([], [
      {
        code: 0,
        data: {
          song: { itemlist: [{ mid: 'SONG_MID', name: 'Smart Song', singername: 'Smart Artist' }] },
          singer: { itemlist: [{ mid: 'ARTIST_MID', name: 'Smart Artist' }] },
          album: { itemlist: [{ albumMID: 'ALBUM_MID', name: 'Smart Album', singername: 'Smart Artist' }] }
        }
      },
      { code: 0, data: { hotkey: [{ k: 'Hot Keyword', n: 'Hot Label', score: 123 }] } },
      {
        code: 0,
        data: {
          song: {
            totalnum: 1,
            list: [{
              mid: 'SEARCH_SONG_MID',
              name: 'Search Song',
              interval: 180,
              singer: [{ mid: 'SEARCH_ARTIST_MID', name: 'Search Artist' }],
              album: { mid: 'SEARCH_ALBUM_MID', name: 'Search Album' }
            }]
          }
        }
      },
      {
        code: 0,
        data: {
          album: {
            totalnum: 1,
            list: [{
              albumMID: 'SEARCH_ALBUM_MID',
              albumName: 'Search Album',
              singerName: 'Search Artist',
              publicTime: '2025-01-01',
              songNum: 10
            }]
          }
        }
      }
    ]);
    const searchExperience = createQQProvider(runtime).capabilities!.searchExperience!;

    await expect(searchExperience.getSuggestions('smart')).resolves.toMatchObject([
      { providerId: 'qq', kind: 'song', keyword: 'Smart Song', subtitle: 'Smart Artist' },
      { providerId: 'qq', kind: 'artist', keyword: 'Smart Artist' },
      { providerId: 'qq', kind: 'album', keyword: 'Smart Album', subtitle: 'Smart Artist' }
    ]);
    await expect(searchExperience.getHotSearches()).resolves.toEqual([
      {
        id: 'qq:hot:Hot%20Keyword',
        providerId: 'qq',
        keyword: 'Hot Keyword',
        title: 'Hot Label',
        rank: 1,
        score: 123
      }
    ]);

    const results = await searchExperience.searchEntities('search', { limit: 10, offset: 0 });

    expect(results).toMatchObject({
      providerId: 'qq',
      keyword: 'search',
      sections: {
        songs: {
          available: true,
          total: 1,
          hasMore: false,
          errorMessage: null,
          items: [{ id: 'qq:SEARCH_SONG_MID', title: 'Search Song' }]
        },
        artists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null },
        albums: {
          available: true,
          total: 1,
          hasMore: false,
          errorMessage: null,
          items: [{ id: 'qq:album:SEARCH_ALBUM_MID', title: 'Search Album', trackCount: 10 }]
        },
        playlists: { available: false, items: [], total: 0, hasMore: false, errorMessage: null }
      }
    });
    const requests = vi.mocked(runtime.requestJson).mock.calls.map(([request]) => request);
    expect(requests[0]?.url).toContain('smartbox_new.fcg');
    expect(requests[1]?.url).toContain('gethotkey.fcg');
    expect(requests[2]?.url).toContain('t=0');
    expect(requests[3]?.url).toContain('t=8');
  });

  it('keeps QQ song search usable when the album segment fails', async () => {
    const runtime = createRuntime([], [
      {
        code: 0,
        data: {
          song: {
            totalnum: 1,
            list: [{
              mid: 'SEARCH_SONG_MID',
              name: 'Search Song',
              interval: 180,
              singer: [{ name: 'Search Artist' }],
              album: { mid: 'SEARCH_ALBUM_MID', name: 'Search Album' }
            }]
          }
        }
      },
      { code: 500 },
      {
        code: 0,
        data: {
          song: {
            totalnum: 1,
            list: [{
              mid: 'SEARCH_SONG_MID',
              name: 'Search Song',
              interval: 180,
              singer: [{ name: 'Search Artist' }],
              album: { mid: 'SEARCH_ALBUM_MID', name: 'Search Album' }
            }]
          }
        }
      },
      {
        code: 0,
        data: {
          album: {
            totalnum: 1,
            list: [{ albumMID: 'SEARCH_ALBUM_MID', albumName: 'Recovered Album', singerName: 'Search Artist' }]
          }
        }
      }
    ]);
    const searchExperience = createQQProvider(runtime, createMemoryCacheStore()).capabilities!.searchExperience!;

    const failedResults = await searchExperience.searchEntities('search');

    expect(failedResults.sections.songs.items).toHaveLength(1);
    expect(failedResults.sections.albums).toMatchObject({
      available: true,
      items: [],
      total: 0,
      hasMore: false,
      errorMessage: 'QQ音乐专辑搜索请求失败'
    });

    const recoveredResults = await searchExperience.searchEntities('search');
    expect(recoveredResults.sections.albums.items).toMatchObject([{ title: 'Recovered Album' }]);
    expect(runtime.requestJson).toHaveBeenCalledTimes(4);
  });

  it('hydrates QQ search artist artwork from singer matches when song rows omit singer mids', async () => {
    const runtime = createRuntime([], [
      {
        data: {
          song: {
            list: [
              {
                mid: '001MID',
                name: 'QQ Artist Search Song',
                interval: 200,
                singer: [{ name: 'QQ Artist' }],
                album: { mid: 'ALBUMMID', name: 'QQ Album' }
              }
            ]
          }
        }
      },
      {
        data: {
          singer: {
            itemlist: [
              {
                name: 'QQ Artist',
                mid: 'ARTISTMID'
              }
            ]
          }
        }
      }
    ]);
    const provider = createQQProvider(runtime);

    const songs = await provider.search('QQ Artist');

    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: QQ_LOGIN_PARTITION,
      url: expect.stringContaining('smartbox_new.fcg')
    });
    expect(songs[0]).toMatchObject({
      artist: 'QQ Artist',
      artistImageUrl: 'https://y.gtimg.cn/music/photo_new/T001R300x300M000ARTISTMID.jpg?max_age=2592000'
    });
  });

  it('interleaves QQ suggestion entity kinds before applying the result limit', async () => {
    const runtime = createRuntime([], [{
      code: 0,
      data: {
        song: {
          itemlist: Array.from({ length: 6 }, (_, index) => ({
            mid: `SONG_${index}`,
            name: `Smart Song ${index}`,
            singername: 'Smart Artist'
          }))
        },
        singer: { itemlist: [{ mid: 'ARTIST_MID', name: 'Smart Artist' }] },
        album: { itemlist: [{ albumMID: 'ALBUM_MID', name: 'Smart Album', singername: 'Smart Artist' }] },
        playlist: { itemlist: [{ dissid: 'PLAYLIST_MID', name: 'Smart Playlist' }] }
      }
    }]);
    const searchExperience = createQQProvider(runtime).capabilities!.searchExperience!;

    await expect(searchExperience.getSuggestions('smart', { limit: 5 })).resolves.toEqual([
      expect.objectContaining({ kind: 'song', keyword: 'Smart Song 0' }),
      expect.objectContaining({ kind: 'artist', keyword: 'Smart Artist' }),
      expect.objectContaining({ kind: 'album', keyword: 'Smart Album' }),
      expect.objectContaining({ kind: 'playlist', keyword: 'Smart Playlist' }),
      expect.objectContaining({ kind: 'song', keyword: 'Smart Song 1' })
    ]);
  });

  it('maps QQ album artwork from alternate album field names', async () => {
    const provider = createQQProvider(
      createRuntime([], [
        {
          data: {
            song: {
              list: [
                {
                  songmid: '001MID',
                  songname: 'QQ Alternate Album Song',
                  interval: 200,
                  singer: [{ name: 'QQ Artist' }],
                  album: { pmid: '003DFRzD192KKD', title: 'QQ Album' }
                },
                {
                  songmid: '002MID',
                  songname: 'QQ Raw Album Song',
                  interval: 201,
                  singer: [{ name: 'QQ Artist B' }],
                  albumMid: '000MkMni19ClKG',
                  albumName: 'Raw Album'
                }
              ]
            }
          }
        }
      ])
    );

    const songs = await provider.search('qq');

    expect(songs[0].coverUrl).toBe('https://y.qq.com/music/photo_new/T002R300x300M000003DFRzD192KKD.jpg?max_age=2592000');
    expect(songs[1].coverUrl).toBe('https://y.qq.com/music/photo_new/T002R300x300M000000MkMni19ClKG.jpg?max_age=2592000');
    expect(songs[1].album).toBe('Raw Album');
  });

  it('caches QQ search results by normalized keyword and paging', async () => {
    let now = 1_000;
    const cache = createMemoryCacheStore({ now: () => now });
    const runtime = createRuntime(
      [],
      [
        {
          data: {
            song: {
              list: [
                {
                  mid: '001MID',
                  name: 'Cached QQ Search Song',
                  interval: 200,
                  singer: [{ name: 'QQ Artist' }],
                  album: { mid: 'ALBUMMID', name: 'QQ Album' }
                }
              ]
            }
          }
        },
        {
          data: {
            singer: {
              itemlist: []
            }
          }
        },
        {
          data: {
            song: {
              list: [
                {
                  mid: '002MID',
                  name: 'Fresh QQ Search Song',
                  interval: 201,
                  singer: [{ name: 'QQ Artist B' }],
                  album: { mid: 'ALBUMMID2', name: 'QQ Album B' }
                }
              ]
            }
          }
        },
        {
          data: {
            singer: {
              itemlist: []
            }
          }
        }
      ]
    );
    const provider = createQQProvider(runtime, cache);

    const first = await provider.search('  QQ  ', { limit: 1, offset: 0 });
    const second = await provider.search('qq', { limit: 1, offset: 0 });
    now += CACHE_TTL_MS.searchResults + 1;
    const third = await provider.search('qq', { limit: 1, offset: 0 });

    expect(first[0].title).toBe('Cached QQ Search Song');
    expect(second[0].title).toBe('Cached QQ Search Song');
    expect(third[0].title).toBe('Fresh QQ Search Song');
    expect(runtime.requestJson).toHaveBeenCalledTimes(4);
    expect(cache.get(CACHE_KEYS.searchResults('qq', 'qq', 1, 0))).toEqual(third);
  });

  it('caches QQ playlist tracks until the cache ttl expires', async () => {
    let now = 1_000;
    const cache = createMemoryCacheStore({ now: () => now });
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          code: 0,
          req_0: { code: 0 },
          cdlist: [
            {
              dissname: 'QQ 私人歌单',
              songlist: [
                {
                  songmid: '003OUlho2HcRHC',
                  songname: '红豆',
                  singer: [{ name: '王菲' }],
                  album: { mid: '001uZ5Gj0JrA4o', name: '唱游' },
                  interval: 260
                }
              ]
            }
          ]
        },
        {
          code: 0,
          req_0: { code: 0 },
          cdlist: [
            {
              dissname: 'QQ 私人歌单',
              songlist: [
                {
                  songmid: '001Qu4I30eVFYb',
                  songname: '旋木',
                  singer: [{ name: '王菲' }],
                  album: { mid: '003DFRzD192KKD', name: '将爱' },
                  interval: 250
                }
              ]
            }
          ]
        }
      ]
    );
    const provider = createQQProvider(runtime, cache);

    const first = await provider.getPlaylistTracks('qq:8800');
    const second = await provider.getPlaylistTracks('qq:8800');
    now += CACHE_TTL_MS.playlistTracks + 1;
    const third = await provider.getPlaylistTracks('qq:8800');

    expect(first[0].title).toBe('红豆');
    expect(second[0].title).toBe('红豆');
    expect(third[0].title).toBe('旋木');
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('refreshes cached QQ playlist tracks when force refresh is requested', async () => {
    const cache = createMemoryCacheStore();
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          code: 0,
          req_0: { code: 0 },
          cdlist: [
            {
              dissname: 'QQ 绉佷汉姝屽崟',
              songlist: [
                {
                  songmid: '003OUlho2HcRHC',
                  songname: '绾㈣眴',
                  singer: [{ name: '鐜嬭彶' }],
                  album: { mid: '001uZ5Gj0JrA4o', name: '鍞辨父' },
                  interval: 260
                }
              ]
            }
          ]
        },
        {
          code: 0,
          req_0: { code: 0 },
          cdlist: [
            {
              dissname: 'QQ 绉佷汉姝屽崟',
              songlist: [
                {
                  songmid: '001Qu4I30eVFYb',
                  songname: '鏃嬫湪',
                  singer: [{ name: '鐜嬭彶' }],
                  album: { mid: '003DFRzD192KKD', name: '灏嗙埍' },
                  interval: 250
                }
              ]
            }
          ]
        }
      ]
    );
    const provider = createQQProvider(runtime, cache);

    const first = await provider.getPlaylistTracks('qq:8800');
    const refreshed = await provider.getPlaylistTracks('qq:8800', { forceRefresh: true });

    expect(first[0].title).toBe('绾㈣眴');
    expect(refreshed[0].title).toBe('鏃嬫湪');
    expect(runtime.requestJson).toHaveBeenCalledTimes(2);
  });

  it('maps QQ media ids separately from song ids for playback resolution', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          code: 0,
          req_0: { code: 0 },
          cdlist: [
            {
              dissname: 'QQ 播放测试歌单',
              songlist: [
                {
                  songmid: 'SONG_MID',
                  songname: 'Media Id Song',
                  file: {
                    media_mid: 'MEDIA_MID'
                  },
                  singer: [{ name: 'QQ Artist' }],
                  album: { mid: 'ALBUM_MID', name: 'QQ Album' },
                  interval: 260
                }
              ]
            }
          ]
        }
      ]
    );
    const provider = createQQProvider(runtime);

    const tracks = await provider.getPlaylistTracks('qq:media-playlist');

    expect(tracks[0]).toMatchObject({
      platformSongId: 'SONG_MID',
      platformMediaId: 'MEDIA_MID'
    });
  });

  it('returns playable QQ song URLs when a playback key is available', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          req_0: {
            code: 0,
            data: {
              sip: ['https://dl.stream.qqmusic.qq.com/'],
              midurlinfo: [
                {
                  purl: 'C400003OUlho2HcRHC.m4a?vkey=test-vkey&guid=10000'
                }
              ]
            }
          }
        }
      ]
    );
    const provider = createQQProvider(runtime);

    const result = await provider.getSongUrl(
      {
        id: 'qq:003OUlho2HcRHC',
        providerId: 'qq',
        platformSongId: '003OUlho2HcRHC',
        title: '红豆',
        artist: '王菲',
        album: '唱游',
        durationMs: 260000,
        coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
      },
      'standard'
    );

    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: QQ_LOGIN_PARTITION,
      url: expect.stringContaining('musicu.fcg')
    });
    expect(result).toEqual({
      ok: true,
      providerId: 'qq',
      quality: 'standard',
      url: 'https://dl.stream.qqmusic.qq.com/C400003OUlho2HcRHC.m4a?vkey=test-vkey&guid=10000'
    });
    expect(JSON.stringify(result)).not.toContain('playback-token');
  });

  it('sends the QQ playback auth key when requesting vkey URLs', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          req_0: {
            code: 0,
            data: {
              sip: ['https://dl.stream.qqmusic.qq.com/'],
              midurlinfo: [
                {
                  purl: 'C400SONG_MID.m4a?vkey=test-vkey&guid=12345678'
                }
              ]
            }
          }
        }
      ]
    );
    const provider = createQQProvider(runtime);

    await provider.getSongUrl(
      {
        id: 'qq:SONG_MID',
        providerId: 'qq',
        platformSongId: 'SONG_MID',
        title: 'Authorized Song',
        artist: 'QQ Artist',
        album: 'QQ Album',
        durationMs: 260000,
        coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
      },
      'standard'
    );

    const data = getRequestedMusicuData(runtime);
    expect(data.comm.authst).toBe('playback-token');
    expect(data.comm.ct).toBe(19);
  });

  it('uses OAuth access tokens as QQ playback authorization when legacy keys are absent', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'p_skey', value: 'web-account-token' },
        { name: 'psrf_qqaccess_token', value: 'oauth-playback-token' }
      ],
      [
        {
          req_0: {
            code: 0,
            data: {
              sip: ['https://dl.stream.qqmusic.qq.com/'],
              midurlinfo: [{ purl: 'C400SONG_MID.m4a?vkey=test-vkey' }]
            }
          }
        }
      ]
    );
    const provider = createQQProvider(runtime);

    const result = await provider.getSongUrl({
      id: 'qq:SONG_MID',
      providerId: 'qq',
      platformSongId: 'SONG_MID',
      title: 'OAuth Song',
      artist: 'QQ Artist',
      album: 'QQ Album',
      durationMs: 180000,
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
    }, 'standard');

    expect(result).toMatchObject({ ok: true, providerId: 'qq' });
    expect(getRequestedMusicuData(runtime).comm).toMatchObject({
      authst: 'oauth-playback-token',
      g_tk: createExpectedQQGtk('web-account-token')
    });
  });

  it('uses QQ media ids and generated guids when requesting playback filenames', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          req_0: {
            code: 0,
            data: {
              sip: ['https://dl.stream.qqmusic.qq.com/'],
              midurlinfo: [
                {
                  purl: 'C400MEDIA_MID.m4a?vkey=test-vkey&guid=12345678'
                }
              ]
            }
          }
        }
      ]
    );
    const provider = createQQProvider(runtime);

    await provider.getSongUrl(
      {
        id: 'qq:SONG_MID',
        providerId: 'qq',
        platformSongId: 'SONG_MID',
        platformMediaId: 'MEDIA_MID',
        title: 'Media Id Song',
        artist: 'QQ Artist',
        album: 'QQ Album',
        durationMs: 260000,
        coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
      },
      'standard'
    );

    const data = getRequestedMusicuData(runtime);
    expect(data.req_0.param.songmid).toEqual(['SONG_MID']);
    expect(data.req_0.param.filename).toEqual(['C400MEDIA_MID.m4a']);
    expect(data.req_0.param.guid).toMatch(/^\d{8}$/);
    expect(data.req_0.param.guid).not.toBe('10000');
  });

  it('returns playback_auth_incomplete when QQ account login lacks a playback key', async () => {
    const runtime = createRuntime([
      { name: 'uin', value: 'o123456' },
      { name: 'p_skey', value: 'web-account-token' }
    ]);
    const provider = createQQProvider(runtime);

    const result = await provider.getSongUrl(
      {
        id: 'qq:003OUlho2HcRHC',
        providerId: 'qq',
        platformSongId: '003OUlho2HcRHC',
        title: '红豆',
        artist: '王菲',
        album: '唱游',
        durationMs: 260000,
        coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
      },
      'standard'
    );

    expect(runtime.requestJson).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      providerId: 'qq',
      quality: 'standard',
      reason: {
        category: 'playback_auth_incomplete',
        action: 'login'
      }
    });
  });

  it('maps empty QQ playback URLs with member restriction codes before handing them to audio playback', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          req_0: {
            code: 0,
            data: {
              sip: ['https://dl.stream.qqmusic.qq.com/'],
              midurlinfo: [
                {
                  purl: '',
                  result: 104003,
                  msg: ''
                }
              ]
            }
          }
        }
      ]
    );
    const provider = createQQProvider(runtime);

    const result = await provider.getSongUrl(
      {
        id: 'qq:00041h1u3kgquE',
        providerId: 'qq',
        platformSongId: '00041h1u3kgquE',
        title: 'Paid QQ Song',
        artist: 'QQ Artist',
        album: 'QQ Album',
        durationMs: 221000,
        coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
      },
      'standard'
    );

    expect(result).toMatchObject({
      ok: false,
      providerId: 'qq',
      quality: 'standard',
      reason: {
        category: 'playback_auth_incomplete',
        action: 'login'
      }
    });
  });

  it('loads and decodes QQ lyrics from the lyric endpoint', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          code: 0,
          lyric: Buffer.from('[00:01.00]Red bean first line').toString('base64'),
          trans: Buffer.from('[00:01.00]红豆第一句').toString('base64')
        }
      ]
    );
    const provider = createQQProvider(runtime);

    const result = await provider.getLyrics({
      id: 'qq:003OUlho2HcRHC',
      providerId: 'qq',
      platformSongId: '003OUlho2HcRHC',
      title: '红豆',
      artist: '王菲',
      album: '唱游',
      durationMs: 260000,
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
    });

    expect(runtime.requestJson).toHaveBeenCalledWith({
      partition: QQ_LOGIN_PARTITION,
      url: expect.stringContaining(QQ_LYRICS_URL),
      anonymous: true
    });
    const lyricRequestUrl = new URL(vi.mocked(runtime.requestJson).mock.calls[0]?.[0]?.url ?? '');
    expect(lyricRequestUrl.searchParams.get('g_tk')).toBe('5381');
    expect(lyricRequestUrl.searchParams.get('loginUin')).toBe('0');
    expect(result).toEqual({
      ok: true,
      providerId: 'qq',
      lrc: '[00:01.00]Red bean first line',
      tlyric: '[00:01.00]红豆第一句'
    });
  });

  it('keeps QQ plain lyric and translated lyric text when the endpoint skips base64 encoding', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          code: 0,
          lyric: '[00:01.00]Plain first line',
          trans: '[00:01.00]Plain translated first line'
        }
      ]
    );
    const provider = createQQProvider(runtime);

    const result = await provider.getLyrics({
      id: 'qq:003OUlho2HcRHC',
      providerId: 'qq',
      platformSongId: '003OUlho2HcRHC',
      title: 'Plain lyric song',
      artist: 'QQ Artist',
      album: 'QQ Album',
      durationMs: 260000,
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
    });

    expect(result).toEqual({
      ok: true,
      providerId: 'qq',
      lrc: '[00:01.00]Plain first line',
      tlyric: '[00:01.00]Plain translated first line'
    });
  });

  it('decodes GB18030 QQ lyrics from the lyric endpoint', async () => {
    const gb18030LyricBytes = Buffer.from([
      0x5b, 0x30, 0x30, 0x3a, 0x30, 0x31, 0x2e, 0x30, 0x30, 0x5d,
      0xba, 0xec, 0xb6, 0xb9, 0xb5, 0xda, 0xd2, 0xbb, 0xbe, 0xe4
    ]);
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          code: 0,
          lyric: gb18030LyricBytes.toString('base64')
        }
      ]
    );
    const provider = createQQProvider(runtime);

    const result = await provider.getLyrics({
      id: 'qq:003OUlho2HcRHC',
      providerId: 'qq',
      platformSongId: '003OUlho2HcRHC',
      title: '红豆',
      artist: '王菲',
      album: '唱游',
      durationMs: 260000,
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
    });

    expect(result).toEqual({
      ok: true,
      providerId: 'qq',
      lrc: '[00:01.00]红豆第一句'
    });
  });

  it('treats QQ spoken-word no-lyrics placeholders as unavailable lyrics', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'qqmusic_key', value: 'playback-token' }
      ],
      [
        {
          code: 0,
          lyric: Buffer.from('[00:00:00]此歌曲为没有填词的口白，请您欣赏').toString('base64')
        }
      ]
    );
    const provider = createQQProvider(runtime);

    const result = await provider.getLyrics({
      id: 'qq:000dyfWN2r4XIs',
      providerId: 'qq',
      platformSongId: '000dyfWN2r4XIs',
      title: "Crazy Dave's Greeting",
      artist: 'Laura Shigihara',
      album: 'Plants vs. Zombies',
      durationMs: 12000,
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
    });

    expect(result).toEqual({
      ok: false,
      providerId: 'qq',
      reason: {
        category: 'url_unavailable',
        message: '当前歌曲暂无歌词',
        action: 'none'
      }
    });
  });

  it('clears only the QQ login session on logout', async () => {
    const runtime = createRuntime([{ name: 'uin', value: 'o123456' }]);
    const provider = createQQProvider(runtime);

    await provider.logout();

    expect(runtime.clearSession).toHaveBeenCalledWith(QQ_LOGIN_PARTITION);
  });

  it('submits the signed QQ playlist add command with trusted song identity', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'p_skey', value: 'web-account-token' }
      ],
      [
        {
          code: 0,
          req_0: {
            code: 0,
            data: {
              v_playlist: [{ tid: '8800', dirId: 4, dirName: 'Mutation Playlist' }]
            }
          }
        },
        { code: 0 }
      ]
    );
    const provider = createQQProvider(runtime);

    const result = await provider.addSongToPlaylist(mutationSong, 'qq:8800');

    expect(result).toEqual({ providerId: 'qq', operation: 'add_to_playlist' });
    const request = getRequestedQQMutation(runtime);
    expect(request).toMatchObject({
      partition: QQ_LOGIN_PARTITION,
      module: 'music.musicasset.PlaylistDetailWrite',
      method: 'AddSonglist',
      param: { dirId: 4, v_songInfo: [{ songId: 7654321, songType: 0 }] }
    });
    expect(runtime.requestSignedMusicu).toHaveBeenCalledTimes(1);
    expect(runtime.requestJson).toHaveBeenCalledTimes(1);
  });

  it('submits the signed QQ playlist remove command with trusted song identity', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'p_skey', value: 'web-account-token' }
      ],
      [{ code: 0 }]
    );
    const provider = createQQProvider(runtime, createQQMutationCache());

    const result = await provider.removeSongFromPlaylist(mutationSong, 'qq:8800');

    expect(result).toEqual({ providerId: 'qq', operation: 'remove_from_playlist' });
    const request = getRequestedQQMutation(runtime);
    expect(request).toMatchObject({
      partition: QQ_LOGIN_PARTITION,
      module: 'music.musicasset.PlaylistDetailWrite',
      method: 'DelSonglist',
      param: { dirId: 4, v_songInfo: [{ songId: 7654321, songType: 0 }] }
    });
    expect(runtime.requestSignedMusicu).toHaveBeenCalledTimes(1);
    expect(runtime.requestJson).not.toHaveBeenCalled();
  });

  it('resolves a missing numeric song identity before removing from a playlist', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'p_skey', value: 'web-account-token' }
      ],
      [
        {
          code: 0,
          req_0: {
            code: 0,
            data: {
              track_info: { id: 246810, type: 7, mid: '003test' }
            }
          }
        },
        { code: 0 }
      ]
    );
    const provider = createQQProvider(runtime, createQQMutationCache());
    const songWithoutWriteIdentity = {
      ...mutationSong,
      platformNumericSongId: undefined,
      platformSongType: undefined
    };

    await provider.removeSongFromPlaylist(songWithoutWriteIdentity, 'qq:8800');

    const detailRequest = vi.mocked(runtime.requestJson).mock.calls[0]?.[0];
    const detailData = JSON.parse(new URL(detailRequest?.url ?? '').searchParams.get('data') ?? '{}') as QQMusicuTestData;
    expect(detailRequest).toMatchObject({
      partition: QQ_LOGIN_PARTITION,
      anonymous: true
    });
    expect(detailData.req_0).toEqual({
      module: 'music.pf_song_detail_svr',
      method: 'get_song_detail_yqq',
      param: { song_mid: '003test', song_type: 0 }
    });
    expect(getRequestedQQMutation(runtime)).toMatchObject({
      module: 'music.musicasset.PlaylistDetailWrite',
      method: 'DelSonglist',
      param: { dirId: 4, v_songInfo: [{ songId: 246810, songType: 7 }] }
    });
  });

  it('rejects a mutation when QQ cannot resolve a trustworthy numeric song identity', async () => {
    const runtime = createRuntime([
      { name: 'uin', value: 'o123456' },
      { name: 'p_skey', value: 'web-account-token' }
    ], [{
      code: 0,
      req_0: {
        code: 0,
        data: {
          track_info: { id: 246810, type: 0, mid: 'DIFFERENT_MID' }
        }
      }
    }]);
    const provider = createQQProvider(runtime);
    const songWithoutWriteIdentity = {
      ...mutationSong,
      platformNumericSongId: undefined,
      platformSongType: undefined
    };

    await expect(provider.setSongLiked(songWithoutWriteIdentity, false))
      .rejects.toThrow('无法取得 QQ 写操作歌曲标识');
    expect(runtime.requestJson).toHaveBeenCalledTimes(1);
    expect(runtime.requestSignedMusicu).not.toHaveBeenCalled();
  });

  it.each(['qq:not-a-number', 'qq:0', 'qq:9007199254740992'])('rejects invalid QQ write playlist id %s', async (playlistId) => {
    const runtime = createRuntime([]);
    const provider = createQQProvider(runtime);

    await expect(provider.addSongToPlaylist(mutationSong, playlistId)).rejects.toThrow('QQ');
    expect(runtime.requestJson).not.toHaveBeenCalled();
  });

  it('rejects mutations when the QQ account session is unavailable', async () => {
    const runtime = createRuntime([{ name: 'uin', value: 'o123456' }]);
    const provider = createQQProvider(runtime);

    await expect(provider.setSongLiked(mutationSong, true))
      .rejects.toThrow('QQ 音乐未登录');
    expect(runtime.requestJson).not.toHaveBeenCalled();
    expect(runtime.requestSignedMusicu).not.toHaveBeenCalled();
  });

  it('surfaces a QQ playlist mutation rejection instead of reporting local success', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'p_skey', value: 'web-account-token' }
      ],
      [{ code: 1, msg: 'operation denied' }]
    );
    const provider = createQQProvider(runtime, createQQMutationCache());

    await expect(provider.addSongToPlaylist(mutationSong, 'qq:8800'))
      .rejects.toThrow('operation denied');
  });

  it('rejects a playlist mutation when QQ does not provide a directory ID', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'p_skey', value: 'web-account-token' }
      ],
      [{
        code: 0,
        req_0: {
          code: 0,
          data: {
            v_playlist: [{ tid: '8800', dirName: 'Legacy Cached Playlist' }]
          }
        }
      }]
    );
    const provider = createQQProvider(runtime);

    await expect(provider.addSongToPlaylist(mutationSong, 'qq:8800'))
      .rejects.toThrow('无法取得 QQ 歌单写入目录标识');
    expect(runtime.requestSignedMusicu).not.toHaveBeenCalled();
  });

  it('uses the official liked directory for like and unlike mutations', async () => {
    const runtime = createRuntime(
      [
        { name: 'uin', value: 'o123456' },
        { name: 'p_skey', value: 'web-account-token' }
      ],
      [{ code: 0 }, { code: 0 }]
    );
    const provider = createQQProvider(runtime);

    await provider.setSongLiked(mutationSong, true);

    expect(getRequestedQQMutation(runtime)).toMatchObject({
      module: 'music.musicasset.PlaylistDetailWrite',
      method: 'AddSonglist',
      param: { dirId: 201, v_songInfo: [{ songId: 7654321, songType: 0 }] }
    });

    await provider.setSongLiked(mutationSong, false);
    expect(getRequestedQQMutation(runtime, 1)).toMatchObject({
      module: 'music.musicasset.PlaylistDetailWrite',
      method: 'DelSonglist',
      param: { dirId: 201, v_songInfo: [{ songId: 7654321, songType: 0 }] }
    });
  });
});
