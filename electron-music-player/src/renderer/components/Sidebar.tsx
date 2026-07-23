import {
  Bookmark,
  ChevronDown,
  Compass,
  Heart,
  LayoutGrid,
  ListPlus,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Trophy,
  type LucideIcon
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { MainContentTransition } from './MainContentTransition';
import { useLibraryStore } from '../state/libraryStore';
import type { AppView, ContentTransitionStyle, NavigationDirection } from '../state/uiStore';
import { formatSidebarLikedPlaylistDisplayTitle, isProviderLikedPlaylist } from '../utils/playlistDisplay';
import { formatProviderSourceLabel } from '../utils/providerDisplay';
import type { Playlist, PlaylistOwnership, ProviderId, RemoteProviderId } from '../../shared/musicTypes';
import oubaoLogoUrl from '../../../assets/branding/oubao-logo.svg';

interface PrimaryNavItem {
  label: string;
  icon: LucideIcon;
  action: PrimaryNavView;
}

type PrimaryNavView = 'home' | 'charts' | 'playlistDiscovery';

interface SidebarProps {
  isCollapsed?: boolean;
  currentView?: AppView;
  canRefreshProviderLibrary?: boolean;
  isProviderLibraryRefreshing?: boolean;
  contentTransitionStyle?: ContentTransitionStyle;
  navigationDirection?: NavigationDirection;
  reduceEffects?: boolean;
  onNavigateHome?: () => void;
  onNavigateCharts?: () => void;
  onNavigatePlaylistDiscovery?: () => void;
  onRefreshProviderLibrary?: () => void;
  onSelectProviderPlaylist?: (providerId: ProviderId, playlistId: string) => void;
  onToggleSidebarCollapsed?: () => void;
}

type PlaylistCategoryId = PlaylistOwnership;

interface LibraryPlaylistCategory {
  id: PlaylistCategoryId;
  title: string;
  ariaLabel: string;
  providers: Array<{
    providerId: RemoteProviderId;
    playlists: Playlist[];
  }>;
}

const playlistCategoryMeta: Record<PlaylistCategoryId, { title: string; ariaLabel: string }> = {
  liked: { title: '我喜欢', ariaLabel: 'liked playlists' },
  created: { title: '创建的歌单', ariaLabel: 'created playlists' },
  subscribed: { title: '收藏的歌单', ariaLabel: 'subscribed playlists' }
};

const primaryNav: PrimaryNavItem[] = [
  { label: '发现音乐', icon: Compass, action: 'home' },
  { label: '排行榜', icon: Trophy, action: 'charts' },
  { label: '歌单广场', icon: LayoutGrid, action: 'playlistDiscovery' }
];

const remoteProviderIds: RemoteProviderId[] = ['qq', 'netease'];

const libraryCategoryIcons: Record<PlaylistCategoryId, LucideIcon> = {
  liked: Heart,
  created: ListPlus,
  subscribed: Bookmark
};

const defaultView: AppView = { type: 'home' };

interface SidebarPlaylistItemProps {
  extraClassName?: string;
  isLiked: boolean;
  isSelected: boolean;
  onSelect: (providerId: ProviderId, playlistId: string) => void;
  playlist: Playlist;
}

const SidebarPlaylistItem = memo(function SidebarPlaylistItem({
  extraClassName = '',
  isLiked,
  isSelected,
  onSelect,
  playlist
}: SidebarPlaylistItemProps) {
  if (isLiked) {
    const displayTitle = formatSidebarLikedPlaylistDisplayTitle(playlist);
    const className = [
      'nav-item',
      'nav-library-playlist-item',
      'nav-library-liked-playlist-item',
      isSelected ? 'nav-playlist-item-active' : ''
    ].filter(Boolean).join(' ');

    return (
      <button
        className={className}
        type="button"
        aria-pressed={isSelected}
        aria-label={displayTitle}
        title={displayTitle}
        onClick={() => onSelect(playlist.providerId, playlist.id)}
      >
        <span className="nav-liked-playlist-title">{displayTitle}</span>
      </button>
    );
  }

  const providerSourceLabel = formatProviderSourceLabel(playlist.providerId);
  const className = [
    'nav-item',
    'nav-item-compact',
    'nav-playlist-item',
    extraClassName,
    isSelected ? 'nav-playlist-item-active' : ''
  ].filter(Boolean).join(' ');

  return (
    <button
      className={className}
      type="button"
      aria-pressed={isSelected}
      aria-label={`${playlist.title}，来源：${providerSourceLabel}`}
      title={`${playlist.title} · ${providerSourceLabel}`}
      onClick={() => onSelect(playlist.providerId, playlist.id)}
    >
      <span
        className="nav-playlist-cover"
        style={
          {
            '--cover-tone': playlist.coverTone,
            '--playlist-cover-image': playlist.coverUrl ? `url("${playlist.coverUrl}")` : 'linear-gradient(135deg, rgb(255 255 255 / 18%), rgb(255 255 255 / 3%))'
          } as CSSProperties
        }
        aria-hidden="true"
      >
        <span className={`nav-playlist-provider-badge nav-playlist-provider-badge-${playlist.providerId}`} />
      </span>
      <span className="nav-playlist-main">
        <span className="nav-playlist-title">{playlist.title}</span>
        <span className="nav-playlist-source">{providerSourceLabel}</span>
      </span>
    </button>
  );
});

export function Sidebar({
  isCollapsed = false,
  currentView = defaultView,
  canRefreshProviderLibrary = false,
  isProviderLibraryRefreshing = false,
  contentTransitionStyle = 'soft',
  navigationDirection = 'forward',
  reduceEffects = false,
  onNavigateHome,
  onNavigateCharts,
  onNavigatePlaylistDiscovery,
  onRefreshProviderLibrary,
  onSelectProviderPlaylist,
  onToggleSidebarCollapsed
}: SidebarProps) {
  const providerPlaylistsByProvider = useLibraryStore((state) => state.providerPlaylists);
  const selectProviderPlaylist = useLibraryStore((state) => state.selectProviderPlaylist);
  const libraryIsLoading = useLibraryStore((state) => (
    currentView.type === 'charts' || currentView.type === 'chart' || currentView.type === 'playlistDiscovery'
      ? false
      : state.isLoading
  ));
  const libraryCategories = useMemo(
    () => groupProviderPlaylistsByCategory(providerPlaylistsByProvider),
    [providerPlaylistsByProvider]
  );
  const [activeProviderByCategory, setActiveProviderByCategory] = useState<Partial<Record<PlaylistCategoryId, RemoteProviderId>>>({});
  const [tabDirectionByCategory, setTabDirectionByCategory] = useState<Partial<Record<PlaylistCategoryId, NavigationDirection>>>({});
  const [expandedCategories, setExpandedCategories] = useState<Partial<Record<PlaylistCategoryId, boolean>>>({});
  const CollapseIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose;
  const sidebarClassName = isCollapsed ? 'sidebar sidebar-collapsed' : 'sidebar';
  const navTopSectionClassName = libraryCategories.length > 0 ? 'nav-top-section nav-top-section-with-library' : 'nav-top-section';
  const isRefreshPending = isProviderLibraryRefreshing || libraryIsLoading;
  const refreshButtonClassName = isRefreshPending
    ? 'sidebar-refresh-button sidebar-refresh-button-loading'
    : 'sidebar-refresh-button';
  const handleSelectPlaylist = useCallback((providerId: ProviderId, playlistId: string) => {
    if (onSelectProviderPlaylist) {
      onSelectProviderPlaylist(providerId, playlistId);
      return;
    }

    void selectProviderPlaylist(providerId, playlistId);
  }, [onSelectProviderPlaylist, selectProviderPlaylist]);
  const renderRefreshButton = () => (
    <button
      className={refreshButtonClassName}
      type="button"
      aria-label="刷新当前内容"
      disabled={!canRefreshProviderLibrary || isRefreshPending}
      title="刷新当前内容"
      onClick={onRefreshProviderLibrary}
    >
      <RefreshCw aria-hidden="true" size={20} />
    </button>
  );
  const renderCollapseButton = () => (
    <button
      className="sidebar-collapse-toggle"
      type="button"
      aria-label={isCollapsed ? '展开菜单' : '收起菜单'}
      aria-pressed={isCollapsed}
      title={isCollapsed ? '展开菜单' : '收起菜单'}
      onClick={onToggleSidebarCollapsed}
    >
      <CollapseIcon aria-hidden="true" size={20} />
    </button>
  );
  const renderProviderPlaylistButton = (playlist: Playlist, extraClassName = '') => {
    const isSelected = isPlaylistViewActive(currentView, playlist);
    return (
      <SidebarPlaylistItem
        playlist={playlist}
        extraClassName={extraClassName}
        isLiked={false}
        isSelected={isSelected}
        onSelect={handleSelectPlaylist}
        key={playlist.id}
      />
    );
  };
  const renderLikedPlaylistButton = (playlist: Playlist) => {
    const isSelected = isPlaylistViewActive(currentView, playlist);
    return (
      <SidebarPlaylistItem
        playlist={playlist}
        isLiked
        isSelected={isSelected}
        onSelect={handleSelectPlaylist}
        key={playlist.id}
      />
    );
  };
  const renderLibraryCategory = (category: LibraryPlaylistCategory) => {
    const selectedProviderId = category.providers.some(
      (provider) => provider.providerId === activeProviderByCategory[category.id]
    )
      ? activeProviderByCategory[category.id] as RemoteProviderId
      : category.providers[0].providerId;
    const selectedProvider = category.providers.find((provider) => provider.providerId === selectedProviderId)
      ?? category.providers[0];
    const panelId = `sidebar-library-${category.id}-${selectedProvider.providerId}`;
    const drawerId = `sidebar-library-drawer-${category.id}`;
    const CategoryIcon = libraryCategoryIcons[category.id];
    const tabDirection = tabDirectionByCategory[category.id] ?? navigationDirection;
    const isExpanded = expandedCategories[category.id] ?? true;

    return (
      <section
        className="nav-library-category"
        role="group"
        aria-label={category.ariaLabel}
        data-expanded={isExpanded}
        key={category.id}
      >
        {!isCollapsed && (
          <div className="nav-library-category-heading">
            <button
              className="nav-library-category-trigger"
              type="button"
              aria-expanded={isExpanded}
              aria-controls={drawerId}
              onClick={() => {
                setExpandedCategories((current) => ({
                  ...current,
                  [category.id]: !(current[category.id] ?? true)
                }));
              }}
            >
              <CategoryIcon aria-hidden="true" size={20} />
              <span>{category.title}</span>
              <ChevronDown className="nav-library-category-chevron" aria-hidden="true" size={16} />
            </button>
          </div>
        )}
        {!isCollapsed ? (
          <div className="nav-library-category-drawer" id={drawerId} aria-hidden={!isExpanded}>
            <div className="nav-library-category-drawer-content">
              {category.providers.length > 1 ? (
                <div className="nav-library-provider-tabs" role="tablist" aria-label={`${category.title} 来源`}>
                  {category.providers.map((provider) => {
                    const isActive = provider.providerId === selectedProvider.providerId;
                    const providerLabel = formatProviderSourceLabel(provider.providerId);
                    return (
                      <button
                        className={isActive ? 'nav-library-provider-tab nav-library-provider-tab-active' : 'nav-library-provider-tab'}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={isActive ? panelId : undefined}
                        key={provider.providerId}
                        onClick={() => {
                          if (isActive) {
                            return;
                          }

                          const currentIndex = category.providers.findIndex(
                            (currentProvider) => currentProvider.providerId === selectedProvider.providerId
                          );
                          const nextIndex = category.providers.findIndex(
                            (currentProvider) => currentProvider.providerId === provider.providerId
                          );
                          setTabDirectionByCategory((current) => ({
                            ...current,
                            [category.id]: nextIndex < currentIndex ? 'backward' : 'forward'
                          }));
                          setActiveProviderByCategory((current) => ({
                            ...current,
                            [category.id]: provider.providerId
                          }));
                        }}
                      >
                        {providerLabel}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="nav-provider-category-list nav-library-category-list" id={panelId} role="tabpanel">
                <MainContentTransition
                  transitionKey={`${category.id}:${selectedProvider.providerId}`}
                  motionKey={`${category.id}:${selectedProvider.providerId}`}
                  scope="section"
                  style={contentTransitionStyle}
                  direction={tabDirection}
                  reduceEffects={reduceEffects}
                >
                  <div className="nav-library-tab-content">
                    {selectedProvider.playlists.length > 0
                      ? selectedProvider.playlists.map((playlist) =>
                        category.id === 'liked' ? renderLikedPlaylistButton(playlist) : renderProviderPlaylistButton(playlist)
                      )
                      : <p className="nav-library-empty">暂无歌单</p>}
                  </div>
                </MainContentTransition>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <nav className={sidebarClassName} aria-label="主导航">
      <div className="brand-block">
        <span className="brand-mark" aria-hidden="true">
          <img src={oubaoLogoUrl} alt="" />
        </span>
        <span className="brand-name">欧包音乐</span>
      </div>

      <div className="sidebar-scroll-area">
        <div className={navTopSectionClassName}>
          <div className="nav-section">
            {primaryNav.map((item) => {
            const Icon = item.icon;
            const isActive = isPrimaryNavViewActive(currentView, item.action);
            return (
              <button
                className={isActive ? 'nav-item nav-primary-item nav-item-active' : 'nav-item nav-primary-item'}
                type="button"
                key={item.label}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                title={item.label}
                onClick={
                  item.action === 'home'
                    ? onNavigateHome
                    : item.action === 'charts'
                      ? onNavigateCharts
                      : onNavigatePlaylistDiscovery
                }
              >
                <span className="nav-item-icon" aria-hidden="true">
                  <span className="nav-item-indicator" />
                  <Icon size={20} />
                </span>
                <span className="nav-label">{item.label}</span>
              </button>
            );
            })}
          </div>
        </div>

        <div className="nav-provider-library-section">
          {libraryCategories.map((category) => renderLibraryCategory(category))}
        </div>
      </div>

      <div className="sidebar-bottom-controls">
        {isCollapsed ? (
          <>
            {renderRefreshButton()}
            {renderCollapseButton()}
          </>
        ) : (
          <>
            {renderCollapseButton()}
            {renderRefreshButton()}
          </>
        )}
      </div>
    </nav>
  );
}

function groupProviderPlaylistsByCategory(
  providerPlaylistsByProvider: Partial<Record<ProviderId, Playlist[]>>
): LibraryPlaylistCategory[] {
  return (Object.keys(playlistCategoryMeta) as PlaylistCategoryId[]).flatMap((categoryId) => {
    const providers = remoteProviderIds
      .filter((providerId) => providerPlaylistsByProvider[providerId] !== undefined)
      .map((providerId) => {
      const playlists = (providerPlaylistsByProvider[providerId] ?? []).filter(
        (playlist) => getPlaylistCategoryId(playlist) === categoryId
      );
      return { providerId, playlists };
    });

    if (providers.length === 0 || providers.every((provider) => provider.playlists.length === 0)) {
      return [];
    }

    return [{
      id: categoryId,
      title: playlistCategoryMeta[categoryId].title,
      ariaLabel: playlistCategoryMeta[categoryId].ariaLabel,
      providers
    }];
  });
}

function getPlaylistCategoryId(playlist: Playlist): PlaylistCategoryId {
  if (playlist.ownership) {
    return playlist.ownership;
  }

  return isProviderLikedPlaylist(playlist) ? 'liked' : 'created';
}

function isPrimaryNavViewActive(view: AppView, primaryView: PrimaryNavView): boolean {
  if (primaryView === 'home') {
    return view.type === 'home' || view.type === 'recommendationCollection';
  }

  if (primaryView === 'charts') {
    return view.type === 'charts' || view.type === 'chart';
  }

  return view.type === 'playlistDiscovery';
}

function isPlaylistViewActive(view: AppView, playlist: Playlist): boolean {
  return view.type === 'playlist'
    && view.providerId === playlist.providerId
    && view.playlistId === playlist.id;
}
