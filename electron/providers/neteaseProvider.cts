import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import { createHash } from 'node:crypto';
import { createProviderRequestError, createProviderTimeoutError } from './providerErrors.cjs';
import { createNeteaseWeapiRequest } from './neteaseWeapi.cjs';
import type {
  AlbumDetail,
  AlbumReference,
  AlbumSummary,
  ArtistDetail,
  ArtistReference,
  ArtistSummary,
  ChartSummary,
  DiscoveredPlaylist,
  HomepageBlockFeed,
  LoginStatus,
  LyricsResult,
  MusicProvider,
  PlaybackRestriction,
  Playlist,
  PlaylistCategory,
  PlaylistDiscoveryPage,
  PlaylistDiscoveryQuery,
  PlaylistOwnership,
  ProviderFetchOptions,
  Quality,
  RecommendationHistoryPage,
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

export const NETEASE_LOGIN_PARTITION = 'persist:musicplayer-netease-login';
export const NETEASE_LOGIN_URL = 'https://music.163.com/';
export const NETEASE_ACCOUNT_URL = 'https://music.163.com/api/nuser/account/get';
export const NETEASE_SEARCH_URL = 'https://music.163.com/api/search/get/web';
export const NETEASE_SEARCH_SUGGEST_URL = 'https://music.163.com/api/search/suggest/web';
export const NETEASE_HOT_SEARCH_URL = 'https://music.163.com/api/search/hot/detail';
export const NETEASE_SONG_DETAIL_URL = 'https://music.163.com/api/song/detail';
export const NETEASE_LYRICS_URL = 'https://music.163.com/api/song/lyric';
export const NETEASE_TOPLIST_URL = 'https://music.163.com/api/toplist/detail';
export const NETEASE_PLAYLIST_CATEGORIES_URL = 'https://music.163.com/api/playlist/catalogue';
export const NETEASE_PLAYLIST_DISCOVERY_URL = 'https://music.163.com/api/playlist/list';
export const NETEASE_ARTIST_DETAIL_URL = 'https://music.163.com/api/v1/artist';
export const NETEASE_ARTIST_ALBUMS_URL = 'https://music.163.com/api/artist/albums';
export const NETEASE_ALBUM_DETAIL_URL = 'https://music.163.com/api/v1/album';
export const NETEASE_PERSONALIZED_NEW_SONGS_URL = 'https://music.163.com/api/personalized/newsong';
export const NETEASE_DAILY_RECOMMENDED_SONGS_URL = 'https://music.163.com/api/v3/discovery/recommend/songs';
export const NETEASE_RECOMMENDATION_HISTORY_DATES_URL = 'https://music.163.com/api/discovery/recommend/songs/history/recent';
export const NETEASE_RECOMMENDATION_HISTORY_DETAIL_URL = 'https://music.163.com/api/discovery/recommend/songs/history/detail';
export const NETEASE_SIMILAR_SONGS_URL = 'https://music.163.com/api/v1/discovery/simiSong';
export const NETEASE_HOMEPAGE_BLOCKS_URL = 'https://music.163.com/api/homepage/block/page';
export const NETEASE_NEW_ALBUMS_URL = 'https://music.163.com/api/album/new';
export const NETEASE_LIKE_URL = 'https://music.163.com/api/radio/like';
export const NETEASE_PLAYLIST_TRACKS_URL = 'https://music.163.com/api/playlist/manipulate/tracks';
const NETEASE_SOURCE_LABEL = '网易云';
const NETEASE_COVER_TONE = 'linear-gradient(135deg, #d94b55, #30343b)';
const NETEASE_DISCOVERY_COVER_SIZE = 512;
const NETEASE_SONG_DETAIL_BATCH_SIZE = 100;
const NETEASE_SONG_URL_BASE_URL = 'https://music.163.com/api/song/enhance/player/url';
const NETEASE_IMAGE_ENCRYPTION_KEY = '3go8&$8*3*3h0k(2)2';
const NETEASE_WEAPI_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';
const PROVIDER_REQUEST_TIMEOUT_MS = 12_000;

export interface NeteaseCookie {
  name: string;
  value: string;
}

export interface NeteaseRuntime {
  openLoginWindow(options: { partition: string; url: string }): Promise<void>;
  getCookies(partition: string): Promise<NeteaseCookie[]>;
  requestJson<T>(request: {
    partition: string;
    url: string;
    method?: 'GET' | 'POST';
    form?: Record<string, string | number | boolean>;
    crypto?: 'weapi';
    credentials?: 'include' | 'omit';
  }): Promise<T>;
  clearSession(partition: string): Promise<void>;
}

export function createNeteaseProvider(
  runtime: NeteaseRuntime = createElectronNeteaseRuntime(),
  cache: CacheStore = createMemoryCacheStore()
): MusicProvider {
  return {
    id: 'netease',
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
      homepageBlocks: {
        getHomepageBlocks(options = {}) {
          return getHomepageBlocks(runtime, cache, options);
        }
      },
      similarSongs: {
        getSimilarSongs(song, options = {}) {
          return getSimilarSongs(runtime, cache, song, options);
        }
      },
      recommendationHistory: {
        getRecentDates(options = {}) {
          return getRecommendationHistoryDates(runtime, cache, options);
        },
        getHistory(date, options = {}) {
          return getRecommendationHistory(runtime, cache, date, options);
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
      cache.deleteByPrefix(CACHE_KEYS.providerPrefix('netease'));
      await runtime.openLoginWindow({
        partition: NETEASE_LOGIN_PARTITION,
        url: NETEASE_LOGIN_URL
      });
      cache.deleteByPrefix(CACHE_KEYS.providerPrefix('netease'));
      return getLoginStatus(runtime, cache);
    },

    async logout() {
      await runtime.clearSession(NETEASE_LOGIN_PARTITION);
      cache.deleteByPrefix(CACHE_KEYS.providerPrefix('netease'));
    },

    async search(keyword, options = {}) {
      const normalizedKeyword = keyword.trim();
      if (!normalizedKeyword) {
        return [];
      }

      const limit = options.limit ?? 30;
      const offset = options.offset ?? 0;

      return cache.getOrSet(CACHE_KEYS.searchResults('netease', normalizedKeyword, limit, offset), CACHE_TTL_MS.searchResults, async () => {
        const response = await runtime.requestJson<NeteaseSearchResponse>({
          partition: NETEASE_LOGIN_PARTITION,
          url: createSearchUrl(normalizedKeyword, limit, offset)
        });

        const searchTracks = response.result?.songs ?? [];
        const songs = searchTracks.map(mapSearchTrack);
        return hydrateNeteaseSearchArtwork(runtime, normalizedKeyword, songs);
      });
    },

    async getUserPlaylists(options = {}) {
      const cacheKey = CACHE_KEYS.providerPlaylists('netease');
      if (options.forceRefresh) {
        cache.delete(cacheKey);
      }

      return cache.getOrSet(cacheKey, CACHE_TTL_MS.providerPlaylists, async () => {
        const profile = await getAccountProfile(runtime);
        if (!profile) {
          throw new Error('网易云音乐未登录');
        }

        const response = await runtime.requestJson<NeteasePlaylistListResponse>({
          partition: NETEASE_LOGIN_PARTITION,
          url: createUserPlaylistUrl(profile.userId)
        });

        return (response.playlist ?? []).map((playlist) => mapPlaylist(playlist, profile.userId));
      });
    },

    async getPlaylistTracks(playlistId, options = {}) {
      const platformPlaylistId = parseProviderScopedId(playlistId);
      const providerScopedPlaylistId = createProviderScopedId(platformPlaylistId);
      const cacheKey = CACHE_KEYS.playlistTracks('netease', providerScopedPlaylistId);
      if (options.forceRefresh) {
        cache.delete(cacheKey);
      }

      return cache.getOrSet(cacheKey, CACHE_TTL_MS.playlistTracks, async () => {
        const response = await runtime.requestJson<NeteasePlaylistDetailResponse>({
          partition: NETEASE_LOGIN_PARTITION,
          url: createPlaylistDetailUrl(platformPlaylistId)
        });
        const playlist = response.playlist;
        if (response.code !== 200) {
          throw new Error('网易云歌单详情请求失败');
        }
        if (!playlist) {
          throw new Error('网易云歌单详情数据无效');
        }

        const playlistTitle = playlist.name ?? '网易云歌单';
        const tracks = await completeNeteasePlaylistTracks(runtime, playlist);

        return tracks.map((track) => mapTrack(track, providerScopedPlaylistId, playlistTitle));
      });
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
      return mutatePlaylistTracks(runtime, cache, song, playlistId, 'add');
    },

    async removeSongFromPlaylist(song, playlistId) {
      return mutatePlaylistTracks(runtime, cache, song, playlistId, 'del');
    }
  };
}

export const neteaseProvider = createNeteaseProvider();

const SEARCH_ENTITY_TYPES: readonly SearchEntityType[] = ['song', 'artist', 'album', 'playlist'];

async function getSearchSuggestions(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  keyword: string,
  options: SearchSuggestionOptions
): Promise<SearchSuggestion[]> {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) {
    return [];
  }

  const limit = normalizeSearchSuggestionLimit(options.limit);
  const cacheKey = CACHE_KEYS.searchSuggestions('netease', normalizedKeyword, limit);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.searchSuggestions, async () => {
    const response = await runtime.requestJson<NeteaseSearchSuggestResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: createSearchSuggestionUrl(normalizedKeyword)
    });
    assertNeteaseSearchSuccess(response, '网易云音乐搜索提示请求失败');
    return getNeteaseSearchSuggestions(response).slice(0, limit);
  });
}

async function getHotSearches(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  options: SearchSuggestionOptions
): Promise<SearchHotSearch[]> {
  const limit = normalizeSearchSuggestionLimit(options.limit);
  const cacheKey = CACHE_KEYS.searchHotSearches('netease', limit);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.searchHotSearches, async () => {
    const response = await runtime.requestJson<NeteaseHotSearchResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_HOT_SEARCH_URL
    });
    assertNeteaseSearchSuccess(response, '网易云音乐热搜请求失败');
    return getNeteaseHotSearches(response).slice(0, limit);
  });
}

