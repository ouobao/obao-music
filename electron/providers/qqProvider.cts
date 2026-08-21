import { randomInt } from 'node:crypto';
import type { BrowserWindow, BrowserWindowConstructorOptions, Session } from 'electron';
import { createProviderRequestError, createProviderTimeoutError } from './providerErrors.cjs';
import type {
  AlbumDetail,
  AlbumReference,
  AlbumSummary,
  ArtistDetail,
  ArtistReference,
  ArtistSongsPage,
  ArtistSummary,
  ChartSummary,
  DiscoveredPlaylist,
  LoginQrPollResult,
  LoginQrSession,
  LoginStatus,
  LyricsResult,
  MusicProvider,
  PlaybackRestriction,
  Playlist,
  PlaylistCategory,
  PlaylistDetail,
  PlaylistDiscoveryPage,
  PlaylistDiscoveryQuery,
  ProviderFetchOptions,
  Quality,
  RecommendationHomeFeed,
  SearchEntityOptions,
  SearchEntityResults,
  SearchEntitySection,
  SearchEntityType,
  SearchHotSearch,
  SearchSuggestion,
  SearchSuggestionOptions,
  Song,
  SongMutationResult,
  SongUrlResult,
  SourceContext
} from './types.cjs';
import { createMemoryCacheStore } from '../storage/cacheStore.cjs';
import { CACHE_KEYS, CACHE_TTL_MS, type CacheStore } from '../storage/schema.cjs';
import { interleaveSearchSuggestionGroups } from './searchSuggestionUtils.cjs';

export const QQ_LOGIN_PARTITION = 'persist:musicplayer-qq-login';
export const QQ_LOGIN_URL = 'https://y.qq.com/';
export const QQ_PROFILE_URL = 'https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg';
export const QQ_PLAYLIST_DETAIL_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
export const QQ_PLAYLIST_CATEGORIES_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_tag_conf.fcg';
export const QQ_PLAYLIST_DISCOVERY_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg';
export const QQ_SEARCH_URL = 'https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp';
export const QQ_SMARTBOX_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg';
export const QQ_HOT_SEARCH_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/gethotkey.fcg';
export const QQ_SONG_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
export const QQ_USER_PLAYLIST_URL = QQ_SONG_URL;
export const QQ_LYRICS_URL = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg';
const QQ_SOURCE_LABEL = 'QQ音乐';
const QQ_COVER_TONE = 'linear-gradient(135deg, #31c27c, #2f6f90)';
const QQ_LIKED_DIR_ID = '201';
const PROVIDER_REQUEST_TIMEOUT_MS = 12_000;
const QQ_PLAYBACK_GUID_MIN = 10_000_000;
const QQ_PLAYBACK_GUID_MAX = 100_000_000;
const QQ_ACCEPT_LANGUAGE = 'zh-CN,zh;q=0.9,en;q=0.8';
const QQ_PROFILE_REFERER = 'https://y.qq.com/portal/profile.html';
const QQ_PLAYER_REFERER = 'https://y.qq.com/portal/player.html';
const QQ_PLAYLIST_REFERER = 'https://y.qq.com/portal/playlist.html';
const QQ_SIGNED_REQUEST_PAGE_URL = 'https://y.qq.com/n/ryqq/';
const QQ_WEB_REQUEST_MODULE_ID = 8;
const QQ_ACCOUNT_COOKIE_PROBE_URLS = [QQ_LOGIN_URL, 'https://ptlogin2.qq.com/'] as const;
const QQ_QR_SHOW_URL = 'https://xui.ptlogin2.qq.com/ssl/ptqrshow';
const QQ_QR_LOGIN_URL = 'https://xui.ptlogin2.qq.com/ssl/ptqrlogin';
const QQ_QR_APP_ID = '716027609';
const QQ_QR_DAID = '383';
const QQ_QR_PT_3RD_AID = '100497308';
const QQ_QR_REDIRECT_TARGET = 'https://graph.qq.com/oauth2.0/login_jump';
const QQ_QR_JS_VERSION = '26071711';
const QQ_QR_JS_FRAMEWORK_VERSION = 'c1987b96';
const QQ_QR_EXPIRES_IN_MS = 2 * 60_000;
const QQ_QRSIG_COOKIE_URL = 'https://ssl.ptlogin2.qq.com/';
const QQ_QR_SESSION_COOKIE_URL = 'https://xui.ptlogin2.qq.com/';
const QQ_OAUTH_REDIRECT_URI = 'https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https%3A%2F%2Fy.qq.com%2F';

export interface QQCookie {
  name: string;
  value: string;
}

export interface QQRuntime {
  openLoginWindow(options: { partition: string; url: string }): Promise<void>;
  completeLoginCallback(options: { partition: string; url: string; refererUrl: string; qrsig: string }): Promise<void>;
  getCookies(partition: string, url: string): Promise<QQCookie[]>;
  requestJson<T>(request: {
    partition: string;
    url: string;
    method?: 'GET' | 'POST';
    form?: Record<string, string>;
    json?: unknown;
    anonymous?: boolean;
  }): Promise<T>;
  requestText(request: {
    partition: string;
    url: string;
    headers?: Record<string, string>;
  }): Promise<string>;
  requestBuffer(request: {
    partition: string;
    url: string;
    headers?: Record<string, string>;
  }): Promise<Buffer>;
  requestSignedMusicu<T>(request: {
    partition: string;
    module: string;
    method: string;
    param: Record<string, unknown>;
  }): Promise<T>;
  clearSession(partition: string): Promise<void>;
}

export function createQQProvider(
  runtime: QQRuntime = createElectronQQRuntime(),
  cache: CacheStore = createMemoryCacheStore()
): MusicProvider {
  let activeQrSession: QQQrSession | null = null;
  const inFlightQrPolls = new Map<string, Promise<LoginQrPollResult>>();

  return {
    id: 'qq',
    capabilities: {
      charts: {
        getCharts(options = {}) {
          return getCharts(runtime, cache, options);
        },
        getChartTracks(chartId, options = {}) {
          return getChartTracks(runtime, cache, chartId, options);
        }
      },
      playlistDiscovery: {
        getPlaylistCategories(options = {}) {
          return getPlaylistCategories(runtime, cache, options);
        },
        getDiscoveredPlaylists(query, options = {}) {
          return getDiscoveredPlaylists(runtime, cache, query, options);
        }
      },
      artistCatalog: {
        getArtistDetail(artistId, options = {}) {
          return getArtistDetail(runtime, cache, artistId, options);
        },
        getAlbumDetail(albumId, options = {}) {
          return getAlbumDetail(runtime, cache, albumId, options);
        },
        getArtistSongsPage(artistId, offset, options = {}) {
          return getArtistSongsPage(runtime, artistId, offset, options);
        }
      },
      recommendations: {
        getRecommendationHome(options = {}) {
          return getRecommendationHome(runtime, cache, options);
        }
      },
      releaseCatalog: {
        getNewAlbums(options = {}) {
          return getNewAlbums(runtime, cache, options);
        }
      },
      searchExperience: {
        getSuggestions(keyword, options = {}) {
          return getSearchSuggestions(runtime, cache, keyword, options);
        },
        getHotSearches(options = {}) {
          return getHotSearches(runtime, cache, options);
        },
        searchEntities(keyword, options = {}) {
          return searchEntities(runtime, cache, keyword, options);
        }
      }
    },

    async getLoginStatus() {
      return getLoginStatus(runtime, cache);
    },

    async login() {
      cache.deleteByPrefix(CACHE_KEYS.providerPrefix('qq'));
      await runtime.openLoginWindow({
        partition: QQ_LOGIN_PARTITION,
        url: QQ_LOGIN_URL
      });
      cache.deleteByPrefix(CACHE_KEYS.providerPrefix('qq'));
      return getLoginStatus(runtime, cache);
    },

    async createLoginQr() {
      const session = await createQQLoginQr(runtime);
      activeQrSession = session;
      return session.publicSession;
    },

    async pollLoginQr(key) {
      const existingPoll = inFlightQrPolls.get(key);
      if (existingPoll) {
        return existingPoll;
      }

      const pollTask = pollQQLoginQr(runtime, cache, activeQrSession, key)
        .finally(() => {
          inFlightQrPolls.delete(key);
        });
      inFlightQrPolls.set(key, pollTask);

      const result = await pollTask;
      if (result.state === 'success' || result.state === 'expired' || result.state === 'failed') {
        activeQrSession = null;
      }
      return result;
    },

    async cancelLoginQr(key) {
      if (activeQrSession && activeQrSession.key === key) {
        activeQrSession = null;
      }
    },

    async logout() {
      await runtime.clearSession(QQ_LOGIN_PARTITION);
      cache.deleteByPrefix(CACHE_KEYS.providerPrefix('qq'));
    },

    async search(keyword, options = {}) {
      const normalizedKeyword = keyword.trim();
      if (!normalizedKeyword) {
        return [];
      }

      const limit = options.limit ?? 30;
      const offset = options.offset ?? 0;

      return cache.getOrSet(CACHE_KEYS.searchResults('qq', normalizedKeyword, limit, offset), CACHE_TTL_MS.searchResults, async () => {
        const response = await runtime.requestJson<QQSearchResponse>({
          partition: QQ_LOGIN_PARTITION,
          url: createSearchUrl(normalizedKeyword, limit, offset)
        });

        const songs = getSearchSongList(response)
          .map((track) => mapTrack(track, '', ''))
          .filter((song): song is Song => Boolean(song));
        return hydrateQQSearchArtistImages(runtime, normalizedKeyword, songs);
      });
    },

    async getUserPlaylists(options = {}) {
      return getUserPlaylists(runtime, cache, options);
    },

    async getPlaylistTracks(playlistId, options = {}) {
      const detail = await loadQQPlaylistDetail(runtime, cache, playlistId, options);
      return detail.tracks;
    },

    async getPlaylistDetail(playlistId, options = {}) {
      return loadQQPlaylistDetail(runtime, cache, playlistId, options);
    },

    async getSongUrl(song, quality) {
      return getSongUrl(runtime, cache, song, quality);
    },

    async getLyrics(song) {
      return getLyrics(runtime, cache, song);
    },

    async setSongLiked(song, liked) {
      return setSongLiked(runtime, cache, song, liked);
    },

    async addSongToPlaylist(song, playlistId) {
      return mutatePlaylist(runtime, cache, song, playlistId, 'add');
    },

    async removeSongFromPlaylist(song, playlistId) {
      return mutatePlaylist(runtime, cache, song, playlistId, 'remove');
    }
  };
}

export const qqProvider = createQQProvider();

const SEARCH_ENTITY_TYPES: readonly SearchEntityType[] = ['song', 'artist', 'album', 'playlist'];

async function getSearchSuggestions(
  runtime: QQRuntime,
  cache: CacheStore,
  keyword: string,
  options: SearchSuggestionOptions
): Promise<SearchSuggestion[]> {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) {
    return [];
  }

  const limit = normalizeSearchSuggestionLimit(options.limit);
  const cacheKey = CACHE_KEYS.searchSuggestions('qq', normalizedKeyword, limit);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.searchSuggestions, async () => {
    const response = await runtime.requestJson<QQSmartboxResponse>({
      partition: QQ_LOGIN_PARTITION,
      url: createSmartboxUrl(normalizedKeyword),
      anonymous: true
    });
    assertQQSearchSuccess(response, 'QQ音乐搜索提示请求失败');
    return getQQSmartboxSuggestions(response).slice(0, limit);
  });
}

async function getHotSearches(
  runtime: QQRuntime,
  cache: CacheStore,
  options: SearchSuggestionOptions
): Promise<SearchHotSearch[]> {
  const limit = normalizeSearchSuggestionLimit(options.limit);
  const cacheKey = CACHE_KEYS.searchHotSearches('qq', limit);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.searchHotSearches, async () => {
    const response = await runtime.requestJson<QQHotSearchResponse>({
      partition: QQ_LOGIN_PARTITION,
      url: createHotSearchUrl(),
      anonymous: true
    });
    assertQQSearchSuccess(response, 'QQ音乐热搜请求失败');
    return getQQHotSearches(response).slice(0, limit);
  });
}

async function searchEntities(
  runtime: QQRuntime,
  cache: CacheStore,
  keyword: string,
  options: SearchEntityOptions
): Promise<SearchEntityResults> {
  const query = normalizeSearchEntityQuery(keyword, options, 'QQ音乐搜索参数无效');
  if (!query.keyword) {
    return createQQEmptySearchEntityResults('');
  }

  const cacheKey = CACHE_KEYS.searchEntities('qq', query.keyword, query.limit, query.offset, query.entityTypes);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  const cached = cache.get<SearchEntityResults>(cacheKey);
  if (cached) {
    return cached;
  }

  const result: SearchEntityResults = await (async (): Promise<SearchEntityResults> => {
    const requestedTypes = new Set(query.entityTypes);
    const [songs, albums, artists] = await Promise.all([
      requestedTypes.has('song')
        ? resolveQQSearchSection(() => getQQSongSearchSection(runtime, query))
        : Promise.resolve(createSearchEntitySection<Song>(true)),
      requestedTypes.has('album')
        ? resolveQQSearchSection(() => getQQAlbumSearchSection(runtime, query))
        : Promise.resolve(createSearchEntitySection<AlbumSummary>(true)),
      requestedTypes.has('artist')
        ? resolveQQSearchSection(() => getQQArtistSearchSection(runtime, query))
        : Promise.resolve(createSearchEntitySection<ArtistSummary>(true))
    ]);

    return {
      providerId: 'qq',
      keyword: query.keyword,
      sections: {
        songs,
        artists,
        albums,
        // QQ 无歌单搜索接口（search_for_qq_cp 类型码 0=歌曲/8=专辑，smartbox 无 playlist group，
        // wesearchface H5 接口已废弃），如实标记不可用
        playlists: createSearchEntitySection<DiscoveredPlaylist>(false)
      }
    };
  })();
  if (!hasSearchEntityErrors(result)) {
    cache.set(cacheKey, result, CACHE_TTL_MS.searchEntities);
  }
  return result;
}

function createQQEmptySearchEntityResults(keyword: string): SearchEntityResults {
  return {
    providerId: 'qq',
    keyword,
    sections: {
      songs: createSearchEntitySection<Song>(true),
      artists: createSearchEntitySection<ArtistSummary>(false),
      albums: createSearchEntitySection<AlbumSummary>(true),
      playlists: createSearchEntitySection<DiscoveredPlaylist>(false)
    }
  };
}

async function getQQSongSearchSection(
  runtime: QQRuntime,
  query: NormalizedSearchEntityQuery
): Promise<SearchEntitySection<Song>> {
  const response = await runtime.requestJson<QQSearchResponse>({
    partition: QQ_LOGIN_PARTITION,
    url: createSearchUrl(query.keyword, query.limit, query.offset, 0),
    anonymous: true
  });
  assertQQSearchSuccess(response, 'QQ音乐歌曲搜索请求失败');

  const rawSongs = getSearchSongList(response);
  const songs = rawSongs
    .map((track) => mapTrack(track, '', ''))
    .filter((song): song is Song => Boolean(song));
  if (rawSongs.length > 0 && songs.length === 0) {
    throw new Error('QQ音乐歌曲搜索数据无效');
  }

  return createSearchEntitySection(true, songs, getQQSearchTotal(response.data?.song), query);
}

async function getQQAlbumSearchSection(
  runtime: QQRuntime,
  query: NormalizedSearchEntityQuery
): Promise<SearchEntitySection<AlbumSummary>> {
  const response = await runtime.requestJson<QQSearchResponse>({
    partition: QQ_LOGIN_PARTITION,
    url: createSearchUrl(query.keyword, query.limit, query.offset, 8),
    anonymous: true
  });
  assertQQSearchSuccess(response, 'QQ音乐专辑搜索请求失败');

  const rawAlbums = response.data?.album?.list ?? [];
  const albums = rawAlbums
    .map(mapQQSearchAlbum)
    .filter((album): album is AlbumSummary => Boolean(album));
  if (rawAlbums.length > 0 && albums.length === 0) {
    throw new Error('QQ音乐专辑搜索数据无效');
  }

  return createSearchEntitySection(true, albums, getQQSearchTotal(response.data?.album), query);
}

/**
 * QQ 无正式的歌手搜索列表接口（search_for_qq_cp 仅支持歌曲 t=0 与专辑 t=8）。
 * 退路方案：使用 smartbox 的热门歌手条目作为第一页（已验证字段结构）。
 */
async function getQQArtistSearchSection(
  runtime: QQRuntime,
  query: NormalizedSearchEntityQuery
): Promise<SearchEntitySection<ArtistSummary>> {
  const response = await runtime.requestJson<QQSmartboxResponse>({
    partition: QQ_LOGIN_PARTITION,
    url: createSmartboxUrl(query.keyword),
    anonymous: true
  });
  if (response.code !== undefined && response.code !== 0) {
    throw new Error('QQ音乐歌手搜索请求失败');
  }

  const rawArtists = getQQSmartboxItems(response.data?.singer);
  const artists = rawArtists
    .map(mapQQSmartboxArtist)
    .filter((artist): artist is ArtistSummary => Boolean(artist));
  if (rawArtists.length > 0 && artists.length === 0) {
    throw new Error('QQ音乐歌手搜索数据无效');
  }

  // smartbox 只返回热门条目，无完整分页；hasMore=false，total=artists.length
  return createSearchEntitySection(true, artists, artists.length, query);
}

