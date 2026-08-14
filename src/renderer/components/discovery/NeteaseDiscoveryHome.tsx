import { Play } from 'lucide-react';
import { memo, useMemo, type CSSProperties, type ReactNode } from 'react';
import type {
  AlbumSummary,
  HomepageBlock,
  HomepageBlockFeed,
  RecommendationHomeFeed,
  Song
} from '../../../shared/musicTypes';
import { useCoverPalette } from '../../hooks/useCoverPalette';
import { DiscoveryArtwork } from './DiscoveryArtwork';
import { CoverActionSurface } from './CoverActionSurface';
import { HistoryDateSelect } from './HistoryDateSelect';
import { DiscoveryAlbumSection } from './DiscoveryAlbumSection';
import { DiscoverySectionHeader } from './DiscoverySectionHeader';
import {
  DiscoverySectionState,
  type DiscoverySectionStatus
} from './DiscoverySectionState';

const NETEASE_SONG_SECTION_COUNT = 12;

interface NeteaseFeatureTile {
  id: string;
  title: string;
  subtitle: string;
  coverUrl?: string;
  coverTone: string;
  previewSongs: readonly Song[];
  onOpen?: () => void;
  onPlay?: () => void;
}

export interface NeteaseDiscoveryHomeProps {
  recommendationFeed: RecommendationHomeFeed | null;
  homepageBlockFeed?: HomepageBlockFeed | null;
  currentSongId?: string;
  dailyStatus: DiscoverySectionStatus;
  newStatus: DiscoverySectionStatus;
  homepageBlockStatus?: DiscoverySectionStatus;
  recommendationHistoryDates?: readonly string[];
  recommendationHistoryDate?: string | null;
  recommendationHistorySongs?: readonly Song[];
  recommendationHistoryStatus?: DiscoverySectionStatus;
  continueSongs?: readonly Song[];
  continueStatus?: DiscoverySectionStatus;
  longTimeNoListenSongs?: readonly Song[];
  newAlbums?: readonly AlbumSummary[];
  releaseStatus?: DiscoverySectionStatus;
  frequentArtistAlbums?: readonly AlbumSummary[];
  frequentArtistAlbumsStatus?: DiscoverySectionStatus;
  onPlaySongs?: (songs: readonly Song[], sourceTitle: string) => void;
  onPlaySong?: (song: Song, songs: readonly Song[], sourceTitle: string) => void;
  onOpenCollection?: (collectionId: string) => void;
  onRefreshDaily?: () => void;
  onRefreshNew?: () => void;
  onRefreshHistory?: () => void;
  onSelectHistoryDate?: (date: string) => void;
  onSelectAlbum?: (album: AlbumSummary) => void;
  onPlayAlbum?: (album: AlbumSummary) => void;
  albumLoadingById?: Readonly<Record<string, boolean>>;
}