async function searchEntities(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  keyword: string,
  options: SearchEntityOptions
): Promise<SearchEntityResults> {
  const query = normalizeSearchEntityQuery(keyword, options, '网易云音乐搜索参数无效');
  if (!query.keyword) {
    return createNeteaseEmptySearchEntityResults('');
  }

  const cacheKey = CACHE_KEYS.searchEntities('netease', query.keyword, query.limit, query.offset, query.entityTypes);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  const cached = cache.get<SearchEntityResults>(cacheKey);
  if (cached) {
    return cached;
  }

  const result: SearchEntityResults = await (async (): Promise<SearchEntityResults> => {
    const requestedTypes = new Set(query.entityTypes);
    const [songs, artists, albums, playlists] = await Promise.all([
      requestedTypes.has('song')
        ? resolveNeteaseSearchSection(() => getNeteaseSongSearchSection(runtime, query))
        : Promise.resolve(createSearchEntitySection<Song>(true)),
      requestedTypes.has('artist')
        ? resolveNeteaseSearchSection(() => getNeteaseArtistSearchSection(runtime, query))
        : Promise.resolve(createSearchEntitySection<ArtistSummary>(true)),
      requestedTypes.has('album')
        ? resolveNeteaseSearchSection(() => getNeteaseAlbumSearchSection(runtime, query))
        : Promise.resolve(createSearchEntitySection<AlbumSummary>(true)),
      requestedTypes.has('playlist')
        ? resolveNeteaseSearchSection(() => getNeteasePlaylistSearchSection(runtime, query))
        : Promise.resolve(createSearchEntitySection<DiscoveredPlaylist>(true))
    ]);

    return {
      providerId: 'netease',
      keyword: query.keyword,
      sections: { songs, artists, albums, playlists }
    };
  })();
  if (!hasSearchEntityErrors(result)) {
    cache.set(cacheKey, result, CACHE_TTL_MS.searchEntities);
  }
  return result;
}

function createNeteaseEmptySearchEntityResults(keyword: string): SearchEntityResults {
  return {
    providerId: 'netease',
    keyword,
    sections: {
      songs: createSearchEntitySection<Song>(true),
      artists: createSearchEntitySection<ArtistSummary>(true),
      albums: createSearchEntitySection<AlbumSummary>(true),
      playlists: createSearchEntitySection<DiscoveredPlaylist>(true)
    }
  };
}

async function getNeteaseSongSearchSection(
  runtime: NeteaseRuntime,
  query: NormalizedSearchEntityQuery
): Promise<SearchEntitySection<Song>> {
  const response = await requestNeteaseSearch(runtime, query, 1, '网易云音乐歌曲搜索请求失败');
  const rawSongs = response.result?.songs ?? [];
  const songs = rawSongs.map(mapSearchTrack);
  if (rawSongs.length > 0 && songs.length === 0) {
    throw new Error('网易云音乐歌曲搜索数据无效');
  }
  return createSearchEntitySection(true, songs, getNeteaseSearchTotal(response.result?.songCount), query);
}

async function getNeteaseArtistSearchSection(
  runtime: NeteaseRuntime,
  query: NormalizedSearchEntityQuery
): Promise<SearchEntitySection<ArtistSummary>> {
  const response = await requestNeteaseSearch(runtime, query, 100, '网易云音乐歌手搜索请求失败');
  const rawArtists = response.result?.artists ?? [];
  const artists = rawArtists
    .map(mapNeteaseArtistSummary)
    .filter((artist): artist is ArtistSummary => Boolean(artist));
  if (rawArtists.length > 0 && artists.length === 0) {
    throw new Error('网易云音乐歌手搜索数据无效');
  }
  return createSearchEntitySection(true, artists, getNeteaseSearchTotal(response.result?.artistCount), query);
}

async function getNeteaseAlbumSearchSection(
  runtime: NeteaseRuntime,
  query: NormalizedSearchEntityQuery
): Promise<SearchEntitySection<AlbumSummary>> {
  const response = await requestNeteaseSearch(runtime, query, 10, '网易云音乐专辑搜索请求失败');
  const rawAlbums = response.result?.albums ?? [];
  const albums = rawAlbums
    .map(mapNeteaseAlbumSummary)
    .filter((album): album is AlbumSummary => Boolean(album));
  if (rawAlbums.length > 0 && albums.length === 0) {
    throw new Error('网易云音乐专辑搜索数据无效');
  }
  return createSearchEntitySection(true, albums, getNeteaseSearchTotal(response.result?.albumCount), query);
}

async function getNeteasePlaylistSearchSection(
  runtime: NeteaseRuntime,
  query: NormalizedSearchEntityQuery
): Promise<SearchEntitySection<DiscoveredPlaylist>> {
  const response = await requestNeteaseSearch(runtime, query, 1000, '网易云音乐歌单搜索请求失败');
  const rawPlaylists = response.result?.playlists ?? [];
  const playlists = rawPlaylists
    .map(mapNeteaseSearchPlaylist)
    .filter((playlist): playlist is DiscoveredPlaylist => Boolean(playlist));
  if (rawPlaylists.length > 0 && playlists.length === 0) {
    throw new Error('网易云音乐歌单搜索数据无效');
  }
  return createSearchEntitySection(true, playlists, getNeteaseSearchTotal(response.result?.playlistCount), query);
}

async function requestNeteaseSearch(
  runtime: NeteaseRuntime,
  query: NormalizedSearchEntityQuery,
  searchType: number,
  errorMessage: string
): Promise<NeteaseSearchResponse> {
  const response = await runtime.requestJson<NeteaseSearchResponse>({
    partition: NETEASE_LOGIN_PARTITION,
    url: createSearchUrl(query.keyword, query.limit, query.offset, searchType)
  });
  assertNeteaseSearchSuccess(response, errorMessage);
  return response;
}

