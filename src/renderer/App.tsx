import { useCallback, useEffect, useRef, useState } from 'react';
import { useUiStore, type ViewState } from './state/uiStore';
import type { ProviderId, RemoteProviderId } from '../shared/musicTypes';
import { usePlayerStore } from './state/playerStore';
import { useProviderSessionStore } from './state/providerSessionStore';
import { useNotificationStore } from './state/notificationStore';
import { useLibraryStore } from './state/libraryStore';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { PlayerBar } from './components/PlayerBar';
import { ScrollIndicator } from './components/ScrollIndicator';
import { AudioEngine } from './components/AudioEngine';
import { LyricsPanel } from './components/LyricsPanel';
import { QueuePanel } from './components/QueuePanel';
import { SimilarSongsPanel } from './components/SimilarSongsPanel';
import { LoginDialog } from './components/LoginDialog';
import { AppNotificationHost, PlaybackNotice } from './components/NotificationHost';
import { HomeView } from './components/views/HomeView';
import { SearchResultsView } from './components/views/SearchResultsView';
import { ChartsView } from './components/views/ChartsView';
import { PlaylistDiscoveryView } from './components/views/PlaylistDiscoveryView';
import { PlaylistDetailView } from './components/views/PlaylistDetailView';
import { ListeningHistoryView } from './components/views/ListeningHistoryView';
import { MusicDnaView } from './components/views/MusicDnaView';
import { useMediaSession } from './hooks/useMediaSession';
import { useTrayPlaybackControls } from './hooks/useTrayPlaybackControls';
import { useReducedEffects, useThemeSync } from './hooks/useTheme';
import { useScrollReveals } from './hooks/useScrollReveals';
import { usePlaybackSessionRecovery, useQualifiedListenTracking } from './hooks/usePlaybackHooks';
import { useSearchHistoryStore } from './state/searchHistoryStore';
import type { LyricsTransitionOrigin } from './lyrics/lyricsTransition';
import type { CoverPalette } from './utils/coverPalette';

