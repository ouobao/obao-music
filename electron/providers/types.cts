import { normalizeProviderError } from './providerErrors.cjs';

export type ProviderId = 'netease' | 'qq' | 'local';
export type RemoteProviderId = Exclude<ProviderId, 'local'>;
export type PlaylistOwnership = 'liked' | 'created' | 'subscribed';
export type QueueSourceType = 'playlist' | 'search' | 'local' | 'artist' | 'album' | 'podcast' | 'radio' | 'recommendation';
export type PlayableMediaType = 'song' | 'program';

export interface SourceContext {
  type: QueueSourceType;
  providerId: ProviderId;
  playlistId?: string;
  playlistTitle?: string;
  searchKeyword?: string;
  artistId?: string;
  artistName?: string;
  albumId?: string;
  albumTitle?: string;
  podcastId?: string;
  podcastTitle?: string;
  radioSessionId?: string;
  radioItemId?: string;
}

export interface PodcastSourceContext extends SourceContext {
  type: 'podcast';
  podcastId: string;
  podcastTitle: string;
}

export interface RadioSourceContext extends SourceContext {
  type: 'radio';
  providerId: RemoteProviderId;
  radioSessionId: string;
  radioItemId: string;
}

export interface ArtistReference {
  id: string;
  providerId: RemoteProviderId;
  platformArtistId: string;
  name: string;
}

export interface ArtistSummary extends ArtistReference {
  coverTone: string;
  imageUrl?: string;
  sourceLabel?: string;
  aliases?: string[];
  songCount?: number;
  albumCount?: number;
}

export interface AlbumReference {
  id: string;
  providerId: RemoteProviderId;
  platformAlbumId: string;
  title: string;
}

export interface AlbumSummary extends AlbumReference {
  artistName: string;
  coverTone: string;
  coverUrl?: string;
  releaseDate?: string;
  trackCount?: number;
  albumType?: string;
  sourceLabel?: string;
}

export interface ArtistDetail extends ArtistReference {
  aliases: string[];
  description: string;
  coverTone: string;
  imageUrl?: string;
  sourceLabel?: string;
  area?: string;
  genre?: string;
  songCount?: number;
  albumCount?: number;
  topSongs: Song[];
  albums: AlbumSummary[];
}

export interface ArtistSongsPage {
  songs: Song[];
  hasMore: boolean;
  nextOffset: number;
  total?: number;
}

export interface AlbumDetail extends AlbumSummary {
  description: string;
  artists: ArtistReference[];
  tracks: Song[];
}

export interface Song {
  id: string;
  mediaType?: 'song';
  providerId: ProviderId;
  platformSongId?: string;
  /** Numeric provider-side song id required by QQ Music write APIs. */
  platformNumericSongId?: number;
  /** Provider-side song type required by QQ Music write APIs. */
  platformSongType?: number;
  platformMediaId?: string;
  title: string;
  artist: string;
  album: string;
  artists?: ArtistReference[];
  albumRef?: AlbumReference;
  durationMs: number;
  coverTone: string;
  coverUrl?: string;
  artistImageUrl?: string;
  sourceContext?: SourceContext;
}

export interface RadioSession {
  id: string;
  providerId: RemoteProviderId;
  cursor: string | null;
}

export interface RadioSessionItem {
  id: string;
  song: Song;
  sourceContext: RadioSourceContext;
}

export interface RadioSessionPage {
  session: RadioSession;
  items: RadioSessionItem[];
  hasMore: boolean;
}

export interface Podcast {
  id: string;
  providerId: RemoteProviderId;
  platformPodcastId: string;
  title: string;
  description: string;
  author: string;
  coverTone: string;
  coverUrl?: string;
  sourceLabel?: string;
}

export interface Program {
  id: string;
  mediaType: 'program';
  providerId: RemoteProviderId;
  platformProgramId: string;
  title: string;
  description: string;
  durationMs: number;
  coverTone: string;
  coverUrl?: string;
  publishedAt?: string;
  podcast: Podcast;
  sourceContext: PodcastSourceContext;
}