function mapNeteaseArtistSummary(artist: NeteaseArtist): ArtistSummary | null {
  const reference = mapNeteaseArtistReference(artist);
  if (!reference) {
    return null;
  }

  const aliases = (artist.alias ?? []).map((alias) => alias.trim()).filter(Boolean);
  const songCount = normalizeNonNegativeNumber(artist.musicSize);
  const albumCount = normalizeNonNegativeNumber(artist.albumSize);
  const imageUrl = getNeteaseArtistImageUrl([artist]);
  return {
    ...reference,
    coverTone: NETEASE_COVER_TONE,
    ...(imageUrl ? { imageUrl } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(songCount !== undefined ? { songCount } : {}),
    ...(albumCount !== undefined ? { albumCount } : {}),
    sourceLabel: NETEASE_SOURCE_LABEL
  };
}

function mapNeteaseSearchPlaylist(playlist: NeteaseSearchPlaylist): DiscoveredPlaylist | null {
  const platformPlaylistId = firstText(playlist.id);
  const title = firstText(playlist.name);
  if (!platformPlaylistId || !title) {
    return null;
  }

  const creatorName = firstText(playlist.creator?.nickname, playlist.creator?.name);
  const playCount = normalizeNonNegativeNumber(playlist.playCount ?? playlist.playcount);
  const trackCount = normalizeNonNegativeNumber(playlist.trackCount ?? playlist.trackcount);
  const coverUrl = normalizeImageUrl(firstText(playlist.coverImgUrl, playlist.picUrl));
  return {
    id: createProviderScopedId(platformPlaylistId),
    providerId: 'netease',
    platformPlaylistId,
    title,
    description: firstText(playlist.copywriter, playlist.description),
    songIds: [],
    coverTone: NETEASE_COVER_TONE,
    ...(coverUrl ? { coverUrl } : {}),
    ...(creatorName ? { creatorName } : {}),
    ...(playCount !== undefined ? { playCount } : {}),
    ...(trackCount !== undefined ? { trackCount } : {}),
    sourceLabel: NETEASE_SOURCE_LABEL
  };
}

async function resolveNeteaseSearchSection<T>(
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

function getNeteaseSearchTotal(value: unknown): number {
  return normalizeNonNegativeNumber(value) ?? 0;
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
    throw new Error('网易云音乐搜索提示参数无效');
  }
  return limit;
}

function assertNeteaseSearchSuccess(response: { code?: number }, errorMessage: string): void {
  if (response.code !== undefined && response.code !== 200) {
    throw new Error(errorMessage);
  }
}

function getNeteaseSearchSuggestions(response: NeteaseSearchSuggestResponse): SearchSuggestion[] {
  const result = response.result;
  const suggestionGroups = [
    (result?.songs ?? []).map((song) => mapNeteaseSongSuggestion(song)),
    (result?.artists ?? []).map((artist) => mapNeteaseArtistSuggestion(artist)),
    (result?.albums ?? []).map((album) => mapNeteaseAlbumSuggestion(album)),
    (result?.playlists ?? []).map((playlist) => mapNeteasePlaylistSuggestion(playlist))
  ].map((group) => group.filter((suggestion): suggestion is SearchSuggestion => Boolean(suggestion)));
  return uniqueSearchSuggestions(interleaveSearchSuggestionGroups(suggestionGroups));
}

function mapNeteaseSongSuggestion(song: NeteaseTrack): SearchSuggestion | null {
  const title = firstText(song.name);
  if (!title) {
    return null;
  }
  const artists = song.artists ?? song.ar ?? [];
  return {
    id: `netease:suggestion:song:${firstText(song.id) || encodeURIComponent(title)}`,
    providerId: 'netease',
    keyword: title,
    title,
    kind: 'song',
    ...(artists.map((artist) => firstText(artist.name)).filter(Boolean).join(' / ') ? {
      subtitle: artists.map((artist) => firstText(artist.name)).filter(Boolean).join(' / ')
    } : {}),
    ...(getNeteaseAlbumCoverUrl(song, song.album ?? song.al) ? {
      coverUrl: getNeteaseAlbumCoverUrl(song, song.album ?? song.al)
    } : {})
  };
}

function mapNeteaseArtistSuggestion(artist: NeteaseArtist): SearchSuggestion | null {
  const summary = mapNeteaseArtistSummary(artist);
  if (!summary) {
    return null;
  }
  return {
    id: `netease:suggestion:artist:${summary.platformArtistId}`,
    providerId: 'netease',
    keyword: summary.name,
    title: summary.name,
    kind: 'artist',
    ...(summary.aliases?.length ? { subtitle: summary.aliases.join(' / ') } : {}),
    ...(summary.imageUrl ? { coverUrl: summary.imageUrl } : {})
  };
}

function mapNeteaseAlbumSuggestion(album: NeteaseAlbum): SearchSuggestion | null {
  const summary = mapNeteaseAlbumSummary(album);
  if (!summary) {
    return null;
  }
  return {
    id: `netease:suggestion:album:${summary.platformAlbumId}`,
    providerId: 'netease',
    keyword: summary.title,
    title: summary.title,
    kind: 'album',
    ...(summary.artistName ? { subtitle: summary.artistName } : {}),
    ...(summary.coverUrl ? { coverUrl: summary.coverUrl } : {})
  };
}

function mapNeteasePlaylistSuggestion(playlist: NeteaseSearchPlaylist): SearchSuggestion | null {
  const summary = mapNeteaseSearchPlaylist(playlist);
  if (!summary) {
    return null;
  }
  return {
    id: `netease:suggestion:playlist:${summary.platformPlaylistId}`,
    providerId: 'netease',
    keyword: summary.title,
    title: summary.title,
    kind: 'playlist',
    ...(summary.creatorName ? { subtitle: summary.creatorName } : {}),
    ...(summary.coverUrl ? { coverUrl: summary.coverUrl } : {})
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

function getNeteaseHotSearches(response: NeteaseHotSearchResponse): SearchHotSearch[] {
  const hotSearches: SearchHotSearch[] = [];
  (response.data ?? []).forEach((item, index) => {
    const keyword = firstText(item.searchWord, item.content);
    if (!keyword) {
      return;
    }

    const title = firstText(item.content, item.searchWord) || keyword;
    const score = normalizeNonNegativeNumber(item.score);
    const iconUrl = normalizeImageUrl(firstText(item.iconUrl));
    hotSearches.push({
      id: `netease:hot:${encodeURIComponent(keyword)}`,
      providerId: 'netease',
      keyword,
      title,
      rank: index + 1,
      ...(score !== undefined ? { score } : {}),
      ...(iconUrl ? { iconUrl } : {})
    });
  });
  return uniqueHotSearches(hotSearches);
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
  runtime: NeteaseRuntime,
  cache: CacheStore,
  options: ProviderFetchOptions
): Promise<RecommendationHomeFeed> {
  if (options.forceRefresh) {
    cache.delete(CACHE_KEYS.loginStatus('netease'));
  }

  const loggedIn = (await getLoginStatus(runtime, cache)).loggedIn;
  const cacheKey = CACHE_KEYS.recommendationHome('netease', loggedIn);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.recommendationHome, async () => {
    const moduleRequests = [getPersonalizedNewSongs(runtime)];
    if (loggedIn) {
      moduleRequests.push(getDailyRecommendedSongs(runtime));
    }

    const [newSongsResult, dailySongsResult] = await Promise.allSettled(moduleRequests);
    if (newSongsResult.status === 'rejected' && (!dailySongsResult || dailySongsResult.status === 'rejected')) {
      throw new Error('网易云推荐歌曲请求全部失败');
    }

    return {
      providerId: 'netease',
      loggedIn,
      dailySongs: dailySongsResult?.status === 'fulfilled' ? dailySongsResult.value : [],
      newSongs: newSongsResult.status === 'fulfilled' ? newSongsResult.value : [],
      moduleResults: {
        daily: !dailySongsResult
          ? { status: 'skipped', errorMessage: null }
          : dailySongsResult.status === 'fulfilled'
            ? { status: 'fulfilled', errorMessage: null }
            : { status: 'rejected', errorMessage: '网易云每日推荐加载失败' },
        new: newSongsResult.status === 'fulfilled'
          ? { status: 'fulfilled', errorMessage: null }
          : { status: 'rejected', errorMessage: '网易云最新音乐加载失败' }
      }
    };
  });
}

async function getPersonalizedNewSongs(runtime: NeteaseRuntime): Promise<Song[]> {
  const response = await runtime.requestJson<NeteasePersonalizedNewSongsResponse>({
    partition: NETEASE_LOGIN_PARTITION,
    url: NETEASE_PERSONALIZED_NEW_SONGS_URL,
    method: 'POST',
    form: { limit: '12' }
  });
  assertNeteaseRecommendationResponse(response, '网易云推荐新歌请求失败');

  return (response.result ?? response.data ?? []).map((item) =>
    mapTrack(item.song ?? item, '', '', NETEASE_RECOMMENDATION_CONTEXT)
  );
}

async function getNewAlbums(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  options: ProviderFetchOptions
): Promise<AlbumSummary[]> {
  const cacheKey = CACHE_KEYS.releaseCatalog('netease');
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.releaseCatalog, async () => {
    const response = await runtime.requestJson<NeteaseNewAlbumsResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_NEW_ALBUMS_URL,
      method: 'POST',
      form: { area: 'ALL', offset: '0', limit: '12', total: 'true' },
      crypto: 'weapi',
      credentials: 'omit'
    });
    if (response.code !== 200 || !Array.isArray(response.albums)) {
      throw new Error('网易云新碟速递请求失败');
    }

    const albums = uniqueNeteaseAlbums(response.albums
      .map(mapNeteaseAlbumSummary)
      .filter((album): album is AlbumSummary => Boolean(album)));
    if (response.albums.length > 0 && albums.length === 0) {
      throw new Error('网易云新碟速递数据无效');
    }
    return albums.slice(0, 12);
  });
}

function uniqueNeteaseAlbums(albums: readonly AlbumSummary[]): AlbumSummary[] {
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

async function getDailyRecommendedSongs(runtime: NeteaseRuntime): Promise<Song[]> {
  const response = await runtime.requestJson<NeteaseDailyRecommendedSongsResponse>({
    partition: NETEASE_LOGIN_PARTITION,
    url: NETEASE_DAILY_RECOMMENDED_SONGS_URL,
    method: 'POST',
    form: {}
  });
  assertNeteaseRecommendationResponse(response, '网易云每日推荐歌曲请求失败');

  return (
    response.data?.dailySongs
    ?? response.data?.recommend
    ?? response.recommend
    ?? []
  ).map((track) => mapTrack(track, '', '', NETEASE_RECOMMENDATION_CONTEXT));
}

async function getRecommendationHistoryDates(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  options: ProviderFetchOptions
): Promise<string[]> {
  const cacheKey = CACHE_KEYS.recommendationHistoryDates('netease');
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.recommendationHistory, async () => {
    const response = await runtime.requestJson<NeteaseRecommendationHistoryResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_RECOMMENDATION_HISTORY_DATES_URL,
      method: 'POST',
      form: {},
      crypto: 'weapi'
    });
    if (response.code !== 200 || !Array.isArray(response.data?.dates)) {
      throw new Error('网易云历史日推日期请求失败');
    }

    const dates = [...new Set(response.data.dates.filter(isRecommendationHistoryDate))]
      .sort((left, right) => right.localeCompare(left));
    if (response.data.dates.length > 0 && dates.length === 0) {
      throw new Error('网易云历史日推日期数据无效');
    }
    return dates;
  });
}

async function getRecommendationHistory(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  date: string,
  options: ProviderFetchOptions
): Promise<RecommendationHistoryPage> {
  if (!isRecommendationHistoryDate(date)) {
    throw new Error('网易云历史日推日期无效');
  }

  const cacheKey = CACHE_KEYS.recommendationHistory('netease', date);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.recommendationHistory, async () => {
    const response = await runtime.requestJson<NeteaseRecommendationHistoryResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_RECOMMENDATION_HISTORY_DETAIL_URL,
      method: 'POST',
      form: { date },
      crypto: 'weapi'
    });
    if (response.code !== 200 || !Array.isArray(response.data?.songs)) {
      throw new Error('网易云历史日推歌曲请求失败');
    }

    const songs = uniqueNeteaseSongs(response.data.songs
      .filter(isVerifiedRecommendationHistoryTrack)
      .map((track) => mapTrack(track, '', '', NETEASE_RECOMMENDATION_HISTORY_CONTEXT)));
    if (response.data.songs.length > 0 && songs.length === 0) {
      throw new Error('网易云历史日推歌曲数据无效');
    }

    return {
      providerId: 'netease',
      date,
      songs: songs.slice(0, 12)
    };
  });
}

function isRecommendationHistoryDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function isVerifiedRecommendationHistoryTrack(value: unknown): value is NeteaseTrack {
  if (!isObjectRecord(value)) {
    return false;
  }

  return typeof value.id === 'number'
    && Number.isFinite(value.id)
    && value.id > 0
    && typeof value.name === 'string'
    && Boolean(value.name.trim())
    && typeof value.dt === 'number'
    && Number.isFinite(value.dt)
    && value.dt >= 0
    && Array.isArray(value.ar)
    && value.ar.length > 0
    && value.ar.every((artist) => (
      isObjectRecord(artist)
      && typeof artist.id === 'number'
      && Number.isFinite(artist.id)
      && artist.id > 0
      && typeof artist.name === 'string'
      && Boolean(artist.name.trim())
    ))
    && isObjectRecord(value.al)
    && typeof value.al.id === 'number'
    && Number.isFinite(value.al.id)
    && value.al.id > 0
    && typeof value.al.name === 'string'
    && Boolean(value.al.name.trim())
    && typeof value.al.picUrl === 'string'
    && Boolean(value.al.picUrl.trim());
}

function uniqueNeteaseSongs(songs: readonly Song[]): Song[] {
  const selected: Song[] = [];
  const seen = new Set<string>();
  for (const song of songs) {
    const identity = `${song.providerId}:${song.platformSongId ?? song.id}`;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    selected.push(song);
  }
  return selected;
}

