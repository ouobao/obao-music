import {
  ChevronDown,
  Flame,
  Languages,
  ListMusic,
  LoaderCircle,
  Play,
  Sparkles,
  Tags
} from 'lucide-react';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type {
  DiscoveredPlaylist,
  PlaylistCategory,
  RemoteProviderId
} from '../../shared/musicTypes';
import type { PlaylistDiscoveryLoadingKind } from '../state/playlistDiscoveryStore';
import type { ContentTransitionStyle, NavigationDirection } from '../state/uiStore';
import { createPlaylistGridWindow } from '../utils/playlistGrid';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { useCoverCardDepth } from '../hooks/useCoverCardDepth';
import { useAppNotificationValue } from '../hooks/useAppNotificationValue';
import { MainContentTransition } from './MainContentTransition';
import { ProviderPageHeader } from './ProviderPageHeader';
import { CoverActionSurface } from './discovery/CoverActionSurface';
import { LazyCoverImage } from './discovery/LazyCoverImage';

const EMPTY_ENTRY_PLAYLIST_IDS: ReadonlySet<string> = new Set();
const playlistEntryMotionLimit = 12;
const playlistSkeletonCount = 10;
const playlistCategoryShortcutLimit = 7;

interface PlaylistGridViewport {
  containerWidth: number;
  scrollTop: number;
  viewportHeight: number;
}

interface PlaylistDiscoveryViewProps {
  providerId: RemoteProviderId;
  categoryId: string;
  categories: PlaylistCategory[];
  playlists: DiscoveredPlaylist[];
  isLoading: boolean;
  loadingKind?: PlaylistDiscoveryLoadingKind;
  errorMessage: string | null;
  hasMore: boolean;
  onProviderChange?: (providerId: RemoteProviderId) => void;
  onRefresh?: () => void;
  onCategoryChange?: (categoryId: string) => void;
  onSelectPlaylist?: (playlist: DiscoveredPlaylist) => void;
  onPlayPlaylist?: (playlist: DiscoveredPlaylist) => void | Promise<void>;
  onLoadMore?: () => void;
  transitionStyle?: ContentTransitionStyle;
  navigationDirection?: NavigationDirection;
  reduceEffects?: boolean;
}