export type PlayableMedia = Song | Program;

export interface Playlist {
  id: string;
  providerId: ProviderId;
  platformDirectoryId?: string;
  title: string;
  description: string;
  songIds: string[];
  coverTone: string;
  coverUrl?: string;
  sourceLabel?: string;
  ownership?: PlaylistOwnership;
  isLiked?: boolean;
}

export interface ChartSummary extends Playlist {
  providerId: RemoteProviderId;
  platformChartId: string;
  updatedAt?: string;
  updateLabel?: string;
}

export interface PlaylistDetail {
  providerId: ProviderId;
  playlist: Playlist;
  tracks: Song[];
  creatorName?: string;
  playCount?: number;
  trackCount?: number;
  updateLabel?: string;
}

export interface PlaylistCategory {
  id: string;
  providerId: RemoteProviderId;
  name: string;
  group?: string;
  hot?: boolean;
}

export interface DiscoveredPlaylist extends Playlist {
  providerId: RemoteProviderId;
  platformPlaylistId: string;
  creatorName?: string;
  playCount?: number;
  trackCount?: number;
}

export interface PlaylistDiscoveryPage {
  providerId: RemoteProviderId;
  categoryId: string;
  playlists: DiscoveredPlaylist[];
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface RecommendationHomeFeed {
  providerId: RemoteProviderId;
  loggedIn: boolean;
  dailySongs: Song[];
  newSongs: Song[];
  moduleResults: RecommendationHomeModuleResults;
}

export interface RecommendationHistoryPage {
  providerId: RemoteProviderId;
  date: string;
  songs: Song[];
}

export type RecommendationHomeModuleStatus = 'fulfilled' | 'rejected' | 'skipped';

export interface RecommendationHomeModuleResult {
  status: RecommendationHomeModuleStatus;
  errorMessage: string | null;
}

export interface RecommendationHomeModuleResults {
  daily: RecommendationHomeModuleResult;
  new: RecommendationHomeModuleResult;
}

export interface HomepageSongBlock {
  kind: 'song';
  id: string;
  title: string;
  songs: Song[];
}

export interface HomepageTopicBlock {
  kind: 'topic';
  id: string;
  title: string;
  description?: string;
  coverTone: string;
  coverUrl?: string;
}

export type HomepageBlock = HomepageSongBlock | HomepageTopicBlock;

export interface HomepageBlockFeed {
  providerId: RemoteProviderId;
  blocks: HomepageBlock[];
}

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

export interface LoginQrSession {
  providerId: ProviderId;
  key: string;
  qrImageDataUrl?: string;
  qrText?: string;
  expiresAtMs: number;
}

export type LoginQrPollState = 'waiting' | 'scanned' | 'expired' | 'success' | 'failed';

export interface LoginQrPollResult {
  state: LoginQrPollState;
  message: string;
  loginStatus?: LoginStatus;
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
  getArtistSongsPage(artistId: string, offset: number, options?: ProviderFetchOptions): Promise<ArtistSongsPage>;
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

export interface ProviderCapabilities {
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
export type ProviderCapabilityId = 'charts' | 'searchExperience' | 'playlistDiscovery' | 'artistCatalog' | 'recommendations' | 'releaseCatalog' | 'homepageBlocks' | 'similarSongs' | 'recommendationHistory' | 'programPlayback' | 'radioSession';

export interface ProviderIpcError {
  code: ProviderErrorCode;
  providerId: ProviderId;
  message: string;
}

export type ProviderIpcResult<T> = { ok: true; data: T } | { ok: false; error: ProviderIpcError };

export interface MusicProvider {
  id: ProviderId;
  capabilities?: ProviderCapabilities;
  getLoginStatus(): Promise<LoginStatus>;
  login(): Promise<LoginStatus>;
  logout(): Promise<void>;
  createLoginQr?(): Promise<LoginQrSession>;
  pollLoginQr?(key: string): Promise<LoginQrPollResult>;
  cancelLoginQr?(key: string): Promise<void>;
  search(keyword: string, options?: SearchOptions): Promise<Song[]>;
  getUserPlaylists(options?: ProviderFetchOptions): Promise<Playlist[]>;
  getPlaylistTracks(playlistId: string, options?: ProviderFetchOptions): Promise<Song[]>;
  getPlaylistDetail?(playlistId: string, options?: ProviderFetchOptions): Promise<PlaylistDetail>;
  getSongUrl(song: Song, quality: Quality, options?: ProviderFetchOptions): Promise<SongUrlResult>;
  getLyrics(song: Song): Promise<LyricsResult>;
  setSongLiked(song: Song, liked: boolean): Promise<SongMutationResult>;
  addSongToPlaylist(song: Song, playlistId: string): Promise<SongMutationResult>;
  removeSongFromPlaylist(song: Song, playlistId: string): Promise<SongMutationResult>;
}

const providerLabels: Record<ProviderId, string> = {
  netease: '网易云音乐',
  qq: 'QQ 音乐',
  local: '本地音乐',
};

export class ProviderNotReadyError extends Error {
  readonly code = 'provider_not_ready';
  readonly providerId: ProviderId;

