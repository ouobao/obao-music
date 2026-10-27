import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../state/uiStore';
import { useLibraryStore } from '../state/libraryStore';
import { useProviderSessionStore } from '../state/providerSessionStore';
import type { Playlist, ProviderId } from '../../shared/musicTypes';
import { formatPlaylistTitle } from '../utils/providerDisplay';
import { onImageReveal, imageRevealRef } from '../utils/imageReveal';
import { NavChartsIcon, NavDiscoverIcon, NavDnaIcon, NavHistoryIcon, NavPlaylistIcon, MusicNoteIcon, PanelCollapseIcon, PanelExpandIcon } from './icons';
import { SkeletonBlock } from './Skeleton';
import logoUrl from '../../../assets/branding/obao-mark.svg';

const NAV_ITEMS: { view: 'home' | 'charts' | 'playlistDiscovery' | 'listeningHistory' | 'musicDna'; label: string; icon: React.ReactNode }[] = [
  { view: 'home', label: '推荐', icon: <NavDiscoverIcon size={19} strokeWidth={1.9} /> },
  { view: 'charts', label: '排行榜', icon: <NavChartsIcon size={19} strokeWidth={1.9} /> },
  { view: 'playlistDiscovery', label: '歌单广场', icon: <NavPlaylistIcon size={19} strokeWidth={1.9} /> },
  { view: 'listeningHistory', label: '最近播放', icon: <NavHistoryIcon size={19} strokeWidth={1.9} /> },
  { view: 'musicDna', label: '音乐 DNA', icon: <NavDnaIcon size={19} strokeWidth={1.9} /> }
];

export function Sidebar({ collapsed = false, onToggleCollapsed, onOpenLogin }: { collapsed?: boolean; onToggleCollapsed?: () => void; onOpenLogin?: () => void }) {
  const currentView = useUiStore((s) => s.currentView.name);
  const navigateToView = useUiStore((s) => s.navigateToView);
  const activeProviderId = useProviderSessionStore((s) => s.activeProviderId);
  const status = useProviderSessionStore((s) => s.statuses[s.activeProviderId]);
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

  // 手机端操作歌单后切回桌面应用：窗口重新可见时强制刷新歌单列表
  useEffect(() => {
    const refreshOnVisible = () => {
      if (activeProviderId !== 'local' && document.visibilityState === 'visible') {
        void loadProviderPlaylists(activeProviderId, { force: true });
      }
    };
    document.addEventListener('visibilitychange', refreshOnVisible);
    window.addEventListener('focus', refreshOnVisible);
    return () => {
      document.removeEventListener('visibilitychange', refreshOnVisible);
      window.removeEventListener('focus', refreshOnVisible);
    };
  }, [activeProviderId, loadProviderPlaylists]);

  const playlists = providerPlaylists[activeProviderId] ?? [];
  const likedPlaylists = playlists.filter((p) => p.ownership === 'liked' || p.isLiked);
  const createdPlaylists = playlists.filter((p) => p.ownership === 'created' && !p.isLiked);
  const subscribedPlaylists = playlists.filter((p) => p.ownership === 'subscribed');

  // 歌单列表隐藏了滚动条：滚到底时摘掉底部渐隐，否则最后一项会被淡出遮住
  const playlistScrollRef = useRef<HTMLDivElement>(null);
  const [playlistAtEnd, setPlaylistAtEnd] = useState(false);

  useEffect(() => {
    const el = playlistScrollRef.current;
    if (!el) return;
    const update = () => {
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
      setPlaylistAtEnd(atEnd);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [playlists.length, activeProviderId, collapsed]);

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
              style={{ '--i': Math.min(index, 6) } as React.CSSProperties}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span className="nav-item-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div
        ref={playlistScrollRef}
        className={`sidebar-playlist-section${!playlistsLoading[activeProviderId] && playlists.length === 0 ? ' is-empty' : ''}${playlistAtEnd ? ' is-at-end' : ''}`}
      >
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
                    <SkeletonBlock width={32} height={32} radius="var(--radius-sm)" />
                    <SkeletonBlock height={12} width={`${50 + ((i * 13) % 40)}%`} radius="var(--radius-xs)" />
                  </div>
                ))}
              </div>
            )}
            {!playlistsLoading[activeProviderId] && playlists.length === 0 && (
              <div className="sidebar-empty-state">
                <span className="sidebar-empty-icon" aria-hidden="true">
                  <MusicNoteIcon size={18} strokeWidth={1.9} />
                </span>
                <span className="sidebar-empty-title">暂无歌单</span>
                {status?.loggedIn ? (
                  <span className="sidebar-empty-desc">在手机 App 或在平台上收藏歌单后会同步到这里</span>
                ) : (
                  <>
                    <span className="sidebar-empty-desc">登录后同步你收藏的歌单与每日推荐</span>
                    <button className="sidebar-empty-action" type="button" onClick={() => onOpenLogin?.()}>
                      去登录
                    </button>
                  </>
                )}
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

      {/* 侧边栏底：已登录时是账号卡；未登录不再放第二张登录推广卡，
          登录入口收敛到歌单空态与顶栏，避免同一页面两个高亮登录 CTA。 */}
      {status?.loggedIn && (
        <div className="rail-footer">
          <button className="rail-user" onClick={() => onOpenLogin?.()} title="查看账号">
            {status.avatarUrl ? (
              <img className="rail-user-avatar" src={status.avatarUrl} alt="" loading="lazy" />
            ) : (
              <span className="rail-user-avatar">{(status.nickname ?? '音').slice(0, 1)}</span>
            )}
            <span className="rail-user-meta">
              <span className="rail-user-name">{status.nickname ?? '已登录'}</span>
              <span className="rail-user-sub">{activeProviderId === 'qq' ? 'QQ 音乐' : '网易云音乐'}</span>
            </span>
          </button>
        </div>
      )}
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
      style={{ '--i': Math.min(index, 6) } as React.CSSProperties}
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
