import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RadioSession,
  RadioSessionItem,
  RadioSessionPage,
  Song
} from '../../shared/musicTypes';
import type { ProviderIpcResult } from '../../shared/providerTypes';
import { createMusicPlayerApi } from '../test/fixtures/musicPlayerApi';
import { usePlayerStore } from './playerStore';
import { useRadioSessionStore } from './radioSessionStore';

type MusicApi = Window['musicPlayer']['music'];
type RadioApiOverrides = Partial<Pick<
  MusicApi,
  'startRadioSession' | 'refillRadioSession' | 'skipRadioSessionItem' | 'submitRadioNegativeFeedback'
>>;

const neteaseSession: RadioSession = {
  id: 'opaque-session-a',
  providerId: 'netease',
  cursor: 'opaque-cursor-a'
};

const qqSession: RadioSession = {
  id: 'opaque-session-b',
  providerId: 'qq',
  cursor: 'opaque-cursor-b'
};

describe('radio session store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePlayerStore.getState().resetForTest();
    useRadioSessionStore.getState().resetForTest();
  });

  afterEach(() => {
    usePlayerStore.getState().resetForTest();
    useRadioSessionStore.getState().resetForTest();
    vi.restoreAllMocks();
  });

  it('deduplicates an in-flight start, keeps the cursor opaque, and never writes the player', async () => {
    let resolveStart: ((result: ProviderIpcResult<RadioSessionPage>) => void) | undefined;
    const response = new Promise<ProviderIpcResult<RadioSessionPage>>((resolve) => {
      resolveStart = resolve;
    });
    const first = createItem('item-1', 'song-1');
    const duplicateSong = createItem('item-duplicate', 'song-1');
    const second = createItem('item-2', 'song-2');
    const page = createPage(neteaseSession, [first, duplicateSong, second]);
    const startRadioSession = vi.fn(() => response);
    const api = installRadioApi({ startRadioSession });
    const playerBefore = snapshotPlayer();

    const firstStart = useRadioSessionStore.getState().start('netease');
    const duplicateStart = useRadioSessionStore.getState().start('netease');

    expect(duplicateStart).toBe(firstStart);
    expect(startRadioSession).toHaveBeenCalledTimes(1);
    resolveStart?.({ ok: true, data: page });
    await expect(firstStart).resolves.toEqual(page);

    expect(useRadioSessionStore.getState()).toMatchObject({
      session: neteaseSession,
      hasMore: true,
      isLoading: false,
      errorMessage: null
    });
    expect(useRadioSessionStore.getState().items.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(useRadioSessionStore.getState().session?.cursor).toBe(neteaseSession.cursor);
    expectPlayerUnchanged(playerBefore);
    expectDiscoveryApisUnused(api);
  });

  it('passes the active opaque session into refill, deduplicates songs and preserves player state', async () => {
    const first = createItem('item-1', 'song-1');
    const second = createItem('item-2', 'song-2');
    const updatedSession: RadioSession = { ...neteaseSession, cursor: 'opaque-cursor-b' };
    const refillPage = createPage(updatedSession, [
      createItem('item-duplicate', 'song-1'),
      second
    ]);
    const refillRadioSession = vi.fn(async () => ({ ok: true as const, data: refillPage }));
    const api = installRadioApi({
      startRadioSession: vi.fn(async () => ({ ok: true as const, data: createPage(neteaseSession, [first]) })),
      refillRadioSession
    });
    await useRadioSessionStore.getState().start('netease');
    const playerBefore = snapshotPlayer();

    const firstRefill = useRadioSessionStore.getState().refill();
    const duplicateRefill = useRadioSessionStore.getState().refill();

    expect(duplicateRefill).toBe(firstRefill);
    await expect(firstRefill).resolves.toEqual(refillPage);
    expect(refillRadioSession).toHaveBeenCalledTimes(1);
    expect(refillRadioSession).toHaveBeenCalledWith(neteaseSession);
    expect(useRadioSessionStore.getState().items.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(useRadioSessionStore.getState().session).toEqual(updatedSession);
    expectPlayerUnchanged(playerBefore);
    expectDiscoveryApisUnused(api);
  });

  it('ignores a late response from a replaced session', async () => {
    let resolveNetease: ((result: ProviderIpcResult<RadioSessionPage>) => void) | undefined;
    let resolveQq: ((result: ProviderIpcResult<RadioSessionPage>) => void) | undefined;
    const neteaseResponse = new Promise<ProviderIpcResult<RadioSessionPage>>((resolve) => {
      resolveNetease = resolve;
    });
    const qqResponse = new Promise<ProviderIpcResult<RadioSessionPage>>((resolve) => {
      resolveQq = resolve;
    });
    const startRadioSession = vi.fn((providerId: RadioSession['providerId']) => (
      providerId === 'netease' ? neteaseResponse : qqResponse
    ));
    const api = installRadioApi({ startRadioSession });
    const playerBefore = snapshotPlayer();

    const staleStart = useRadioSessionStore.getState().start('netease');
    const activeStart = useRadioSessionStore.getState().start('qq');
    const qqItem = createItem('qq-item-1', 'qq-song-1', 'qq');
    resolveQq?.({ ok: true, data: createPage(qqSession, [qqItem]) });
    await activeStart;
    resolveNetease?.({ ok: true, data: createPage(neteaseSession, [createItem('item-1', 'song-1')]) });
    await expect(staleStart).resolves.toBeNull();

    expect(useRadioSessionStore.getState().session).toEqual(qqSession);
    expect(useRadioSessionStore.getState().items.map((item) => item.id)).toEqual([qqItem.id]);
    expectPlayerUnchanged(playerBefore);
    expectDiscoveryApisUnused(api);
  });

  it('retains the buffered session after a refill failure and never retries it automatically', async () => {
    const first = createItem('item-1', 'song-1');
    const initialPage = createPage(neteaseSession, [first]);
    const refillRadioSession = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: 'provider_failed' as const,
        providerId: 'netease' as const,
        message: '补流失败'
      }
    }));
    const api = installRadioApi({
      startRadioSession: vi.fn(async () => ({ ok: true as const, data: initialPage })),
      refillRadioSession
    });
    await useRadioSessionStore.getState().start('netease');
    const playerBefore = snapshotPlayer();

    await expect(useRadioSessionStore.getState().refill()).resolves.toBeNull();
    await Promise.resolve();

    expect(refillRadioSession).toHaveBeenCalledTimes(1);
    expect(useRadioSessionStore.getState()).toMatchObject({
      session: neteaseSession,
      items: [first],
      hasMore: true,
      isLoading: false,
      errorMessage: '补流失败'
    });
    expectPlayerUnchanged(playerBefore);
    expectDiscoveryApisUnused(api);
  });

  it('keeps the session empty when the provider does not implement radio and never creates a fallback feed', async () => {
    const api = installRadioApi({});
    const playerBefore = snapshotPlayer();

    await expect(useRadioSessionStore.getState().start('netease')).resolves.toBeNull();

    expect(useRadioSessionStore.getState()).toMatchObject({
      session: null,
      items: [],
      hasMore: false,
      isLoading: false,
      errorMessage: 'Radio session is unavailable in this fixture'
    });
    expectPlayerUnchanged(playerBefore);
    expectDiscoveryApisUnused(api);
  });

  it('merges skip and negative-feedback pages without touching the playback queue', async () => {
    const first = createItem('item-1', 'song-1');
    const second = createItem('item-2', 'song-2');
    const third = createItem('item-3', 'song-3');
    const fourth = createItem('item-4', 'song-4');
    const skippedSession: RadioSession = { ...neteaseSession, cursor: 'opaque-cursor-after-skip' };
    const feedbackSession: RadioSession = { ...skippedSession, cursor: 'opaque-cursor-after-feedback' };
    const skipRadioSessionItem = vi.fn(async () => ({
      ok: true as const,
      data: createPage(skippedSession, [first, third])
    }));
    const submitRadioNegativeFeedback = vi.fn(async () => ({
      ok: true as const,
      data: createPage(feedbackSession, [second, fourth])
    }));
    const api = installRadioApi({
      startRadioSession: vi.fn(async () => ({ ok: true as const, data: createPage(neteaseSession, [first, second]) })),
      skipRadioSessionItem,
      submitRadioNegativeFeedback
    });
    await useRadioSessionStore.getState().start('netease');
    const playerBefore = snapshotPlayer();

    await expect(useRadioSessionStore.getState().skip(first)).resolves.toEqual(expect.objectContaining({ session: skippedSession }));
    expect(skipRadioSessionItem).toHaveBeenCalledWith(neteaseSession, first);
    expect(useRadioSessionStore.getState().items.map((item) => item.id)).toEqual([second.id, third.id]);

    await expect(useRadioSessionStore.getState().submitNegativeFeedback(second)).resolves.toEqual(expect.objectContaining({ session: feedbackSession }));
    expect(submitRadioNegativeFeedback).toHaveBeenCalledWith(skippedSession, second);
    expect(useRadioSessionStore.getState().items.map((item) => item.id)).toEqual([third.id, fourth.id]);
    expectPlayerUnchanged(playerBefore);
    expectDiscoveryApisUnused(api);
  });

  it('rejects a matching song from another radio session before sending commands', async () => {
    const first = createItem('item-1', 'song-1');
    const foreignSessionItem: RadioSessionItem = {
      ...first,
      sourceContext: {
        ...first.sourceContext,
        radioSessionId: 'opaque-session-other'
      }
    };
    const skipRadioSessionItem = vi.fn(async () => ({ ok: true as const, data: createPage(neteaseSession, []) }));
    const submitRadioNegativeFeedback = vi.fn(async () => ({ ok: true as const, data: createPage(neteaseSession, []) }));
    const api = installRadioApi({
      startRadioSession: vi.fn(async () => ({ ok: true as const, data: createPage(neteaseSession, [first]) })),
      skipRadioSessionItem,
      submitRadioNegativeFeedback
    });
    await useRadioSessionStore.getState().start('netease');
    const playerBefore = snapshotPlayer();

    await expect(useRadioSessionStore.getState().skip(foreignSessionItem)).resolves.toBeNull();
    await expect(useRadioSessionStore.getState().submitNegativeFeedback(foreignSessionItem)).resolves.toBeNull();

    expect(skipRadioSessionItem).not.toHaveBeenCalled();
    expect(submitRadioNegativeFeedback).not.toHaveBeenCalled();
    expect(useRadioSessionStore.getState().items).toEqual([first]);
    expectPlayerUnchanged(playerBefore);
    expectDiscoveryApisUnused(api);
  });
});

