import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlaylistCategory, ProviderId } from '../../../shared/musicTypes';
import { usePlaylistDiscoveryStore } from '../../state/playlistDiscoveryStore';
import { useProviderSessionStore } from '../../state/providerSessionStore';
import { MediaCardGrid, type MediaCardData, EmptyState } from '../../components/MediaCards';
import { SkeletonCardGrid, SkeletonPills } from '../../components/Skeleton';
import { useUiStore } from '../../state/uiStore';

const EMPTY_CATEGORY_ARRAY: never[] = [];
const EMPTY_PLAYLIST_ARRAY: never[] = [];

export function PlaylistDiscoveryView() {
  const providerId = useProviderSessionStore((s) => s.activeProviderId) as ProviderId;
  const categoriesMap = usePlaylistDiscoveryStore((s) => s.categoriesByProvider);
  const categories = categoriesMap[providerId] ?? EMPTY_CATEGORY_ARRAY;
  const loadingCategories = usePlaylistDiscoveryStore((s) => s.loadingCategories[providerId]);
  const categoryStatus = usePlaylistDiscoveryStore((s) => s.statusCategoriesByProvider[providerId]);
  const categoryError = usePlaylistDiscoveryStore((s) => s.categoryErrors[providerId]);
  const loadCategories = usePlaylistDiscoveryStore((s) => s.loadCategories);
  const navigateToView = useUiStore((s) => s.navigateToView);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [allPanelOpen, setAllPanelOpen] = useState(false);
  const allButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (providerId !== 'local') {
      setActiveCategoryId(null);
      loadCategories(providerId as 'netease' | 'qq');
    }
  }, [providerId, loadCategories]);

  if (providerId === 'local') {
    return <div className="empty-state">本地音乐不支持歌单广场</div>;
  }

  const remoteProviderId = providerId as 'netease' | 'qq';
  const hotCategories = categories.filter((c) => c.hot || !c.group).slice(0, 8);
  const availableCategories = hotCategories.length > 0 ? hotCategories : categories;
  const categoryId = activeCategoryId && categories.some((c) => c.id === activeCategoryId)
    ? activeCategoryId
    : availableCategories[0]?.id;

  const groupedCategories = useRef<Map<string, PlaylistCategory[]>>(new Map());
  groupedCategories.current = new Map();
  for (const cat of categories) {
    const group = cat.group || '其他';
    const list = groupedCategories.current.get(group) ?? [];
    list.push(cat);
    groupedCategories.current.set(group, list);
  }

  return (
    <div aria-busy={Boolean(loadingCategories)} data-reveal data-reveal-order={0}>
      <div className="page-header">
        <div className="page-header-main">
          <span className="page-kicker">{remoteProviderId === 'qq' ? 'QQ 音乐' : '网易云音乐'}</span>
          <h1 className="detail-title">歌单广场</h1>
          <span className="page-subtitle">浏览发现海量优质歌单</span>
        </div>
      </div>

      {categoryStatus === 'loading' && categories.length === 0 && <SkeletonPills count={8} />}      {!loadingCategories && categoryError && !categories.length && (
        <EmptyState title="歌单分类加载失败" desc={categoryError} />
      )}

      {!loadingCategories && categories.length > 0 && (
        <div className="filter-pills-bar">
          {availableCategories.map((cat) => (
            <button
              key={cat.id}
              className={`pill-item ${categoryId === cat.id ? 'active' : ''}`}
              onClick={() => { setActiveCategoryId(cat.id); setAllPanelOpen(false); }}
            >
              {cat.name}
            </button>
          ))}
          <button
            ref={allButtonRef}
            className={`pill-item ${allPanelOpen ? 'panel-open' : ''}`}
            onClick={() => setAllPanelOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={allPanelOpen}
          >
            全部分类
          </button>
          {allPanelOpen && (
            <AllCategoriesPanel
              anchorRef={allButtonRef}
              groups={groupedCategories.current}
              activeCategoryId={categoryId}
              onSelect={(id) => {
                setActiveCategoryId(id);
                setAllPanelOpen(false);
              }}
              onClose={() => setAllPanelOpen(false)}
            />
          )}
        </div>
      )}

      <div key={categoryId ?? 'none'} className="tab-panel-enter">
        {categoryId ? (
          <CategoryPlaylistGrid
            providerId={remoteProviderId}
            categoryId={categoryId}
            onOpenPlaylist={(id, title) => navigateToView('playlist', { providerId: remoteProviderId, playlistId: id, title })}
          />
        ) : (
          !loadingCategories && !categoryError && <EmptyState title="暂无可用分类" />
        )}
      </div>
    </div>
  );
}

