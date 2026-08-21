export type ProviderId = 'netease' | 'qq' | 'local';
export type RemoteProviderId = Exclude<ProviderId, 'local'>;
export type PlaylistOwnership = 'liked' | 'created' | 'subscribed';

export type QueueItemSource = 'playlist' | 'search' | 'local' | 'artist' | 'album' | 'podcast' | 'radio';
export type QueueSourceType = QueueItemSource | 'recommendation';
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

export interface PlaylistDetail {
  providerId: ProviderId;
  playlist: Playlist;
  tracks: Song[];
  creatorName?: string;
  playCount?: number;
  trackCount?: number;
  updateLabel?: string;
}

export interface ChartSummary extends Playlist {
  providerId: RemoteProviderId;
  platformChartId: string;
  updatedAt?: string;
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

export interface QueueItem {
  id: string;
  mediaId: string;
  mediaType: PlayableMediaType;
  songId?: string;
  source: QueueItemSource;
  sourceContext?: SourceContext;
}

export interface LyricLine {
  startMs: number;
  text: string;
}

export interface UiReferenceItem {
  area: string;
  sourceLabel: string;
  implementationNote: string;
}
