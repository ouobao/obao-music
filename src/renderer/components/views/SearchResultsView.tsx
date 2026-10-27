import { useEffect, useRef } from 'react';
import type { SearchEntitySection } from '../../../shared/providerTypes';
import { useSearchStore, isRemoteProviderId } from '../../state/searchStore';
import { useProviderSessionStore } from '../../state/providerSessionStore';
import { SongTable } from '../../components/SongTable';
import { MediaCardGrid, type MediaCardData, EmptyState } from '../../components/MediaCards';
import { SkeletonBlock, SkeletonCardGrid, SkeletonSongRow } from '../../components/Skeleton';
import { useUiStore } from '../../state/uiStore';

interface SearchResultsViewProps {
  keyword: string;
}

const TABS = [
  { key: 'overview', label: '综合' },
  { key: 'song', label: '单曲' },
  { key: 'artist', label: '歌手' },
  { key: 'album', label: '专辑' },
  { key: 'playlist', label: '歌单' }
] as const;

export function SearchResultsView({ keyword }: SearchResultsViewProps) {
  const search = useSearchStore((s) => s.search);
  const songs = useSearchStore((s) => s.songs);
  const resultProviderId = useSearchStore((s) => s.providerId);
  const entityResults = useSearchStore((s) => s.entityResults);
  const activeResultView = useSearchStore((s) => s.activeResultView);
  const setActiveResultView = useSearchStore((s) => s.setActiveResultView);
  const isLoading = useSearchStore((s) => s.isLoading);
  const isLoadingMore = useSearchStore((s) => s.isLoadingMore);
  const errorMessage = useSearchStore((s) => s.errorMessage);
  const entityErrorMessage = useSearchStore((s) => s.entityErrorMessage);
  const hasMoreSongs = useSearchStore((s) => s.hasMoreSongs);
  const loadMore = useSearchStore((s) => s.loadMore);
  const activeProviderId = useProviderSessionStore((s) => s.activeProviderId);
  const navigateToView = useUiStore((s) => s.navigateToView);
  const lastRequestRef = useRef('');

  useEffect(() => {
    const requestKey = `${activeProviderId}:${keyword.trim()}`;
    if (requestKey === lastRequestRef.current) return;
    lastRequestRef.current = requestKey;
    search(activeProviderId, keyword);
  }, [keyword, activeProviderId, search]);

  const remoteResultProvider = entityResults?.providerId ?? (isRemoteProviderId(resultProviderId) ? resultProviderId : null);
  const artistSection = entityResults?.sections.artists;
  const albumSection = entityResults?.sections.albums;
  const playlistSection = entityResults?.sections.playlists;

  const artistCards: MediaCardData[] = remoteResultProvider
    ? (artistSection?.items ?? []).map((artist) => ({
        id: artist.id,
        title: artist.name,
        subtitle: artist.aliases?.join(' / ') ?? artist.sourceLabel ?? '',
        coverUrl: artist.imageUrl,
        coverTone: artist.coverTone,
        onOpen: () => navigateToView('artist', { providerId: remoteResultProvider, artistId: artist.id, title: artist.name })
      }))
    : [];

  const albumCards: MediaCardData[] = remoteResultProvider
    ? (albumSection?.items ?? []).map((album) => ({
        id: album.id,
        title: album.title,
        subtitle: [album.artistName, album.releaseDate?.slice(0, 4)].filter(Boolean).join(' · '),
        coverUrl: album.coverUrl,
        coverTone: album.coverTone,
        onOpen: () => navigateToView('album', { providerId: remoteResultProvider, albumId: album.id, title: album.title })
      }))
    : [];

  const playlistCards: MediaCardData[] = remoteResultProvider
    ? (playlistSection?.items ?? []).map((playlist) => ({
        id: playlist.id,
        title: playlist.title,
        subtitle: playlist.creatorName ?? playlist.sourceLabel ?? '',
        coverUrl: playlist.coverUrl,
        coverTone: playlist.coverTone,
        playCount: playlist.playCount,
        onOpen: () => navigateToView('playlist', { providerId: remoteResultProvider, playlistId: playlist.id, title: playlist.title })
      }))
    : [];

  const hasMoreEntities = Boolean(entityResults && Object.values(entityResults.sections).some((section) => section.available && section.hasMore));
  const activeEntityHasMore =
    activeResultView === 'artist'
      ? Boolean(artistSection && artistSection.available && artistSection.hasMore)
      : activeResultView === 'album'
        ? Boolean(albumSection && albumSection.available && albumSection.hasMore)
        : activeResultView === 'playlist'
          ? Boolean(playlistSection && playlistSection.available && playlistSection.hasMore)
          : false;
  const canLoadMore =
    activeResultView === 'song'
      ? hasMoreSongs
      : activeResultView === 'artist' || activeResultView === 'album' || activeResultView === 'playlist'
        ? activeEntityHasMore
        : hasMoreSongs || hasMoreEntities;
  const totalVisible = songs.length + artistCards.length + albumCards.length + playlistCards.length;

  // "综合"只展示每类前 N 条，计数必须按实际渲染数量算，
  // 否则会出现"已显示 120 条"但页面只有 50 条的错觉。
  const overviewVisibleCount =
    songs.length +
    Math.min(8, artistCards.length) +
    Math.min(6, albumCards.length) +
    Math.min(6, playlistCards.length);
  const displayedCount =
    activeResultView === 'overview'
      ? overviewVisibleCount
      : activeResultView === 'song'
        ? songs.length
        : activeResultView === 'artist'
          ? artistCards.length
          : activeResultView === 'album'
            ? albumCards.length
            : playlistCards.length;
  const countLabel = activeResultView === 'overview'
    ? `本页展示 ${displayedCount} 条`
    : `共 ${displayedCount} 条结果`;

  return (
    <div aria-busy={Boolean(isLoading)} data-reveal data-reveal-order={0}>
      <div className="search-hero">
        <div className="search-hero-main">
          <span className="page-kicker">搜索结果</span>
          <h1 className="search-hero-title">
            “<em>{keyword}</em>”
          </h1>
        </div>
        <span className="search-count-chip">{countLabel}</span>
      </div>

      <div className="filter-pills-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`pill-item ${activeResultView === tab.key ? 'active' : ''}`}
            onClick={() => setActiveResultView(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div key={activeResultView} className="tab-panel-enter">
      {isLoading && <SearchSkeleton view={activeResultView} />}
      {!isLoading && errorMessage && <EmptyState title="搜索失败" desc={errorMessage} />}

      {!isLoading && !errorMessage && activeResultView === 'overview' && (
        <div>
          {songs.length > 0 && (
            <SectionBlock title="单曲" count={songs.length}>
              <SongTable songs={songs} origin={{ kind: 'search', providerId: resultProviderId }} />
            </SectionBlock>
          )}
          {artistCards.length > 0 && (
            <SectionBlock title="歌手" count={artistCards.length}>
              <ArtistCardGrid cards={artistCards.slice(0, 8)} />
            </SectionBlock>
          )}
          {albumCards.length > 0 && (
            <SectionBlock title="专辑" count={albumCards.length}>
              <MediaCardGrid cards={albumCards.slice(0, 6)} />
            </SectionBlock>
          )}
          {playlistCards.length > 0 && (
            <SectionBlock title="歌单" count={playlistCards.length}>
              <MediaCardGrid cards={playlistCards.slice(0, 6)} />
            </SectionBlock>
          )}
          {totalVisible === 0 && (
            <EmptyState title="未找到相关结果" desc={`没有找到与 “${keyword}” 相关的内容，请尝试其他关键词`} />
          )}
          {entityErrorMessage && songs.length > 0 && (
            <div className="search-inline-notice">歌手、专辑或歌单结果暂时不可用：{entityErrorMessage}</div>
          )}
        </div>
      )}

      {!isLoading && !errorMessage && activeResultView === 'song' && (
        songs.length > 0 ? <SongTable songs={songs} origin={{ kind: 'search', providerId: resultProviderId }} /> : <EmptyState title="暂无单曲结果" />
      )}
      {!isLoading && !errorMessage && activeResultView === 'artist' && (
        <EntityResult
          section={artistSection}
          isLocal={resultProviderId === 'local'}
          requestError={entityErrorMessage}
          emptyTitle="暂无歌手结果"
          unsupportedTitle="当前音乐来源不支持歌手搜索"
        >
          <ArtistCardGrid cards={artistCards} />
        </EntityResult>
      )}
      {!isLoading && !errorMessage && activeResultView === 'album' && (
        <EntityResult
          section={albumSection}
          isLocal={resultProviderId === 'local'}
          requestError={entityErrorMessage}
          emptyTitle="暂无专辑结果"
          unsupportedTitle="当前音乐来源不支持专辑搜索"
        >
          <MediaCardGrid cards={albumCards} />
        </EntityResult>
      )}
      {!isLoading && !errorMessage && activeResultView === 'playlist' && (
        <EntityResult
          section={playlistSection}
          isLocal={resultProviderId === 'local'}
          requestError={entityErrorMessage}
          emptyTitle="暂无歌单结果"
          unsupportedTitle="当前音乐来源不支持歌单搜索"
        >
          <MediaCardGrid cards={playlistCards} />
        </EntityResult>
      )}

      {!isLoading && !errorMessage && canLoadMore && (
        <div className="search-load-more">
          <button className="section-action-btn" disabled={isLoadingMore} onClick={loadMore}>
            {isLoadingMore ? '加载中...' : '加载更多'}
          </button>
          {isLoadingMore && (
            activeResultView === 'artist' || activeResultView === 'album' || activeResultView === 'playlist' ? (
              <SkeletonCardGrid count={6} />
            ) : (
              <SkeletonSongRow rows={3} />
            )
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function SearchSkeleton({ view }: { view: 'overview' | 'song' | 'artist' | 'album' | 'playlist' }) {
  if (view === 'artist') {
    return (
      <div className="artist-card-grid" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div className="artist-card" key={i}>
            <SkeletonBlock width={100} height={100} radius="50%" />
            <SkeletonBlock width={80} height={14} radius="var(--radius-xs)" />
          </div>
        ))}
      </div>
    );
  }
  if (view === 'album' || view === 'playlist') {
    return <SkeletonCardGrid count={6} />;
  }
  if (view === 'song') {
    return <SkeletonSongRow rows={5} />;
  }
  return (
    <div>
      <SkeletonSongRow rows={5} />
      <div style={{ height: 28 }} />
      <SkeletonCardGrid count={6} />
      <div style={{ height: 28 }} />
      <SkeletonCardGrid count={6} />
    </div>
  );
}

function EntityResult<T>({
  section,
  isLocal,
  requestError,
  emptyTitle,
  unsupportedTitle,
  children
}: {
  section?: SearchEntitySection<T>;
  isLocal: boolean;
  requestError: string | null;
  emptyTitle: string;
  unsupportedTitle: string;
  children: React.ReactNode;
}) {
  if (isLocal || section?.available === false) {
    return <EmptyState title={unsupportedTitle} desc={section?.errorMessage ?? '请切换到支持该类型搜索的在线音乐来源'} />;
  }
  const sectionError = section?.errorMessage ?? requestError;
  if (sectionError) return <EmptyState title="此类结果加载失败" desc={sectionError} />;
  if (!section || section.items.length === 0) return <EmptyState title={emptyTitle} />;
  return <>{children}</>;
}

function SectionBlock({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="search-section-block">
      <div className="section-header">
        <div className="section-title-group">
          <h2 className="section-main-title">{title}</h2>
          <span className="section-sub-title">{count} 条结果</span>
        </div>
      </div>
      {children}
    </section>
  );
}

function ArtistCardGrid({ cards }: { cards: MediaCardData[] }) {
  return (
    <div className="artist-card-grid">
      {cards.map((card) => (
        <button className="artist-card" key={card.id} onClick={card.onOpen}>
          {card.coverUrl ? (
            <img className="artist-avatar" src={card.coverUrl} alt={card.title} />
          ) : (
            <div
              className="artist-avatar artist-avatar--fallback"
              style={{ background: card.coverTone || 'var(--bg-card)' }}
              aria-hidden="true"
            >
              {card.title.slice(0, 1)}
            </div>
          )}
          <span className="artist-name">{card.title}</span>
        </button>
      ))}
    </div>
  );
}
