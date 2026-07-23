import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlbumSummary, ArtistDetail, HomepageBlockFeed, RecommendationHomeFeed, RemoteProviderId, Song } from '../../shared/musicTypes';
import { installMusicPlayerApiMock } from '../test/fixtures/musicPlayerApi';
import { useDiscoveryHomeStore } from '../state/discoveryHomeStore';
import { useContinueExplorationStore } from '../state/continueExplorationStore';
import { useArtistCatalogStore } from '../state/artistCatalogStore';
import { useAppNotificationStore } from '../state/appNotificationStore';
import { useFrequentArtistAlbumsStore } from '../state/frequentArtistAlbumsStore';
import { useListeningHistoryStore } from '../state/listeningHistoryStore';
import { usePlayerStore } from '../state/playerStore';
import { useProviderSessionStore } from '../state/providerSessionStore';
import { useReleaseCatalogStore } from '../state/releaseCatalogStore';
import { useRecommendationHistoryStore } from '../state/recommendationHistoryStore';
import { HomeView } from './HomeView';

const dailySongs = Array.from({ length: 12 }, (_, index) => (
  createSong(String(index + 1), `每日歌曲 ${index + 1}`)
));
const newSongs = Array.from({ length: 6 }, (_, index) => (
  createSong(String(index + 101), `最新歌曲 ${index + 1}`)
));
const qqNewSongs = Array.from({ length: 12 }, (_, index) => (
  createSong(String(index + 201), `QQ 新歌 ${index + 1}`, 'qq')
));
const qqReleaseAlbum = createAlbum('qq', 'qq-release-1', 'QQ 新碟');
const neteaseReleaseAlbum = createAlbum('netease', 'netease-release-1', '网易新碟');