function mapQQSmartboxArtist(item: QQSmartboxItem): ArtistSummary | null {
  const platformArtistId = firstText(item.mid, item.singerMid, item.singer_mid, item.singermid, item.id);
  const name = firstText(item.name, item.singer, item.singername, item.artistName);
  if (!platformArtistId || !name) {
    return null;
  }

  const imageUrl = normalizeImageUrl(firstText(item.pic, item.picurl, item.photo, item.imageUrl, item.avatarUrl));
  return {
    id: `qq:artist:${platformArtistId}`,
    providerId: 'qq',
    platformArtistId,
    name,
    coverTone: QQ_COVER_TONE,
    ...(imageUrl ? { imageUrl } : {}),
    ...(imageUrl ? {} : { imageUrl: createArtistImageUrl(platformArtistId) }),
    sourceLabel: QQ_SOURCE_LABEL
  };
}

function mapQQSearchAlbum(album: QQSearchAlbum): AlbumSummary | null {
  const platformAlbumId = firstText(album.albumMID, album.albumMid, album.mid, album.pmid);
  const title = firstText(album.albumName, album.albumname, album.name, album.title);
  if (!platformAlbumId || !title) {
    return null;
  }

  const coverUrl = normalizeImageUrl(firstText(album.albumPic, album.picUrl, album.picurl, album.cover))
    || createAlbumCoverUrl(platformAlbumId);
  const trackCount = normalizeNonNegativeNumber(album.songNum ?? album.songnum ?? album.totalNum ?? album.totalnum);
  return {
    id: `qq:album:${platformAlbumId}`,
    providerId: 'qq',
    platformAlbumId,
    title,
    artistName: firstText(album.singerName, album.singername, album.artistName, album.artist) || '未知歌手',
    coverTone: QQ_COVER_TONE,
    ...(coverUrl ? { coverUrl } : {}),
    ...(firstText(album.publicTime, album.publishDate, album.releaseDate) ? {
      releaseDate: firstText(album.publicTime, album.publishDate, album.releaseDate)
    } : {}),
    ...(trackCount !== undefined ? { trackCount } : {}),
    sourceLabel: QQ_SOURCE_LABEL
  };
}

async function resolveQQSearchSection<T>(
  load: () => Promise<SearchEntitySection<T>>
): Promise<SearchEntitySection<T>> {
  try {
    return await load();
  } catch (error) {
    return {
      ...createSearchEntitySection<T>(true),
      errorMessage: getSearchErrorMessage(error)
    };
  }
}

function createSearchEntitySection<T>(
  available: boolean,
  items: T[] = [],
  total = 0,
  query?: Pick<NormalizedSearchEntityQuery, 'limit' | 'offset'>
): SearchEntitySection<T> {
  return {
    available,
    items,
    total,
    hasMore: query ? query.offset + items.length < total : false,
    errorMessage: null
  };
}

function getQQSearchTotal(value: QQSearchSection | undefined): number {
  return normalizeNonNegativeNumber(value?.totalnum ?? value?.totalNum ?? value?.total) ?? 0;
}

function getSearchErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '搜索请求失败';
}

function hasSearchEntityErrors(result: SearchEntityResults): boolean {
  return Object.values(result.sections).some((section) => section.errorMessage !== null);
}

interface NormalizedSearchEntityQuery {
  keyword: string;
  limit: number;
  offset: number;
  entityTypes: SearchEntityType[];
}

function normalizeSearchEntityQuery(
  keyword: string,
  options: SearchEntityOptions,
  errorMessage: string
): NormalizedSearchEntityQuery {
  const normalizedKeyword = keyword.trim();
  const limit = options.limit ?? 30;
  const offset = options.offset ?? 0;
  if (
    !Number.isInteger(limit)
    || limit < 1
    || limit > 50
    || !Number.isInteger(offset)
    || offset < 0
  ) {
    throw new Error(errorMessage);
  }

  const entityTypes = normalizeSearchEntityTypes(options.entityTypes, errorMessage);
  return { keyword: normalizedKeyword, limit, offset, entityTypes };
}

function normalizeSearchEntityTypes(
  entityTypes: SearchEntityType[] | undefined,
  errorMessage: string
): SearchEntityType[] {
  if (!entityTypes) {
    return [...SEARCH_ENTITY_TYPES];
  }

  const uniqueTypes = [...new Set(entityTypes)];
  if (uniqueTypes.length === 0 || uniqueTypes.some((type) => !SEARCH_ENTITY_TYPES.includes(type))) {
    throw new Error(errorMessage);
  }
  return uniqueTypes;
}

function normalizeSearchSuggestionLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 10;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error('QQ音乐搜索提示参数无效');
  }
  return limit;
}

function assertQQSearchSuccess(response: { code?: number }, errorMessage: string): void {
  if (response.code !== undefined && response.code !== 0) {
    throw new Error(errorMessage);
  }
}

function getQQSmartboxSuggestions(response: QQSmartboxResponse): SearchSuggestion[] {
  const groups: Array<{ source: QQSmartboxGroup | undefined; kind: SearchEntityType }> = [
    { source: response.data?.song, kind: 'song' },
    { source: response.data?.singer, kind: 'artist' },
    { source: response.data?.album, kind: 'album' },
    { source: response.data?.playlist, kind: 'playlist' }
  ];

  const suggestionGroups = groups.map(({ source, kind }) => getQQSmartboxItems(source)
    .map((item) => mapQQSmartboxSuggestion(item, kind))
    .filter((suggestion): suggestion is SearchSuggestion => Boolean(suggestion)));
  return uniqueSearchSuggestions(interleaveSearchSuggestionGroups(suggestionGroups));
}

function getQQSmartboxItems(group: QQSmartboxGroup | undefined): QQSmartboxItem[] {
  return [...(group?.itemlist ?? []), ...(group?.list ?? []), ...(group?.items ?? [])];
}

function mapQQSmartboxSuggestion(item: QQSmartboxItem, kind: SearchEntityType): SearchSuggestion | null {
  const title = firstText(item.name, item.title, item.songname, item.albumname, item.singername);
  if (!title) {
    return null;
  }

  const identity = firstText(item.mid, item.id, item.albumMID, item.albumMid, item.singerMid, item.singermid) || title;
  const subtitle = kind === 'song'
    ? firstText(item.singername, item.singer, item.artistName)
    : kind === 'album'
      ? firstText(item.singername, item.singer, item.artistName)
      : undefined;
  const coverUrl = kind === 'album'
    ? normalizeImageUrl(firstText(item.pic, item.picurl, item.imageUrl))
      || (firstText(item.albumMID, item.albumMid) ? createAlbumCoverUrl(firstText(item.albumMID, item.albumMid)) : '')
    : kind === 'artist'
      ? normalizeImageUrl(firstText(item.pic, item.picurl, item.imageUrl, item.avatarUrl))
        || (firstText(item.mid, item.singerMid, item.singermid) ? createArtistImageUrl(firstText(item.mid, item.singerMid, item.singermid)) : '')
      : '';

  return {
    id: `qq:suggestion:${kind}:${encodeURIComponent(identity)}`,
    providerId: 'qq',
    keyword: title,
    title,
    kind,
    ...(subtitle ? { subtitle } : {}),
    ...(coverUrl ? { coverUrl } : {})
  };
}

