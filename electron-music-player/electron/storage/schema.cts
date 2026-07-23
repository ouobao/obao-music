export type CacheProviderId = 'netease' | 'qq' | 'local';
export type CacheQuality = 'standard' | 'higher' | 'exhigh' | 'lossless';

export interface CacheStoreOptions {
  now?: () => number;
  maxEntries?: number;
  maxBytes?: number;
  persistDelayMs?: number;
}

export interface CacheStore {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttlMs: number): void;
  getOrSet<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T>;
  delete(key: string): void;
  deleteByPrefix(prefix: string): void;
  clear(): void;
}

export const CACHE_TTL_MS = {
  loginStatus: 60_000,
  providerPlaylists: 5 * 60_000,
  playlistTracks: 5 * 60_000,
  chartList: 10 * 60_000,
  chartTracks: 5 * 60_000,
  playlistCategories: 30 * 60_000,
  playlistDiscoveryPage: 10 * 60_000,
  artistDetail: 10 * 60_000,
  albumDetail: 10 * 60_000,
  recommendationHome: 10 * 60_000,
  releaseCatalog: 10 * 60_000,
  homepageBlocks: 10 * 60_000,
  similarSongs: 10 * 60_000,
  recommendationHistory: 10 * 60_000,
  searchResults: 5 * 60_000,
  searchSuggestions: 60_000,
  searchHotSearches: 10 * 60_000,
  searchEntities: 2 * 60_000,
  lyrics: 5 * 60_000,
  playbackFailure: 30_000
} as const;

function createPlaylistDiscoveryPagePrefix(providerId: CacheProviderId, categoryId: string): string {
  return `${providerId}:playlist-discovery:v2:${encodeURIComponent(categoryId)}:`;
}

export const CACHE_KEYS = {
  providerPrefix(providerId: CacheProviderId) {
    return `${providerId}:`;
  },
  loginStatus(providerId: CacheProviderId) {
    return `${providerId}:login-status`;
  },
  providerPlaylists(providerId: CacheProviderId) {
    return `${providerId}:playlists`;
  },
  playlistTracks(providerId: CacheProviderId, playlistId: string) {
    return `${providerId}:playlist-tracks:${playlistId}`;
  },
  chartList(providerId: CacheProviderId) {
    return `${providerId}:charts:v1`;
  },
  chartTracks(providerId: CacheProviderId, chartId: string) {
    return `${providerId}:chart-tracks:v1:${encodeURIComponent(chartId)}`;
  },
  playlistCategories(providerId: CacheProviderId) {
    return `${providerId}:playlist-categories:v1`;
  },
  playlistDiscoveryPagePrefix(providerId: CacheProviderId, categoryId: string) {
    return createPlaylistDiscoveryPagePrefix(providerId, categoryId);
  },
  playlistDiscoveryPage(
    providerId: CacheProviderId,
    categoryId: string,
    limit: number,
    offset: number
  ) {
    return `${createPlaylistDiscoveryPagePrefix(providerId, categoryId)}${limit}:${offset}`;
  },
  artistDetail(providerId: CacheProviderId, artistId: string) {
    return `${providerId}:artist-detail:v2:${encodeURIComponent(artistId)}`;
  },
  albumDetail(providerId: CacheProviderId, albumId: string) {
    return `${providerId}:album-detail:v1:${encodeURIComponent(albumId)}`;
  },
  recommendationHome(providerId: CacheProviderId, loggedIn: boolean) {
    return `${providerId}:recommendation-home:v3:${loggedIn ? 'authenticated' : 'public'}`;
  },
  releaseCatalog(providerId: CacheProviderId) {
    return `${providerId}:release-catalog:v1`;
  },
  homepageBlocks(providerId: CacheProviderId) {
    return `${providerId}:homepage-blocks:v1`;
  },
  similarSongs(providerId: CacheProviderId, songId: string) {
    return `${providerId}:similar-songs:v1:${encodeURIComponent(songId)}`;
  },
  recommendationHistoryDates(providerId: CacheProviderId) {
    return `${providerId}:recommendation-history-dates:v1`;
  },
  recommendationHistory(providerId: CacheProviderId, date: string) {
    return `${providerId}:recommendation-history:v1:${encodeURIComponent(date)}`;
  },
  searchResults(providerId: CacheProviderId, keyword: string, limit: number, offset: number) {
    return `${providerId}:search-results:v2:${encodeURIComponent(keyword.trim().toLocaleLowerCase())}:${limit}:${offset}`;
  },
  searchSuggestions(providerId: CacheProviderId, keyword: string, limit: number) {
    return `${providerId}:search-suggestions:v1:${encodeURIComponent(keyword.trim().toLocaleLowerCase())}:${limit}`;
  },
  searchHotSearches(providerId: CacheProviderId, limit: number) {
    return `${providerId}:search-hot-searches:v1:${limit}`;
  },
  searchEntities(
    providerId: CacheProviderId,
    keyword: string,
    limit: number,
    offset: number,
    entityTypes: readonly string[]
  ) {
    const normalizedTypes = [...entityTypes].sort().join(',');
    return `${providerId}:search-entities:v1:${encodeURIComponent(keyword.trim().toLocaleLowerCase())}:${limit}:${offset}:${normalizedTypes}`;
  },
  lyrics(providerId: CacheProviderId, songId: string) {
    return `${providerId}:lyrics:v3:${songId}`;
  },
  playbackFailure(providerId: CacheProviderId, songId: string, quality: CacheQuality) {
    return `${providerId}:playback-failure:${songId}:${quality}`;
  }
} as const;