describe('HomeView', () => {
  beforeEach(() => {
    window.localStorage.clear();
    installMusicPlayerApiMock();
    useDiscoveryHomeStore.getState().resetForTest();
    useAppNotificationStore.getState().resetForTest();
    useContinueExplorationStore.getState().resetForTest();
    useFrequentArtistAlbumsStore.getState().resetForTest();
    useArtistCatalogStore.getState().resetForTest();
    useListeningHistoryStore.getState().resetForTest();
    usePlayerStore.getState().resetForTest();
    useProviderSessionStore.getState().resetForTest();
    useReleaseCatalogStore.getState().resetForTest();
    useRecommendationHistoryStore.getState().resetForTest();
    vi.restoreAllMocks();
  });

  it('loads only the QQ song recommendation feed for the QQ discovery home', async () => {
    const requests = createDiscoveryRequestMocks();
    requests.getRecommendationHome.mockResolvedValue({
      ok: true,
      data: createRecommendationFeed({ providerId: 'qq', newSongs: qqNewSongs })
    });
    requests.getNewAlbums.mockResolvedValue({ ok: true, data: [qqReleaseAlbum] });
    installMusicPlayerApiMock(requests);
    const playbackBeforeLoad = snapshotPlaybackState();

    render(<HomeView />);

    expect(await screen.findByLabelText('QQ 音乐发现内容')).toBeInTheDocument();
    expect(await screen.findByRole('button', {
      name: `播放歌曲：${qqNewSongs[0].title} - ${qqNewSongs[0].artist}`
    })).toBeInTheDocument();

    expect(requests.getRecommendationHome).toHaveBeenCalledTimes(1);
    expect(requests.getRecommendationHome).toHaveBeenCalledWith('qq');
    expect(await screen.findByRole('button', { name: `打开专辑：${qqReleaseAlbum.title}` }))
      .toBeInTheDocument();
    expect(requests.getNewAlbums).toHaveBeenCalledTimes(1);
    expect(requests.getNewAlbums).toHaveBeenCalledWith('qq');
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);
    expect(requests.getCharts).not.toHaveBeenCalled();
    expect(requests.getChartTracks).not.toHaveBeenCalled();
    expect(requests.getDiscoveredPlaylists).not.toHaveBeenCalled();
    expect(requests.getPlaylistCategories).not.toHaveBeenCalled();
    expect(requests.getRecommendationHistoryDates).not.toHaveBeenCalled();
    expect(requests.getRecommendationHistory).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '刷新发现音乐' })).toBeEnabled();
    expect(screen.queryByText(/排行榜|榜单精选|热门歌单|推荐歌单|歌单补给站/)).not.toBeInTheDocument();

    const qqSongButton = screen.getByRole('button', {
      name: `播放歌曲：${qqNewSongs[1].title} - ${qqNewSongs[1].artist}`
    });
    fireEvent.click(qqSongButton);
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);
    fireEvent.doubleClick(qqSongButton);
    expect(usePlayerStore.getState().currentSong?.sourceContext).toEqual({
      type: 'recommendation',
      providerId: 'qq',
      playlistTitle: '新歌推荐'
    });
  });

  it('moves the logged-out Netease daily recommendation guidance into the global notification', async () => {
    const requests = createDiscoveryRequestMocks();
    requests.getRecommendationHome.mockResolvedValue({
      ok: true,
      data: createRecommendationFeed({ providerId: 'netease', loggedIn: false })
    });
    requests.getNewAlbums.mockResolvedValue({ ok: true, data: [] });
    installMusicPlayerApiMock(requests);
    useDiscoveryHomeStore.getState().setLastProviderId('netease');
    const onLoginRequested = vi.fn();

    render(<HomeView onLoginRequested={onLoginRequested} />);

    await waitFor(() => {
      expect(useAppNotificationStore.getState().notification).toMatchObject({
        key: 'discovery:netease:login',
        message: '登录网易云音乐后获取每日推荐歌曲',
        tone: 'warning',
        action: { label: '登录' }
      });
    });
    expect(screen.queryByText('登录网易云音乐后获取每日推荐歌曲')).not.toBeInTheDocument();

    act(() => {
      useAppNotificationStore.getState().notification?.action?.onClick();
    });
    expect(onLoginRequested).toHaveBeenCalledOnce();
  });

  it('loads the independent Netease recommendation and homepage block feeds', async () => {
    useDiscoveryHomeStore.getState().setLastProviderId('netease');
    const requests = createDiscoveryRequestMocks();
    requests.getRecommendationHome.mockResolvedValue({
      ok: true,
      data: createRecommendationFeed({ loggedIn: true, dailySongs, newSongs })
    });
    requests.getNewAlbums.mockResolvedValue({ ok: true, data: [neteaseReleaseAlbum] });
    installMusicPlayerApiMock(requests);

    render(<HomeView />);

    expect(await screen.findByRole('button', {
      name: `播放歌曲：${dailySongs[0].title} - ${dailySongs[0].artist}`
    })).toBeInTheDocument();
    expect(screen.getByRole('button', {
      name: `播放歌曲：${newSongs[0].title} - ${newSongs[0].artist}`
    })).toBeInTheDocument();
    expect(requests.getRecommendationHome).toHaveBeenCalledTimes(1);
    expect(requests.getRecommendationHome).toHaveBeenCalledWith('netease');
    await waitFor(() => expect(requests.getHomepageBlocks).toHaveBeenCalledTimes(1));
    expect(requests.getHomepageBlocks).toHaveBeenCalledWith('netease');
    expect(await screen.findByRole('button', { name: `打开专辑：${neteaseReleaseAlbum.title}` }))
      .toBeInTheDocument();
    expect(requests.getNewAlbums).toHaveBeenCalledTimes(1);
    expect(requests.getNewAlbums).toHaveBeenCalledWith('netease');
    expect(requests.getCharts).not.toHaveBeenCalled();
    expect(requests.getChartTracks).not.toHaveBeenCalled();
    expect(requests.getDiscoveredPlaylists).not.toHaveBeenCalled();
    expect(requests.getPlaylistCategories).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '刷新发现音乐' })).toBeEnabled();
  });

  it('deduplicates both Netease home capabilities in StrictMode', async () => {
    useDiscoveryHomeStore.getState().setLastProviderId('netease');
    let resolveRecommendation: ((value: { ok: true; data: RecommendationHomeFeed }) => void) | undefined;
    const recommendationResponse = new Promise<{ ok: true; data: RecommendationHomeFeed }>((resolve) => {
      resolveRecommendation = resolve;
    });
    const requests = createDiscoveryRequestMocks();
    requests.getRecommendationHome.mockImplementation(async () => recommendationResponse);
    installMusicPlayerApiMock(requests);

    render(
      <StrictMode>
        <HomeView />
      </StrictMode>
    );

    await waitFor(() => expect(requests.getRecommendationHome).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(requests.getHomepageBlocks).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(requests.getNewAlbums).toHaveBeenCalledTimes(1));
    resolveRecommendation?.({
      ok: true,
      data: createRecommendationFeed({ dailySongs, newSongs })
    });
    expect(await screen.findByLabelText('网易云音乐发现内容')).toBeInTheDocument();
    expect(requests.getRecommendationHome).toHaveBeenCalledTimes(1);
    expect(requests.getHomepageBlocks).toHaveBeenCalledTimes(1);
    expect(requests.getNewAlbums).toHaveBeenCalledTimes(1);
    expect(requests.getCharts).not.toHaveBeenCalled();
    expect(requests.getChartTracks).not.toHaveBeenCalled();
    expect(requests.getDiscoveredPlaylists).not.toHaveBeenCalled();
    expect(requests.getPlaylistCategories).not.toHaveBeenCalled();
  });

  it('plays an entire recommendation module with shuffle start and recommendation context', async () => {
    useDiscoveryHomeStore.getState().setLastProviderId('netease');
    const onPlaybackStarted = vi.fn();
    const requests = createDiscoveryRequestMocks();
    requests.getRecommendationHome.mockResolvedValue({
      ok: true,
      data: createRecommendationFeed({ loggedIn: true, dailySongs, newSongs })
    });
    installMusicPlayerApiMock(requests);
    usePlayerStore.getState().setPlaybackMode('shuffle');
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    render(<HomeView onPlaybackStarted={onPlaybackStarted} />);
    fireEvent.click(await screen.findByRole('button', { name: '播放每日推荐' }));

    expect(usePlayerStore.getState().queue).toHaveLength(dailySongs.length);
    expect(usePlayerStore.getState().currentSong?.id).toBe(dailySongs.at(-1)?.id);
    expect(usePlayerStore.getState().currentSong?.sourceContext).toEqual({
      type: 'recommendation',
      providerId: 'netease',
      playlistTitle: '每日推荐'
    });
    expect(onPlaybackStarted).toHaveBeenCalledWith('已开始播放每日推荐');
  });

  it('loads homepage block songs without mutating playback and writes the queue only after an explicit action', async () => {
    useDiscoveryHomeStore.getState().setLastProviderId('netease');
    const homepageSong = createSong('homepage-song', '首页专题歌曲');
    const homepageFeed = createHomepageBlockFeed(homepageSong);
    const onPlaybackStarted = vi.fn();
    const requests = createDiscoveryRequestMocks();
    requests.getHomepageBlocks.mockResolvedValue({ ok: true, data: homepageFeed });
    installMusicPlayerApiMock(requests);
    const playbackBeforeLoad = snapshotPlaybackState();

    render(<HomeView onPlaybackStarted={onPlaybackStarted} />);

    const homepageSongButtonName = `播放歌曲：${homepageSong.title} - ${homepageSong.artist}`;
    const homepageSongButton = await screen.findByRole('button', { name: homepageSongButtonName });
    const homepageSection = screen.getByRole('heading', { name: '多元旋律之旅' }).closest('section');
    expect(homepageSection).not.toBeNull();
    expect(within(homepageSection!).getByRole('button', { name: homepageSongButtonName }))
      .toBe(homepageSongButton);
    expect(requests.getHomepageBlocks).toHaveBeenCalledWith('netease');
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);

    fireEvent.click(homepageSongButton);
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);
    fireEvent.doubleClick(homepageSongButton);
    expect(usePlayerStore.getState().queue.map((item) => item.songId)).toEqual([homepageSong.id]);
    expect(usePlayerStore.getState().currentSong?.id).toBe(homepageSong.id);
    expect(usePlayerStore.getState().currentSong?.sourceContext).toEqual({
      type: 'recommendation',
      providerId: 'netease',
      playlistTitle: '多元旋律之旅'
    });
    expect(onPlaybackStarted).toHaveBeenCalledWith('已开始播放多元旋律之旅');
  });

  it('loads, deduplicates, switches, and plays Netease recommendation history without passive queue changes', async () => {
    setLoggedInDefaultProvider('netease');
    useDiscoveryHomeStore.getState().setLastProviderId('netease');
    const duplicateDailySong = createSong('history-duplicate', '与每日推荐重复');
    const firstHistorySong = createSong('history-first', '历史日推歌曲一');
    const secondHistorySong = createSong('history-second', '历史日推歌曲二');
    const historyDates = ['2026-07-17', '2026-07-16'];
    const requests = createDiscoveryRequestMocks();
    requests.getRecommendationHome.mockResolvedValue({
      ok: true,
      data: createRecommendationFeed({
        loggedIn: true,
        dailySongs: [duplicateDailySong],
        newSongs
      })
    });
    requests.getRecommendationHistoryDates.mockResolvedValue({ ok: true, data: historyDates });
    requests.getRecommendationHistory
      .mockResolvedValueOnce({
        ok: true,
        data: {
          providerId: 'netease',
          date: historyDates[0],
          songs: [duplicateDailySong, firstHistorySong]
        }
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          providerId: 'netease',
          date: historyDates[1],
          songs: [secondHistorySong]
        }
      });
    installMusicPlayerApiMock(requests);
    const playbackBeforeLoad = snapshotPlaybackState();

    render(<HomeView />);

    const historyHeading = await screen.findByRole('heading', { name: '历史日推' });
    const historySection = historyHeading.closest('section');
    expect(historySection).not.toBeNull();
    expect(within(historySection!).getByText('网易云音乐 · 历史每日推荐')).toBeInTheDocument();
    expect(within(historySection!).queryByText(duplicateDailySong.title)).not.toBeInTheDocument();
    expect(within(historySection!).getByRole('button', {
      name: `播放歌曲：${firstHistorySong.title} - ${firstHistorySong.artist}`
    })).toBeInTheDocument();
    expect(requests.getRecommendationHistoryDates).toHaveBeenCalledWith('netease', undefined);
    expect(requests.getRecommendationHistory).toHaveBeenCalledWith('netease', historyDates[0], undefined);
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);

    fireEvent.keyDown(within(historySection!).getByRole('combobox', { name: '历史日推日期' }), {
      key: 'ArrowDown'
    });
    const secondDateOption = screen.getByRole('option', { name: '2026年7月16日' });
    expect(secondDateOption).toHaveFocus();
    fireEvent.keyDown(secondDateOption, { key: 'Enter' });
    const secondSongButton = await within(historySection!).findByRole('button', {
      name: `播放歌曲：${secondHistorySong.title} - ${secondHistorySong.artist}`
    });
    expect(requests.getRecommendationHistory).toHaveBeenLastCalledWith('netease', historyDates[1], undefined);
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);

    fireEvent.click(secondSongButton);
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);
    fireEvent.doubleClick(secondSongButton);
    expect(usePlayerStore.getState().currentSong).toMatchObject({
      id: secondHistorySong.id,
      sourceContext: {
        type: 'recommendation',
        providerId: 'netease',
        playlistTitle: '历史日推'
      }
    });
  });

  it('refreshes the current Netease history date with the top refresh only', async () => {
    setLoggedInDefaultProvider('netease');
    useDiscoveryHomeStore.getState().setLastProviderId('netease');
    const historyDate = '2026-07-17';
    const historySong = createSong('history-refresh', '待刷新历史日推');
    const requests = createDiscoveryRequestMocks();
    requests.getRecommendationHistoryDates.mockResolvedValue({ ok: true, data: [historyDate] });
    requests.getRecommendationHistory.mockResolvedValue({
      ok: true,
      data: { providerId: 'netease', date: historyDate, songs: [historySong] }
    });
    installMusicPlayerApiMock(requests);

    render(<HomeView />);
    expect(await screen.findByRole('heading', { name: '历史日推' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '刷新发现音乐' }));

    await waitFor(() => expect(requests.getRecommendationHistoryDates).toHaveBeenLastCalledWith(
      'netease',
      { forceRefresh: true }
    ));
    expect(requests.getRecommendationHistory).toHaveBeenLastCalledWith(
      'netease',
      historyDate,
      { forceRefresh: true }
    );
    expect(requests.getRecommendationHistoryDates).toHaveBeenCalledTimes(2);
    expect(requests.getRecommendationHistory).toHaveBeenCalledTimes(2);
    expect(requests.getCharts).not.toHaveBeenCalled();
    expect(requests.getChartTracks).not.toHaveBeenCalled();
    expect(requests.getDiscoveredPlaylists).not.toHaveBeenCalled();
  });

  it('opens a new album through the existing album-detail navigation callback', async () => {
    const onSelectAlbum = vi.fn();
    const requests = createDiscoveryRequestMocks();
    requests.getNewAlbums.mockResolvedValue({ ok: true, data: [qqReleaseAlbum] });
    installMusicPlayerApiMock(requests);
    const playbackBeforeLoad = snapshotPlaybackState();

    render(<HomeView onSelectAlbum={onSelectAlbum} />);
    fireEvent.click(await screen.findByRole('button', {
      name: `打开专辑：${qqReleaseAlbum.title}`
    }));

    expect(onSelectAlbum).toHaveBeenCalledWith(qqReleaseAlbum);
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);
    expect(requests.getCharts).not.toHaveBeenCalled();
    expect(requests.getChartTracks).not.toHaveBeenCalled();
    expect(requests.getDiscoveredPlaylists).not.toHaveBeenCalled();
  });

  it('loads and opens a local frequent-artist album without mutating playback', async () => {
    const seedArtist = {
      id: 'qq:artist:frequent-seed',
      providerId: 'qq' as const,
      platformArtistId: 'frequent-seed',
      name: '常听歌手'
    };
    const historySong = {
      ...createSong('frequent-history', '历史歌曲', 'qq'),
      artists: [seedArtist]
    };
    const frequentAlbum = createAlbum('qq', 'frequent-album', '常听歌手新专');
    const artistDetail: ArtistDetail = {
      ...seedArtist,
      aliases: [],
      description: '',
      coverTone: historySong.coverTone,
      topSongs: [],
      albums: [frequentAlbum]
    };
    let resolveArtist: ((value: { ok: true; data: ArtistDetail }) => void) | undefined;
    const artistResponse = new Promise<{ ok: true; data: ArtistDetail }>((resolve) => {
      resolveArtist = resolve;
    });
    const requests = createDiscoveryRequestMocks();
    requests.getNewAlbums.mockResolvedValue({ ok: true, data: [qqReleaseAlbum] });
    installMusicPlayerApiMock({
      ...requests,
      getArtistDetail: vi.fn(async () => artistResponse)
    });
    useListeningHistoryStore.getState().recordQualifiedListen(historySong);
    const onSelectAlbum = vi.fn();
    const playbackBeforeLoad = snapshotPlaybackState();

    render(<HomeView onSelectAlbum={onSelectAlbum} />);

    expect(await screen.findByRole('heading', { name: '常听歌手专辑' })).toBeInTheDocument();
    expect(screen.getByText('欧包音乐 · 基于本地收听记录生成')).toBeInTheDocument();
    expect(screen.getByText('正在整理常听歌手专辑')).toBeInTheDocument();
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);

    await act(async () => {
      resolveArtist?.({ ok: true, data: artistDetail });
      await artistResponse;
    });
    fireEvent.click(await screen.findByRole('button', {
      name: `打开专辑：${frequentAlbum.title}`
    }));

    expect(onSelectAlbum).toHaveBeenCalledWith(frequentAlbum);
    expect(snapshotPlaybackState()).toEqual(playbackBeforeLoad);
    expect(requests.getCharts).not.toHaveBeenCalled();
    expect(requests.getChartTracks).not.toHaveBeenCalled();
    expect(requests.getDiscoveredPlaylists).not.toHaveBeenCalled();
  });

  it('loads continue exploration from qualified local history without mutating playback', async () => {
    const seedArtist = {
      id: 'qq:artist:history-seed',
      providerId: 'qq' as const,
      platformArtistId: 'history-seed',
      name: '历史歌手'
    };
    const seedSong = { ...createSong('history-seed', '历史歌曲', 'qq'), artists: [seedArtist] };
    const candidate = { ...createSong('history-candidate', '探索歌曲', 'qq'), artists: [seedArtist] };
    const artistDetail: ArtistDetail = {
      ...seedArtist,
      aliases: [],
      description: '',
      coverTone: seedSong.coverTone,
      topSongs: [candidate],
      albums: []
    };
    const requests = createDiscoveryRequestMocks();
    requests.getRecommendationHome.mockResolvedValue({
      ok: true,
      data: createRecommendationFeed({ providerId: 'qq', newSongs: qqNewSongs })
    });
    installMusicPlayerApiMock({
      ...requests,
      getArtistDetail: vi.fn(async () => ({ ok: true as const, data: artistDetail }))
    });
    useListeningHistoryStore.getState().recordQualifiedListen(seedSong);
    const initialPlayback = snapshotPlaybackState();

    render(<HomeView />);

    expect(await screen.findByRole('heading', { name: '继续探索' })).toBeInTheDocument();
    expect(snapshotPlaybackState()).toEqual(initialPlayback);
    const candidateSongButton = screen.getByRole('button', {
      name: `播放歌曲：${candidate.title} - ${candidate.artist}`
    });
    fireEvent.click(candidateSongButton);
    expect(snapshotPlaybackState()).toEqual(initialPlayback);
    fireEvent.doubleClick(candidateSongButton);
    expect(usePlayerStore.getState().currentSong).toMatchObject({
      id: candidate.id,
      sourceContext: {
        type: 'recommendation',
        providerId: 'qq',
        playlistTitle: '继续探索'
      }
    });
  });

  it('starts a double-clicked song at its module index and labels the full queue as recommendations', async () => {
    useDiscoveryHomeStore.getState().setLastProviderId('netease');
    const onPlaybackStarted = vi.fn();
    const requests = createDiscoveryRequestMocks();
    requests.getRecommendationHome.mockResolvedValue({
      ok: true,
      data: createRecommendationFeed({ loggedIn: true, dailySongs, newSongs })
    });
    installMusicPlayerApiMock(requests);
    usePlayerStore.getState().setPlaybackMode('shuffle');
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    render(<HomeView onPlaybackStarted={onPlaybackStarted} />);
    const latestSection = (await screen.findByRole('heading', { name: '最新音乐' })).closest('section');
    expect(latestSection).not.toBeNull();
    const latestSongButton = within(latestSection!).getByRole('button', {
      name: `播放歌曲：${newSongs[1].title} - ${newSongs[1].artist}`
    });
    const playbackBeforeSongAction = snapshotPlaybackState();
    fireEvent.click(latestSongButton);
    expect(snapshotPlaybackState()).toEqual(playbackBeforeSongAction);
    fireEvent.doubleClick(latestSongButton);

    expect(usePlayerStore.getState().queue).toHaveLength(newSongs.length);
    expect(usePlayerStore.getState().currentSong?.id).toBe(newSongs[1].id);
    expect(usePlayerStore.getState().queue.every((item) => (
      item.sourceContext?.type === 'recommendation'
      && item.sourceContext.playlistTitle === '最新音乐'
    ))).toBe(true);
    expect(usePlayerStore.getState().currentSong?.sourceContext).toEqual({
      type: 'recommendation',
      providerId: 'netease',
      playlistTitle: '最新音乐'
    });
    expect(onPlaybackStarted).toHaveBeenCalledWith('已开始播放最新音乐');
  });

  it('refreshes only the Netease recommendation feed while keeping stale songs usable', async () => {
    setLoggedInDefaultProvider('qq');
    useDiscoveryHomeStore.getState().setLastProviderId('netease');
    const initialSong = createSong('refresh-before', '刷新前歌曲');
    const refreshedSong = createSong('refresh-after', '刷新后歌曲');
    let resolveRefresh: ((value: { ok: true; data: RecommendationHomeFeed }) => void) | undefined;
    const refreshResponse = new Promise<{ ok: true; data: RecommendationHomeFeed }>((resolve) => {
      resolveRefresh = resolve;
    });
    const requests = createDiscoveryRequestMocks();
    requests.getRecommendationHome
      .mockResolvedValueOnce({
        ok: true,
        data: createRecommendationFeed({ loggedIn: true, dailySongs: [initialSong] })
      })
      .mockImplementationOnce(async () => refreshResponse);
    installMusicPlayerApiMock(requests);

    render(<HomeView />);
    const initialSongButtonName = `播放歌曲：${initialSong.title} - ${initialSong.artist}`;
    const refreshedSongButtonName = `播放歌曲：${refreshedSong.title} - ${refreshedSong.artist}`;
    expect(await screen.findByRole('button', { name: initialSongButtonName })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '刷新发现音乐' }));

    expect(screen.getByRole('button', { name: initialSongButtonName })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '正在刷新发现音乐' })).toBeDisabled();
    expect(requests.getRecommendationHome).toHaveBeenLastCalledWith(
      'netease',
      { forceRefresh: true }
    );
    expect(requests.getHomepageBlocks).toHaveBeenLastCalledWith('netease', { forceRefresh: true });
    expect(requests.getNewAlbums).toHaveBeenLastCalledWith('netease', { forceRefresh: true });
    expect(requests.getCharts).not.toHaveBeenCalled();
    expect(requests.getChartTracks).not.toHaveBeenCalled();
    expect(requests.getDiscoveredPlaylists).not.toHaveBeenCalled();
    expect(requests.getPlaylistCategories).not.toHaveBeenCalled();
    expect(useProviderSessionStore.getState().defaultProviderId).toBe('qq');

    await act(async () => {
      resolveRefresh?.({
        ok: true,
        data: createRecommendationFeed({ loggedIn: true, dailySongs: [refreshedSong] })
      });
      await refreshResponse;
    });
    expect(await screen.findByRole('button', { name: refreshedSongButtonName })).toBeInTheDocument();
  });

  it('retries a failed Netease daily module without changing new songs or playback state', async () => {
    useDiscoveryHomeStore.getState().setLastProviderId('netease');
    const dailyBefore = createSong('daily-before', '重试前每日推荐');
    const dailyAfter = createSong('daily-after', '重试后每日推荐');
    const newBefore = createSong('new-before', '保持不变的最新音乐');
    const ignoredNew = createSong('new-ignored', '不应被每日重试覆盖');
    const queueSong = createSong('queue-seed', '队列基线歌曲');
    usePlayerStore.getState().playSongsFromList(
      [queueSong],
      0,
      () => ({ type: 'recommendation', providerId: 'netease', playlistTitle: '队列基线' })
    );
    await waitFor(() => expect(usePlayerStore.getState().currentPlaybackUrl).not.toBeNull());
    const playbackBefore = snapshotPlaybackState();
    const requests = createDiscoveryRequestMocks();
    requests.getRecommendationHome
      .mockResolvedValueOnce({
        ok: true,
        data: createRecommendationFeed({
          loggedIn: true,
          dailySongs: [dailyBefore],
          newSongs: [newBefore]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        data: createRecommendationFeed({
          loggedIn: true,
          dailySongs: [],
          newSongs: [ignoredNew],
          moduleResults: {
            daily: { status: 'rejected', errorMessage: '网易云每日推荐加载失败' },
            new: { status: 'fulfilled', errorMessage: null }
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        data: createRecommendationFeed({
          loggedIn: true,
          dailySongs: [dailyAfter],
          newSongs: [ignoredNew]
        })
      });
    installMusicPlayerApiMock(requests);

    render(<HomeView />);
    const dailyBeforeButton = `播放歌曲：${dailyBefore.title} - ${dailyBefore.artist}`;
    const dailyAfterButton = `播放歌曲：${dailyAfter.title} - ${dailyAfter.artist}`;
    const newBeforeButton = `播放歌曲：${newBefore.title} - ${newBefore.artist}`;
    const ignoredNewButton = `播放歌曲：${ignoredNew.title} - ${ignoredNew.artist}`;
    expect(await screen.findByRole('button', { name: dailyBeforeButton })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: newBeforeButton })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '刷新每日推荐' }));
    await waitFor(() => expect(useAppNotificationStore.getState().notification).toMatchObject({
      message: '网易云每日推荐加载失败',
      tone: 'error'
    }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: dailyBeforeButton })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: newBeforeButton })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ignoredNewButton })).not.toBeInTheDocument();
    expect(snapshotPlaybackState()).toEqual(playbackBefore);
    expect(requests.getCharts).not.toHaveBeenCalled();
    expect(requests.getChartTracks).not.toHaveBeenCalled();
    expect(requests.getDiscoveredPlaylists).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '重试每日推荐' }));
    expect(await screen.findByRole('button', { name: dailyAfterButton })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: newBeforeButton })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ignoredNewButton })).not.toBeInTheDocument();
    expect(snapshotPlaybackState()).toEqual(playbackBefore);
    expect(requests.getRecommendationHome).toHaveBeenCalledTimes(3);
    expect(requests.getRecommendationHome).toHaveBeenNthCalledWith(
      2,
      'netease',
      { forceRefresh: true }
    );
    expect(requests.getRecommendationHome).toHaveBeenNthCalledWith(
      3,
      'netease',
      { forceRefresh: true }
    );
  });

  it('keeps source changes independent and loads only the selected provider feed', async () => {
    setLoggedInDefaultProvider('qq');
    const requests = createDiscoveryRequestMocks();
    requests.getRecommendationHome.mockImplementation(async (providerId) => ({
      ok: true,
      data: providerId === 'qq'
        ? createRecommendationFeed({ providerId: 'qq', newSongs: qqNewSongs })
        : createRecommendationFeed({ newSongs })
    }));
    requests.getNewAlbums.mockImplementation(async (providerId) => ({
      ok: true as const,
      data: [providerId === 'qq' ? qqReleaseAlbum : neteaseReleaseAlbum]
    }));
    installMusicPlayerApiMock(requests);

    render(<HomeView />);
    expect(await screen.findByLabelText('QQ 音乐发现内容')).toBeInTheDocument();
    expect(await screen.findByRole('button', {
      name: `播放歌曲：${qqNewSongs[0].title} - ${qqNewSongs[0].artist}`
    })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新发现音乐' })).toBeEnabled();
    expect(requests.getRecommendationHome).toHaveBeenCalledWith('qq');
    expect(requests.getNewAlbums).toHaveBeenCalledWith('qq');
    expect(requests.getNewAlbums).not.toHaveBeenCalledWith('netease');

    fireEvent.click(screen.getByRole('button', { name: '网易云音乐' }));
    expect(await screen.findByLabelText('网易云音乐发现内容')).toBeInTheDocument();
    expect(requests.getRecommendationHome).toHaveBeenCalledWith('netease');
    expect(requests.getNewAlbums).toHaveBeenCalledWith('netease');
    expect(screen.getByRole('button', { name: '刷新发现音乐' })).toBeEnabled();
    expect(useDiscoveryHomeStore.getState().lastProviderId).toBe('netease');
    expect(useProviderSessionStore.getState().defaultProviderId).toBe('qq');
    expect(window.localStorage.getItem('musicplayer.discovery-home-provider')).toBe('netease');
  });

  it('uses the shared section transition when the discovery provider changes', async () => {
    const requests = createDiscoveryRequestMocks();
    requests.getRecommendationHome.mockImplementation(async (providerId) => ({
      ok: true,
      data: createRecommendationFeed({ providerId })
    }));
    installMusicPlayerApiMock(requests);

    const { container } = render(
      <HomeView
        transitionStyle="layered"
        navigationDirection="backward"
        reduceEffects
      />
    );

    expect(await screen.findByLabelText('QQ 音乐发现内容')).toBeInTheDocument();
    const transitionStage = container.querySelector('.main-content-transition-stage-section');
    const initialActiveLayer = container.querySelector('.main-content-transition-layer-active');
    expect(transitionStage).toHaveAttribute('data-transition-key', 'discovery-home:qq');
    expect(transitionStage).toHaveAttribute('data-motion-key', 'discovery-home:qq');
    expect(transitionStage).toHaveAttribute('data-transition-style', 'layered');
    expect(transitionStage).toHaveAttribute('data-transition-direction', 'backward');
    expect(transitionStage).toHaveAttribute('data-reduce-effects', 'true');

    fireEvent.click(screen.getByRole('button', { name: '网易云音乐' }));

    expect(await screen.findByLabelText('网易云音乐发现内容')).toBeInTheDocument();
    expect(transitionStage).toHaveAttribute('data-transition-key', 'discovery-home:netease');
    expect(transitionStage).toHaveAttribute('data-motion-key', 'discovery-home:netease');
    expect(container.querySelectorAll('.main-content-transition-layer')).toHaveLength(1);
    expect(container.querySelector('.main-content-transition-layer-active')).toBe(initialActiveLayer);
  });
});