function uniqueSearchSuggestions(suggestions: SearchSuggestion[]): SearchSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.kind}:${suggestion.keyword.toLocaleLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getQQHotSearches(response: QQHotSearchResponse): SearchHotSearch[] {
  const rawItems = response.data?.hotkey ?? response.data?.hotkeys ?? [];
  const hotSearches = rawItems
    .map((item, index) => mapQQHotSearch(item, index))
    .filter((item): item is SearchHotSearch => Boolean(item));
  return uniqueHotSearches(hotSearches);
}

function mapQQHotSearch(item: QQHotSearchItem | string, index: number): SearchHotSearch | null {
  const keyword = typeof item === 'string'
    ? item.trim()
    : firstText(item.k, item.key, item.keyword, item.searchWord, item.name, item.title);
  if (!keyword) {
    return null;
  }

  const title = typeof item === 'string' ? keyword : firstText(item.n, item.name, item.title) || keyword;
  const score = typeof item === 'string' ? undefined : normalizeNonNegativeNumber(item.score ?? item.hot);
  return {
    id: `qq:hot:${encodeURIComponent(keyword)}`,
    providerId: 'qq',
    keyword,
    title,
    rank: index + 1,
    ...(score !== undefined ? { score } : {}),
    ...(typeof item === 'string' ? {} : firstText(item.iconUrl, item.icon) ? { iconUrl: firstText(item.iconUrl, item.icon) } : {})
  };
}

function uniqueHotSearches(items: SearchHotSearch[]): SearchHotSearch[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.keyword.toLocaleLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function getRecommendationHome(
  runtime: QQRuntime,
  cache: CacheStore,
  options: ProviderFetchOptions
): Promise<RecommendationHomeFeed> {
  if (options.forceRefresh) {
    cache.delete(CACHE_KEYS.loginStatus('qq'));
  }

  const loggedIn = (await getLoginStatus(runtime, cache)).loggedIn;
  const cacheKey = CACHE_KEYS.recommendationHome('qq', loggedIn);
  // 先读走上一次成功写入的首页数据：实时刷新失败时回退到旧数据，
  // 避免 forceRefresh 删掉良好缓存后本次请求失败导致“发现音乐整页空白”
  const staleFeed = options.forceRefresh ? cache.peek<RecommendationHomeFeed>(cacheKey) : null;
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  try {
    return await cache.getOrSet(cacheKey, CACHE_TTL_MS.recommendationHome, async () => ({
      providerId: 'qq',
      loggedIn,
      dailySongs: [],
      newSongs: await getQQNewSongs(runtime),
      moduleResults: {
        daily: { status: 'skipped', errorMessage: null },
        new: { status: 'fulfilled', errorMessage: null }
      }
    }));
  } catch (error) {
    if (staleFeed) return staleFeed;
    throw error;
  }
}

async function getQQNewSongs(runtime: QQRuntime): Promise<Song[]> {
  const response = await runtime.requestJson<QQNewSongResponse>({
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
  if (response.code !== 0 || response.new_song?.code !== 0) {
    throw new Error('QQ 音乐新歌推荐请求失败');
  }
  const songlist = response.new_song.data?.songlist;
  if (!Array.isArray(songlist)) {
    throw new Error('QQ 音乐新歌推荐数据无效');
  }

  return songlist
    .map((track) => mapTrack(track, '', '', QQ_RECOMMENDATION_CONTEXT))
    .filter((song): song is Song => Boolean(song));
}

async function getNewAlbums(
  runtime: QQRuntime,
  cache: CacheStore,
  options: ProviderFetchOptions
): Promise<AlbumSummary[]> {
  const cacheKey = CACHE_KEYS.releaseCatalog('qq');
  const staleAlbums = options.forceRefresh ? cache.peek<AlbumSummary[]>(cacheKey) : null;
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  try {
    return await cache.getOrSet(cacheKey, CACHE_TTL_MS.releaseCatalog, async () => {
      const response = await runtime.requestJson<QQNewAlbumsResponse>({
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
      if (response.code !== 0 || response.new_album?.code !== 0) {
        throw new Error('QQ 音乐新碟速递请求失败');
      }

      const rawAlbums = response.new_album.data?.albums;
      if (!Array.isArray(rawAlbums)) {
        throw new Error('QQ 音乐新碟速递数据无效');
      }
      const albums = uniqueAlbums(rawAlbums.map(mapQQNewAlbum).filter((album): album is AlbumSummary => Boolean(album)));
      if (rawAlbums.length > 0 && albums.length === 0) {
        throw new Error('QQ 音乐新碟速递数据无效');
      }
      return albums.slice(0, 12);
    });
  } catch (error) {
    if (staleAlbums) return staleAlbums;
    throw error;
  }
}

function mapQQNewAlbum(album: QQNewAlbum): AlbumSummary | null {
  const platformAlbumId = firstText(album.mid);
  const title = firstText(album.name);
  if (!/^[A-Za-z0-9]+$/.test(platformAlbumId) || !title) {
    return null;
  }

  const releaseDate = firstText(album.release_time);
  const artistName = album.singers
    ?.map((singer) => firstText(singer.name))
    .filter(Boolean)
    .join(' / ');
  return {
    id: `qq:album:${platformAlbumId}`,
    providerId: 'qq',
    platformAlbumId,
    title,
    artistName: artistName || '未知歌手',
    coverTone: QQ_COVER_TONE,
    coverUrl: createAlbumCoverUrl(platformAlbumId),
    ...(releaseDate ? { releaseDate } : {}),
    sourceLabel: QQ_SOURCE_LABEL
  };
}

function uniqueAlbums(albums: readonly AlbumSummary[]): AlbumSummary[] {
  const selected: AlbumSummary[] = [];
  const seen = new Set<string>();
  for (const album of albums) {
    if (seen.has(album.id)) {
      continue;
    }
    seen.add(album.id);
    selected.push(album);
  }
  return selected;
}

const QQ_RECOMMENDATION_CONTEXT: SourceContext = {
  type: 'recommendation',
  providerId: 'qq'
};

async function getArtistDetail(
  runtime: QQRuntime,
  cache: CacheStore,
  artistId: string,
  options: ProviderFetchOptions
): Promise<ArtistDetail> {
  const platformArtistId = parseQQArtistId(artistId);
  const providerScopedArtistId = `qq:artist:${platformArtistId}`;
  const cacheKey = CACHE_KEYS.artistDetail('qq', providerScopedArtistId);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.artistDetail, async () => {
    const response = await runtime.requestJson<QQArtistDetailResponse>({
      partition: QQ_LOGIN_PARTITION,
      url: createQQArtistDetailUrl(platformArtistId)
    });
    if (
      response.code !== 0
      || response.singer_detail?.code !== 0
      || response.singer_albums?.code !== 0
      || response.singer_songs?.code !== 0
    ) {
      throw new Error('QQ 音乐歌手详情请求失败');
    }

    const singer = response.singer_detail.data?.singer_list?.[0];
    const name = firstText(singer?.basic_info?.name);
    if (!singer || firstText(singer.basic_info?.singer_mid) !== platformArtistId || !name) {
      throw new Error('QQ 音乐歌手详情数据无效');
    }

    const sourceContext: SourceContext = {
      type: 'artist',
      providerId: 'qq',
      artistId: providerScopedArtistId,
      artistName: name
    };
    const imageUrl = normalizeImageUrl(firstText(singer.pic?.pic)) || createArtistImageUrl(platformArtistId);
    const foreignName = firstText(singer.ex_info?.foreign_name);
    const albumData = response.singer_albums.data;
    const songData = response.singer_songs.data;

    return {
      id: providerScopedArtistId,
      providerId: 'qq',
      platformArtistId,
      name,
      aliases: foreignName && foreignName !== name ? [foreignName] : [],
      description: firstText(singer.ex_info?.desc),
      coverTone: QQ_COVER_TONE,
      ...(imageUrl ? { imageUrl } : {}),
      sourceLabel: QQ_SOURCE_LABEL,
      ...(normalizeNonNegativeNumber(songData?.totalNum) !== undefined
        ? { songCount: normalizeNonNegativeNumber(songData?.totalNum) }
        : {}),
      ...(normalizeNonNegativeNumber(albumData?.total) !== undefined
        ? { albumCount: normalizeNonNegativeNumber(albumData?.total) }
        : {}),
      topSongs: (songData?.songList ?? [])
        .map((song) => mapTrack(song, '', '', sourceContext))
        .filter((song): song is Song => Boolean(song)),
      albums: (albumData?.albumList ?? [])
        .map((album) => mapQQAlbumSummary(album, name))
        .filter((album): album is AlbumSummary => Boolean(album))
    };
  });
}

async function getArtistSongsPage(
  runtime: QQRuntime,
  artistId: string,
  offset: number,
  _options: ProviderFetchOptions
): Promise<ArtistSongsPage> {
  const platformArtistId = parseQQArtistId(artistId);
  const providerScopedArtistId = `qq:artist:${platformArtistId}`;
  const limit = 50;
  const response = await runtime.requestJson<QQArtistSongsResponse>({
    partition: QQ_LOGIN_PARTITION,
    url: createQQArtistSongsUrl(platformArtistId, offset, limit)
  });
  if (response.code !== 0 || response.singer_songs?.code !== 0) {
    throw new Error('QQ 音乐歌手歌曲列表请求失败');
  }

  const songData = response.singer_songs.data;
  const sourceContext: SourceContext = {
    type: 'artist',
    providerId: 'qq',
    artistId: providerScopedArtistId,
    artistName: ''
  };
  const songs = (songData?.songList ?? [])
    .map((song) => mapTrack(song, '', '', sourceContext))
    .filter((song): song is Song => Boolean(song));
  return {
    songs,
    hasMore: Boolean(songData?.totalNum != null && offset + songs.length < songData.totalNum),
    nextOffset: offset + songs.length,
    ...(normalizeNonNegativeNumber(songData?.totalNum) !== undefined
      ? { total: normalizeNonNegativeNumber(songData?.totalNum) }
      : {})
  };
}

function createQQArtistSongsUrl(artistMid: string, begin: number, num: number): string {
  return createQQMusicuUrl({
    singer_songs: {
      module: 'musichall.song_list_server',
      method: 'GetSingerSongList',
      param: {
        singerMid: artistMid,
        begin,
        num,
        order: 1
      }
    }
  });
}

async function getAlbumDetail(
  runtime: QQRuntime,
  cache: CacheStore,
  albumId: string,
  options: ProviderFetchOptions
): Promise<AlbumDetail> {
  const platformAlbumId = parseQQAlbumId(albumId);
  const providerScopedAlbumId = `qq:album:${platformAlbumId}`;
  const cacheKey = CACHE_KEYS.albumDetail('qq', providerScopedAlbumId);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.albumDetail, async () => {
    const response = await runtime.requestJson<QQAlbumDetailResponse>({
      partition: QQ_LOGIN_PARTITION,
      url: createQQAlbumDetailUrl(platformAlbumId)
    });
    if (response.code !== 0 || response.album_detail?.code !== 0 || response.album_songs?.code !== 0) {
      throw new Error('QQ 音乐专辑详情请求失败');
    }

    const detailData = response.album_detail.data;
    const basicInfo = detailData?.basicInfo;
    const title = firstText(basicInfo?.albumName);
    if (!basicInfo || firstText(basicInfo.albumMid) !== platformAlbumId || !title) {
      throw new Error('QQ 音乐专辑详情数据无效');
    }

    const artists = (detailData?.singer?.singerList ?? [])
      .map(mapQQArtistReference)
      .filter((artist): artist is ArtistReference => Boolean(artist));
    const artistName = artists.map((artist) => artist.name).join(' / ') || '未知歌手';
    const songData = response.album_songs.data;
    const albumSummary = mapQQAlbumSummary({
      albumMid: platformAlbumId,
      albumName: title,
      publishDate: basicInfo.publishDate,
      totalNum: songData?.totalNum,
      albumType: basicInfo.albumType,
      singerName: artistName
    }, artistName);
    if (!albumSummary) {
      throw new Error('QQ 音乐专辑详情数据无效');
    }

    const sourceContext: SourceContext = {
      type: 'album',
      providerId: 'qq',
      albumId: providerScopedAlbumId,
      albumTitle: title
    };

    return {
      ...albumSummary,
      description: firstText(basicInfo.desc),
      artists,
      tracks: (songData?.songList ?? [])
        .map((song) => mapTrack(song, '', '', sourceContext))
        .filter((song): song is Song => Boolean(song))
    };
  });
}

function parseQQArtistId(artistId: string): string {
  const prefix = 'qq:artist:';
  const platformArtistId = artistId.startsWith(prefix) ? artistId.slice(prefix.length).trim() : '';
  if (!/^[A-Za-z0-9]+$/.test(platformArtistId)) {
    throw new Error('QQ 音乐歌手 ID 无效');
  }

  return platformArtistId;
}

function parseQQAlbumId(albumId: string): string {
  const prefix = 'qq:album:';
  const platformAlbumId = albumId.startsWith(prefix) ? albumId.slice(prefix.length).trim() : '';
  if (!/^[A-Za-z0-9]+$/.test(platformAlbumId)) {
    throw new Error('QQ 音乐专辑 ID 无效');
  }

  return platformAlbumId;
}

function mapQQAlbumSummary(album: QQSingerAlbum, fallbackArtistName: string): AlbumSummary | null {
  const platformAlbumId = firstText(album.albumMid);
  const title = firstText(album.albumName);
  if (!platformAlbumId || !title) {
    return null;
  }

  const releaseDate = firstText(album.publishDate);
  const trackCount = normalizeNonNegativeNumber(album.totalNum);
  const albumType = firstText(album.albumType);

  return {
    id: `qq:album:${platformAlbumId}`,
    providerId: 'qq',
    platformAlbumId,
    title,
    artistName: firstText(album.singerName) || fallbackArtistName || '未知歌手',
    coverTone: QQ_COVER_TONE,
    coverUrl: createAlbumCoverUrl(platformAlbumId),
    ...(releaseDate ? { releaseDate } : {}),
    ...(trackCount !== undefined ? { trackCount } : {}),
    ...(albumType ? { albumType } : {}),
    sourceLabel: QQ_SOURCE_LABEL
  };
}

async function getPlaylistCategories(
  runtime: QQRuntime,
  cache: CacheStore,
  options: ProviderFetchOptions
): Promise<PlaylistCategory[]> {
  const cacheKey = CACHE_KEYS.playlistCategories('qq');
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  const categories = await cache.getOrSet(cacheKey, CACHE_TTL_MS.playlistCategories, async () => {
    const response = await runtime.requestJson<QQPlaylistCategoriesResponse>({
      partition: QQ_LOGIN_PARTITION,
      url: createPlaylistCategoriesUrl(),
      anonymous: true
    });
    if (response.code !== 0) {
      throw new Error('QQ 音乐歌单分类请求失败');
    }

    const categories: PlaylistCategory[] = [{ id: 'all', providerId: 'qq', name: '全部' }];
    const seenCategoryIds = new Set<string>(['all']);

    for (const group of response.data?.categories ?? []) {
      if (!isQQCategoryUsable(group.usable)) {
        continue;
      }

      const groupName = decodeHtmlEntities(firstText(group.categoryGroupName));
      for (const item of group.items ?? []) {
        if (!isQQCategoryUsable(item.usable)) {
          continue;
        }

        const platformCategoryId = firstText(item.categoryId);
        const name = decodeHtmlEntities(firstText(item.categoryName));
        if (!platformCategoryId || !name || platformCategoryId === '10000000' || name.includes('全部')) {
          continue;
        }

        if (seenCategoryIds.has(platformCategoryId)) {
          continue;
        }

        seenCategoryIds.add(platformCategoryId);
        categories.push({
          id: platformCategoryId,
          providerId: 'qq',
          name,
          ...(groupName ? { group: groupName } : {}),
          hot: groupName.includes('热门')
        });
      }
    }

    return categories;
  });

  return categories.map((category) => ({
    ...category,
    name: decodeHtmlEntities(category.name),
    ...(category.group ? { group: decodeHtmlEntities(category.group) } : {})
  }));
}

async function getDiscoveredPlaylists(
  runtime: QQRuntime,
  cache: CacheStore,
  query: PlaylistDiscoveryQuery,
  options: ProviderFetchOptions
): Promise<PlaylistDiscoveryPage> {
  const normalizedQuery = normalizePlaylistDiscoveryQuery(query, 'QQ 音乐歌单发现参数无效');
  const cacheKey = CACHE_KEYS.playlistDiscoveryPage(
    'qq',
    normalizedQuery.categoryId,
    normalizedQuery.limit,
    normalizedQuery.offset
  );
  if (options.forceRefresh) {
    cache.deleteByPrefix(CACHE_KEYS.playlistDiscoveryPagePrefix('qq', normalizedQuery.categoryId));
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.playlistDiscoveryPage, async () => {
    const response = await runtime.requestJson<QQPlaylistDiscoveryResponse>({
      partition: QQ_LOGIN_PARTITION,
      url: createPlaylistDiscoveryUrl(normalizedQuery),
      anonymous: true
    });
    if (response.code !== 0) {
      logQQDiagnostic('playlist discovery rejected', {
        code: response.code ?? null,
        hasData: Boolean(response.data)
      });
      throw new Error('QQ 音乐歌单列表请求失败');
    }

    const playlists = (response.data?.list ?? [])
      .map(mapDiscoveredPlaylist)
      .filter((playlist): playlist is DiscoveredPlaylist => Boolean(playlist));
    const total = normalizeNonNegativeNumber(response.data?.sum) ?? normalizedQuery.offset + playlists.length;
    const inclusiveEnd = normalizeNonNegativeNumber(response.data?.ein);

    return {
      providerId: 'qq',
      categoryId: normalizedQuery.categoryId,
      playlists,
      offset: normalizedQuery.offset,
      limit: normalizedQuery.limit,
      total,
      hasMore: inclusiveEnd !== undefined
        ? inclusiveEnd + 1 < total
        : normalizedQuery.offset + playlists.length < total
    };
  });
}

function mapDiscoveredPlaylist(playlist: QQDiscoveredPlaylistItem): DiscoveredPlaylist | null {
  const platformPlaylistId = firstText(playlist.dissid);
  const title = firstText(playlist.dissname);
  if (!platformPlaylistId || !title) {
    return null;
  }

  const coverUrl = normalizeImageUrl(firstText(playlist.imgurl));
  const creatorName = firstText(
    playlist.creator?.name,
    playlist.creator?.nick,
    playlist.creator?.nickname,
    playlist.creator?.creator_name
  );
  const playCount = normalizeNonNegativeNumber(playlist.listennum);

  return {
    id: createProviderScopedId(platformPlaylistId),
    providerId: 'qq',
    platformPlaylistId,
    title,
    description: firstText(playlist.introduction),
    songIds: [],
    coverTone: QQ_COVER_TONE,
    ...(coverUrl ? { coverUrl } : {}),
    sourceLabel: QQ_SOURCE_LABEL,
    ...(creatorName ? { creatorName } : {}),
    ...(playCount !== undefined ? { playCount } : {})
  };
}

function isQQCategoryUsable(value: unknown): boolean {
  return value === undefined || value === true || Number(value) !== 0;
}

async function getCharts(
  runtime: QQRuntime,
  cache: CacheStore,
  options: ProviderFetchOptions
): Promise<ChartSummary[]> {
  const cacheKey = CACHE_KEYS.chartList('qq');
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.chartList, async () => {
    const response = await runtime.requestJson<QQToplistResponse>({
      partition: QQ_LOGIN_PARTITION,
      url: createToplistUrl('GetAll', {})
    });

    return (response.req_1?.data?.group ?? [])
      .flatMap((group) => group.toplist ?? [])
      .map(mapChartSummary)
      .filter((chart): chart is ChartSummary => Boolean(chart));
  });
}

async function getChartTracks(
  runtime: QQRuntime,
  cache: CacheStore,
  chartId: string,
  options: ProviderFetchOptions
): Promise<Song[]> {
  const topId = parseQQChartId(chartId);
  const cacheKey = CACHE_KEYS.chartTracks('qq', chartId);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.chartTracks, async () => {
    const response = await runtime.requestJson<QQToplistResponse>({
      partition: QQ_LOGIN_PARTITION,
      url: createToplistUrl('GetDetail', { topId, offset: 0, num: 100 })
    });
    const detail = response.req_1?.data;
    const chartTitle = firstText(detail?.data?.title) || 'QQ 音乐排行榜';

    return (detail?.songInfoList ?? [])
      .map((track) => mapTrack(track, chartId, chartTitle))
      .filter((song): song is Song => Boolean(song))
      .map((song) => song.platformMediaId ? song : { ...song, platformMediaId: song.platformSongId });
  });
}

function parseQQChartId(chartId: string): number {
  const prefix = 'qq:chart:';
  const platformChartId = chartId.startsWith(prefix) ? chartId.slice(prefix.length).trim() : '';
  if (!/^[1-9]\d*$/.test(platformChartId)) {
    throw new Error('QQ 音乐排行榜 ID 无效');
  }

  const topId = Number(platformChartId);
  if (!Number.isSafeInteger(topId)) {
    throw new Error('QQ 音乐排行榜 ID 无效');
  }

  return topId;
}

function mapChartSummary(chart: QQToplistItem): ChartSummary | null {
  const platformChartId = firstText(chart.topId);
  const title = firstText(chart.title);
  if (!platformChartId || !title) {
    return null;
  }

  return {
    id: `qq:chart:${platformChartId}`,
    providerId: 'qq',
    platformChartId,
    title,
    description: firstText(chart.intro),
    songIds: [],
    coverTone: QQ_COVER_TONE,
    coverUrl: normalizeImageUrl(firstText(chart.frontPicUrl, chart.headPicUrl)) || undefined,
    sourceLabel: QQ_SOURCE_LABEL,
    updatedAt: firstText(chart.updateTime, chart.period) || undefined,
    updateLabel: firstText(chart.updateTips) || undefined
  };
}

function createQQArtistDetailUrl(artistMid: string): string {
  return createQQMusicuUrl({
    singer_detail: {
      module: 'music.musichallSinger.SingerInfoInter',
      method: 'GetSingerDetail',
      param: {
        singer_mids: [artistMid],
        pic: 1,
        group_singer: 1,
        wiki_singer: 1,
        ex_singer: 1
      }
    },
    singer_albums: {
      module: 'music.musichallAlbum.AlbumListServer',
      method: 'GetAlbumList',
      param: {
        singerMid: artistMid,
        order: 0,
        begin: 0,
        num: 50
      }
    },
    singer_songs: {
      module: 'musichall.song_list_server',
      method: 'GetSingerSongList',
      param: {
        singerMid: artistMid,
        begin: 0,
        num: 50,
        order: 1
      }
    }
  });
}

function createQQAlbumDetailUrl(albumMid: string): string {
  return createQQMusicuUrl({
    album_detail: {
      module: 'music.musichallAlbum.AlbumInfoServer',
      method: 'GetAlbumDetail',
      param: { albumMid }
    },
    album_songs: {
      module: 'music.musichallAlbum.AlbumSongList',
      method: 'GetAlbumSongList',
      param: {
        albumMid,
        begin: 0,
        num: 500,
        order: 2
      }
    }
  });
}

function createQQMusicuUrl(
  requests: Record<string, QQMusicuRequest>,
  commOverrides: Record<string, unknown> = {}
): string {
  const url = new URL(QQ_SONG_URL);
  const data = {
    comm: {
      ct: 24,
      cv: 0,
      ...commOverrides
    },
    ...requests
  };

  url.searchParams.set('format', 'json');
  url.searchParams.set('inCharset', 'utf8');
  url.searchParams.set('outCharset', 'utf-8');
  url.searchParams.set('notice', '0');
  url.searchParams.set('platform', 'yqq.json');
  url.searchParams.set('needNewCode', '1');
  url.searchParams.set('data', JSON.stringify(data));
  return url.toString();
}

function createToplistUrl(method: 'GetAll' | 'GetDetail', param: Record<string, unknown>): string {
  const url = new URL(QQ_SONG_URL);
  const data = {
    comm: {
      ct: 24,
      cv: 0
    },
    req_1: {
      module: 'musicToplist.ToplistInfoServer',
      method,
      param
    }
  };

  url.searchParams.set('format', 'json');
  url.searchParams.set('inCharset', 'utf8');
  url.searchParams.set('outCharset', 'utf-8');
  url.searchParams.set('notice', '0');
  url.searchParams.set('platform', 'yqq.json');
  url.searchParams.set('needNewCode', '1');
  url.searchParams.set('data', JSON.stringify(data));
  return url.toString();
}

async function getUserPlaylists(
  runtime: QQRuntime,
  cache: CacheStore,
  options: ProviderFetchOptions
): Promise<Playlist[]> {
  const cacheKey = CACHE_KEYS.providerPlaylists('qq');
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.providerPlaylists, async () => {
    const sessionIdentity = await getQQSessionIdentity(runtime, QQ_USER_PLAYLIST_URL);
    if (!sessionIdentity.loggedIn || !sessionIdentity.userId) {
      throw new Error('QQ 音乐未登录');
    }

    const response = await runtime.requestJson<QQPlaylistListResponse>({
      partition: QQ_LOGIN_PARTITION,
      url: createUserPlaylistUrl(sessionIdentity.userId, sessionIdentity.gTk)
    });
    return getQQUserPlaylistItems(response)
      .map(mapPlaylist)
      .filter((playlist): playlist is Playlist => Boolean(playlist));
  });
}

interface QQQrSession {
  key: string;
  expiresAtMs: number;
  qrsig: string;
  publicSession: LoginQrSession;
}

interface QQQrLoginTextResult {
  code: string;
  callbackUrl: string;
  message: string;
  nickname: string;
}

async function createQQLoginQr(runtime: QQRuntime): Promise<QQQrSession> {
  const xloginUrl = createQQXLoginUrl();
  await runtime.requestText({
    partition: QQ_LOGIN_PARTITION,
    url: xloginUrl
  });

  const png = await runtime.requestBuffer({
    partition: QQ_LOGIN_PARTITION,
    url: createQQQrShowUrl(),
    headers: { Referer: xloginUrl }
  });

  const qrsig = await getQQQrSigCookie(runtime);
  const key = String(Date.now());
  const publicSession: LoginQrSession = {
    providerId: 'qq',
    key,
    qrImageDataUrl: `data:image/png;base64,${png.toString('base64')}`,
    expiresAtMs: Date.now() + QQ_QR_EXPIRES_IN_MS
  };

  return {
    key,
    expiresAtMs: publicSession.expiresAtMs,
    qrsig,
    publicSession
  };
}

async function pollQQLoginQr(
  runtime: QQRuntime,
  cache: CacheStore,
  activeSession: QQQrSession | null,
  key: string
): Promise<LoginQrPollResult> {
  if (!activeSession || activeSession.key !== key) {
    return { state: 'failed', message: '二维码会话已失效，请重新获取' };
  }

  if (Date.now() > activeSession.expiresAtMs) {
    return { state: 'expired', message: '二维码已过期，请刷新' };
  }

  const qrsig = await getQQQrSigCookie(runtime);
  const loginSig = await getQQQrSessionCookie(runtime, 'pt_login_sig');
  if (!qrsig) {
    return { state: 'expired', message: '二维码已过期，请刷新' };
  }

  const xloginUrl = createQQXLoginUrl();
  const text = await runtime.requestText({
    partition: QQ_LOGIN_PARTITION,
    url: createQQQrLoginUrl(Date.now(), createQQQrHash33(qrsig), loginSig),
    headers: { Referer: xloginUrl }
  });

  const result = parseQQQrLoginText(text);
  switch (result.code) {
    case '0': {
      const successTimingStart = Date.now();
      if (result.callbackUrl) {
        await followQQQrLoginCallback(runtime, result.callbackUrl, activeSession?.qrsig ?? '');
      }

      cache.deleteByPrefix(CACHE_KEYS.providerPrefix('qq'));
      const loginStatus = await getLoginStatus(runtime, cache);
      console.info('[QQQrTiming]', {
        step: 'get-login-status',
        elapsedMs: Date.now() - successTimingStart
      });
      return {
        state: 'success',
        message: '登录成功',
        loginStatus
      };
    }
    case '65':
      return { state: 'expired', message: '二维码已过期，请刷新' };
    case '66':
      return { state: 'waiting', message: '等待扫码' };
    case '67':
      return { state: 'scanned', message: '已扫码，请在手机上确认登录' };
    default:
      return { state: 'failed', message: result.message || 'QQ 音乐扫码登录失败' };
  }
}

async function followQQQrLoginCallback(runtime: QQRuntime, callbackUrl: string, originalQrsig: string): Promise<void> {
  await runtime.completeLoginCallback({
    partition: QQ_LOGIN_PARTITION,
    url: callbackUrl,
    refererUrl: createQQXLoginUrl(),
    qrsig: originalQrsig
  });
}

async function getQQQrSigCookie(runtime: QQRuntime): Promise<string> {
  const cookies = await runtime.getCookies(QQ_LOGIN_PARTITION, QQ_QRSIG_COOKIE_URL);
  return createCookieMap(cookies).qrsig ?? '';
}

async function getQQQrSessionCookie(runtime: QQRuntime, name: string): Promise<string> {
  const cookies = await runtime.getCookies(QQ_LOGIN_PARTITION, QQ_QR_SESSION_COOKIE_URL);
  return createCookieMap(cookies)[name] ?? '';
}

function createQQXLoginUrl(): string {
  const searchParams = new URLSearchParams({
    appid: QQ_QR_APP_ID,
    daid: QQ_QR_DAID,
    style: '33',
    login_text: '登录',
    hide_title_bar: '1',
    hide_border: '1',
    target: 'self',
    s_url: QQ_QR_REDIRECT_TARGET,
    pt_3rd_aid: QQ_QR_PT_3RD_AID,
    pt_feedback_link: 'https://support.qq.com/products/77942?customInfo=.appid100497308',
    theme: '2',
    verify_theme: ''
  });
  return `https://xui.ptlogin2.qq.com/cgi-bin/xlogin?${searchParams.toString()}`;
}

function createQQOauthShowUrl(): string {
  const searchParams = new URLSearchParams({
    which: 'Login',
    display: 'pc',
    response_type: 'code',
    client_id: QQ_QR_PT_3RD_AID,
    redirect_uri: QQ_OAUTH_REDIRECT_URI,
    state: 'state',
    scope: 'get_user'
  });
  return `https://graph.qq.com/oauth2.0/show?${searchParams.toString()}`;
}

interface QQQrAuthorizeResult {
  status: number;
  location: string;
  error: string;
}

async function submitQQOauthAuthorize(callbackWindow: BrowserWindow): Promise<QQQrAuthorizeResult> {
  try {
    return (await callbackWindow.webContents.executeJavaScript(createQQOauthAuthorizeScript(), true)) as QQQrAuthorizeResult;
  } catch (error) {
    return {
      status: 0,
      location: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function captureQQAuthorizeRedirect(loginSession: Session): Promise<string> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      finish('');
    }, 12_000);

    function finish(redirectUrl: string) {
      clearTimeout(timeoutId);
      loginSession.webRequest.onBeforeRedirect(null);
      resolve(redirectUrl);
    }

    loginSession.webRequest.onBeforeRedirect((details) => {
      if (details.url.startsWith('https://graph.qq.com/oauth2.0/authorize') && details.redirectURL) {
        finish(details.redirectURL);
      }
    });
  });
}