function createItem(itemId: string, songId: string, providerId: RadioSession['providerId'] = 'netease'): RadioSessionItem {
  const song: Song = {
    id: `${providerId}:${songId}`,
    providerId,
    platformSongId: songId,
    title: `Song ${songId}`,
    artist: 'Radio Artist',
    album: 'Radio Album',
    durationMs: 180_000,
    coverTone: 'linear-gradient(135deg, #607d8b, #9c6f86)'
  };

  return {
    id: `${providerId}:${itemId}`,
    song,
    sourceContext: {
      type: 'radio',
      providerId,
      radioSessionId: providerId === 'netease' ? neteaseSession.id : qqSession.id,
      radioItemId: `${providerId}:${itemId}`
    }
  };
}

function createPage(session: RadioSession, items: RadioSessionItem[], hasMore = true): RadioSessionPage {
  return { session, items, hasMore };
}

function installRadioApi(overrides: RadioApiOverrides) {
  const getRecommendationHome = vi.fn();
  const getCharts = vi.fn();
  const getChartTracks = vi.fn();
  const getDiscoveredPlaylists = vi.fn();
  const getPlaylistTracks = vi.fn();
  const getUserPlaylists = vi.fn();
  window.musicPlayer = createMusicPlayerApi({
    getRecommendationHome,
    getCharts,
    getChartTracks,
    getDiscoveredPlaylists,
    getPlaylistTracks,
    getUserPlaylists,
    startRadioSession: overrides.startRadioSession ?? vi.fn(async (providerId) => unsupported(providerId)),
    refillRadioSession: overrides.refillRadioSession ?? vi.fn(async (session) => unsupported(session.providerId)),
    skipRadioSessionItem: overrides.skipRadioSessionItem ?? vi.fn(async (session) => unsupported(session.providerId)),
    submitRadioNegativeFeedback: overrides.submitRadioNegativeFeedback ?? vi.fn(async (session) => unsupported(session.providerId))
  });

  return {
    getRecommendationHome,
    getCharts,
    getChartTracks,
    getDiscoveredPlaylists,
    getPlaylistTracks,
    getUserPlaylists
  };
}

