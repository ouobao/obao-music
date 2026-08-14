import { ChevronUp, LocateFixed, Play, RefreshCw } from 'lucide-react';
import { memo, type CSSProperties, type MutableRefObject, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  AlbumReference,
  AlbumSummary,
  ArtistReference,
  Playlist,
  Song,
  SourceContext
} from '../../shared/musicTypes';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { useAppNotificationValue } from '../hooks/useAppNotificationValue';
import { useLibraryStore } from '../state/libraryStore';
import { usePlayerStore } from '../state/playerStore';
import type { ContentTransitionStyle, NavigationDirection } from '../state/uiStore';
import { formatPlaylistDisplayTitle, isProviderLikedPlaylist } from '../utils/playlistDisplay';
import { formatProviderLabel, formatProviderSourceLabel, formatSourceContextLabel } from '../utils/providerDisplay';
import { createCoverPaletteFromTone, type CoverPalette } from '../utils/coverPalette';
import { createVirtualWindowRange, getCenteredVirtualScrollTop } from '../utils/virtualWindow';
import { MainContentTransition } from './MainContentTransition';
import { SongListVisualScrollbar } from './SongListVisualScrollbar';
import { RemoteSongRowActions } from './RemoteSongRowActions';
import { SongAlbumLink, SongArtistLinks } from './SongEntityLinks';
import type { SongMenuPosition } from './SongRowActions';

interface PlaylistDetailViewProps {
  playlist: Playlist;
  tracks: Song[];
  isLoading: boolean;
  errorMessage: string | null;
  contentKind?: PlaylistDetailContentKind;
  metaItems?: string[];
  albums?: AlbumSummary[];
  coverPalette?: CoverPalette;
  transitionStyle?: ContentTransitionStyle;
  navigationDirection?: NavigationDirection;
  reduceEffects?: boolean;
  onSelectArtist?: (artist: ArtistReference) => void;
  onSelectAlbum?: (album: AlbumReference) => void;
  onRefresh?: () => void;
  onPlaybackStarted?: (message: string) => void;
}

export type PlaylistDetailContentKind = 'playlist' | 'chart' | 'artist' | 'album' | 'recommendation';
type ArtistDetailTab = 'albums' | 'tracks';

interface PlaylistDetailScrollStyle extends CSSProperties {
  '--playlist-detail-scroll-progress': string;
  '--playlist-detail-cover-current-size': string;
  '--playlist-detail-cover-blur': string;
  '--playlist-detail-header-content-blur': string;
  '--playlist-detail-hero-current-min-height': string;
  '--playlist-detail-hero-current-padding-y': string;
  '--playlist-detail-hero-current-padding-x': string;
  '--playlist-detail-title-current-size': string;
  '--playlist-detail-meta-current-opacity': string;
  '--playlist-detail-meta-current-max-height': string;
  '--playlist-detail-description-current-opacity': string;
  '--playlist-detail-description-current-max-height': string;
}

type PlaylistDetailHeaderTarget = 0 | 1;

interface AlbumDepthSample {
  element: HTMLElement;
  clientX: number;
  clientY: number;
}

const expandHeaderScrollThreshold = 96;
const compactHeaderScrollThreshold = 168;
const headerAnimationDurationMs = 320;
const scrolledControlThreshold = 24;
const playlistSongRowHeight = 58;
const playlistSongListFallbackHeight = 520;
const playlistSongListOverscan = 5;
const playlistSongListWindowStepRows = 4;
const floatingControlExitMs = 180;
const playlistDetailLoadingDelayMs = 200;
const playlistDetailSkeletonRowCount = 7;