async function getQQLoginMusicKeyValue(loginSession: Session): Promise<string> {
  const cookies = await loginSession.cookies.get({ url: QQ_PROFILE_URL });
  const cookieMap = createCookieMap(cookies);
  return getCookieMusicKey(cookieMap);
}

async function waitForQQLoginCookies(loginSession: Session, previousMusicKey: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const currentMusicKey = await getQQLoginMusicKeyValue(loginSession);
    if (currentMusicKey && currentMusicKey !== previousMusicKey) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function waitForQQGraphCookie(loginSession: Session, cookieName: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cookies = await loginSession.cookies.get({ url: 'https://graph.qq.com/' });
    if (cookies.some((cookie) => cookie.name === cookieName)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function waitForQQCheckSigRedirect(loginSession: Session, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      finish();
    }, timeoutMs);

    function finish() {
      clearTimeout(timeoutId);
      loginSession.webRequest.onBeforeRedirect(null);
      resolve();
    }

    loginSession.webRequest.onBeforeRedirect((details) => {
      if (details.url.startsWith('https://ssl.ptlogin2.graph.qq.com/check_sig')) {
        finish();
      }
    });
  });
}

async function waitForQQWindowUrl(callbackWindow: BrowserWindow, expectedUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (callbackWindow.webContents.getURL().startsWith(expectedUrl)) {
        return;
      }
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function createQQOauthAuthorizeScript(): string {
  const fixedParams = JSON.stringify({
    response_type: 'code',
    client_id: QQ_QR_PT_3RD_AID,
    redirect_uri: QQ_OAUTH_REDIRECT_URI,
    scope: 'get_user',
    state: 'state',
    'switch': '',
    from_ptlogin: '1',
    src: '1',
    update_auth: '1',
    openapi: '1010'
  });

  return `(function () {
    var fixed = ${fixedParams};
    function readCookie(name) {
      var prefix = name + '=';
      var parts = document.cookie.split(';');
      for (var i = 0; i < parts.length; i += 1) {
        var part = parts[i].trim();
        if (part.indexOf(prefix) === 0) {
          return part.slice(prefix.length);
        }
      }
      return '';
    }
    function hash33(value) {
      var hash = 5381;
      for (var index = 0; index < value.length; index += 1) {
        hash += (hash << 5) + value.charCodeAt(index);
      }
      return hash & 0x7fffffff;
    }
    var form = new URLSearchParams();
    Object.keys(fixed).forEach(function (key) {
      form.append(key, fixed[key]);
    });
    form.append('g_tk', String(hash33(readCookie('p_skey'))));
    form.append('auth_time', String(Date.now()));
    form.append('ui', readCookie('ui'));
    return fetch('https://graph.qq.com/oauth2.0/authorize', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      redirect: 'manual'
    }).then(function (response) {
      if (response.status === 200) {
        return response.text().then(function (text) {
          try {
            var data = JSON.parse(text);
            if (data && data.ret === 0 && data.callback) {
              return { status: 200, location: data.callback, error: '' };
            }
          } catch (error) {
            return { status: 200, location: '', error: text.slice(0, 300) };
          }
          return { status: 200, location: '', error: text.slice(0, 300) };
        });
      }
      return {
        status: response.status,
        location: response.headers.get('location') || '',
        error: ''
      };
    }).catch(function (error) {
      return { status: 0, location: '', error: String(error) };
    });
  })()`;
}

function createQQQrShowUrl(): string {
  const searchParams = new URLSearchParams({
    appid: QQ_QR_APP_ID,
    e: '2',
    l: 'M',
    s: '3',
    d: '72',
    v: '4',
    t: String(Math.random()),
    daid: QQ_QR_DAID,
    pt_3rd_aid: QQ_QR_PT_3RD_AID,
    u1: QQ_QR_REDIRECT_TARGET
  });
  return `${QQ_QR_SHOW_URL}?${searchParams.toString()}`;
}

function createQQQrLoginUrl(timestamp: number, ptqrtoken: number, loginSig: string): string {
  const searchParams = new URLSearchParams({
    u1: QQ_QR_REDIRECT_TARGET,
    ptqrtoken: String(ptqrtoken),
    ptredirect: '0',
    h: '1',
    t: '1',
    g: '1',
    from_ui: '1',
    ptlang: '2052',
    action: `0-0-${timestamp}`,
    js_ver: QQ_QR_JS_VERSION,
    js_type: '1',
    login_sig: loginSig,
    pt_uistyle: '40',
    aid: QQ_QR_APP_ID,
    daid: QQ_QR_DAID,
    pt_3rd_aid: QQ_QR_PT_3RD_AID,
    pt_js_version: QQ_QR_JS_FRAMEWORK_VERSION
  });
  return `${QQ_QR_LOGIN_URL}?${searchParams.toString()}`;
}

function createQQQrHash33(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash += (hash << 5) + value.charCodeAt(index);
  }

  return hash & 0x7fffffff;
}

function parseQQQrLoginText(text: string): QQQrLoginTextResult {
  const match = /ptuiCB\('(\d+)','\d*','([^']*)','\d*','([^']*)',\s*'([^']*)'(?:,\s*'[^']*')*\)/.exec(text.trim());
  if (!match) {
    return { code: '-1', callbackUrl: '', message: 'QQ 音乐扫码登录响应无效', nickname: '' };
  }

  return {
    code: match[1],
    callbackUrl: match[2],
    message: match[3],
    nickname: match[4]
  };
}

async function getLoginStatus(runtime: QQRuntime, cache: CacheStore): Promise<LoginStatus> {
  return cache.getOrSet(CACHE_KEYS.loginStatus('qq'), CACHE_TTL_MS.loginStatus, async () => {
    const profile = await getQQProfile(runtime);
    if (!profile.loggedIn) {
      return {
        providerId: 'qq',
        loggedIn: false,
        playbackReady: false,
        stale: false,
        message: 'QQ 音乐未登录'
      };
    }

    return {
      providerId: 'qq',
      loggedIn: true,
      userId: profile.userId,
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      vipLabel: profile.vipType > 0 ? 'VIP' : undefined,
      playbackReady: profile.playbackReady,
      stale: false,
      message: profile.playbackReady ? 'QQ 音乐已登录' : 'QQ 音乐已登录，播放授权不完整'
    };
  });
}

async function getQQProfile(runtime: QQRuntime): Promise<QQProfile> {
  const requestCookieMap = await getQQCookieMap(runtime, QQ_PROFILE_URL);
  const cookieMap = await getQQAccountCookieMap(runtime, requestCookieMap);
  const userId = getCookieUin(cookieMap);
  const musicKey = getCookieMusicKey(cookieMap);
  const gTk = createQQGtk(getCookieSessionKey(requestCookieMap));

  if (!userId || !musicKey) {
    return {
      loggedIn: false,
      playbackReady: false,
      userId: '',
      nickname: '',
      avatarUrl: '',
      vipType: 0
    };
  }

  const cookieProfile = normalizeProfile({ data: {} }, cookieMap, userId);
  try {
    const response = await runtime.requestJson<QQProfileResponse>({
      partition: QQ_LOGIN_PARTITION,
      url: createProfileUrl(userId, gTk)
    });
    if (isQQProfileAuthenticationRejected(response)) {
      return hasDurableQQMusicSession(cookieMap)
        ? cookieProfile
        : createLoggedOutQQProfile();
    }

    assertQQProfileSucceeded(response);
    return normalizeProfile(response, cookieMap, userId);
  } catch (error) {
    // The legacy profile endpoint is not the source of truth for newer OAuth cookies.
    if (hasDurableQQMusicSession(cookieMap)) {
      return cookieProfile;
    }

    throw error;
  }
}

function createLoggedOutQQProfile(): QQProfile {
  return {
    loggedIn: false,
    playbackReady: false,
    userId: '',
    nickname: '',
    avatarUrl: '',
    vipType: 0
  };
}

async function getQQSessionIdentity(runtime: QQRuntime, requestUrl: string): Promise<QQSessionIdentity> {
  const requestCookieMap = await getQQCookieMap(runtime, requestUrl);
  const cookieMap = await getQQAccountCookieMap(runtime, requestCookieMap);
  const userId = getCookieUin(cookieMap);
  const musicKey = getCookieMusicKey(cookieMap);

  return {
    loggedIn: Boolean(userId && musicKey),
    userId,
    gTk: createQQGtk(getCookieSessionKey(cookieMap))
  };
}

async function getQQPlaybackIdentity(runtime: QQRuntime): Promise<QQPlaybackIdentity> {
  const requestCookieMap = await getQQCookieMap(runtime, QQ_SONG_URL);
  const cookieMap = await getQQAccountCookieMap(runtime, requestCookieMap);
  const userId = getCookieUin(cookieMap);
  const playbackKey = getCookiePlaybackKey(cookieMap);

  return {
    userId,
    loggedIn: Boolean(userId && getCookieMusicKey(cookieMap)),
    playbackReady: Boolean(userId && playbackKey),
    playbackKey,
    gTk: createQQGtk(getCookieSessionKey(cookieMap))
  };
}

async function getSongUrl(runtime: QQRuntime, cache: CacheStore, song: Song, quality: Quality): Promise<SongUrlResult> {
  const platformSongId = song.platformSongId ?? parseProviderScopedId(song.id);
  const failureCacheKey = CACHE_KEYS.playbackFailure('qq', platformSongId, quality);
  const cachedFailure = cache.get<SongUrlResult>(failureCacheKey);
  if (cachedFailure) {
    return cachedFailure;
  }

  const identity = await getQQPlaybackIdentity(runtime);
  if (!identity.loggedIn) {
    const result = createRestrictedSongUrlResult(quality, {
      category: 'login_required',
      message: '请先登录 QQ 音乐后再播放',
      action: 'login'
    });
    cache.set(failureCacheKey, result, CACHE_TTL_MS.playbackFailure);
    return result;
  }

  if (!identity.playbackReady) {
    const result = createRestrictedSongUrlResult(quality, {
      category: 'playback_auth_incomplete',
      message: 'QQ 音乐播放授权不完整，请重新登录 QQ 音乐后再试',
      action: 'login'
    });
    cache.set(failureCacheKey, result, CACHE_TTL_MS.playbackFailure);
    return result;
  }

  const platformMediaId = normalizeSongMediaId(song, platformSongId);
  const response = await runtime.requestJson<QQSongUrlResponse>({
    partition: QQ_LOGIN_PARTITION,
    url: createSongUrlUrl(platformSongId, quality, identity.userId, identity.playbackKey, platformMediaId, identity.gTk)
  });
  const playbackUrl = getQQPlaybackUrl(response);

  if (playbackUrl) {
    cache.delete(failureCacheKey);
    return {
      ok: true,
      providerId: 'qq',
      quality,
      url: playbackUrl
    };
  }

  logQQSongUrlDiagnostic(response);
  const result = createRestrictedSongUrlResult(quality, mapQQSongUrlRestriction(response));
  cache.set(failureCacheKey, result, CACHE_TTL_MS.playbackFailure);
  return result;
}

async function getLyrics(runtime: QQRuntime, cache: CacheStore, song: Song): Promise<LyricsResult> {
  const platformSongId = song.platformSongId ?? parseProviderScopedId(song.id);
  return cache.getOrSet(CACHE_KEYS.lyrics('qq', platformSongId), CACHE_TTL_MS.lyrics, async () => {
    const response = await runtime.requestJson<QQLyricsResponse>({
      partition: QQ_LOGIN_PARTITION,
      url: createLyricsUrl(platformSongId),
      anonymous: true
    });
    const lrc = decodeQQBase64Lyric(response.lyric ?? response.data?.lyric);
    const tlyric = decodeQQBase64Lyric(
      response.trans ?? response.translyric ?? response.data?.trans ?? response.data?.translyric
    );

    if (lrc) {
      if (isQQNoLyricsPlaceholder(lrc)) {
        return {
          ok: false,
          providerId: 'qq',
          reason: {
            category: 'url_unavailable',
            message: '当前歌曲暂无歌词',
            action: 'none'
          }
        };
      }

      return {
        ok: true,
        providerId: 'qq',
        lrc,
        ...(tlyric ? { tlyric } : {})
      };
    }

    logQQDiagnostic('lyrics unavailable', {
      code: response.code ?? null,
      hasLyricPayload: Boolean(response.lyric ?? response.data?.lyric)
    });
    return {
      ok: false,
      providerId: 'qq',
      reason: {
        category: 'url_unavailable',
        message: response.message ?? response.msg ?? '当前 QQ 音乐歌曲暂无歌词',
        action: 'none'
      }
    };
  });
}