export function NeteaseDiscoveryHome({
  recommendationFeed,
  homepageBlockFeed,
  currentSongId,
  dailyStatus,
  newStatus,
  homepageBlockStatus,
  recommendationHistoryDates = [],
  recommendationHistoryDate = null,
  recommendationHistorySongs = [],
  recommendationHistoryStatus,
  continueSongs = [],
  continueStatus = { isLoading: false, errorMessage: null },
  longTimeNoListenSongs = [],
  newAlbums = [],
  releaseStatus,
  frequentArtistAlbums = [],
  frequentArtistAlbumsStatus,
  onPlaySongs,
  onPlaySong,
  onOpenCollection,
  onRefreshDaily,
  onRefreshNew,
  onRefreshHistory,
  onSelectHistoryDate,
  onSelectAlbum,
  onPlayAlbum,
  albumLoadingById
}: NeteaseDiscoveryHomeProps) {
  const { dailySongs, newSongs } = useMemo(() => {
    const nextDailySongs = uniqueSongs(recommendationFeed?.dailySongs ?? []);
    const dailySongIds = new Set(nextDailySongs.map(getSongIdentity));
    const nextNewSongs = uniqueSongs(recommendationFeed?.newSongs ?? [])
      .filter((song) => !dailySongIds.has(getSongIdentity(song)));
    return { dailySongs: nextDailySongs, newSongs: nextNewSongs };
  }, [recommendationFeed?.dailySongs, recommendationFeed?.newSongs]);
  const homepageSongBlocks = useMemo(
    () => getAcceptedHomepageBlocks(homepageBlockFeed?.blocks ?? [])
      .filter(isHomepageSongBlock)
      .map((block) => ({ ...block, songs: uniqueSongs(block.songs) })),
    [homepageBlockFeed?.blocks]
  );
  const primarySongs = dailySongs.length > 0 ? dailySongs : newSongs;
  const primaryTitle = dailySongs.length > 0 ? '每日推荐' : '最新音乐';
  const primaryCollectionId = dailySongs.length > 0 ? 'daily' : 'new';
  const primaryTile: NeteaseFeatureTile | null = primarySongs.length > 0 ? {
    id: primaryCollectionId,
    title: primaryTitle,
    subtitle: `${primarySongs.length} 首歌曲`,
    coverUrl: primarySongs[0]?.coverUrl,
    coverTone: primarySongs[0]?.coverTone ?? 'linear-gradient(135deg, #607d8b, #9c6f86)',
    previewSongs: primarySongs.slice(0, 3),
    onOpen: onOpenCollection ? () => onOpenCollection(primaryCollectionId) : undefined,
    onPlay: onPlaySongs ? () => onPlaySongs(primarySongs, primaryTitle) : undefined
  } : null;

  return (
    <div className="discovery-provider-home netease-discovery-home" aria-label="网易云音乐发现内容">
      {primaryTile ? <section className="discovery-section netease-discovery-features" aria-label="网易云推荐服务">
        <div className="netease-discovery-feature-grid">
          <NeteaseFeatureCard tile={primaryTile} />
          <div className="netease-discovery-primary-preview" aria-label={`${primaryTitle}预览`}>
            {primarySongs.slice(0, 4).map((song, index) => (
              <NeteaseSongRow
                song={song}
                songs={primarySongs}
                index={index}
                sourceTitle={primaryTitle}
                isCurrent={song.id === currentSongId}
                isPreview
                onPlaySong={onPlaySong}
                key={getSongIdentity(song)}
              />
            ))}
          </div>
        </div>
      </section> : null}

      {releaseStatus ? (
        <DiscoveryAlbumSection
          headingId="netease-discovery-new-albums-heading"
          albums={newAlbums}
          status={releaseStatus}
          onSelectAlbum={onSelectAlbum}
          onPlayAlbum={onPlayAlbum}
          albumLoadingById={albumLoadingById}
        />
      ) : null}

      {frequentArtistAlbumsStatus
        && (frequentArtistAlbums.length > 0 || frequentArtistAlbumsStatus.isLoading) ? (
          <DiscoveryAlbumSection
            headingId="netease-discovery-frequent-artist-albums-heading"
            title="常听歌手专辑"
            description="欧包音乐 · 基于本地收听记录生成"
            className="discovery-frequent-artist-albums"
            albums={frequentArtistAlbums}
            limit={6}
            status={frequentArtistAlbumsStatus}
            loadingLabel="正在整理常听歌手专辑"
            emptyMessage=""
            onSelectAlbum={onSelectAlbum}
            onPlayAlbum={onPlayAlbum}
            albumLoadingById={albumLoadingById}
          />
        ) : null}

      <NeteaseSongSection
        headingId="netease-discovery-daily-songs-heading"
        title="每日推荐"
        className="netease-discovery-daily-songs"
        songs={dailySongs}
        status={dailyStatus}
        emptyMessage={recommendationFeed?.loggedIn
          ? '今日暂无可用的每日推荐歌曲'
          : ''}
        currentSongId={currentSongId}
        onPlaySongs={onPlaySongs}
        onPlaySong={onPlaySong}
        onRefresh={onRefreshDaily}
      />

      {recommendationHistoryStatus
        && (recommendationHistorySongs.length > 0 || recommendationHistoryStatus.isLoading) ? (
          <NeteaseSongSection
            headingId="netease-discovery-history-songs-heading"
            title="历史日推"
            description="网易云音乐 · 历史每日推荐"
            className="netease-discovery-history-songs"
            songs={recommendationHistorySongs}
            status={recommendationHistoryStatus}
            emptyMessage=""
            currentSongId={currentSongId}
            headerControl={recommendationHistoryDates.length > 0 ? (
              <HistoryDateSelect
                dates={recommendationHistoryDates}
                value={recommendationHistoryDate ?? recommendationHistoryDates[0]}
                disabled={recommendationHistoryStatus.isLoading}
                onChange={onSelectHistoryDate}
                formatDate={formatHistoryDate}
              />
            ) : null}
            onPlaySongs={onPlaySongs}
            onPlaySong={onPlaySong}
            onRefresh={onRefreshHistory}
          />
        ) : null}

      {(continueSongs.length > 0 || continueStatus.isLoading || continueStatus.errorMessage) ? (
        <NeteaseSongSection
          headingId="netease-discovery-continue-heading"
          title="继续探索"
          className="netease-discovery-continue"
          songs={continueSongs}
          status={continueStatus}
          emptyMessage="当前暂无可继续探索的歌曲"
          currentSongId={currentSongId}
          onPlaySongs={onPlaySongs}
          onPlaySong={onPlaySong}
        />
      ) : null}

      {longTimeNoListenSongs.length > 0 ? (
        <NeteaseSongSection
          headingId="netease-discovery-long-time-no-listen-heading"
          title="很久没听"
          className="netease-discovery-long-time-no-listen"
          songs={longTimeNoListenSongs}
          status={{ isLoading: false, errorMessage: null }}
          emptyMessage=""
          currentSongId={currentSongId}
          onPlaySongs={onPlaySongs}
          onPlaySong={onPlaySong}
        />
      ) : null}

      {homepageBlockStatus ? (
        homepageSongBlocks.length > 0 ? homepageSongBlocks.map((block) => (
          <NeteaseSongSection
            headingId={`netease-homepage-block-${block.id}`}
            title={block.title}
            className="netease-discovery-homepage-block-songs"
            songs={block.songs}
            status={homepageBlockStatus}
            emptyMessage="当前暂无可用的专题歌曲"
            currentSongId={currentSongId}
            onPlaySongs={onPlaySongs}
            onPlaySong={onPlaySong}
            key={block.id}
          />
        )) : (
          <NeteaseSongSection
            headingId="netease-homepage-block-songs-heading"
            title="多元旋律之旅"
            className="netease-discovery-homepage-block-songs"
            songs={[]}
            status={homepageBlockStatus}
            emptyMessage="当前暂无可用的专题歌曲"
            currentSongId={currentSongId}
            onPlaySongs={onPlaySongs}
            onPlaySong={onPlaySong}
          />
        )
      ) : null}

      <NeteaseSongSection
        headingId="netease-discovery-new-songs-heading"
        title="最新音乐"
        className="netease-discovery-new-songs"
        songs={newSongs}
        status={newStatus}
        emptyMessage="当前暂无可用的新歌推荐"
        currentSongId={currentSongId}
        onPlaySongs={onPlaySongs}
        onPlaySong={onPlaySong}
        onRefresh={onRefreshNew}
      />
    </div>
  );
}