export function PlaylistDiscoveryView({
  providerId,
  categoryId,
  categories,
  playlists,
  isLoading,
  loadingKind,
  errorMessage,
  hasMore,
  onProviderChange,
  onRefresh,
  onCategoryChange,
  onSelectPlaylist,
  onPlayPlaylist,
  onLoadMore,
  transitionStyle = 'soft',
  navigationDirection = 'forward',
  reduceEffects = false
}: PlaylistDiscoveryViewProps) {
  const fallbackLoadingKind: PlaylistDiscoveryLoadingKind = isLoading
    ? playlists.length === 0 ? 'initial' : 'refresh'
    : null;
  const effectiveLoadingKind = loadingKind ?? fallbackLoadingKind;
  const isAppendLoading = effectiveLoadingKind === 'append';
  const isBusy = isLoading || effectiveLoadingKind !== null;
  const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(null);
  const collectionIdentity = `${providerId}:${categoryId}`;
  const categoryGroups = useMemo(() => groupPlaylistCategories(categories), [categories]);
  const quickCategories = useMemo(
    () => getQuickPlaylistCategories(categories),
    [categories]
  );
  const [isCategoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuPresence = useAnimatedPresence(isCategoryMenuOpen, 220);
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);
  const enteringPlaylistIds = useAppendEntryPlaylistIds(
    collectionIdentity,
    playlists,
    effectiveLoadingKind
  );
  const enteringPlaylistIndexById = useMemo(
    () => new Map(Array.from(enteringPlaylistIds, (playlistId, index) => [playlistId, index])),
    [enteringPlaylistIds]
  );
  const { gridShellRef, gridViewport } = usePlaylistGridViewport(collectionIdentity);
  const gridWindow = useMemo(
    () => createPlaylistGridWindow({
      itemCount: playlists.length,
      containerWidth: gridViewport.containerWidth,
      scrollTop: gridViewport.scrollTop,
      viewportHeight: gridViewport.viewportHeight
    }),
    [gridViewport, playlists.length]
  );
  const visiblePlaylists = playlists.slice(gridWindow.startIndex, gridWindow.endIndex);
  const {
    handleDepthPointerLeave,
    handleDepthPointerMove
  } = useCoverCardDepth();

  useAppNotificationValue({
    key: `playlist-discovery:${providerId}:${categoryId}`,
    message: errorMessage,
    actionLabel: '重试',
    onAction: onRefresh
  });

  useEffect(() => {
    if (!isCategoryMenuOpen) {
      return undefined;
    }

    const closeMenuWhenOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !categoryMenuRef.current?.contains(target)) {
        setCategoryMenuOpen(false);
      }
    };
    const closeMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCategoryMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeMenuWhenOutside, true);
    document.addEventListener('keydown', closeMenuOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeMenuWhenOutside, true);
      document.removeEventListener('keydown', closeMenuOnEscape, true);
    };
  }, [isCategoryMenuOpen]);

  const selectCategory = (nextCategoryId: string) => {
    setCategoryMenuOpen(false);
    if (nextCategoryId !== categoryId) {
      onCategoryChange?.(nextCategoryId);
    }
  };

  return (
    <section className="playlist-discovery-view" aria-label="歌单广场" aria-busy={isBusy || undefined}>
      <ProviderPageHeader
        title="歌单广场"
        providerId={providerId}
        sourceAriaLabel="歌单广场来源"
        isRefreshing={isBusy}
        onProviderChange={onProviderChange}
        onRefresh={onRefresh}
      />
      {categories.length > 0 ? (
        <nav className="playlist-discovery-category-switcher" aria-label="歌单分类">
          <div className="playlist-discovery-category-shortcuts" role="group" aria-label="常用歌单分类">
            {quickCategories.map((category) => (
              <button
                className={
                  category.id === categoryId
                    ? 'playlist-discovery-category playlist-discovery-category-shortcut playlist-discovery-category-active'
                    : 'playlist-discovery-category playlist-discovery-category-shortcut'
                }
                type="button"
                key={`${category.providerId}:${category.id}`}
                aria-pressed={category.id === categoryId}
                onClick={() => selectCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
          <div className="playlist-discovery-category-menu-shell" ref={categoryMenuRef}>
            <button
              className="playlist-discovery-category-menu-trigger"
              type="button"
              aria-expanded={isCategoryMenuOpen}
              aria-controls="playlist-discovery-category-menu"
              onClick={() => setCategoryMenuOpen((open) => !open)}
            >
              <span>全部分类</span>
              <ChevronDown aria-hidden="true" size={16} />
            </button>
            {categoryMenuPresence.isMounted ? (
              <div
                className="playlist-discovery-category-menu"
                id="playlist-discovery-category-menu"
                role="dialog"
                aria-label="全部歌单分类"
                data-state={categoryMenuPresence.state}
                aria-hidden={categoryMenuPresence.state === 'closed'}
              >
                <div className="playlist-discovery-category-menu-groups">
                  {categoryGroups.map(([groupName, groupCategories]) => (
                    <section className="playlist-discovery-category-menu-group" role="group" aria-label={groupName} key={groupName}>
                      <span className="playlist-discovery-category-menu-group-label">
                        <CategoryGroupIcon groupName={groupName} />
                        <span>{groupName}</span>
                      </span>
                      <div className="playlist-discovery-category-menu-options">
                        {groupCategories.map((category) => (
                          <button
                            className={
                              category.id === categoryId
                                ? 'playlist-discovery-category playlist-discovery-category-menu-option playlist-discovery-category-active'
                                : 'playlist-discovery-category playlist-discovery-category-menu-option'
                            }
                            type="button"
                            key={`${category.providerId}:${category.id}`}
                            aria-pressed={category.id === categoryId}
                            onClick={() => selectCategory(category.id)}
                          >
                            {category.name}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </nav>
      ) : null}

      <div className="playlist-discovery-results" data-collection-key={collectionIdentity}>
        <MainContentTransition
          transitionKey={collectionIdentity}
          motionKey={collectionIdentity}
          scope="section"
          style={transitionStyle}
          direction={navigationDirection}
          reduceEffects={reduceEffects}
        >
          <>
      {effectiveLoadingKind === 'initial' && playlists.length === 0 ? (
        <>
          <p className="visually-hidden" role="status">正在加载歌单</p>
          <div className="playlist-discovery-grid-shell playlist-discovery-skeleton-shell" aria-hidden="true">
            <div className="playlist-discovery-grid playlist-discovery-skeleton-grid">
              {Array.from({ length: playlistSkeletonCount }, (_, index) => (
                <span className="playlist-discovery-skeleton-card" key={index}>
                  <span className="playlist-discovery-skeleton-cover" />
                  <span className="playlist-discovery-skeleton-line playlist-discovery-skeleton-line-title" />
                  <span className="playlist-discovery-skeleton-line playlist-discovery-skeleton-line-meta" />
                </span>
              ))}
            </div>
          </div>
        </>
      ) : null}
      {playlists.length > 0 ? (
        <div
          className="playlist-discovery-grid-shell"
          data-virtualized={gridWindow.virtualized || undefined}
          ref={gridShellRef}
        >
          <div
            className="playlist-discovery-grid-virtual-space"
            style={gridWindow.virtualized ? { height: `${gridWindow.totalHeight}px` } : undefined}
          >
            <div
              className="playlist-discovery-grid"
              style={
                gridWindow.virtualized
                  ? { transform: `translate3d(0, ${gridWindow.offsetTop}px, 0)` }
                  : undefined
              }
            >
              {visiblePlaylists.map((playlist) => {
                const entryIndex = enteringPlaylistIndexById.get(playlist.id);
                const isEntering = entryIndex !== undefined;
                return (
                  <article
                    className={
                      isEntering
                        ? 'playlist-discovery-card playlist-discovery-card-entering'
                        : 'playlist-discovery-card'
                    }
                    data-entry={isEntering ? 'append' : undefined}
                    style={
                      isEntering
                        ? { '--playlist-entry-delay': `${entryIndex * 18}ms` } as CSSProperties
                        : undefined
                    }
                    key={playlist.id}
                  >
                    <CoverActionSurface
                      className="playlist-discovery-card-action"
                      openClassName="playlist-discovery-card-open"
                      openLabel={`打开歌单：${playlist.title}`}
                      onOpen={onSelectPlaylist ? () => onSelectPlaylist(playlist) : undefined}
                      playClassName="playlist-discovery-card-play"
                      playLabel={`播放歌单：${playlist.title}`}
                      onPlay={onPlayPlaylist ? async () => {
                        setPlayingPlaylistId(playlist.id);
                        try {
                          await onPlayPlaylist(playlist);
                        } finally {
                          setPlayingPlaylistId((current) => current === playlist.id ? null : current);
                        }
                      } : undefined}
                      isPlaying={playingPlaylistId === playlist.id}
                    >
                      <span
                        className="playlist-discovery-card-cover playlist-discovery-card-scene"
                        style={
                          {
                            '--cover-tone': playlist.coverTone
                          } as CSSProperties
                        }
                        onPointerMove={handleDepthPointerMove}
                        onPointerLeave={handleDepthPointerLeave}
                      >
                        <LazyCoverImage className="playlist-discovery-card-image" coverUrl={playlist.coverUrl} />
                        <span className="playlist-discovery-card-sheen" aria-hidden="true" />
                        <span className="playlist-discovery-card-overlay">
                          <span className="playlist-discovery-card-meta">
                            {playlist.playCount !== undefined ? (
                              <span>
                                <Play aria-hidden="true" size={13} />
                                {formatPlayCount(playlist.playCount)}次播放
                              </span>
                            ) : null}
                            {playlist.trackCount !== undefined ? (
                              <span>
                                <ListMusic aria-hidden="true" size={13} />
                                {playlist.trackCount} 首
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </span>
                      <span className="playlist-discovery-card-copy">
                        <h2>{playlist.title}</h2>
                        {playlist.creatorName ? (
                          <span className="playlist-discovery-card-creator">{playlist.creatorName}</span>
                        ) : null}
                      </span>
                    </CoverActionSurface>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {!isLoading && !errorMessage && playlists.length === 0 ? (
        <p className="playlist-discovery-message">当前分类暂无歌单</p>
      ) : null}

      {hasMore && playlists.length > 0 ? (
        <div className="playlist-discovery-load-more">
          <button
            type="button"
            aria-label="加载更多歌单"
            disabled={isBusy}
            onClick={onLoadMore}
          >
            {isAppendLoading ? (
              <LoaderCircle
                className="playlist-discovery-load-more-loader"
                data-testid="playlist-discovery-load-more-loader"
                aria-hidden="true"
                size={17}
              />
            ) : (
              <ChevronDown aria-hidden="true" size={17} />
            )}
            <span>{isAppendLoading ? '正在加载' : '加载更多'}</span>
          </button>
        </div>
      ) : null}
          </>
        </MainContentTransition>
      </div>
    </section>
  );
}

function CategoryGroupIcon({ groupName }: { groupName: string }) {
  if (groupName === '精选') {
    return <Sparkles size={13} />;
  }
  if (groupName === '热门') {
    return <Flame size={13} />;
  }
  if (groupName === '语种') {
    return <Languages size={13} />;
  }
  return <Tags size={13} />;
}

function groupPlaylistCategories(categories: PlaylistCategory[]) {
  const groups = new Map<string, PlaylistCategory[]>();

  categories.forEach((category) => {
    const groupName = category.group?.trim() || '精选';
    const group = groups.get(groupName);
    if (group) {
      group.push(category);
    } else {
      groups.set(groupName, [category]);
    }
  });

  return Array.from(groups.entries());
}

function getQuickPlaylistCategories(categories: PlaylistCategory[]): PlaylistCategory[] {
  const prioritizedCategories = [
    categories.find((category) => category.id === 'all'),
    ...categories.filter((category) => category.hot),
    ...categories
  ];
  const seenCategoryIds = new Set<string>();

  return prioritizedCategories.flatMap((category) => {
    if (!category || seenCategoryIds.has(category.id) || seenCategoryIds.size >= playlistCategoryShortcutLimit) {
      return [];
    }

    seenCategoryIds.add(category.id);
    return [category];
  });
}

function usePlaylistGridViewport(collectionIdentity: string) {
  const gridShellRef = useRef<HTMLDivElement | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeFramePendingRef = useRef(false);
  const gridLayoutRef = useRef({
    top: 0,
    containerWidth: 0,
    viewportHeight: 720
  });
  const [gridShellElement, setGridShellElement] = useState<HTMLDivElement | null>(null);
  const [gridViewport, setGridViewport] = useState<PlaylistGridViewport>({
    containerWidth: 0,
    scrollTop: 0,
    viewportHeight: 720
  });

  const measure = useCallback(() => {
    const gridShell = gridShellRef.current;
    if (!gridShell) {
      return;
    }

    const scrollRoot = gridShell.closest<HTMLElement>('.main-content-playlist-discovery');
    const gridRect = gridShell.getBoundingClientRect();
    const scrollRootRect = scrollRoot?.getBoundingClientRect();
    const scrollTop = scrollRoot?.scrollTop ?? 0;
    const layout = {
      top: scrollRootRect ? gridRect.top - scrollRootRect.top + scrollTop : 0,
      containerWidth: gridShell.clientWidth || gridRect.width,
      viewportHeight: scrollRoot?.clientHeight || scrollRootRect?.height || window.innerHeight
    };
    gridLayoutRef.current = layout;
    const nextViewport = {
      containerWidth: layout.containerWidth,
      scrollTop: Math.max(0, scrollTop - layout.top),
      viewportHeight: layout.viewportHeight
    };

    setGridViewport((currentViewport) => (
      Math.abs(currentViewport.containerWidth - nextViewport.containerWidth) < 0.5
      && Math.abs(currentViewport.scrollTop - nextViewport.scrollTop) < 0.5
      && Math.abs(currentViewport.viewportHeight - nextViewport.viewportHeight) < 0.5
        ? currentViewport
        : nextViewport
    ));
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (resizeFramePendingRef.current) {
      return;
    }

    resizeFramePendingRef.current = true;
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFramePendingRef.current = false;
      resizeFrameRef.current = null;
      measure();
    });
  }, [measure]);

  const scheduleScrollUpdate = useCallback(() => {
    if (resizeFramePendingRef.current) {
      return;
    }

    resizeFramePendingRef.current = true;
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFramePendingRef.current = false;
      resizeFrameRef.current = null;
      const gridShell = gridShellRef.current;
      const scrollRoot = gridShell?.closest<HTMLElement>('.main-content-playlist-discovery');
      if (!scrollRoot) {
        return;
      }

      const { top, containerWidth, viewportHeight } = gridLayoutRef.current;
      const nextScrollTop = Math.max(0, scrollRoot.scrollTop - top);
      setGridViewport((currentViewport) => (
        Math.abs(currentViewport.containerWidth - containerWidth) < 0.5
        && Math.abs(currentViewport.scrollTop - nextScrollTop) < 0.5
        && Math.abs(currentViewport.viewportHeight - viewportHeight) < 0.5
          ? currentViewport
          : { containerWidth, scrollTop: nextScrollTop, viewportHeight }
      ));
    });
  }, []);

  const setGridShellRef = useCallback((element: HTMLDivElement | null) => {
    gridShellRef.current = element;
    setGridShellElement(element);
  }, []);

  useLayoutEffect(() => {
    const gridShell = gridShellElement;
    if (!gridShell) {
      return;
    }

    const scrollRoot = gridShell.closest<HTMLElement>('.main-content-playlist-discovery');
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure);

    measure();
    resizeObserver?.observe(gridShell);
    if (scrollRoot) {
      resizeObserver?.observe(scrollRoot);
      scrollRoot.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
    }
    window.addEventListener('resize', scheduleMeasure);

    return () => {
      resizeObserver?.disconnect();
      scrollRoot?.removeEventListener('scroll', scheduleScrollUpdate);
      window.removeEventListener('resize', scheduleMeasure);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
      resizeFrameRef.current = null;
      resizeFramePendingRef.current = false;
    };
  }, [collectionIdentity, gridShellElement, measure, scheduleMeasure, scheduleScrollUpdate]);

  return { gridShellRef: setGridShellRef, gridViewport };
}

function formatPlayCount(playCount: number): string {
  return new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(playCount);
}

function useAppendEntryPlaylistIds(
  collectionIdentity: string,
  playlists: DiscoveredPlaylist[],
  loadingKind: PlaylistDiscoveryLoadingKind
): ReadonlySet<string> {
  const collectionIdentityRef = useRef(collectionIdentity);
  const appendBaselineRef = useRef<Set<string> | null>(null);
  const [enteringPlaylistIds, setEnteringPlaylistIds] = useState<Set<string>>(() => new Set());
  const collectionChanged = collectionIdentityRef.current !== collectionIdentity;

  useLayoutEffect(() => {
    if (collectionIdentityRef.current !== collectionIdentity) {
      collectionIdentityRef.current = collectionIdentity;
      appendBaselineRef.current = loadingKind ? new Set(playlists.map((playlist) => playlist.id)) : null;
      setEnteringPlaylistIds(new Set());
      return;
    }

    if (loadingKind) {
      if (appendBaselineRef.current === null) {
        appendBaselineRef.current = new Set(playlists.map((playlist) => playlist.id));
        setEnteringPlaylistIds(new Set());
      }
      return;
    }

    const appendBaseline = appendBaselineRef.current;
    if (appendBaseline === null) {
      return;
    }

    appendBaselineRef.current = null;
    setEnteringPlaylistIds(new Set(
      playlists
        .filter((playlist) => !appendBaseline.has(playlist.id))
        .slice(0, playlistEntryMotionLimit)
        .map((playlist) => playlist.id)
    ));
  }, [collectionIdentity, loadingKind, playlists]);

  return collectionChanged ? EMPTY_ENTRY_PLAYLIST_IDS : enteringPlaylistIds;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
