import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AlbumDetail,
  ArtistDetail,
  ChartSummary,
  DiscoveredPlaylist,
  Playlist,
  PlaylistCategory,
  Program,
  ProviderId,
  RemoteProviderId,
  Song
} from '../shared/musicTypes';
import type { SearchEntityResults } from '../shared/providerTypes';
import { App } from './App';
import { useArtistCatalogStore } from './state/artistCatalogStore';
import { useAppNotificationStore } from './state/appNotificationStore';
import { useChartsStore } from './state/chartsStore';
import { useDiscoveryHomeStore } from './state/discoveryHomeStore';
import { useFrequentArtistAlbumsStore } from './state/frequentArtistAlbumsStore';
import { useLibraryStore } from './state/libraryStore';
import { useLyricsStore } from './state/lyricsStore';
import { usePlayerStore } from './state/playerStore';
import { usePlaylistDiscoveryStore } from './state/playlistDiscoveryStore';
import { useProviderSessionStore } from './state/providerSessionStore';
import { useReleaseCatalogStore } from './state/releaseCatalogStore';
import { useSearchHistoryStore } from './state/searchHistoryStore';
import { useSearchStore } from './state/searchStore';
import { useUiStore } from './state/uiStore';
import { useVisualStore } from './state/visualStore';
import { createMusicPlayerApi } from './test/fixtures/musicPlayerApi';
import { qqHomePlaylists, qqSearchSongs } from './test/fixtures/musicFixtures';
import { visualThemes } from './visual/visualThemes';

const qqDiscoveryNewSong: Song = {
  ...qqSearchSongs[0],
  id: 'qq:discovery-new-song',
  platformSongId: 'discovery-new-song',
  title: 'QQ 发现新歌'
};

const neteasePlaylist: Playlist = {
  id: 'netease:6688',
  providerId: 'netease',
  title: '我喜欢的音乐',
  description: '私人收藏',
  songIds: ['netease:42'],
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  sourceLabel: '网易云',
  isLiked: true
};

const neteaseSong: Song = {
  id: 'netease:42',
  providerId: 'netease',
  platformSongId: '42',
  title: '晴天',
  artist: '周杰伦',
  album: '叶惠美',
  durationMs: 269000,
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  coverUrl: 'https://p1.music.126.net/song.jpg',
  sourceContext: {
    type: 'playlist',
    providerId: 'netease',
    playlistId: 'netease:6688',
    playlistTitle: '我喜欢的音乐'
  }
};

const neteaseQueueTailSong: Song = {
  ...neteaseSong,
  id: 'netease:queue-tail',
  platformSongId: 'queue-tail',
  title: '队列原有下一首'
};

const neteaseProgram: Program = {
  id: 'netease:program:100',
  mediaType: 'program',
  providerId: 'netease',
  platformProgramId: '100',
  title: '播客节目：凌晨电台',
  description: '节目描述',
  durationMs: 1_800_000,
  coverTone: 'linear-gradient(135deg, #5e4fc7, #1f2937)',
  coverUrl: 'https://example.test/program.jpg',
  podcast: {
    id: 'netease:podcast:100',
    providerId: 'netease',
    platformPodcastId: '100',
    title: '深夜声场',
    description: '播客描述',
    author: '主播小满',
    coverTone: 'linear-gradient(135deg, #5e4fc7, #1f2937)'
  },
  sourceContext: {
    type: 'podcast',
    providerId: 'netease',
    podcastId: 'netease:podcast:100',
    podcastTitle: '深夜声场'
  }
};

const neteaseSimilarSongs: Song[] = Array.from({ length: 3 }, (_, index) => ({
  ...neteaseSong,
  id: `netease:similar-${index + 1}`,
  platformSongId: `similar-${index + 1}`,
  title: `相似歌曲 ${index + 1}`,
  sourceContext: undefined
}));

const localSong: Song = {
  id: 'local:1111222233334444',
  providerId: 'local',
  platformSongId: '1111222233334444',
  title: 'Local Song',
  artist: 'Unknown Artist',
  album: 'Local Album',
  durationMs: 0,
  coverTone: 'linear-gradient(135deg, #4f8aa8, #30343b)',
  sourceContext: {
    type: 'local',
    providerId: 'local'
  }
};

const qqQueueSong: Song = {
  id: 'qq:queue-song',
  providerId: 'qq',
  platformSongId: 'queue-song',
  title: 'Queue Song',
  artist: 'Queue Artist',
  album: 'Queue Album',
  durationMs: 218000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  sourceContext: {
    type: 'playlist',
    providerId: 'qq',
    playlistId: 'qq:queue-playlist',
    playlistTitle: 'Queue Playlist'
  }
};

const qqChart: ChartSummary = {
  id: 'qq:chart:62',
  providerId: 'qq',
  platformChartId: '62',
  title: 'QQ 飙升榜',
  description: 'QQ 排行榜',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  sourceLabel: 'QQ音乐',
  updateLabel: '每日更新'
};

const neteaseChart: ChartSummary = {
  id: 'netease:chart:19723756',
  providerId: 'netease',
  platformChartId: '19723756',
  title: '网易云飙升榜',
  description: '网易云排行榜',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  sourceLabel: '网易云',
  updateLabel: '每天更新'
};

const neteaseChartSong: Song = {
  ...neteaseSong,
  sourceContext: {
    type: 'playlist',
    providerId: 'netease',
    playlistId: neteaseChart.id,
    playlistTitle: neteaseChart.title
  }
};

const qqDiscoveryPlaylist: DiscoveredPlaylist = {
  id: 'qq:8800',
  providerId: 'qq',
  platformPlaylistId: '8800',
  title: 'QQ 流行歌单',
  description: 'QQ 公开歌单',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  sourceLabel: 'QQ音乐'
};

const neteaseDiscoveryPlaylist: DiscoveredPlaylist = {
  id: 'netease:9900',
  providerId: 'netease',
  platformPlaylistId: '9900',
  title: '网易云公开歌单',
  description: '网易云歌单广场',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  sourceLabel: '网易云'
};

const neteaseDiscoverySong: Song = {
  ...neteaseSong,
  id: 'netease:9901',
  platformSongId: '9901',
  title: '网易云公开歌曲',
  sourceContext: {
    type: 'playlist',
    providerId: 'netease',
    playlistId: neteaseDiscoveryPlaylist.id,
    playlistTitle: neteaseDiscoveryPlaylist.title
  }
};

const qqDiscoveryCategory: PlaylistCategory = {
  id: '165',
  providerId: 'qq',
  name: '流行',
  hot: true
};

const neteaseDiscoveryCategory: PlaylistCategory = {
  id: '华语',
  providerId: 'netease',
  name: '华语',
  hot: true
};

function createSearchEntityResults(
  providerId: RemoteProviderId,
  keyword: string,
  songs: Song[] = [],
  sectionOverrides: Partial<SearchEntityResults['sections']> = {}
): SearchEntityResults {
  const sections: SearchEntityResults['sections'] = {
    songs: {
      available: true,
      items: songs,
      total: songs.length,
      hasMore: false,
      errorMessage: null
    },
    artists: {
      available: true,
      items: [],
      total: 0,
      hasMore: false,
      errorMessage: null
    },
    albums: {
      available: true,
      items: [],
      total: 0,
      hasMore: false,
      errorMessage: null
    },
    playlists: {
      available: true,
      items: [],
      total: 0,
      hasMore: false,
      errorMessage: null
    }
  };

  return {
    providerId,
    keyword,
    sections: {
      ...sections,
      ...sectionOverrides
    }
  };
}

function seedQueueSong(song: Song = qqQueueSong) {
  return usePlayerStore.getState().enqueueSong(song, song.sourceContext ?? {
    type: 'playlist',
    providerId: song.providerId
  });
}

function seedCurrentNeteaseQueue() {
  const currentItem = seedQueueSong(neteaseSong);
  seedQueueSong(neteaseQueueTailSong);
  usePlayerStore.setState({
    currentQueueItemId: currentItem.id,
    currentSong: neteaseSong,
    currentPlaybackUrl: 'https://example.test/current-song.mp3',
    playbackStatus: 'ready',
    playbackPositionMs: 42_000,
    playbackDurationMs: neteaseSong.durationMs,
    isPlaying: true
  });
  return currentItem;
}

function snapshotPlaybackState() {
  const state = usePlayerStore.getState();
  return structuredClone({
    queue: state.queue,
    queueSongs: state.queueSongs,
    currentQueueItemId: state.currentQueueItemId,
    currentSong: state.currentSong,
    currentPlaybackUrl: state.currentPlaybackUrl,
    playbackStatus: state.playbackStatus,
    playbackPositionMs: state.playbackPositionMs,
    playbackDurationMs: state.playbackDurationMs,
    isPlaying: state.isPlaying
  });
}

function findLyricLineText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLElement>('.lyric-line-text')).find((line) => line.textContent === text);
}

function findPrimaryNowPlayingTitle(container: HTMLElement, title: string) {
  return Array.from(container.querySelectorAll<HTMLElement>('.now-playing-title-track > span:not(.now-playing-title-duplicate)')).find(
    (line) => line.textContent === title
  );
}

function createPointerEventPosition(element: HTMLElement, x: number, y: number) {
  const rect = element.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : window.innerWidth || 1440;
  const height = rect.height > 0 ? rect.height : window.innerHeight || 900;
  const left = rect.width > 0 ? rect.left : 0;
  const top = rect.height > 0 ? rect.top : 0;

  return {
    clientX: left + width * x,
    clientY: top + height * y
  };
}