function NeteaseFeatureCard({ tile }: { tile: NeteaseFeatureTile }) {
  const previewSongs = tile.previewSongs.slice(0, 3);
  const palette = useCoverPalette(
    tile.coverTone,
    tile.coverUrl
  );
  const cardStyle = {
    '--netease-feature-primary': palette.primary,
    '--netease-feature-secondary': palette.secondary
  } as CSSProperties;

  return (
    <article className="netease-discovery-feature-card netease-discovery-feature-card-interactive" style={cardStyle}>
      <CoverActionSurface
        className="netease-discovery-feature-action"
        openClassName="netease-discovery-feature-open"
        openLabel={`打开${tile.title}`}
        onOpen={tile.onOpen}
        playClassName="netease-discovery-feature-play"
        playLabel={`播放${tile.title}`}
        onPlay={tile.onPlay}
      >
        <DiscoveryArtwork
          className="netease-discovery-feature-artwork"
          coverUrl={tile.coverUrl}
          label={tile.title}
          providerId="netease"
          eager
        />
        <span className="netease-discovery-feature-palette" aria-hidden="true" />
        <span className="netease-discovery-feature-copy" aria-hidden="true">
          <strong>{tile.title}</strong>
          <small>{tile.subtitle}</small>
        </span>
        <span className="netease-discovery-feature-reveal" aria-hidden="true">
          <span className="netease-discovery-feature-preview-list">
            {previewSongs.map((song, index) => (
              <span className="netease-discovery-feature-preview-song" key={getSongIdentity(song)}>
                <b>{index + 1}</b>
                <span title={song.title}>{song.title}</span>
              </span>
            ))}
          </span>
        </span>
      </CoverActionSurface>
    </article>
  );
}