async function getHomepageBlocks(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  options: ProviderFetchOptions
): Promise<HomepageBlockFeed> {
  const cacheKey = CACHE_KEYS.homepageBlocks('netease');
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.homepageBlocks, async () => {
    const response = await runtime.requestJson<NeteaseHomepageBlocksResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_HOMEPAGE_BLOCKS_URL,
      method: 'POST',
      form: { refresh: 'false' },
      crypto: 'weapi',
      credentials: 'omit'
    });
    if (response.code !== 200 || !Array.isArray(response.data?.blocks)) {
      throw new Error('网易云首页 block 响应结构异常');
    }

    const songs = mapHomepageBlockSongs(response.data.blocks);
    return {
      providerId: 'netease',
      blocks: songs.length > 0
        ? [{
            kind: 'song',
            id: 'netease:homepage-block:songs',
            title: '多元旋律之旅',
            songs
          }]
        : []
    };
  });
}

function mapHomepageBlockSongs(blocks: readonly unknown[]): Song[] {
  const songs: Song[] = [];
  const seenSongIds = new Set<string>();

  for (const block of blocks) {
    if (!isObjectRecord(block) || !Array.isArray(block.creatives)) {
      continue;
    }

    for (const creative of block.creatives) {
      if (!isObjectRecord(creative) || !Array.isArray(creative.resources)) {
        continue;
      }

      for (const resource of creative.resources) {
        const track = getVerifiedHomepageSong(resource);
        if (!track) {
          continue;
        }

        const songId = String(track.id);
        if (seenSongIds.has(songId)) {
          continue;
        }

        seenSongIds.add(songId);
        songs.push(mapTrack(track, '', '', NETEASE_RECOMMENDATION_CONTEXT));
        if (songs.length === 12) {
          return songs;
        }
      }
    }
  }

  return songs;
}

function getVerifiedHomepageSong(value: unknown): NeteaseTrack | null {
  if (!isObjectRecord(value) || value.resourceType !== 'song' || !isObjectRecord(value.resourceExtInfo)) {
    return null;
  }

  const songData = value.resourceExtInfo.songData;
  return isVerifiedSimilarTrack(songData) ? songData : null;
}

async function getSimilarSongs(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  song: Song,
  options: ProviderFetchOptions
): Promise<Song[]> {
  const songId = getNeteaseSongId(song);
  const cacheKey = CACHE_KEYS.similarSongs('netease', songId);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.similarSongs, async () => {
    const response = await runtime.requestJson<NeteaseSimilarSongsResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_SIMILAR_SONGS_URL,
      method: 'POST',
      form: {
        songid: songId,
        limit: '50',
        offset: '0'
      },
      crypto: 'weapi',
      credentials: 'omit'
    });

    if (response.code !== 200) {
      throw new Error('网易云相似歌曲请求失败');
    }
    if (!Array.isArray(response.songs) || !response.songs.every(isVerifiedSimilarTrack)) {
      throw new Error('网易云相似歌曲响应结构异常');
    }

    return response.songs.map((track) => mapTrack(track, '', '', NETEASE_RECOMMENDATION_CONTEXT));
  });
}

function isVerifiedSimilarTrack(value: unknown): value is NeteaseTrack {
  if (!isObjectRecord(value)) {
    return false;
  }

  const artists = value.artists;
  const album = value.album;
  return typeof value.id === 'number'
    && Number.isFinite(value.id)
    && typeof value.name === 'string'
    && Boolean(value.name.trim())
    && typeof value.duration === 'number'
    && Number.isFinite(value.duration)
    && value.duration >= 0
    && Array.isArray(artists)
    && artists.length > 0
    && artists.every((artist) => (
      isObjectRecord(artist)
      && typeof artist.id === 'number'
      && Number.isFinite(artist.id)
      && typeof artist.name === 'string'
      && Boolean(artist.name.trim())
    ))
    && isObjectRecord(album)
    && typeof album.id === 'number'
    && Number.isFinite(album.id)
    && typeof album.name === 'string'
    && Boolean(album.name.trim())
    && typeof album.picUrl === 'string'
    && Boolean(album.picUrl.trim());
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const NETEASE_RECOMMENDATION_CONTEXT: SourceContext = {
  type: 'recommendation',
  providerId: 'netease'
};

const NETEASE_RECOMMENDATION_HISTORY_CONTEXT: SourceContext = {
  type: 'recommendation',
  providerId: 'netease',
  playlistTitle: '历史日推'
};

function assertNeteaseRecommendationResponse(response: { code?: number }, failureMessage: string): void {
  if (response.code !== 200) {
    throw new Error(failureMessage);
  }
}

async function getArtistDetail(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  artistId: string,
  options: ProviderFetchOptions
): Promise<ArtistDetail> {
  const platformArtistId = parseNeteaseEntityId(artistId, 'artist', '网易云歌手 ID 无效');
  const providerScopedArtistId = `netease:artist:${platformArtistId}`;
  const cacheKey = CACHE_KEYS.artistDetail('netease', providerScopedArtistId);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.artistDetail, async () => {
    const artistResponse = await runtime.requestJson<NeteaseArtistDetailResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: `${NETEASE_ARTIST_DETAIL_URL}/${platformArtistId}`
    });
    if (artistResponse.code !== 200) {
      throw new Error('网易云歌手详情请求失败');
    }

    const artist = artistResponse.artist;
    const name = firstText(artist?.name);
    if (!artist || !name || firstText(artist.id) !== platformArtistId) {
      throw new Error('网易云歌手详情数据无效');
    }

    const albumsResponse = await runtime.requestJson<NeteaseArtistAlbumsResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: `${NETEASE_ARTIST_ALBUMS_URL}/${platformArtistId}?offset=0&limit=50`
    });
    if (albumsResponse.code !== 200) {
      throw new Error('网易云歌手专辑请求失败');
    }

    const sourceContext: SourceContext = {
      type: 'artist',
      providerId: 'netease',
      artistId: providerScopedArtistId,
      artistName: name
    };
    const imageUrl = normalizeImageUrl(firstText(artist.picUrl, artist.img1v1Url));
    const aliases = [...new Set((artist.alias ?? []).map((alias) => firstText(alias)).filter(Boolean))];

    return {
      id: providerScopedArtistId,
      providerId: 'netease',
      platformArtistId,
      name,
      aliases,
      description: firstText(artist.briefDesc),
      coverTone: NETEASE_COVER_TONE,
      ...(imageUrl ? { imageUrl } : {}),
      sourceLabel: NETEASE_SOURCE_LABEL,
      ...(normalizeNonNegativeNumber(artist.musicSize) !== undefined
        ? { songCount: normalizeNonNegativeNumber(artist.musicSize) }
        : {}),
      ...(normalizeNonNegativeNumber(artist.albumSize) !== undefined
        ? { albumCount: normalizeNonNegativeNumber(artist.albumSize) }
        : {}),
      topSongs: (artistResponse.hotSongs ?? []).map((song) => mapTrack(song, '', '', sourceContext)),
      albums: (albumsResponse.hotAlbums ?? [])
        .map(mapNeteaseAlbumSummary)
        .filter((album): album is AlbumSummary => Boolean(album))
    };
  });
}

async function getAlbumDetail(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  albumId: string,
  options: ProviderFetchOptions
): Promise<AlbumDetail> {
  const platformAlbumId = parseNeteaseEntityId(albumId, 'album', '网易云专辑 ID 无效');
  const providerScopedAlbumId = `netease:album:${platformAlbumId}`;
  const cacheKey = CACHE_KEYS.albumDetail('netease', providerScopedAlbumId);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.albumDetail, async () => {
    const response = await runtime.requestJson<NeteaseAlbumDetailResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: `${NETEASE_ALBUM_DETAIL_URL}/${platformAlbumId}`
    });
    if (response.code !== 200) {
      throw new Error('网易云专辑详情请求失败');
    }

    const album = response.album;
    const title = firstText(album?.name);
    if (!album || !title || firstText(album.id) !== platformAlbumId) {
      throw new Error('网易云专辑详情数据无效');
    }

    const albumSummary = mapNeteaseAlbumSummary(album);
    if (!albumSummary) {
      throw new Error('网易云专辑详情数据无效');
    }

    const sourceContext: SourceContext = {
      type: 'album',
      providerId: 'netease',
      albumId: providerScopedAlbumId,
      albumTitle: title
    };
    const artists = (album.artists ?? (album.artist ? [album.artist] : []))
      .map(mapNeteaseArtistReference)
      .filter((artist): artist is ArtistReference => Boolean(artist));

    return {
      ...albumSummary,
      description: firstText(album.description, album.briefDesc),
      artists,
      tracks: (response.songs ?? []).map((song) => mapTrack(song, '', '', sourceContext))
    };
  });
}

function parseNeteaseEntityId(
  entityId: string,
  entityType: 'artist' | 'album',
  errorMessage: string
): string {
  const prefix = `netease:${entityType}:`;
  const platformEntityId = entityId.startsWith(prefix) ? entityId.slice(prefix.length) : '';
  if (!/^[1-9]\d*$/.test(platformEntityId)) {
    throw new Error(errorMessage);
  }

  return platformEntityId;
}

function mapNeteaseAlbumSummary(album: NeteaseAlbum): AlbumSummary | null {
  const platformAlbumId = firstText(album.id);
  const title = firstText(album.name);
  if (!platformAlbumId || !title) {
    return null;
  }

  const coverUrl = normalizeImageUrl(firstText(album.picUrl, album.blurPicUrl));
  const releaseDate = formatNeteaseReleaseDate(album.publishTime);
  const trackCount = normalizeNonNegativeNumber(album.size);
  const artistName = firstText(album.artist?.name)
    || (album.artists ?? []).map((artist) => firstText(artist.name)).filter(Boolean).join(' / ')
    || '未知歌手';

  return {
    id: `netease:album:${platformAlbumId}`,
    providerId: 'netease',
    platformAlbumId,
    title,
    artistName,
    coverTone: NETEASE_COVER_TONE,
    ...(coverUrl ? { coverUrl } : {}),
    ...(releaseDate ? { releaseDate } : {}),
    ...(trackCount !== undefined ? { trackCount } : {}),
    ...(firstText(album.type) ? { albumType: firstText(album.type) } : {}),
    sourceLabel: NETEASE_SOURCE_LABEL
  };
}

function formatNeteaseReleaseDate(value: unknown): string | undefined {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString().slice(0, 10)
    : undefined;
}

