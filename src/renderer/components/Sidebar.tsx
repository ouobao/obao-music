import { useEffect, useState } from 'react';
import { useUiStore } from '../state/uiStore';
import { useLibraryStore } from '../state/libraryStore';
import { useProviderSessionStore } from '../state/providerSessionStore';
import type { Playlist, ProviderId } from '../../shared/musicTypes';
import { formatPlaylistTitle } from '../utils/providerDisplay';
import { onImageReveal, imageRevealRef } from '../utils/imageReveal';
import { NavChartsIcon, NavDiscoverIcon, NavHistoryIcon, NavPlaylistIcon, PanelCollapseIcon, PanelExpandIcon } from './icons';
import { SkeletonBlock } from './Skeleton';
import logoUrl from '../../../assets/branding/logo5.png';

const NAV_ITEMS: { view: 'home' | 'charts' | 'playlistDiscovery' | 'listeningHistory'; label: string; icon: React.ReactNode }[] = [
  { view: 'home', label: '推荐', icon: <NavDiscoverIcon size={17} strokeWidth={1.8} /> },
  { view: 'charts', label: '排行榜', icon: <NavChartsIcon size={17} strokeWidth={1.8} /> },
  { view: 'playlistDiscovery', label: '歌单广场', icon: <NavPlaylistIcon size={17} strokeWidth={1.8} /> },
  { view: 'listeningHistory', label: '最近播放', icon: <NavHistoryIcon size={17} strokeWidth={1.8} /> }
];

