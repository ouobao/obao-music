import { type CSSProperties, type UIEvent, useEffect, useRef, useState } from 'react';
import { ChevronRight, Play } from 'lucide-react';
import type {
  AlbumReference,
  AlbumSummary,
  ArtistReference,
  ArtistSummary,
  DiscoveredPlaylist,
  ProviderId,
  RemoteProviderId,
  Song,
  SourceContext
} from '../../shared/musicTypes';
import type { SearchEntityResults, SearchEntitySection, SearchEntityType } from '../../shared/providerTypes';
import { useFixedVirtualWindow } from '../hooks/useFixedVirtualWindow';
import { useAppNotificationValue } from '../hooks/useAppNotificationValue';
import { usePlayerStore } from '../state/playerStore';
import type { SearchResultView } from '../state/searchStore';
import { formatSourceContextLabel } from '../utils/providerDisplay';
import { ProviderSegmentedControl } from './ProviderSegmentedControl';
import { SongListVisualScrollbar } from './SongListVisualScrollbar';
import { RemoteSongRowActions } from './RemoteSongRowActions';
import { SongAlbumLink, SongArtistLinks } from './SongEntityLinks';
import type { SongMenuPosition } from './SongRowActions';

const searchSongRowHeight = 50;
const searchSongListFallbackHeight = 520;
const searchSongListOverscan = 6;

interface SearchResultsViewProps {
  keyword: string;
  providerId: ProviderId | null;
  results: Song[];
  entityResults?: SearchEntityResults | null;
  activeResultView?: SearchResultView;
  isLoadingMore?: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  onProviderChange?: (providerId: RemoteProviderId) => void;
  onSelectArtist?: (artist: ArtistReference) => void;
  onSelectAlbum?: (album: AlbumReference) => void;
  onSelectPlaylist?: (playlist: DiscoveredPlaylist) => void;
  onResultViewChange?: (view: SearchResultView) => void;
  onLoadMore?: (entityType: SearchEntityType) => void;
  onPlaybackStarted?: (message: string) => void;
}

