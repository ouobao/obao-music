import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlbumSummary, HomepageBlockFeed, RecommendationHomeFeed, Song } from '../../../shared/musicTypes';
import { useAppNotificationStore } from '../../state/appNotificationStore';
import { DiscoveryHomeHeader } from './DiscoveryHomeHeader';
import { DiscoverySectionState } from './DiscoverySectionState';
import { NeteaseDiscoveryHome } from './NeteaseDiscoveryHome';
import { QQDiscoveryHome } from './QQDiscoveryHome';

const idleStatus = { isLoading: false, errorMessage: null };
const loadingStatus = { isLoading: true, errorMessage: null };

describe('discovery home presentation', () => {
  beforeEach(() => {
    useAppNotificationStore.getState().resetForTest();
  });

  it('renders the QQ recommendation collection without unavailable service placeholders', () => {
    const qqNewSongs = Array.from({ length: 12 }, (_, index) => ({
      ...createSong(index + 100),
      id: `qq:${index + 100}`,
      providerId: 'qq' as const,
      platformSongId: String(index + 100),
      title: `QQ 新歌 ${index + 1}`
    }));
    const onPlaySongs = vi.fn();
    const onPlaySong = vi.fn();
    const onOpenCollection = vi.fn();
    const { container } = render(
      <QQDiscoveryHome
        nickname="测试用户"
        isLoggedIn
        recommendationFeed={createRecommendationFeed({
          providerId: 'qq',
          newSongs: qqNewSongs
        })}
        currentSongId={qqNewSongs[1].id}
        recommendationStatus={idleStatus}
        onPlaySongs={onPlaySongs}
        onPlaySong={onPlaySong}
        onOpenCollection={onOpenCollection}
      />
    );

    expect(screen.getByRole('heading', { name: 'Hi，测试用户，今天听点什么' })).toBeInTheDocument();
    expect(screen.getByText('QQ 账号已连接')).toBeInTheDocument();
    expect(container.querySelectorAll('.qq-discovery-primary-card')).toHaveLength(1);
    expect(container.querySelectorAll('.qq-discovery-service-card')).toHaveLength(0);
    expect(container.querySelectorAll('.qq-discovery-new-song-row')).toHaveLength(16);
    expect(container.querySelectorAll('.qq-discovery-playlist-card')).toHaveLength(0);
    expect(container.querySelectorAll('.qq-discovery-chart-card')).toHaveLength(0);
    expect(container.querySelectorAll('.netease-discovery-playlist-card')).toHaveLength(0);
    expect(container.querySelectorAll('.netease-discovery-chart-card')).toHaveLength(0);

    expect(screen.queryByRole('button', { name: /暂不可用/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开新歌推荐' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '播放新歌推荐' })).toBeEnabled();
    const newSongsSection = screen.getByRole('heading', { name: '新歌推荐' }).closest('section');
    expect(newSongsSection).not.toBeNull();
    expect(within(newSongsSection!).getByRole('button', {
      name: `播放歌曲：${qqNewSongs[1].title} - ${qqNewSongs[1].artist}`
    })).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByText(/榜|歌单/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '打开新歌推荐' }));
    expect(onOpenCollection).toHaveBeenCalledWith('new');
    expect(onPlaySongs).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '播放新歌推荐' }));
    expect(onPlaySongs).toHaveBeenLastCalledWith(qqNewSongs, '新歌推荐');
    const qqSongButton = within(newSongsSection!).getByRole('button', {
      name: `播放歌曲：${qqNewSongs[2].title} - ${qqNewSongs[2].artist}`
    });
    fireEvent.click(qqSongButton);
    expect(onPlaySong).not.toHaveBeenCalled();
    fireEvent.doubleClick(qqSongButton);
    expect(onPlaySong).toHaveBeenCalledWith(qqNewSongs[2], qqNewSongs, '新歌推荐');
  });

  it('renders Netease daily and new-song modules with cross-section deduplication', () => {
    const dailySongs = Array.from({ length: 12 }, (_, index) => createSong(index));
    const uniqueNewSongs = Array.from({ length: 11 }, (_, index) => createSong(index + 20));
    const feed = createRecommendationFeed({
      loggedIn: true,
      dailySongs: [...dailySongs, dailySongs[0]],
      newSongs: [dailySongs[0], ...uniqueNewSongs, uniqueNewSongs[0]]
    });
    const onPlaySongs = vi.fn();
    const onPlaySong = vi.fn();
    const onOpenCollection = vi.fn();
    const { container } = render(
      <NeteaseDiscoveryHome
        recommendationFeed={feed}
        currentSongId={dailySongs[1].id}
        dailyStatus={idleStatus}
        newStatus={idleStatus}
        onPlaySongs={onPlaySongs}
        onPlaySong={onPlaySong}
        onOpenCollection={onOpenCollection}
      />
    );

    expect(container.querySelectorAll('.netease-discovery-feature-card')).toHaveLength(1);
    expect(container.querySelectorAll('.netease-discovery-song-row')).toHaveLength(27);
    expect(container.querySelectorAll('.netease-discovery-playlist-card')).toHaveLength(0);
    expect(container.querySelectorAll('.netease-discovery-chart-card')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: /歌单|榜单/ })).not.toBeInTheDocument();

    const dailyFeatureCard = container.querySelector('.netease-discovery-feature-card-interactive');
    const dailyFeaturePreviews = Array.from(
      dailyFeatureCard?.querySelectorAll('.netease-discovery-feature-preview-song > span') ?? [],
      (preview) => preview.textContent
    );
    expect(dailyFeatureCard).not.toBeNull();
    expect(dailyFeatureCard).toHaveStyle({
      '--netease-feature-primary': '#607d8b',
      '--netease-feature-secondary': '#9c6f86'
    });
    expect(dailyFeaturePreviews).toEqual(dailySongs.slice(0, 3).map((song) => song.title));
    expect(dailyFeaturePreviews).not.toContain(dailySongs[3].title);

    const dailySection = screen.getByRole('heading', { name: '每日推荐' }).closest('section');
    const newSongsSection = screen.getByRole('heading', { name: '最新音乐' }).closest('section');
    expect(dailySection).not.toBeNull();
    expect(newSongsSection).not.toBeNull();
    expect(within(dailySection!).getByText(dailySongs[0].title)).toBeInTheDocument();
    expect(within(newSongsSection!).queryByText(dailySongs[0].title)).not.toBeInTheDocument();
    expect(within(newSongsSection!).getByText(uniqueNewSongs[0].title)).toBeInTheDocument();
    expect(within(newSongsSection!).getByText(uniqueNewSongs[9].title)).toBeInTheDocument();

    const currentSongButton = within(dailySection!).getByRole('button', {
      name: `播放歌曲：${dailySongs[1].title} - ${dailySongs[1].artist}`
    });
    expect(currentSongButton).toHaveAttribute('aria-current', 'true');
    expect(currentSongButton.closest('.netease-discovery-song-row'))
      .toHaveClass('netease-discovery-song-row-current');

    fireEvent.click(screen.getByRole('button', { name: '打开每日推荐' }));
    expect(onOpenCollection).toHaveBeenCalledWith('daily');
    expect(onPlaySongs).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '播放每日推荐' }));
    expect(onPlaySongs).toHaveBeenLastCalledWith(dailySongs, '每日推荐');

    fireEvent.click(within(newSongsSection!).getByRole('button', { name: '播放全部' }));
    expect(onPlaySongs).toHaveBeenLastCalledWith(uniqueNewSongs, '最新音乐');

    const dailySongButton = within(dailySection!).getByRole('button', {
      name: `播放歌曲：${dailySongs[0].title} - ${dailySongs[0].artist}`
    });
    fireEvent.click(dailySongButton);
    expect(onPlaySong).not.toHaveBeenCalled();
    fireEvent.doubleClick(dailySongButton);
    expect(onPlaySong).toHaveBeenCalledWith(dailySongs[0], dailySongs, '每日推荐');
  });

  it('renders only song and topic homepage blocks without writing playback until a song action is explicit', () => {
    const homepageSong = createSong(90);
    const homepageBlockFeed = {
      providerId: 'netease',
      blocks: [
        {
          kind: 'song',
          id: 'netease:homepage-block:fixture-songs',
          title: '多元旋律之旅',
          songs: [homepageSong]
        },
        {
          kind: 'topic',
          id: 'netease:homepage-topic:fixture',
          title: '官方专题',
          description: '专题描述',
          coverTone: 'linear-gradient(135deg, #607d8b, #9c6f86)'
        },
        { kind: 'playlist', id: 'blocked-playlist', title: 'Blocked Playlist', songs: [] },
        { kind: 'chart', id: 'blocked-chart', title: 'Blocked Chart', songs: [] },
        { kind: 'unknown', id: 'blocked-unknown', title: 'Blocked Unknown', songs: [] }
      ]
    } as unknown as HomepageBlockFeed;
    const onPlaySongs = vi.fn();
    const onPlaySong = vi.fn();

    const { container } = render(
      <NeteaseDiscoveryHome
        recommendationFeed={createRecommendationFeed()}
        homepageBlockFeed={homepageBlockFeed}
        dailyStatus={idleStatus}
        newStatus={idleStatus}
        homepageBlockStatus={idleStatus}
        onPlaySongs={onPlaySongs}
        onPlaySong={onPlaySong}
      />
    );

    const homepageSection = screen.getByRole('heading', { name: '多元旋律之旅' }).closest('section');
    expect(homepageSection).not.toBeNull();
    expect(within(homepageSection!).getByText(homepageSong.title)).toBeInTheDocument();
    expect(screen.queryByText('官方专题')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.netease-discovery-playlist-card')).toHaveLength(0);
    expect(container.querySelectorAll('.netease-discovery-chart-card')).toHaveLength(0);
    expect(screen.queryByText('Blocked Playlist')).not.toBeInTheDocument();
    expect(screen.queryByText('Blocked Chart')).not.toBeInTheDocument();
    expect(screen.queryByText('Blocked Unknown')).not.toBeInTheDocument();
    expect(onPlaySongs).not.toHaveBeenCalled();
    expect(onPlaySong).not.toHaveBeenCalled();

    fireEvent.click(within(homepageSection!).getByRole('button', { name: '播放全部' }));
    expect(onPlaySongs).toHaveBeenLastCalledWith([homepageSong], '多元旋律之旅');
    const homepageSongButton = within(homepageSection!).getByRole('button', {
      name: `播放歌曲：${homepageSong.title} - ${homepageSong.artist}`
    });
    fireEvent.click(homepageSongButton);
    expect(onPlaySong).not.toHaveBeenCalled();
    fireEvent.doubleClick(homepageSongButton);
    expect(onPlaySong).toHaveBeenLastCalledWith(homepageSong, [homepageSong], '多元旋律之旅');
  });

  it('omits unavailable Netease services and exposes song-specific empty states', () => {
    const { container } = render(
      <NeteaseDiscoveryHome
        recommendationFeed={createRecommendationFeed()}
        dailyStatus={idleStatus}
        newStatus={idleStatus}
      />
    );

    expect(container.querySelectorAll('.netease-discovery-feature-card')).toHaveLength(0);
    expect(container.querySelectorAll('.netease-discovery-song-row')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /暂不可用/ })).not.toBeInTheDocument();
    expect(screen.queryByText('登录网易云音乐后获取每日推荐歌曲')).not.toBeInTheDocument();
    expect(screen.getByText('当前暂无可用的新歌推荐')).toBeInTheDocument();
    expect(screen.queryByText(/推荐歌单|榜单精选|精选有声书/)).not.toBeInTheDocument();
  });

  it('keeps Netease loading skeleton counts aligned with both song modules', () => {
    const { container } = render(
      <NeteaseDiscoveryHome
        recommendationFeed={null}
        dailyStatus={loadingStatus}
        newStatus={loadingStatus}
      />
    );

    expect(container.querySelectorAll('.discovery-section-state[aria-busy="true"]')).toHaveLength(2);
    expect(container.querySelectorAll('.discovery-section-loading-placeholder')).toHaveLength(2);
    expect(container.querySelectorAll('.netease-discovery-feature-card')).toHaveLength(0);
    expect(container.querySelectorAll('.netease-discovery-song-row')).toHaveLength(24);
    expect(screen.getAllByRole('status').map((status) => status.textContent)).toEqual([
      '正在加载每日推荐',
      '正在加载最新音乐'
    ]);
  });

  it('keeps Netease daily errors and new-song loading controls independent', () => {
    const dailySongs = [createSong(31)];
    const newSongs = [createSong(32)];
    const onRefreshDaily = vi.fn();
    const onRefreshNew = vi.fn();
    render(
      <NeteaseDiscoveryHome
        recommendationFeed={createRecommendationFeed({ loggedIn: true, dailySongs, newSongs })}
        dailyStatus={{ isLoading: false, errorMessage: '每日推荐暂时不可用' }}
        newStatus={{ isLoading: true, errorMessage: null }}
        onRefreshDaily={onRefreshDaily}
        onRefreshNew={onRefreshNew}
      />
    );

    const dailySection = screen.getByRole('heading', { name: '每日推荐' }).closest('section');
    const newSection = screen.getByRole('heading', { name: '最新音乐' }).closest('section');
    expect(dailySection).not.toBeNull();
    expect(newSection).not.toBeNull();
    expect(within(dailySection!).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(dailySection!).queryByText('每日推荐暂时不可用')).not.toBeInTheDocument();
    expect(within(newSection!).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(newSection!).getByRole('status')).toHaveTextContent('正在刷新，当前内容仍可使用');
    expect(useAppNotificationStore.getState().notification).toMatchObject({
      key: 'discovery-section:正在加载每日推荐',
      message: '每日推荐暂时不可用',
      tone: 'error'
    });

    fireEvent.click(within(dailySection!).getByRole('button', { name: '重试每日推荐' }));
    expect(onRefreshDaily).toHaveBeenCalledTimes(1);
    expect(onRefreshNew).not.toHaveBeenCalled();
    expect(within(newSection!).getByRole('button', { name: '正在刷新最新音乐' })).toBeDisabled();
  });

  it('renders provider-local frequent artist albums with explicit Oubao provenance', () => {
    const qqAlbum = createAlbum('qq', 'frequent-qq', 'QQ 常听新专');
    const neteaseAlbum = createAlbum('netease', 'frequent-netease', '网易常听新专');
    const { rerender } = render(
      <QQDiscoveryHome
        isLoggedIn={false}
        recommendationFeed={createRecommendationFeed({ providerId: 'qq' })}
        recommendationStatus={idleStatus}
        frequentArtistAlbums={[qqAlbum]}
        frequentArtistAlbumsStatus={idleStatus}
      />
    );

    expect(screen.getByRole('heading', { name: '常听歌手专辑' })).toBeInTheDocument();
    expect(screen.getByText('欧包音乐 · 基于本地收听记录生成')).toBeInTheDocument();
    expect(screen.getByText(qqAlbum.title)).toBeInTheDocument();
    expect(screen.queryByText(neteaseAlbum.title)).not.toBeInTheDocument();

    rerender(
      <NeteaseDiscoveryHome
        recommendationFeed={createRecommendationFeed()}
        dailyStatus={idleStatus}
        newStatus={idleStatus}
        frequentArtistAlbums={[neteaseAlbum]}
        frequentArtistAlbumsStatus={idleStatus}
      />
    );
    expect(screen.getByText(neteaseAlbum.title)).toBeInTheDocument();
    expect(screen.queryByText(qqAlbum.title)).not.toBeInTheDocument();
  });

  it('hides frequent artist albums when no reliable local result exists', () => {
    render(
      <QQDiscoveryHome
        isLoggedIn={false}
        recommendationFeed={createRecommendationFeed({ providerId: 'qq' })}
        recommendationStatus={idleStatus}
        frequentArtistAlbums={[]}
        frequentArtistAlbumsStatus={idleStatus}
      />
    );

    expect(screen.queryByRole('heading', { name: '常听歌手专辑' })).not.toBeInTheDocument();
  });

  it('keeps stale section content available during refresh and alongside a local error', () => {
    const { rerender } = render(
      <DiscoverySectionState
        isLoading
        errorMessage={null}
        isEmpty={false}
        loadingLabel="正在加载"
        emptyMessage="暂无内容"
      >
        <button type="button">旧内容仍可操作</button>
      </DiscoverySectionState>
    );

    expect(screen.getByRole('button', { name: '旧内容仍可操作' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('正在刷新，当前内容仍可使用');

    rerender(
      <DiscoverySectionState
        isLoading={false}
        errorMessage="刷新失败"
        isEmpty={false}
        loadingLabel="正在加载"
        emptyMessage="暂无内容"
      >
        <button type="button">旧内容仍可操作</button>
      </DiscoverySectionState>
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('刷新失败')).not.toBeInTheDocument();
    expect(useAppNotificationStore.getState().notification).toMatchObject({
      key: 'discovery-section:正在加载',
      message: '刷新失败',
      tone: 'error'
    });
    expect(screen.getByRole('button', { name: '旧内容仍可操作' })).toBeEnabled();
  });

  it('exposes provider switching and refresh as accessible header commands', () => {
    const onProviderChange = vi.fn();
    const onRefresh = vi.fn();
    const { rerender, container } = render(
      <DiscoveryHomeHeader
        providerId="qq"
        isRefreshing={false}
        onProviderChange={onProviderChange}
        onRefresh={onRefresh}
      />
    );

    expect(container.querySelector('.provider-segmented-control')).toHaveAttribute('data-provider', 'qq');
    fireEvent.click(screen.getByRole('button', { name: '网易云音乐' }));
    fireEvent.click(screen.getByRole('button', { name: '刷新发现音乐' }));
    expect(onProviderChange).toHaveBeenCalledWith('netease');
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(
      <DiscoveryHomeHeader
        providerId="netease"
        isRefreshing
        onProviderChange={onProviderChange}
        onRefresh={onRefresh}
      />
    );
    expect(container.querySelector('.provider-segmented-control')).toHaveAttribute('data-provider', 'netease');
    expect(screen.getByRole('button', { name: '正在刷新发现音乐' })).toBeDisabled();
  });
});

function createSong(index: number): Song {
  return {
    id: `netease:song:${index}`,
    providerId: 'netease',
    platformSongId: String(index),
    title: `Song ${index}`,
    artist: `Artist ${index}`,
    album: `Album ${index}`,
    durationMs: 180_000 + index * 1_000,
    coverTone: 'linear-gradient(135deg, #607d8b, #9c6f86)',
    coverUrl: `https://example.test/song-${index}.jpg`
  };
}

function createAlbum(
  providerId: 'qq' | 'netease',
  platformAlbumId: string,
  title: string
): AlbumSummary {
  return {
    id: `${providerId}:album:${platformAlbumId}`,
    providerId,
    platformAlbumId,
    title,
    artistName: '常听歌手',
    coverTone: 'linear-gradient(135deg, #417a6b, #cc9d37)',
    releaseDate: '2026-07-18'
  };
}

function createRecommendationFeed(
  overrides: Partial<RecommendationHomeFeed> = {}
): RecommendationHomeFeed {
  const loggedIn = overrides.loggedIn ?? false;
  const dailySongs = overrides.dailySongs ?? [];

  return {
    providerId: 'netease',
    loggedIn,
    dailySongs,
    newSongs: [],
    ...overrides,
    moduleResults: overrides.moduleResults ?? {
      daily: {
        status: loggedIn || dailySongs.length > 0 ? 'fulfilled' : 'skipped',
        errorMessage: null
      },
      new: { status: 'fulfilled', errorMessage: null }
    }
  };
}