async function getPlaylistCategories(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  options: ProviderFetchOptions
): Promise<PlaylistCategory[]> {
  const cacheKey = CACHE_KEYS.playlistCategories('netease');
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.playlistCategories, async () => {
    const response = await runtime.requestJson<NeteasePlaylistCategoriesResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_PLAYLIST_CATEGORIES_URL
    });
    if (response.code !== 200) {
      throw new Error('网易云歌单分类请求失败');
    }

    const allName = firstText(response.all?.name) || '全部';
    const seenCategoryIds = new Set<string>(['all']);
    const categories: PlaylistCategory[] = [{ id: 'all', providerId: 'netease', name: allName }];

    for (const category of response.sub ?? []) {
      const name = firstText(category.name);
      if (!name || name === allName || seenCategoryIds.has(name)) {
        continue;
      }

      seenCategoryIds.add(name);
      const group = firstText(response.categories?.[String(category.category)]);
      categories.push({
        id: name,
        providerId: 'netease',
        name,
        ...(group ? { group } : {}),
        hot: Boolean(category.hot)
      });
    }

    return categories;
  });
}

async function getDiscoveredPlaylists(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  query: PlaylistDiscoveryQuery,
  options: ProviderFetchOptions
): Promise<PlaylistDiscoveryPage> {
  const normalizedQuery = normalizePlaylistDiscoveryQuery(query, '网易云歌单发现参数无效');
  const cacheKey = CACHE_KEYS.playlistDiscoveryPage(
    'netease',
    normalizedQuery.categoryId,
    normalizedQuery.limit,
    normalizedQuery.offset
  );
  if (options.forceRefresh) {
    cache.deleteByPrefix(CACHE_KEYS.playlistDiscoveryPagePrefix('netease', normalizedQuery.categoryId));
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.playlistDiscoveryPage, async () => {
    const response = await runtime.requestJson<NeteasePlaylistDiscoveryResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: createPlaylistDiscoveryUrl(normalizedQuery)
    });
    if (response.code !== 200) {
      throw new Error('网易云歌单列表请求失败');
    }

    const playlists = (response.playlists ?? [])
      .map(mapDiscoveredPlaylist)
      .filter((playlist): playlist is DiscoveredPlaylist => Boolean(playlist));
    const total = normalizeNonNegativeNumber(response.total) ?? normalizedQuery.offset + playlists.length;

    return {
      providerId: 'netease',
      categoryId: normalizedQuery.categoryId,
      playlists,
      offset: normalizedQuery.offset,
      limit: normalizedQuery.limit,
      total,
      hasMore: typeof response.more === 'boolean'
        ? response.more
        : normalizedQuery.offset + playlists.length < total
    };
  });
}

function mapDiscoveredPlaylist(playlist: NeteaseDiscoveredPlaylistItem): DiscoveredPlaylist | null {
  const platformPlaylistId = firstText(playlist.id);
  const title = firstText(playlist.name);
  if (!platformPlaylistId || !title) {
    return null;
  }

  const creatorName = firstText(playlist.creator?.nickname);
  const playCount = normalizeNonNegativeNumber(playlist.playCount ?? playlist.playcount);
  const trackCount = normalizeNonNegativeNumber(playlist.trackCount ?? playlist.trackcount);
  const coverUrl = normalizeNeteaseDiscoveryCoverUrl(firstText(playlist.coverImgUrl, playlist.picUrl));

  return {
    id: createProviderScopedId(platformPlaylistId),
    providerId: 'netease',
    platformPlaylistId,
    title,
    description: firstText(playlist.copywriter, playlist.description),
    songIds: [],
    coverTone: NETEASE_COVER_TONE,
    ...(coverUrl ? { coverUrl } : {}),
    sourceLabel: NETEASE_SOURCE_LABEL,
    ...(creatorName ? { creatorName } : {}),
    ...(playCount !== undefined ? { playCount } : {}),
    ...(trackCount !== undefined ? { trackCount } : {})
  };
}

async function getCharts(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  options: ProviderFetchOptions
): Promise<ChartSummary[]> {
  const cacheKey = CACHE_KEYS.chartList('netease');
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.chartList, async () => {
    const response = await runtime.requestJson<NeteaseToplistResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: NETEASE_TOPLIST_URL
    });

    return (response.list ?? [])
      .map(mapChartSummary)
      .filter((chart): chart is ChartSummary => Boolean(chart));
  });
}

function mapChartSummary(chart: NeteaseToplistItem): ChartSummary | null {
  const platformChartId = firstText(chart.id);
  const title = firstText(chart.name);
  if (!platformChartId || !title) {
    return null;
  }

  const updateTime = Number(chart.updateTime);
  return {
    id: `netease:chart:${platformChartId}`,
    providerId: 'netease',
    platformChartId,
    title,
    description: firstText(chart.description),
    songIds: [],
    coverTone: NETEASE_COVER_TONE,
    coverUrl: normalizeImageUrl(firstText(chart.coverImgUrl)) || undefined,
    sourceLabel: NETEASE_SOURCE_LABEL,
    updatedAt: Number.isFinite(updateTime) && updateTime > 0 ? new Date(updateTime).toISOString() : undefined,
    updateLabel: firstText(chart.updateFrequency) || undefined
  };
}

async function getChartTracks(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  chartId: string,
  options: ProviderFetchOptions
): Promise<Song[]> {
  const platformChartId = parseChartId(chartId, 'netease');
  const cacheKey = CACHE_KEYS.chartTracks('netease', chartId);
  if (options.forceRefresh) {
    cache.delete(cacheKey);
  }

  return cache.getOrSet(cacheKey, CACHE_TTL_MS.chartTracks, async () => {
    const response = await runtime.requestJson<NeteasePlaylistDetailResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: createPlaylistDetailUrl(platformChartId)
    });
    const playlist = response.playlist;
    const playlistTitle = playlist?.name ?? '网易云排行榜';

    return (playlist?.tracks ?? []).map((track) => mapTrack(track, chartId, playlistTitle));
  });
}

function parseChartId(chartId: string, providerId: 'netease'): string {
  const prefix = `${providerId}:chart:`;
  if (!chartId.startsWith(prefix)) {
    throw new Error('网易云排行榜 ID 无效');
  }

  const platformChartId = chartId.slice(prefix.length).trim();
  if (!platformChartId) {
    throw new Error('网易云排行榜 ID 无效');
  }

  return platformChartId;
}

async function getLoginStatus(runtime: NeteaseRuntime, cache: CacheStore): Promise<LoginStatus> {
  return cache.getOrSet(CACHE_KEYS.loginStatus('netease'), CACHE_TTL_MS.loginStatus, async () => {
    const profile = await getAccountProfile(runtime);
    if (!profile) {
      return {
        providerId: 'netease',
        loggedIn: false,
        playbackReady: false,
        stale: false,
        message: '网易云音乐未登录'
      };
    }

    return {
      providerId: 'netease',
      loggedIn: true,
      userId: String(profile.userId),
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      vipLabel: profile.vipType && profile.vipType > 0 ? 'VIP' : undefined,
      playbackReady: true,
      stale: false,
      message: '网易云音乐已登录'
    };
  });
}

async function getAccountProfile(runtime: NeteaseRuntime): Promise<NeteaseProfile | null> {
  if (!(await hasNeteaseAuthCookie(runtime))) {
    return null;
  }

  const account = await runtime.requestJson<NeteaseAccountResponse>({
    partition: NETEASE_LOGIN_PARTITION,
    url: NETEASE_ACCOUNT_URL
  });

  return account.profile ?? null;
}

async function getSongUrl(runtime: NeteaseRuntime, cache: CacheStore, song: Song, quality: Quality): Promise<SongUrlResult> {
  const platformSongId = song.platformSongId ?? parseProviderScopedId(song.id);
  const failureCacheKey = CACHE_KEYS.playbackFailure('netease', platformSongId, quality);
  const cachedFailure = cache.get<SongUrlResult>(failureCacheKey);
  if (cachedFailure) {
    return cachedFailure;
  }

  if (!(await hasNeteaseAuthCookie(runtime))) {
    const result: SongUrlResult = {
      ok: false,
      providerId: 'netease',
      quality,
      reason: {
        category: 'login_required',
        message: '请先登录网易云音乐后再播放',
        action: 'login'
      }
    };
    cache.set(failureCacheKey, result, CACHE_TTL_MS.playbackFailure);
    return result;
  }

  const response = await runtime.requestJson<NeteaseSongUrlResponse>({
    partition: NETEASE_LOGIN_PARTITION,
    url: createSongUrlUrl(platformSongId, quality)
  });
  const topLevelRestriction = mapNeteaseTopLevelPlaybackRestriction(response);
  if (topLevelRestriction) {
    const result: SongUrlResult = {
      ok: false,
      providerId: 'netease',
      quality,
      reason: topLevelRestriction
    };
    if (topLevelRestriction.category !== 'provider_risk') {
      cache.set(failureCacheKey, result, CACHE_TTL_MS.playbackFailure);
    }
    return result;
  }

  const item = response.data?.[0];
  const url = typeof item?.url === 'string' ? item.url.trim() : '';

  if (url) {
    const successResult: SongUrlResult = {
      ok: true,
      providerId: 'netease',
      quality,
      url
    };
    cache.delete(failureCacheKey);
    return successResult;
  }

  const result: SongUrlResult = {
    ok: false,
    providerId: 'netease',
    quality,
    reason: mapSongUrlRestriction(item)
  };
  cache.set(failureCacheKey, result, CACHE_TTL_MS.playbackFailure);
  return result;
}

async function getLyrics(runtime: NeteaseRuntime, cache: CacheStore, song: Song): Promise<LyricsResult> {
  const platformSongId = song.platformSongId ?? parseProviderScopedId(song.id);
  return cache.getOrSet(CACHE_KEYS.lyrics('netease', platformSongId), CACHE_TTL_MS.lyrics, async () => {
    const response = await runtime.requestJson<NeteaseLyricsResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: createLyricsUrl(platformSongId)
    });
    const lrc = response.lrc?.lyric?.trim() ?? '';
    const tlyric = response.tlyric?.lyric?.trim() ?? '';

    if (lrc) {
      return {
        ok: true,
        providerId: 'netease',
        lrc,
        ...(tlyric ? { tlyric } : {})
      };
    }

    return {
      ok: false,
      providerId: 'netease',
      reason: {
        category: 'url_unavailable',
        message: '当前歌曲暂无歌词',
        action: 'none'
      }
    };
  });
}