export function App() {
  useMediaSession();
  useTrayPlaybackControls();
  useReducedEffects();
  useThemeSync();
  usePlaybackSessionRecovery();
  useQualifiedListenTracking();

  const currentView = useUiStore((s) => s.currentView);
  const navigateToView = useUiStore((s) => s.navigateToView);
  const isLyricsOpen = usePlayerStore((s) => s.isLyricsOpen);
  const setLyricsOpen = usePlayerStore((s) => s.setLyricsOpen);
  const isQueueOpen = useUiStore((s) => s.isQueueOpen);
  const setQueueOpen = useUiStore((s) => s.setQueueOpen);
  const isSimilarOpen = useUiStore((s) => s.isSimilarOpen);
  const setSimilarOpen = useUiStore((s) => s.setSimilarOpen);
  const toggleSimilar = useUiStore((s) => s.toggleSimilar);
  const activeProviderId = useProviderSessionStore((s) => s.activeProviderId);
  const hydrateStatuses = useProviderSessionStore((s) => s.hydrateStatuses);
  const loadProviderPlaylists = useLibraryStore((s) => s.loadProviderPlaylists);
  const [loginOpen, setLoginOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  /** 用户是否手动展开过侧栏：手动展开后不再被窗口宽度自动收起 */
  const sidebarManuallyExpandedRef = useRef(false);
  const [loginProviderId, setLoginProviderId] = useState<RemoteProviderId | undefined>();
  const [lyricsTransition, setLyricsTransition] = useState<{
    origin: LyricsTransitionOrigin;
    palette: CoverPalette;
  } | null>(null);

  const hydratedRef = useRef(false);

  // 切换平台后回到“发现音乐”：双平台歌单/榜单内容并不互通，
  // 停留原页面会进入对方平台不存在的详情，出现“歌单加载失败”的空骨架，观感像 bug
  const prevProviderRef = useRef<ProviderId>(activeProviderId);
  useEffect(() => {
    if (prevProviderRef.current !== activeProviderId) {
      prevProviderRef.current = activeProviderId;
      navigateToView('home');
    }
  }, [activeProviderId, navigateToView]);

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      hydrateStatuses();
      useSearchHistoryStore.getState().hydrate();
      loadProviderPlaylists(activeProviderId);
    }
  }, [hydrateStatuses, loadProviderPlaylists, activeProviderId]);

  const handleSearch = useCallback((keyword: string) => {
    useUiStore.getState().navigateToView('search', { keyword });
  }, []);

  // 最小窗口 1040px 时，258px 侧栏会占掉 25% 宽度，主内容只剩 756px。
  // 宽度不足 1100px 时自动收起侧栏；用户手动展开后不再强制收起。
  useEffect(() => {
    const NARROW = 1100;
    const applyWidth = () => {
      if (window.innerWidth < NARROW && !sidebarManuallyExpandedRef.current) {
        setSidebarCollapsed(true);
      } else if (window.innerWidth >= NARROW) {
        sidebarManuallyExpandedRef.current = false;
        setSidebarCollapsed(false);
      }
    };
    applyWidth();
    window.addEventListener('resize', applyWidth);
    return () => window.removeEventListener('resize', applyWidth);
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      // 手动展开时记一笔，之后窗口变窄也不再自动收起
      sidebarManuallyExpandedRef.current = !next;
      return next;
    });
  }, []);

  const handleOpenLogin = useCallback((providerId?: RemoteProviderId) => {
    const activeProviderId = useProviderSessionStore.getState().activeProviderId;
    // 防御：任何调用点都可能误传事件对象等非字符串值（如 onClick 直传），
    // 非法的 providerId 会让登录弹窗把事件对象当作平台 ID 发给主进程
    const requested = providerId === 'netease' || providerId === 'qq' ? providerId : undefined;
    setLoginProviderId(requested ?? (activeProviderId === 'netease' || activeProviderId === 'qq' ? activeProviderId : 'netease'));
    setLoginOpen(true);
  }, []);

  const handleLyricsOpen = useCallback((origin: LyricsTransitionOrigin, palette: CoverPalette) => {
    if (!usePlayerStore.getState().currentSong) return;
    setLyricsTransition({ origin, palette });
    setLyricsOpen(true);
  }, [setLyricsOpen]);

  const closeAllDrawers = useCallback(() => {
    setQueueOpen(false);
    setSimilarOpen(false);
  }, [setQueueOpen, setSimilarOpen]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-drawer-panel], [data-drawer-trigger], .popover-menu')) return;
      const state = useUiStore.getState();
      if (state.isQueueOpen || state.isSimilarOpen) {
        closeAllDrawers();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [closeAllDrawers]);

  // ESC 关闭抽屉：歌词页打开时由 LyricsPanel 自己处理（先关抽屉再关歌词页）
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (usePlayerStore.getState().isLyricsOpen) return;
      const state = useUiStore.getState();
      if (state.isQueueOpen) {
        event.preventDefault();
        state.setQueueOpen(false);
      } else if (state.isSimilarOpen) {
        event.preventDefault();
        state.setSimilarOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const renderView = (view: ViewState) => {
    const params = view.params;
    const providerId = activeProviderId as 'netease' | 'qq' | 'local';

    switch (view.name) {
      case 'home':
        if (providerId === 'local') {
          return (
            <div className="empty-state">
              <div className="empty-state-title">本地音乐不提供发现推荐</div>
              <div className="empty-state-desc">请切换到网易云或 QQ 音乐平台以浏览个性化推荐内容</div>
            </div>
          );
        }
        return <HomeView key="home" providerId={providerId as 'netease' | 'qq'} />;
      case 'search':
        return <SearchResultsView key={`search-${params.keyword}`} keyword={params.keyword ?? ''} />;
      case 'charts':
        return <ChartsView key="charts" />;
      case 'playlistDiscovery':
        return <PlaylistDiscoveryView key="discovery" />;
      case 'playlist':
        return <PlaylistDetailView key={`pl-${params.playlistId}`} providerId={providerId as 'netease' | 'qq'} playlistId={params.playlistId} title={params.title} kind="playlist" />;
      case 'chart':
        return <PlaylistDetailView key={`chart-${params.chartId}`} providerId={providerId as 'netease' | 'qq'} chartId={params.chartId} title={params.title} kind="chart" />;
      case 'artist':
        return <PlaylistDetailView key={`artist-${params.artistId}`} providerId={providerId as 'netease' | 'qq'} artistId={params.artistId} title={params.title} kind="artist" />;
      case 'album':
        return <PlaylistDetailView key={`album-${params.albumId}`} providerId={providerId as 'netease' | 'qq'} albumId={params.albumId} title={params.title} kind="album" />;
      case 'recommendationCollection':
        return <PlaylistDetailView key={`rec-${params.collectionId}`} providerId={providerId as 'netease' | 'qq'} playlistId={params.collectionId} title={params.title} kind="recommendation" />;
      case 'listeningHistory':
        return <ListeningHistoryView key="history" />;
      case 'musicDna':
        return <MusicDnaView key="music-dna" />;
      default:
        if (providerId === 'local') {
          return (
            <div className="empty-state">
              <div className="empty-state-title">本地音乐不提供发现推荐</div>
              <div className="empty-state-desc">请切换到网易云或 QQ 音乐平台以浏览个性化推荐内容</div>
            </div>
          );
        }
        return <HomeView key="home" providerId={providerId as 'netease' | 'qq'} />;
    }
  };

  const mainRef = useRef<HTMLElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useScrollReveals(mainRef);

  // 页面切换后重置主滚动区位置（回到顶部），避免新页面继承上一页的滚动偏移
  const viewKey = `${currentView.name}-${JSON.stringify(currentView.params)}`;
  const previousViewKeyRef = useRef(viewKey);
  useEffect(() => {
    if (previousViewKeyRef.current === viewKey) return;
    previousViewKeyRef.current = viewKey;
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    setShowScrollTop(false);
  }, [viewKey]);

  const handleScroll = () => {
    if (mainRef.current) {
      setShowScrollTop(mainRef.current.scrollTop > 300);
    }
  };

  const scrollToTop = () => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentSong = usePlayerStore((s) => s.currentSong);
  const [canLocatePlaying, setCanLocatePlaying] = useState(false);

  // 旧版的"极光环境层"与"模糊封面铺底"已随 Studio 体系移除：
  // 界面不再随封面变色，--aurora-* / --ambient-art 两个变量不再被任何样式消费，
  // 这里连同 toAuroraColor 一并删除，避免每帧写入无人读取的自定义属性。

  useEffect(() => {
    if (!currentSong) {
      setCanLocatePlaying(false);
      return;
    }
    // 只在"当前歌曲已经滚出可视区"时才显示定位按钮。
    // 之前只要该歌曲存在于 DOM 就显示，导致停在页面顶部时
    // 按钮也会浮在表格右缘上方，遮挡内容且没有意义。
    const check = () => {
      const container = mainRef.current;
      const el = container?.querySelector<HTMLElement>(
        `[data-song-provider="${currentSong.providerId}"][data-song-id="${CSS.escape(currentSong.id)}"]`
      );
      if (!container || !el) {
        setCanLocatePlaying(false);
        return;
      }
      const rowRect = el.getBoundingClientRect();
      const boxRect = container.getBoundingClientRect();
      const outOfView = rowRect.bottom < boxRect.top || rowRect.top > boxRect.bottom;
      setCanLocatePlaying(outOfView);
    };
    check();
    const id = window.setInterval(check, 600);
    mainRef.current?.addEventListener('scroll', check, { passive: true });
    return () => {
      window.clearInterval(id);
      mainRef.current?.removeEventListener('scroll', check);
    };
  }, [currentSong?.id, currentSong?.providerId, currentView]);

  const locatePlaying = () => {
    const song = usePlayerStore.getState().currentSong;
    if (!song) return;
    const target = mainRef.current?.querySelector<HTMLElement>(
      `[data-song-provider="${song.providerId}"][data-song-id="${CSS.escape(song.id)}"]`
    );
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('locate-flash');
    window.setTimeout(() => target.classList.remove('locate-flash'), 1400);
  };

  return (
    <div className={`app-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <div className="app-ambient" aria-hidden="true">
        <span className="aurora-veil" />
        <span className="aurora-grain" />
      </div>

      <div className="titlebar-drag" aria-hidden="true" />

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
        onOpenLogin={() => handleOpenLogin()}
      />

      <TopBar onSearch={handleSearch} onOpenLogin={handleOpenLogin} />

      <main className="main-content" ref={mainRef} onScroll={handleScroll}>
        <div className="main-content-transition-stage">
          <div className="main-content-view" key={`${currentView.name}-${JSON.stringify(currentView.params)}`}>
            {renderView(currentView)}
          </div>
        </div>
      </main>

      <ScrollIndicator targetRef={mainRef} />

      <button
        className={`scroll-to-playing-btn ${canLocatePlaying ? 'visible' : ''}`}
        onClick={locatePlaying}
        title="定位到正在播放的歌曲"
        aria-label="定位到正在播放的歌曲"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
        </svg>
      </button>

      <button
        className={`scroll-to-top-btn ${showScrollTop ? 'visible' : ''}`}
        onClick={scrollToTop}
        title="回到顶部"
        aria-label="回到顶部"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 15l-6-6-6 6"/>
        </svg>
      </button>

      <PlayerBar
        isSimilarSongsOpen={isSimilarOpen}
        onLyricsOpen={handleLyricsOpen}
        onSimilarSongsToggle={() => toggleSimilar()}
      />

      <QueuePanel />
      <SimilarSongsPanel />

      {isLyricsOpen && (
        <LyricsPanel
          transitionOrigin={lyricsTransition?.origin ?? null}
          transitionPalette={lyricsTransition?.palette ?? null}
        />
      )}

      <LoginDialog
        open={loginOpen}
        preferredProviderId={loginProviderId}
        onClose={() => setLoginOpen(false)}
      />

      <AppNotificationHost />
      <PlaybackNotice onOpenLogin={handleOpenLogin} />

      <AudioEngine />
    </div>
  );
}