interface NeteaseSongSectionProps {
  headingId: string;
  title: string;
  description?: string;
  className: string;
  songs: readonly Song[];
  status: DiscoverySectionStatus;
  emptyMessage: string;
  currentSongId?: string;
  onPlaySongs?: (songs: readonly Song[], sourceTitle: string) => void;
  onPlaySong?: (song: Song, songs: readonly Song[], sourceTitle: string) => void;
  onRefresh?: () => void;
  headerControl?: ReactNode;
}

function NeteaseSongSection({
  headingId,
  title,
  description,
  className,
  songs,
  status,
  emptyMessage,
  currentSongId,
  onPlaySongs,
  onPlaySong,
  onRefresh,
  headerControl
}: NeteaseSongSectionProps) {
  const visibleSongs = useMemo(() => songs.slice(0, NETEASE_SONG_SECTION_COUNT), [songs]);

  return (
    <section
      className={`discovery-section netease-discovery-songs ${className}`}
      aria-labelledby={headingId}
    >
      <DiscoverySectionHeader
        headingId={headingId}
        title={title}
        description={description}
        control={headerControl}
        actions={[
          {
            label: '播放全部',
            icon: 'play',
            onClick: onPlaySongs && songs.length > 0 ? () => onPlaySongs(songs, title) : undefined,
            disabled: songs.length === 0
          },
          ...(onRefresh ? [{
            label: status.isLoading
              ? `正在刷新${title}`
              : status.errorMessage
                ? `重试${title}`
                : `刷新${title}`,
            icon: 'refresh' as const,
            onClick: onRefresh,
            disabled: status.isLoading,
            isLoading: status.isLoading
          }] : [])
        ]}
      />
      <DiscoverySectionState
        {...status}
        isEmpty={songs.length === 0}
        loadingLabel={`正在加载${title}`}
        loadingPlaceholder={<NeteaseSongsLoadingPlaceholder />}
        emptyMessage={emptyMessage}
      >
        <div className="netease-discovery-song-grid">
          {visibleSongs.map((song, index) => (
            <NeteaseSongRow
              song={song}
              songs={songs}
              index={index}
              sourceTitle={title}
              isCurrent={song.id === currentSongId}
              onPlaySong={onPlaySong}
              key={getSongIdentity(song)}
            />
          ))}
        </div>
      </DiscoverySectionState>
    </section>
  );
}