async function setSongLiked(runtime: NeteaseRuntime, cache: CacheStore, song: Song, liked: boolean): Promise<SongMutationResult> {
  const songId = getNeteaseSongId(song);
  const csrfToken = await getNeteaseCsrfToken(runtime);
  const response = await runtime.requestJson<NeteaseMutationResponse>({
    partition: NETEASE_LOGIN_PARTITION,
    method: 'POST',
    url: NETEASE_LIKE_URL,
    form: {
      alg: 'itembased',
      trackId: songId,
      like: liked,
      time: '3',
      csrf_token: csrfToken
    },
    crypto: 'weapi'
  });

  if (isNeteaseMutationRiskRejected(response)) {
    const likedPlaylistId = await getNeteaseLikedPlaylistId(runtime);
    await mutatePlaylistTracks(
      runtime,
      cache,
      song,
      createProviderScopedId(likedPlaylistId),
      liked ? 'add' : 'del'
    );
    return { providerId: 'netease', operation: liked ? 'like' : 'unlike' };
  }

  assertNeteaseMutationSucceeded(response, liked ? '收藏歌曲' : '取消收藏');
  cache.deleteByPrefix(CACHE_KEYS.providerPrefix('netease'));
  return { providerId: 'netease', operation: liked ? 'like' : 'unlike' };
}

async function getNeteaseLikedPlaylistId(runtime: NeteaseRuntime): Promise<string> {
  const profile = await getAccountProfile(runtime);
  if (!profile) {
    throw new Error('网易云音乐未登录');
  }

  const response = await runtime.requestJson<NeteasePlaylistListResponse>({
    partition: NETEASE_LOGIN_PARTITION,
    url: createUserPlaylistUrl(profile.userId)
  });
  const likedPlaylist = response.playlist?.find((playlist) => (
    isOfficialOwnedLikedPlaylist(playlist, profile.userId)
  ));
  if (response.code !== 200 || !likedPlaylist) {
    throw new Error('无法找到网易云音乐在线“我喜欢”歌单');
  }

  return String(likedPlaylist.id);
}

async function mutatePlaylistTracks(
  runtime: NeteaseRuntime,
  cache: CacheStore,
  song: Song,
  playlistId: string,
  operation: 'add' | 'del'
): Promise<SongMutationResult> {
  const songId = getNeteaseSongId(song);
  const platformPlaylistId = parseNeteasePlaylistId(playlistId);
  const csrfToken = await getNeteaseCsrfToken(runtime);
  const response = await runtime.requestJson<NeteaseMutationResponse>({
    partition: NETEASE_LOGIN_PARTITION,
    method: 'POST',
    url: NETEASE_PLAYLIST_TRACKS_URL,
    form: {
      op: operation,
      pid: platformPlaylistId,
      trackIds: JSON.stringify([songId]),
      imme: 'true',
      csrf_token: csrfToken
    },
    crypto: 'weapi'
  });

  assertNeteaseMutationSucceeded(response, operation === 'add' ? '添加歌曲到歌单' : '从歌单移除歌曲');
  cache.deleteByPrefix(CACHE_KEYS.providerPrefix('netease'));
  return { providerId: 'netease', operation: operation === 'add' ? 'add_to_playlist' : 'remove_from_playlist' };
}

async function getNeteaseCsrfToken(runtime: NeteaseRuntime): Promise<string> {
  const cookies = await runtime.getCookies(NETEASE_LOGIN_PARTITION);
  const hasMusicUserCookie = cookies.some((cookie) => cookie.name === 'MUSIC_U' && cookie.value.trim().length > 0);
  const csrfToken = cookies.find((cookie) => cookie.name === '__csrf')?.value.trim() ?? '';
  if (!hasMusicUserCookie || !csrfToken) {
    throw new Error('网易云音乐登录已失效，请重新登录');
  }

  return csrfToken;
}

function getNeteaseSongId(song: Song): string {
  if (song.providerId !== 'netease') {
    throw new Error('网易云音乐歌曲 ID 无效');
  }

  const songId = (song.platformSongId ?? parseProviderScopedId(song.id)).trim();
  if (!/^[1-9]\d{0,19}$/.test(songId)) {
    throw new Error('网易云音乐歌曲 ID 无效');
  }

  return songId;
}

function parseNeteasePlaylistId(playlistId: string): string {
  if (!playlistId.startsWith('netease:')) {
    throw new Error('网易云音乐歌单 ID 无效');
  }

  const platformPlaylistId = parseProviderScopedId(playlistId).trim();
  if (!/^[1-9]\d{0,19}$/.test(platformPlaylistId)) {
    throw new Error('网易云音乐歌单 ID 无效');
  }

  return platformPlaylistId;
}

function assertNeteaseMutationSucceeded(response: NeteaseMutationResponse, action: string): void {
  if (response.code === 200) {
    return;
  }

  throw new Error(response.message?.trim() || `${action}失败`);
}

function isNeteaseMutationRiskRejected(response: NeteaseMutationResponse): boolean {
  const message = response.message?.trim() ?? '';
  return response.code === -460 || message.includes('网络环境') && message.includes('风险');
}

async function hasNeteaseAuthCookie(runtime: NeteaseRuntime): Promise<boolean> {
  const cookies = await runtime.getCookies(NETEASE_LOGIN_PARTITION);
  return cookies.some((cookie) => cookie.name === 'MUSIC_U' && cookie.value.trim().length > 0);
}

function createElectronNeteaseRuntime(): NeteaseRuntime {
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
      loginWindow.webContents.setWindowOpenHandler(({ url: externalUrl }) => {
        void electron.shell.openExternal(externalUrl);
        return { action: 'deny' };
      });
      loginWindow.once('ready-to-show', () => {
        showMaximizedLoginWindow(loginWindow);
      });

      loginWindow.maximize();

      await loginWindow.loadURL(url);
      showMaximizedLoginWindow(loginWindow);
      await windowClosed;
    },

    async getCookies(partition) {
      const electron = require('electron') as typeof import('electron');
      const loginSession = electron.session.fromPartition(partition);

      return loginSession.cookies.get({ url: NETEASE_LOGIN_URL });
    },

    async requestJson({ partition, url, method = 'GET', form, crypto, credentials = 'include' }) {
      const electron = require('electron') as typeof import('electron');
      const loginSession = electron.session.fromPartition(partition);
      const weapiRequest = crypto === 'weapi'
        ? createNeteaseWeapiRequest(url, form ?? {})
        : null;
      const requestUrl = weapiRequest?.url ?? url;
      const requestForm = weapiRequest?.form ?? form;
      const body = requestForm ? createUrlEncodedBody(requestForm) : undefined;
      return requestNeteaseJson(requestUrl, {
        method,
        ...(body ? { body } : {}),
        headers: {
          Referer: NETEASE_LOGIN_URL,
          ...(crypto === 'weapi' ? { 'User-Agent': NETEASE_WEAPI_USER_AGENT } : {}),
          ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } : {})
        }
      }, (fetchUrl, init) => loginSession.fetch(fetchUrl, { ...init, credentials }));
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

function createUrlEncodedBody(form: Record<string, string | number | boolean>): string {
  const searchParams = new URLSearchParams();
  Object.entries(form).forEach(([name, value]) => searchParams.set(name, String(value)));
  return searchParams.toString();
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

async function requestNeteaseJson<T>(
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
      throw createProviderRequestError('网易云音乐', response.status);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (isMappedProviderError(error)) {
      throw error;
    }

    if (isAbortError(error)) {
      throw createProviderTimeoutError('网易云音乐');
    }

    throw createProviderRequestError('网易云音乐');
  } finally {
    clearTimeout(timeoutId);
  }
}

function isMappedProviderError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'ProviderRequestError' || error.name === 'ProviderTimeoutError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function createLoginWindowOptions(partition: string, workAreaSize = { width: 480, height: 680 }): BrowserWindowConstructorOptions {
  return {
    width: Math.max(480, Math.floor(workAreaSize.width)),
    height: Math.max(680, Math.floor(workAreaSize.height)),
    minWidth: 420,
    minHeight: 560,
    title: '网易云音乐登录',
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

function createUserPlaylistUrl(userId: number): string {
  return `https://music.163.com/api/user/playlist/?uid=${encodeURIComponent(String(userId))}&limit=1000&offset=0`;
}

function createPlaylistDetailUrl(playlistId: string): string {
  return `https://music.163.com/api/v6/playlist/detail?id=${encodeURIComponent(playlistId)}&n=1000`;
}

function createPlaylistDiscoveryUrl(query: Required<PlaylistDiscoveryQuery>): string {
  const url = new URL(NETEASE_PLAYLIST_DISCOVERY_URL);
  url.searchParams.set('cat', query.categoryId === 'all' ? '全部' : query.categoryId);
  url.searchParams.set('order', 'hot');
  url.searchParams.set('limit', String(query.limit));
  url.searchParams.set('offset', String(query.offset));
  return url.toString();
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

function createSearchUrl(keyword: string, limit: number, offset: number, searchType = 1): string {
  const url = new URL(NETEASE_SEARCH_URL);
  url.searchParams.set('type', String(searchType));
  url.searchParams.set('s', keyword);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  return url.toString();
}

function createSearchSuggestionUrl(keyword: string): string {
  const url = new URL(NETEASE_SEARCH_SUGGEST_URL);
  url.searchParams.set('s', keyword);
  return url.toString();
}

function createArtistSearchUrl(keyword: string): string {
  const url = new URL(NETEASE_SEARCH_URL);
  url.searchParams.set('type', '100');
  url.searchParams.set('s', keyword);
  url.searchParams.set('limit', '10');
  url.searchParams.set('offset', '0');
  return url.toString();
}

function createSongDetailUrl(songIds: string[]): string {
  const url = new URL(NETEASE_SONG_DETAIL_URL);
  url.searchParams.set('ids', `[${songIds.join(',')}]`);
  return url.toString();
}

async function completeNeteasePlaylistTracks(
  runtime: NeteaseRuntime,
  playlist: NeteasePlaylistDetail
): Promise<NeteaseTrack[]> {
  const existingTracks = playlist.tracks ?? [];
  const orderedTrackIds = (playlist.trackIds ?? [])
    .map((track) => firstText(track.id))
    .filter(Boolean);
  if (orderedTrackIds.length === 0) {
    return existingTracks;
  }

  const trackById = new Map<string, NeteaseTrack>();
  for (const track of existingTracks) {
    trackById.set(String(track.id), track);
  }

  const missingTrackIds = [...new Set(orderedTrackIds.filter((trackId) => !trackById.has(trackId)))];
  for (let index = 0; index < missingTrackIds.length; index += NETEASE_SONG_DETAIL_BATCH_SIZE) {
    const batch = missingTrackIds.slice(index, index + NETEASE_SONG_DETAIL_BATCH_SIZE);
    const response = await runtime.requestJson<NeteaseSongDetailResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: createSongDetailUrl(batch)
    });
    if (response.code !== 200) {
      throw new Error('网易云歌曲详情请求失败');
    }

    for (const track of response.songs ?? []) {
      const trackId = String(track.id);
      if (batch.includes(trackId)) {
        trackById.set(trackId, track);
      }
    }
  }

  const orderedTrackIdSet = new Set(orderedTrackIds);
  const orderedTracks = orderedTrackIds.flatMap((trackId) => {
    const track = trackById.get(trackId);
    return track ? [track] : [];
  });
  const unreferencedTracks = existingTracks.filter((track) => !orderedTrackIdSet.has(String(track.id)));
  return [...orderedTracks, ...unreferencedTracks];
}

