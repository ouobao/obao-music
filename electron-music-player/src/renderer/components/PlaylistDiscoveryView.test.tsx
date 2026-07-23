import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveredPlaylist, PlaylistCategory } from '../../shared/musicTypes';
import { useAppNotificationStore } from '../state/appNotificationStore';
import { PlaylistDiscoveryView } from './PlaylistDiscoveryView';

const categories: PlaylistCategory[] = [
  { id: 'all', providerId: 'qq', name: '全部' },
  { id: '165', providerId: 'qq', name: '流行', group: '热门', hot: true },
  { id: '1', providerId: 'qq', name: '华语', group: '语种', hot: false }
];

const playlist: DiscoveredPlaylist = {
  id: 'qq:8800',
  providerId: 'qq',
  platformPlaylistId: '8800',
  title: 'QQ 华语精选',
  description: '公开歌单',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  coverUrl: 'https://example.test/qq-playlist.jpg',
  creatorName: '歌单作者',
  playCount: 654321,
  trackCount: 36
};

describe('PlaylistDiscoveryView', () => {
  beforeEach(() => {
    useAppNotificationStore.getState().resetForTest();
  });

  it('renders provider categories and playlist metadata with working navigation callbacks', () => {
    const onProviderChange = vi.fn();
    const onCategoryChange = vi.fn();
    const onSelectPlaylist = vi.fn();
    const { container } = render(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={categories}
        playlists={[playlist]}
        isLoading={false}
        errorMessage={null}
        hasMore={false}
        onProviderChange={onProviderChange}
        onCategoryChange={onCategoryChange}
        onSelectPlaylist={onSelectPlaylist}
      />
    );

    const view = screen.getByRole('region', { name: '歌单广场' });
    expect(within(view).getByRole('button', { name: 'QQ 音乐' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(view).getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(view).getByRole('button', { name: '流行' })).toBeInTheDocument();
    expect(within(view).getByRole('button', { name: '华语' })).toBeInTheDocument();
    expect(within(view).getByRole('heading', { name: 'QQ 华语精选' })).toBeInTheDocument();
    expect(within(view).getByText('歌单作者')).toBeInTheDocument();
    expect(within(view).getByText('65.4万次播放')).toBeInTheDocument();
    expect(within(view).getByText('36 首')).toBeInTheDocument();
    expect(container.querySelector<HTMLImageElement>('.playlist-discovery-card-image')?.src)
      .toContain('qq-playlist.jpg');

    fireEvent.click(within(view).getByRole('button', { name: '网易云音乐' }));
    fireEvent.click(within(view).getByRole('button', { name: '流行' }));
    fireEvent.click(within(view).getByRole('button', { name: '打开歌单：QQ 华语精选' }));

    expect(onProviderChange).toHaveBeenCalledWith('netease');
    expect(onCategoryChange).toHaveBeenCalledWith('165');
    expect(onSelectPlaylist).toHaveBeenCalledWith(playlist);
  });

  it('keeps common categories visible and groups the full category set in a menu', () => {
    render(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="165"
        categories={categories}
        playlists={[playlist]}
        isLoading={false}
        errorMessage={null}
        hasMore={false}
      />
    );

    expect(screen.getByRole('button', { name: '流行' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('dialog', { name: '全部歌单分类' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '全部分类' }));

    const menu = screen.getByRole('dialog', { name: '全部歌单分类' });
    expect(within(within(menu).getByRole('group', { name: '精选' })).getByRole('button', { name: '全部' }))
      .toBeInTheDocument();
    expect(within(within(menu).getByRole('group', { name: '热门' })).getByRole('button', { name: '流行' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(within(within(menu).getByRole('group', { name: '语种' })).getByRole('button', { name: '华语' }))
      .toBeInTheDocument();
  });

  it('selects a less common category from the full menu and closes it', () => {
    const onCategoryChange = vi.fn();
    render(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={categories}
        playlists={[playlist]}
        isLoading={false}
        errorMessage={null}
        hasMore={false}
        onCategoryChange={onCategoryChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '全部分类' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: '全部歌单分类' })).getByRole('button', { name: '华语' }));

    expect(onCategoryChange).toHaveBeenCalledWith('1');
    expect(screen.queryByRole('dialog', { name: '全部歌单分类' })).not.toBeInTheDocument();
  });

  it('keeps shortcut order stable when a less common category becomes active', () => {
    const extendedCategories: PlaylistCategory[] = [
      ...categories,
      { id: '2', providerId: 'qq', name: '摇滚', group: '风格', hot: true },
      { id: '3', providerId: 'qq', name: '民谣', group: '风格', hot: false },
      { id: '4', providerId: 'qq', name: '电子', group: '风格', hot: true },
      { id: '5', providerId: 'qq', name: '古典', group: '风格', hot: false },
      { id: '6', providerId: 'qq', name: '爵士', group: '风格', hot: false },
      { id: '7', providerId: 'qq', name: '蓝调', group: '风格', hot: false }
    ];
    const { container, rerender } = render(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={extendedCategories}
        playlists={[playlist]}
        isLoading={false}
        errorMessage={null}
        hasMore={false}
      />
    );
    const shortcutLabels = () => Array.from(
      container.querySelectorAll('.playlist-discovery-category-shortcut'),
      (button) => button.textContent
    );
    const initialLabels = shortcutLabels();

    rerender(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="6"
        categories={extendedCategories}
        playlists={[playlist]}
        isLoading={false}
        errorMessage={null}
        hasMore={false}
      />
    );

    expect(shortcutLabels()).toEqual(initialLabels);
    expect(container.querySelector('.playlist-discovery-category-shortcut[aria-pressed="true"]')).not.toBeInTheDocument();
  });

  it('keeps discovery chrome mounted while handing a new collection to the local transition slot', () => {
    const nextPlaylist: DiscoveredPlaylist = {
      ...playlist,
      id: 'qq:9900',
      platformPlaylistId: '9900',
      title: 'QQ 娴佽绮鹃€?'
    };
    const { container, rerender } = render(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={categories}
        playlists={[playlist]}
        isLoading={false}
        errorMessage={null}
        hasMore={false}
      />
    );
    const header = container.querySelector('.provider-page-header');
    const categoryNavigation = container.querySelector('.playlist-discovery-category-switcher');

    rerender(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="165"
        categories={categories}
        playlists={[nextPlaylist]}
        isLoading={false}
        errorMessage={null}
        hasMore={false}
      />
    );

    expect(container.querySelector('.provider-page-header')).toBe(header);
    expect(container.querySelector('.playlist-discovery-category-switcher')).toBe(categoryNavigation);
    expect(container.querySelector('.playlist-discovery-results')).toHaveAttribute('data-collection-key', 'qq:165');
    expect(container.querySelector('.playlist-discovery-results .main-content-transition-stage')).toHaveAttribute(
      'data-transition-scope',
      'section'
    );
    expect(container.querySelector('.playlist-discovery-category-active')).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.playlist-discovery-card-copy h2')).toHaveTextContent(nextPlaylist.title);
  });

  it('updates depth only on the active cover scene and recenters on leave', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(16);
      return 1;
    });
    const { container } = render(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={categories}
        playlists={[playlist]}
        isLoading={false}
        errorMessage={null}
        hasMore={false}
      />
    );
    const scene = container.querySelector<HTMLElement>('.playlist-discovery-card-scene');
    if (!scene) {
      throw new Error('Playlist depth scene did not render');
    }
    vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 200,
      height: 200,
      right: 300,
      bottom: 300,
      x: 100,
      y: 100,
      toJSON: () => ({})
    });

    expect(scene.querySelector('.playlist-discovery-card-image')).toBeInTheDocument();
    expect(scene.querySelector('.playlist-discovery-card-sheen')).toBeInTheDocument();
    expect(scene.querySelector('.playlist-discovery-card-overlay')).toBeInTheDocument();

    act(() => {
      fireEvent.pointerMove(scene, { clientX: 280, clientY: 120 });
    });
    expect(scene.style.getPropertyValue('--playlist-card-rotate-x')).not.toBe('0deg');
    expect(scene.style.getPropertyValue('--playlist-card-rotate-y')).not.toBe('0deg');

    fireEvent.pointerLeave(scene);
    expect(scene.style.getPropertyValue('--playlist-card-rotate-x')).toBe('0deg');
    expect(scene.style.getPropertyValue('--playlist-card-rotate-y')).toBe('0deg');
  });

  it('keeps only source and incremental loading controls without shifting the card grid', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={categories}
        playlists={[playlist]}
        isLoading={false}
        errorMessage={null}
        hasMore
        onLoadMore={onLoadMore}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '加载更多歌单' }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '刷新歌单广场' })).not.toBeInTheDocument();

    rerender(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={categories}
        playlists={[playlist]}
        isLoading
        errorMessage={null}
        hasMore
        onLoadMore={onLoadMore}
      />
    );

    expect(screen.getByRole('button', { name: '加载更多歌单' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'QQ 华语精选' })).toBeInTheDocument();
  });

  it('shows an append-specific loader without rendering a refresh control', () => {
    render(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={categories}
        playlists={[playlist]}
        isLoading
        loadingKind="append"
        errorMessage={null}
        hasMore
      />
    );

    const loadMoreButton = screen.getByRole('button', { name: '加载更多歌单' });

    expect(screen.queryByRole('button', { name: '刷新歌单广场' })).not.toBeInTheDocument();
    expect(loadMoreButton).toBeDisabled();
    expect(within(loadMoreButton).getByTestId('playlist-discovery-load-more-loader')).toBeInTheDocument();
    expect(within(loadMoreButton).getByText('正在加载')).toBeInTheDocument();
  });

  it('marks only playlists added by the completed append request for entry motion', async () => {
    const appendedPlaylist: DiscoveredPlaylist = {
      ...playlist,
      id: 'qq:9900',
      platformPlaylistId: '9900',
      title: '新追加歌单'
    };
    const baseProps = {
      providerId: 'qq' as const,
      categoryId: 'all',
      categories,
      errorMessage: null,
      hasMore: true
    };
    const { rerender } = render(
      <PlaylistDiscoveryView
        {...baseProps}
        playlists={[playlist]}
        isLoading={false}
        loadingKind={null}
      />
    );

    rerender(
      <PlaylistDiscoveryView
        {...baseProps}
        playlists={[playlist]}
        isLoading
        loadingKind="append"
      />
    );
    rerender(
      <PlaylistDiscoveryView
        {...baseProps}
        playlists={[playlist, appendedPlaylist]}
        isLoading={false}
        loadingKind={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '打开歌单：新追加歌单' }).closest('article'))
        .toHaveAttribute('data-entry', 'append');
    });
    expect(screen.getByRole('button', { name: `打开歌单：${playlist.title}` }).closest('article'))
      .not.toHaveAttribute('data-entry');
  });

  it('caps append motion to the first visible card batch', async () => {
    const appendedPlaylists = Array.from({ length: 14 }, (_, index): DiscoveredPlaylist => ({
      ...playlist,
      id: `qq:append-${index}`,
      platformPlaylistId: `append-${index}`,
      title: `追加歌单 ${index + 1}`
    }));
    const baseProps = {
      providerId: 'qq' as const,
      categoryId: 'all',
      categories,
      errorMessage: null,
      hasMore: true
    };
    const { container, rerender } = render(
      <PlaylistDiscoveryView
        {...baseProps}
        playlists={[playlist]}
        isLoading={false}
        loadingKind={null}
      />
    );

    rerender(
      <PlaylistDiscoveryView
        {...baseProps}
        playlists={[playlist]}
        isLoading
        loadingKind="append"
      />
    );
    rerender(
      <PlaylistDiscoveryView
        {...baseProps}
        playlists={[playlist, ...appendedPlaylists]}
        isLoading={false}
        loadingKind={null}
      />
    );

    await waitFor(() => {
      expect(container.querySelectorAll('[data-entry="append"]')).toHaveLength(12);
    });
  });

  it('clears append entry markers when a refresh starts', async () => {
    const appendedPlaylist: DiscoveredPlaylist = {
      ...playlist,
      id: 'qq:9900',
      platformPlaylistId: '9900',
      title: '新追加歌单'
    };
    const baseProps = {
      providerId: 'qq' as const,
      categoryId: 'all',
      categories,
      errorMessage: null,
      hasMore: true
    };
    const { rerender } = render(
      <PlaylistDiscoveryView
        {...baseProps}
        playlists={[playlist]}
        isLoading={false}
        loadingKind={null}
      />
    );

    rerender(
      <PlaylistDiscoveryView
        {...baseProps}
        playlists={[playlist]}
        isLoading
        loadingKind="append"
      />
    );
    rerender(
      <PlaylistDiscoveryView
        {...baseProps}
        playlists={[playlist, appendedPlaylist]}
        isLoading={false}
        loadingKind={null}
      />
    );

    const appendedCard = screen
      .getByRole('button', { name: '打开歌单：新追加歌单' })
      .closest('article');
    await waitFor(() => {
      expect(appendedCard).toHaveAttribute('data-entry', 'append');
    });

    rerender(
      <PlaylistDiscoveryView
        {...baseProps}
        playlists={[playlist, appendedPlaylist]}
        isLoading
        loadingKind="refresh"
      />
    );

    await waitFor(() => {
      expect(appendedCard).not.toHaveAttribute('data-entry');
    });
  });

  it('does not carry an append entry baseline into another collection', async () => {
    const neteasePlaylist: DiscoveredPlaylist = {
      ...playlist,
      id: 'netease:4400',
      providerId: 'netease',
      platformPlaylistId: '4400',
      title: '网易云新分类歌单'
    };
    const { rerender } = render(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={categories}
        playlists={[playlist]}
        isLoading={false}
        loadingKind={null}
        errorMessage={null}
        hasMore
      />
    );

    rerender(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={categories}
        playlists={[playlist]}
        isLoading
        loadingKind="append"
        errorMessage={null}
        hasMore
      />
    );
    rerender(
      <PlaylistDiscoveryView
        providerId="netease"
        categoryId="学习"
        categories={[]}
        playlists={[neteasePlaylist]}
        isLoading={false}
        loadingKind={null}
        errorMessage={null}
        hasMore={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '打开歌单：网易云新分类歌单' }).closest('article'))
        .not.toHaveAttribute('data-entry');
    });
  });

  it('captures the baseline when switching into a collection already appending', async () => {
    const neteasePlaylist: DiscoveredPlaylist = {
      ...playlist,
      id: 'netease:4400',
      providerId: 'netease',
      platformPlaylistId: '4400',
      title: '网易云缓存歌单'
    };
    const appendedPlaylist: DiscoveredPlaylist = {
      ...playlist,
      id: 'qq:9900',
      platformPlaylistId: '9900',
      title: '新追加歌单'
    };
    const { rerender } = render(
      <PlaylistDiscoveryView
        providerId="netease"
        categoryId="学习"
        categories={[]}
        playlists={[neteasePlaylist]}
        isLoading={false}
        loadingKind={null}
        errorMessage={null}
        hasMore
      />
    );

    rerender(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={categories}
        playlists={[playlist]}
        isLoading
        loadingKind="append"
        errorMessage={null}
        hasMore
      />
    );
    rerender(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={categories}
        playlists={[playlist, appendedPlaylist]}
        isLoading={false}
        loadingKind={null}
        errorMessage={null}
        hasMore
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '打开歌单：新追加歌单' }).closest('article'))
        .toHaveAttribute('data-entry', 'append');
    });
    expect(screen.getByRole('button', { name: `打开歌单：${playlist.title}` }).closest('article'))
      .not.toHaveAttribute('data-entry');
  });

  it('marks the first loaded card batch before it is painted after an initial skeleton', async () => {
    const { rerender } = render(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={categories}
        playlists={[]}
        isLoading
        loadingKind="initial"
        errorMessage={null}
        hasMore={false}
      />
    );

    rerender(
      <PlaylistDiscoveryView
        providerId="qq"
        categoryId="all"
        categories={categories}
        playlists={[playlist]}
        isLoading={false}
        loadingKind={null}
        errorMessage={null}
        hasMore={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: `打开歌单：${playlist.title}` }).closest('article'))
        .toHaveAttribute('data-entry', 'append');
    });
  });

  it('renders initial loading, error, and empty states', () => {
    const { container, rerender } = render(
      <PlaylistDiscoveryView
        providerId="netease"
        categoryId="all"
        categories={[]}
        playlists={[]}
        isLoading
        loadingKind={null}
        errorMessage={null}
        hasMore={false}
      />
    );

    expect(screen.getByRole('region', { name: '歌单广场' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveClass('visually-hidden');
    expect(screen.getByRole('status')).toHaveTextContent('正在加载歌单');
    expect(container.querySelectorAll('.playlist-discovery-skeleton-card')).toHaveLength(10);

    rerender(
      <PlaylistDiscoveryView
        providerId="netease"
        categoryId="all"
        categories={[]}
        playlists={[]}
        isLoading={false}
        errorMessage="歌单加载失败"
        hasMore={false}
      />
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('歌单加载失败')).not.toBeInTheDocument();
    expect(useAppNotificationStore.getState().notification).toMatchObject({
      key: 'playlist-discovery:netease:all',
      message: '歌单加载失败',
      tone: 'error'
    });

    rerender(
      <PlaylistDiscoveryView
        providerId="netease"
        categoryId="all"
        categories={categories.map((category) => ({ ...category, providerId: 'netease' }))}
        playlists={[]}
        isLoading={false}
        errorMessage={null}
        hasMore={false}
      />
    );
    expect(screen.getByText('当前分类暂无歌单')).toBeInTheDocument();
  });
});