function unsupported(providerId: RadioSession['providerId']): ProviderIpcResult<RadioSessionPage> {
  return {
    ok: false,
    error: {
      code: 'provider_unsupported',
      providerId,
      message: 'Radio session is unavailable in this fixture'
    }
  };
}

function snapshotPlayer() {
  const state = usePlayerStore.getState();
  return {
    queue: state.queue,
    queueMedia: state.queueMedia,
    queueSongs: state.queueSongs,
    currentQueueItemId: state.currentQueueItemId,
    currentMedia: state.currentMedia,
    currentSong: state.currentSong,
    currentPlaybackUrl: state.currentPlaybackUrl,
    playbackStatus: state.playbackStatus,
    playbackPositionMs: state.playbackPositionMs,
    playbackDurationMs: state.playbackDurationMs,
    isPlaying: state.isPlaying
  };
}

function expectPlayerUnchanged(snapshot: ReturnType<typeof snapshotPlayer>) {
  expect(snapshotPlayer()).toEqual(snapshot);
}

function expectDiscoveryApisUnused(api: ReturnType<typeof installRadioApi>) {
  expect(api.getRecommendationHome).not.toHaveBeenCalled();
  expect(api.getCharts).not.toHaveBeenCalled();
  expect(api.getChartTracks).not.toHaveBeenCalled();
  expect(api.getDiscoveredPlaylists).not.toHaveBeenCalled();
  expect(api.getPlaylistTracks).not.toHaveBeenCalled();
  expect(api.getUserPlaylists).not.toHaveBeenCalled();
}