async function setSongLiked(runtime: QQRuntime, cache: CacheStore, song: Song, liked: boolean): Promise<SongMutationResult> {
  await mutateQQPlaylist(runtime, song, Number(QQ_LIKED_DIR_ID), liked ? 'add' : 'remove');
  cache.deleteByPrefix(CACHE_KEYS.providerPrefix('qq'));
  return { providerId: 'qq', operation: liked ? 'like' : 'unlike' };
}

async function mutatePlaylist(
  runtime: QQRuntime,
  cache: CacheStore,
  song: Song,
  playlistId: string,
  operation: 'add' | 'remove'
): Promise<SongMutationResult> {
  const platformPlaylistId = parseQQPlaylistId(playlistId);
  const directoryId = await getQQPlaylistDirectoryId(runtime, cache, createProviderScopedId(platformPlaylistId));
  await mutateQQPlaylist(runtime, song, directoryId, operation);
  cache.deleteByPrefix(CACHE_KEYS.providerPrefix('qq'));
  return { providerId: 'qq', operation: operation === 'add' ? 'add_to_playlist' : 'remove_from_playlist' };
}

async function getQQPlaylistDirectoryId(
  runtime: QQRuntime,
  cache: CacheStore,
  providerScopedPlaylistId: string
): Promise<number> {
  const cacheKey = CACHE_KEYS.providerPlaylists('qq');
  const cachedDirectoryId = findQQPlaylistDirectoryId(cache.get<Playlist[]>(cacheKey), providerScopedPlaylistId);
  if (cachedDirectoryId !== undefined) {
    return cachedDirectoryId;
  }

  const playlists = await getUserPlaylists(runtime, cache, { forceRefresh: true });
  const refreshedDirectoryId = findQQPlaylistDirectoryId(playlists, providerScopedPlaylistId);
  if (refreshedDirectoryId === undefined) {
    throw new Error('无法取得 QQ 歌单写入目录标识');
  }

  return refreshedDirectoryId;
}

function findQQPlaylistDirectoryId(
  playlists: Playlist[] | null | undefined,
  providerScopedPlaylistId: string
): number | undefined {
  const directoryId = playlists?.find((playlist) => playlist.id === providerScopedPlaylistId)?.platformDirectoryId;
  if (!directoryId || !/^\d+$/.test(directoryId)) {
    return undefined;
  }

  const numericDirectoryId = Number(directoryId);
  return Number.isSafeInteger(numericDirectoryId) && numericDirectoryId > 0 ? numericDirectoryId : undefined;
}

async function mutateQQPlaylist(
  runtime: QQRuntime,
  song: Song,
  playlistId: number,
  operation: 'add' | 'remove'
): Promise<void> {
  await assertQQMutationAuthenticated(runtime);
  const songIdentity = await getQQSongWriteIdentity(runtime, song);
  const response = await runtime.requestSignedMusicu<QQMusicuMutationResponse>({
    partition: QQ_LOGIN_PARTITION,
    module: 'music.musicasset.PlaylistDetailWrite',
    method: operation === 'add' ? 'AddSonglist' : 'DelSonglist',
    param: { dirId: playlistId, v_songInfo: [songIdentity] }
  });

  assertQQMutationSucceeded(response, operation === 'add' ? '添加歌曲到歌单' : '从歌单移除歌曲');
}

async function assertQQMutationAuthenticated(runtime: QQRuntime): Promise<void> {
  const identity = await getQQSessionIdentity(runtime, QQ_SONG_URL);
  if (!identity.loggedIn || !identity.userId) {
    throw new Error('QQ 音乐未登录');
  }
}

function getQQSongMid(song: Song): string {
  if (song.providerId !== 'qq') {
    throw new Error('QQ 音乐歌曲 ID 无效');
  }

  const songMid = (song.platformSongId ?? parseProviderScopedId(song.id)).trim();
  if (!songMid) {
    throw new Error('QQ 音乐歌曲 ID 无效');
  }

  return songMid;
}

interface QQSongWriteIdentity {
  songId: number;
  songType: number;
}

async function getQQSongWriteIdentity(runtime: QQRuntime, song: Song): Promise<QQSongWriteIdentity> {
  const songMid = getQQSongMid(song);
  const mappedSongId = normalizeQQSongNumericId(song.platformNumericSongId);
  const mappedSongType = normalizeQQSongType(song.platformSongType);
  if (mappedSongId !== undefined && mappedSongType !== undefined) {
    return { songId: mappedSongId, songType: mappedSongType };
  }

  const response = await runtime.requestJson<QQSongDetailResponse>({
    partition: QQ_LOGIN_PARTITION,
    url: createQQSongDetailUrl(songMid, mappedSongType),
    anonymous: true
  });
  const detailTrack = response.req_0?.data?.track_info
    ?? response.req_0?.data?.songInfo
    ?? response.req_0?.data?.songinfo
    ?? response.req_0?.data?.song;
  const responseMid = firstText(detailTrack?.mid, detailTrack?.songmid);
  const responseSongId = firstQQSongNumericId(detailTrack?.id, detailTrack?.songid, detailTrack?.songId);
  const responseSongType = firstQQSongType(detailTrack?.type, detailTrack?.songtype, detailTrack?.songType);
  const songId = mappedSongId ?? responseSongId;
  const songType = mappedSongType ?? responseSongType;
  if (
    response.code !== 0
    || response.req_0?.code !== 0
    || !detailTrack
    || responseMid !== songMid
    || songId === undefined
    || songType === undefined
  ) {
    throw new Error('无法取得 QQ 写操作歌曲标识');
  }

  return { songId, songType };
}

function parseQQPlaylistId(playlistId: string): number {
  if (!playlistId.startsWith('qq:')) {
    throw new Error('QQ 音乐歌单 ID 无效');
  }

  const platformPlaylistId = parseProviderScopedId(playlistId).trim();
  const numericPlaylistId = Number(platformPlaylistId);
  if (!/^\d+$/.test(platformPlaylistId) || !Number.isSafeInteger(numericPlaylistId) || numericPlaylistId <= 0) {
    throw new Error('QQ 音乐歌单 ID 无效');
  }

  return numericPlaylistId;
}

function normalizeQQSongNumericId(value: unknown): number | undefined {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    return undefined;
  }

  const normalizedValue = typeof value === 'string' ? value.trim() : value;
  if (
    (typeof normalizedValue !== 'number' && typeof normalizedValue !== 'string')
    || (typeof normalizedValue === 'string' && !/^\d+$/.test(normalizedValue))
  ) {
    return undefined;
  }

  const numericValue = Number(normalizedValue);
  return Number.isSafeInteger(numericValue) && numericValue > 0 ? numericValue : undefined;
}

function normalizeQQSongType(value: unknown): number | undefined {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    return undefined;
  }

  const normalizedValue = typeof value === 'string' ? value.trim() : value;
  if (
    (typeof normalizedValue !== 'number' && typeof normalizedValue !== 'string')
    || (typeof normalizedValue === 'string' && !/^\d+$/.test(normalizedValue))
  ) {
    return undefined;
  }

  const numericValue = Number(normalizedValue);
  return Number.isSafeInteger(numericValue) && numericValue >= 0 ? numericValue : undefined;
}

function firstQQSongNumericId(...values: unknown[]): number | undefined {
  for (const value of values) {
    const songId = normalizeQQSongNumericId(value);
    if (songId !== undefined) {
      return songId;
    }
  }

  return undefined;
}

function firstQQSongType(...values: unknown[]): number | undefined {
  for (const value of values) {
    const songType = normalizeQQSongType(value);
    if (songType !== undefined) {
      return songType;
    }
  }

  return undefined;
}

function createQQGtk(sessionKey: string): number {
  let hash = 5381;
  for (const character of sessionKey) {
    hash = (hash + (hash << 5) + character.charCodeAt(0)) & 0x7fffffff;
  }

  return hash;
}

function assertQQMutationSucceeded(response: QQMusicuMutationResponse, action: string): void {
  if (Number(response.code) === 0) {
    return;
  }

  const responseCode = response.code ?? 'missing';
  throw new Error(
    firstText(response.message, response.msg)
    || `${action}失败（response=${responseCode}）`
  );
}

function isQQProfileAuthenticationRejected(response: QQProfileResponse): boolean {
  return response.code === 1000 || response.result === 301;
}

function assertQQProfileSucceeded(response: QQProfileResponse): void {
  const responseCodeSucceeded = response.code === undefined || response.code === 0;
  const resultCodeSucceeded = typeof response.result !== 'number' || response.result === 0;
  if (!responseCodeSucceeded || !resultCodeSucceeded) {
    const businessCode = typeof response.result === 'number' && response.result !== 0
      ? response.result
      : response.code;
    throw new Error(firstText(response.message, response.msg) || `QQ 音乐账号信息请求失败（${businessCode}）`);
  }

  const hasProfilePayload = Boolean(
    response.data
    || response.profile
    || response.creator
    || (typeof response.result === 'object' && response.result !== null)
    || firstText(response.nick, response.nickname, response.name)
  );
  if (!hasProfilePayload) {
    throw new Error('QQ 音乐账号信息响应无效');
  }
}

function getQQUserPlaylistItems(response: QQPlaylistListResponse): QQPlaylistItem[] {
  if (response.code === 0 && response.req_0?.code === 0 && Array.isArray(response.req_0.data?.v_playlist)) {
    return response.req_0.data.v_playlist;
  }

  if (response.code === 0 && Array.isArray(response.data?.disslist)) {
    return response.data.disslist;
  }

  if (
    response.code === 1000
    || response.code === 301
    || response.req_0?.code === 1000
    || response.req_0?.code === 301
  ) {
    throw new Error('QQ 音乐登录已失效，请重新登录');
  }

  throw new Error(
    firstText(response.req_0?.message, response.message, response.msg)
    || 'QQ 音乐用户歌单请求失败'
  );
}

function normalizeProfile(response: QQProfileResponse, cookieMap: Record<string, string>, userId: string): QQProfile {
  const data = getProfilePayload(response);
  const creator = data.creator ?? data.user ?? data.profile ?? data;
  const vipInfo = data.vipInfo ?? data.vipinfo ?? data.vip ?? creator.vipInfo ?? creator.vipinfo ?? {};
  const nickname = getReadableQQNickname(
    userId,
    [
      cookieMap.euin,
      cookieMap.psrf_qqopenid,
      cookieMap.psrf_qqunionid,
      cookieMap.wxopenid,
      cookieMap.wxunionid
    ],
    creator.nick,
    creator.nickname,
    creator.name,
    creator.title,
    getCookieNickname(cookieMap, userId)
  );
  const avatarUrl = firstText(creator.headpic, creator.avatar, creator.avatarUrl, creator.logo, getCookieAvatar(cookieMap, userId));
  const vipType = getVipType(data, creator, vipInfo, cookieMap);

  return {
    loggedIn: true,
    playbackReady: Boolean(getCookiePlaybackKey(cookieMap)),
    userId,
    nickname,
    avatarUrl,
    vipType
  };
}

function getProfilePayload(response: QQProfileResponse): QQProfilePayload {
  if (response.data) {
    return response.data;
  }

  if (response.profile) {
    return response.profile;
  }

  if (response.creator) {
    return response.creator;
  }

  if (typeof response.result === 'object' && response.result !== null) {
    return response.result;
  }

  return response;
}

function createElectronQQRuntime(): QQRuntime {
  let activeLoginWindow: BrowserWindow | null = null;
  let activeLoginWindowClosed: Promise<void> | null = null;

  return {
    async openLoginWindow({ partition, url }) {
      const electron = require('electron') as typeof import('electron');
      if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
        showMaximizedLoginWindow(activeLoginWindow);
        return activeLoginWindowClosed ?? Promise.resolve();
      }

      activeLoginWindow = null;
      activeLoginWindowClosed = null;

      const loginSession = electron.session.fromPartition(partition);
      configureQQSession(loginSession);
      const workAreaSize = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint()).workAreaSize;
      const loginWindow = new electron.BrowserWindow(createLoginWindowOptions(partition, workAreaSize));
      const windowClosed = new Promise<void>((resolve) => {
        loginWindow.once('closed', () => {
          if (activeLoginWindow === loginWindow) {
            activeLoginWindow = null;
            activeLoginWindowClosed = null;
          }
          resolve();
        });
      });
      activeLoginWindow = loginWindow;
      activeLoginWindowClosed = windowClosed;

      loginWindow.setMenuBarVisibility(false);
      configureQQLoginWindowLinks(loginWindow, partition, electron);
      loginWindow.once('ready-to-show', () => {
        showMaximizedLoginWindow(loginWindow);
      });

      loginWindow.maximize();

      await loginWindow.loadURL(url);
      showMaximizedLoginWindow(loginWindow);
      await windowClosed;
      await loginSession.cookies.flushStore();
    },

    async completeLoginCallback({ partition, url, refererUrl, qrsig }) {
      const electron = require('electron') as typeof import('electron');
      const loginSession = electron.session.fromPartition(partition);
      configureQQSession(loginSession);

      const checkSigFilter = { urls: ['*://ssl.ptlogin2.graph.qq.com/check_sig*'] };
      const handleCheckSigHeaders = (
        details: Electron.OnBeforeSendHeadersListenerDetails,
        callback: (response: Electron.BeforeSendResponse) => void
      ) => {
        const requestHeaders = { ...details.requestHeaders };
        if (qrsig) {
          const cookieHeader = (requestHeaders.Cookie ?? requestHeaders.cookie ?? '')
            .split(';')
            .map((segment) => segment.trim())
            .filter((segment) => segment && !segment.startsWith('qrsig='))
            .concat(`qrsig=${qrsig}`)
            .join('; ');
          requestHeaders.Cookie = cookieHeader;
        }
        requestHeaders.Referer = refererUrl;
        callback({ requestHeaders });
      };
      loginSession.webRequest.onBeforeSendHeaders(checkSigFilter, handleCheckSigHeaders);

      const previousMusicKey = await getQQLoginMusicKeyValue(loginSession);
      const callbackWindow = new electron.BrowserWindow({
        show: false,
        skipTaskbar: true,
        webPreferences: {
          partition,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      });
      callbackWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

      try {
        const timingStart = Date.now();
        void callbackWindow.loadURL(createQQOauthShowUrl()).catch(() => undefined);
        await waitForQQGraphCookie(loginSession, 'ui', 8_000);
        console.info('[QQQrTiming]', { step: 'show-page', elapsedMs: Date.now() - timingStart });

        void callbackWindow.loadURL(url).catch(() => undefined);
        await waitForQQCheckSigRedirect(loginSession, 8_000);
        await waitForQQWindowUrl(callbackWindow, 'https://graph.qq.com/oauth2.0/login_jump', 3_000);
        console.info('[QQQrTiming]', { step: 'check-sig', elapsedMs: Date.now() - timingStart });

        const authorizeRedirectPromise = captureQQAuthorizeRedirect(loginSession);
        const authorizeResult = await submitQQOauthAuthorize(callbackWindow);
        const redirectUrl = (await authorizeRedirectPromise) || authorizeResult.location;
        console.info('[QQQrTiming]', { step: 'authorize', elapsedMs: Date.now() - timingStart });
        if (!redirectUrl) {
          throw new Error('QQ 音乐授权跳转未返回');
        }

        await callbackWindow.loadURL(redirectUrl);
        await waitForQQLoginCookies(loginSession, previousMusicKey);
        console.info('[QQQrTiming]', { step: 'login-cookies', elapsedMs: Date.now() - timingStart });
      } finally {
        loginSession.webRequest.onBeforeSendHeaders(checkSigFilter, null);
        if (!callbackWindow.isDestroyed()) {
          callbackWindow.destroy();
        }
        await loginSession.cookies.flushStore();
      }
    },

    async getCookies(partition, url) {
      const electron = require('electron') as typeof import('electron');
      const loginSession = electron.session.fromPartition(partition);
      configureQQSession(loginSession);

      return loginSession.cookies.get({ url });
    },

    async requestJson({ partition, url, method = 'GET', form, json, anonymous = false }) {
      const electron = require('electron') as typeof import('electron');
      const loginSession = electron.session.fromPartition(partition);
      configureQQSession(loginSession);
      const body = json !== undefined
        ? JSON.stringify(json)
        : form
          ? new URLSearchParams(form).toString()
          : undefined;
      return requestQQJson(url, {
        method,
        referrer: getQQRequestReferer(url),
        ...(body ? { body } : {}),
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': QQ_ACCEPT_LANGUAGE,
          ...(json !== undefined
            ? { 'Content-Type': 'application/json' }
            : body
              ? { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
              : {})
        }
      }, anonymous
        ? fetch
        : (requestUrl, init) => loginSession.fetch(requestUrl, {
          ...init,
          credentials: 'include'
        }));
    },

    async requestSignedMusicu({ partition, module, method, param }) {
      const electron = require('electron') as typeof import('electron');
      const loginSession = electron.session.fromPartition(partition);
      configureQQSession(loginSession);
      return requestQQSignedMusicu(electron, partition, { module, method, param });
    },

    async requestText({ partition, url, headers }) {
      const electron = require('electron') as typeof import('electron');
      const loginSession = electron.session.fromPartition(partition);
      configureQQSession(loginSession);
      const response = await loginSession.fetch(url, { headers, credentials: 'include' });
      if (!response.ok) {
        throw createProviderRequestError('QQ 音乐', response.status);
      }

      return response.text();
    },

    async requestBuffer({ partition, url, headers }) {
      const electron = require('electron') as typeof import('electron');
      const loginSession = electron.session.fromPartition(partition);
      configureQQSession(loginSession);
      const response = await loginSession.fetch(url, { headers, credentials: 'include' });
      if (!response.ok) {
        throw createProviderRequestError('QQ 音乐', response.status);
      }

      return Buffer.from(await response.arrayBuffer());
    },

    async clearSession(partition) {
      const electron = require('electron') as typeof import('electron');
      const loginSession = electron.session.fromPartition(partition);

      await loginSession.clearStorageData({
        storages: ['cookies']
      });
    }
  };
}