function createSongUrlUrl(songId: string, quality: Quality): string {
  const encodedSongId = encodeURIComponent(songId);
  const encodedIds = encodeURIComponent(`[${songId}]`);
  return `${NETEASE_SONG_URL_BASE_URL}?id=${encodedSongId}&ids=${encodedIds}&br=${getNeteaseBitrate(quality)}`;
}

function createLyricsUrl(songId: string): string {
  const url = new URL(NETEASE_LYRICS_URL);
  url.searchParams.set('id', songId);
  url.searchParams.set('lv', '-1');
  url.searchParams.set('kv', '-1');
  url.searchParams.set('tv', '-1');
  return url.toString();
}

function getNeteaseBitrate(quality: Quality): number {
  const bitrateByQuality: Record<Quality, number> = {
    standard: 128000,
    higher: 320000,
    exhigh: 320000,
    lossless: 999000
  };

  return bitrateByQuality[quality];
}

function mapSongUrlRestriction(item?: NeteaseSongUrlItem) {
  if (item?.fee === 1) {
    return {
      category: 'vip_required' as const,
      message: '当前歌曲需要会员权限，无法获取播放地址',
      action: 'upgrade' as const
    };
  }

  if (item?.code === -110) {
    return {
      category: 'copyright_unavailable' as const,
      message: '当前歌曲受版权限制，无法获取播放地址',
      action: 'switch_source' as const
    };
  }

  return {
    category: 'url_unavailable' as const,
    message: '当前歌曲暂时无法获取播放地址',
    action: 'retry' as const
  };
}

function mapNeteaseTopLevelPlaybackRestriction(response: NeteaseSongUrlResponse): PlaybackRestriction | null {
  const code = Number(response.code);
  const message = firstText(response.message, response.msg);
  const normalizedMessage = message.toLocaleLowerCase();
  const isRiskResponse = code === -460
    || code === -462
    || /(?:网络|环境).*(?:风险|异常)|(?:风险|异常).*(?:网络|环境)|操作频繁|请求过于频繁|cheating/.test(normalizedMessage);

  if (isRiskResponse) {
    return {
      category: 'provider_risk',
      message: message
        ? `${message}；这不是会员限制`
        : '网易云音乐检测到网络环境风险，这不是会员限制，请稍后重试',
      action: 'retry'
    };
  }

  if (code === 301 || code === 401) {
    return {
      category: 'login_required',
      message: message || '网易云音乐登录已失效，请重新登录',
      action: 'login'
    };
  }

  if (Number.isFinite(code) && code !== 0 && code !== 200) {
    return {
      category: 'url_unavailable',
      message: message || `网易云音乐播放地址请求失败（${code}）`,
      action: 'retry'
    };
  }

  return null;
}

function createProviderScopedId(platformId: string | number): string {
  return `netease:${platformId}`;
}

function parseProviderScopedId(id: string): string {
  return id.startsWith('netease:') ? id.slice('netease:'.length) : id;
}

function mapPlaylist(playlist: NeteasePlaylistItem, currentUserId: number): Playlist {
  const isLiked = isOfficialOwnedLikedPlaylist(playlist, currentUserId);
  const ownership = getNeteasePlaylistOwnership(playlist, currentUserId, isLiked);

  return {
    id: createProviderScopedId(playlist.id),
    providerId: 'netease',
    title: playlist.name ?? '未命名歌单',
    description: playlist.description ?? '',
    songIds: [],
    coverTone: NETEASE_COVER_TONE,
    coverUrl: playlist.coverImgUrl,
    ownership,
    sourceLabel: NETEASE_SOURCE_LABEL,
    ...(isLiked ? { isLiked: true } : {})
  };
}

function getNeteasePlaylistOwnership(
  playlist: NeteasePlaylistItem,
  currentUserId: number,
  isLiked: boolean
): PlaylistOwnership {
  if (isLiked) {
    return 'liked';
  }

  const ownerUserId = normalizeNeteaseUserId(playlist.userId ?? playlist.creator?.userId);
  return ownerUserId === currentUserId ? 'created' : 'subscribed';
}

function isOfficialOwnedLikedPlaylist(playlist: NeteasePlaylistItem, currentUserId: number): boolean {
  const ownerUserId = normalizeNeteaseUserId(playlist.userId ?? playlist.creator?.userId);

  return playlist.specialType === 5 && ownerUserId === currentUserId;
}

function normalizeNeteaseUserId(value: unknown): number | null {
  const userId = Number(value);
  return Number.isFinite(userId) ? userId : null;
}

function mapTrack(
  track: NeteaseTrack,
  playlistId: string,
  playlistTitle: string,
  explicitSourceContext?: SourceContext
): Song {
  const platformSongId = String(track.id);
  const artists = track.artists ?? track.ar ?? [];
  const album = track.album ?? track.al;
  const artistReferences = artists
    .map(mapNeteaseArtistReference)
    .filter((artist): artist is ArtistReference => Boolean(artist));
  const albumReference = mapNeteaseAlbumReference(album);
  const sourceContext = explicitSourceContext ?? (playlistId && playlistTitle
    ? {
        type: 'playlist' as const,
        providerId: 'netease' as const,
        playlistId,
        playlistTitle
      }
    : undefined);

  return {
    id: createProviderScopedId(platformSongId),
    providerId: 'netease',
    platformSongId,
    title: track.name ?? '未命名歌曲',
    artist: artists.map((artist) => artist.name).filter(Boolean).join(' / ') || '未知歌手',
    album: album?.name ?? '未知专辑',
    ...(artistReferences.length > 0 ? { artists: artistReferences } : {}),
    ...(albumReference ? { albumRef: albumReference } : {}),
    durationMs: track.duration ?? track.dt ?? 0,
    coverTone: NETEASE_COVER_TONE,
    coverUrl: getNeteaseAlbumCoverUrl(track, album),
    artistImageUrl: getNeteaseArtistImageUrl(artists),
    ...(sourceContext ? { sourceContext } : {})
  };
}

function mapNeteaseArtistReference(artist: NeteaseArtist): ArtistReference | null {
  const platformArtistId = firstText(artist.id);
  const name = firstText(artist.name);
  if (!platformArtistId || !name) {
    return null;
  }

  return {
    id: `netease:artist:${platformArtistId}`,
    providerId: 'netease',
    platformArtistId,
    name
  };
}

function mapNeteaseAlbumReference(album: NeteaseAlbum | undefined): AlbumReference | null {
  const platformAlbumId = firstText(album?.id);
  const title = firstText(album?.name);
  if (!platformAlbumId || !title) {
    return null;
  }

  return {
    id: `netease:album:${platformAlbumId}`,
    providerId: 'netease',
    platformAlbumId,
    title
  };
}

function mapSearchTrack(track: NeteaseTrack): Song {
  return mapTrack(track, '', '');
}

async function hydrateNeteaseSearchArtwork(runtime: NeteaseRuntime, keyword: string, songs: Song[]): Promise<Song[]> {
  if (!songs.some(needsNeteaseSearchArtworkHydration)) {
    return songs;
  }

  const songIds = [...new Set(songs.map((song) => song.platformSongId).filter((songId): songId is string => Boolean(songId)))];
  if (songIds.length === 0) {
    return songs;
  }

  try {
    const response = await runtime.requestJson<NeteaseSongDetailResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: createSongDetailUrl(songIds)
    });
    const detailBySongId = new Map((response.songs ?? []).map((track) => [String(track.id), mapSearchTrack(track)]));

    const detailedSongs = songs.map((song) => {
      const detailedSong = detailBySongId.get(song.platformSongId ?? '');
      return detailedSong ? mergeNeteaseSearchSong(song, detailedSong) : song;
    });
    return hydrateNeteaseSearchArtistImages(runtime, keyword, detailedSongs);
  } catch {
    return songs;
  }
}

function needsNeteaseSearchArtworkHydration(song: Song): boolean {
  return !song.coverUrl || !song.artistImageUrl;
}

function mergeNeteaseSearchSong(searchSong: Song, detailedSong: Song): Song {
  return {
    ...searchSong,
    title: detailedSong.title || searchSong.title,
    artist: detailedSong.artist || searchSong.artist,
    album: detailedSong.album || searchSong.album,
    durationMs: detailedSong.durationMs || searchSong.durationMs,
    coverUrl: detailedSong.coverUrl ?? searchSong.coverUrl,
    artistImageUrl: detailedSong.artistImageUrl ?? searchSong.artistImageUrl
  };
}