export function SearchResultsView({
  keyword,
  providerId,
  results,
  entityResults = null,
  activeResultView = 'overview',
  isLoadingMore = false,
  isLoading,
  errorMessage,
  onProviderChange,
  onSelectArtist,
  onSelectAlbum,
  onSelectPlaylist,
  onResultViewChange,
  onLoadMore,
  onPlaybackStarted
}: SearchResultsViewProps) {
  const enqueueSong = usePlayerStore((state) => state.enqueueSong);
  const enqueueNextSong = usePlayerStore((state) => state.enqueueNextSong);
  const playSongsFromList = usePlayerStore((state) => state.playSongsFromList);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const [activeMenu, setActiveMenu] = useState<{ songId: string; position: SongMenuPosition } | null>(null);
  const autoLoadOffsetRef = useRef<number | null>(null);
  const selectedProviderId = normalizeSearchProviderId(providerId);
  const visibleResults = entityResults?.sections.songs.items ?? results;
  const spotlightSearchKey = `${selectedProviderId}:${keyword.trim().toLocaleLowerCase()}`;
  const artistSpotlightRef = useRef<{ key: string; identity: ArtistSpotlightIdentity | null }>({
    key: spotlightSearchKey,
    identity: null
  });
  if (artistSpotlightRef.current.key !== spotlightSearchKey) {
    artistSpotlightRef.current = { key: spotlightSearchKey, identity: null };
  }
  if (!artistSpotlightRef.current.identity) {
    artistSpotlightRef.current.identity = createArtistSpotlightIdentity(
      keyword,
      visibleResults,
      entityResults?.sections.artists.items ?? []
    );
  }
  const artistSpotlight = createArtistSpotlight(artistSpotlightRef.current.identity, visibleResults);
  const isSearchExperience = entityResults !== null;
  const displayedSongResults = isSearchExperience && activeResultView === 'overview'
    ? visibleResults.slice(0, 6)
    : visibleResults;
  const songErrorMessage = errorMessage ?? entityResults?.sections.songs.errorMessage ?? null;
  const showSongSection = !isSearchExperience || activeResultView === 'overview' || activeResultView === 'song';
  const showArtistSection = isSearchExperience && (activeResultView === 'overview' || activeResultView === 'artist');
  const showAlbumSection = isSearchExperience && (activeResultView === 'overview' || activeResultView === 'album');
  const showPlaylistSection = isSearchExperience && (activeResultView === 'overview' || activeResultView === 'playlist');
  const shouldVirtualizeSongResults = isSearchExperience && activeResultView === 'song';
  const songWindow = useFixedVirtualWindow({
    enabled: shouldVirtualizeSongResults,
    itemCount: displayedSongResults.length,
    itemSize: searchSongRowHeight,
    overscan: searchSongListOverscan,
    fallbackViewportSize: searchSongListFallbackHeight,
    resetKey: `${keyword}:${providerId ?? 'local'}:${activeResultView}`
  });
  const renderedSongResults = shouldVirtualizeSongResults
    ? displayedSongResults.slice(songWindow.startIndex, songWindow.endIndex)
    : displayedSongResults;
  const renderedSongStartIndex = shouldVirtualizeSongResults ? songWindow.startIndex : 0;
  useAppNotificationValue({
    key: `search:${selectedProviderId}:songs`,
    message: songErrorMessage
  });

  function handlePlayAll() {
    playSongsFromList(visibleResults, 0, (song) => createSearchSourceContext(song, keyword));
  }

  function handleSongListScroll(event: UIEvent<HTMLDivElement>) {
    if (
      !isSearchExperience
      || activeResultView !== 'song'
      || !entityResults.sections.songs.hasMore
      || isLoadingMore
      || !onLoadMore
      || autoLoadOffsetRef.current === visibleResults.length
    ) {
      return;
    }

    const scrollHost = event.currentTarget;
    const remainingScrollDistance = scrollHost.scrollHeight - scrollHost.scrollTop - scrollHost.clientHeight;
    if (remainingScrollDistance > Math.max(200, scrollHost.clientHeight / 2)) {
      return;
    }

    autoLoadOffsetRef.current = visibleResults.length;
    onLoadMore?.('song');
  }

  useEffect(() => {
    setActiveMenu(null);
    autoLoadOffsetRef.current = null;
  }, [keyword, providerId, results]);

  return (
    <section
      className="search-results-view qq-search-view"
      aria-label="搜索结果"
      data-search-result-view={activeResultView}
    >
      <header className={artistSpotlight ? 'qq-search-hero qq-search-hero-artist' : 'qq-search-hero'}>
        {artistSpotlight?.artist && onSelectArtist ? (
          <button
            className="qq-search-summary qq-search-summary-link"
            type="button"
            aria-label={`打开歌手：${artistSpotlight.name}`}
            onClick={() => onSelectArtist(artistSpotlight.artist!)}
          >
            <ArtistSpotlightSummary spotlight={artistSpotlight} songCount={visibleResults.length} />
          </button>
        ) : (
          <div className="qq-search-summary">
            {artistSpotlight ? <ArtistSpotlightSummary spotlight={artistSpotlight} songCount={visibleResults.length} /> : (
              <div className="qq-search-heading">
                <h1>
                  <span className="qq-search-heading-label">搜索结果</span>
                  <span className="qq-search-query" title={keyword}>“{keyword}”</span>
                </h1>
              </div>
            )}
          </div>
        )}

        {isSearchExperience ? (
          <SearchResultTabs
            activeView={activeResultView}
            sections={entityResults.sections}
            onChange={onResultViewChange}
          />
        ) : <span className="qq-search-toolbar-spacer" aria-hidden="true" />}

        <ProviderSegmentedControl value={selectedProviderId} ariaLabel="搜索来源" onChange={onProviderChange} />
      </header>

      <div
        className={activeResultView === 'song'
          ? 'search-results-content search-results-content-song'
          : 'search-results-content search-results-scroll'}
      >
      {showSongSection ? (
      <section className="qq-search-panel search-results-panel" id="search-result-panel-song" aria-label="歌曲搜索结果">
        <header className="qq-search-section-header">
          <div className="qq-search-section-title">
            <h2>歌曲</h2>
            <span>
              {entityResults?.sections.songs.hasMore
                ? `已显示 ${visibleResults.length} / 共 ${entityResults.sections.songs.total} 首`
                : `${entityResults?.sections.songs.total ?? visibleResults.length} 首`}
            </span>
          </div>
          <div className="qq-search-actions" aria-label="搜索结果操作">
            <button
              className="qq-search-action-button"
              type="button"
              aria-label={entityResults?.sections.songs.hasMore ? '播放已加载的搜索结果' : '播放全部搜索结果'}
              disabled={visibleResults.length === 0}
              onClick={handlePlayAll}
            >
              <Play aria-hidden="true" size={15} fill="currentColor" />
              <span>{entityResults?.sections.songs.hasMore ? '播放已加载' : '播放全部'}</span>
            </button>
            {isSearchExperience && activeResultView === 'overview' && onResultViewChange && entityResults.sections.songs.total > displayedSongResults.length ? (
              <button
                className="qq-search-view-all-button"
                type="button"
                aria-label={`查看全部${entityResults.sections.songs.total}首歌曲`}
                onClick={() => onResultViewChange?.('song')}
              >
                <span>查看全部</span>
                <ChevronRight aria-hidden="true" size={15} />
              </button>
            ) : null}
            {isSearchExperience && activeResultView === 'song' && onLoadMore && entityResults.sections.songs.hasMore ? (
              <button
                className="qq-search-view-all-button"
                type="button"
                disabled={isLoadingMore}
                onClick={() => onLoadMore?.('song')}
              >
                {isLoadingMore ? '正在加载' : '加载更多'}
              </button>
            ) : null}
          </div>
        </header>

        {isLoading ? <p className="playlist-detail-message" role="status">正在搜索音乐</p> : null}
        {visibleResults.length > 0 ? (
          <div className="song-list-scroll-shell search-song-scroll-shell">
            <div className="qq-search-song-list-head">
              <span role="columnheader">歌名/歌手</span>
              <span role="columnheader">操作</span>
              <span role="columnheader">来源</span>
              <span role="columnheader">专辑</span>
              <span role="columnheader">时长</span>
            </div>
          <div
            className={activeResultView === 'song'
              ? 'qq-search-song-list search-results-list search-results-scroll'
              : 'qq-search-song-list search-results-list'}
            role="list"
            aria-label={`搜索结果：${keyword}`}
            ref={songWindow.scrollHostRef}
            onScroll={handleSongListScroll}
          >
            <div
              className={shouldVirtualizeSongResults ? 'qq-search-song-list-virtual-space' : undefined}
              style={shouldVirtualizeSongResults
                ? { height: `${songWindow.totalHeight}px`, minHeight: 0, position: 'relative' }
                : undefined}
            >
            <div
              className={shouldVirtualizeSongResults ? 'qq-search-song-list-window' : undefined}
              style={shouldVirtualizeSongResults
                ? {
                  display: 'grid',
                  insetInline: 0,
                  position: 'absolute',
                  top: 0,
                  transform: `translateY(${songWindow.offsetTop}px)`
                }
                : undefined}
            >
            {renderedSongResults.map((song, localIndex) => {
              const index = renderedSongStartIndex + localIndex;
              const sourceContext = createSearchSourceContext(song, keyword);
              const isMenuOpen = activeMenu?.songId === song.id;
              const isCurrentSong = song.id === currentSong?.id;
              const openSongMenu = (position: SongMenuPosition) => {
                setActiveMenu({ songId: song.id, position });
              };
              const closeSongMenu = () => {
                setActiveMenu((currentMenu) => (currentMenu?.songId === song.id ? null : currentMenu));
              };
              const playFromSong = () => {
                playSongsFromList(visibleResults, index, (song) => createSearchSourceContext(song, keyword));
              };
              const playFromDoubleClick = () => {
                playFromSong();
                onPlaybackStarted?.('已开始播放');
              };
              const enqueueFromSong = () => {
                enqueueSong(song, sourceContext);
              };

              return (
                <div
                  className="qq-search-song-list-item"
                  role="listitem"
                  style={shouldVirtualizeSongResults ? { height: `${searchSongRowHeight}px` } : undefined}
                  key={song.id}
                >
                  <div
                    className={isCurrentSong ? 'qq-search-song-row search-result-row song-row-current' : 'qq-search-song-row search-result-row'}
                    data-current={isCurrentSong ? 'true' : undefined}
                    data-song-id={song.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`加入队列：${song.title}`}
                    onClick={enqueueFromSong}
                    onDoubleClick={playFromDoubleClick}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
                        return;
                      }

                      event.preventDefault();
                      enqueueFromSong();
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openSongMenu({
                        x: event.clientX,
                        y: event.clientY
                      });
                    }}
                  >
                    <span
                      className="qq-search-song-cover"
                      style={
                        {
                          '--cover-tone': song.coverTone,
                          '--song-cover-image': song.coverUrl ? `url("${song.coverUrl}")` : 'linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))'
                        } as CSSProperties
                      }
                      aria-hidden="true"
                    />
                    <span className="qq-search-song-main">
                      <span className="qq-search-title-line">
                        <strong>{song.title}</strong>
                      </span>
                      <small><SongArtistLinks song={song} onSelectArtist={onSelectArtist} /></small>
                    </span>
                    <RemoteSongRowActions
                      song={song}
                      canLike={true}
                      menuOpen={isMenuOpen}
                      menuPosition={isMenuOpen ? activeMenu.position : null}
                      onPlay={playFromSong}
                      onPlayNext={() => {
                        enqueueNextSong(song, sourceContext);
                      }}
                      onOpenMenu={openSongMenu}
                      onCloseMenu={closeSongMenu}
                      onNotice={onPlaybackStarted}
                    />
                    <span className="qq-search-source">
                      <span className="source-pill song-source-pill">
                        {formatSourceContextLabel(sourceContext.providerId, sourceContext.type)}
                      </span>
                    </span>
                    <span className="qq-search-album">
                      <SongAlbumLink song={song} onSelectAlbum={onSelectAlbum} />
                    </span>
                    <span className="qq-search-duration">{formatDuration(song.durationMs)}</span>
                  </div>
                </div>
              );
            })}
            </div>
            </div>
          </div>
          <SongListVisualScrollbar scrollHostRef={songWindow.scrollHostRef} />
          </div>
        ) : null}

        {!isLoading && !songErrorMessage && visibleResults.length === 0 ? (
          <p className="playlist-detail-message">没有找到匹配的歌曲</p>
        ) : null}
      </section>
      ) : null}

      {showArtistSection && entityResults.sections.artists.available ? (
        <SearchEntitySection
          kind="artist"
          section={entityResults.sections.artists}
          overview={activeResultView === 'overview'}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          onSelectArtist={onSelectArtist}
          onLoadMore={onLoadMore}
          onViewAll={() => onResultViewChange?.('artist')}
        />
      ) : null}
      {showAlbumSection && entityResults.sections.albums.available ? (
        <SearchEntitySection
          kind="album"
          section={entityResults.sections.albums}
          overview={activeResultView === 'overview'}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          onSelectAlbum={onSelectAlbum}
          onLoadMore={onLoadMore}
          onViewAll={() => onResultViewChange?.('album')}
        />
      ) : null}
      {showPlaylistSection && entityResults.sections.playlists.available ? (
        <SearchEntitySection
          kind="playlist"
          section={entityResults.sections.playlists}
          overview={activeResultView === 'overview'}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          onSelectPlaylist={onSelectPlaylist}
          onLoadMore={onLoadMore}
          onViewAll={() => onResultViewChange?.('playlist')}
        />
      ) : null}
      </div>
    </section>
  );
}

