import type { CSSProperties } from 'react';
import type { AlbumSummary } from '../../../shared/musicTypes';
import { useCoverCardDepth } from '../../hooks/useCoverCardDepth';
import { CoverActionSurface } from './CoverActionSurface';
import { DiscoverySectionHeader } from './DiscoverySectionHeader';
import {
  DiscoverySectionState,
  type DiscoverySectionStatus
} from './DiscoverySectionState';
import { LazyCoverImage } from './LazyCoverImage';

interface DiscoveryAlbumSectionProps {
  headingId: string;
  albums: readonly AlbumSummary[];
  status: DiscoverySectionStatus;
  title?: string;
  description?: string;
  className?: string;
  limit?: number;
  loadingLabel?: string;
  emptyMessage?: string;
  onSelectAlbum?: (album: AlbumSummary) => void;
  onPlayAlbum?: (album: AlbumSummary) => void;
  albumLoadingById?: Readonly<Record<string, boolean>>;
}

export function DiscoveryAlbumSection({
  headingId,
  albums,
  status,
  title = '新碟速递',
  description,
  className = 'discovery-new-albums',
  limit = 12,
  loadingLabel = '正在加载新碟速递',
  emptyMessage = '当前暂无可用的新碟',
  onSelectAlbum,
  onPlayAlbum,
  albumLoadingById = {}
}: DiscoveryAlbumSectionProps) {
  const { handleDepthPointerLeave, handleDepthPointerMove } = useCoverCardDepth();

  return (
    <section className={`discovery-section ${className}`} aria-labelledby={headingId}>
      <DiscoverySectionHeader
        headingId={headingId}
        title={title}
        description={description}
        actions={[]}
      />
      <DiscoverySectionState
        {...status}
        isEmpty={albums.length === 0}
        loadingLabel={loadingLabel}
        loadingPlaceholder={<DiscoveryAlbumLoadingPlaceholder />}
        emptyMessage={emptyMessage}
      >
        <div className="discovery-album-grid" role="list">
          {albums.slice(0, limit).map((album) => (
            <article className="discovery-album-item playlist-discovery-card" role="listitem" key={album.id}>
              <CoverActionSurface
                className="discovery-album-action playlist-discovery-card-action"
                openClassName="discovery-album-open playlist-discovery-card-open"
                openLabel={`打开专辑：${album.title}`}
                onOpen={onSelectAlbum ? () => onSelectAlbum(album) : undefined}
                playClassName="discovery-album-play playlist-discovery-card-play"
                playLabel={`播放专辑：${album.title}`}
                onPlay={onPlayAlbum ? () => onPlayAlbum(album) : undefined}
                isPlaying={Boolean(albumLoadingById[album.id])}
              >
                <span
                  className="discovery-album-cover playlist-discovery-card-cover playlist-discovery-card-scene"
                  style={{
                    '--cover-tone': album.coverTone
                  } as CSSProperties}
                  onPointerMove={handleDepthPointerMove}
                  onPointerLeave={handleDepthPointerLeave}
                  aria-hidden="true"
                >
                  <LazyCoverImage className="playlist-discovery-card-image" coverUrl={album.coverUrl} />
                  <span className="playlist-discovery-card-sheen" />
                </span>
                <span className="discovery-album-copy playlist-discovery-card-copy">
                  <h2 title={album.title}>{album.title}</h2>
                  <small title={album.artistName}>{album.artistName}</small>
                  <span>{formatAlbumMeta(album)}</span>
                </span>
              </CoverActionSurface>
            </article>
          ))}
        </div>
      </DiscoverySectionState>
    </section>
  );
}

function DiscoveryAlbumLoadingPlaceholder() {
  return (
    <div className="discovery-album-grid discovery-skeleton-layout" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <article className="discovery-album-item" key={index}>
          <span className="discovery-album-cover discovery-skeleton-cover" />
          <span className="discovery-album-copy">
            <span className="discovery-skeleton-line discovery-skeleton-line-title" />
            <span className="discovery-skeleton-line discovery-skeleton-line-meta" />
          </span>
        </article>
      ))}
    </div>
  );
}

function formatAlbumMeta(album: AlbumSummary): string {
  return [album.releaseDate?.slice(0, 4), album.trackCount !== undefined ? `${album.trackCount} 首` : '', album.albumType]
    .filter(Boolean)
    .join(' · ') || '专辑';
}
