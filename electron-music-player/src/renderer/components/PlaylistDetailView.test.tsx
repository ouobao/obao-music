import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlbumSummary, ChartSummary, Playlist, Song } from '../../shared/musicTypes';
import { usePlayerStore } from '../state/playerStore';
import { createMusicPlayerApi } from '../test/fixtures/musicPlayerApi';
import { PlaylistDetailView } from './PlaylistDetailView';

const playlist: Playlist = {
  id: 'qq:playlist',
  providerId: 'qq',
  title: 'Runtime Sticky Playlist',
  description: 'Long list detail fixture',
  songIds: ['qq:song-1'],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  sourceLabel: 'QQ Music',
  ownership: 'created'
};

const likedPlaylist: Playlist = {
  id: 'qq:liked',
  providerId: 'qq',
  title: '我喜欢',
  description: '6 songs',
  songIds: ['qq:song-1'],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  coverUrl: 'https://example.test/liked-cover.jpg',
  sourceLabel: 'QQ Music',
  isLiked: true
};

const neteaseLikedPlaylist: Playlist = {
  id: 'netease:liked',
  providerId: 'netease',
  title: '阿包充满智慧喜欢的音乐',
  description: '24 songs',
  songIds: ['netease:song-1'],
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  coverUrl: 'https://example.test/netease-liked-cover.jpg',
  sourceLabel: 'Netease',
  isLiked: true
};

const chart: ChartSummary = {
  id: 'qq:chart:62',
  providerId: 'qq',
  platformChartId: '62',
  title: '飙升榜',
  description: '每日更新的热门榜单',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)',
  sourceLabel: 'QQ音乐'
};

const tracks: Song[] = Array.from({ length: 12 }, (_, index) => ({
  id: `qq:song-${index + 1}`,
  providerId: 'qq',
  platformSongId: `song-${index + 1}`,
  title: `Song ${index + 1}`,
  artist: 'Artist',
  album: 'Album',
  durationMs: 180000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
}));

const largeTracks: Song[] = Array.from({ length: 1000 }, (_, index) => ({
  id: `qq:large-song-${index + 1}`,
  providerId: 'qq',
  platformSongId: `large-song-${index + 1}`,
  title: `Large Song ${index + 1}`,
  artist: 'Artist',
  album: 'Album',
  durationMs: 180000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
}));