interface SearchResultTabsProps {
  activeView: SearchResultView;
  sections: SearchEntityResults['sections'];
  onChange?: (view: SearchResultView) => void;
}

function SearchResultTabs({ activeView, sections, onChange }: SearchResultTabsProps) {
  const tabs: Array<{ view: SearchResultView; label: string; available: boolean; total?: number }> = [
    { view: 'overview', label: '综合', available: true },
    { view: 'song', label: '歌曲', available: sections.songs.available, total: sections.songs.total },
    { view: 'artist', label: '歌手', available: sections.artists.available, total: sections.artists.total },
    { view: 'album', label: '专辑', available: sections.albums.available, total: sections.albums.total },
    { view: 'playlist', label: '歌单', available: sections.playlists.available, total: sections.playlists.total }
  ];

  return (
    <div className="search-result-tabs" role="tablist" aria-label="搜索分类">
      {tabs.filter((tab) => tab.available).map((tab) => (
        <button
          className={activeView === tab.view ? 'search-result-tab search-result-tab-active' : 'search-result-tab'}
          type="button"
          role="tab"
          aria-label={tab.label}
          aria-selected={activeView === tab.view}
          aria-controls={tab.view === 'overview' ? undefined : `search-result-panel-${tab.view}`}
          key={tab.view}
          onClick={() => onChange?.(tab.view)}
        >
          <span>{tab.label}</span>
          {tab.total !== undefined ? <small aria-hidden="true">{tab.total}</small> : null}
        </button>
      ))}
    </div>
  );
}