const NeteaseSongRow = memo(function NeteaseSongRow({
  song,
  songs,
  index,
  sourceTitle,
  isCurrent,
  isPreview = false,
  onPlaySong
}: {
  song: Song;
  songs: readonly Song[];
  index: number;
  sourceTitle: string;
  isCurrent: boolean;
  isPreview?: boolean;
  onPlaySong?: (song: Song, songs: readonly Song[], sourceTitle: string) => void;
}) {
  const album = song.album.trim();

  return (
    <article className={[
      'netease-discovery-song-row',
      isPreview ? 'netease-discovery-song-row-preview' : '',
      isCurrent ? 'netease-discovery-song-row-current' : ''
    ].filter(Boolean).join(' ')}>
      <button
        className="netease-discovery-song-open"
        type="button"
        disabled={!onPlaySong}
        aria-current={isCurrent ? 'true' : undefined}
        title={`双击播放：${song.title}`}
        aria-label={`${isPreview ? '预览播放歌曲' : '播放歌曲'}：${song.title} - ${song.artist}`}
        onDoubleClick={onPlaySong ? () => onPlaySong(song, songs, sourceTitle) : undefined}
      >
        <span className="netease-discovery-song-index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <DiscoveryArtwork
          className="netease-discovery-song-artwork"
          coverUrl={song.coverUrl}
          label={song.title}
          providerId="netease"
        />
        <span className="netease-discovery-song-copy">
          <strong title={song.title}>{song.title}</strong>
          <small title={album ? `${song.artist} · ${album}` : song.artist}>
            {song.artist}{album ? ` · ${album}` : ''}
          </small>
        </span>
        <span className="netease-discovery-song-play-indicator" aria-hidden="true">
          <Play size={15} fill="currentColor" />
        </span>
        <span className="netease-discovery-song-duration" aria-hidden="true">
          {formatDuration(song.durationMs)}
        </span>
      </button>
    </article>
  );
});

function NeteaseSongsLoadingPlaceholder() {
  return (
    <div className="netease-discovery-song-grid discovery-skeleton-layout">
      {Array.from({ length: NETEASE_SONG_SECTION_COUNT }, (_, index) => (
        <article className="netease-discovery-song-row" key={index}>
          <span className="netease-discovery-song-index discovery-skeleton-line" />
          <span className="netease-discovery-song-artwork discovery-skeleton-cover" />
          <span className="netease-discovery-song-copy">
            <span className="discovery-skeleton-line discovery-skeleton-line-title" />
            <span className="discovery-skeleton-line discovery-skeleton-line-meta" />
          </span>
        </article>
      ))}
    </div>
  );
}

function uniqueSongs(songs: readonly Song[]): Song[] {
  const selected: Song[] = [];
  const identities = new Set<string>();

  for (const song of songs) {
    const identity = getSongIdentity(song);
    if (!identities.has(identity)) {
      identities.add(identity);
      selected.push(song);
    }
  }

  return selected;
}

function getAcceptedHomepageBlocks(blocks: readonly unknown[]): HomepageBlock[] {
  return blocks.filter(isAcceptedHomepageBlock);
}

function isAcceptedHomepageBlock(value: unknown): value is HomepageBlock {
  if (!isObjectRecord(value) || (value.kind !== 'song' && value.kind !== 'topic')) {
    return false;
  }
  if (typeof value.id !== 'string' || !value.id || typeof value.title !== 'string' || !value.title) {
    return false;
  }

  if (value.kind === 'song') {
    return Array.isArray(value.songs) && value.songs.every(isNeteaseSong);
  }

  return typeof value.coverTone === 'string' && Boolean(value.coverTone);
}

function isHomepageSongBlock(block: HomepageBlock): block is Extract<HomepageBlock, { kind: 'song' }> {
  return block.kind === 'song';
}

function isNeteaseSong(value: unknown): value is Song {
  return isObjectRecord(value)
    && value.providerId === 'netease'
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.artist === 'string'
    && typeof value.album === 'string'
    && typeof value.durationMs === 'number';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getSongIdentity(song: Song): string {
  return `${song.providerId}:${song.platformSongId ?? song.id}`;
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '--:--';
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatHistoryDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}