function createDiscoveryRequestMocks() {
  return {
    getRecommendationHome: vi.fn(async (_providerId: RemoteProviderId) => ({
      ok: true as const,
      data: createRecommendationFeed()
    })),
    getHomepageBlocks: vi.fn(async (): Promise<{ ok: true; data: HomepageBlockFeed }> => ({
      ok: true as const,
      data: { providerId: 'netease' as const, blocks: [] }
    })),
    getNewAlbums: vi.fn(async (_providerId: RemoteProviderId) => ({
      ok: true as const,
      data: [] as AlbumSummary[]
    })),
    getRecommendationHistoryDates: vi.fn(async (_providerId: RemoteProviderId) => ({
      ok: true as const,
      data: [] as string[]
    })),
    getRecommendationHistory: vi.fn(async (_providerId: RemoteProviderId, date: string) => ({
      ok: true as const,
      data: {
        providerId: 'netease' as const,
        date,
        songs: [] as Song[]
      }
    })),
    getCharts: vi.fn(async () => ({ ok: true as const, data: [] })),
    getChartTracks: vi.fn(async () => ({ ok: true as const, data: [] })),
    getPlaylistCategories: vi.fn(async () => ({ ok: true as const, data: [] })),
    getDiscoveredPlaylists: vi.fn(async (providerId: RemoteProviderId) => ({
      ok: true as const,
      data: {
        providerId,
        categoryId: 'all',
        playlists: [],
        offset: 0,
        limit: 30,
        total: 0,
        hasMore: false
      }
    }))
  };
}

