import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Playlist } from '../../shared/musicTypes';
import { useLibraryStore } from '../state/libraryStore';
import { Sidebar } from './Sidebar';

const qqPlaylist: Playlist = {
  id: 'qq:8800',
  providerId: 'qq',
  title: 'QQ Playlist',
  description: '18 songs',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  coverUrl: 'https://y.qq.com/cover.jpg',
  sourceLabel: 'QQ Music',
  ownership: 'created'
};

const qqLikedPlaylist: Playlist = {
  id: 'qq:liked',
  providerId: 'qq',
  title: 'QQ Liked',
  description: '6 songs',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  sourceLabel: 'QQ Music',
  ownership: 'liked',
  isLiked: true
};

const qqSubscribedPlaylist: Playlist = {
  id: 'qq:subscribed-1',
  providerId: 'qq',
  title: 'QQ Subscribed Playlist',
  description: '31 songs',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  coverUrl: 'https://y.qq.com/subscribed.jpg',
  sourceLabel: 'QQ Music',
  ownership: 'subscribed'
};

const neteasePlaylist: Playlist = {
  id: 'netease:9900',
  providerId: 'netease',
  title: 'Netease Playlist',
  description: '24 songs',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  coverUrl: 'https://music.163.com/cover.jpg',
  sourceLabel: 'Netease',
  ownership: 'created'
};