async function requestQQSignedMusicu<T>(
  electron: typeof import('electron'),
  partition: string,
  request: QQMusicuRequest
): Promise<T> {
  const requestWindow = new electron.BrowserWindow({
    show: false,
    skipTaskbar: true,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  requestWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(createProviderTimeoutError('QQ 音乐')), PROVIDER_REQUEST_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([
      (async () => {
        await requestWindow.loadURL(QQ_SIGNED_REQUEST_PAGE_URL);
        const pageUrl = new URL(requestWindow.webContents.getURL());
        if (pageUrl.protocol !== 'https:' || (pageUrl.hostname !== 'y.qq.com' && !pageUrl.hostname.endsWith('.y.qq.com'))) {
          throw new Error('QQ signed request page origin is invalid');
        }

        return requestWindow.webContents.executeJavaScript(createQQSignedMusicuScript(request), true) as Promise<T>;
      })(),
      timeout
    ]);
    return response;
  } catch (error) {
    if (isMappedProviderError(error)) {
      throw error;
    }

    const requestError = createProviderRequestError('QQ 音乐');
    requestError.cause = error;
    console.warn('[QQProvider] signed Musicu request failed', {
      module: request.module,
      method: request.method,
      error: getQQSafeErrorDiagnostic(error)
    });
    throw requestError;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    if (!requestWindow.isDestroyed()) {
      requestWindow.destroy();
    }
  }
}

function createQQSignedMusicuScript(request: QQMusicuRequest): string {
  const serializedRequest = JSON.stringify(request).replace(/</g, '\\u003c');
  return `(async () => {
    const captureId = 9000000 + Math.floor(Math.random() * 999999);
    const captureKey = '__musicPlayerWebpackRequire_' + captureId;
    const chunks = window.webpackJsonp;
    if (!chunks || typeof chunks.push !== 'function') {
      throw new Error('QQ web request runtime is unavailable');
    }
    chunks.push([
      [captureId],
      { [captureId]: function(module, exports, webpackRequire) {
        window[captureKey] = webpackRequire;
      } },
      [[captureId]]
    ]);
    try {
      const webpackRequire = window[captureKey];
      const requestModule = webpackRequire && webpackRequire(${QQ_WEB_REQUEST_MODULE_ID});
      if (!requestModule || typeof requestModule.a !== 'function') {
        throw new Error('QQ signed request module is unavailable');
      }
      const client = new requestModule.a();
      const responses = await client.request(${serializedRequest});
      const response = responses && responses[0];
      if (!response || typeof response !== 'object') {
        throw new Error('QQ signed request response is invalid');
      }
      return response;
    } finally {
      delete window[captureKey];
    }
  })()`;
}

function configureQQSession(loginSession: Session): void {
  const currentUserAgent = loginSession.getUserAgent();
  const compatibleUserAgent = createQQBrowserUserAgent(currentUserAgent);
  if (compatibleUserAgent !== currentUserAgent) {
    loginSession.setUserAgent(compatibleUserAgent, QQ_ACCEPT_LANGUAGE);
  }
}

function waitForQQCallbackSettle(callbackWindow: BrowserWindow, settleDelayMs = 4_000, maxWaitMs = 12_000): Promise<void> {
  return new Promise((resolve) => {
    const webContents = callbackWindow.webContents;
    let resolved = false;
    let settleTimer: NodeJS.Timeout | null = null;
    const maxTimer = setTimeout(finishWaiting, maxWaitMs);

    function finishWaiting() {
      if (resolved) {
        return;
      }
      resolved = true;
      clearTimeout(maxTimer);
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      webContents.removeListener('did-finish-load', handleFinishLoad);
      webContents.removeListener('did-fail-load', handleFailLoad);
      resolve();
    }

    function handleFinishLoad() {
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      settleTimer = setTimeout(finishWaiting, settleDelayMs);
    }

    function handleFailLoad(_event: unknown, errorCode: number, _description: string, _url: string, isMainFrame: boolean) {
      if (isMainFrame && errorCode !== -3) {
        finishWaiting();
      }
    }

    webContents.on('did-finish-load', handleFinishLoad);
    webContents.on('did-fail-load', handleFailLoad);
  });
}

function createQQBrowserUserAgent(currentUserAgent: string): string {
  const browserParts = currentUserAgent.match(
    /^(Mozilla\/5\.0 \([^)]+\) AppleWebKit\/[\d.]+ \(KHTML, like Gecko\)).*?(Chrome\/[\d.]+).*?(Safari\/[\d.]+)$/i
  );
  if (browserParts) {
    return `${browserParts[1]} ${browserParts[2]} ${browserParts[3]}`;
  }

  return currentUserAgent
    .replace(/\sElectron\/[\d.]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function configureQQLoginWindowLinks(
  loginWindow: BrowserWindow,
  partition: string,
  electron: typeof import('electron')
): void {
  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isQQLoginPopupUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: createLoginPopupWindowOptions(partition, loginWindow)
      };
    }

    void electron.shell.openExternal(url);
    return { action: 'deny' };
  });
  loginWindow.webContents.on('did-create-window', (childWindow) => {
    childWindow.setMenuBarVisibility(false);
    configureQQLoginWindowLinks(childWindow, partition, electron);
  });
}

function isQQLoginPopupUrl(rawUrl: string): boolean {
  if (rawUrl === 'about:blank') {
    return true;
  }

  try {
    const hostname = new URL(rawUrl).hostname.toLocaleLowerCase();
    return hostname === 'qq.com' || hostname.endsWith('.qq.com');
  } catch {
    return false;
  }
}

function createLoginPopupWindowOptions(partition: string, parent: BrowserWindow): BrowserWindowConstructorOptions {
  return {
    parent,
    width: 760,
    height: 680,
    minWidth: 440,
    minHeight: 580,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
}

function getQQRequestReferer(requestUrl: string): string {
  try {
    const pathname = new URL(requestUrl).pathname;
    if (pathname.includes('/lyric/')) {
      return QQ_PLAYER_REFERER;
    }
    if (pathname.includes('/splcloud/') || pathname.includes('/qzone/')) {
      return QQ_PLAYLIST_REFERER;
    }
    if (pathname.includes('/rsc/') || pathname.includes('/fav/')) {
      return QQ_PROFILE_REFERER;
    }
  } catch {
    return QQ_LOGIN_URL;
  }

  return QQ_LOGIN_URL;
}

function showMaximizedLoginWindow(loginWindow: BrowserWindow): void {
  if (loginWindow.isDestroyed()) {
    return;
  }

  if (loginWindow.isMinimized()) {
    loginWindow.restore();
  }

  loginWindow.maximize();
  loginWindow.show();
  loginWindow.focus();
}

async function requestQQJson<T>(
  url: string,
  init: RequestInit,
  request: (requestUrl: string, requestInit: RequestInit) => Promise<Response> = fetch
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_REQUEST_TIMEOUT_MS);

  try {
    const response = await request(url, {
      ...init,
      signal: controller.signal
    });

    if (!response.ok) {
      throw createProviderRequestError('QQ 音乐', response.status);
    }

    const responseText = await response.text();
    return parseQQJsonText<T>(responseText);
  } catch (error) {
    if (isMappedProviderError(error)) {
      throw error;
    }

    if (isAbortError(error)) {
      throw createProviderTimeoutError('QQ 音乐');
    }

    const requestError = createProviderRequestError('QQ 音乐');
    requestError.cause = error;
    console.warn('[QQProvider] request transport failed', {
      endpoint: getQQEndpointLabel(url),
      method: init.method ?? 'GET',
      error: getQQSafeErrorDiagnostic(error)
    });
    throw requestError;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseQQJsonText<T>(responseText: string): T {
  const normalized = responseText
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^[\w$.]+\(([^]*)\);?$/, '$1');
  return JSON.parse(normalized) as T;
}

function getQQEndpointLabel(requestUrl: string): string {
  try {
    const url = new URL(requestUrl);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

function getQQSafeErrorDiagnostic(error: unknown): string {
  const diagnostic = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
  return diagnostic
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/(cookie|key|token|authst|g_tk)=([^\s;&]+)/gi, '$1=[redacted]')
    .slice(0, 240);
}

function logQQSongUrlDiagnostic(response: QQSongUrlResponse): void {
  const data = response.req_0?.data ?? response.data?.req_0?.data ?? response.data;
  const playbackItem = data?.midurlinfo?.[0];
  logQQDiagnostic('playback URL unavailable', {
    responseCode: response.code ?? null,
    moduleCode: response.req_0?.code ?? response.data?.req_0?.code ?? null,
    resultCode: playbackItem?.result ?? null,
    hasPlaybackUrl: Boolean(playbackItem?.purl?.trim())
  });
}

function logQQDiagnostic(event: string, details: Record<string, unknown>): void {
  if (!process.env.VITE_DEV_SERVER_URL) {
    return;
  }

  console.warn(`[QQProvider] ${event}`, details);
}

function isMappedProviderError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'ProviderRequestError' || error.name === 'ProviderTimeoutError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function createLoginWindowOptions(partition: string, workAreaSize = { width: 520, height: 720 }): BrowserWindowConstructorOptions {
  return {
    width: Math.max(520, Math.floor(workAreaSize.width)),
    height: Math.max(720, Math.floor(workAreaSize.height)),
    minWidth: 440,
    minHeight: 580,
    title: 'QQ 音乐登录',
    show: false,
    center: true,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
}

function createProfileUrl(userId: string, gTk: number): string {
  const url = new URL(QQ_PROFILE_URL);
  url.searchParams.set('cid', '205360838');
  url.searchParams.set('ct', '24');
  url.searchParams.set('userid', userId);
  url.searchParams.set('reqfrom', '1');
  url.searchParams.set('reqtype', '0');
  url.searchParams.set('g_tk', String(gTk));
  url.searchParams.set('loginUin', userId);
  url.searchParams.set('hostUin', '0');
  url.searchParams.set('format', 'json');
  url.searchParams.set('inCharset', 'utf8');
  url.searchParams.set('outCharset', 'utf-8');
  url.searchParams.set('notice', '0');
  url.searchParams.set('platform', 'yqq.json');
  url.searchParams.set('needNewCode', '0');
  return url.toString();
}

function createUserPlaylistUrl(userId: string, gTk: number): string {
  return createQQMusicuUrl({
    req_0: {
      module: 'music.musicasset.PlaylistBaseRead',
      method: 'GetPlaylistByUin',
      param: {
        uin: userId,
        bWithoutStatus: false
      }
    }
  }, {
    uin: userId,
    loginUin: userId,
    g_tk: gTk,
    g_tk_new_20200303: gTk
  });
}

function createPlaylistDetailUrl(playlistId: string, userId: string): string {
  const url = new URL(QQ_PLAYLIST_DETAIL_URL);
  const numericPlaylistId = Number(playlistId);
  const data = {
    comm: {
      ct: 24,
      cv: 0,
      uin: userId,
      loginUin: userId
    },
    req_0: {
      module: 'music.srfDissInfo.aiDissInfo',
      method: 'uniform_get_Dissinfo',
      param: {
        disstid: /^\d+$/.test(playlistId) && Number.isSafeInteger(numericPlaylistId) ? numericPlaylistId : playlistId,
        enc_host_uin: '',
        tag: 1,
        userinfo: 1,
        song_begin: 0,
        song_num: 1000
      }
    }
  };

  url.searchParams.set('format', 'json');
  url.searchParams.set('inCharset', 'utf8');
  url.searchParams.set('outCharset', 'utf-8');
  url.searchParams.set('notice', '0');
  url.searchParams.set('platform', 'yqq.json');
  url.searchParams.set('needNewCode', '1');
  url.searchParams.set('data', JSON.stringify(data));
  return url.toString();
}

async function loadQQPlaylistDetail(
  runtime: QQRuntime,
  cache: CacheStore,
  playlistId: string,
  options: ProviderFetchOptions
): Promise<PlaylistDetail> {
  const platformPlaylistId = parseProviderScopedId(playlistId);
  const providerScopedPlaylistId = createProviderScopedId(platformPlaylistId);
  const cacheKey = CACHE_KEYS.playlistDetail('qq', providerScopedPlaylistId);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.playlistDetail, async () => {
    const sessionIdentity = await getQQSessionIdentity(runtime, QQ_PLAYLIST_DETAIL_URL);
    const userId = sessionIdentity.loggedIn && sessionIdentity.userId ? sessionIdentity.userId : '0';
    const response = await runtime.requestJson<QQPlaylistDetailResponse>({
      partition: QQ_LOGIN_PARTITION,
      url: createPlaylistDetailUrl(platformPlaylistId, userId)
    });
    if (response.code !== 0 || response.req_0?.code !== 0) {
      throw new Error('QQ 音乐歌单详情请求失败');
    }

    const detail = response.req_0?.data;
    const legacyDetail = response.cdlist?.[0];
    const playlistTitle = firstText(
      detail?.dirinfo?.title,
      detail?.dirinfo?.dissname,
      legacyDetail?.dissname,
      legacyDetail?.diss_name,
      legacyDetail?.name
    ) || 'QQ 音乐歌单';
    const coverUrl = normalizeImageUrl(firstText(
      detail?.dirinfo?.cover,
      detail?.dirinfo?.pic,
      legacyDetail?.diss_cover,
      legacyDetail?.cover,
      legacyDetail?.pic
    ));
    const creatorName = firstText(
      detail?.dirinfo?.creator?.nick,
      detail?.dirinfo?.creator?.nickname,
      legacyDetail?.creator?.nick,
      legacyDetail?.creator?.nickname
    );
    const description = firstText(
      detail?.dirinfo?.desc,
      legacyDetail?.diss_desc,
      legacyDetail?.desc
    ) ?? '';
    const listenNum = normalizeNonNegativeNumber(
      detail?.dirinfo?.listen_num ?? detail?.dirinfo?.songnum ?? legacyDetail?.listen_num ?? legacyDetail?.song_cnt
    );

    const songs = (detail?.songlist ?? legacyDetail?.songlist ?? [])
      .map((track) => mapTrack(track, providerScopedPlaylistId, playlistTitle))
      .filter((song): song is Song => Boolean(song));

    const detailPlaylist: Playlist = {
      id: providerScopedPlaylistId,
      providerId: 'qq',
      title: playlistTitle,
      description,
      songIds: [],
      coverTone: QQ_COVER_TONE,
      ...(coverUrl ? { coverUrl } : {}),
      sourceLabel: QQ_SOURCE_LABEL
    };

    return {
      providerId: 'qq',
      playlist: detailPlaylist,
      tracks: songs,
      ...(creatorName ? { creatorName } : {}),
      ...(listenNum !== undefined ? { playCount: listenNum } : {})
    };
  });
}

function createQQSongDetailUrl(songMid: string, songType = 0): string {
  return createQQMusicuUrl({
    req_0: {
      module: 'music.pf_song_detail_svr',
      method: 'get_song_detail_yqq',
      param: {
        song_mid: songMid,
        song_type: songType
      }
    }
  });
}

function createPlaylistCategoriesUrl(): string {
  const url = new URL(QQ_PLAYLIST_CATEGORIES_URL);
  setQQAnonymousRequestParams(url);
  return url.toString();
}

function createPlaylistDiscoveryUrl(query: Required<PlaylistDiscoveryQuery>): string {
  const url = new URL(QQ_PLAYLIST_DISCOVERY_URL);
  setQQAnonymousRequestParams(url);
  url.searchParams.set('picmid', '1');
  url.searchParams.set('categoryId', query.categoryId === 'all' ? '10000000' : query.categoryId);
  url.searchParams.set('sortId', '5');
  url.searchParams.set('sin', String(query.offset));
  url.searchParams.set('ein', String(query.offset + query.limit - 1));
  return url.toString();
}

function setQQAnonymousRequestParams(url: URL): void {
  url.searchParams.set('g_tk', '5381');
  url.searchParams.set('loginUin', '0');
  url.searchParams.set('hostUin', '0');
  url.searchParams.set('format', 'json');
  url.searchParams.set('inCharset', 'utf8');
  url.searchParams.set('outCharset', 'utf-8');
  url.searchParams.set('notice', '0');
  url.searchParams.set('platform', 'yqq.json');
  url.searchParams.set('needNewCode', '0');
}

function normalizePlaylistDiscoveryQuery(
  query: PlaylistDiscoveryQuery,
  errorMessage: string
): Required<PlaylistDiscoveryQuery> {
  const categoryId = query.categoryId?.trim();
  const limit = query.limit ?? 30;
  const offset = query.offset ?? 0;
  if (
    !categoryId ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    throw new Error(errorMessage);
  }

  return { categoryId, limit, offset };
}

function normalizeNonNegativeNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function createSearchUrl(keyword: string, limit: number, offset: number, searchType = 0): string {
  const normalizedLimit = Math.max(1, limit);
  const page = Math.floor(offset / normalizedLimit) + 1;
  const url = new URL(QQ_SEARCH_URL);
  url.searchParams.set('new_json', '1');
  url.searchParams.set('cr', '1');
  url.searchParams.set('p', String(page));
  url.searchParams.set('n', String(normalizedLimit));
  url.searchParams.set('w', keyword);
  url.searchParams.set('t', String(searchType));
  url.searchParams.set('format', 'json');
  url.searchParams.set('inCharset', 'utf8');
  url.searchParams.set('outCharset', 'utf-8');
  url.searchParams.set('platform', 'yqq.json');
  url.searchParams.set('needNewCode', '0');
  return url.toString();
}

function createSmartboxUrl(keyword: string): string {
  const url = new URL(QQ_SMARTBOX_URL);
  url.searchParams.set('key', keyword);
  url.searchParams.set('g_tk', '5381');
  url.searchParams.set('loginUin', '0');
  url.searchParams.set('hostUin', '0');
  url.searchParams.set('format', 'json');
  url.searchParams.set('inCharset', 'utf8');
  url.searchParams.set('outCharset', 'utf-8');
  url.searchParams.set('notice', '0');
  url.searchParams.set('platform', 'yqq.json');
  url.searchParams.set('needNewCode', '0');
  return url.toString();
}

function createHotSearchUrl(): string {
  const url = new URL(QQ_HOT_SEARCH_URL);
  setQQAnonymousRequestParams(url);
  return url.toString();
}

function createSongUrlUrl(
  songMid: string,
  quality: Quality,
  userId: string,
  playbackKey: string,
  mediaId: string,
  gTk: number
): string {
  const url = new URL(QQ_SONG_URL);
  const filename = createPlaybackFilename(mediaId, quality);
  const guid = createPlaybackGuid();
  const comm: Record<string, string | number> = {
    cv: playbackKey ? 0 : 4747474,
    ct: playbackKey ? 19 : 24,
    format: 'json',
    inCharset: 'utf-8',
    outCharset: 'utf-8',
    notice: 0,
    platform: 'yqq.json',
    needNewCode: 1,
    uin: userId,
    g_tk_new_20200303: gTk,
    g_tk: gTk
  };

  if (playbackKey) {
    comm.authst = playbackKey;
  }

  const data = {
    comm,
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        guid,
        songmid: [songMid],
        songtype: [0],
        uin: userId,
        loginflag: 1,
        platform: '20',
        filename: [filename]
      }
    }
  };

  url.searchParams.set('format', 'json');
  url.searchParams.set('data', JSON.stringify(data));
  return url.toString();
}