interface SearchEntitySectionBaseProps {
  overview: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  onLoadMore?: (entityType: SearchEntityType) => void;
  onViewAll?: () => void;
}

type SearchEntitySectionProps = SearchEntitySectionBaseProps & (
  {
    kind: 'artist';
    section: SearchEntitySection<ArtistSummary>;
    onSelectArtist?: (artist: ArtistReference) => void;
  }
  | {
    kind: 'album';
    section: SearchEntitySection<AlbumSummary>;
    onSelectAlbum?: (album: AlbumReference) => void;
  }
  | {
    kind: 'playlist';
    section: SearchEntitySection<DiscoveredPlaylist>;
    onSelectPlaylist?: (playlist: DiscoveredPlaylist) => void;
  }
);

function SearchEntitySection(props: SearchEntitySectionProps) {
  const { kind, section, overview, isLoading, isLoadingMore, onLoadMore, onViewAll } = props;
  const visibleItems = overview ? section.items.slice(0, 6) : section.items;
  const label = formatSearchEntityKind(kind);
  useAppNotificationValue({
    key: `search:entity:${kind}`,
    message: section.errorMessage
  });
  const cards = (() => {
    switch (props.kind) {
      case 'artist': {
        const artists = overview ? props.section.items.slice(0, 6) : props.section.items;
        return artists.map((artist) => (
          <SearchArtistResultCard artist={artist} key={artist.id} onSelect={props.onSelectArtist} />
        ));
      }
      case 'album': {
        const albums = overview ? props.section.items.slice(0, 6) : props.section.items;
        return albums.map((album) => (
          <SearchAlbumResultCard album={album} key={album.id} onSelect={props.onSelectAlbum} />
        ));
      }
      case 'playlist': {
        const playlists = overview ? props.section.items.slice(0, 6) : props.section.items;
        return playlists.map((playlist) => (
          <SearchPlaylistResultCard playlist={playlist} key={playlist.id} onSelect={props.onSelectPlaylist} />
        ));
      }
    }
  })();

  return (
    <section
      className="search-entity-section"
      id={`search-result-panel-${kind}`}
      role="tabpanel"
      aria-label={`${label}搜索结果`}
      aria-busy={isLoading || undefined}
    >
      <header className="search-entity-section-header">
        <div className="search-entity-section-title">
          <h2>{label}</h2>
          <span>{section.total > 0 ? `${section.total} 项` : `${visibleItems.length} 项`}</span>
        </div>
        {overview && onViewAll && section.total > visibleItems.length ? (
          <button type="button" aria-label={`查看全部${section.total}项${label}`} onClick={onViewAll}>
            <span>查看全部</span>
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        ) : null}
      </header>
      {visibleItems.length > 0 ? (
        <div className={`search-entity-grid search-entity-grid-${kind}`}>
          {cards}
        </div>
      ) : null}
      {!isLoading && !section.errorMessage && visibleItems.length === 0 ? (
        <p className="playlist-detail-message">没有找到匹配的{label}</p>
      ) : null}
      {!overview && onLoadMore && section.hasMore ? (
        <div className="search-entity-load-more">
          <button type="button" disabled={isLoadingMore} onClick={() => onLoadMore?.(kind)}>
            {isLoadingMore ? '正在加载' : '加载更多'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SearchArtistResultCard({ artist, onSelect }: { artist: ArtistSummary; onSelect?: (artist: ArtistReference) => void }) {
  return (
    <button className="search-entity-card search-entity-card-artist" type="button" onClick={() => onSelect?.(artist)}>
      <span
        className="search-entity-cover"
        style={{
          '--cover-tone': artist.coverTone,
          '--song-cover-image': artist.imageUrl
            ? `url("${artist.imageUrl}")`
            : 'linear-gradient(135deg, var(--visual-accent), var(--visual-material-b))'
        } as CSSProperties}
        aria-hidden="true"
      />
      <span className="search-entity-copy">
        <strong>{artist.name}</strong>
        <small>{artist.aliases?.filter(Boolean).join(' / ') || artist.sourceLabel || '歌手'}</small>
      </span>
    </button>
  );
}

function SearchAlbumResultCard({ album, onSelect }: { album: AlbumSummary; onSelect?: (album: AlbumReference) => void }) {
  return (
    <button className="search-entity-card" type="button" onClick={() => onSelect?.(album)}>
      <span
        className="search-entity-cover"
        style={{
          '--cover-tone': album.coverTone,
          '--song-cover-image': album.coverUrl
            ? `url("${album.coverUrl}")`
            : 'linear-gradient(135deg, var(--visual-accent), var(--visual-material-b))'
        } as CSSProperties}
        aria-hidden="true"
      />
      <span className="search-entity-copy">
        <strong>{album.title}</strong>
        <small>{album.artistName || album.sourceLabel || '专辑'}</small>
      </span>
    </button>
  );
}

function SearchPlaylistResultCard({ playlist, onSelect }: { playlist: DiscoveredPlaylist; onSelect?: (playlist: DiscoveredPlaylist) => void }) {
  return (
    <button className="search-entity-card" type="button" onClick={() => onSelect?.(playlist)}>
      <span
        className="search-entity-cover"
        style={{
          '--cover-tone': playlist.coverTone,
          '--song-cover-image': playlist.coverUrl
            ? `url("${playlist.coverUrl}")`
            : 'linear-gradient(135deg, var(--visual-accent), var(--visual-material-b))'
        } as CSSProperties}
        aria-hidden="true"
      />
      <span className="search-entity-copy">
        <strong>{playlist.title}</strong>
        <small>{playlist.creatorName || playlist.description || '歌单'}</small>
      </span>
    </button>
  );
}

function formatSearchEntityKind(kind: Exclude<SearchEntityType, 'song'>): string {
  switch (kind) {
    case 'artist':
      return '歌手';
    case 'album':
      return '专辑';
    case 'playlist':
      return '歌单';
  }
}

function normalizeSearchProviderId(providerId: ProviderId | null): RemoteProviderId {
  return providerId === 'netease' || providerId === 'qq' ? providerId : 'qq';
}

interface ArtistSpotlightIdentity {
  name: string;
  coverTone: string;
  artistImageUrl?: string;
  artist?: ArtistReference;
}

interface ArtistSpotlight extends ArtistSpotlightIdentity {
  albumCount: number;
}

function ArtistSpotlightSummary({ spotlight, songCount }: { spotlight: ArtistSpotlight; songCount: number }) {
  return (
    <>
      <span
        className="qq-search-artist-avatar"
        style={
          {
            '--cover-tone': spotlight.coverTone,
            '--song-cover-image': spotlight.artistImageUrl
              ? `url("${spotlight.artistImageUrl}")`
              : 'linear-gradient(135deg, var(--visual-accent), var(--visual-material-b))'
          } as CSSProperties
        }
        aria-hidden="true"
      />
      <span className="qq-search-heading">
        <span className="qq-search-heading-title">
          <span className="qq-search-heading-label">歌手</span>
          <span className="qq-search-query" title={spotlight.name}>{spotlight.name}</span>
        </span>
        <span className="qq-search-heading-meta">
          单曲 {songCount}
          <span aria-hidden="true"> · </span>
          专辑 {spotlight.albumCount}
        </span>
      </span>
    </>
  );
}

function createArtistSpotlightIdentity(
  keyword: string,
  results: Song[],
  artists: ArtistSummary[]
): ArtistSpotlightIdentity | null {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();
  if (!normalizedKeyword) {
    return null;
  }

  const artistSummary = artists.find((artist) => artist.name.toLocaleLowerCase().includes(normalizedKeyword));
  if (artistSummary) {
    return {
      name: artistSummary.name,
      coverTone: artistSummary.coverTone,
      artistImageUrl: artistSummary.imageUrl,
      artist: artistSummary
    };
  }

  if (results.length < 2) {
    return null;
  }

  const artistName = findDominantArtistName(results, normalizedKeyword);
  if (!artistName) {
    return null;
  }

  const artistSong = results.find((song) => songContainsArtist(song, artistName));
  return {
    name: artistName,
    coverTone: artistSong?.coverTone ?? results[0].coverTone,
    artistImageUrl: artistSong?.artistImageUrl,
    artist: artistSong?.artists?.find((artist) => artist.name === artistName)
  };
}

function createArtistSpotlight(identity: ArtistSpotlightIdentity | null, results: Song[]): ArtistSpotlight | null {
  if (!identity) {
    return null;
  }

  return {
    ...identity,
    albumCount: new Set(
      results
        .filter((song) => songContainsArtist(song, identity.name))
        .map((song) => song.album)
        .filter(Boolean)
    ).size
  };
}

function findDominantArtistName(results: Song[], normalizedKeyword: string): string {
  const artistCounts = new Map<string, number>();
  results.forEach((song) => {
    splitArtistNames(song.artist).forEach((name) => {
      if (name.toLocaleLowerCase().includes(normalizedKeyword)) {
        artistCounts.set(name, (artistCounts.get(name) ?? 0) + 1);
      }
    });
  });

  return [...artistCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? '';
}

function splitArtistNames(artist: string): string[] {
  return artist
    .split(/[/,、，&]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function songContainsArtist(song: Song, artistName: string): boolean {
  return song.artists?.some((artist) => artist.name === artistName) ?? splitArtistNames(song.artist).includes(artistName);
}


function createSearchSourceContext(song: Song, keyword: string): SourceContext {
  return {
    type: 'search',
    providerId: song.providerId,
    searchKeyword: keyword
  };
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