describe('PlaylistDetailView', () => {
  beforeEach(() => {
    usePlayerStore.getState().resetForTest();
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
          data: { providerId, loggedIn: true, playbackReady: true }
        }),
        logout: async () => ({ ok: true, data: undefined }),
        search: async () => ({ ok: true, data: [] }),
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
            lrc: ''
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reuses the detail surface with chart-specific accessible labels', () => {
    render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView
          playlist={chart}
          tracks={tracks}
          isLoading={false}
          errorMessage={null}
          contentKind="chart"
        />
      </main>
    );

    const detail = screen.getByRole('region', { name: '排行榜详情' });
    expect(within(detail).getByRole('button', { name: '播放榜单：飙升榜' })).toBeInTheDocument();
    expect(within(detail).getByRole('list', { name: '飙升榜 歌曲列表' })).toBeInTheDocument();
  });

  it('delays a text-free track skeleton until loading survives 200ms', () => {
    vi.useFakeTimers();
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={[]} isLoading errorMessage={null} />
      </main>
    );

    expect(screen.queryByText('正在加载歌单曲目')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '歌曲列表' })).not.toBeInTheDocument();
    expect(container.querySelector('.playlist-detail-skeleton')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(container.querySelector('.playlist-detail-skeleton')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(container.querySelectorAll('.playlist-detail-skeleton-row')).toHaveLength(7);
    expect(screen.getByRole('status')).toHaveTextContent('正在加载歌单曲目');
    expect(screen.getByRole('status')).toHaveClass('playlist-detail-loading-status');
    expect(container.querySelector('.playlist-detail-message')).not.toBeInTheDocument();
  });

  it('never mounts the delayed skeleton when tracks resolve quickly', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={[]} isLoading errorMessage={null} />
      </main>
    );

    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.queryByText('正在加载歌单曲目')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '歌曲列表' })).not.toBeInTheDocument();
    rerender(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(container.querySelector('.playlist-detail-skeleton')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Runtime Sticky Playlist 歌曲列表' })).toBeInTheDocument();
  });

  it('reuses the detail surface for an artist with albums, metadata, and refresh', () => {
    const artistPlaylist: Playlist = {
      id: 'qq:artist:0025NhlN2yWrP4',
      providerId: 'qq',
      title: '周杰伦',
      description: '华语创作歌手',
      songIds: tracks.map((song) => song.id),
      coverTone: playlist.coverTone,
      coverUrl: 'https://example.test/artist.jpg',
      sourceLabel: 'QQ音乐'
    };
    const albums: AlbumSummary[] = [{
      id: 'qq:album:000MkMni19ClKG',
      providerId: 'qq',
      platformAlbumId: '000MkMni19ClKG',
      title: '叶惠美',
      artistName: '周杰伦',
      coverTone: playlist.coverTone,
      coverUrl: 'https://example.test/album.jpg',
      releaseDate: '2003-07-31',
      trackCount: 11,
      sourceLabel: 'QQ音乐'
    }];
    const onSelectAlbum = vi.fn();
    const onRefresh = vi.fn();

    render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView
          playlist={artistPlaylist}
          tracks={tracks}
          isLoading={false}
          errorMessage={null}
          contentKind="artist"
          metaItems={['别名：Jay Chou', '560 首歌曲', '43 张专辑']}
          albums={albums}
          onSelectAlbum={onSelectAlbum}
          onRefresh={onRefresh}
        />
      </main>
    );

    const detail = screen.getByRole('region', { name: '歌手详情' });
    expect(within(detail).getByText('别名：Jay Chou')).toBeInTheDocument();
    const tabs = within(detail).getByRole('tablist', { name: '歌手内容' });
    const albumsTab = within(tabs).getByRole('tab', { name: '专辑' });
    const tracksTab = within(tabs).getByRole('tab', { name: '歌曲' });
    expect(tracksTab).toHaveAttribute('aria-selected', 'true');
    expect(within(detail).getByRole('heading', { name: '热门歌曲' })).toBeInTheDocument();
    expect(within(detail).queryByRole('heading', { name: '专辑' })).not.toBeInTheDocument();
    fireEvent.click(albumsTab);
    expect(albumsTab).toHaveAttribute('aria-selected', 'true');
    expect(within(detail).getByRole('heading', { name: '专辑' })).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: '打开专辑：叶惠美' }));
    fireEvent.click(within(detail).getByRole('button', { name: '刷新歌手详情' }));

    expect(onSelectAlbum).toHaveBeenCalledWith(albums[0]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('opens structured song artists and albums without enqueueing the detail row', () => {
    const structuredTrack: Song = {
      ...tracks[0],
      artist: '周杰伦',
      album: '叶惠美',
      artists: [{
        id: 'qq:artist:0025NhlN2yWrP4',
        providerId: 'qq',
        platformArtistId: '0025NhlN2yWrP4',
        name: '周杰伦'
      }],
      albumRef: {
        id: 'qq:album:000MkMni19ClKG',
        providerId: 'qq',
        platformAlbumId: '000MkMni19ClKG',
        title: '叶惠美'
      }
    };
    const onSelectArtist = vi.fn();
    const onSelectAlbum = vi.fn();
    render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView
          playlist={playlist}
          tracks={[structuredTrack]}
          isLoading={false}
          errorMessage={null}
          onSelectArtist={onSelectArtist}
          onSelectAlbum={onSelectAlbum}
        />
      </main>
    );

    fireEvent.click(screen.getByRole('button', { name: '打开歌手：周杰伦' }));
    fireEvent.click(screen.getByRole('button', { name: '打开专辑：叶惠美' }));

    expect(onSelectArtist).toHaveBeenCalledWith(structuredTrack.artists?.[0]);
    expect(onSelectAlbum).toHaveBeenCalledWith(structuredTrack.albumRef);
    expect(usePlayerStore.getState().queue).toEqual([]);
  });

  it('keeps the header clear until the compact threshold and completes each transition after it is triggered', async () => {
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const detail = container.querySelector<HTMLElement>('.playlist-detail-view');
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');

    if (!detail || !songList) {
      throw new Error('Playlist detail fixture did not render');
    }

    await waitFor(() => {
      expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
      expect(detail.style.getPropertyValue('--playlist-detail-cover-current-size')).toBe('128px');
      expect(detail.style.getPropertyValue('--playlist-detail-cover-blur')).toBe('0px');
      expect(detail.style.getPropertyValue('--playlist-detail-header-content-blur')).toBe('0px');
    });
    expect(detail).toHaveAttribute('data-header-compact', 'false');
    expect(within(detail).queryByText('Tracks')).not.toBeInTheDocument();
    expect(detail.style.getPropertyValue('--playlist-detail-cover-blur')).toBe('0px');
    const meta = detail.querySelector<HTMLElement>('.playlist-detail-meta');
    expect(meta).not.toHaveTextContent(/12\s*首歌曲/);

    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      value: 520
    });
    Object.defineProperty(songList, 'scrollHeight', {
      configurable: true,
      value: 860
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      value: 75
    });
    window.dispatchEvent(new Event('resize'));
    fireEvent.scroll(songList);

    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
    expect(detail.style.getPropertyValue('--playlist-detail-cover-blur')).toBe('0px');
    expect(detail).toHaveAttribute('data-header-compact', 'false');

    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      value: 132
    });
    fireEvent.scroll(songList);

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
    expect(detail.style.getPropertyValue('--playlist-detail-cover-blur')).toBe('0px');
    expect(detail.style.getPropertyValue('--playlist-detail-header-content-blur')).toBe('0px');

    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      value: 168
    });
    fireEvent.scroll(songList);

    await waitFor(() => {
      expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('1');
      expect(detail).toHaveAttribute('data-header-compact', 'true');
    });
    expect(detail.style.getPropertyValue('--playlist-detail-cover-current-size')).toBe('64px');
    expect(detail.style.getPropertyValue('--playlist-detail-cover-blur')).toBe('0px');
    expect(detail.style.getPropertyValue('--playlist-detail-hero-current-min-height')).toBe('64px');
    expect(detail.style.getPropertyValue('--playlist-detail-meta-current-opacity')).toBe('1');
    expect(detail.style.getPropertyValue('--playlist-detail-meta-current-max-height')).toBe('36px');
    expect(detail).toHaveAttribute('data-header-compact', 'true');
    await waitFor(() => {
      expect(meta).toHaveTextContent(/12\s*首歌曲/);
    });

    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      value: 132
    });
    fireEvent.scroll(songList);

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('1');
    expect(detail.style.getPropertyValue('--playlist-detail-header-content-blur')).toBe('0px');
    expect(detail).toHaveAttribute('data-header-compact', 'true');

    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      value: 96
    });
    fireEvent.scroll(songList);

    await waitFor(() => {
      expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
      expect(detail.style.getPropertyValue('--playlist-detail-cover-current-size')).toBe('128px');
      expect(detail.style.getPropertyValue('--playlist-detail-cover-blur')).toBe('0px');
      expect(detail.style.getPropertyValue('--playlist-detail-header-content-blur')).toBe('0px');
    });
    expect(detail.style.getPropertyValue('--playlist-detail-cover-blur')).toBe('0px');
    expect(detail.style.getPropertyValue('--playlist-detail-header-content-blur')).toBe('0px');
    expect(detail).toHaveAttribute('data-header-compact', 'false');
  });

  it('snaps the header transition when reduced motion is requested', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })));
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const detail = container.querySelector<HTMLElement>('.playlist-detail-view');
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');

    if (!detail || !songList) {
      throw new Error('Playlist detail fixture did not render');
    }

    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      value: 520
    });
    Object.defineProperty(songList, 'scrollHeight', {
      configurable: true,
      value: 860
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      value: 168
    });
    window.dispatchEvent(new Event('resize'));
    fireEvent.scroll(songList);

    await waitFor(() => {
      expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('1');
    });
    expect(detail.style.getPropertyValue('--playlist-detail-cover-blur')).toBe('0px');
    expect(detail.style.getPropertyValue('--playlist-detail-header-content-blur')).toBe('0px');
  });

  it('snaps the header transition when the app reduced-effects policy is enabled', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })));
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView
          playlist={playlist}
          tracks={tracks}
          isLoading={false}
          errorMessage={null}
          reduceEffects
        />
      </main>
    );
    const detail = container.querySelector<HTMLElement>('.playlist-detail-view');
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    if (!detail || !songList) {
      throw new Error('Playlist detail fixture did not render');
    }

    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      value: 520
    });
    Object.defineProperty(songList, 'scrollHeight', {
      configurable: true,
      value: 860
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      value: 168
    });
    window.dispatchEvent(new Event('resize'));
    fireEvent.scroll(songList);

    act(() => {
      animationFrames.splice(0).forEach((callback) => callback(16));
    });

    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('1');
    expect(detail.style.getPropertyValue('--playlist-detail-header-content-blur')).toBe('0px');
  });

  it('keeps a paused below-threshold header expanded when scrolling settles', async () => {
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const detail = container.querySelector<HTMLElement>('.playlist-detail-view');
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');

    if (!detail || !songList) {
      throw new Error('Playlist detail fixture did not render');
    }

    await waitFor(() => {
      expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
    });

    vi.useFakeTimers();

    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      value: 520
    });
    Object.defineProperty(songList, 'scrollHeight', {
      configurable: true,
      value: 860
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 75
    });
    fireEvent.scroll(songList);
    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
    expect(detail.style.getPropertyValue('--playlist-detail-cover-blur')).toBe('0px');

    act(() => {
      vi.advanceTimersByTime(160);
    });

    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
    expect(detail.style.getPropertyValue('--playlist-detail-cover-blur')).toBe('0px');
    expect(detail).toHaveAttribute('data-header-compact', 'false');
  });

  it('keeps the header expanded when the list cannot scroll far enough to complete compacting', async () => {
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const detail = container.querySelector<HTMLElement>('.playlist-detail-view');
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');

    if (!detail || !songList) {
      throw new Error('Playlist detail fixture did not render');
    }

    await waitFor(() => {
      expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
    });

    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      value: 520
    });
    Object.defineProperty(songList, 'scrollHeight', {
      configurable: true,
      value: 640
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      value: 120
    });
    fireEvent.scroll(songList);

    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
    expect(detail.style.getPropertyValue('--playlist-detail-cover-blur')).toBe('0px');
    expect(detail.style.getPropertyValue('--playlist-detail-cover-current-size')).toBe('128px');
    expect(detail).toHaveAttribute('data-header-compact', 'false');
  });

  it('keeps long playlist descriptions in the expanded header description slot', () => {
    const longDescription = '当城市灯火渐次熄灭，让绵密的低保真节拍裹挟你沉入温柔夜色。朦胧的节拍在耳畔舒展，偶尔闪过的环境音如同坠入浅眠时的意识流。';

    render(
      <main className="main-content">
        <PlaylistDetailView
          playlist={{ ...playlist, description: longDescription }}
          tracks={tracks}
          isLoading={false}
          errorMessage={null}
        />
      </main>
    );

    const description = screen.getByText(longDescription);
    expect(description).toHaveAttribute('title', longDescription);
    expect(description).toHaveClass('playlist-detail-description');
  });

  it('renders a bounded window for oversized playlist details', () => {
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={largeTracks} isLoading={false} errorMessage={null} />
      </main>
    );

    const renderedRows = container.querySelectorAll('.playlist-detail-song-list-item');
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(80);
    expect(screen.getByRole('button', { name: '加入队列：Large Song 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '加入队列：Large Song 1000' })).not.toBeInTheDocument();
  });

  it('keeps artist track tabs on the same bounded virtual song list', () => {
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView
          playlist={{ ...playlist, id: 'qq:artist:large', title: 'Large Artist' }}
          tracks={largeTracks}
          isLoading={false}
          errorMessage={null}
          contentKind="artist"
        />
      </main>
    );

    const detail = container.querySelector<HTMLElement>('.playlist-detail-view');
    const virtualSpace = container.querySelector<HTMLElement>('.playlist-detail-song-list-virtual-space');
    const renderedRows = container.querySelectorAll('.playlist-detail-song-list-item');

    expect(detail).toHaveAttribute('data-artist-tab', 'tracks');
    expect(virtualSpace).toHaveStyle({ height: `${largeTracks.length * 58}px` });
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(80);
    expect(screen.queryByRole('button', { name: '加入队列：Large Song 1000' })).not.toBeInTheDocument();
  });

  it('coalesces oversized playlist scroll rendering into an animation frame', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={largeTracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    if (!songList) {
      throw new Error('Playlist song list did not render');
    }

    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      value: 520
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 520 * 58
    });
    fireEvent.scroll(songList);

    expect(screen.getByRole('button', { name: '加入队列：Large Song 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Large Song 520/ })).not.toBeInTheDocument();

    act(() => {
      animationFrames.splice(0).forEach((callback) => callback(16));
    });

    expect(screen.getByRole('button', { name: '加入队列：Large Song 520' })).toBeInTheDocument();
  });

  it('keeps the virtual window stable across row-sized scroll deltas inside its overscan buffer', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const flushFrames = (timestamp: number) => {
      const pendingFrames = animationFrames.splice(0);
      pendingFrames.forEach((callback) => callback(timestamp));
    };
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView
          playlist={playlist}
          tracks={largeTracks}
          isLoading={false}
          errorMessage={null}
          reduceEffects
        />
      </main>
    );
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    const songWindow = container.querySelector<HTMLElement>('.playlist-detail-song-list-window');
    if (!songList || !songWindow) {
      throw new Error('Playlist virtual window did not render');
    }

    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      value: 520
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 20 * 58
    });

    act(() => {
      flushFrames(0);
      fireEvent.scroll(songList);
      flushFrames(16);
    });
    expect(songWindow.style.transform).toBe('translateY(870px)');

    songList.scrollTop = 23 * 58;
    act(() => {
      fireEvent.scroll(songList);
      flushFrames(32);
    });
    expect(songWindow.style.transform).toBe('translateY(870px)');

    songList.scrollTop = 24 * 58;
    act(() => {
      fireEvent.scroll(songList);
      flushFrames(48);
    });
    expect(songWindow.style.transform).toBe('translateY(1102px)');
  });

  it('starts the full header animation while a large playlist is still scrolling', () => {
    let nextFrameId = 1;
    const animationFrames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      animationFrames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      animationFrames.delete(frameId);
    });
    const flushFrames = (timestamp: number) => {
      const pendingFrames = [...animationFrames.entries()];
      animationFrames.clear();
      pendingFrames.forEach(([, callback]) => callback(timestamp));
    };
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={largeTracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const detail = container.querySelector<HTMLElement>('.playlist-detail-view');
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    if (!detail || !songList) {
      throw new Error('Playlist detail fixture did not render');
    }

    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      value: 520
    });
    Object.defineProperty(songList, 'scrollHeight', {
      configurable: true,
      value: 58000
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 132
    });
    window.dispatchEvent(new Event('resize'));
    fireEvent.scroll(songList);
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 168
    });
    fireEvent.scroll(songList);

    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');

    act(() => {
      flushFrames(16);
      flushFrames(32);
      flushFrames(64);
    });

    expect(Number.parseFloat(detail.style.getPropertyValue('--playlist-detail-scroll-progress'))).toBeGreaterThan(0);
    expect(Number.parseFloat(detail.style.getPropertyValue('--playlist-detail-cover-blur'))).toBeGreaterThan(0);
    expect(animationFrames.size).toBeGreaterThan(0);
  });

  it('locks compact eligibility to expanded geometry while the header animation changes the viewport', () => {
    let nextFrameId = 1;
    const animationFrames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      animationFrames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      animationFrames.delete(frameId);
    });
    const flushFrames = (timestamp: number) => {
      const pendingFrames = [...animationFrames.values()];
      animationFrames.clear();
      pendingFrames.forEach((callback) => callback(timestamp));
    };
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={largeTracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const detail = container.querySelector<HTMLElement>('.playlist-detail-view');
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    if (!detail || !songList) {
      throw new Error('Playlist detail fixture did not render');
    }

    let clientHeight = 520;
    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      get: () => clientHeight
    });
    Object.defineProperty(songList, 'scrollHeight', {
      configurable: true,
      value: 700
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 168
    });

    window.dispatchEvent(new Event('resize'));
    fireEvent.scroll(songList);
    act(() => flushFrames(0));
    act(() => flushFrames(0));
    act(() => flushFrames(160));
    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0.5');

    clientHeight = 620;
    window.dispatchEvent(new Event('resize'));
    act(() => flushFrames(176));
    act(() => flushFrames(240));
    act(() => flushFrames(320));
    act(() => flushFrames(400));

    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('1');
    expect(detail).toHaveAttribute('data-header-compact', 'true');

    window.dispatchEvent(new Event('resize'));
    act(() => flushFrames(416));
    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('1');
  });

  it('rechecks resize geometry received before the transition final frame', () => {
    let nextFrameId = 1;
    const animationFrames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      animationFrames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      animationFrames.delete(frameId);
    });
    const flushFrames = (timestamp: number) => {
      const pendingFrames = [...animationFrames.values()];
      animationFrames.clear();
      pendingFrames.forEach((callback) => callback(timestamp));
    };
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={largeTracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const detail = container.querySelector<HTMLElement>('.playlist-detail-view');
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    if (!detail || !songList) {
      throw new Error('Playlist detail fixture did not render');
    }

    let clientHeight = 520;
    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      get: () => clientHeight
    });
    Object.defineProperty(songList, 'scrollHeight', {
      configurable: true,
      value: 700
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 168
    });

    window.dispatchEvent(new Event('resize'));
    fireEvent.scroll(songList);
    act(() => flushFrames(0));
    act(() => flushFrames(0));
    act(() => flushFrames(160));
    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0.5');

    clientHeight = 650;
    window.dispatchEvent(new Event('resize'));
    act(() => flushFrames(320));

    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
    expect(detail).toHaveAttribute('data-header-compact', 'false');
  });

  it('recalculates the header target after scrolling back during an active transition', () => {
    let nextFrameId = 1;
    const animationFrames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      animationFrames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      animationFrames.delete(frameId);
    });
    const flushFrames = (timestamp: number) => {
      const pendingFrames = [...animationFrames.values()];
      animationFrames.clear();
      pendingFrames.forEach((callback) => callback(timestamp));
    };
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const detail = container.querySelector<HTMLElement>('.playlist-detail-view');
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    if (!detail || !songList) {
      throw new Error('Playlist detail fixture did not render');
    }

    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      value: 520
    });
    Object.defineProperty(songList, 'scrollHeight', {
      configurable: true,
      value: 860
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 168
    });

    window.dispatchEvent(new Event('resize'));
    fireEvent.scroll(songList);
    act(() => flushFrames(0));
    act(() => flushFrames(0));
    act(() => flushFrames(160));
    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0.5');

    songList.scrollTop = 0;
    fireEvent.scroll(songList);

    act(() => {
      for (let timestamp = 176; animationFrames.size > 0 && timestamp <= 1024; timestamp += 64) {
        flushFrames(timestamp);
      }
    });

    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
    expect(detail).toHaveAttribute('data-header-compact', 'false');
  });

  it('resets an in-flight header transition when the song list disappears', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const { container, rerender } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={largeTracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const detail = container.querySelector<HTMLElement>('.playlist-detail-view');
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    if (!detail || !songList) {
      throw new Error('Playlist detail fixture did not render');
    }

    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      value: 520
    });
    Object.defineProperty(songList, 'scrollHeight', {
      configurable: true,
      value: 58000
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 168
    });
    window.dispatchEvent(new Event('resize'));
    fireEvent.scroll(songList);

    act(() => {
      animationFrames.splice(0).forEach((callback) => callback(0));
      animationFrames.splice(0).forEach((callback) => callback(0));
      animationFrames.splice(0).forEach((callback) => callback(160));
    });

    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0.5');
    expect(detail.style.getPropertyValue('--playlist-detail-header-content-blur')).toBe('22px');

    rerender(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={[]} isLoading={true} errorMessage={null} />
      </main>
    );

    expect(container.querySelector('.playlist-detail-song-list')).not.toBeInTheDocument();
    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
    expect(detail.style.getPropertyValue('--playlist-detail-header-content-blur')).toBe('0px');
    expect(detail).toHaveAttribute('data-header-compact', 'false');
  });

  it('resets the scroll host and expanded header when the playlist changes', async () => {
    const committedSongWindows: string[][] = [];
    const recordCommittedSongWindow = () => {
      committedSongWindows.push(
        Array.from(document.querySelectorAll<HTMLElement>('.playlist-detail-song-row'))
          .map((row) => row.dataset.songId ?? '')
      );
    };
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })));
    const { container, rerender } = render(
      <Profiler id="playlist-detail" onRender={recordCommittedSongWindow}>
        <main className="main-content main-content-playlist">
          <PlaylistDetailView playlist={playlist} tracks={largeTracks} isLoading={false} errorMessage={null} />
        </main>
      </Profiler>
    );
    const detail = container.querySelector<HTMLElement>('.playlist-detail-view');
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    if (!detail || !songList) {
      throw new Error('Playlist detail fixture did not render');
    }

    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      value: 520
    });
    Object.defineProperty(songList, 'scrollHeight', {
      configurable: true,
      value: 58000
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 520 * 58
    });
    window.dispatchEvent(new Event('resize'));
    fireEvent.scroll(songList);

    await waitFor(() => {
      expect(detail).toHaveAttribute('data-header-compact', 'true');
      expect(screen.getByRole('button', { name: '加入队列：Large Song 520' })).toBeInTheDocument();
    });

    committedSongWindows.length = 0;
    rerender(
      <Profiler id="playlist-detail" onRender={recordCommittedSongWindow}>
        <main className="main-content main-content-playlist">
          <PlaylistDetailView
            playlist={{ ...playlist, id: 'qq:next-playlist', title: 'Next Playlist' }}
            tracks={largeTracks}
            isLoading={false}
            errorMessage={null}
          />
        </main>
      </Profiler>
    );

    const nextSongList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    expect(nextSongList).toBe(songList);
    expect(nextSongList?.scrollTop).toBe(0);
    expect(committedSongWindows[0]).toContain('qq:large-song-1');
    expect(committedSongWindows[0]).not.toContain('qq:large-song-520');
    expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
    expect(detail.style.getPropertyValue('--playlist-detail-header-content-blur')).toBe('0px');
    expect(detail).toHaveAttribute('data-header-compact', 'false');
  });

  it('does not read list layout metrics during playlist scroll frames', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const { container } = render(
      <main className="main-content main-content-playlist">
        <PlaylistDetailView playlist={playlist} tracks={largeTracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    if (!songList) {
      throw new Error('Playlist song list did not render');
    }

    act(() => {
      animationFrames.splice(0).forEach((callback) => callback(16));
    });

    const readClientHeight = vi.fn(() => 520);
    const readScrollHeight = vi.fn(() => 58000);
    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      get: readClientHeight
    });
    Object.defineProperty(songList, 'scrollHeight', {
      configurable: true,
      get: readScrollHeight
    });
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 168
    });
    readClientHeight.mockClear();
    readScrollHeight.mockClear();

    fireEvent.scroll(songList);

    act(() => {
      animationFrames.splice(0).forEach((callback) => callback(32));
    });

    expect(readClientHeight).not.toHaveBeenCalled();
    expect(readScrollHeight).not.toHaveBeenCalled();
  });

  it('renders an in-flow shell around the animated header', () => {
    const { container } = render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const shell = container.querySelector<HTMLElement>('.playlist-detail-hero-shell');
    const hero = container.querySelector<HTMLElement>('.playlist-detail-hero');

    expect(shell).toBeInTheDocument();
    expect(hero).toBeInTheDocument();
    expect(shell?.firstElementChild).toBe(hero);
  });

  it('uses the supplied App-level cover palette for the playlist artwork glow', () => {
    const { container } = render(
      <main className="main-content">
        <PlaylistDetailView
          playlist={{ ...playlist, coverUrl: 'https://example.test/playlist-cover.jpg' }}
          tracks={tracks}
          isLoading={false}
          errorMessage={null}
          coverPalette={{
            primary: '#b41e28',
            secondary: '#2a4e36',
            shadow: '#b41e28',
            tone: 'linear-gradient(135deg, #b41e28, #2a4e36)'
          }}
        />
      </main>
    );
    const cover = container.querySelector<HTMLElement>('.playlist-detail-cover');

    if (!cover) {
      throw new Error('Playlist detail cover did not render');
    }

    expect(cover.style.getPropertyValue('--playlist-detail-cover-glow')).toBe('#b41e28');
  });

  it('uses a theme-neutral cover glow when no App-level palette is supplied', () => {
    class PendingImage {
      crossOrigin = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {}
    }
    vi.stubGlobal('Image', PendingImage);

    const { container } = render(
      <main className="main-content">
        <PlaylistDetailView
          playlist={{ ...playlist, coverUrl: 'https://y.gtimg.cn/music/photo_new/pending.jpg' }}
          tracks={tracks}
          isLoading={false}
          errorMessage={null}
        />
      </main>
    );

    expect(
      container.querySelector<HTMLElement>('.playlist-detail-cover')?.style
        .getPropertyValue('--playlist-detail-cover-glow')
    ).toBe('var(--qq-text)');
  });

  it('renders liked playlist detail without a header cover image', () => {
    const { container } = render(
      <main className="main-content">
        <PlaylistDetailView playlist={likedPlaylist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );

    const detail = screen.getByRole('region', { name: '歌单详情' });

    expect(within(detail).getByRole('heading', { name: '喜欢的音乐' })).toBeInTheDocument();
    expect(container.querySelector('.playlist-detail-cover')).not.toBeInTheDocument();
  });

  it('normalizes official netease liked playlist titles in user-facing detail text', () => {
    render(
      <main className="main-content">
        <PlaylistDetailView playlist={neteaseLikedPlaylist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );

    const detail = screen.getByRole('region', { name: '歌单详情' });

    expect(within(detail).getByRole('heading', { name: '我喜欢的音乐' })).toBeInTheDocument();
    expect(within(detail).queryByText('阿包充满智慧喜欢的音乐')).not.toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: '播放歌单：我喜欢的音乐' })).toBeInTheDocument();
    expect(within(detail).getByRole('list', { name: '我喜欢的音乐 歌曲列表' })).toBeInTheDocument();
  });

  it('does not render a generic Playlist label in the header', () => {
    render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );

    const detail = within(document.body).getByRole('region', { name: '歌单详情' });

    expect(within(detail).queryByText('Playlist')).not.toBeInTheDocument();
  });

  it('renders playlist source information and a primary play action in the header', () => {
    render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );

    const detail = screen.getByRole('region', { name: '歌单详情' });

    expect(within(detail).getByText('来源：QQ 音乐')).toBeInTheDocument();
    const meta = detail.querySelector<HTMLElement>('.playlist-detail-meta');
    expect(meta).toBeInTheDocument();
    expect(meta?.querySelectorAll('span')).toHaveLength(1);
    expect(meta).not.toHaveTextContent(/12\s*首歌曲/);
    expect(within(detail).getByRole('button', { name: '播放歌单：Runtime Sticky Playlist' })).toHaveTextContent('播放');
  });

  it('plays the playlist from the first track when the header play action is clicked', () => {
    render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );

    fireEvent.click(screen.getByRole('button', { name: '播放歌单：Runtime Sticky Playlist' }));

    const playerState = usePlayerStore.getState();
    expect(playerState.currentSong?.id).toBe(tracks[0].id);
    expect(playerState.queue.map((item) => item.songId)).toEqual(tracks.map((track) => track.id));
    expect(playerState.queue[0]?.sourceContext).toMatchObject({
      type: 'playlist',
      providerId: 'qq',
      playlistId: 'qq:playlist',
      playlistTitle: 'Runtime Sticky Playlist'
    });
  });

  it('reports a started playback toast when the header play action starts the playlist', () => {
    const handlePlaybackStarted = vi.fn();
    render(
      <main className="main-content">
        <PlaylistDetailView
          playlist={playlist}
          tracks={tracks}
          isLoading={false}
          errorMessage={null}
          onPlaybackStarted={handlePlaybackStarted}
        />
      </main>
    );

    fireEvent.click(screen.getByRole('button', { name: '播放歌单：Runtime Sticky Playlist' }));

    expect(handlePlaybackStarted).toHaveBeenCalledWith('已开始播放');
  });

  it('starts the playlist from a randomized track when header play is clicked in shuffle mode', () => {
    usePlayerStore.getState().setPlaybackMode('shuffle');
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );

    fireEvent.click(screen.getByRole('button', { name: '播放歌单：Runtime Sticky Playlist' }));

    const playerState = usePlayerStore.getState();
    expect(playerState.currentSong?.id).toBe(tracks.at(-1)?.id);
    expect(playerState.queue.map((item) => item.songId)).toEqual(tracks.map((track) => track.id));
  });

  it('replaces the queue with the playlist context when a playlist song is double clicked', () => {
    render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );

    fireEvent.doubleClick(screen.getByRole('button', { name: `加入队列：${tracks[4].title}` }));

    const playerState = usePlayerStore.getState();
    expect(playerState.currentSong?.id).toBe(tracks[4].id);
    expect(playerState.queue.map((item) => item.songId)).toEqual(tracks.map((track) => track.id));
  });

  it('reports a started playback toast when a playlist song is double clicked', () => {
    const handlePlaybackStarted = vi.fn();
    render(
      <main className="main-content">
        <PlaylistDetailView
          playlist={playlist}
          tracks={tracks}
          isLoading={false}
          errorMessage={null}
          onPlaybackStarted={handlePlaybackStarted}
        />
      </main>
    );

    fireEvent.doubleClick(screen.getByRole('button', { name: `加入队列：${tracks[4].title}` }));

    expect(handlePlaybackStarted).toHaveBeenCalledWith('已开始播放');
  });

  it('highlights the currently playing song in the visible playlist', () => {
    usePlayerStore.getState().playSongsFromList(
      tracks,
      3,
      (song) => ({
        type: 'playlist',
        providerId: playlist.providerId,
        playlistId: playlist.id,
        playlistTitle: playlist.title
      })
    );

    render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );

    const currentSong = screen.getByRole('button', { name: `加入队列：${tracks[3].title}` });

    expect(currentSong).toHaveClass('song-row-current');
    expect(currentSong).toHaveAttribute('data-current', 'true');
  });

  it('shows a smooth scroll-to-top control once the playlist is scrolled', async () => {
    const { container } = render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    if (!songList) {
      throw new Error('Playlist song list did not render');
    }

    const scrollTo = vi.fn();
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 64
    });
    songList.scrollTo = scrollTo;
    fireEvent.scroll(songList);

    await waitFor(() => {
      expect(container.querySelector('.playlist-detail-floating-button')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: '回到歌单顶部' }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('keeps floating scroll controls mounted while their close animation plays', () => {
    vi.useFakeTimers();
    const { container } = render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    if (!songList) {
      throw new Error('Playlist song list did not render');
    }

    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 64
    });
    fireEvent.scroll(songList);

    act(() => {
      vi.advanceTimersByTime(16);
    });

    const scrollTopButton = screen.getByRole('button', { name: '回到歌单顶部' });
    expect(scrollTopButton).toHaveAttribute('data-state', 'open');

    songList.scrollTop = 0;
    fireEvent.scroll(songList);

    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(screen.getByRole('button', { name: '回到歌单顶部' })).toHaveAttribute('data-state', 'closed');

    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(screen.queryByRole('button', { name: '回到歌单顶部' })).not.toBeInTheDocument();
  });

  it('shows a locator control when the current song is outside the visible playlist area', async () => {
    usePlayerStore.getState().playSongsFromList(
      tracks,
      7,
      () => ({
        type: 'playlist',
        providerId: playlist.providerId,
        playlistId: playlist.id,
        playlistTitle: playlist.title
      })
    );
    const { container } = render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const songList = container.querySelector<HTMLElement>('.playlist-detail-song-list');
    const currentSong = screen.getByRole('button', { name: `加入队列：${tracks[7].title}` });
    if (!songList) {
      throw new Error('Playlist song list did not render');
    }

    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 180
    });
    Object.defineProperty(songList, 'clientHeight', {
      configurable: true,
      value: 160
    });
    const scrollIntoView = vi.fn();
    currentSong.scrollIntoView = scrollIntoView;
    window.dispatchEvent(new Event('resize'));
    fireEvent.scroll(songList);

    await waitFor(() => {
      expect(container.querySelector('.playlist-detail-floating-button')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: '定位到正在播放' }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
  });

  it('uses a themed action column instead of row numbers for playlist songs', () => {
    render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );

    const firstSong = screen.getByRole('button', { name: `加入队列：${tracks[0].title}` });

    expect(firstSong.querySelector('.song-index')).not.toBeInTheDocument();
    expect(firstSong.querySelector('.song-row-actions')).toBeInTheDocument();
    expect(within(firstSong).getByRole('button', { name: new RegExp(`\\u6dfb\\u52a0\\u5230\\u559c\\u6b22.*${tracks[0].title}`) })).toBeInTheDocument();
    expect(within(firstSong).queryByRole('button', { name: /\u4e0b\u8f7d/ })).not.toBeInTheDocument();
  });

  it('renders playlist song column headers aligned with the row columns', () => {
    render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );

    const songList = screen.getByRole('list', { name: new RegExp(playlist.title) });
    const songListShell = songList.closest('.song-list-scroll-shell') as HTMLElement;

    expect(within(songListShell).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '\u6b4c\u66f2\u540d\u79f0',
      '\u64cd\u4f5c',
      '\u4e13\u8f91',
      '\u65f6\u957f'
    ]);
  });

  it('opens the playlist song menu from right click and keeps only supported actions', () => {
    render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );

    const firstSong = screen.getByRole('button', { name: `加入队列：${tracks[0].title}` });
    const songList = firstSong.closest('.playlist-detail-song-list') as HTMLElement | null;
    if (!songList) {
      throw new Error('Playlist song list did not render');
    }
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0
    });
    fireEvent.contextMenu(firstSong, { clientX: 320, clientY: 240 });

    const menu = screen.getByRole('menu', { name: new RegExp(tracks[0].title) });
    expect(firstSong).not.toContainElement(menu);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.getPropertyValue('--song-menu-x')).toBe('320px');
    expect(menu.style.getPropertyValue('--song-menu-y')).toBe('240px');
    expect(within(menu).getByRole('menuitem', { name: '\u64ad\u653e' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: '\u4e0b\u4e00\u9996\u64ad\u653e' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: '\u6211\u559c\u6b22' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: '\u6dfb\u52a0\u5230' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: '\u5220\u9664' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: '\u590d\u5236\u6b4c\u66f2\u4fe1\u606f' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /\u4e0b\u8f7d/ })).not.toBeInTheDocument();

    songList.scrollTop = 120;
    fireEvent.scroll(songList);
    expect(songList.scrollTop).toBe(0);
  });

  it('opens the same playlist menu from the more action button', () => {
    render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );

    const firstSong = screen.getByRole('button', { name: `加入队列：${tracks[0].title}` });
    const songList = firstSong.closest('.playlist-detail-song-list') as HTMLElement | null;
    if (!songList) {
      throw new Error('Playlist song list did not render');
    }
    Object.defineProperty(songList, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0
    });
    const moreButton = within(firstSong).getByRole('button', { name: new RegExp(`\\u66f4\\u591a\\u64cd\\u4f5c.*${tracks[0].title}`) });
    Object.defineProperty(moreButton, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 180.2,
        height: 28,
        left: 412.4,
        right: 440.4,
        top: 152.2,
        width: 28,
        x: 412.4,
        y: 152.2,
        toJSON: () => undefined
      })
    });
    fireEvent.click(moreButton);

    const menu = screen.getByRole('menu', { name: new RegExp(tracks[0].title) });
    expect(firstSong).not.toContainElement(menu);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.getPropertyValue('--song-menu-x')).toBe('412px');
    expect(menu.style.getPropertyValue('--song-menu-y')).toBe('186px');

    songList.scrollTop = 120;
    fireEvent.scroll(songList);
    expect(songList.scrollTop).toBe(0);
  });

  it('keeps the expanded artwork stable while the page settles near the top', async () => {
    const { container } = render(
      <main className="main-content">
        <PlaylistDetailView playlist={playlist} tracks={tracks} isLoading={false} errorMessage={null} />
      </main>
    );
    const scrollHost = container.querySelector<HTMLElement>('.main-content');
    const detail = container.querySelector<HTMLElement>('.playlist-detail-view');

    if (!scrollHost || !detail) {
      throw new Error('Playlist detail fixture did not render');
    }

    await waitFor(() => {
      expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
    });

    fireEvent.scroll(scrollHost, { target: { scrollTop: 6 } });

    await waitFor(() => {
      expect(detail.style.getPropertyValue('--playlist-detail-scroll-progress')).toBe('0');
    });
    expect(detail.style.getPropertyValue('--playlist-detail-cover-current-size')).toBe('128px');
    expect(detail.style.getPropertyValue('--playlist-detail-cover-blur')).toBe('0px');
    expect(detail.style.getPropertyValue('--playlist-detail-hero-current-min-height')).toBe('156px');
  });
});