async function hydrateNeteaseSearchArtistImages(runtime: NeteaseRuntime, keyword: string, songs: Song[]): Promise<Song[]> {
  if (!songs.some((song) => !song.artistImageUrl)) {
    return songs;
  }

  try {
    const response = await runtime.requestJson<NeteaseArtistSearchResponse>({
      partition: NETEASE_LOGIN_PARTITION,
      url: createArtistSearchUrl(keyword)
    });
    const imageByArtistName = getNeteaseArtistImages(response.result?.artists ?? []);
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

function getNeteaseArtistImages(artists: NeteaseArtist[]): Map<string, string> {
  return artists.reduce((imageByArtistName, artist) => {
    const artistName = firstText(artist.name);
    const imageUrl = getNeteaseArtistImageUrl([artist]);
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

function getNeteaseAlbumCoverUrl(track: NeteaseTrack, album: NeteaseAlbum | undefined): string | undefined {
  const directImageUrl = normalizeImageUrl(firstText(album?.picUrl, album?.blurPicUrl, track.picUrl));
  return (
    directImageUrl ||
    createNeteaseImageUrl(firstText(album?.pic_str, album?.picId_str, album?.picId, album?.pic, track.picId, track.pic)) ||
    undefined
  );
}

function getNeteaseArtistImageUrl(artists: NeteaseArtist[]): string | undefined {
  return artists
    .map((artist) =>
      normalizeImageUrl(firstText(artist.img1v1Url, artist.picUrl, artist.avatarUrl)) ||
      createNeteaseImageUrl(firstText(artist.img1v1Id_str, artist.img1v1Id, artist.picId_str, artist.picId))
    )
    .find(Boolean);
}

function createNeteaseImageUrl(imageId: string): string {
  return imageId ? `https://p1.music.126.net/${createNeteaseEncryptedImageId(imageId)}/${imageId}.jpg` : '';
}

function normalizeImageUrl(imageUrl: string): string {
  return imageUrl.replace(/^http:\/\//i, 'https://');
}

function normalizeNeteaseDiscoveryCoverUrl(imageUrl: string): string {
  const normalizedImageUrl = normalizeImageUrl(imageUrl);
  if (!normalizedImageUrl) {
    return '';
  }

  try {
    new URL(normalizedImageUrl);
    const targetSize = `${NETEASE_DISCOVERY_COVER_SIZE}y${NETEASE_DISCOVERY_COVER_SIZE}`;
    // Netease image URLs encode an ordered watermark pipeline in the raw query.
    return normalizedImageUrl.replace(
      /([?&](?:thumbnail|param)=)(\d+)y(\d+)(?=&|$)/gi,
      (operation, prefix: string, widthText: string, heightText: string) => (
        Number(widthText) >= NETEASE_DISCOVERY_COVER_SIZE
        && Number(heightText) >= NETEASE_DISCOVERY_COVER_SIZE
          ? operation
          : `${prefix}${targetSize}`
      )
    );
  } catch {
    return normalizedImageUrl;
  }
}

function createNeteaseEncryptedImageId(imageId: string): string {
  let xoredImageId = '';
  for (let index = 0; index < imageId.length; index += 1) {
    xoredImageId += String.fromCharCode(
      imageId.charCodeAt(index) ^ NETEASE_IMAGE_ENCRYPTION_KEY.charCodeAt(index % NETEASE_IMAGE_ENCRYPTION_KEY.length)
    );
  }

  return createHash('md5').update(xoredImageId, 'binary').digest('base64').replace(/\//g, '_').replace(/\+/g, '-');
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const normalized = BigInt(Math.trunc(value)).toString();
      return Number.isSafeInteger(value) || !normalized.endsWith('0') ? normalized : (BigInt(normalized) - 1n).toString();
    }
  }

  return '';
}

interface NeteaseAccountResponse {
  code?: number;
  profile?: NeteaseProfile;
}

interface NeteaseToplistResponse {
  code?: number;
  list?: NeteaseToplistItem[];
}

interface NeteaseToplistItem {
  id?: string | number;
  name?: string;
  description?: string;
  coverImgUrl?: string;
  updateTime?: string | number;
  updateFrequency?: string;
}

interface NeteasePlaylistCategoriesResponse {
  code?: number;
  all?: {
    name?: string;
  };
  categories?: Record<string, string>;
  sub?: Array<{
    name?: string;
    category?: string | number;
    hot?: boolean;
  }>;
}

interface NeteasePlaylistDiscoveryResponse {
  code?: number;
  total?: number;
  more?: boolean;
  playlists?: NeteaseDiscoveredPlaylistItem[];
}

interface NeteasePersonalizedNewSongItem extends NeteaseTrack {
  song?: NeteaseTrack;
}

interface NeteasePersonalizedNewSongsResponse {
  code?: number;
  result?: NeteasePersonalizedNewSongItem[];
  data?: NeteasePersonalizedNewSongItem[];
}

interface NeteaseNewAlbumsResponse {
  code?: number;
  albums?: NeteaseAlbum[];
}

interface NeteaseDailyRecommendedSongsResponse {
  code?: number;
  recommend?: NeteaseTrack[];
  data?: {
    dailySongs?: NeteaseTrack[];
    recommend?: NeteaseTrack[];
  };
}

interface NeteaseRecommendationHistoryResponse {
  code?: number;
  data?: {
    dates?: unknown;
    songs?: unknown;
  };
}

interface NeteaseSimilarSongsResponse {
  code?: number;
  songs?: unknown;
}

interface NeteaseHomepageBlocksResponse {
  code?: number;
  data?: {
    blocks?: unknown;
  };
}

interface NeteaseDiscoveredPlaylistItem {
  id?: string | number;
  name?: string;
  description?: string;
  copywriter?: string;
  coverImgUrl?: string;
  picUrl?: string;
  creator?: {
    nickname?: string;
  };
  playCount?: number;
  playcount?: number;
  trackCount?: number;
  trackcount?: number;
}

interface NeteaseSearchPlaylist {
  id?: string | number;
  name?: string;
  description?: string;
  copywriter?: string;
  coverImgUrl?: string;
  picUrl?: string;
  creator?: {
    nickname?: string;
    name?: string;
  };
  playCount?: number;
  playcount?: number;
  trackCount?: number;
  trackcount?: number;
}

interface NeteaseProfile {
  userId: number;
  nickname?: string;
  avatarUrl?: string;
  vipType?: number;
}

interface NeteasePlaylistListResponse {
  code?: number;
  playlist?: NeteasePlaylistItem[];
}

interface NeteasePlaylistItem {
  id: number;
  name?: string;
  description?: string;
  coverImgUrl?: string;
  specialType?: number;
  userId?: number;
  creator?: {
    userId?: number;
  };
}

interface NeteasePlaylistDetailResponse {
  code?: number;
  playlist?: NeteasePlaylistDetail;
}

interface NeteasePlaylistDetail {
  id: number;
  name?: string;
  tracks?: NeteaseTrack[];
  trackIds?: Array<{
    id?: string | number;
  }>;
}

interface NeteaseSearchResponse {
  code?: number;
  result?: {
    songs?: NeteaseTrack[];
    songCount?: number;
    artists?: NeteaseArtist[];
    artistCount?: number;
    albums?: NeteaseAlbum[];
    albumCount?: number;
    playlists?: NeteaseSearchPlaylist[];
    playlistCount?: number;
  };
}

interface NeteaseSearchSuggestResponse {
  code?: number;
  result?: {
    songs?: NeteaseTrack[];
    artists?: NeteaseArtist[];
    albums?: NeteaseAlbum[];
    playlists?: NeteaseSearchPlaylist[];
  };
}

interface NeteaseHotSearchResponse {
  code?: number;
  data?: NeteaseHotSearchItem[];
}

interface NeteaseHotSearchItem {
  searchWord?: string;
  content?: string;
  score?: number;
  iconUrl?: string;
}

interface NeteaseSongDetailResponse {
  code?: number;
  songs?: NeteaseTrack[];
}

interface NeteaseArtistSearchResponse {
  code?: number;
  result?: {
    artists?: NeteaseArtist[];
  };
}

interface NeteaseSongUrlResponse {
  code?: number;
  message?: string;
  msg?: string;
  data?: NeteaseSongUrlItem[];
}

interface NeteaseMutationResponse {
  code?: number;
  message?: string;
}

interface NeteaseLyricsResponse {
  code?: number;
  lrc?: {
    lyric?: string;
  };
  tlyric?: {
    lyric?: string;
  };
}

interface NeteaseSongUrlItem {
  id?: number;
  url?: string | null;
  level?: string;
  fee?: number;
  code?: number;
}

interface NeteaseTrack {
  id: number;
  name?: string;
  artists?: NeteaseArtist[];
  ar?: NeteaseArtist[];
  album?: NeteaseAlbum;
  al?: NeteaseAlbum;
  duration?: number;
  dt?: number;
  picUrl?: string;
  picId?: string | number;
  pic?: string | number;
}

interface NeteaseAlbum {
  id?: string | number;
  name?: string;
  picUrl?: string;
  blurPicUrl?: string;
  picId?: string | number;
  picId_str?: string;
  pic_str?: string;
  pic?: string | number;
  artist?: NeteaseArtist;
  artists?: NeteaseArtist[];
  publishTime?: string | number;
  size?: number;
  type?: string;
  description?: string;
  briefDesc?: string;
}

interface NeteaseArtist {
  id?: string | number;
  name?: string;
  img1v1Url?: string;
  img1v1Id?: string | number;
  img1v1Id_str?: string;
  picUrl?: string;
  picId?: string | number;
  picId_str?: string;
  avatarUrl?: string;
  alias?: string[];
  briefDesc?: string;
  musicSize?: number;
  albumSize?: number;
}

interface NeteaseArtistDetailResponse {
  code?: number;
  artist?: NeteaseArtist;
  hotSongs?: NeteaseTrack[];
}

interface NeteaseArtistAlbumsResponse {
  code?: number;
  hotAlbums?: NeteaseAlbum[];
}

interface NeteaseAlbumDetailResponse {
  code?: number;
  album?: NeteaseAlbum;
  songs?: NeteaseTrack[];
}
