import { Disc3, Play } from 'lucide-react';
import { memo, useMemo } from 'react';
import type { AlbumSummary, RecommendationHomeFeed, Song } from '../../../shared/musicTypes';
import { DiscoveryArtwork } from './DiscoveryArtwork';
import { CoverActionSurface } from './CoverActionSurface';
import { DiscoveryAlbumSection } from './DiscoveryAlbumSection';
import { DiscoverySectionHeader } from './DiscoverySectionHeader';
import {
  DiscoverySectionState,
  type DiscoverySectionStatus
} from './DiscoverySectionState';

const QQ_NEW_SONG_COUNT = 12;

export interface QQDiscoveryHomeProps {
  nickname?: string;
  isLoggedIn: boolean;
  recommendationFeed: RecommendationHomeFeed | null;
  currentSongId?: string;
  recommendationStatus: DiscoverySectionStatus;
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
  onSelectAlbum?: (album: AlbumSummary) => void;
  onPlayAlbum?: (album: AlbumSummary) => void;
  albumLoadingById?: Readonly<Record<string, boolean>>;
}

export function QQDiscoveryHome({
  nickname,
  isLoggedIn,
  recommendationFeed,
  currentSongId,
  recommendationStatus,
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
  onSelectAlbum,
  onPlayAlbum,
  albumLoadingById
}: QQDiscoveryHomeProps) {
  const newSongs = useMemo(
    () => uniqueSongs(recommendationFeed?.newSongs ?? []),
    [recommendationFeed?.newSongs]
  );

  return (
    <div className="discovery-provider-home qq-discovery-home" aria-label="QQ 音乐发现内容">
      <section
        className="discovery-section qq-discovery-recommendations"
        aria-labelledby="qq-discovery-recommendations-heading"
      >
        <header className="qq-discovery-greeting">
          <div>
            <span className="qq-discovery-provider-mark"><Disc3 size={15} aria-hidden="true" />QQ 音乐</span>
            <h2 id="qq-discovery-recommendations-heading">
              {nickname?.trim() ? `Hi，${nickname.trim()}，今天听点什么` : '今天听点什么'}
            </h2>
          </div>
          <small>{isLoggedIn ? 'QQ 账号已连接' : '未连接 QQ 账号'}</small>
        </header>

        <div className="qq-discovery-quick-start">
          <article className="qq-discovery-primary-card">
            <CoverActionSurface
              className="qq-discovery-primary-action"
              openClassName="qq-discovery-primary-open"
              openLabel="打开新歌推荐"
              onOpen={newSongs.length > 0 && onOpenCollection ? () => onOpenCollection('new') : undefined}
              playClassName="qq-discovery-primary-play"
              playLabel="播放新歌推荐"
              onPlay={newSongs.length > 0 && onPlaySongs ? () => onPlaySongs(newSongs, '新歌推荐') : undefined}
            >
              <DiscoveryArtwork
                className="qq-discovery-primary-artwork"
                coverUrl={newSongs[0]?.coverUrl}
                label="新歌推荐"
                providerId="qq"
                eager
              />
              <span className="qq-discovery-primary-copy">
                <strong>新歌推荐</strong>
                <span>{newSongs.length > 0 ? `${newSongs.length} 首新歌` : '正在准备新歌内容'}</span>
              </span>
            </CoverActionSurface>
          </article>
          <div className="qq-discovery-primary-preview" aria-label="新歌推荐预览">
            {newSongs.slice(0, 4).map((song, index) => (
              <QQNewSongRow
                song={song}
                songs={newSongs}
                sourceTitle="新歌推荐"
                index={index}
                isCurrent={song.id === currentSongId}
                isPreview
                onPlaySong={onPlaySong}
                key={getSongIdentity(song)}
              />
            ))}
          </div>
        </div>
      </section>

      {releaseStatus ? (
        <DiscoveryAlbumSection
          headingId="qq-discovery-new-albums-heading"
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
            headingId="qq-discovery-frequent-artist-albums-heading"
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

      {(continueSongs.length > 0 || continueStatus.isLoading || continueStatus.errorMessage) ? (
        <QQSongSection
          headingId="qq-discovery-continue-heading"
          title="继续探索"
          className="qq-discovery-continue"
          songs={continueSongs}
          status={continueStatus}
          emptyMessage="当前暂无可继续探索的歌曲"
          currentSongId={currentSongId}
          onPlaySongs={onPlaySongs}
          onPlaySong={onPlaySong}
        />
      ) : null}

      {longTimeNoListenSongs.length > 0 ? (
        <QQSongSection
          headingId="qq-discovery-long-time-no-listen-heading"
          title="很久没听"
          className="qq-discovery-long-time-no-listen"
          songs={longTimeNoListenSongs}
          status={{ isLoading: false, errorMessage: null }}
          emptyMessage=""
          currentSongId={currentSongId}
          onPlaySongs={onPlaySongs}
          onPlaySong={onPlaySong}
        />
      ) : null}

      <QQSongSection
        headingId="qq-discovery-new-songs-heading"
        title="新歌推荐"
        className="qq-discovery-new-songs"
        songs={newSongs}
        status={recommendationStatus}
        emptyMessage="当前暂无可用的新歌推荐"
        currentSongId={currentSongId}
        onPlaySongs={onPlaySongs}
        onPlaySong={onPlaySong}
      />
    </div>
  );
}

function QQSongSection({
  headingId,
  title,
  className,
  songs,
  status,
  emptyMessage,
  currentSongId,
  onPlaySongs,
  onPlaySong
}: {
  headingId: string;
  title: string;
  className: string;
  songs: readonly Song[];
  status: DiscoverySectionStatus;
  emptyMessage: string;
  currentSongId?: string;
  onPlaySongs?: (songs: readonly Song[], sourceTitle: string) => void;
  onPlaySong?: (song: Song, songs: readonly Song[], sourceTitle: string) => void;
}) {
  const visibleSongs = useMemo(() => songs.slice(0, QQ_NEW_SONG_COUNT), [songs]);

  return (
    <section className={`discovery-section ${className}`} aria-labelledby={headingId}>
      <DiscoverySectionHeader
        headingId={headingId}
        title={title}
        actions={[{
          label: '播放全部',
          icon: 'play',
          onClick: onPlaySongs && songs.length > 0
            ? () => onPlaySongs(songs, title)
            : undefined,
          disabled: songs.length === 0
        }]}
      />
      <DiscoverySectionState
        {...status}
        isEmpty={songs.length === 0}
        loadingLabel={`正在加载${title}`}
        loadingPlaceholder={<QQSongsLoadingPlaceholder />}
        emptyMessage={emptyMessage}
      >
        <div className="qq-discovery-new-song-grid">
          {visibleSongs.map((song, index) => (
            <QQNewSongRow
              song={song}
              songs={songs}
              sourceTitle={title}
              index={index}
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

const QQNewSongRow = memo(function QQNewSongRow({
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
    <article className={`qq-discovery-new-song-row${isCurrent ? ' qq-discovery-new-song-row-current' : ''}`}>
      <button
        className="qq-discovery-new-song-open"
        type="button"
        disabled={!onPlaySong}
        aria-current={isCurrent ? 'true' : undefined}
        title={`双击播放：${song.title}`}
        aria-label={`${isPreview ? '预览播放歌曲' : '播放歌曲'}：${song.title} - ${song.artist}`}
        onDoubleClick={onPlaySong ? () => onPlaySong(song, songs, sourceTitle) : undefined}
      >
        <span className="qq-discovery-new-song-index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <DiscoveryArtwork
          className="qq-discovery-new-song-artwork"
          coverUrl={song.coverUrl}
          label={song.title}
          providerId="qq"
        />
        <span className="qq-discovery-new-song-copy">
          <strong title={song.title}>{song.title}</strong>
          <small title={album ? `${song.artist} · ${album}` : song.artist}>
            {song.artist}{album ? ` · ${album}` : ''}
          </small>
        </span>
        <span className="qq-discovery-new-song-play" aria-hidden="true">
          <Play size={15} fill="currentColor" />
        </span>
      </button>
    </article>
  );
});

function QQSongsLoadingPlaceholder() {
  return (
    <div className="qq-discovery-new-song-grid discovery-skeleton-layout">
      {Array.from({ length: QQ_NEW_SONG_COUNT }, (_, index) => (
        <article className="qq-discovery-new-song-row" key={index}>
          <span className="qq-discovery-new-song-index discovery-skeleton-line" />
          <span className="qq-discovery-new-song-artwork discovery-skeleton-cover" />
          <span className="qq-discovery-new-song-copy">
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

function getSongIdentity(song: Song): string {
  return `${song.providerId}:${song.platformSongId ?? song.id}`;
}