describe('App shell', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.reduceEffects;
    useAppNotificationStore.getState().resetForTest();
    useArtistCatalogStore.getState().resetForTest();
    useChartsStore.getState().resetForTest();
    useDiscoveryHomeStore.getState().resetForTest();
    useFrequentArtistAlbumsStore.getState().resetForTest();
    useLibraryStore.getState().resetForTest();
    useLyricsStore.getState().resetForTest();
    usePlayerStore.getState().resetForTest();
    usePlaylistDiscoveryStore.getState().resetForTest();
    useProviderSessionStore.getState().resetForTest();
    useReleaseCatalogStore.getState().resetForTest();
    useSearchHistoryStore.getState().clear();
    useSearchStore.getState().resetForTest();
    useUiStore.getState().resetForTest();
    useVisualStore.getState().resetForTest();
    window.musicPlayer = {
      app: {
        getVersion: async () => '0.1.0'
      },
      window: {
        minimize: () => undefined,
        toggleMaximize: () => undefined,
        toggleFullscreen: () => undefined,
        close: () => undefined
      },
      music: {
        ...createMusicPlayerApi().music,
        getLoginStatus: async (providerId) => ({
          ok: true,
          data: { providerId, loggedIn: false, playbackReady: false }
        }),
        login: async (providerId) => ({
          ok: true,
          data: {
            providerId,
            loggedIn: true,
            nickname: providerId === 'netease' ? '网易云用户' : 'QQ 用户',
            playbackReady: providerId !== 'qq',
            message: providerId === 'qq' ? 'QQ 音乐已登录，播放授权不完整' : undefined
          }
        }),
        logout: async () => ({ ok: true, data: undefined }),
        search: async () => ({ ok: true, data: [] }),
        getSearchSuggestions: async () => ({ ok: true, data: [] }),
        getSearchHotSearches: async () => ({ ok: true, data: [] }),
        searchEntities: async (providerId, keyword) => ({
          ok: true,
          data: createSearchEntityResults(providerId, keyword)
        }),
        getUserPlaylists: async () => ({ ok: true, data: [] }),
        getPlaylistTracks: async () => ({ ok: true, data: [] }),
        getSongUrl: async (_providerId, song, quality) => ({
          ok: true,
          data: {
            ok: true,
            providerId: song.providerId,
            quality,
            url: 'https://example.test/song.mp3'
          }
        }),
        getLyrics: async (_providerId, song) => ({
          ok: true,
          data: {
            ok: true,
            providerId: song.providerId,
            lrc: '[00:01.00]Bridge lyric line'
          }
        }),
        setSongLiked: async (providerId, _song, liked) => ({ ok: true, data: { providerId, operation: liked ? 'like' : 'unlike' } }),
        addSongToPlaylist: async (providerId) => ({ ok: true, data: { providerId, operation: 'add_to_playlist' } }),
        removeSongFromPlaylist: async (providerId) => ({ ok: true, data: { providerId, operation: 'remove_from_playlist' } }),
        getCharts: async () => ({ ok: true, data: [] }),
        getChartTracks: async () => ({ ok: true, data: [] }),
        importLocalFiles: async () => ({ ok: true, data: [] })
      }
    };
  });

  afterEach(() => {
    useAppNotificationStore.getState().resetForTest();
    vi.useRealTimers();
  });

  it('renders the primary music player regions', () => {
    const { container } = render(<App />);

    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '搜索音乐' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: '首页内容' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '播放队列' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '底部播放栏' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '发现音乐' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '3D 推荐墙' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'UI 对照来源' })).not.toBeInTheDocument();
    const themeButton = screen.getByRole('button', { name: '主题设置' });
    expect(themeButton).toBeInTheDocument();
    expect(within(themeButton).getByText('主题')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '通知' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '最小化窗口' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '最大化窗口' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭窗口' })).toBeInTheDocument();
  });

  it('prevents Tab focus traversal without blurring the focused search box', () => {
    render(<App />);

    const searchbox = screen.getByRole('combobox', { name: '搜索音乐' });
    searchbox.focus();
    expect(searchbox).toHaveFocus();

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    searchbox.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(searchbox).toHaveFocus();
  });

  it('routes every main view through the selected transition and effective reduced-effects policy', () => {
    const { container } = render(<App />);
    const transition = container.querySelector<HTMLElement>('.main-content-transition-stage') as HTMLElement;

    expect(transition).toHaveAttribute('data-transition-key', 'home');
    expect(transition).toHaveAttribute('data-transition-style', 'soft');
    expect(document.documentElement).not.toHaveAttribute('data-reduce-effects');

    act(() => {
      useUiStore.getState().navigateToView({ type: 'charts', providerId: 'qq' });
      useUiStore.getState().setContentTransitionStyle('directional');
      useUiStore.getState().setReduceEffects(true);
    });

    expect(transition).toHaveAttribute('data-transition-key', 'charts:qq');
    expect(transition).toHaveAttribute('data-transition-style', 'directional');
    expect(transition).toHaveAttribute('data-reduce-effects', 'true');
    expect(transition.querySelectorAll(':scope > .main-content-transition-layer')).toHaveLength(1);
    expect(document.documentElement).toHaveAttribute('data-reduce-effects', 'true');
  });

  it('resets the shared main scroll position when route content changes', () => {
    render(<App />);
    const mainContent = screen.getByRole('main', { name: '首页内容' });

    mainContent.scrollTop = 264;
    mainContent.scrollLeft = 32;

    act(() => {
      useUiStore.getState().navigateToView({ type: 'charts', providerId: 'qq' });
    });

    expect(mainContent.scrollTop).toBe(0);
    expect(mainContent.scrollLeft).toBe(0);
  });

  it('keeps the shell material unchanged while nested content scrolls', () => {
    const { container } = render(<App />);
    const shell = container.querySelector<HTMLElement>('.desktop-shell') as HTMLElement;
    const mainContent = screen.getByRole('main', { name: '首页内容' });

    fireEvent.scroll(mainContent);
    expect(shell).not.toHaveAttribute('data-scrolling');
  });

  it('navigates across both chart sources, opens real tracks, and restores the source on back', async () => {
    const getCharts = vi.fn(async (providerId: 'qq' | 'netease') => ({
      ok: true as const,
      data: providerId === 'qq' ? [qqChart] : [neteaseChart]
    }));
    const getChartTracks = vi.fn(async (providerId: 'qq' | 'netease', chartId: string) => ({
      ok: true as const,
      data: providerId === 'netease' && chartId === neteaseChart.id ? [neteaseChartSong] : []
    }));
    window.musicPlayer.music.getCharts = getCharts;
    window.musicPlayer.music.getChartTracks = getChartTracks;

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '排行榜' }));
    let chartsView = await screen.findByRole('region', { name: '排行榜' });
    expect(await within(chartsView).findByRole('button', { name: '打开榜单：QQ 飙升榜' })).toBeInTheDocument();

    fireEvent.click(within(chartsView).getByRole('button', { name: '网易云音乐' }));
    expect(await screen.findByRole('button', { name: '打开榜单：网易云飙升榜' })).toBeInTheDocument();
    chartsView = screen.getByRole('region', { name: '排行榜' });

    fireEvent.click(within(chartsView).getByRole('button', { name: '打开榜单：网易云飙升榜' }));
    const detail = await screen.findByRole('region', { name: '排行榜详情' });
    expect(getChartTracks).toHaveBeenCalledWith('netease', neteaseChart.id);
    expect(within(detail).getByText(neteaseChartSong.title)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '后退' }));
    const restoredChartsView = await screen.findByRole('region', { name: '排行榜' });
    expect(within(restoredChartsView).getByRole('button', { name: '网易云音乐' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('browses both playlist sources, resets categories, opens details, and restores discovery history', async () => {
    const qqCategories: PlaylistCategory[] = [
      { id: 'all', providerId: 'qq', name: '全部' },
      { id: '165', providerId: 'qq', name: '流行', group: '热门', hot: true }
    ];
    const neteaseCategories: PlaylistCategory[] = [
      { id: 'all', providerId: 'netease', name: '全部' },
      { id: '华语', providerId: 'netease', name: '华语', group: '语种', hot: true }
    ];
    const getPlaylistCategories = vi.fn(async (providerId: 'qq' | 'netease') => ({
      ok: true as const,
      data: providerId === 'qq' ? qqCategories : neteaseCategories
    }));
    const getDiscoveredPlaylists = vi.fn(async (
      providerId: 'qq' | 'netease',
      query: { categoryId: string; limit?: number; offset?: number }
    ) => ({
      ok: true as const,
      data: {
        providerId,
        categoryId: query.categoryId,
        playlists: providerId === 'qq' ? [qqDiscoveryPlaylist] : [neteaseDiscoveryPlaylist],
        offset: query.offset ?? 0,
        limit: query.limit ?? 30,
        total: 1,
        hasMore: false
      }
    }));
    const getPlaylistTracks = vi.fn(async (providerId: ProviderId, playlistId: string) => ({
      ok: true as const,
      data: providerId === 'netease' && playlistId === neteaseDiscoveryPlaylist.id
        ? [neteaseDiscoverySong]
        : []
    }));
    window.musicPlayer.music.getPlaylistCategories = getPlaylistCategories;
    window.musicPlayer.music.getDiscoveredPlaylists = getDiscoveredPlaylists;
    window.musicPlayer.music.getPlaylistTracks = getPlaylistTracks;

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '歌单广场' }));
    let discoveryView = await screen.findByRole('region', { name: '歌单广场' });
    expect(await within(discoveryView).findByRole('heading', { name: 'QQ 流行歌单' })).toBeInTheDocument();

    fireEvent.click(within(discoveryView).getByRole('button', { name: '流行' }));
    await waitFor(() => {
      expect(getDiscoveredPlaylists).toHaveBeenCalledWith('qq', {
        categoryId: '165',
        limit: 30,
        offset: 0
      });
      expect(screen.getByTestId('main-content-transition')).toHaveAttribute(
        'data-transition-key',
        'playlistDiscovery:qq:165'
      );
    });
    discoveryView = screen.getByRole('region', { name: '歌单广场' });

    fireEvent.click(within(discoveryView).getByRole('button', { name: '网易云音乐' }));
    expect(await screen.findByRole('heading', { name: '网易云公开歌单' })).toBeInTheDocument();
    discoveryView = screen.getByRole('region', { name: '歌单广场' });
    expect(within(discoveryView).getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(discoveryView).getByRole('button', { name: '打开歌单：网易云公开歌单' }));
    const detail = await screen.findByRole('region', { name: '歌单详情' });
    expect(getPlaylistTracks).toHaveBeenCalledWith('netease', neteaseDiscoveryPlaylist.id);
    expect(await within(detail).findByText('网易云公开歌曲')).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole('button', { name: /加入队列：网易云公开歌曲/ }));
    fireEvent.click(screen.getByRole('button', { name: '展开播放队列' }));
    expect(await within(await screen.findByRole('complementary', { name: '播放队列' })).findByText('网易云公开歌曲'))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '后退' }));
    await waitFor(() => {
      expect(screen.getByTestId('main-content-transition')).toHaveAttribute(
        'data-transition-key',
        'playlistDiscovery:netease:all'
      );
    });
    discoveryView = screen.getByRole('region', { name: '歌单广场' });
    expect(within(discoveryView).getByRole('button', { name: '网易云音乐' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(discoveryView).getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '后退' }));
    await waitFor(() => {
      expect(screen.getByTestId('main-content-transition')).toHaveAttribute(
        'data-transition-key',
        'playlistDiscovery:qq:165'
      );
    });
    discoveryView = screen.getByRole('region', { name: '歌单广场' });
    expect(within(discoveryView).getByRole('button', { name: 'QQ 音乐' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(discoveryView).getByRole('button', { name: '流行' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not render tracks or request state from another selection when restoring a playlist route', () => {
    useLibraryStore.setState({
      providerPlaylists: { netease: [neteasePlaylist] },
      playlistTracks: {},
      selectedProviderId: 'qq',
      selectedPlaylistId: 'qq:queue-playlist',
      selectedPlaylistTracks: [qqQueueSong],
      isLoading: true,
      errorMessage: 'Other playlist request failed'
    });
    useUiStore.getState().navigateToView({
      type: 'playlist',
      providerId: 'netease',
      playlistId: neteasePlaylist.id
    });

    render(<App />);

    const detail = screen.getByRole('region', { name: '歌单详情' });
    expect(within(detail).queryByText(qqQueueSong.title)).not.toBeInTheDocument();
    expect(within(detail).queryByRole('status')).not.toBeInTheDocument();
    expect(within(detail).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('collapses and expands the sidebar while the content frame follows the shell state', () => {
    vi.useFakeTimers();
    const { container } = render(<App />);
    const shell = container.querySelector('.desktop-shell');

    expect(shell).toHaveClass('sidebar-expanded');
    expect(shell).not.toHaveClass('sidebar-collapsed');
    expect(shell).not.toHaveClass('sidebar-transitioning');

    fireEvent.click(screen.getByRole('button', { name: '收起菜单' }));

    expect(shell).toHaveClass('sidebar-collapsed');
    expect(shell).not.toHaveClass('sidebar-expanded');
    expect(shell).toHaveClass('sidebar-transitioning');
    expect(screen.getByRole('button', { name: '展开菜单' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(319);
    });

    expect(shell).toHaveClass('sidebar-transitioning');

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(shell).not.toHaveClass('sidebar-transitioning');

    fireEvent.click(screen.getByRole('button', { name: '展开菜单' }));

    expect(shell).toHaveClass('sidebar-expanded');
    expect(shell).not.toHaveClass('sidebar-collapsed');
    expect(shell).toHaveClass('sidebar-transitioning');
  });

  it('renders distinct public discovery homes while keeping account playlists in the sidebar', async () => {
    window.musicPlayer.music.getLoginStatus = async (providerId) => ({
      ok: true,
      data: {
        providerId,
        loggedIn: providerId === 'qq',
        nickname: providerId === 'qq' ? 'QQ 用户' : undefined,
        playbackReady: providerId !== 'qq'
      }
    });
    window.musicPlayer.music.getUserPlaylists = async (providerId) => ({
      ok: true,
      data: providerId === 'qq' ? qqHomePlaylists : []
    });
    const getCharts = vi.fn(async () => ({ ok: true as const, data: [qqChart] }));
    const getChartTracks = vi.fn(async () => ({ ok: true as const, data: [neteaseChartSong] }));
    const getPlaylistCategories = vi.fn(async () => ({
      ok: true as const,
      data: [qqDiscoveryCategory]
    }));
    const getDiscoveredPlaylists = vi.fn(async () => ({
      ok: true as const,
      data: {
        providerId: 'qq' as const,
        categoryId: 'all',
        playlists: [qqDiscoveryPlaylist],
        offset: 0,
        limit: 30,
        total: 1,
        hasMore: false
      }
    }));
    const getRecommendationHome = vi.fn(async (providerId: 'qq' | 'netease') => ({
      ok: true as const,
      data: {
        providerId,
        loggedIn: false,
        dailySongs: providerId === 'netease' ? [neteaseChartSong] : [],
        newSongs: providerId === 'netease' ? [neteaseDiscoverySong] : [qqDiscoveryNewSong],
        moduleResults: {
          daily: {
            status: providerId === 'netease' ? 'fulfilled' as const : 'skipped' as const,
            errorMessage: null
          },
          new: { status: 'fulfilled' as const, errorMessage: null }
        }
      }
    }));
    const getNewAlbums = vi.fn(async (providerId: 'qq' | 'netease') => ({
      ok: true as const,
      data: [{
        id: `${providerId}:album:discovery-release`,
        providerId,
        platformAlbumId: 'discovery-release',
        title: providerId === 'qq' ? 'QQ 发现新碟' : '网易发现新碟',
        artistName: '发现歌手',
        coverTone: 'linear-gradient(135deg, #417a6b, #cc9d37)'
      }]
    }));
    window.musicPlayer.music.getCharts = getCharts;
    window.musicPlayer.music.getChartTracks = getChartTracks;
    window.musicPlayer.music.getPlaylistCategories = getPlaylistCategories;
    window.musicPlayer.music.getDiscoveredPlaylists = getDiscoveredPlaylists;
    window.musicPlayer.music.getRecommendationHome = getRecommendationHome;
    window.musicPlayer.music.getNewAlbums = getNewAlbums;

    const { container } = render(<App />);

    const sidebar = screen.getByRole('navigation', { name: '主导航' });
    expect(await within(sidebar).findByRole('button', { name: /夏日通勤/ })).toBeInTheDocument();
    expect(await screen.findByLabelText('QQ 音乐发现内容')).toBeInTheDocument();
    const discoveryHome = screen.getByRole('region', { name: '发现音乐' });
    expect(container.querySelector('.qq-discovery-home')).toBeInTheDocument();
    expect(container.querySelector('.netease-discovery-home')).not.toBeInTheDocument();
    expect(within(discoveryHome).queryByText('夏日通勤')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.qq-discovery-service-card')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /暂不可用/ })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', {
      name: `播放歌曲：${qqDiscoveryNewSong.title} - ${qqDiscoveryNewSong.artist}`
    })).toBeEnabled();
    expect(screen.getByRole('button', { name: '刷新发现音乐' })).toBeEnabled();
    expect(getRecommendationHome).toHaveBeenCalledTimes(1);
    expect(getRecommendationHome).toHaveBeenCalledWith('qq');
    expect(await screen.findByRole('button', { name: '打开专辑：QQ 发现新碟' })).toBeEnabled();
    expect(getNewAlbums).toHaveBeenCalledTimes(1);
    expect(getNewAlbums).toHaveBeenCalledWith('qq');
    expect(getCharts).not.toHaveBeenCalled();
    expect(getChartTracks).not.toHaveBeenCalled();
    expect(getPlaylistCategories).not.toHaveBeenCalled();
    expect(getDiscoveredPlaylists).not.toHaveBeenCalled();

    const sourceControl = screen.getByRole('group', { name: '发现音乐来源' });
    fireEvent.click(within(sourceControl).getByRole('button', { name: '网易云音乐' }));

    expect(await screen.findByLabelText('网易云音乐发现内容')).toBeInTheDocument();
    expect(container.querySelector('.qq-discovery-home')).not.toBeInTheDocument();
    expect(container.querySelector('.netease-discovery-home')).toBeInTheDocument();
    expect(container.querySelectorAll('.netease-discovery-feature-card')).toHaveLength(1);
    expect(await screen.findByRole('button', { name: '播放每日推荐' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: '最新音乐' })).toBeInTheDocument();
    expect(container.querySelectorAll('.netease-discovery-playlist-card')).toHaveLength(0);
    expect(container.querySelectorAll('.netease-discovery-chart-card')).toHaveLength(0);
    expect(getRecommendationHome).toHaveBeenCalledTimes(2);
    expect(getRecommendationHome).toHaveBeenCalledWith('netease');
    expect(await screen.findByRole('button', { name: '打开专辑：网易发现新碟' })).toBeEnabled();
    expect(getNewAlbums).toHaveBeenCalledTimes(2);
    expect(getNewAlbums).toHaveBeenCalledWith('netease');
    expect(getCharts).not.toHaveBeenCalled();
    expect(getChartTracks).not.toHaveBeenCalled();
    expect(getPlaylistCategories).not.toHaveBeenCalled();
    expect(getDiscoveredPlaylists).not.toHaveBeenCalled();
  });

  it('opens discovery new albums in the existing album detail view without changing playback', async () => {
    const releaseAlbum: AlbumDetail = {
      id: 'qq:album:discovery-release',
      providerId: 'qq',
      platformAlbumId: 'discovery-release',
      title: 'QQ 发现新碟',
      artistName: '发现歌手',
      coverTone: 'linear-gradient(135deg, #417a6b, #cc9d37)',
      releaseDate: '2026-07-18',
      description: '发现页新碟详情',
      artists: [],
      tracks: [qqDiscoveryNewSong]
    };
    const getNewAlbums = vi.fn(async () => ({ ok: true as const, data: [releaseAlbum] }));
    const getAlbumDetail = vi.fn(async () => ({ ok: true as const, data: releaseAlbum }));
    window.musicPlayer.music.getNewAlbums = getNewAlbums;
    window.musicPlayer.music.getAlbumDetail = getAlbumDetail;
    const playbackBeforeLoad = snapshotPlaybackState();

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: `打开专辑：${releaseAlbum.title}` }));

    const albumDetail = await screen.findByRole('region', { name: '专辑详情' });
    expect(within(albumDetail).getByRole('heading', { name: releaseAlbum.title, level: 1 }))
      .toBeInTheDocument();
    expect(getNewAlbums).toHaveBeenCalledWith('qq');
    expect(getAlbumDetail).toHaveBeenCalledWith('qq', releaseAlbum.id);
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);
  });

  it('keeps recommendation collection navigation separate from its direct play action', async () => {
    window.musicPlayer.music.getRecommendationHome = async (providerId) => ({
      ok: true,
      data: {
        providerId,
        loggedIn: false,
        dailySongs: [],
        newSongs: [qqDiscoveryNewSong],
        moduleResults: {
          daily: { status: 'skipped', errorMessage: null },
          new: { status: 'fulfilled', errorMessage: null }
        }
      }
    });

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '播放新歌推荐' }));
    const playbackAfterDirectPlay = snapshotPlaybackState();
    expect(usePlayerStore.getState().currentSong?.id).toBe(qqDiscoveryNewSong.id);

    fireEvent.click(screen.getByRole('button', { name: '打开新歌推荐' }));
    const detail = await screen.findByRole('region', { name: '推荐集合详情' });
    expect(within(detail).getByRole('heading', { name: '新歌推荐', level: 1 })).toBeInTheDocument();
    expect(within(detail).getByText(qqDiscoveryNewSong.title)).toBeInTheDocument();
    expect(usePlayerStore.getState()).toMatchObject({
      queue: playbackAfterDirectPlay.queue,
      queueSongs: playbackAfterDirectPlay.queueSongs,
      currentQueueItemId: playbackAfterDirectPlay.currentQueueItemId,
      currentSong: playbackAfterDirectPlay.currentSong
    });
    expect(useUiStore.getState().currentView).toEqual({
      type: 'recommendationCollection',
      providerId: 'qq',
      collectionId: 'new'
    });

    fireEvent.click(screen.getByRole('button', { name: '后退' }));
    expect(await screen.findByLabelText('QQ 音乐发现内容')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '前进' }));
    expect(await screen.findByRole('region', { name: '推荐集合详情' })).toBeInTheDocument();
    expect(usePlayerStore.getState()).toMatchObject({
      queue: playbackAfterDirectPlay.queue,
      queueSongs: playbackAfterDirectPlay.queueSongs,
      currentQueueItemId: playbackAfterDirectPlay.currentQueueItemId,
      currentSong: playbackAfterDirectPlay.currentSong
    });
  });

  it('starts real provider song modules without chart or playlist fallbacks', async () => {
    const getCharts = vi.fn(async () => ({ ok: true as const, data: [qqChart] }));
    const getChartTracks = vi.fn(async () => ({ ok: true as const, data: qqSearchSongs }));
    const getPlaylistCategories = vi.fn(async () => ({ ok: true as const, data: [qqDiscoveryCategory] }));
    const getDiscoveredPlaylists = vi.fn(async () => ({
      ok: true as const,
      data: {
        providerId: 'qq' as const,
        categoryId: 'all',
        playlists: [qqDiscoveryPlaylist],
        offset: 0,
        limit: 30,
        total: 1,
        hasMore: false
      }
    }));
    window.musicPlayer.music.getCharts = getCharts;
    window.musicPlayer.music.getChartTracks = getChartTracks;
    window.musicPlayer.music.getPlaylistCategories = getPlaylistCategories;
    window.musicPlayer.music.getDiscoveredPlaylists = getDiscoveredPlaylists;
    window.musicPlayer.music.getRecommendationHome = async (providerId) => ({
      ok: true,
      data: {
        providerId,
        loggedIn: true,
        dailySongs: providerId === 'netease' ? [neteaseChartSong] : [],
        newSongs: providerId === 'netease' ? [neteaseDiscoverySong] : [qqDiscoveryNewSong],
        moduleResults: {
          daily: {
            status: providerId === 'netease' ? 'fulfilled' as const : 'skipped' as const,
            errorMessage: null
          },
          new: { status: 'fulfilled' as const, errorMessage: null }
        }
      }
    });

    render(<App />);
    expect(await screen.findByLabelText('QQ 音乐发现内容')).toBeInTheDocument();
    expect(usePlayerStore.getState().currentSong).toBeNull();
    fireEvent.doubleClick(await screen.findByRole('button', {
      name: `播放歌曲：${qqDiscoveryNewSong.title} - ${qqDiscoveryNewSong.artist}`
    }));
    expect(usePlayerStore.getState().currentSong?.id).toBe(qqDiscoveryNewSong.id);
    expect(usePlayerStore.getState().currentSong?.sourceContext).toEqual({
      type: 'recommendation',
      providerId: 'qq',
      playlistTitle: '新歌推荐'
    });
    expect(getCharts).not.toHaveBeenCalled();
    expect(getChartTracks).not.toHaveBeenCalled();
    expect(getPlaylistCategories).not.toHaveBeenCalled();
    expect(getDiscoveredPlaylists).not.toHaveBeenCalled();

    const sourceControl = screen.getByRole('group', { name: '发现音乐来源' });
    fireEvent.click(within(sourceControl).getByRole('button', { name: '网易云音乐' }));
    fireEvent.click(await screen.findByRole('button', { name: '播放每日推荐' }));

    expect(usePlayerStore.getState().currentSong?.id).toBe(neteaseChartSong.id);
    expect(usePlayerStore.getState().currentSong?.sourceContext).toEqual({
      type: 'recommendation',
      providerId: 'netease',
      playlistTitle: '每日推荐'
    });
    expect(screen.getByText('已开始播放每日推荐')).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByRole('button', {
      name: `播放歌曲：${neteaseDiscoverySong.title} - ${neteaseDiscoverySong.artist}`
    }));
    expect(usePlayerStore.getState().currentSong?.id).toBe(neteaseDiscoverySong.id);
    expect(usePlayerStore.getState().currentSong?.sourceContext).toEqual({
      type: 'recommendation',
      providerId: 'netease',
      playlistTitle: '最新音乐'
    });
    expect(screen.getByText('已开始播放最新音乐')).toBeInTheDocument();
    expect(getCharts).not.toHaveBeenCalled();
    expect(getChartTracks).not.toHaveBeenCalled();
    expect(getPlaylistCategories).not.toHaveBeenCalled();
    expect(getDiscoveredPlaylists).not.toHaveBeenCalled();
  });

  it('loads current-song recommendations only after an explicit click and never mutates playback state', async () => {
    seedCurrentNeteaseQueue();
    const getSimilarSongs = vi.fn(async () => ({ ok: true as const, data: neteaseSimilarSongs }));
    window.musicPlayer.music.getSimilarSongs = getSimilarSongs;
    const playbackBeforeLoad = snapshotPlaybackState();

    render(
      <StrictMode>
        <App />
      </StrictMode>
    );

    expect(getSimilarSongs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {
      name: `打开当前歌曲相似推荐：${neteaseSong.title}`
    }));

    const panel = await screen.findByRole('complementary', { name: '当前歌曲相似推荐' });
    expect(await within(panel).findByText(neteaseSimilarSongs[0].title)).toBeInTheDocument();
    expect(getSimilarSongs).toHaveBeenCalledTimes(1);
    expect(getSimilarSongs).toHaveBeenCalledWith('netease', neteaseSong);
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);

    fireEvent.click(within(panel).getByRole('button', { name: '刷新相似推荐' }));
    await waitFor(() => expect(getSimilarSongs).toHaveBeenCalledTimes(2));
    expect(getSimilarSongs).toHaveBeenLastCalledWith('netease', neteaseSong, { forceRefresh: true });
    expect(await within(panel).findByText(neteaseSimilarSongs[0].title)).toBeInTheDocument();
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);

    fireEvent.click(within(panel).getByRole('button', { name: '关闭相似推荐' }));
    expect(panel).toHaveAttribute('data-state', 'closed');
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);
  });

  it('keeps a Program out of lyrics, similar-song and song-mutation workflows', async () => {
    seedCurrentNeteaseQueue();
    const getSimilarSongs = vi.fn(async () => ({ ok: true as const, data: neteaseSimilarSongs }));
    const getLyrics = vi.spyOn(window.musicPlayer.music, 'getLyrics');
    const setSongLiked = vi.spyOn(window.musicPlayer.music, 'setSongLiked');
    const addSongToPlaylist = vi.spyOn(window.musicPlayer.music, 'addSongToPlaylist');
    const removeSongFromPlaylist = vi.spyOn(window.musicPlayer.music, 'removeSongFromPlaylist');
    window.musicPlayer.music.getSimilarSongs = getSimilarSongs;

    render(<App />);
    fireEvent.click(screen.getByRole('button', {
      name: `打开当前歌曲相似推荐：${neteaseSong.title}`
    }));
    expect(await screen.findByRole('complementary', { name: '当前歌曲相似推荐' })).toBeInTheDocument();

    act(() => usePlayerStore.setState({
      currentMedia: neteaseProgram,
      currentSong: neteaseSong,
      isLyricsOpen: true
    }));

    await waitFor(() => {
      expect(usePlayerStore.getState().isLyricsOpen).toBe(false);
      expect(screen.queryByRole('complementary', { name: '当前歌曲相似推荐' })).not.toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /打开歌词页/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /当前歌曲相似推荐/ })).not.toBeInTheDocument();
    expect(document.querySelector('.lyrics-panel')).not.toBeInTheDocument();
    expect(getSimilarSongs).toHaveBeenCalledTimes(1);
    expect(getLyrics).not.toHaveBeenCalled();
    expect(setSongLiked).not.toHaveBeenCalled();
    expect(addSongToPlaylist).not.toHaveBeenCalled();
    expect(removeSongFromPlaylist).not.toHaveBeenCalled();
  });

  it('does not automatically retry a failed similar-song request', async () => {
    seedCurrentNeteaseQueue();
    const getSimilarSongs = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: 'provider_failed' as const,
        providerId: 'netease' as const,
        message: '相似推荐暂不可用'
      }
    }));
    window.musicPlayer.music.getSimilarSongs = getSimilarSongs;
    const playbackBeforeLoad = snapshotPlaybackState();

    render(<App />);
    fireEvent.click(screen.getByRole('button', {
      name: `打开当前歌曲相似推荐：${neteaseSong.title}`
    }));

    expect(await screen.findByRole('alert')).toHaveTextContent('相似推荐暂不可用');
    await act(async () => Promise.resolve());
    expect(getSimilarSongs).toHaveBeenCalledTimes(1);
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);

    fireEvent.click(screen.getByRole('button', { name: '刷新相似推荐' }));
    await waitFor(() => expect(getSimilarSongs).toHaveBeenCalledTimes(2));
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);
  });

  it('keeps an empty similar-song response separate from the playback queue', async () => {
    seedCurrentNeteaseQueue();
    const getSimilarSongs = vi.fn(async () => ({ ok: true as const, data: [] as Song[] }));
    window.musicPlayer.music.getSimilarSongs = getSimilarSongs;
    const playbackBeforeLoad = snapshotPlaybackState();

    render(<App />);
    fireEvent.click(screen.getByRole('button', {
      name: `打开当前歌曲相似推荐：${neteaseSong.title}`
    }));

    expect(await screen.findByText('当前歌曲暂无相似推荐')).toBeInTheDocument();
    expect(getSimilarSongs).toHaveBeenCalledTimes(1);
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);
  });

  it('closes and clears stale recommendations when the current song changes', async () => {
    seedCurrentNeteaseQueue();
    let resolveSimilarSongs: ((result: { ok: true; data: Song[] }) => void) | undefined;
    const getSimilarSongs = vi.fn(() => new Promise<{ ok: true; data: Song[] }>((resolve) => {
      resolveSimilarSongs = resolve;
    }));
    window.musicPlayer.music.getSimilarSongs = getSimilarSongs;
    const playbackBeforeLoad = snapshotPlaybackState();

    render(<App />);
    fireEvent.click(screen.getByRole('button', {
      name: `打开当前歌曲相似推荐：${neteaseSong.title}`
    }));
    const pendingPanel = await screen.findByRole('complementary', { name: '当前歌曲相似推荐' });
    expect(within(pendingPanel).getByRole('status')).toHaveTextContent('正在加载相似推荐');
    expect(getSimilarSongs).toHaveBeenCalledTimes(1);
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);

    const tailItem = usePlayerStore.getState().queue.find((item) => item.songId === neteaseQueueTailSong.id);
    act(() => usePlayerStore.setState({
      currentQueueItemId: tailItem?.id ?? null,
      currentSong: neteaseQueueTailSong
    }));
    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: '当前歌曲相似推荐' })).not.toBeInTheDocument();
    });

    await act(async () => {
      resolveSimilarSongs?.({ ok: true, data: neteaseSimilarSongs });
      await Promise.resolve();
    });

    expect(screen.queryByText(neteaseSimilarSongs[0].title)).not.toBeInTheDocument();
    expect(getSimilarSongs).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', {
      name: `打开当前歌曲相似推荐：${neteaseQueueTailSong.title}`
    })).toBeInTheDocument();
  });

  it('keeps the queue panel and current-song recommendations mutually exclusive', async () => {
    seedCurrentNeteaseQueue();
    window.musicPlayer.music.getSimilarSongs = async () => ({ ok: true, data: neteaseSimilarSongs });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '展开播放队列' }));
    const queuePanel = await screen.findByRole('complementary', { name: '播放队列' });
    expect(queuePanel).toHaveAttribute('data-state', 'open');

    fireEvent.click(screen.getByRole('button', {
      name: `打开当前歌曲相似推荐：${neteaseSong.title}`
    }));
    const similarPanel = await screen.findByRole('complementary', { name: '当前歌曲相似推荐' });
    expect(similarPanel).toHaveAttribute('data-state', 'open');
    expect(queuePanel).toHaveAttribute('data-state', 'closed');

    fireEvent.click(screen.getByRole('button', { name: '展开播放队列' }));
    await waitFor(() => expect(
      screen.getByRole('complementary', { name: '播放队列' })
    ).toHaveAttribute('data-state', 'open'));
    expect(similarPanel).toHaveAttribute('data-state', 'closed');
  });

  it.each([
    {
      action: 'play next',
      buttonName: `下一首播放：${neteaseSimilarSongs[1].title}`,
      expectedQueue: [neteaseSong.id, neteaseSimilarSongs[1].id, neteaseQueueTailSong.id],
      expectedCurrentSongId: neteaseSong.id
    },
    {
      action: 'play one',
      buttonName: `播放相似歌曲：${neteaseSimilarSongs[1].title}`,
      expectedQueue: neteaseSimilarSongs.map((song) => song.id),
      expectedCurrentSongId: neteaseSimilarSongs[1].id
    },
    {
      action: 'play all',
      buttonName: '播放全部',
      expectedQueue: neteaseSimilarSongs.map((song) => song.id),
      expectedCurrentSongId: neteaseSimilarSongs[0].id
    }
  ])('writes the queue only for the explicit $action action', async ({
    buttonName,
    expectedQueue,
    expectedCurrentSongId
  }) => {
    const currentItem = seedCurrentNeteaseQueue();
    window.musicPlayer.music.getSimilarSongs = async () => ({ ok: true, data: neteaseSimilarSongs });

    render(<App />);
    fireEvent.click(screen.getByRole('button', {
      name: `打开当前歌曲相似推荐：${neteaseSong.title}`
    }));
    const panel = await screen.findByRole('complementary', { name: '当前歌曲相似推荐' });
    expect(await within(panel).findByText(neteaseSimilarSongs[0].title)).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: buttonName }));
    const playerState = usePlayerStore.getState();
    expect(playerState.queue.map((item) => item.songId)).toEqual(expectedQueue);
    expect(playerState.currentSong?.id).toBe(expectedCurrentSongId);

    if (buttonName.startsWith('下一首播放')) {
      expect(playerState.currentQueueItemId).toBe(currentItem.id);
      expect(playerState.currentPlaybackUrl).toBe('https://example.test/current-song.mp3');
      expect(playerState.playbackPositionMs).toBe(42_000);
      expect(playerState.queue[1].sourceContext).toEqual({
        type: 'recommendation',
        providerId: 'netease',
        playlistTitle: '相似推荐'
      });
    } else {
      expect(playerState.queue.every((item) => (
        item.sourceContext?.type === 'recommendation'
        && item.sourceContext.providerId === 'netease'
        && item.sourceContext.playlistTitle === '相似推荐'
      ))).toBe(true);
    }
  });

  it('mounts the audio engine for playback URLs', () => {
    const { container } = render(<App />);

    expect(container.querySelector('audio[preload="none"]')).toBeInTheDocument();
  });

  it('renders an empty queue state without offline mock source labels', async () => {
    render(<App />);


    fireEvent.click(screen.getByRole('button', { name: '展开播放队列' }));
    const queue = await screen.findByRole('complementary', { name: '播放队列' });

    expect(within(queue).getByText('播放队列为空')).toBeInTheDocument();
    expect(within(queue).queryByText(/Mock/)).not.toBeInTheDocument();
  });

  it('renders queue rows as simple list items without canvas texture layers', async () => {
    seedQueueSong();
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '展开播放队列' }));
    const queue = await screen.findByRole('complementary', { name: '播放队列' });
    const rows = within(queue).getAllByRole('button', { name: /播放队列第/ });
    const canvases = container.querySelectorAll<HTMLCanvasElement>('.queue-card-canvas');

    expect(rows).toHaveLength(1);
    expect(canvases).toHaveLength(0);
    expect(rows[0].querySelector('.queue-number')).not.toBeInTheDocument();
    expect(rows[0].querySelector('.queue-row-plane')).not.toBeInTheDocument();
    expect(rows[0].querySelector('.queue-row-content')).toHaveTextContent('Queue Artist');
  });

  it('collapses the queue panel from outside clicks while keeping panel interactions open', async () => {
    seedQueueSong();
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '展开播放队列' }));
    const queue = await screen.findByRole('complementary', { name: '播放队列' });

    fireEvent.pointerDown(within(queue).getByRole('button', { name: /Queue Song/ }));
    expect(screen.getByRole('complementary', { name: '播放队列' })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('main', { name: '首页内容' }));

    await waitFor(() => {
      expect(container.querySelector<HTMLElement>('.queue-panel')).toHaveAttribute('data-state', 'closed');
    });
  });

  it('starts playback from the queue and opens the lyrics panel from the cover artwork', async () => {
    seedQueueSong();
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '展开播放队列' }));
    const queue = await screen.findByRole('complementary', { name: '播放队列' });
    fireEvent.doubleClick(within(queue).getByRole('button', { name: /Queue Song/ }));

    const playerBar = screen.getByRole('region', { name: '底部播放栏' });
    expect(playerBar.querySelector<HTMLElement>('.now-playing-title')).toHaveAttribute('title', qqQueueSong.title);
    expect(within(playerBar).getByRole('button', { name: '暂停' })).toBeInTheDocument();

    const playerActions = container.querySelector<HTMLElement>('.player-actions') as HTMLElement;
    expect(within(playerActions).queryByRole('button', { name: '打开歌词页' })).not.toBeInTheDocument();

    fireEvent.click(within(playerBar).getByRole('button', { name: /Queue Song/ }));
    expect(await screen.findByRole('dialog', { name: '歌词详情' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '歌词详情' })).toHaveAttribute('data-transition-origin', 'player-cover');
    const stage = await screen.findByRole('region', { name: '3D 播放舞台' });
    expect(stage).toBeInTheDocument();
    const lyricsPanel = container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;
    const centerPointer = createPointerEventPosition(lyricsPanel, 0.5, 0.5);
    const rightPointer = createPointerEventPosition(lyricsPanel, 0.75, 0.5);

    fireEvent.mouseMove(stage, centerPointer);
    expect(stage).toHaveStyle('--pointer-x: 0.5');

    fireEvent.mouseMove(stage, rightPointer);
    expect(stage).toHaveStyle('--pointer-x: 0.75');
    fireEvent.mouseLeave(stage);
    expect(stage).toHaveStyle('--pointer-x: 0.5');

    expect(screen.queryByRole('button', { name: '关闭歌词页' })).not.toBeInTheDocument();
    expect(screen.queryByText('全屏沉浸')).not.toBeInTheDocument();
    expect(screen.queryByText('退出沉浸')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '进入沉浸全屏' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '退出沉浸全屏' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '收起歌词页' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '歌词详情' })).not.toBeInTheDocument();
    });
  });

  it('shows provider playback restriction as a toast without crowding the player bar', async () => {
    window.musicPlayer.music.getSongUrl = async (_providerId, song, quality) => ({
      ok: true,
      data: {
        ok: false,
        providerId: song.providerId,
        quality,
        reason: {
          category: 'vip_required',
          message: '当前歌曲需要会员权限，无法获取播放地址',
          action: 'upgrade'
        }
      }
    });

    seedQueueSong();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '展开播放队列' }));
    const queue = await screen.findByRole('complementary', { name: '播放队列' });
    fireEvent.doubleClick(within(queue).getByRole('button', { name: /Queue Song/ }));

    const notice = await screen.findByRole('alert');
    const playerBar = screen.getByRole('region', { name: '底部播放栏' });

    expect(within(notice).getByText('当前歌曲需要会员权限，无法获取播放地址')).toBeInTheDocument();
    expect(within(notice).queryByRole('button', { name: '查看会员权益' })).not.toBeInTheDocument();
    expect(within(playerBar).queryByText('当前歌曲需要会员权限，无法获取播放地址')).not.toBeInTheDocument();
    expect(within(playerBar).getByRole('button', { name: '播放' })).toBeInTheDocument();
  });

  it('shows stable QQ playback authorization guidance and opens login from the player bar', async () => {
    window.musicPlayer.music.getSongUrl = async (_providerId, song, quality) => ({
      ok: true,
      data: {
        ok: false,
        providerId: song.providerId,
        quality,
        reason: {
          category: 'playback_auth_incomplete',
          message: 'provider-specific transient text',
          action: 'login'
        }
      }
    });

    seedQueueSong();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '展开播放队列' }));
    const queue = await screen.findByRole('complementary', { name: '播放队列' });
    fireEvent.doubleClick(within(queue).getByRole('button', { name: /Queue Song/ }));

    const notice = await screen.findByRole('alert');

    expect(within(notice).getByText('当前歌曲需要 QQ 音乐播放授权')).toBeInTheDocument();
    expect(screen.queryByText('provider-specific transient text')).not.toBeInTheDocument();

    fireEvent.click(within(notice).getByRole('button', { name: '重新登录' }));

    expect(screen.getByRole('dialog', { name: '账号中心' })).toBeInTheDocument();
  });

  it('opens lyrics as a single full-window surface without immersive toggles', async () => {
    seedQueueSong();
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '展开播放队列' }));
    const queue = await screen.findByRole('complementary', { name: '播放队列' });
    fireEvent.doubleClick(within(queue).getByRole('button', { name: /Queue Song/ }));

    const playerBar = screen.getByRole('region', { name: '底部播放栏' });
    fireEvent.click(within(playerBar).getByRole('button', { name: '打开歌词页：Queue Song' }));
    const stage = await screen.findByRole('region', { name: '3D 播放舞台' });
    const lyricsPanel = container.querySelector<HTMLElement>('.lyrics-panel') as HTMLElement;
    const rightPointer = createPointerEventPosition(lyricsPanel, 0.75, 0.5);

    fireEvent.mouseMove(stage, rightPointer);
    expect(stage).toHaveStyle('--pointer-x: 0.75');

    expect(screen.queryByRole('button', { name: '进入沉浸全屏' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '退出沉浸全屏' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起歌词页' })).toBeInTheDocument();
  });

  it('loads bridge lyrics when the lyrics panel opens', async () => {
    seedQueueSong();
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '展开播放队列' }));
    const queue = await screen.findByRole('complementary', { name: '播放队列' });
    fireEvent.doubleClick(within(queue).getByRole('button', { name: /Queue Song/ }));
    const playerBar = screen.getByRole('region', { name: '底部播放栏' });
    fireEvent.click(within(playerBar).getByRole('button', { name: '打开歌词页：Queue Song' }));

    await waitFor(() => {
      expect(findLyricLineText(container, 'Bridge lyric line')).toBeInTheDocument();
    });
  });

  it('switches and persists color theme from the top bar', () => {
    render(<App />);

    expect(document.documentElement.dataset.theme).toBe('white');
    expect(document.documentElement.dataset.themePreference).toBe('system');
    expect(document.documentElement.style.getPropertyValue('--visual-accent')).toBe(visualThemes.white.accent);

    fireEvent.click(screen.getByRole('button', { name: '主题设置' }));
    const dialog = screen.getByRole('dialog', { name: '主题设置面板' });

    expect(within(dialog).queryByText('性能')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('slider', { name: '全局圆角' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('跟随系统')).toBeInTheDocument();
    expect(within(dialog).getByText('白色')).toBeInTheDocument();
    expect(within(dialog).getByText('黑色')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button')).toHaveLength(3);

    const blackCard = within(dialog).getByText('黑色').closest('button') as HTMLButtonElement;
    expect(blackCard).toHaveClass('theme-card');
    expect(blackCard.style.getPropertyValue('--theme-card-text')).toBe(visualThemes.black.text);

    fireEvent.click(blackCard);
    expect(useVisualStore.getState()).toMatchObject({ themePreference: 'dark', themeId: 'black' });
    expect(document.documentElement.dataset.theme).toBe('black');
    expect(document.documentElement.dataset.themePreference).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--visual-accent')).toBe(visualThemes.black.accent);
    expect(document.documentElement.style.getPropertyValue('--qq-accent')).toBe(visualThemes.black.accent);
    expect(document.documentElement.style.getPropertyValue('--qq-content-bg')).toBe(visualThemes.black.surface);
    for (const token of [
      '--qq-window-gradient',
      '--qq-sidebar-gradient',
      '--qq-content-gradient',
      '--qq-panel-gradient',
      '--qq-hover-gradient',
      '--qq-active-gradient',
      '--qq-primary-action-gradient'
    ]) {
      expect(document.documentElement.style.getPropertyValue(token)).toContain('linear-gradient(');
    }
    expect(document.documentElement.style.getPropertyValue('--qq-content-gradient')).toContain(visualThemes.black.surface);
    expect(document.documentElement.style.getPropertyValue('--qq-content-gradient')).toContain(visualThemes.black.materialA);
    expect(document.documentElement.style.getPropertyValue('--qq-content-gradient')).toContain(visualThemes.black.materialB);
    expect(JSON.parse(window.localStorage.getItem('oubao-music-visual-preferences') ?? '{}')).toEqual({
      themePreference: 'dark'
    });
  });

  it('opens the provider login popover without mock providers and reflects netease login in the top bar', async () => {
    render(<App />);

    const loginTrigger = screen.getByRole('button', { name: '登录' });
    fireEvent.click(loginTrigger);
    const dialog = screen.getByRole('dialog', { name: '账号中心' });

    expect(loginTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveClass('login-popover');
    expect(dialog.closest('.top-bar')).not.toBeInTheDocument();
    expect(document.body.querySelector('.login-dialog-layer')).not.toBeInTheDocument();
    expect(document.body.querySelector('.login-dialog-backdrop')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Provider')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Mock Provider/ })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /登录 网易云音乐/ }));

    expect(await screen.findByRole('button', { name: /网易云用户/ })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '账号中心' })).toHaveAttribute('data-state', 'open');
    await waitFor(() => expect(useAppNotificationStore.getState().notification?.message)
      .toMatch(/已登录并同步歌单/));
  });

  it('searches with the active provider and plays a search result', async () => {
    window.musicPlayer.music.searchEntities = async (providerId, keyword) => ({
      ok: true,
      data: createSearchEntityResults(providerId, keyword, [
        {
          id: `${providerId}:search-song`,
          providerId,
          platformSongId: 'search-song',
          title: `${keyword} single`,
          artist: 'Search Artist',
          album: 'Search Album',
          durationMs: 188000,
          coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
        }
      ])
    });

    render(<App />);

    fireEvent.change(screen.getByRole('combobox', { name: '搜索音乐' }), { target: { value: 'neon' } });
    fireEvent.submit(screen.getByRole('search'));

    const searchResult = await screen.findByRole('button', { name: /加入队列：neon single/ });
    expect(searchResult).toBeInTheDocument();
    fireEvent.doubleClick(searchResult);

    const playerBar = screen.getByRole('region', { name: '底部播放栏' });
    await waitFor(() => {
      expect(findPrimaryNowPlayingTitle(playerBar, 'neon single')).toBeInTheDocument();
    });
  });

  it('navigates from a structured search song to its artist and album details', async () => {
    const artistId = 'qq:artist:0025NhlN2yWrP4';
    const albumId = 'qq:album:000MkMni19ClKG';
    const structuredSong: Song = {
      id: 'qq:001n4C3p1yv0FU',
      providerId: 'qq',
      platformSongId: '001n4C3p1yv0FU',
      title: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      artists: [{
        id: artistId,
        providerId: 'qq',
        platformArtistId: '0025NhlN2yWrP4',
        name: '周杰伦'
      }],
      albumRef: {
        id: albumId,
        providerId: 'qq',
        platformAlbumId: '000MkMni19ClKG',
        title: '叶惠美'
      },
      durationMs: 269000,
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
    };
    const artist: ArtistDetail = {
      ...structuredSong.artists![0],
      aliases: ['Jay Chou'],
      description: '华语创作歌手',
      coverTone: structuredSong.coverTone,
      sourceLabel: 'QQ音乐',
      songCount: 560,
      albumCount: 43,
      topSongs: [structuredSong],
      albums: [{
        ...structuredSong.albumRef!,
        artistName: '周杰伦',
        coverTone: structuredSong.coverTone,
        releaseDate: '2003-07-31',
        trackCount: 11,
        sourceLabel: 'QQ音乐'
      }]
    };
    const album: AlbumDetail = {
      ...artist.albums[0],
      description: '录音室专辑',
      artists: [structuredSong.artists![0]],
      tracks: [structuredSong]
    };
    const getArtistDetail = vi.fn(async () => ({ ok: true as const, data: artist }));
    const getAlbumDetail = vi.fn(async () => ({ ok: true as const, data: album }));
    window.musicPlayer.music.searchEntities = async (providerId, keyword) => ({
      ok: true,
      data: createSearchEntityResults(providerId, keyword, [structuredSong])
    });
    window.musicPlayer.music.getArtistDetail = getArtistDetail;
    window.musicPlayer.music.getAlbumDetail = getAlbumDetail;

    render(<App />);
    fireEvent.change(screen.getByRole('combobox', { name: '搜索音乐' }), { target: { value: '晴天' } });
    fireEvent.submit(screen.getByRole('search'));
    fireEvent.click(await screen.findByRole('button', { name: '打开歌手：周杰伦' }));

    const artistDetail = await screen.findByRole('region', { name: '歌手详情' });
    expect(getArtistDetail).toHaveBeenCalledWith('qq', artistId);
    expect(within(artistDetail).getByText('别名：Jay Chou')).toBeInTheDocument();
    fireEvent.click(within(artistDetail).getByRole('tab', { name: '专辑' }));
    const artistAlbums = within(artistDetail).getByRole('region', { name: '周杰伦的专辑' });
    fireEvent.click(within(artistAlbums).getByRole('button', { name: '打开专辑：叶惠美' }));

    const albumDetail = await screen.findByRole('region', { name: '专辑详情' });
    expect(getAlbumDetail).toHaveBeenCalledWith('qq', albumId);
    expect(within(albumDetail).getByRole('heading', { name: '专辑曲目' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '后退' }));
    expect(await screen.findByRole('region', { name: '歌手详情' })).toBeInTheDocument();
  });

  it('debounces top-bar suggestions through the search provider without opening results', async () => {
    vi.useFakeTimers();
    const getSearchSuggestions = vi.fn<Window['musicPlayer']['music']['getSearchSuggestions']>(async (providerId, keyword) => ({
      ok: true,
      data: [
        {
          id: `${providerId}:${keyword}`,
          providerId,
          keyword,
          title: `${keyword} hint`,
          kind: 'song',
          subtitle: 'Search Artist / Search Album'
        }
      ]
    }));
    const getSearchHotSearches = vi.fn<Window['musicPlayer']['music']['getSearchHotSearches']>(async (providerId) => ({
      ok: true,
      data: [{
        id: `${providerId}:hot:1`,
        providerId,
        keyword: '热门搜索',
        title: '热门搜索',
        rank: 1
      }]
    }));
    window.musicPlayer.music.getSearchSuggestions = getSearchSuggestions;
    window.musicPlayer.music.getSearchHotSearches = getSearchHotSearches;

    render(<App />);

    const searchbox = screen.getByRole('combobox', { name: '搜索音乐' });
    fireEvent.focus(searchbox);
    await act(async () => {
      await Promise.resolve();
    });

    expect(getSearchHotSearches).toHaveBeenCalledWith('qq', { limit: 10 });
    expect(screen.getByRole('listbox', { name: '搜索提示' })).toBeInTheDocument();
    fireEvent.change(searchbox, { target: { value: 'n' } });
    fireEvent.change(searchbox, { target: { value: 'ne' } });
    fireEvent.change(searchbox, { target: { value: 'neo' } });

    act(() => {
      vi.advanceTimersByTime(280);
    });
    expect(getSearchSuggestions).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getSearchSuggestions).toHaveBeenCalledTimes(1);
    expect(getSearchSuggestions).toHaveBeenCalledWith('qq', 'neo', { limit: 8 });
    expect(screen.getByRole('listbox', { name: '搜索提示' })).toBeInTheDocument();
    expect(useSearchStore.getState().keyword).toBe('');
    expect(useUiStore.getState().currentView.type).toBe('home');
  });

  it('reruns the current search when the search result provider is changed', async () => {
    const searchCalls: RemoteProviderId[] = [];
    window.musicPlayer.music.searchEntities = async (providerId, keyword) => {
      searchCalls.push(providerId);

      return {
        ok: true,
        data: createSearchEntityResults(providerId, keyword, [
          {
            id: `${providerId}:search-song`,
            providerId,
            platformSongId: 'search-song',
            title: `${providerId} ${keyword}`,
            artist: 'Search Artist',
            album: 'Search Album',
            durationMs: 188000,
            coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
          }
        ])
      };
    };

    render(<App />);

    fireEvent.change(screen.getByRole('combobox', { name: '搜索音乐' }), { target: { value: 'neon' } });
    fireEvent.submit(screen.getByRole('search'));

    expect(await screen.findByRole('button', { name: /加入队列：qq neon/ })).toBeInTheDocument();
    expect(searchCalls).toEqual(['qq']);

    const providerSelector = screen.getByRole('group', { name: '搜索来源' });
    fireEvent.click(within(providerSelector).getByRole('button', { name: '网易云音乐' }));

    await waitFor(() => expect(searchCalls).toEqual(['qq', 'netease']));
    expect(await screen.findByRole('button', { name: /加入队列：netease neon/ })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '搜索来源' })).getByRole('button', { name: '网易云音乐' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.change(screen.getByRole('combobox', { name: '搜索音乐' }), { target: { value: 'next search' } });
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() => expect(searchCalls).toEqual(['qq', 'netease', 'netease']));
  });

  it('switches from search results to a selected playlist and supports top-bar history', async () => {
    const routePlaylist: Playlist = {
      id: 'qq:route-playlist',
      providerId: 'qq',
      title: 'QQ Route Playlist',
      description: 'Navigation regression fixture',
      songIds: ['qq:route-song'],
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      sourceLabel: 'QQ Music'
    };
    const routeSong: Song = {
      ...neteaseSong,
      id: 'qq:route-song',
      providerId: 'qq',
      platformSongId: 'route-song',
      title: 'Route Playlist Song',
      sourceContext: {
        type: 'playlist',
        providerId: 'qq',
        playlistId: routePlaylist.id,
        playlistTitle: routePlaylist.title
      }
    };

    useLibraryStore.setState({
      providerPlaylists: {
        qq: [routePlaylist]
      }
    });
    window.musicPlayer.music.searchEntities = async (providerId, keyword) => ({
      ok: true,
      data: createSearchEntityResults(providerId, keyword, [
        {
          id: `${providerId}:search-song`,
          providerId,
          platformSongId: 'search-song',
          title: `${keyword} single`,
          artist: 'Search Artist',
          album: 'Search Album',
          durationMs: 188000,
          coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
        }
      ])
    });
    window.musicPlayer.music.getPlaylistTracks = async () => ({ ok: true, data: [routeSong] });

    const { container } = render(<App />);

    fireEvent.change(screen.getByRole('combobox', { name: '搜索音乐' }), { target: { value: 'neon' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(await screen.findByRole('button', { name: /加入队列：neon single/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /QQ Route Playlist/ }));

    expect(await screen.findByRole('heading', { name: 'QQ Route Playlist' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /加入队列：neon single/ })).not.toBeInTheDocument();

    const historyButtons = container.querySelectorAll<HTMLButtonElement>('.history-actions .icon-button');
    fireEvent.click(historyButtons[0]);

    expect(await screen.findByRole('button', { name: /加入队列：neon single/ })).toBeInTheDocument();

    fireEvent.click(historyButtons[1]);
    expect(await screen.findByRole('heading', { name: 'QQ Route Playlist' })).toBeInTheDocument();
  });

  it('opens a remote playlist entity from search through the transient playlist registry', async () => {
    const remotePlaylist: DiscoveredPlaylist = {
      id: 'qq:search-playlist:9001',
      providerId: 'qq',
      platformPlaylistId: '9001',
      title: '远端搜索歌单',
      description: '来自搜索的公开歌单',
      songIds: [],
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      sourceLabel: 'QQ音乐',
      creatorName: '搜索创建者'
    };
    const remoteSong: Song = {
      ...qqQueueSong,
      id: 'qq:search-playlist-song:1',
      platformSongId: 'search-playlist-song:1',
      title: '远端搜索歌单歌曲',
      sourceContext: {
        type: 'playlist',
        providerId: 'qq',
        playlistId: remotePlaylist.id,
        playlistTitle: remotePlaylist.title
      }
    };
    const getPlaylistTracks = vi.fn(async (providerId: ProviderId, playlistId: string) => ({
      ok: true as const,
      data: providerId === remotePlaylist.providerId && playlistId === remotePlaylist.id ? [remoteSong] : []
    }));
    window.musicPlayer.music.searchEntities = async (providerId, keyword) => ({
      ok: true,
      data: createSearchEntityResults(providerId, keyword, [], {
        playlists: {
          available: true,
          items: [remotePlaylist],
          total: 1,
          hasMore: false,
          errorMessage: null
        }
      })
    });
    window.musicPlayer.music.getPlaylistTracks = getPlaylistTracks;

    render(<App />);

    fireEvent.change(screen.getByRole('combobox', { name: '搜索音乐' }), { target: { value: '远端歌单' } });
    fireEvent.submit(screen.getByRole('search'));
    fireEvent.click(await screen.findByRole('button', { name: /远端搜索歌单/ }));

    expect(await screen.findByRole('heading', { name: remotePlaylist.title })).toBeInTheDocument();
    await waitFor(() => {
      expect(getPlaylistTracks).toHaveBeenCalledWith('qq', remotePlaylist.id);
    });
    expect(within(screen.getByRole('navigation', { name: '主导航' })).queryByRole('button', { name: /远端搜索歌单/ })).not.toBeInTheDocument();
  });

  it('returns to the home view from a selected provider playlist', async () => {
    const routePlaylist: Playlist = {
      id: 'qq:home-route-playlist',
      providerId: 'qq',
      title: 'QQ Home Route Playlist',
      description: 'Home navigation regression fixture',
      songIds: ['qq:home-route-song'],
      coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
      sourceLabel: 'QQ Music'
    };

    useLibraryStore.setState({
      providerPlaylists: {
        qq: [routePlaylist]
      }
    });
    window.musicPlayer.music.getPlaylistTracks = async () => ({ ok: true, data: [] });

    render(<App />);
    const nav = screen.getByRole('navigation', { name: '主导航' });
    const homeButton = within(nav).getByRole('button', { name: '发现音乐' });
    const playlistButton = within(nav).getByRole('button', { name: /QQ Home Route Playlist/ });

    fireEvent.click(playlistButton);
    expect(await screen.findByRole('heading', { name: 'QQ Home Route Playlist' })).toBeInTheDocument();
    expect(nav.querySelectorAll('.nav-item-active, .nav-playlist-item-active')).toHaveLength(1);
    expect(homeButton).not.toHaveClass('nav-item-active');
    expect(playlistButton).toHaveClass('nav-playlist-item-active');

    fireEvent.click(homeButton);

    expect(screen.getByRole('main', { name: '首页内容' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '歌单详情' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'QQ Home Route Playlist' })).not.toBeInTheDocument();
    expect(nav.querySelectorAll('.nav-item-active, .nav-playlist-item-active')).toHaveLength(1);
    expect(homeButton).toHaveClass('nav-item-active');
    expect(playlistButton).not.toHaveClass('nav-playlist-item-active');
  });

  it('opens the settings panel from the settings icon button without opening theme settings', () => {
    const { container } = render(<App />);
    const settingsButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.top-actions > .icon-button')).at(-1);

    if (!settingsButton) {
      throw new Error('settings button should render');
    }

    fireEvent.click(settingsButton);

    expect(screen.getByRole('dialog', { name: '设置面板' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '主题设置面板' })).not.toBeInTheDocument();
    expect(document.body.querySelector('.theme-popover')).not.toBeInTheDocument();
  });

  it('does not expose local music from the left navigation', () => {
    const importLocalFiles = vi.fn(async () => ({ ok: true as const, data: [localSong] }));
    window.musicPlayer.music.importLocalFiles = importLocalFiles;

    render(<App />);

    expect(screen.queryByRole('button', { name: '本地音乐' })).not.toBeInTheDocument();
    expect(importLocalFiles).not.toHaveBeenCalled();
  });

  it('shows incomplete QQ playback authorization after QQ login', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    const dialog = screen.getByRole('dialog', { name: '账号中心' });

    fireEvent.click(within(dialog).getByRole('button', { name: /登录 QQ 音乐/ }));

    expect(await screen.findAllByText('播放授权不完整')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: /QQ 用户/ })).toBeInTheDocument();

    const qqGroup = within(dialog).getByRole('group', { name: 'QQ 音乐' });
    expect(within(qqGroup).getByText('播放授权不完整')).toBeInTheDocument();
  });

  it('loads and displays QQ playlists after QQ login', async () => {
    window.musicPlayer.music.getUserPlaylists = async (providerId) => ({
      ok: true,
      data:
        providerId === 'qq'
          ? [
              {
                id: 'qq:8800',
                providerId: 'qq',
                title: 'QQ 私人歌单',
                description: '18 首歌曲',
                songIds: [],
                coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
                sourceLabel: 'QQ音乐'
              }
            ]
          : []
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    const dialog = screen.getByRole('dialog', { name: '账号中心' });
    fireEvent.click(within(dialog).getByRole('button', { name: /登录 QQ 音乐/ }));

    const sidebar = screen.getByRole('navigation', { name: '主导航' });
    expect(await within(sidebar).findByRole('button', { name: 'QQ 私人歌单，来源：QQ 音乐' }))
      .toBeInTheDocument();
    expect(screen.getAllByText('播放授权不完整').length).toBeGreaterThan(0);
  });

  it('loads and displays netease playlists after netease login', async () => {
    window.musicPlayer.music.login = async (providerId) => ({
      ok: true,
      data: {
        providerId,
        loggedIn: true,
        nickname: '网易云用户',
        playbackReady: true
      }
    });
    window.musicPlayer.music.getUserPlaylists = async () => ({
      ok: true,
      data: [
        {
          id: 'netease:6688',
          providerId: 'netease',
          title: '我喜欢的音乐',
          description: '私人收藏',
          songIds: [],
          coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
          sourceLabel: '网易云',
          isLiked: true
        }
      ]
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    const dialog = screen.getByRole('dialog', { name: '账号中心' });
    fireEvent.click(within(dialog).getByRole('button', { name: /登录 网易云音乐/ }));

    const sidebar = screen.getByRole('navigation', { name: '主导航' });
    expect(await within(sidebar).findByRole('button', { name: '我喜欢的音乐-网易云音乐' }))
      .toBeInTheDocument();
  });

  it('hydrates persisted login status on startup and loads provider playlists', async () => {
    localStorage.setItem('musicplayer.activeProviderId', 'netease');
    window.musicPlayer.music.getLoginStatus = async (providerId) => ({
      ok: true,
      data: {
        providerId,
        loggedIn: providerId === 'netease',
        nickname: providerId === 'netease' ? 'Netease User' : undefined,
        playbackReady: providerId === 'netease'
      }
    });
    window.musicPlayer.music.getUserPlaylists = async (providerId) => ({
      ok: true,
      data:
        providerId === 'netease'
          ? [
              {
                id: 'netease:42',
                providerId: 'netease',
                title: 'Restart playlist',
                description: 'Loaded after persisted login hydration',
                songIds: [],
                coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
                sourceLabel: 'Netease'
              }
            ]
          : []
    });

    render(<App />);

    expect(await screen.findByRole('button', { name: /Netease User/ })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Restart playlist，来源：网易云音乐' })).toBeInTheDocument();
  });

  it('hydrates multiple logged-in providers on startup and loads each provider library', async () => {
    localStorage.setItem('musicplayer.defaultProviderId', 'qq');
    window.musicPlayer.music.getLoginStatus = async (providerId) => ({
      ok: true,
      data: {
        providerId,
        loggedIn: true,
        nickname: providerId === 'qq' ? 'QQ Restart User' : 'Netease Restart User',
        playbackReady: true
      }
    });
    const getUserPlaylists = vi.fn(async (providerId: ProviderId) => ({
      ok: true as const,
      data: [
        {
          id: `${providerId}:restart`,
          providerId,
          title: `${providerId} restart playlist`,
          description: 'Loaded after multi-provider hydration',
          songIds: [],
          coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
          sourceLabel: providerId
        }
      ]
    }));
    window.musicPlayer.music.getUserPlaylists = getUserPlaylists;

    render(<App />);

    const sidebar = screen.getByRole('navigation', { name: '主导航' });
    const createdPlaylists = await within(sidebar).findByRole('group', { name: 'created playlists' });
    expect(within(createdPlaylists).getByRole('button', { name: 'qq restart playlist，来源：QQ 音乐' }))
      .toBeInTheDocument();
    fireEvent.click(within(createdPlaylists).getByRole('tab', { name: '网易云音乐' }));
    expect(await within(createdPlaylists).findByRole('button', {
      name: 'netease restart playlist，来源：网易云音乐'
    })).toBeInTheDocument();
    await waitFor(() => {
      expect(getUserPlaylists).toHaveBeenCalledWith('netease');
      expect(getUserPlaylists).toHaveBeenCalledWith('qq');
    });
  });

  it('opens provider playlist details from the sidebar', async () => {
    const getPlaylistTracks = vi.fn(async () => ({ ok: true as const, data: [neteaseSong] }));
    window.musicPlayer.music.login = async (providerId) => ({
      ok: true,
      data: {
        providerId,
        loggedIn: true,
        nickname: '网易云用户',
        playbackReady: true
      }
    });
    window.musicPlayer.music.getUserPlaylists = async () => ({ ok: true, data: [neteasePlaylist] });
    window.musicPlayer.music.getPlaylistTracks = getPlaylistTracks;

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: '账号中心' })).getByRole('button', { name: /登录 网易云音乐/ }));

    const nav = screen.getByRole('navigation', { name: '主导航' });
    fireEvent.click(await within(nav).findByRole('button', { name: /我喜欢的音乐/ }));

    const detail = await screen.findByRole('region', { name: '歌单详情' });
    expect(getPlaylistTracks).toHaveBeenCalledWith('netease', 'netease:6688');
    expect(within(detail).getByRole('heading', { name: '我喜欢的音乐' })).toBeInTheDocument();
    expect(within(detail).getByText('网易云')).toBeInTheDocument();
    expect(detail.querySelector<HTMLElement>('.playlist-detail-meta')).not.toHaveTextContent(/1\s*首歌曲/);
    expect(within(detail).getByText('晴天')).toBeInTheDocument();
    expect(within(detail).getByText('周杰伦')).toBeInTheDocument();
    expect(within(detail).getByText('叶惠美')).toBeInTheDocument();
    expect(within(detail).getByText('4:29')).toBeInTheDocument();
    expect(detail.querySelector<HTMLElement>('.song-cover-small')?.style.getPropertyValue('--song-cover-image')).toContain('song.jpg');
  });

  it('refreshes the active provider playlists and current playlist from the sidebar refresh control', async () => {
    const refreshedPlaylist: Playlist = {
      ...neteasePlaylist,
      title: 'Refreshed playlist'
    };
    const refreshedSong: Song = {
      ...neteaseSong,
      id: 'netease:43',
      platformSongId: '43',
      title: 'Refreshed song'
    };
    const getUserPlaylists = vi.fn(async (_providerId: ProviderId, options?: { forceRefresh?: boolean }) => ({
      ok: true as const,
      data: options?.forceRefresh ? [refreshedPlaylist] : [neteasePlaylist]
    }));
    const getPlaylistTracks = vi.fn(async (_providerId: ProviderId, _playlistId: string, options?: { forceRefresh?: boolean }) => ({
      ok: true as const,
      data: options?.forceRefresh ? [refreshedSong] : [neteaseSong]
    }));
    window.musicPlayer.music.login = async (providerId) => ({
      ok: true,
      data: {
        providerId,
        loggedIn: true,
        nickname: 'Netease User',
        playbackReady: true
      }
    });
    window.musicPlayer.music.getUserPlaylists = getUserPlaylists;
    window.musicPlayer.music.getPlaylistTracks = getPlaylistTracks;

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: '账号中心' })).getAllByRole('button')[1]);
    const nav = screen.getByRole('navigation', { name: '主导航' });
    const originalPlaylistButton = await within(nav).findByRole('button', { name: new RegExp(neteasePlaylist.title) });
    fireEvent.click(originalPlaylistButton);

    const detail = await screen.findByRole('region', { name: '歌单详情' });
    expect(await within(detail).findByRole('button', { name: /加入队列：晴天/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '刷新当前内容' }));

    expect(await within(detail).findByRole('button', { name: /加入队列：Refreshed song/ })).toBeInTheDocument();
    expect(getUserPlaylists).toHaveBeenCalledWith('netease', { forceRefresh: true });
    expect(getPlaylistTracks).toHaveBeenCalledWith('netease', 'netease:6688', { forceRefresh: true });
    expect(screen.getByRole('heading', { name: '我喜欢的音乐' })).toBeInTheDocument();
  });

  it('shows structured playlist detail errors without crashing the main shell', async () => {
    window.musicPlayer.music.login = async (providerId) => ({
      ok: true,
      data: {
        providerId,
        loggedIn: true,
        nickname: '网易云用户',
        playbackReady: true
      }
    });
    window.musicPlayer.music.getUserPlaylists = async () => ({ ok: true, data: [neteasePlaylist] });
    window.musicPlayer.music.getPlaylistTracks = async () => ({
      ok: false,
      error: {
        code: 'provider_failed',
        providerId: 'netease',
        message: '歌单曲目加载失败'
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: '账号中心' })).getByRole('button', { name: /登录 网易云音乐/ }));

    const nav = screen.getByRole('navigation', { name: '主导航' });
    fireEvent.click(await within(nav).findByRole('button', { name: /我喜欢的音乐/ }));

    const detail = await screen.findByRole('region', { name: '歌单详情' });
    expect(within(detail).queryByText('歌单曲目加载失败')).not.toBeInTheDocument();
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('歌单曲目加载失败');
    expect(screen.getByRole('region', { name: '底部播放栏' })).toBeInTheDocument();
  });

  it('adds a provider playlist song to the playback queue from the detail view', async () => {
    window.musicPlayer.music.login = async (providerId) => ({
      ok: true,
      data: {
        providerId,
        loggedIn: true,
        nickname: '网易云用户',
        playbackReady: true
      }
    });
    window.musicPlayer.music.getUserPlaylists = async () => ({ ok: true, data: [neteasePlaylist] });
    window.musicPlayer.music.getPlaylistTracks = async () => ({ ok: true, data: [neteaseSong] });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: '账号中心' })).getByRole('button', { name: /登录 网易云音乐/ }));
    fireEvent.click(await within(screen.getByRole('navigation', { name: '主导航' })).findByRole('button', { name: /我喜欢的音乐/ }));

    const detail = await screen.findByRole('region', { name: '歌单详情' });
    fireEvent.click(within(detail).getByRole('button', { name: /加入队列：晴天/ }));
    fireEvent.click(screen.getByRole('button', { name: '展开播放队列' }));

    const queue = await screen.findByRole('complementary', { name: '播放队列' });
    const queuedSong = within(queue).getByRole('button', { name: /晴天/ });
    expect(queuedSong).toBeInTheDocument();
    expect(within(queuedSong).getByText('网易云 · 歌单')).toBeInTheDocument();
    expect(queuedSong.querySelector<HTMLElement>('.song-cover-small')?.style.getPropertyValue('--song-cover-image')).toContain('song.jpg');
  });

  it('plays a provider playlist song by double-clicking it in the detail view', async () => {
    window.musicPlayer.music.login = async (providerId) => ({
      ok: true,
      data: {
        providerId,
        loggedIn: true,
        nickname: '网易云用户',
        playbackReady: true
      }
    });
    window.musicPlayer.music.getUserPlaylists = async () => ({ ok: true, data: [neteasePlaylist] });
    window.musicPlayer.music.getPlaylistTracks = async () => ({ ok: true, data: [neteaseSong] });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: '账号中心' })).getByRole('button', { name: /登录 网易云音乐/ }));
    fireEvent.click(await within(screen.getByRole('navigation', { name: '主导航' })).findByRole('button', { name: /我喜欢的音乐/ }));

    const detail = await screen.findByRole('region', { name: '歌单详情' });
    fireEvent.doubleClick(within(detail).getByRole('button', { name: /加入队列：晴天/ }));

    const playerBar = screen.getByRole('region', { name: '底部播放栏' });
    await waitFor(() => {
      expect(playerBar.querySelector<HTMLElement>('.now-playing-title')).toHaveAttribute('title', neteaseSong.title);
    });
    expect(within(playerBar).getByRole('button', { name: '暂停' })).toBeInTheDocument();
    expect(screen.getByText('已开始播放')).toBeInTheDocument();
  });

  it('closes the theme popover from Escape before entering other surfaces', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '主题设置' }));
    expect(screen.getByRole('dialog', { name: '主题设置面板' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('dialog', { name: '主题设置面板' })).toHaveAttribute('data-state', 'closed');

    act(() => {
      vi.advanceTimersByTime(240);
    });

    expect(screen.queryByRole('dialog', { name: '主题设置面板' })).not.toBeInTheDocument();
  });

  it('keeps queue and login surfaces mounted briefly while their exit animations run', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '展开播放队列' }));
    const queuePanel = await waitFor(() => {
      const panel = container.querySelector<HTMLElement>('.queue-panel');
      expect(panel).toBeInTheDocument();
      return panel;
    });
    expect(queuePanel).toBeInTheDocument();
    expect(queuePanel).toHaveAttribute('data-state', 'open');

    vi.useFakeTimers();
    fireEvent.click(within(screen.getByRole('region', { name: '底部播放栏' })).getByRole('button', { name: '收起播放队列' }));
    expect(container.querySelector<HTMLElement>('.queue-panel')).toHaveAttribute('data-state', 'closed');

    act(() => {
      vi.advanceTimersByTime(240);
    });

    expect(container.querySelector('.queue-panel')).not.toBeInTheDocument();

    const loginTrigger = container.querySelector<HTMLButtonElement>('.login-button') as HTMLButtonElement;
    fireEvent.click(loginTrigger);
    const loginPopover = screen.getByRole('dialog', { name: '账号中心' });
    expect(loginTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(loginPopover).toHaveClass('login-popover');
    expect(loginPopover).toHaveAttribute('data-state', 'open');

    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('dialog', { name: '账号中心' })).toHaveAttribute('data-state', 'closed');
    expect(loginTrigger).toHaveAttribute('aria-expanded', 'false');

    act(() => {
      vi.advanceTimersByTime(240);
    });

    expect(screen.queryByRole('dialog', { name: '账号中心' })).not.toBeInTheDocument();
  });

  it('uses popover-style controls with animated close behavior for theme, login, and volume', () => {
    vi.useFakeTimers();
    const { container } = render(<App />);

    fireEvent.click(container.querySelector<HTMLButtonElement>('.theme-trigger') as HTMLButtonElement);
    const themePopover = screen.getByRole('dialog', { name: '主题设置面板' });
    expect(themePopover).toHaveAttribute('data-state', 'open');
    expect(themePopover.closest('.top-bar')).not.toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('dialog', { name: '主题设置面板' })).toHaveAttribute('data-state', 'closed');

    act(() => {
      vi.advanceTimersByTime(240);
    });

    expect(screen.queryByRole('dialog', { name: '主题设置面板' })).not.toBeInTheDocument();

    const loginTrigger = container.querySelector<HTMLButtonElement>('.login-button') as HTMLButtonElement;
    fireEvent.click(loginTrigger);
    expect(loginTrigger).toHaveAttribute('aria-expanded', 'true');
    const loginPopover = screen.getByRole('dialog', { name: '账号中心' });
    expect(loginPopover).toHaveAttribute('data-state', 'open');
    expect(loginPopover.closest('.top-bar')).not.toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('dialog', { name: '账号中心' })).toHaveAttribute('data-state', 'closed');
    expect(loginTrigger).toHaveAttribute('aria-expanded', 'false');

    act(() => {
      vi.advanceTimersByTime(240);
    });

    expect(screen.queryByRole('dialog', { name: '账号中心' })).not.toBeInTheDocument();

    const volumeTrigger = container.querySelector<HTMLButtonElement>('.volume-trigger') as HTMLButtonElement;
    expect(volumeTrigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(volumeTrigger);
    expect(volumeTrigger).toHaveAttribute('aria-expanded', 'true');
    const volumePopover = screen.getByRole('dialog', { name: '音量调节' });
    expect(volumePopover).toHaveAttribute('data-state', 'open');
    expect(volumePopover.closest('.player-bar')).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: '音量' })).toHaveAttribute('aria-orientation', 'vertical');

    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('dialog', { name: '音量调节' })).toHaveAttribute('data-state', 'closed');

    act(() => {
      vi.advanceTimersByTime(240);
    });

    expect(screen.queryByRole('dialog', { name: '音量调节' })).not.toBeInTheDocument();
  });

  it('updates the shared spatial pointer variables for global 3D depth', () => {
    render(<App />);

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 768, clientY: 384 }));

    expect(document.documentElement.style.getPropertyValue('--global-pointer-x')).toBe('0.75');
    expect(document.documentElement.style.getPropertyValue('--global-pointer-y')).toBe('0.5');
  });

  it('keeps the critical lyrics surface eager while lazy-loading optional panels', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');

    expect(source).toContain("import { LyricsPanel } from './components/LyricsPanel'");
    expect(source).not.toContain("import('./components/LyricsPanel')");
    expect(source).toContain("const QueuePanel = lazy(() => import('./components/QueuePanel')");
    expect(source).toContain("const SimilarSongsPanel = lazy(() => import('./components/SimilarSongsPanel')");
    expect(source).toContain('<Suspense fallback={null}>');
    expect(source).not.toContain("import { QueuePanel } from './components/QueuePanel'");
    expect(source).not.toContain("import { SimilarSongsPanel } from './components/SimilarSongsPanel'");
    expect(source).toContain("import { HomeView } from './components/HomeView'");
    expect(source).toContain("import { PlayerBar } from './components/PlayerBar'");
    expect(source).toContain("import { Sidebar } from './components/Sidebar'");
    expect(source).toContain("import { TopBar } from './components/TopBar'");
  });

  it('isolates optional panel failures and invalidates artist data before retrying', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');

    expect(source).toContain('const invalidateArtistDetail = useArtistCatalogStore');
    expect(source).toContain('const handleRetryArtistDetail = useCallback');
    expect(source).toContain('invalidateArtistDetail(currentView.providerId, currentView.artistId)');
    expect(source).toContain('onRetry={() => handleRetryArtistDetail(reset)}');
    expect(source).toContain('area="queue-panel"');
    expect(source).toContain('area="similar-songs-panel"');
    expect(source).toContain('QueuePanelErrorFallback');
    expect(source).toContain('SimilarSongsPanelErrorFallback');
  });

  it('subscribes playlist detail state by provider and playlist without global library loading fan-out', () => {
    const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    const sidebarSource = readFileSync(resolve(process.cwd(), 'src/renderer/components/Sidebar.tsx'), 'utf8');

    expect(appSource).toContain('getPlaylistTracksKey(currentView.providerId, currentView.playlistId)');
    expect(appSource).toContain('state.playlistTracksLoadingByKey[activePlaylistTracksKey]');
    expect(appSource).toContain('state.playlistTracksErrorByKey[activePlaylistTracksKey]');
    expect(appSource).not.toContain('const libraryIsLoading = useLibraryStore');
    expect(appSource).not.toContain('const libraryErrorMessage = useLibraryStore');
    expect(sidebarSource).toContain('const libraryIsLoading = useLibraryStore');
  });

  it('defers the ambient Three scene outside the static backdrop module', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/components/VisualBackdrop.tsx'), 'utf8');

    expect(source).not.toContain("import { createAmbientScene } from '../visual/threeScene'");
    expect(source).toContain("import('../visual/threeScene')");
  });
});