  constructor(providerId: ProviderId) {
    super(`${providerLabels[providerId]} Provider 尚未接入`);
    this.name = 'ProviderNotReadyError';
    this.providerId = providerId;
  }
}

export class ProviderCapabilityUnsupportedError extends Error {
  readonly code = 'provider_unsupported';
  readonly providerId: ProviderId;

  constructor(providerId: ProviderId, capabilityId: ProviderCapabilityId) {
    const capabilityLabels: Record<Exclude<ProviderCapabilityId, 'programPlayback' | 'radioSession'>, string> = {
      charts: '排行榜',
      searchExperience: '搜索',
      playlistDiscovery: '歌单发现',
      artistCatalog: '歌手与专辑',
      recommendations: '个性化推荐',
      releaseCatalog: '新碟速递',
      homepageBlocks: '首页专题歌曲',
      similarSongs: '相似歌曲',
      recommendationHistory: '历史日推'
    };
    const capabilityLabel = capabilityId === 'programPlayback'
      ? '播客节目播放'
      : capabilityId === 'radioSession'
        ? '电台会话'
        : capabilityLabels[capabilityId];
    super(`${providerLabels[providerId]}暂不支持${capabilityLabel}能力`);
    this.name = 'ProviderCapabilityUnsupportedError';
    this.providerId = providerId;
  }
}

export function toProviderIpcError(providerId: ProviderId, error: unknown): ProviderIpcError {
  if (error instanceof ProviderNotReadyError) {
    return {
      code: error.code,
      providerId: error.providerId,
      message: error.message
    };
  }

  if (error instanceof ProviderCapabilityUnsupportedError) {
    return {
      code: error.code,
      providerId: error.providerId,
      message: error.message
    };
  }

  const normalizedError = normalizeProviderError(error, 'Provider 调用失败');

  return {
    code: 'provider_failed',
    providerId,
    message: normalizedError.message
  };
}

export function createProviderNotReady(providerId: ProviderId): MusicProvider {
  const reject = async () => {
    throw new ProviderNotReadyError(providerId);
  };

  return {
    id: providerId,
    getLoginStatus: reject,
    login: reject,
    logout: reject,
    search: reject,
    getUserPlaylists: reject,
    getPlaylistTracks: reject,
    getPlaylistDetail: reject,
    getSongUrl: reject,
    getLyrics: reject,
    setSongLiked: reject,
    addSongToPlaylist: reject,
    removeSongFromPlaylist: reject
  };
}
