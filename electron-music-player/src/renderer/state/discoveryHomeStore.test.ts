import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomepageBlockFeed, RecommendationHomeFeed } from '../../shared/musicTypes';
import { installMusicPlayerApiMock } from '../test/fixtures/musicPlayerApi';
import { useProviderSessionStore } from './providerSessionStore';
import {
  RECOMMENDATION_HOME_CACHE_TTL_MS,
  HOMEPAGE_BLOCK_CACHE_TTL_MS,
  resolveDiscoveryHomeProviderId,
  useDiscoveryHomeStore
} from './discoveryHomeStore';

const providerStorageKey = 'musicplayer.discovery-home-provider';

describe('discovery home store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    installMusicPlayerApiMock();
    useDiscoveryHomeStore.getState().resetForTest();
    useProviderSessionStore.getState().resetForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves the last valid source before the logged-in default and QQ fallback', () => {
    expect(resolveDiscoveryHomeProviderId('netease', 'qq', true)).toBe('netease');
    expect(resolveDiscoveryHomeProviderId('invalid', 'netease', true)).toBe('netease');
    expect(resolveDiscoveryHomeProviderId(null, 'netease', false)).toBe('qq');
    expect(resolveDiscoveryHomeProviderId(null, 'local', true)).toBe('qq');
    expect(resolveDiscoveryHomeProviderId(null, null, false)).toBe('qq');
  });

  it('persists only the independent home source selection', () => {
    window.localStorage.setItem('musicplayer.defaultProviderId', 'qq');

    useDiscoveryHomeStore.getState().setLastProviderId('netease');

    expect(useDiscoveryHomeStore.getState().lastProviderId).toBe('netease');
    expect(window.localStorage.getItem(providerStorageKey)).toBe('netease');
    expect(window.localStorage.getItem('musicplayer.defaultProviderId')).toBe('qq');

    useDiscoveryHomeStore.getState().setLastProviderId(null);

    expect(useDiscoveryHomeStore.getState().lastProviderId).toBeNull();
    expect(window.localStorage.getItem(providerStorageKey)).toBeNull();
  });

  it('does not change provider session defaults when the home source changes', () => {
    useProviderSessionStore.setState({
      defaultProviderId: 'qq',
      activeProviderId: 'qq'
    });

    useDiscoveryHomeStore.getState().setLastProviderId('netease');

    expect(useProviderSessionStore.getState()).toMatchObject({
      defaultProviderId: 'qq',
      activeProviderId: 'qq'
    });
  });

  it('restores a valid persisted home source without borrowing another provider preference', async () => {
    window.localStorage.setItem(providerStorageKey, 'netease');
    window.localStorage.setItem('musicplayer.playlist-discovery-provider', 'qq');
    const modulePath = `./discoveryHomeStore?restored=${Date.now()}`;

    const restoredModule = await import(modulePath) as typeof import('./discoveryHomeStore');

    expect(restoredModule.useDiscoveryHomeStore.getState().lastProviderId).toBe('netease');
    restoredModule.useDiscoveryHomeStore.getState().resetForTest();
  });

  it('stores a recommendation feed and reuses it inside the renderer TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T10:00:00Z'));
    const feed = createFeed('首次推荐');
    const getRecommendationHome = vi.fn(async () => ({ ok: true as const, data: feed }));
    installMusicPlayerApiMock({ getRecommendationHome });

    const first = await useDiscoveryHomeStore.getState().loadRecommendationHome('netease');
    const cached = await useDiscoveryHomeStore.getState().loadRecommendationHome('netease');

    expect(first).toEqual(feed);
    expect(cached).toEqual(feed);
    expect(getRecommendationHome).toHaveBeenCalledTimes(1);
    expect(useDiscoveryHomeStore.getState().recommendationsByProvider.netease).toMatchObject({
      feed,
      modules: {
        daily: {
          isLoading: false,
          loaded: true,
          loadedAt: Date.now(),
          errorMessage: null
        },
        new: {
          isLoading: false,
          loaded: true,
          loadedAt: Date.now(),
          errorMessage: null
        }
      }
    });
  });

  it('deduplicates concurrent recommendation loads', async () => {
    const feed = createFeed('并发推荐');
    let resolveRequest: ((value: { ok: true; data: RecommendationHomeFeed }) => void) | undefined;
    const response = new Promise<{ ok: true; data: RecommendationHomeFeed }>((resolve) => {
      resolveRequest = resolve;
    });
    const getRecommendationHome = vi.fn(async () => response);
    installMusicPlayerApiMock({ getRecommendationHome });

    const first = useDiscoveryHomeStore.getState().loadRecommendationHome('netease');
    const second = useDiscoveryHomeStore.getState().loadRecommendationHome('netease');
    expect(getRecommendationHome).toHaveBeenCalledTimes(1);

    resolveRequest?.({ ok: true, data: feed });
    await expect(first).resolves.toEqual(feed);
    await expect(second).resolves.toBeNull();
    expect(useDiscoveryHomeStore.getState().recommendationsByProvider.netease.feed).toEqual(feed);
  });

  it('discards recommendation and homepage responses that arrive after a state reset', async () => {
    let resolveRecommendation: ((value: { ok: true; data: RecommendationHomeFeed }) => void) | undefined;
    let resolveHomepage: ((value: { ok: true; data: HomepageBlockFeed }) => void) | undefined;
    const recommendationResponse = new Promise<{ ok: true; data: RecommendationHomeFeed }>((resolve) => {
      resolveRecommendation = resolve;
    });
    const homepageResponse = new Promise<{ ok: true; data: HomepageBlockFeed }>((resolve) => {
      resolveHomepage = resolve;
    });
    installMusicPlayerApiMock({
      getRecommendationHome: vi.fn(async () => recommendationResponse),
      getHomepageBlocks: vi.fn(async () => homepageResponse)
    });

    const recommendationRequest = useDiscoveryHomeStore.getState().loadRecommendationHome('netease');
    const homepageRequest = useDiscoveryHomeStore.getState().loadHomepageBlocks();
    useDiscoveryHomeStore.getState().resetForTest();
    resolveRecommendation?.({ ok: true, data: createFeed('迟到推荐') });
    resolveHomepage?.({ ok: true, data: createHomepageBlockFeed('迟到首页歌曲') });
    await Promise.all([recommendationRequest, homepageRequest]);

    expect(useDiscoveryHomeStore.getState().recommendationsByProvider.netease)
      .toEqual(expect.objectContaining({ feed: null }));
    expect(useDiscoveryHomeStore.getState().homepageBlocks)
      .toEqual(expect.objectContaining({ feed: null, loaded: false }));
  });

  it('lets the renderer TTL expire so the provider cache can refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T10:00:00Z'));
    const firstFeed = createFeed('首次推荐');
    const refreshedFeed = createFeed('到期推荐');
    const getRecommendationHome = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, data: firstFeed })
      .mockResolvedValueOnce({ ok: true as const, data: refreshedFeed });
    installMusicPlayerApiMock({ getRecommendationHome });

    await useDiscoveryHomeStore.getState().loadRecommendationHome('netease');
    vi.setSystemTime(Date.now() + RECOMMENDATION_HOME_CACHE_TTL_MS - 1);
    await useDiscoveryHomeStore.getState().loadRecommendationHome('netease');
    expect(getRecommendationHome).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 2);
    await useDiscoveryHomeStore.getState().loadRecommendationHome('netease');
    expect(getRecommendationHome).toHaveBeenCalledTimes(2);
    expect(useDiscoveryHomeStore.getState().recommendationsByProvider.netease.feed).toEqual(refreshedFeed);
  });

  it('keeps stale recommendation content when force refresh fails', async () => {
    const feed = createFeed('保留推荐');
    const getRecommendationHome = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, data: feed })
      .mockResolvedValueOnce({
        ok: false as const,
        error: {
          code: 'provider_failed' as const,
          providerId: 'netease' as const,
          message: '推荐刷新失败'
        }
      });
    installMusicPlayerApiMock({ getRecommendationHome });

    await useDiscoveryHomeStore.getState().loadRecommendationHome('netease');
    const refreshed = await useDiscoveryHomeStore.getState().loadRecommendationHome(
      'netease',
      { forceRefresh: true }
    );

    expect(refreshed).toEqual(feed);
    expect(getRecommendationHome).toHaveBeenLastCalledWith('netease', { forceRefresh: true });
    expect(useDiscoveryHomeStore.getState().recommendationsByProvider.netease).toMatchObject({
      feed,
      modules: {
        daily: {
          loaded: true,
          isLoading: false,
          errorMessage: '推荐刷新失败'
        },
        new: {
          loaded: true,
          isLoading: false,
          errorMessage: '推荐刷新失败'
        }
      }
    });
  });

  it('keeps stale daily songs while applying a successful new-song module result', async () => {
    const initial = createFeed('初始最新音乐');
    initial.dailySongs = [createSong('初始每日推荐')];
    const partial = createFeed('刷新后最新音乐');
    partial.moduleResults.daily = {
      status: 'rejected',
      errorMessage: '网易云每日推荐加载失败'
    };
    const getRecommendationHome = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, data: initial })
      .mockResolvedValueOnce({ ok: true as const, data: partial });
    installMusicPlayerApiMock({ getRecommendationHome });

    await useDiscoveryHomeStore.getState().loadRecommendationHome('netease');
    await useDiscoveryHomeStore.getState().loadRecommendationHome('netease', { forceRefresh: true });

    const state = useDiscoveryHomeStore.getState().recommendationsByProvider.netease;
    expect(state.feed?.dailySongs).toEqual(initial.dailySongs);
    expect(state.feed?.newSongs).toEqual(partial.newSongs);
    expect(state.modules.daily).toMatchObject({
      isLoading: false,
      loaded: true,
      errorMessage: '网易云每日推荐加载失败'
    });
    expect(state.modules.new).toMatchObject({
      isLoading: false,
      loaded: true,
      errorMessage: null
    });
  });

  it('refreshes and retries only the selected renderer module', async () => {
    const initial = createFeed('初始最新音乐');
    initial.dailySongs = [createSong('初始每日推荐')];
    const refreshedDaily = createFeed('不应替换的最新音乐');
    refreshedDaily.dailySongs = [createSong('刷新后每日推荐')];
    refreshedDaily.moduleResults.new = {
      status: 'rejected',
      errorMessage: '网易云最新音乐加载失败'
    };
    const refreshedNew = createFeed('重试后最新音乐');
    refreshedNew.dailySongs = [];
    refreshedNew.moduleResults.daily = {
      status: 'rejected',
      errorMessage: '网易云每日推荐加载失败'
    };
    const getRecommendationHome = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, data: initial })
      .mockResolvedValueOnce({ ok: true as const, data: refreshedDaily })
      .mockResolvedValueOnce({ ok: true as const, data: refreshedNew });
    installMusicPlayerApiMock({ getRecommendationHome });

    await useDiscoveryHomeStore.getState().loadRecommendationHome('netease');
    await useDiscoveryHomeStore.getState().refreshRecommendationModule('netease', 'daily');

    let state = useDiscoveryHomeStore.getState().recommendationsByProvider.netease;
    expect(state.feed?.dailySongs).toEqual(refreshedDaily.dailySongs);
    expect(state.feed?.newSongs).toEqual(initial.newSongs);
    expect(state.modules.new.errorMessage).toBeNull();

    await useDiscoveryHomeStore.getState().refreshRecommendationModule('netease', 'new');

    state = useDiscoveryHomeStore.getState().recommendationsByProvider.netease;
    expect(state.feed?.dailySongs).toEqual(refreshedDaily.dailySongs);
    expect(state.feed?.newSongs).toEqual(refreshedNew.newSongs);
    expect(state.modules.daily.errorMessage).toBeNull();
    expect(getRecommendationHome).toHaveBeenNthCalledWith(2, 'netease', { forceRefresh: true });
    expect(getRecommendationHome).toHaveBeenNthCalledWith(3, 'netease', { forceRefresh: true });
  });

  it('accepts a fulfilled empty module without converting it into an error', async () => {
    const initial = createFeed('初始最新音乐');
    const empty = createFeed('unused');
    empty.newSongs = [];
    const getRecommendationHome = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, data: initial })
      .mockResolvedValueOnce({ ok: true as const, data: empty });
    installMusicPlayerApiMock({ getRecommendationHome });

    await useDiscoveryHomeStore.getState().loadRecommendationHome('netease');
    await useDiscoveryHomeStore.getState().refreshRecommendationModule('netease', 'new');

    const state = useDiscoveryHomeStore.getState().recommendationsByProvider.netease;
    expect(state.feed?.newSongs).toEqual([]);
    expect(state.modules.new).toMatchObject({ loaded: true, errorMessage: null });
  });

  it('isolates an unsupported QQ recommendation response from Netease state', async () => {
    const neteaseFeed = createFeed('网易推荐');
    installMusicPlayerApiMock({
      getRecommendationHome: vi.fn(async (providerId) => providerId === 'netease'
        ? { ok: true as const, data: neteaseFeed }
        : {
            ok: false as const,
            error: {
              code: 'provider_unsupported' as const,
              providerId: 'qq' as const,
              message: 'QQ 音乐暂不支持推荐首页能力'
            }
          })
    });

    await useDiscoveryHomeStore.getState().loadRecommendationHome('netease');
    await useDiscoveryHomeStore.getState().loadRecommendationHome('qq');

    expect(useDiscoveryHomeStore.getState().recommendationsByProvider.netease.feed).toEqual(neteaseFeed);
    expect(useDiscoveryHomeStore.getState().recommendationsByProvider.qq).toMatchObject({
      feed: null,
      modules: {
        new: {
          loaded: true,
          errorMessage: 'QQ 音乐暂不支持推荐首页能力'
        }
      }
    });
  });

  it('loads homepage blocks only through the dedicated Netease capability and reuses its own TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T12:00:00Z'));
    const feed = createHomepageBlockFeed('首页专题歌曲');
    const getHomepageBlocks = vi.fn(async () => ({ ok: true as const, data: feed }));
    const getRecommendationHome = vi.fn(async () => ({ ok: true as const, data: createFeed('不应调用') }));
    installMusicPlayerApiMock({ getHomepageBlocks, getRecommendationHome });

    const first = await useDiscoveryHomeStore.getState().loadHomepageBlocks();
    const cached = await useDiscoveryHomeStore.getState().loadHomepageBlocks();

    expect(first).toEqual(feed);
    expect(cached).toEqual(feed);
    expect(getHomepageBlocks).toHaveBeenCalledTimes(1);
    expect(getHomepageBlocks).toHaveBeenCalledWith('netease');
    expect(getRecommendationHome).not.toHaveBeenCalled();
    expect(useDiscoveryHomeStore.getState().homepageBlocks).toMatchObject({
      feed,
      isLoading: false,
      loaded: true,
      loadedAt: Date.now(),
      errorMessage: null
    });

    vi.setSystemTime(Date.now() + HOMEPAGE_BLOCK_CACHE_TTL_MS + 1);
    await useDiscoveryHomeStore.getState().loadHomepageBlocks();
    expect(getHomepageBlocks).toHaveBeenCalledTimes(2);
  });

  it('keeps stale homepage blocks when a user-triggered refresh fails', async () => {
    const feed = createHomepageBlockFeed('保留首页专题歌曲');
    const getHomepageBlocks = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, data: feed })
      .mockResolvedValueOnce({
        ok: false as const,
        error: {
          code: 'provider_failed' as const,
          providerId: 'netease' as const,
          message: '首页专题歌曲刷新失败'
        }
      });
    installMusicPlayerApiMock({ getHomepageBlocks });

    await useDiscoveryHomeStore.getState().loadHomepageBlocks();
    const refreshed = await useDiscoveryHomeStore.getState().loadHomepageBlocks({ forceRefresh: true });

    expect(refreshed).toEqual(feed);
    expect(getHomepageBlocks).toHaveBeenLastCalledWith('netease', { forceRefresh: true });
    expect(useDiscoveryHomeStore.getState().homepageBlocks).toMatchObject({
      feed,
      loaded: true,
      isLoading: false,
      errorMessage: '首页专题歌曲刷新失败'
    });
  });
});

function createFeed(title: string): RecommendationHomeFeed {
  return {
    providerId: 'netease',
    loggedIn: true,
    dailySongs: [],
    moduleResults: {
      daily: { status: 'fulfilled', errorMessage: null },
      new: { status: 'fulfilled', errorMessage: null }
    },
    newSongs: [createSong(title)]
  };
}

function createSong(title: string) {
  return {
    id: `netease:${title}`,
    providerId: 'netease' as const,
    platformSongId: title,
    title,
    artist: '测试歌手',
    album: '测试专辑',
    durationMs: 180_000,
    coverTone: 'linear-gradient(135deg, #607d8b, #9c6f86)'
  };
}

function createHomepageBlockFeed(title: string): HomepageBlockFeed {
  return {
    providerId: 'netease',
    blocks: [{
      kind: 'song',
      id: `netease:homepage-block:${title}`,
      title,
      songs: [{
        id: `netease:homepage-song:${title}`,
        providerId: 'netease',
        platformSongId: title,
        title,
        artist: '测试歌手',
        album: '测试专辑',
        durationMs: 180_000,
        coverTone: 'linear-gradient(135deg, #607d8b, #9c6f86)'
      }]
    }]
  };
}