function AllCategoriesPanel({ anchorRef, groups, activeCategoryId, onSelect, onClose }: { anchorRef: React.RefObject<HTMLButtonElement | null>; groups: Map<string, PlaylistCategory[]>; activeCategoryId?: string; onSelect: (id: string) => void; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ right: number; top: number; maxHeight: number } | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    // 用 right 定位：面板宽度由内容决定（280–360px），用 left 计算会把
    // 右缘算错（按 420 算 → 实际 280，面板整体左移 140px）。
    // 同时按"锚点下方 → 播放坞上方"的可用空间限制高度，避免面板底部被坞压住。
    const top = rect.bottom + 8;
    const dockReserve = 114; // --stage-bottom: 14 + 86 + 14
    const available = window.innerHeight - top - dockReserve - 8;
    setPosition({
      right: Math.max(8, window.innerWidth - rect.right),
      top,
      maxHeight: Math.max(160, available)
    });
  }, [anchorRef]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.all-categories-panel')) return;
      if (target.closest('.filter-pills-bar')) {
        const btn = target.closest<HTMLButtonElement>('.pill-item');
        if (btn && btn.textContent === '全部分类') return;
      }
      onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [onClose]);

  return createPortal(
    <div
      ref={panelRef}
      className="popover-menu open all-categories-panel"
      role="menu"
      aria-label="全部分类"
      style={{
        position: 'fixed',
        right: position?.right ?? 8,
        left: 'auto',
        top: position?.top ?? 0,
        bottom: 'auto',
        maxHeight: position?.maxHeight
      }}
    >
      {Array.from(groups.entries()).map(([group, items]) => (
        <div key={group} className="all-categories-group">
          <div className="all-categories-group-title">{group}</div>
          <div className="all-categories-items">
            {items.map((cat) => (
              <button
                key={cat.id}
                role="menuitemradio"
                aria-checked={activeCategoryId === cat.id}
                className={`popover-menu-item ${activeCategoryId === cat.id ? 'active' : ''}`}
                onClick={() => onSelect(cat.id)}
              >
                <span className="popover-menu-item-label">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>,
    document.body
  );
}

function CategoryPlaylistGrid({ providerId, categoryId, onOpenPlaylist }: { providerId: 'netease' | 'qq'; categoryId: string; onOpenPlaylist: (id: string, title: string) => void }) {
  const key = `${providerId}:${categoryId}`;
  const playlistsMap = usePlaylistDiscoveryStore((s) => s.playlistsByKey);
  const playlists = playlistsMap[key] ?? EMPTY_PLAYLIST_ARRAY;
  const hasMore = usePlaylistDiscoveryStore((s) => s.hasMoreByKey[key]);
  const loading = usePlaylistDiscoveryStore((s) => s.loadingPlaylists[key]);
  const status = usePlaylistDiscoveryStore((s) => s.statusPlaylistsByKey[key]);
  const error = usePlaylistDiscoveryStore((s) => s.playlistErrors[key]);
  const loadPlaylists = usePlaylistDiscoveryStore((s) => s.loadPlaylists);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPlaylists(providerId, categoryId, 'initial');
  }, [providerId, categoryId, loadPlaylists]);

  // 用 ref 持有最新 hasMore / loading，避免 observer 因状态变化被反复重建，
  // 造成“滚到底触发 -> 追加 -> 立即再触发”的抽搐循环
  const hasMoreRef = useRef(hasMore);
  const loadingRef = useRef(loading);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const container = el.closest<HTMLElement>('.main-content') ?? null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (!hasMoreRef.current || loadingRef.current) return;
        loadPlaylists(providerId, categoryId, 'append');
      },
      { root: container, rootMargin: '400px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [providerId, categoryId, loadPlaylists]);

  const cards: MediaCardData[] = playlists.map((playlist) => ({
    id: playlist.id,
    title: playlist.title,
    subtitle: playlist.creatorName ?? playlist.sourceLabel ?? '',
    coverUrl: playlist.coverUrl,
    coverTone: playlist.coverTone,
    playCount: playlist.playCount,
    onOpen: () => onOpenPlaylist(playlist.id, playlist.title)
  }));

  // 骨架行数与真实首屏一致（PAGE_SIZE=30），避免骨架→真实替换时高度突变导致顶部抽搐
  if (status === 'loading' && playlists.length === 0) return <SkeletonCardGrid count={30} />;
  if (status === 'error' && playlists.length === 0) return <EmptyState title="歌单加载失败" desc={error ?? undefined} />;
  if ((status === 'success-empty') && playlists.length === 0) return <EmptyState title="该分类暂无歌单" />;

  const isRefreshing = status === 'refreshing';
  const isAppending = status === 'appending';

  return (
    <div>
      {isRefreshing && <div className="inline-progress" aria-hidden="true" />}
      <MediaCardGrid cards={cards} />
      {isAppending && <SkeletonCardGrid count={6} />}
      <div ref={loadMoreRef} style={{ height: 1 }} />
      {!hasMore && playlists.length > 0 && (
        <div className="list-end-note">
          已加载全部 {playlists.length} 个歌单
        </div>
      )}
    </div>
  );
}