export const PlaylistDetailView = memo(function PlaylistDetailView({
  playlist,
  tracks,
  isLoading,
  errorMessage,
  contentKind = 'playlist',
  metaItems = [],
  albums = [],
  coverPalette: suppliedCoverPalette,
  transitionStyle = 'soft',
  navigationDirection = 'forward',
  reduceEffects,
  onSelectArtist,
  onSelectAlbum,
  onRefresh,
  onPlaybackStarted
}: PlaylistDetailViewProps) {
  const detailRef = useRef<HTMLElement | null>(null);
  const songListRef = useRef<HTMLDivElement | null>(null) as MutableRefObject<HTMLDivElement | null>;
  const songListScrollFrameRef = useRef<number | null>(null);
  const headerAnimationFrameRef = useRef<number | null>(null);
  const headerProgressRef = useRef(0);
  const headerTargetRef = useRef<PlaylistDetailHeaderTarget>(0);
  const currentSongRowRef = useRef<HTMLDivElement | null>(null) as MutableRefObject<HTMLDivElement | null>;
  const providerLabel = formatProviderLabel(playlist.providerId, playlist.sourceLabel);
  const providerSourceLabel = formatProviderSourceLabel(playlist.providerId);
  const isLikedPlaylist = isProviderLikedPlaylist(playlist);
  const contentCopy = playlistDetailContentCopy[contentKind];
  const playlistDisplayTitle = formatPlaylistDisplayTitle(playlist);
  const coverPalette = suppliedCoverPalette ?? createCoverPaletteFromTone(playlist.coverTone);
  const playSongsFromList = usePlayerStore((state) => state.playSongsFromList);
  const playbackMode = usePlayerStore((state) => state.playbackMode);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const [isCompactHeader, setIsCompactHeader] = useState(false);
  const [isSongListScrolled, setSongListScrolled] = useState(false);
  const [isCurrentSongVisible, setCurrentSongVisible] = useState(true);
  const [delayedLoadingIdentity, setDelayedLoadingIdentity] = useState<string | null>(null);
  const [artistActiveTab, setArtistActiveTab] = useState<ArtistDetailTab>('tracks');
  const [artistTabDirection, setArtistTabDirection] = useState<NavigationDirection>(navigationDirection);
  const { handleAlbumDepthPointerLeave, handleAlbumDepthPointerMove } = useAlbumCardDepth();
  const isArtistDetail = contentKind === 'artist';
  const visibleTracks = tracks;
  const loadingIdentity = `${contentKind}:${playlist.id}`;
  const shouldDelayTrackLoading = isLoading && visibleTracks.length === 0 && !errorMessage;
  const showTrackSkeleton = shouldDelayTrackLoading && delayedLoadingIdentity === loadingIdentity;
  const currentSongId = currentSong?.id ?? null;
  const currentSongIndex = useMemo(
    () => visibleTracks.findIndex((song) => song.id === currentSongId),
    [currentSongId, visibleTracks]
  );
  const hasCurrentSongInList = currentSongIndex >= 0;
  const showCurrentSongLocator = hasCurrentSongInList && !isCurrentSongVisible;
  const currentSongLocatorPresence = useAnimatedPresence(showCurrentSongLocator, floatingControlExitMs);
  const scrollTopControlPresence = useAnimatedPresence(isSongListScrolled, floatingControlExitMs);
  useAppNotificationValue({
    key: `detail:${contentKind}:${playlist.providerId}:${playlist.id}`,
    message: errorMessage,
    actionLabel: '重试',
    onAction: onRefresh
  });
  const resetHeaderVisualState = useCallback(() => {
    if (headerAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(headerAnimationFrameRef.current);
      headerAnimationFrameRef.current = null;
    }

    headerProgressRef.current = 0;
    headerTargetRef.current = 0;
    setIsCompactHeader(false);

    if (detailRef.current) {
      applyPlaylistDetailScrollStyle(
        detailRef.current,
        createPlaylistDetailScrollStyle(0, readPlaylistDetailMetrics(detailRef.current))
      );
    }
  }, []);

  const handlePlayPlaylist = () => {
    const startedQueueItem = playSongsFromList(
      visibleTracks,
      getPlaylistStartIndex(visibleTracks.length, playbackMode),
      (song) => createPlaylistSourceContext(playlist, song, playlistDisplayTitle)
    );

    if (startedQueueItem) {
      onPlaybackStarted?.('已开始播放');
    }
  };

  useLayoutEffect(() => {
    if (songListRef.current) {
      songListRef.current.scrollTop = 0;
    }
    resetHeaderVisualState();
    setSongListScrolled(false);
    setCurrentSongVisible(true);
    setArtistActiveTab('tracks');
    setArtistTabDirection(navigationDirection);
  }, [albums.length, navigationDirection, playlist.id, resetHeaderVisualState]);

  useEffect(() => {
    setDelayedLoadingIdentity(null);
    if (!shouldDelayTrackLoading) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDelayedLoadingIdentity(loadingIdentity);
    }, playlistDetailLoadingDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [loadingIdentity, shouldDelayTrackLoading]);

  useLayoutEffect(() => {
    const detail = detailRef.current;
    if (!detail) {
      return;
    }

    const songList = songListRef.current ?? detail.querySelector<HTMLElement>('.playlist-detail-song-list');
    if (!songList) {
      resetHeaderVisualState();
      return;
    }

    let headerMetrics = readPlaylistDetailMetrics(detail);
    let lastHeaderProgress: number | null = null;
    let latestScrollTop = songList.scrollTop;
    let latestViewportHeight = songList.clientHeight || playlistSongListFallbackHeight;
    let latestMaxScrollTop = readPlaylistDetailMaxScrollTop(songList);
    let lastReportedSongListScrolled: boolean | null = null;
    let lastReportedCurrentSongVisible: boolean | null = null;
    let canCompactHeader = getExpandedPlaylistDetailMaxScrollTop(
      latestMaxScrollTop,
      headerProgressRef.current,
      headerMetrics
    ) >= compactHeaderScrollThreshold;
    let animationStartTime: number | null = null;
    let animationStartProgress = headerProgressRef.current;
    let animationTarget = headerTargetRef.current;
    let headerUpdatePending = false;
    let headerGeometryRefreshPending = false;
    const shouldReduceHeaderMotion = reduceEffects
      ?? (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    const updateSongListScrollState = (nextScrollTop: number, nextViewportHeight: number) => {
      const nextIsScrolled = nextScrollTop > scrolledControlThreshold;
      if (lastReportedSongListScrolled !== nextIsScrolled) {
        lastReportedSongListScrolled = nextIsScrolled;
        setSongListScrolled(nextIsScrolled);
      }

      const nextIsCurrentSongVisible = isCurrentSongVisibleInList(
        songList,
        contentKind === 'artist' ? currentSongRowRef.current : null,
        currentSongIndex,
        nextScrollTop,
        nextViewportHeight
      );
      if (lastReportedCurrentSongVisible !== nextIsCurrentSongVisible) {
        lastReportedCurrentSongVisible = nextIsCurrentSongVisible;
        setCurrentSongVisible(nextIsCurrentSongVisible);
      }
    };

    const readLatestHeaderGeometry = (updateCompactEligibility: boolean) => {
      headerMetrics = readPlaylistDetailMetrics(detail);
      latestScrollTop = songList.scrollTop;
      latestViewportHeight = songList.clientHeight || playlistSongListFallbackHeight;
      latestMaxScrollTop = readPlaylistDetailMaxScrollTop(songList);
      if (updateCompactEligibility) {
        canCompactHeader = getExpandedPlaylistDetailMaxScrollTop(
          latestMaxScrollTop,
          headerProgressRef.current,
          headerMetrics
        ) >= compactHeaderScrollThreshold;
      }
    };

    const applyHeaderProgress = (progress: number) => {
      const nextProgress = clamp(progress, 0, 1);
      headerProgressRef.current = nextProgress;

      if (lastHeaderProgress !== nextProgress) {
        lastHeaderProgress = nextProgress;
        applyPlaylistDetailScrollStyle(detail, createPlaylistDetailScrollStyle(nextProgress, headerMetrics));
      }

      if (headerTargetRef.current === 1 && nextProgress >= 1) {
        setIsCompactHeader(true);
      }
    };

    const cancelHeaderAnimation = () => {
      if (headerAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(headerAnimationFrameRef.current);
        headerAnimationFrameRef.current = null;
      }
    };

    const animateHeaderFrame = (timestamp: number) => {
      if (animationStartTime === null) {
        animationStartTime = timestamp;
      }

      const animationDuration = headerAnimationDurationMs * Math.abs(animationTarget - animationStartProgress);
      const linearProgress = animationDuration === 0
        ? 1
        : clamp((timestamp - animationStartTime) / animationDuration, 0, 1);
      const nextProgress = lerp(animationStartProgress, animationTarget, easeInOutCubic(linearProgress));

      applyHeaderProgress(nextProgress);

      if (linearProgress < 1) {
        headerAnimationFrameRef.current = window.requestAnimationFrame(animateHeaderFrame);
        return;
      }

      headerAnimationFrameRef.current = null;
      applyHeaderProgress(animationTarget);

      if (headerUpdatePending || headerGeometryRefreshPending) {
        headerUpdatePending = false;
        headerGeometryRefreshPending = false;
        readLatestHeaderGeometry(true);
        updateHeaderStyle(false, timestamp);
      }
    };

    const animateHeaderTo = (
      nextTarget: PlaylistDetailHeaderTarget,
      immediate = false,
      animationRequestedAt: number | null = null
    ) => {
      const targetChanged = headerTargetRef.current !== nextTarget;
      headerTargetRef.current = nextTarget;

      if (nextTarget === 0) {
        setIsCompactHeader(false);
      }

      if (immediate || shouldReduceHeaderMotion) {
        cancelHeaderAnimation();
        if (headerGeometryRefreshPending) {
          headerGeometryRefreshPending = false;
          readLatestHeaderGeometry(true);
        }
        applyHeaderProgress(nextTarget);
        return;
      }

      if (!targetChanged && headerAnimationFrameRef.current !== null) {
        return;
      }

      if (headerProgressRef.current === nextTarget) {
        cancelHeaderAnimation();
        if (headerGeometryRefreshPending) {
          headerGeometryRefreshPending = false;
          readLatestHeaderGeometry(true);
        }
        applyHeaderProgress(nextTarget);
        return;
      }

      cancelHeaderAnimation();
      animationStartTime = animationRequestedAt;
      animationStartProgress = headerProgressRef.current;
      animationTarget = nextTarget;
      headerAnimationFrameRef.current = window.requestAnimationFrame(animateHeaderFrame);
    };

    const updateHeaderStyle = (forceApply = false, animationRequestedAt: number | null = null) => {
      if (forceApply) {
        lastHeaderProgress = null;
        applyHeaderProgress(headerProgressRef.current);
      }

      if (!forceApply && headerAnimationFrameRef.current !== null) {
        headerUpdatePending = true;
        return;
      }

      headerUpdatePending = false;

      const nextTarget = getPlaylistDetailHeaderTarget(latestScrollTop, canCompactHeader, headerTargetRef.current);
      animateHeaderTo(nextTarget, !canCompactHeader, animationRequestedAt);
    };

    const scheduleSongListScrollUpdate = () => {
      if (songListScrollFrameRef.current !== null) {
        return;
      }

      songListScrollFrameRef.current = window.requestAnimationFrame((timestamp) => {
        songListScrollFrameRef.current = null;
        updateHeaderStyle(false, timestamp);
        updateSongListScrollState(latestScrollTop, latestViewportHeight);
      });
    };

    const handleScroll = () => {
      latestScrollTop = songList.scrollTop;
      scheduleSongListScrollUpdate();
    };

    const refreshHeaderMetrics = () => {
      const isHeaderAnimating = headerAnimationFrameRef.current !== null;
      if (isHeaderAnimating) {
        headerGeometryRefreshPending = true;
        return;
      }

      readLatestHeaderGeometry(true);
      lastHeaderProgress = null;
      scheduleSongListScrollUpdate();
    };

    const handleWindowResize = () => {
      const isHeaderAnimating = headerAnimationFrameRef.current !== null;
      readLatestHeaderGeometry(!isHeaderAnimating);
      headerGeometryRefreshPending = isHeaderAnimating;
      lastHeaderProgress = null;
      scheduleSongListScrollUpdate();
    };

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refreshHeaderMetrics);
    resizeObserver?.observe(detail);
    resizeObserver?.observe(songList);
    window.addEventListener('resize', handleWindowResize);

    updateSongListScrollState(latestScrollTop, latestViewportHeight);
    updateHeaderStyle(true);

    songList.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (songListScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(songListScrollFrameRef.current);
        songListScrollFrameRef.current = null;
      }
      cancelHeaderAnimation();
      songList.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleWindowResize);
      resizeObserver?.disconnect();
    };
  }, [contentKind, currentSongId, currentSongIndex, playlist.id, reduceEffects, resetHeaderVisualState, visibleTracks.length]);

  const scrollSongListToTop = () => {
    songListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const locateCurrentSong = () => {
    if (currentSongRowRef.current) {
      currentSongRowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    if (currentSongIndex < 0 || !songListRef.current) {
      return;
    }

    songListRef.current.scrollTo({
      top: getCenteredVirtualScrollTop(
        currentSongIndex,
        visibleTracks.length,
        playlistSongRowHeight,
        Math.max(playlistSongRowHeight, songListRef.current.clientHeight || playlistSongListFallbackHeight)
      ),
      behavior: 'smooth'
    });
  };

  const selectArtistTab = (nextTab: ArtistDetailTab) => {
    if (nextTab === artistActiveTab) {
      return;
    }

    setArtistTabDirection(nextTab === 'tracks' ? 'forward' : 'backward');
    setArtistActiveTab(nextTab);
  };

  const artistTabBaseId = `artist-detail-tab-${playlist.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  return (
    <section
      className="playlist-detail-view"
      aria-label={contentCopy.detailLabel}
      data-header-compact={isCompactHeader ? 'true' : 'false'}
      data-artist-tab={isArtistDetail ? artistActiveTab : undefined}
      data-playlist-kind={isLikedPlaylist ? 'liked' : contentKind}
      ref={detailRef}
    >
      <div className="playlist-detail-hero-shell">
        <header className={isLikedPlaylist ? 'playlist-detail-hero playlist-detail-hero-no-cover' : 'playlist-detail-hero'}>
        {!isLikedPlaylist ? (
          <span
            className="playlist-detail-cover"
            style={
              {
                '--cover-tone': playlist.coverTone,
                '--playlist-cover-image': playlist.coverUrl ? `url("${playlist.coverUrl}")` : 'linear-gradient(135deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))',
                '--playlist-detail-cover-glow': coverPalette.shadow
              } as CSSProperties
            }
            aria-hidden="true"
          />
        ) : null}
        <div className="playlist-detail-heading">
          <h1>{playlistDisplayTitle}</h1>
          <span className="source-pill">{providerLabel}</span>
          <p className="playlist-detail-description" title={playlist.description}>{playlist.description}</p>
          <div className="playlist-detail-meta" aria-label={contentCopy.metaLabel}>
            <span>来源：{providerSourceLabel}</span>
            {metaItems.map((item) => <span key={item}>{item}</span>)}
            {isCompactHeader ? <span>{visibleTracks.length} 首歌曲</span> : null}
          </div>
          <div className="playlist-detail-actions">
            <button
              className="playlist-detail-play-button"
              type="button"
              aria-label={`${contentCopy.playLabel}：${playlistDisplayTitle}`}
              disabled={visibleTracks.length === 0}
              onClick={handlePlayPlaylist}
            >
              <Play aria-hidden="true" size={16} fill="currentColor" />
              <span>播放</span>
            </button>
            {onRefresh ? (
              <button
                className="song-row-action-button playlist-detail-refresh-button"
                type="button"
                aria-label={`刷新${contentCopy.detailLabel}`}
                title={`刷新${contentCopy.detailLabel}`}
                onClick={onRefresh}
              >
                <RefreshCw aria-hidden="true" size={15} />
              </button>
            ) : null}
          </div>
        </div>
        </header>
      </div>

      <section className="panel-section playlist-detail-panel">
        {isArtistDetail ? (
          <div className="artist-detail-tabs" role="tablist" aria-label="歌手内容">
            <button
              className={artistActiveTab === 'tracks' ? 'artist-detail-tab artist-detail-tab-active' : 'artist-detail-tab'}
              id={`${artistTabBaseId}-tracks`}
              type="button"
              role="tab"
              aria-selected={artistActiveTab === 'tracks'}
              aria-controls={`${artistTabBaseId}-panel`}
              tabIndex={artistActiveTab === 'tracks' ? 0 : -1}
              onClick={() => selectArtistTab('tracks')}
            >
              歌曲
            </button>
            <button
              className={artistActiveTab === 'albums' ? 'artist-detail-tab artist-detail-tab-active' : 'artist-detail-tab'}
              id={`${artistTabBaseId}-albums`}
              type="button"
              role="tab"
              aria-selected={artistActiveTab === 'albums'}
              aria-controls={`${artistTabBaseId}-panel`}
              tabIndex={artistActiveTab === 'albums' ? 0 : -1}
              onClick={() => selectArtistTab('albums')}
            >
              专辑
            </button>
          </div>
        ) : null}
        <MainContentTransition
          transitionKey={isArtistDetail ? `${playlist.id}:${artistActiveTab}` : playlist.id}
          motionKey={isArtistDetail ? `${playlist.id}:${artistActiveTab}` : playlist.id}
          scope="section"
          style={transitionStyle}
          direction={isArtistDetail ? artistTabDirection : navigationDirection}
          reduceEffects={Boolean(reduceEffects)}
        >
          <div
            className={isArtistDetail ? 'artist-detail-tab-panel' : 'playlist-detail-transition-content'}
            id={isArtistDetail ? `${artistTabBaseId}-panel` : undefined}
            role={isArtistDetail ? 'tabpanel' : undefined}
            aria-labelledby={isArtistDetail ? `${artistTabBaseId}-${artistActiveTab}` : undefined}
          >
        {(!isArtistDetail || artistActiveTab === 'albums') && albums.length > 0 ? (
          <section className="artist-albums-section" aria-label={`${playlistDisplayTitle}的专辑`}>
            <div className="section-heading artist-albums-heading">
              <div>
                <h2>专辑</h2>
              </div>
              <span>{albums.length} 张</span>
            </div>
            <div className="artist-album-gallery" role="list">
              {albums.map((album, index) => (
                <article className="artist-album-gallery-item" role="listitem" key={album.id}>
                  <button
                    className="artist-album-gallery-card"
                    type="button"
                    aria-label={`打开专辑：${album.title}`}
                    onClick={() => onSelectAlbum?.(album)}
                    onPointerMove={handleAlbumDepthPointerMove}
                    onPointerLeave={handleAlbumDepthPointerLeave}
                  >
                    <span
                      className="artist-album-gallery-art"
                      style={
                        {
                          '--cover-tone': album.coverTone,
                          '--playlist-cover-image': album.coverUrl
                            ? `url("${album.coverUrl}")`
                            : 'linear-gradient(135deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))',
                          '--album-gallery-index': String(index)
                        } as CSSProperties
                      }
                      aria-hidden="true"
                    >
                      <span className="artist-album-gallery-vinyl" />
                      <span className="artist-album-gallery-cover" />
                    </span>
                    <span className="artist-album-gallery-copy">
                      <small>{album.releaseDate?.slice(0, 4) ?? '专辑'}</small>
                      <strong>{album.title}</strong>
                      <span>{formatAlbumMeta(album)}</span>
                    </span>
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {isArtistDetail && artistActiveTab === 'albums' && albums.length === 0 && !isLoading && !errorMessage ? (
          <p className="playlist-detail-message">暂无可展示的专辑</p>
        ) : null}
        {(!isArtistDetail || artistActiveTab === 'tracks') ? (
          <>
        {visibleTracks.length > 0 || showTrackSkeleton ? (
          <div className="section-heading playlist-detail-track-heading">
            <div>
              <h2>{contentCopy.trackHeading}</h2>
            </div>
          </div>
        ) : null}

        {showTrackSkeleton ? (
          <>
            <span className="playlist-detail-loading-status" role="status">{contentCopy.loadingLabel}</span>
            <div className="playlist-detail-skeleton" aria-hidden="true">
              {Array.from({ length: playlistDetailSkeletonRowCount }, (_, index) => (
                <div className="playlist-detail-skeleton-row" key={index}>
                  <span className="playlist-detail-skeleton-index" />
                  <span className="playlist-detail-skeleton-main">
                    <span />
                    <span />
                  </span>
                  <span className="playlist-detail-skeleton-action" />
                  <span className="playlist-detail-skeleton-album" />
                  <span className="playlist-detail-skeleton-duration" />
                </div>
              ))}
            </div>
          </>
        ) : null}
        {visibleTracks.length > 0 ? (
          <PlaylistSongListWindow
            playlist={playlist}
            playlistDisplayTitle={playlistDisplayTitle}
            tracks={visibleTracks}
            contentKind={contentKind}
            currentSongId={currentSongId}
            songListRef={songListRef}
            currentSongRowRef={currentSongRowRef}
            onSelectArtist={onSelectArtist}
            onSelectAlbum={onSelectAlbum}
            onPlaybackStarted={onPlaybackStarted}
          />
        ) : null}

        {visibleTracks.length > 0 && (currentSongLocatorPresence.isMounted || scrollTopControlPresence.isMounted) ? (
          <div className="playlist-detail-floating-controls" aria-label={`${contentCopy.shortLabel}滚动定位`}>
            {currentSongLocatorPresence.isMounted ? (
              <button className="playlist-detail-floating-button" type="button" aria-label="定位到正在播放" data-state={currentSongLocatorPresence.state} onClick={locateCurrentSong}>
                <LocateFixed aria-hidden="true" size={17} />
              </button>
            ) : null}
            {scrollTopControlPresence.isMounted ? (
              <button className="playlist-detail-floating-button" type="button" aria-label={`回到${contentCopy.shortLabel}顶部`} data-state={scrollTopControlPresence.state} onClick={scrollSongListToTop}>
                <ChevronUp aria-hidden="true" size={18} />
              </button>
            ) : null}
          </div>
        ) : null}

        {!isLoading && !errorMessage && visibleTracks.length === 0 ? (
          <p className="playlist-detail-message">{contentCopy.emptyLabel}</p>
        ) : null}
          </>
        ) : null}
          </div>
        </MainContentTransition>
      </section>
    </section>
  );
});

interface PlaylistSongListWindowProps {
  playlist: Playlist;
  playlistDisplayTitle: string;
  tracks: Song[];
  contentKind: PlaylistDetailContentKind;
  currentSongId: string | null;
  songListRef: MutableRefObject<HTMLDivElement | null>;
  currentSongRowRef: MutableRefObject<HTMLDivElement | null>;
  onSelectArtist?: (artist: ArtistReference) => void;
  onSelectAlbum?: (album: AlbumReference) => void;
  onPlaybackStarted?: (message: string) => void;
}

const PlaylistSongListWindow = memo(function PlaylistSongListWindow({
  playlist,
  playlistDisplayTitle,
  tracks,
  contentKind,
  currentSongId,
  songListRef,
  currentSongRowRef,
  onSelectArtist,
  onSelectAlbum,
  onPlaybackStarted
}: PlaylistSongListWindowProps) {
  const enqueueSong = usePlayerStore((state) => state.enqueueSong);
  const enqueueNextSong = usePlayerStore((state) => state.enqueueNextSong);
  const playSongsFromList = usePlayerStore((state) => state.playSongsFromList);
  const ensureLikedSongIds = useLibraryStore((state) => state.ensureLikedSongIds);
  const isLikedStatusReady = useLibraryStore((state) => Boolean(
    state.likedSongIdsLoaded[playlist.providerId]
  ));
  const [activeMenu, setActiveMenu] = useState<{ songId: string; position: SongMenuPosition } | null>(null);
  const [viewport, setViewport] = useState({
    scrollTop: 0,
    height: playlistSongListFallbackHeight
  });
  const previousPlaylistIdRef = useRef(playlist.id);
  const playlistChanged = previousPlaylistIdRef.current !== playlist.id;
  if (playlistChanged) {
    previousPlaylistIdRef.current = playlist.id;
  }

  useLayoutEffect(() => {
    const scrollHost = songListRef.current;
    if (!scrollHost) {
      return undefined;
    }

    let frameId = 0;
    let viewportHeight = scrollHost.clientHeight || playlistSongListFallbackHeight;
    const updateViewport = () => {
      frameId = 0;
      const windowStep = playlistSongRowHeight * playlistSongListWindowStepRows;
      const nextViewport = {
        scrollTop: Math.floor(Math.max(0, scrollHost.scrollTop) / windowStep) * windowStep,
        height: Math.ceil(Math.max(playlistSongRowHeight, viewportHeight) / playlistSongRowHeight) * playlistSongRowHeight
      };
      setViewport((current) => (
        current.scrollTop === nextViewport.scrollTop && current.height === nextViewport.height
          ? current
          : nextViewport
      ));
    };
    const scheduleViewportUpdate = () => {
      if (frameId === 0) {
        frameId = window.requestAnimationFrame(updateViewport);
      }
    };
    const refreshViewportHeight = () => {
      viewportHeight = scrollHost.clientHeight || playlistSongListFallbackHeight;
      scheduleViewportUpdate();
    };

    scrollHost.scrollTop = 0;
    updateViewport();
    scrollHost.addEventListener('scroll', scheduleViewportUpdate, { passive: true });
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(refreshViewportHeight);
    resizeObserver?.observe(scrollHost);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      scrollHost.removeEventListener('scroll', scheduleViewportUpdate);
      resizeObserver?.disconnect();
    };
  }, [playlist.id, songListRef]);

  useEffect(() => {
    setActiveMenu(null);
  }, [playlist.id]);

  useEffect(() => {
    if (playlist.providerId === 'local' || isLikedStatusReady) {
      return;
    }

    void ensureLikedSongIds(playlist.providerId);
  }, [ensureLikedSongIds, isLikedStatusReady, playlist.providerId]);

  const virtualWindow = createVirtualWindowRange({
    itemCount: tracks.length,
    itemSize: playlistSongRowHeight,
    scrollTop: playlistChanged ? 0 : viewport.scrollTop,
    viewportSize: Math.max(playlistSongRowHeight, playlistChanged ? playlistSongListFallbackHeight : viewport.height),
    overscan: playlistSongListOverscan
  });
  const shouldVirtualize = true;
  const renderedTracks = shouldVirtualize
    ? tracks.slice(virtualWindow.startIndex, virtualWindow.endIndex)
    : tracks;
  const renderedTrackStartIndex = shouldVirtualize ? virtualWindow.startIndex : 0;
  const handleOpenMenu = useCallback((songId: string, position: SongMenuPosition) => {
    setActiveMenu({ songId, position });
  }, []);
  const handleCloseMenu = useCallback((songId: string) => {
    setActiveMenu((currentMenu) => (currentMenu?.songId === songId ? null : currentMenu));
  }, []);

  return (
    <div className="song-list-scroll-shell playlist-detail-song-scroll-shell">
      <div className="playlist-detail-song-list-head">
        <span role="columnheader">歌曲名称</span>
        <span role="columnheader">操作</span>
        <span role="columnheader">专辑</span>
        <span role="columnheader">时长</span>
      </div>
      <div
        className="playlist-detail-song-list"
        role="list"
        aria-label={`${playlistDisplayTitle} 歌曲列表`}
        ref={(element) => {
          songListRef.current = element;
        }}
      >
        <div
          className="playlist-detail-song-list-virtual-space"
          style={{ height: shouldVirtualize ? `${virtualWindow.totalHeight}px` : 'auto' }}
        >
          <div
            className="playlist-detail-song-list-window"
            style={shouldVirtualize
              ? { transform: `translateY(${virtualWindow.offsetTop}px)` }
              : { position: 'relative', transform: 'none' }}
          >
            {renderedTracks.map((song, localIndex) => {
              const index = renderedTrackStartIndex + localIndex;
              const isMenuOpen = activeMenu?.songId === song.id;
              return (
                <PlaylistSongRow
                  song={song}
                  index={index}
                  tracks={tracks}
                  playlist={playlist}
                  playlistDisplayTitle={playlistDisplayTitle}
                  isCurrentSong={song.id === currentSongId}
                  isMenuOpen={isMenuOpen}
                  menuPosition={isMenuOpen ? activeMenu.position : null}
                  currentSongRowRef={currentSongRowRef}
                  enqueueSong={enqueueSong}
                  enqueueNextSong={enqueueNextSong}
                  playSongsFromList={playSongsFromList}
                  onOpenMenu={handleOpenMenu}
                  onCloseMenu={handleCloseMenu}
                  onSelectArtist={onSelectArtist}
                  onSelectAlbum={onSelectAlbum}
                  onPlaybackStarted={onPlaybackStarted}
                  key={song.id}
                />
              );
            })}
          </div>
        </div>
      </div>
      <SongListVisualScrollbar scrollHostRef={songListRef} />
    </div>
  );
});

interface PlaylistSongRowProps {
  song: Song;
  index: number;
  tracks: Song[];
  playlist: Playlist;
  playlistDisplayTitle: string;
  isCurrentSong: boolean;
  isMenuOpen: boolean;
  menuPosition: SongMenuPosition | null;
  currentSongRowRef: MutableRefObject<HTMLDivElement | null>;
  enqueueSong: ReturnType<typeof usePlayerStore.getState>['enqueueSong'];
  enqueueNextSong: ReturnType<typeof usePlayerStore.getState>['enqueueNextSong'];
  playSongsFromList: ReturnType<typeof usePlayerStore.getState>['playSongsFromList'];
  onOpenMenu: (songId: string, position: SongMenuPosition) => void;
  onCloseMenu: (songId: string) => void;
  onSelectArtist?: (artist: ArtistReference) => void;
  onSelectAlbum?: (album: AlbumReference) => void;
  onPlaybackStarted?: (message: string) => void;
}

const PlaylistSongRow = memo(function PlaylistSongRow({
  song,
  index,
  tracks,
  playlist,
  playlistDisplayTitle,
  isCurrentSong,
  isMenuOpen,
  menuPosition,
  currentSongRowRef,
  enqueueSong,
  enqueueNextSong,
  playSongsFromList,
  onOpenMenu,
  onCloseMenu,
  onSelectArtist,
  onSelectAlbum,
  onPlaybackStarted
}: PlaylistSongRowProps) {
  const sourceContext = createPlaylistSourceContext(playlist, song, playlistDisplayTitle);
  const playFromSong = () => {
    playSongsFromList(tracks, index, (track) => (
      createPlaylistSourceContext(playlist, track, playlistDisplayTitle)
    ));
  };
  const enqueueFromSong = () => {
    enqueueSong(song, sourceContext);
  };

  return (
    <div className="playlist-detail-song-list-item" role="listitem">
      <div
        className={isCurrentSong ? 'song-row playlist-detail-song-row song-row-current' : 'song-row playlist-detail-song-row'}
        data-current={isCurrentSong ? 'true' : undefined}
        data-song-id={song.id}
        role="button"
        tabIndex={0}
        aria-label={`加入队列：${song.title}`}
        ref={isCurrentSong ? (element) => {
          currentSongRowRef.current = element;
        } : undefined}
        onClick={enqueueFromSong}
        onDoubleClick={() => {
          playFromSong();
          onPlaybackStarted?.('已开始播放');
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
            return;
          }

          event.preventDefault();
          enqueueFromSong();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onOpenMenu(song.id, { x: event.clientX, y: event.clientY });
        }}
      >
        <span
          className="song-cover-small"
          style={{
            '--cover-tone': song.coverTone,
            '--song-cover-image': song.coverUrl
              ? `url("${song.coverUrl}")`
              : 'linear-gradient(145deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))'
          } as CSSProperties}
          aria-hidden="true"
        />
        <span className="song-row-main">
          <strong>{song.title}</strong>
          <small><SongArtistLinks song={song} onSelectArtist={onSelectArtist} /></small>
          <span className="source-pill song-source-pill">
            {formatSourceContextLabel(sourceContext.providerId, sourceContext.type)}
          </span>
        </span>
        <RemoteSongRowActions
          song={song}
          sourcePlaylist={playlist}
          canLike={playlist.providerId !== 'local'}
          ensureLikedStatus={false}
          menuOpen={isMenuOpen}
          menuPosition={menuPosition}
          onPlay={playFromSong}
          onPlayNext={() => enqueueNextSong(song, sourceContext)}
          onOpenMenu={(position) => onOpenMenu(song.id, position)}
          onCloseMenu={() => onCloseMenu(song.id)}
          onNotice={onPlaybackStarted}
        />
        <span className="song-album">
          <SongAlbumLink song={song} onSelectAlbum={onSelectAlbum} />
        </span>
        <span className="playlist-detail-duration">{formatDuration(song.durationMs)}</span>
      </div>
    </div>
  );
});

const playlistDetailContentCopy: Record<PlaylistDetailContentKind, {
  detailLabel: string;
  metaLabel: string;
  playLabel: string;
  trackHeading: string;
  loadingLabel: string;
  emptyLabel: string;
  shortLabel: string;
}> = {
  playlist: {
    detailLabel: '歌单详情',
    metaLabel: '歌单信息',
    playLabel: '播放歌单',
    trackHeading: '歌曲列表',
    loadingLabel: '正在加载歌单曲目',
    emptyLabel: '这个歌单暂时没有可展示的歌曲',
    shortLabel: '歌单'
  },
  chart: {
    detailLabel: '排行榜详情',
    metaLabel: '榜单信息',
    playLabel: '播放榜单',
    trackHeading: '歌曲列表',
    loadingLabel: '正在加载榜单曲目',
    emptyLabel: '这个榜单暂时没有可展示的歌曲',
    shortLabel: '榜单'
  },
  artist: {
    detailLabel: '歌手详情',
    metaLabel: '歌手信息',
    playLabel: '播放热门歌曲',
    trackHeading: '热门歌曲',
    loadingLabel: '正在加载歌手热门歌曲',
    emptyLabel: '这位歌手暂时没有可展示的热门歌曲',
    shortLabel: '歌手详情'
  },
  album: {
    detailLabel: '专辑详情',
    metaLabel: '专辑信息',
    playLabel: '播放专辑',
    trackHeading: '专辑曲目',
    loadingLabel: '正在加载专辑曲目',
    emptyLabel: '这张专辑暂时没有可展示的歌曲',
    shortLabel: '专辑'
  },
  recommendation: {
    detailLabel: '推荐集合详情',
    metaLabel: '推荐集合信息',
    playLabel: '播放推荐集合',
    trackHeading: '歌曲列表',
    loadingLabel: '正在加载推荐歌曲',
    emptyLabel: '这个推荐集合暂时没有可展示的歌曲',
    shortLabel: '推荐集合'
  }
};

function formatAlbumMeta(album: AlbumSummary): string {
  return [album.releaseDate, album.trackCount !== undefined ? `${album.trackCount} 首` : '', album.albumType]
    .filter(Boolean)
    .join(' · ');
}

function createPlaylistSourceContext(playlist: Playlist, song: Song, playlistTitle = formatPlaylistDisplayTitle(playlist)): SourceContext {
  return song.sourceContext ?? {
    type: 'playlist',
    providerId: playlist.providerId,
    playlistId: playlist.id,
    playlistTitle
  };
}

function getPlaylistStartIndex(trackCount: number, playbackMode: string): number {
  if (trackCount <= 0 || playbackMode !== 'shuffle') {
    return 0;
  }

  return Math.min(trackCount - 1, Math.floor(Math.random() * trackCount));
}

function isCurrentSongVisibleInList(
  songList: HTMLElement,
  songRow: HTMLElement | null,
  currentSongIndex: number,
  scrollTop: number,
  viewportHeight: number
): boolean {
  if (currentSongIndex < 0) {
    return true;
  }

  if (!songRow) {
    const visibleTop = Math.max(0, scrollTop);
    const visibleBottom = visibleTop + Math.max(playlistSongRowHeight, viewportHeight);
    const rowTop = currentSongIndex * playlistSongRowHeight;
    const rowBottom = rowTop + playlistSongRowHeight;
    return rowTop >= visibleTop && rowBottom <= visibleBottom;
  }

  const listRect = songList.getBoundingClientRect();
  const rowRect = songRow.getBoundingClientRect();
  if (listRect.height <= 0 || rowRect.height <= 0) {
    return true;
  }

  return rowRect.top >= listRect.top && rowRect.bottom <= listRect.bottom;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

interface PlaylistDetailMetrics {
  coverSize: number;
  stickyCoverSize: number;
  heroExpandedHeight: number;
  heroStickyHeight: number;
  heroExpandedPaddingY: number;
  heroStickyPaddingY: number;
  heroExpandedPaddingX: number;
  heroStickyPaddingX: number;
  titleExpandedSize: number;
  titleStickySize: number;
  metaExpandedHeight: number;
  metaStickyHeight: number;
  descriptionExpandedHeight: number;
}

const defaultPlaylistDetailMetrics: PlaylistDetailMetrics = {
  coverSize: 128,
  stickyCoverSize: 64,
  heroExpandedHeight: 156,
  heroStickyHeight: 64,
  heroExpandedPaddingY: 14,
  heroStickyPaddingY: 8,
  heroExpandedPaddingX: 16,
  heroStickyPaddingX: 12,
  titleExpandedSize: 28,
  titleStickySize: 18,
  metaExpandedHeight: 50,
  metaStickyHeight: 36,
  descriptionExpandedHeight: 40
};

function readPlaylistDetailMetrics(detail: HTMLElement): PlaylistDetailMetrics {
  const computedStyle = getComputedStyle(detail);

  return {
    coverSize: readCssPixels(computedStyle, '--playlist-detail-cover-size', defaultPlaylistDetailMetrics.coverSize),
    stickyCoverSize: readCssPixels(computedStyle, '--playlist-detail-cover-sticky-size', defaultPlaylistDetailMetrics.stickyCoverSize),
    heroExpandedHeight: readCssPixels(computedStyle, '--playlist-detail-hero-expanded-height', defaultPlaylistDetailMetrics.heroExpandedHeight),
    heroStickyHeight: readCssPixels(computedStyle, '--playlist-detail-hero-sticky-height', defaultPlaylistDetailMetrics.heroStickyHeight),
    heroExpandedPaddingY: readCssPixels(computedStyle, '--playlist-detail-hero-expanded-padding-y', defaultPlaylistDetailMetrics.heroExpandedPaddingY),
    heroStickyPaddingY: readCssPixels(computedStyle, '--playlist-detail-hero-sticky-padding-y', defaultPlaylistDetailMetrics.heroStickyPaddingY),
    heroExpandedPaddingX: readCssPixels(computedStyle, '--playlist-detail-hero-expanded-padding-x', defaultPlaylistDetailMetrics.heroExpandedPaddingX),
    heroStickyPaddingX: readCssPixels(computedStyle, '--playlist-detail-hero-sticky-padding-x', defaultPlaylistDetailMetrics.heroStickyPaddingX),
    titleExpandedSize: readCssPixels(computedStyle, '--playlist-detail-title-expanded-size', defaultPlaylistDetailMetrics.titleExpandedSize),
    titleStickySize: readCssPixels(computedStyle, '--playlist-detail-title-sticky-size', defaultPlaylistDetailMetrics.titleStickySize),
    metaExpandedHeight: readCssPixels(computedStyle, '--playlist-detail-meta-expanded-height', defaultPlaylistDetailMetrics.metaExpandedHeight),
    metaStickyHeight: readCssPixels(computedStyle, '--playlist-detail-meta-sticky-height', defaultPlaylistDetailMetrics.metaStickyHeight),
    descriptionExpandedHeight: readCssPixels(computedStyle, '--playlist-detail-description-expanded-height', defaultPlaylistDetailMetrics.descriptionExpandedHeight)
  };
}

function createPlaylistDetailScrollStyle(
  progress: number,
  metrics: PlaylistDetailMetrics = defaultPlaylistDetailMetrics
): PlaylistDetailScrollStyle {
  const nextProgress = clamp(progress, 0, 1);
  const blur = Math.sin(nextProgress * Math.PI) * 22;
  const descriptionOpacity = clamp(1 - nextProgress * 1.8, 0, 1);

  return {
    '--playlist-detail-scroll-progress': formatCssNumber(nextProgress),
    '--playlist-detail-cover-current-size': `${formatCssNumber(lerp(metrics.coverSize, metrics.stickyCoverSize, nextProgress))}px`,
    '--playlist-detail-cover-blur': `${formatCssNumber(blur)}px`,
    '--playlist-detail-header-content-blur': `${formatCssNumber(blur)}px`,
    '--playlist-detail-hero-current-min-height': `${formatCssNumber(lerp(metrics.heroExpandedHeight, metrics.heroStickyHeight, nextProgress))}px`,
    '--playlist-detail-hero-current-padding-y': `${formatCssNumber(lerp(metrics.heroExpandedPaddingY, metrics.heroStickyPaddingY, nextProgress))}px`,
    '--playlist-detail-hero-current-padding-x': `${formatCssNumber(lerp(metrics.heroExpandedPaddingX, metrics.heroStickyPaddingX, nextProgress))}px`,
    '--playlist-detail-title-current-size': `${formatCssNumber(lerp(metrics.titleExpandedSize, metrics.titleStickySize, nextProgress))}px`,
    '--playlist-detail-meta-current-opacity': '1',
    '--playlist-detail-meta-current-max-height': `${formatCssNumber(lerp(metrics.metaExpandedHeight, metrics.metaStickyHeight, nextProgress))}px`,
    '--playlist-detail-description-current-opacity': formatCssNumber(descriptionOpacity),
    '--playlist-detail-description-current-max-height': `${formatCssNumber(lerp(metrics.descriptionExpandedHeight, 0, nextProgress))}px`
  };
}

function readPlaylistDetailMaxScrollTop(songList: HTMLElement | null): number {
  if (!songList) {
    return compactHeaderScrollThreshold;
  }

  return Math.max(0, songList.scrollHeight - songList.clientHeight);
}

function getPlaylistDetailHeaderTarget(
  scrollTop: number,
  canCompactHeader: boolean,
  currentTarget: PlaylistDetailHeaderTarget
): PlaylistDetailHeaderTarget {
  if (!canCompactHeader) {
    return 0;
  }

  const nextScrollTop = Math.max(0, scrollTop);
  if (currentTarget === 0 && nextScrollTop >= compactHeaderScrollThreshold) {
    return 1;
  }
  if (currentTarget === 1 && nextScrollTop <= expandHeaderScrollThreshold) {
    return 0;
  }

  return currentTarget;
}

function getExpandedPlaylistDetailMaxScrollTop(
  currentMaxScrollTop: number,
  progress: number,
  metrics: PlaylistDetailMetrics
): number {
  const currentHeroHeight = lerp(
    metrics.heroExpandedHeight,
    metrics.heroStickyHeight,
    clamp(progress, 0, 1)
  );
  return currentMaxScrollTop + Math.max(0, metrics.heroExpandedHeight - currentHeroHeight);
}

function applyPlaylistDetailScrollStyle(detail: HTMLElement, scrollStyle: PlaylistDetailScrollStyle): void {
  for (const [propertyName, value] of Object.entries(scrollStyle)) {
    detail.style.setProperty(propertyName, value);
  }
}

function readCssPixels(computedStyle: CSSStyleDeclaration, propertyName: string, fallback: number): number {
  const value = Number.parseFloat(computedStyle.getPropertyValue(propertyName));
  return Number.isFinite(value) ? value : fallback;
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function easeInOutCubic(progress: number): number {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatCssNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function useAlbumCardDepth() {
  const sampleRef = useRef<AlbumDepthSample | null>(null);
  const frameRef = useRef<number | null>(null);

  const reset = useCallback((element: HTMLElement) => {
    element.style.setProperty('--album-depth-x', '0px');
    element.style.setProperty('--album-depth-y', '0px');
    element.style.setProperty('--album-depth-rotate-x', '0deg');
    element.style.setProperty('--album-depth-rotate-y', '0deg');
  }, []);

  const handleAlbumDepthPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const element = event.currentTarget;
    if (
      event.pointerType === 'touch'
      || document.documentElement.dataset.reduceEffects === 'true'
      || window.matchMedia?.('(pointer: coarse)').matches
    ) {
      reset(element);
      return;
    }

    sampleRef.current = {
      element,
      clientX: event.clientX,
      clientY: event.clientY
    };
    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const sample = sampleRef.current;
      if (!sample) {
        return;
      }

      const rect = sample.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        reset(sample.element);
        return;
      }

      const pointerX = clamp((sample.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
      const pointerY = clamp((sample.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
      sample.element.style.setProperty('--album-depth-x', `${(pointerX * 10).toFixed(2)}px`);
      sample.element.style.setProperty('--album-depth-y', `${(pointerY * 8).toFixed(2)}px`);
      sample.element.style.setProperty('--album-depth-rotate-x', `${(-pointerY * 3).toFixed(2)}deg`);
      sample.element.style.setProperty('--album-depth-rotate-y', `${(pointerX * 4).toFixed(2)}deg`);
    });
  }, [reset]);

  const handleAlbumDepthPointerLeave = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (sampleRef.current?.element === event.currentTarget) {
      sampleRef.current = null;
    }
    reset(event.currentTarget);
  }, [reset]);

  useEffect(() => () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
  }, []);

  return { handleAlbumDepthPointerLeave, handleAlbumDepthPointerMove };
}