describe('Sidebar', () => {
  beforeEach(() => {
    useLibraryStore.getState().resetForTest();
  });

  it('renders the Ou Bao Music brand name and logo', () => {
    const { container } = render(<Sidebar />);

    expect(screen.getByText('欧包音乐')).toBeInTheDocument();
    expect(container.querySelector('.brand-mark img')?.getAttribute('src')).toContain('oubao-logo.svg');
  });

  it('only exposes implemented primary navigation entries', () => {
    const { container } = render(<Sidebar />);

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    expect(within(navigation).getByRole('button', { name: '发现音乐' })).toBeInTheDocument();
    expect(within(navigation).getByRole('button', { name: '排行榜' })).toBeInTheDocument();
    expect(within(navigation).getByRole('button', { name: '歌单广场' })).toBeInTheDocument();
    expect(within(navigation).queryByRole('button', { name: '私人漫游' })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('button', { name: '播客电台' })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('button', { name: '我的音乐' })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('button', { name: '下载管理' })).not.toBeInTheDocument();
    expect(container.querySelector('.sidebar-scroll-area .nav-top-section')).toBeInTheDocument();
    expect(container.querySelector('.sidebar-scroll-area .nav-provider-library-section')).toBeInTheDocument();
  });

  it('opens the implemented charts page and marks it as the active primary view', () => {
    const onNavigateCharts = vi.fn();
    render(<Sidebar currentView={{ type: 'charts', providerId: 'qq' }} onNavigateCharts={onNavigateCharts} />);

    const chartsButton = screen.getByRole('button', { name: '排行榜' });
    expect(chartsButton).toHaveClass('nav-item-active');
    expect(screen.getByRole('button', { name: '发现音乐' })).not.toHaveClass('nav-item-active');

    fireEvent.click(chartsButton);
    expect(onNavigateCharts).toHaveBeenCalledTimes(1);
  });

  it('opens the playlist discovery page and marks it as the active primary view', () => {
    const onNavigatePlaylistDiscovery = vi.fn();
    render(
      <Sidebar
        currentView={{ type: 'playlistDiscovery', providerId: 'qq', categoryId: 'all' }}
        onNavigatePlaylistDiscovery={onNavigatePlaylistDiscovery}
      />
    );

    const discoveryButton = screen.getByRole('button', { name: '歌单广场' });
    expect(discoveryButton).toHaveClass('nav-item-active');
    expect(screen.getByRole('button', { name: '排行榜' })).not.toHaveClass('nav-item-active');

    fireEvent.click(discoveryButton);
    expect(onNavigatePlaylistDiscovery).toHaveBeenCalledTimes(1);
  });

  it('keeps primary navigation and provider playlist selection mutually exclusive', () => {
    useLibraryStore.setState({
      providerPlaylists: {
        qq: [qqPlaylist]
      }
    });

    const { container, rerender } = render(
      <Sidebar currentView={{ type: 'playlist', providerId: 'qq', playlistId: qqPlaylist.id }} />
    );
    const homeButton = screen.getByRole('button', { name: '发现音乐' });
    const playlistButton = screen.getByRole('button', { name: /QQ Playlist/ });

    expect(container.querySelectorAll('.nav-item-active, .nav-playlist-item-active')).toHaveLength(1);
    expect(homeButton).not.toHaveClass('nav-item-active');
    expect(playlistButton).toHaveClass('nav-playlist-item-active');
    expect(playlistButton).toHaveAttribute('aria-pressed', 'true');

    rerender(<Sidebar currentView={{ type: 'home' }} />);

    expect(container.querySelectorAll('.nav-item-active, .nav-playlist-item-active')).toHaveLength(1);
    expect(homeButton).toHaveClass('nav-item-active');
    expect(homeButton).toHaveAttribute('aria-current', 'page');
    expect(playlistButton).not.toHaveClass('nav-playlist-item-active');
    expect(playlistButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not render offline mock playlists when provider playlists are unavailable', () => {
    const { container, rerender } = render(<Sidebar />);

    expect(container.querySelectorAll('.nav-playlist-cover')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /QQ Playlist/ })).not.toBeInTheDocument();

    useLibraryStore.setState({
      providerPlaylists: {
        qq: [qqPlaylist]
      }
    });

    rerender(<Sidebar />);

    expect(screen.getByRole('button', { name: /QQ Playlist/ })).toBeInTheDocument();
    expect(container.querySelectorAll('.nav-playlist-cover')).toHaveLength(1);
  });

  it('renders compact playlist covers in provider playlist categories', () => {
    useLibraryStore.setState({
      providerPlaylists: {
        qq: [qqPlaylist]
      }
    });

    const { container } = render(<Sidebar />);

    expect(container.querySelector('.nav-playlist-cover')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /QQ Playlist/ })).toHaveClass('nav-playlist-item');
  });

  it('groups playlist libraries by category and switches the active provider tab', () => {
    useLibraryStore.setState({
      providerPlaylists: {
        qq: [qqPlaylist],
        netease: [neteasePlaylist]
      }
    });

    const { container } = render(<Sidebar />);
    const createdSection = screen.getByRole('group', { name: /created/i });
    const providerTabs = within(createdSection).getByRole('tablist');

    expect(container.querySelectorAll('.nav-library-category')).toHaveLength(1);
    expect(createdSection.querySelector('.nav-library-category-trigger svg')).toBeInTheDocument();
    expect(within(providerTabs).getByRole('tab', { name: 'QQ 音乐' })).toHaveAttribute('aria-selected', 'true');
    expect(within(createdSection).getByRole('button', { name: /QQ Playlist/ })).toHaveClass('nav-playlist-item');

    fireEvent.click(within(providerTabs).getByRole('tab', { name: '网易云音乐' }));

    expect(within(providerTabs).getByRole('tab', { name: '网易云音乐' })).toHaveAttribute('aria-selected', 'true');
    expect(within(createdSection).getByRole('button', { name: /Netease Playlist/ })).toHaveClass('nav-playlist-item');
    expect(createdSection.querySelector('.main-content-transition-stage')).toHaveAttribute('data-transition-style', 'soft');
    expect(container.querySelector('.nav-provider-library-section')).toBeInTheDocument();
  });

  it('renders liked, created, and subscribed categories without duplicating platform groups', () => {
    const onSelectProviderPlaylist = vi.fn();
    useLibraryStore.setState({
      providerPlaylists: {
        qq: [qqLikedPlaylist, qqPlaylist, qqSubscribedPlaylist]
      }
    });

    const { container } = render(<Sidebar onSelectProviderPlaylist={onSelectProviderPlaylist} />);
    const likedSection = screen.getByRole('group', { name: /liked/i });
    const createdSection = screen.getByRole('group', { name: /created/i });
    const subscribedSection = screen.getByRole('group', { name: /subscribed/i });
    const likedItem = likedSection.querySelector<HTMLButtonElement>('.nav-library-liked-playlist-item');
    const createdItem = within(createdSection).getByRole('button', { name: /QQ Playlist/ });
    const subscribedItem = within(subscribedSection).getByRole('button', { name: /QQ Subscribed Playlist/ });

    expect(container.querySelector('.nav-library-playlist-section')).not.toBeInTheDocument();
    expect(container.querySelector('.nav-playlist-section')).not.toBeInTheDocument();
    expect(container.querySelector('.nav-provider-group')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.nav-library-category')).toHaveLength(3);
    expect(likedSection.querySelector('.nav-library-category-trigger')).toHaveAttribute('aria-expanded', 'true');
    expect(likedSection.querySelector('.nav-library-category-trigger svg')).toBeInTheDocument();
    expect(createdSection.querySelector('.nav-library-category-trigger svg')).toBeInTheDocument();
    expect(subscribedSection.querySelector('.nav-library-category-trigger svg')).toBeInTheDocument();
    expect(likedItem).toBeInTheDocument();
    expect(likedItem?.querySelector('.nav-playlist-cover')).not.toBeInTheDocument();
    expect(likedItem?.querySelector('svg')).not.toBeInTheDocument();
    expect(createdItem.querySelector('.nav-playlist-cover')).toBeInTheDocument();
    expect(subscribedItem.querySelector('.nav-playlist-cover')).toBeInTheDocument();

    fireEvent.click(likedItem as HTMLButtonElement);

    expect(onSelectProviderPlaylist).toHaveBeenCalledWith('qq', 'qq:liked');
  });

  it('keeps library drawers out of the compact navigation', () => {
    useLibraryStore.setState({
      providerPlaylists: {
        qq: [qqLikedPlaylist, qqPlaylist],
        netease: [neteasePlaylist]
      }
    });

    const { container } = render(<Sidebar isCollapsed />);
    expect(container.querySelector('.nav-provider-heading')).not.toBeInTheDocument();
    expect(container.querySelector('.nav-library-category-heading')).not.toBeInTheDocument();
    expect(container.querySelector('.nav-library-liked-playlist-item')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /QQ Playlist/ })).not.toBeInTheDocument();
  });

  it('opens and closes a library category drawer from its parent heading', () => {
    useLibraryStore.setState({
      providerPlaylists: {
        qq: [qqLikedPlaylist]
      }
    });

    render(<Sidebar />);

    const likedSection = screen.getByRole('group', { name: /liked/i });
    const trigger = within(likedSection).getByRole('button', { name: '我喜欢' });
    expect(likedSection.querySelector('.nav-library-liked-playlist-item')).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(likedSection.querySelector('.nav-library-category-drawer')).toHaveAttribute('aria-hidden', 'true');
  });

  it('removes the local music entry from the primary navigation', () => {
    render(<Sidebar />);

    expect(screen.queryByRole('button', { name: /local music/i })).not.toBeInTheDocument();
  });

  it('places the refresh control beside the collapse toggle when expanded and above it when collapsed', () => {
    const onRefreshProviderLibrary = vi.fn();
    const onToggleSidebarCollapsed = vi.fn();
    const { container, rerender } = render(
      <Sidebar
        canRefreshProviderLibrary
        isCollapsed={false}
        onRefreshProviderLibrary={onRefreshProviderLibrary}
        onToggleSidebarCollapsed={onToggleSidebarCollapsed}
      />
    );

    const expandedRefresh = container.querySelector<HTMLButtonElement>('.sidebar-refresh-button') as HTMLButtonElement;
    const expandedCollapse = container.querySelector<HTMLButtonElement>('.sidebar-collapse-toggle') as HTMLButtonElement;
    const expandedControls = container.querySelector('.sidebar-bottom-controls');
    fireEvent.click(expandedRefresh);

    expect(onRefreshProviderLibrary).toHaveBeenCalledTimes(1);
    expect(expandedControls?.children[0]).toBe(expandedCollapse);
    expect(expandedControls?.children[1]).toBe(expandedRefresh);

    rerender(
      <Sidebar
        canRefreshProviderLibrary
        isCollapsed
        onRefreshProviderLibrary={onRefreshProviderLibrary}
        onToggleSidebarCollapsed={onToggleSidebarCollapsed}
      />
    );

    const collapsedRefresh = container.querySelector<HTMLButtonElement>('.sidebar-refresh-button') as HTMLButtonElement;
    const collapsedCollapse = container.querySelector<HTMLButtonElement>('.sidebar-collapse-toggle') as HTMLButtonElement;
    const collapsedControls = container.querySelector('.sidebar-bottom-controls');

    expect(collapsedControls?.children[0]).toBe(collapsedRefresh);
    expect(collapsedControls?.children[1]).toBe(collapsedCollapse);
    expect(collapsedRefresh).toHaveClass('sidebar-refresh-button');
  });

  it('renders a bottom collapse toggle and switches its accessible label by state', () => {
    const onToggleSidebarCollapsed = vi.fn();
    const { container, rerender } = render(
      <Sidebar isCollapsed={false} onToggleSidebarCollapsed={onToggleSidebarCollapsed} />
    );

    fireEvent.click(container.querySelector<HTMLButtonElement>('.sidebar-collapse-toggle') as HTMLButtonElement);
    expect(onToggleSidebarCollapsed).toHaveBeenCalledTimes(1);

    rerender(<Sidebar isCollapsed onToggleSidebarCollapsed={onToggleSidebarCollapsed} />);

    expect(container.querySelector('.sidebar-collapse-toggle')).toBeInTheDocument();
  });
});