function createPlaybackGuid(): string {
  return String(randomInt(QQ_PLAYBACK_GUID_MIN, QQ_PLAYBACK_GUID_MAX));
}

function createLyricsUrl(songMid: string): string {
  const url = new URL(QQ_LYRICS_URL);
  setQQAnonymousRequestParams(url);
  url.searchParams.set('songmid', songMid);
  return url.toString();
}

function createPlaybackFilename(songMid: string, quality: Quality): string {
  const prefixByQuality: Record<Quality, string> = {
    standard: 'C400',
    higher: 'M500',
    exhigh: 'M800',
    lossless: 'F000'
  };
  const extensionByQuality: Record<Quality, string> = {
    standard: 'm4a',
    higher: 'mp3',
    exhigh: 'mp3',
    lossless: 'flac'
  };

  return `${prefixByQuality[quality]}${songMid}.${extensionByQuality[quality]}`;
}

function normalizeSongMediaId(song: Song, fallback: string): string {
  const mediaId = typeof song.platformMediaId === 'string' ? song.platformMediaId.trim() : '';
  return mediaId || fallback;
}

function createProviderScopedId(platformId: string | number): string {
  return `qq:${platformId}`;
}

function parseProviderScopedId(id: string): string {
  return id.startsWith('qq:') ? id.slice('qq:'.length) : id;
}

function createCookieMap(cookies: QQCookie[]): Record<string, string> {
  return cookies.reduce<Record<string, string>>((cookieMap, cookie) => {
    // Preserve Chromium's URL-scoped order when more than one applicable cookie has the same name.
    if (cookie.name && cookie.value && cookieMap[cookie.name] === undefined) {
      cookieMap[cookie.name] = cookie.value;
    }
    return cookieMap;
  }, {});
}

async function getQQCookieMap(runtime: QQRuntime, requestUrl: string): Promise<Record<string, string>> {
  return createCookieMap(await runtime.getCookies(QQ_LOGIN_PARTITION, requestUrl));
}

async function getQQAccountCookieMap(
  runtime: QQRuntime,
  requestCookieMap: Record<string, string>
): Promise<Record<string, string>> {
  const cookieGroups = await Promise.all(
    QQ_ACCOUNT_COOKIE_PROBE_URLS.map((url) => runtime.getCookies(QQ_LOGIN_PARTITION, url))
  );
  return createCookieMap([
    ...Object.entries(requestCookieMap).map(([name, value]) => ({ name, value })),
    ...cookieGroups.flat()
  ]);
}

function normalizeUin(raw: string | undefined): string {
  const candidate = String(raw ?? '').trim();
  const digits = candidate.startsWith('o') ? candidate.slice(1) : candidate;
  if (!/^\d+$/.test(digits)) {
    return '';
  }

  if (digits.length >= 14) {
    return digits;
  }

  const numericUin = Number.parseInt(digits, 10);
  return numericUin > 0 ? String(numericUin) : '';
}

function getCookieUin(cookieMap: Record<string, string>): string {
  const primaryUin = cookieMap.wxopenid ? cookieMap.wxuin : cookieMap.uin;
  return normalizeUin(primaryUin || cookieMap.p_uin || cookieMap.qqmusic_uin);
}

function getCookieMusicKey(cookieMap: Record<string, string>): string {
  return (
    cookieMap.qm_keyst ??
    cookieMap.qqmusic_key ??
    cookieMap.music_key ??
    cookieMap.p_skey ??
    cookieMap.skey ??
    cookieMap.psrf_qqaccess_token ??
    cookieMap.psrf_qqrefresh_token ??
    cookieMap.wxrefresh_token ??
    cookieMap.wxskey ??
    ''
  );
}

function getCookieSessionKey(cookieMap: Record<string, string>): string {
  return cookieMap.p_skey ?? cookieMap.skey ?? cookieMap.wxskey ?? '';
}

function getCookiePlaybackKey(cookieMap: Record<string, string>): string {
  return (
    cookieMap.qm_keyst ??
    cookieMap.qqmusic_key ??
    cookieMap.music_key ??
    cookieMap.psrf_qqaccess_token ??
    cookieMap.wxrefresh_token ??
    cookieMap.wxskey ??
    ''
  );
}

function hasDurableQQMusicSession(cookieMap: Record<string, string>): boolean {
  return Boolean(
    getCookiePlaybackKey(cookieMap)
    || cookieMap.psrf_qqaccess_token
    || cookieMap.psrf_qqrefresh_token
    || cookieMap.wxrefresh_token
  );
}

function getCookieNickname(cookieMap: Record<string, string>, userId: string): string {
  const keys = [`ptnick_${userId}`, `ptnick_0${userId}`, 'ptnick', 'nick', 'nickname', 'qq_nickname'];
  for (const key of keys) {
    const value = decodeCookieValue(cookieMap[key]);
    if (value) {
      return value;
    }
  }

  const ptnickKey = Object.keys(cookieMap).find((key) => /^ptnick_/i.test(key) && cookieMap[key]);
  return ptnickKey ? decodeCookieValue(cookieMap[ptnickKey]) : '';
}

function getCookieAvatar(cookieMap: Record<string, string>, userId: string): string {
  const directAvatar = decodeCookieValue(cookieMap.qqmusic_avatar ?? cookieMap.avatar ?? cookieMap.avatarUrl ?? cookieMap.headpic);
  return directAvatar || `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(userId)}&s=100`;
}

function getReadableQQNickname(userId: string, opaqueIdentifierValues: unknown[], ...values: unknown[]): string {
  const opaqueIdentifiers = new Set(
    opaqueIdentifierValues.flatMap((value) => {
      const identifier = firstText(value);
      return identifier ? [identifier, decodeCookieValue(identifier)] : [];
    })
  );

  for (const value of values) {
    const nickname = firstText(value);
    const identifierCandidate = nickname.replace(/^qq\s*/i, '');
    if (
      nickname
      && nickname !== userId
      && !opaqueIdentifiers.has(nickname)
      && !opaqueIdentifiers.has(decodeCookieValue(nickname))
      && !/^\d+$/.test(identifierCandidate)
      && !isOpaqueQQIdentifier(identifierCandidate)
    ) {
      return nickname;
    }
  }

  return 'QQ 音乐用户';
}

function isOpaqueQQIdentifier(value: string): boolean {
  const normalized = value.trim();
  const compactHex = normalized.replace(/-/g, '');
  if (/(?:openid|unionid|access[_-]?token|refresh[_-]?token|identifier|encoded[_-]?host)/i.test(normalized)) {
    return true;
  }

  if (/^[a-f\d]{16,}$/i.test(compactHex)) {
    return true;
  }

  if (normalized.length >= 20 && /^[a-z_-]+$/i.test(normalized)) {
    return true;
  }

  return normalized.length >= 24
    && /^[a-z\d_-]+$/i.test(normalized)
    && /[a-z]/i.test(normalized)
    && /\d/.test(normalized);
}

function decodeCookieValue(value: string | undefined): string {
  if (!value) {
    return '';
  }

  try {
    return decodeURIComponent(value.replace(/\+/g, '%20')).trim();
  } catch {
    return value.trim();
  }
}

function getVipType(
  data: QQProfilePayload,
  creator: QQProfilePayload,
  vipInfo: QQProfilePayload,
  cookieMap: Record<string, string>
): number {
  const vipType = Number(
    cookieMap.vipType ??
      cookieMap.vip_type ??
      data.vipType ??
      data.vip_type ??
      data.viptype ??
      data.music_vip_level ??
      data.green_vip_level ??
      data.luxury_vip_level ??
      creator.vipType ??
      creator.vip_type ??
      creator.music_vip_level ??
      creator.green_vip_level ??
      creator.luxury_vip_level ??
      vipInfo.vipType ??
      vipInfo.vip_type ??
      vipInfo.music_vip_level ??
      vipInfo.green_vip_level ??
      vipInfo.luxury_vip_level ??
      0
  );

  if (vipType > 0) {
    return vipType;
  }

  const vipFlag = data.isVip ?? data.is_vip ?? data.vipFlag ?? data.vipflag ?? creator.isVip ?? creator.is_vip ?? vipInfo.isVip ?? vipInfo.is_vip;
  return vipFlag === true || Number(vipFlag) > 0 || String(vipFlag ?? '').toLowerCase() === 'true' ? 1 : 0;
}

function mapPlaylist(playlist: QQPlaylistItem): Playlist | null {
  const platformPlaylistId = playlist.dissid ?? playlist.tid ?? playlist.dirid ?? playlist.dirId ?? playlist.id ?? playlist.diss_id;
  const platformDirectoryId = firstText(playlist.dirid, playlist.dirId);
  const title = playlist.diss_name ?? playlist.dirname ?? playlist.dirName ?? playlist.name ?? playlist.title ?? '';
  if (!platformPlaylistId || !title) {
    return null;
  }

  const trackCount = Number(
    playlist.song_cnt
    ?? playlist.songnum
    ?? playlist.songNum
    ?? playlist.total_song_num
    ?? playlist.song_count
    ?? 0
  ) || 0;
  const isLiked = isOfficialLikedDirectory(playlist);
  const coverUrl = isLiked ? undefined : normalizeImageUrl(firstText(
    playlist.diss_cover,
    playlist.logo,
    playlist.picurl,
    playlist.picUrl,
    playlist.bigpicUrl,
    playlist.albumPicUrl,
    playlist.cover
  ));
  return {
    id: createProviderScopedId(platformPlaylistId),
    providerId: 'qq',
    ...(platformDirectoryId ? { platformDirectoryId } : {}),
    title,
    description: playlist.desc ?? playlist.description ?? (trackCount ? `${trackCount} 首歌曲` : ''),
    songIds: [],
    coverTone: QQ_COVER_TONE,
    ...(coverUrl ? { coverUrl } : {}),
    ownership: isLiked ? 'liked' : 'created',
    sourceLabel: QQ_SOURCE_LABEL,
    ...(isLiked ? { isLiked: true } : {})
  };
}

function isOfficialLikedDirectory(playlist: QQPlaylistItem): boolean {
  return firstText(playlist.dirid, playlist.dirId) === QQ_LIKED_DIR_ID;
}

function mapTrack(
  raw: QQPlaylistTrack,
  playlistId: string,
  playlistTitle: string,
  explicitSourceContext?: SourceContext
): Song | null {
  const track = raw.track_info ?? raw.songInfo ?? raw.songinfo ?? raw.song ?? raw;
  const album = track.album ?? {};
  const platformSongId = firstText(track.mid, track.songmid, raw.mid, raw.songmid, track.id, track.songid, raw.id, raw.songid);
  const platformNumericSongId = firstQQSongNumericId(
    track.id,
    track.songid,
    track.songId,
    raw.id,
    raw.songid,
    raw.songId
  );
  const platformSongType = firstQQSongType(
    track.type,
    track.songtype,
    track.songType,
    raw.type,
    raw.songtype,
    raw.songType
  );
  const platformMediaId = firstText(
    track.file?.media_mid,
    track.file?.mediaMid,
    track.file?.strMediaMid,
    raw.file?.media_mid,
    raw.file?.mediaMid,
    raw.file?.strMediaMid,
    track.media_mid,
    track.mediaMid,
    track.strMediaMid,
    raw.media_mid,
    raw.mediaMid,
    raw.strMediaMid
  );
  const title = firstText(track.name, track.songname, raw.songname, track.title, raw.title);
  if (!platformSongId || !title) {
    return null;
  }

  const artists = mapArtists(track.singer ?? track.singers ?? []);
  const albumMid = firstText(
    album.mid,
    album.pmid,
    album.albumMid,
    album.album_mid,
    track.albummid,
    track.albumMid,
    track.album_mid,
    raw.albummid,
    raw.albumMid,
    raw.album_mid
  );
  const albumTitle = firstText(album.name, album.title, track.albumname, track.albumName, raw.albumname, raw.albumName);
  const artistReferences = artists
    .map(mapQQArtistReference)
    .filter((artist): artist is ArtistReference => Boolean(artist));
  const albumReference = albumMid && albumTitle
    ? {
        id: `qq:album:${albumMid}`,
        providerId: 'qq' as const,
        platformAlbumId: albumMid,
        title: albumTitle
      }
    : null;
  const sourceContext = explicitSourceContext ?? (playlistId && playlistTitle
    ? {
        type: 'playlist' as const,
        providerId: 'qq' as const,
        playlistId,
        playlistTitle
      }
    : undefined);
  const artistText = artists.map((artist) => artist.name).join(' / ') || track.singername || raw.singername || '未知歌手';
  const artistMid = firstText(...artists.map((artist) => artist.mid));
  const artistImageUrl = firstText(...artists.map((artist) => artist.imageUrl)) || (artistMid ? createArtistImageUrl(artistMid) : '');

  return {
    id: createProviderScopedId(platformSongId),
    providerId: 'qq',
    platformSongId,
    ...(platformNumericSongId !== undefined ? { platformNumericSongId } : {}),
    ...(platformSongType !== undefined ? { platformSongType } : {}),
    ...(platformMediaId ? { platformMediaId } : {}),
    title,
    artist: artistText,
    album: albumTitle || '未知专辑',
    ...(artistReferences.length > 0 ? { artists: artistReferences } : {}),
    ...(albumReference ? { albumRef: albumReference } : {}),
    durationMs: (Number(track.interval ?? raw.interval) || 0) * 1000,
    coverTone: QQ_COVER_TONE,
    coverUrl: albumMid ? createAlbumCoverUrl(albumMid) : undefined,
    artistImageUrl: artistImageUrl || undefined,
    ...(sourceContext ? { sourceContext } : {})
  };
}

function mapQQArtistReference(artist: QQArtist): ArtistReference | null {
  const platformArtistId = firstText(artist.mid);
  const name = firstText(artist.name);
  if (!platformArtistId || !name) {
    return null;
  }

  return {
    id: `qq:artist:${platformArtistId}`,
    providerId: 'qq',
    platformArtistId,
    name
  };
}

function mapArtists(rawArtists: QQArtist[] | undefined): QQArtist[] {
  return (rawArtists ?? [])
    .map((artist) => ({
      id: artist.id,
      mid: firstText(artist.mid, artist.singerMid, artist.singer_mid, artist.singermid),
      name: artist.name ?? artist.title ?? artist.singer ?? '',
      imageUrl: normalizeImageUrl(firstText(artist.pic, artist.picurl, artist.photo, artist.imageUrl, artist.avatarUrl))
    }))
    .filter((artist) => Boolean(artist.name));
}

