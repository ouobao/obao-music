import type {
  AlbumDetail,
  AlbumSummary,
  ArtistDetail,
  ArtistSummary,
  ChartSummary,
  DiscoveredPlaylist,
  HomepageBlockFeed,
  Playlist,
  PlaylistCategory,
  PlaylistDiscoveryPage,
  Program,
  ProviderId,
  RemoteProviderId,
  RadioSession,
  RadioSessionItem,
  RadioSessionPage,
  RecommendationHistoryPage,
  RecommendationHomeFeed,
  Song
} from './musicTypes';

export interface LoginStatus {
  providerId: ProviderId;
  loggedIn: boolean;
  userId?: string;
  nickname?: string;
  avatarUrl?: string;
  vipLabel?: string;
  stale?: boolean;
  playbackReady?: boolean;
  message?: string;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
}

export type SearchEntityType = 'song' | 'artist' | 'album' | 'playlist';

export interface SearchSuggestion {
  id: string;
  providerId: RemoteProviderId;
  keyword: string;
  title: string;
  kind: SearchEntityType;
  subtitle?: string;
  coverUrl?: string;
}

export interface SearchHotSearch {
  id: string;
  providerId: RemoteProviderId;
  keyword: string;
  title: string;
  rank?: number;
  score?: number;
  iconUrl?: string;
}

export interface SearchSuggestionOptions extends ProviderFetchOptions {
  limit?: number;
}

export interface SearchEntityOptions extends SearchOptions, ProviderFetchOptions {
  entityTypes?: SearchEntityType[];
}

export interface SearchEntitySection<T> {
  available: boolean;
  items: T[];
  total: number;
  hasMore: boolean;
  errorMessage: string | null;
}

export interface SearchEntityResults {
  providerId: RemoteProviderId;
  keyword: string;
  sections: {
    songs: SearchEntitySection<Song>;
    artists: SearchEntitySection<ArtistSummary>;
    albums: SearchEntitySection<AlbumSummary>;
    playlists: SearchEntitySection<DiscoveredPlaylist>;
  };
}

export interface ProviderFetchOptions {
  forceRefresh?: boolean;
}

export interface ChartCapability {
  getCharts(options?: ProviderFetchOptions): Promise<ChartSummary[]>;
  getChartTracks(chartId: string, options?: ProviderFetchOptions): Promise<Song[]>;
}

export interface PlaylistDiscoveryQuery {
  categoryId: string;
  limit?: number;
  offset?: number;
}

export interface PlaylistDiscoveryCapability {
  getPlaylistCategories(options?: ProviderFetchOptions): Promise<PlaylistCategory[]>;
  getDiscoveredPlaylists(
    query: PlaylistDiscoveryQuery,
    options?: ProviderFetchOptions
  ): Promise<PlaylistDiscoveryPage>;
}

export interface SearchExperienceCapability {
  getSuggestions(keyword: string, options?: SearchSuggestionOptions): Promise<SearchSuggestion[]>;
  getHotSearches(options?: SearchSuggestionOptions): Promise<SearchHotSearch[]>;
  searchEntities(keyword: string, options?: SearchEntityOptions): Promise<SearchEntityResults>;
}

export interface ArtistCatalogCapability {
  getArtistDetail(artistId: string, options?: ProviderFetchOptions): Promise<ArtistDetail>;
  getAlbumDetail(albumId: string, options?: ProviderFetchOptions): Promise<AlbumDetail>;
}

export interface RecommendationCapability {
  getRecommendationHome(options?: ProviderFetchOptions): Promise<RecommendationHomeFeed>;
}

export interface ReleaseCatalogCapability {
  getNewAlbums(options?: ProviderFetchOptions): Promise<AlbumSummary[]>;
}

export interface HomepageBlocksCapability {
  getHomepageBlocks(options?: ProviderFetchOptions): Promise<HomepageBlockFeed>;
}