export function Sidebar({ collapsed = false, onToggleCollapsed }: { collapsed?: boolean; onToggleCollapsed?: () => void }) {
  const currentView = useUiStore((s) => s.currentView.name);
  const navigateToView = useUiStore((s) => s.navigateToView);
  const activeProviderId = useProviderSessionStore((s) => s.activeProviderId);
  const providerPlaylists = useLibraryStore((s) => s.providerPlaylists);
  const playlistsLoading = useLibraryStore((s) => s.playlistsLoading);
  const loadProviderPlaylists = useLibraryStore((s) => s.loadProviderPlaylists);
  const selectPlaylist = useLibraryStore((s) => s.selectPlaylist);
  const selectedPlaylistId = useLibraryStore((s) => s.selectedPlaylistId);

  useEffect(() => {
    if (activeProviderId !== 'local') {
      loadProviderPlaylists(activeProviderId);
    }
  }, [activeProviderId, loadProviderPlaylists]);

  const playlists = providerPlaylists[activeProviderId] ?? [];
  const likedPlaylists = playlists.filter((p) => p.ownership === 'liked' || p.isLiked);
  const createdPlaylists = playlists.filter((p) => p.ownership === 'created' && !p.isLiked);
  const subscribedPlaylists = playlists.filter((p) => p.ownership === 'subscribed');

  const openPlaylist = (providerId: ProviderId, playlist: Playlist) => {
    selectPlaylist(providerId, playlist.id);
    navigateToView('playlist', { providerId, playlistId: playlist.id, title: playlist.title });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-logo" title="欧包音乐">
          <img className="logo-badge" src={logoUrl} alt="欧包音乐" draggable={false} />
          <span className="sidebar-brand-text">欧包音乐</span>
        </div>
        {onToggleCollapsed && (
          <button
            className="sidebar-toggle-btn"
            type="button"
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelExpandIcon size={15} strokeWidth={2} /> : <PanelCollapseIcon size={15} strokeWidth={2} />}
          </button>
        )}
      </div>

      <div>
        <div className="nav-group-title">发现音乐</div>
        <nav className="nav-menu">
          {NAV_ITEMS.map((item, index) => (
            <button
              key={item.view}
              className={`nav-item ${currentView === item.view ? 'active' : ''}`}
              onClick={() => navigateToView(item.view)}
              title={item.label}
              style={{ '--i': index } as React.CSSProperties}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span className="nav-item-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-playlist-section">
        {likedPlaylists.length > 0 && (
          <div className="sidebar-playlist-group">
            <div className="nav-group-title">
              <span>我喜欢</span>
              <span className="nav-group-count">{likedPlaylists.length}</span>
            </div>
            <div className="sidebar-playlist-list">
              {likedPlaylists.map((playlist, index) => (
                <PlaylistNavItem
                  key={playlist.id}
                  playlist={playlist}
                  selected={selectedPlaylistId === playlist.id}
                  onOpen={() => openPlaylist(activeProviderId, playlist)}
                  index={index}
                />
              ))}
            </div>
          </div>
        )}

        <div className="sidebar-playlist-group">
          <div className="nav-group-title">
            <span>我的歌单</span>
            {createdPlaylists.length + subscribedPlaylists.length > 0 && (
              <span className="nav-group-count">{createdPlaylists.length + subscribedPlaylists.length}</span>
            )}
          </div>
          <div className="sidebar-playlist-list">
            {playlistsLoading[activeProviderId] && playlists.length === 0 && (
              <div className="sidebar-playlist-skeleton" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div className="sidebar-playlist-skeleton-row" key={i}>
                    <SkeletonBlock width={28} height={28} radius="var(--radius-sm)" />
                    <SkeletonBlock height={12} width={`${50 + ((i * 13) % 40)}%`} radius="var(--radius-xs)" />
                  </div>
                ))}
              </div>
            )}
            {!playlistsLoading[activeProviderId] && playlists.length === 0 && (
              <div style={{ padding: '8px', fontSize: 11.5, color: 'var(--text-muted)' }}>
                {activeProviderId === 'netease' || activeProviderId === 'qq' ? '登录后同步歌单' : '暂无歌单'}
              </div>
            )}
            {createdPlaylists.length > 0 && subscribedPlaylists.length > 0 && (
              <div className="sidebar-playlist-subtitle">我创建的</div>
            )}
            {createdPlaylists.map((playlist, index) => (
              <PlaylistNavItem
                key={playlist.id}
                playlist={playlist}
                selected={selectedPlaylistId === playlist.id}
                onOpen={() => openPlaylist(activeProviderId, playlist)}
                index={likedPlaylists.length + index}
              />
            ))}
            {subscribedPlaylists.length > 0 && (
              <div className="sidebar-playlist-subtitle">我收藏的</div>
            )}
            {subscribedPlaylists.map((playlist, index) => (
              <PlaylistNavItem
                key={playlist.id}
                playlist={playlist}
                selected={selectedPlaylistId === playlist.id}
                onOpen={() => openPlaylist(activeProviderId, playlist)}
                index={likedPlaylists.length + createdPlaylists.length + index}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function PlaylistNavItem({ playlist, selected, onOpen, index = 0 }: { playlist: Playlist; selected: boolean; onOpen: () => void; index?: number }) {
  const [coverBroken, setCoverBroken] = useState(false);
  useEffect(() => {
    setCoverBroken(false);
  }, [playlist.coverUrl]);

  const hasCover = Boolean(playlist.coverUrl) && !coverBroken;

  return (
    <button
      className={`playlist-nav-item ${selected ? 'active' : ''}`}
      onClick={onOpen}
      title={playlist.title}
      aria-current={selected ? 'true' : undefined}
      style={{ '--i': Math.min(index, 10) } as React.CSSProperties}
    >
      {hasCover ? (
        <img
          className="playlist-nav-cover"
          ref={imageRevealRef}
          src={playlist.coverUrl}
          alt=""
          loading="lazy"
          onLoad={onImageReveal}
          onError={(e) => {
            setCoverBroken(true);
            onImageReveal(e);
          }}
        />
      ) : null}
      <span className="playlist-nav-title">{formatPlaylistTitle(playlist.title)}</span>
    </button>
  );
}