function createAlbumCoverUrl(albumMid: string): string {
  return `https://y.qq.com/music/photo_new/T002R300x300M000${albumMid}.jpg?max_age=2592000`;
}

function createArtistImageUrl(artistMid: string): string {
  return `https://y.gtimg.cn/music/photo_new/T001R300x300M000${artistMid}.jpg?max_age=2592000`;
}

async function hydrateQQSearchArtistImages(runtime: QQRuntime, keyword: string, songs: Song[]): Promise<Song[]> {
  if (!songs.some((song) => !song.artistImageUrl)) {
    return songs;
  }

  try {
    const response = await runtime.requestJson<QQSmartboxResponse>({
      partition: QQ_LOGIN_PARTITION,
      url: createSmartboxUrl(keyword)
    });
    const imageByArtistName = getSmartboxArtistImages(response);
    if (imageByArtistName.size === 0) {
      return songs;
    }

    return songs.map((song) => {
      if (song.artistImageUrl) {
        return song;
      }

      const imageUrl = splitArtistNames(song.artist)
        .map((artistName) => imageByArtistName.get(normalizeArtistName(artistName)))
        .find(Boolean);

      return imageUrl ? { ...song, artistImageUrl: imageUrl } : song;
    });
  } catch {
    return songs;
  }
}

function getSmartboxArtistImages(response: QQSmartboxResponse): Map<string, string> {
  const artistItems = [
    ...(response.data?.singer?.itemlist ?? []),
    ...(response.data?.singer?.list ?? []),
    ...(response.data?.singer?.items ?? [])
  ];

  return artistItems.reduce((imageByArtistName, artist) => {
    const artistName = firstText(artist.name, artist.singer, artist.title);
    const artistMid = firstText(artist.mid, artist.singerMid, artist.singer_mid, artist.singermid);
    const imageUrl = normalizeImageUrl(firstText(artist.pic, artist.picurl, artist.photo, artist.imageUrl, artist.avatarUrl)) || (artistMid ? createArtistImageUrl(artistMid) : '');
    if (artistName && imageUrl) {
      imageByArtistName.set(normalizeArtistName(artistName), imageUrl);
    }
    return imageByArtistName;
  }, new Map<string, string>());
}

function splitArtistNames(artist: string): string[] {
  return artist
    .split(/[/,、，&;；]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function normalizeArtistName(artist: string): string {
  return artist.trim().toLocaleLowerCase();
}

function normalizeImageUrl(imageUrl: string): string {
  return imageUrl.replace(/^http:\/\//i, 'https://');
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return '';
}

function getSearchSongList(response: QQSearchResponse): QQPlaylistTrack[] {
  return response.data?.song?.list ?? [];
}

function createRestrictedSongUrlResult(quality: Quality, reason: PlaybackRestriction): SongUrlResult {
  return {
    ok: false,
    providerId: 'qq',
    quality,
    reason
  };
}

function getQQPlaybackUrl(response: QQSongUrlResponse): string {
  const data = response.req_0?.data ?? response.data?.req_0?.data ?? response.data;
  const info = data?.midurlinfo?.find((item) => typeof item.purl === 'string' && item.purl.trim()) ?? null;
  const purl = info?.purl?.trim() ?? '';
  if (!purl) {
    return '';
  }

  if (/^https?:\/\//i.test(purl)) {
    return purl;
  }

  const sip = data?.sip?.find((baseUrl) => typeof baseUrl === 'string' && baseUrl.trim()) ?? 'https://dl.stream.qqmusic.qq.com/';
  return `${sip.replace(/\/?$/, '/')}${purl.replace(/^\//, '')}`;
}

function mapQQSongUrlRestriction(response: QQSongUrlResponse): PlaybackRestriction {
  const data = response.req_0?.data ?? response.data?.req_0?.data ?? response.data;
  const info = data?.midurlinfo?.[0];
  const code = Number(info?.result ?? response.req_0?.code ?? response.code ?? 0);
  const message = String(info?.msg ?? response.req_0?.message ?? response.message ?? response.msg ?? '').trim();
  const normalizedMessage = message.toLocaleLowerCase();

  if (normalizedMessage.includes('vip') || normalizedMessage.includes('会员')) {
    return {
      category: 'vip_required',
      message: message || '当前歌曲需要会员权限，无法获取播放地址',
      action: 'upgrade'
    };
  }

  if (code === 104003) {
    return {
      category: 'playback_auth_incomplete',
      message: message || 'QQ 音乐播放授权被服务端拒绝，请重新登录后再试',
      action: 'login'
    };
  }

  if (code === -110 || normalizedMessage.includes('版权')) {
    return {
      category: 'copyright_unavailable',
      message: message || '当前歌曲受版权限制，无法获取播放地址',
      action: 'switch_source'
    };
  }

  return {
    category: 'url_unavailable',
    message: message || '当前 QQ 音乐歌曲暂时无法获取播放地址',
    action: 'retry'
  };
}

function decodeQQBase64Lyric(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const normalizedValue = value.replace(/\s+/g, '');
  const plainLyric = decodeHtmlEntities(value).trim();
  if (!isLikelyBase64(normalizedValue)) {
    return plainLyric;
  }

  try {
    const buffer = Buffer.from(normalizedValue, 'base64');
    const utf8Lyric = decodeHtmlEntities(buffer.toString('utf8')).trim();
    const gb18030Lyric = decodeHtmlEntities(new TextDecoder('gb18030').decode(buffer)).trim();

    if (!utf8Lyric) {
      return gb18030Lyric;
    }

    return utf8Lyric.includes('\uFFFD') ? gb18030Lyric : utf8Lyric;
  } catch {
    return '';
  }
}

function isLikelyBase64(value: string): boolean {
  return value.length >= 4 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function isQQNoLyricsPlaceholder(value: string): boolean {
  const plainText = value.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, '');
  return plainText.includes('没有填词') && plainText.includes('口白');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, codePoint: string) => String.fromCodePoint(Number(codePoint)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

interface QQMusicuRequest {
  module: string;
  method: string;
  param: Record<string, unknown>;
}

interface QQNewSongResponse {
  code?: number;
  new_song?: {
    code?: number;
    data?: {
      songlist?: QQPlaylistTrack[];
    };
  };
}

interface QQNewAlbumsResponse {
  code?: number;
  new_album?: {
    code?: number;
    data?: {
      albums?: QQNewAlbum[];
    };
  };
}

interface QQNewAlbum {
  mid?: string;
  name?: string;
  release_time?: string;
  type?: number;
  singers?: Array<{ name?: string }>;
}

interface QQArtistDetailResponse {
  code?: number;
  singer_detail?: {
    code?: number;
    data?: {
      singer_list?: QQSingerDetail[];
    };
  };
  singer_albums?: {
    code?: number;
    data?: {
      total?: number;
      albumList?: QQSingerAlbum[];
    };
  };
  singer_songs?: {
    code?: number;
    data?: {
      totalNum?: number;
      songList?: QQPlaylistTrack[];
    };
  };
}

interface QQAlbumDetailResponse {
  code?: number;
  album_detail?: {
    code?: number;
    data?: {
      basicInfo?: {
        albumMid?: string;
        albumName?: string;
        publishDate?: string;
        desc?: string;
        albumType?: string;
      };
      singer?: {
        singerList?: QQArtist[];
      };
    };
  };
  album_songs?: {
    code?: number;
    data?: {
      totalNum?: number;
      songList?: QQPlaylistTrack[];
    };
  };
}

interface QQArtistSongsResponse {
  code?: number;
  singer_songs?: {
    code?: number;
    data?: {
      totalNum?: number;
      songList?: QQPlaylistTrack[];
    };
  };
}

interface QQSingerDetail {
  basic_info?: {
    singer_mid?: string;
    name?: string;
  };
  ex_info?: {
    foreign_name?: string;
    desc?: string;
  };
  pic?: {
    pic?: string;
  };
}

interface QQSingerAlbum {
  albumMid?: string;
  albumName?: string;
  publishDate?: string;
  totalNum?: number;
  albumType?: string;
  singerName?: string;
}

interface QQProfile {
  loggedIn: boolean;
  playbackReady: boolean;
  userId: string;
  nickname: string;
  avatarUrl: string;
  vipType: number;
}

interface QQToplistResponse {
  code?: number;
  req_1?: {
    code?: number;
    data?: {
      group?: QQToplistGroup[];
      data?: QQToplistItem;
      songInfoList?: QQPlaylistTrack[];
    };
  };
}

interface QQToplistGroup {
  groupId?: number;
  groupName?: string;
  toplist?: QQToplistItem[];
}

interface QQToplistItem {
  topId?: string | number;
  title?: string;
  intro?: string;
  period?: string;
  updateTime?: string;
  updateTips?: string;
  frontPicUrl?: string;
  headPicUrl?: string;
}

interface QQPlaylistCategoriesResponse {
  code?: number;
  data?: {
    categories?: Array<{
      categoryGroupName?: string;
      usable?: boolean | number;
      items?: Array<{
        categoryId?: string | number;
        categoryName?: string;
        usable?: boolean | number;
      }>;
    }>;
  };
}

interface QQPlaylistDiscoveryResponse {
  code?: number;
  data?: {
    sin?: number;
    ein?: number;
    sum?: number;
    list?: QQDiscoveredPlaylistItem[];
  };
}

interface QQDiscoveredPlaylistItem {
  dissid?: string | number;
  dissname?: string;
  introduction?: string;
  imgurl?: string;
  listennum?: number;
  creator?: {
    name?: string;
    nick?: string;
    nickname?: string;
    creator_name?: string;
  };
}

interface QQSessionIdentity {
  userId: string;
  loggedIn: boolean;
  gTk: number;
}

interface QQPlaybackIdentity extends QQSessionIdentity {
  playbackReady: boolean;
  playbackKey: string;
}

interface QQSongDetailResponse {
  code?: number;
  message?: string;
  msg?: string;
  req_0?: {
    code?: number;
    message?: string;
    data?: {
      track_info?: QQPlaylistTrack;
      songInfo?: QQPlaylistTrack;
      songinfo?: QQPlaylistTrack;
      song?: QQPlaylistTrack;
    };
  };
}

interface QQMusicuMutationResponse {
  code?: number | string;
  message?: string;
  msg?: string;
}

interface QQProfileResponse extends QQProfilePayload {
  code?: number;
  message?: string;
  msg?: string;
  result?: number | QQProfilePayload;
  data?: QQProfilePayload;
  profile?: QQProfilePayload;
  creator?: QQProfilePayload;
}

interface QQProfilePayload {
  [key: string]: unknown;
  creator?: QQProfilePayload;
  user?: QQProfilePayload;
  profile?: QQProfilePayload;
  vipInfo?: QQProfilePayload;
  vipinfo?: QQProfilePayload;
  vip?: QQProfilePayload;
  nick?: string;
  nickname?: string;
  name?: string;
  hostname?: string;
  headpic?: string;
  avatar?: string;
  avatarUrl?: string;
  logo?: string;
}

interface QQPlaylistListResponse {
  code?: number;
  message?: string;
  msg?: string;
  req_0?: {
    code?: number;
    message?: string;
    data?: {
      v_playlist?: QQPlaylistItem[];
    };
  };
  data?: {
    disslist?: QQPlaylistItem[];
  };
}

interface QQPlaylistItem {
  dissid?: string | number;
  tid?: string | number;
  dirid?: string | number;
  dirId?: string | number;
  id?: string | number;
  diss_id?: string | number;
  diss_name?: string;
  dirname?: string;
  dirName?: string;
  name?: string;
  title?: string;
  desc?: string;
  description?: string;
  diss_cover?: string;
  logo?: string;
  picurl?: string;
  picUrl?: string;
  bigpicUrl?: string;
  albumPicUrl?: string;
  cover?: string;
  song_cnt?: number;
  songnum?: number;
  songNum?: number;
  total_song_num?: number;
  song_count?: number;
}

interface QQPlaylistDetailResponse {
  code?: number;
  req_0?: {
    code?: number;
    data?: {
      dirinfo?: {
        title?: string;
        dissname?: string;
        desc?: string;
        cover?: string;
        pic?: string;
        listen_num?: number;
        songnum?: number;
        creator?: {
          nick?: string;
          nickname?: string;
        };
      };
      songlist?: QQPlaylistTrack[];
    };
  };
  cdlist?: Array<{
    dissname?: string;
    diss_name?: string;
    diss_desc?: string;
    name?: string;
    desc?: string;
    cover?: string;
    diss_cover?: string;
    pic?: string;
    listen_num?: number;
    songnum?: number;
    song_cnt?: number;
    creator?: {
      nick?: string;
      nickname?: string;
    };
    songlist?: QQPlaylistTrack[];
  }>;
}

interface QQSearchResponse {
  code?: number;
  data?: {
    song?: QQSearchSection & {
      list?: QQPlaylistTrack[];
    };
    album?: QQSearchSection & {
      list?: QQSearchAlbum[];
    };
  };
}

interface QQSmartboxResponse {
  code?: number;
  data?: {
    song?: QQSmartboxGroup;
    singer?: QQSmartboxGroup;
    album?: QQSmartboxGroup;
    playlist?: QQSmartboxGroup;
  };
}

interface QQSearchSection {
  totalnum?: number;
  totalNum?: number;
  total?: number;
}

interface QQSearchAlbum {
  albumMID?: string;
  albumMid?: string;
  mid?: string;
  pmid?: string;
  albumName?: string;
  albumname?: string;
  name?: string;
  title?: string;
  singerName?: string;
  singername?: string;
  artistName?: string;
  artist?: string;
  albumPic?: string;
  picUrl?: string;
  picurl?: string;
  cover?: string;
  publicTime?: string;
  publishDate?: string;
  releaseDate?: string;
  songNum?: number;
  songnum?: number;
  totalNum?: number;
  totalnum?: number;
}

interface QQSmartboxGroup {
  itemlist?: QQSmartboxItem[];
  list?: QQSmartboxItem[];
  items?: QQSmartboxItem[];
}

interface QQSmartboxItem {
  id?: string | number;
  name?: string;
  singer?: string;
  title?: string;
  songname?: string;
  albumname?: string;
  singername?: string;
  artistName?: string;
  mid?: string;
  albumMID?: string;
  albumMid?: string;
  singerMid?: string;
  singer_mid?: string;
  singermid?: string;
  pic?: string;
  picurl?: string;
  photo?: string;
  imageUrl?: string;
  avatarUrl?: string;
}

type QQSmartboxSinger = QQSmartboxItem;

type QQHotSearchItem = {
  k?: string;
  key?: string;
  keyword?: string;
  searchWord?: string;
  n?: string;
  name?: string;
  title?: string;
  score?: number;
  hot?: number;
  iconUrl?: string;
  icon?: string;
} | string;

interface QQHotSearchResponse {
  code?: number;
  data?: {
    hotkey?: QQHotSearchItem[];
    hotkeys?: QQHotSearchItem[];
  };
}

interface QQSongUrlResponse {
  code?: number;
  message?: string;
  msg?: string;
  req_0?: QQSongUrlModuleResponse;
  data?: QQSongUrlData & {
    req_0?: QQSongUrlModuleResponse;
  };
}

interface QQSongUrlModuleResponse {
  code?: number;
  message?: string;
  data?: QQSongUrlData;
}

interface QQSongUrlData {
  sip?: string[];
  midurlinfo?: QQSongUrlItem[];
}

interface QQSongUrlItem {
  purl?: string;
  result?: number;
  msg?: string;
}

interface QQLyricsResponse {
  code?: number;
  message?: string;
  msg?: string;
  lyric?: string;
  trans?: string;
  translyric?: string;
  data?: {
    lyric?: string;
    trans?: string;
    translyric?: string;
  };
}

interface QQPlaylistTrack {
  [key: string]: unknown;
  track_info?: QQPlaylistTrack;
  songInfo?: QQPlaylistTrack;
  songinfo?: QQPlaylistTrack;
  song?: QQPlaylistTrack;
  album?: QQAlbum;
  singer?: QQArtist[];
  singers?: QQArtist[];
  file?: QQFile;
  mid?: string;
  songmid?: string;
  media_mid?: string;
  mediaMid?: string;
  strMediaMid?: string;
  id?: string | number;
  songid?: string | number;
  songId?: string | number;
  type?: string | number;
  songtype?: string | number;
  songType?: string | number;
  songname?: string;
  title?: string;
  name?: string;
  singername?: string;
  albumname?: string;
  albumName?: string;
  albummid?: string;
  albumMid?: string;
  album_mid?: string;
  interval?: number;
}

interface QQFile {
  media_mid?: string;
  mediaMid?: string;
  strMediaMid?: string;
}

interface QQAlbum {
  mid?: string;
  pmid?: string;
  albumMid?: string;
  album_mid?: string;
  name?: string;
  title?: string;
}

interface QQArtist {
  id?: string | number;
  mid?: string;
  singerMid?: string;
  singer_mid?: string;
  singermid?: string;
  name?: string;
  singer?: string;
  title?: string;
  pic?: string;
  picurl?: string;
  photo?: string;
  imageUrl?: string;
  avatarUrl?: string;
}