export interface SimilarSongsCapability {
  getSimilarSongs(song: Song, options?: ProviderFetchOptions): Promise<Song[]>;
}

export interface RecommendationHistoryCapability {
  getRecentDates(options?: ProviderFetchOptions): Promise<string[]>;
  getHistory(date: string, options?: ProviderFetchOptions): Promise<RecommendationHistoryPage>;
}

export interface ProgramPlaybackCapability {
  getProgramPlayback(program: Program): Promise<ProgramPlaybackResult>;
}

export interface RadioSessionCapability {
  startRadioSession(): Promise<RadioSessionPage>;
  refillRadioSession(session: RadioSession): Promise<RadioSessionPage>;
  skipRadioSessionItem(session: RadioSession, item: RadioSessionItem): Promise<RadioSessionPage>;
  submitRadioNegativeFeedback(session: RadioSession, item: RadioSessionItem): Promise<RadioSessionPage>;
}

export type Quality = 'standard' | 'higher' | 'exhigh' | 'lossless';

export interface PlaybackRestriction {
  category:
    | 'login_required'
    | 'vip_required'
    | 'paid_required'
    | 'copyright_unavailable'
    | 'region_unavailable'
    | 'provider_risk'
    | 'playback_auth_incomplete'
    | 'url_unavailable';
  message: string;
  action: 'login' | 'upgrade' | 'purchase' | 'switch_source' | 'retry' | 'none';
}

export interface SongUrlResult {
  ok: boolean;
  url?: string;
  providerId: ProviderId;
  quality?: Quality;
  reason?: PlaybackRestriction;
}

export interface ProgramPlaybackResult {
  ok: boolean;
  url?: string;
  providerId: ProviderId;
  reason?: PlaybackRestriction;
}

export interface LyricsResult {
  ok: boolean;
  providerId: ProviderId;
  lrc?: string;
  tlyric?: string;
  reason?: PlaybackRestriction;
}

export type SongMutationOperation = 'like' | 'unlike' | 'add_to_playlist' | 'remove_from_playlist';

export interface SongMutationResult {
  providerId: ProviderId;
  operation: SongMutationOperation;
}

export type ProviderErrorCode = 'provider_not_ready' | 'provider_unsupported' | 'provider_failed';

export interface ProviderIpcError {
  code: ProviderErrorCode;
  providerId: ProviderId;
  message: string;
}

export type ProviderIpcResult<T> = { ok: true; data: T } | { ok: false; error: ProviderIpcError };

export interface MusicProvider {
  id: ProviderId;
  capabilities?: {
    charts?: ChartCapability;
    searchExperience?: SearchExperienceCapability;
    playlistDiscovery?: PlaylistDiscoveryCapability;
    artistCatalog?: ArtistCatalogCapability;
    recommendations?: RecommendationCapability;
    releaseCatalog?: ReleaseCatalogCapability;
    homepageBlocks?: HomepageBlocksCapability;
    similarSongs?: SimilarSongsCapability;
    recommendationHistory?: RecommendationHistoryCapability;
    programPlayback?: ProgramPlaybackCapability;
    radioSession?: RadioSessionCapability;
  };
  getLoginStatus(): Promise<LoginStatus>;
  login(): Promise<LoginStatus>;
  logout(): Promise<void>;
  search(keyword: string, options?: SearchOptions): Promise<Song[]>;
  getUserPlaylists(options?: ProviderFetchOptions): Promise<Playlist[]>;
  getPlaylistTracks(playlistId: string, options?: ProviderFetchOptions): Promise<Song[]>;
  getSongUrl(song: Song, quality: Quality): Promise<SongUrlResult>;
  getLyrics(song: Song): Promise<LyricsResult>;
  setSongLiked(song: Song, liked: boolean): Promise<SongMutationResult>;
  addSongToPlaylist(song: Song, playlistId: string): Promise<SongMutationResult>;
  removeSongFromPlaylist(song: Song, playlistId: string): Promise<SongMutationResult>;
}