function createHomepageBlockFeed(song: Song): HomepageBlockFeed {
  return {
    providerId: 'netease',
    blocks: [{
      kind: 'song',
      id: 'netease:homepage-block:test',
      title: '多元旋律之旅',
      songs: [song]
    }]
  };
}

function snapshotPlaybackState() {
  const state = usePlayerStore.getState();
  return {
    currentPlaybackUrl: state.currentPlaybackUrl,
    currentQueueItemId: state.currentQueueItemId,
    currentSong: state.currentSong,
    isPlaying: state.isPlaying,
    playbackPositionMs: state.playbackPositionMs,
    queue: state.queue,
    queueSongs: state.queueSongs
  };
}

function setLoggedInDefaultProvider(providerId: RemoteProviderId): void {
  useProviderSessionStore.setState({
    statuses: {
      qq: {
        providerId: 'qq',
        loggedIn: providerId === 'qq',
        playbackReady: false
      },
      netease: {
        providerId: 'netease',
        loggedIn: providerId === 'netease',
        playbackReady: providerId === 'netease'
      }
    },
    defaultProviderId: providerId,
    activeProviderId: providerId,
    isHydrating: false
  });
}

function createSong(
  platformSongId: string,
  title: string,
  providerId: RemoteProviderId = 'netease'
): Song {
  return {
    id: `${providerId}:${platformSongId}`,
    providerId,
    platformSongId,
    title,
    artist: '测试歌手',
    album: '测试专辑',
    durationMs: 180_000,
    coverTone: 'linear-gradient(135deg, #607d8b, #9c6f86)',
    coverUrl: `https://example.test/song-${providerId}-${platformSongId}.jpg`
  };
}

function createAlbum(
  providerId: RemoteProviderId,
  platformAlbumId: string,
  title: string
): AlbumSummary {
  return {
    id: `${providerId}:album:${platformAlbumId}`,
    providerId,
    platformAlbumId,
    title,
    artistName: '测试歌手',
    coverTone: 'linear-gradient(135deg, #417a6b, #cc9d37)',
    releaseDate: '2026-07-17'
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
