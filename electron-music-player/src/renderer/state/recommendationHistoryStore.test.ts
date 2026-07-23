import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecommendationHistoryPage, Song } from '../../shared/musicTypes';
import { installMusicPlayerApiMock } from '../test/fixtures/musicPlayerApi';
import { usePlayerStore } from './playerStore';
import {
  RECOMMENDATION_HISTORY_DATE_LIMIT,
  useRecommendationHistoryStore
} from './recommendationHistoryStore';

const dates = Array.from({ length: 9 }, (_, index) => `2026-07-${String(18 - index).padStart(2, '0')}`);

describe('recommendationHistoryStore', () => {
  beforeEach(() => {
    installMusicPlayerApiMock();
    useRecommendationHistoryStore.getState().resetForTest();
    usePlayerStore.getState().resetForTest();
    vi.restoreAllMocks();
  });

  it('loads the latest available Netease date, limits the menu, and preserves playback', async () => {
    const historySong = createSong('history-1', '历史歌曲 1');
    const getDates = vi.fn(async () => ({ ok: true as const, data: dates }));
    const getHistory = vi.fn(async (_providerId, date): Promise<{ ok: true; data: RecommendationHistoryPage }> => ({
      ok: true,
      data: { providerId: 'netease', date, songs: [historySong] }
    }));
    installMusicPlayerApiMock({
      getRecommendationHistoryDates: getDates,
      getRecommendationHistory: getHistory
    });
    const queueSong = createSong('queue', '队列歌曲');
    usePlayerStore.getState().playSongsFromList(
      [queueSong],
      0,
      () => ({ type: 'recommendation', providerId: 'netease', playlistTitle: '队列基线' })
    );
    const playbackBefore = snapshotPlayback();

    await useRecommendationHistoryStore.getState().load();

    const state = useRecommendationHistoryStore.getState();
    expect(state.dates).toEqual(dates.slice(0, RECOMMENDATION_HISTORY_DATE_LIMIT));
    expect(state.activeDate).toBe(dates[0]);
    expect(state.songs).toEqual([historySong]);
    expect(getDates).toHaveBeenCalledWith('netease', undefined);
    expect(getHistory).toHaveBeenCalledWith('netease', dates[0], undefined);
    expect(snapshotPlayback()).toEqual(playbackBefore);
  });

  it('coalesces concurrent initial loads and reuses the renderer cache', async () => {
    let resolveDates: ((value: { ok: true; data: string[] }) => void) | undefined;
    const pendingDates = new Promise<{ ok: true; data: string[] }>((resolve) => {
      resolveDates = resolve;
    });
    const getDates = vi.fn(async () => pendingDates);
    const getHistory = vi.fn(async (_providerId, date) => ({
      ok: true as const,
      data: { providerId: 'netease' as const, date, songs: [createSong('history-2', '历史歌曲 2')] }
    }));
    installMusicPlayerApiMock({
      getRecommendationHistoryDates: getDates,
      getRecommendationHistory: getHistory
    });

    const first = useRecommendationHistoryStore.getState().load();
    const second = useRecommendationHistoryStore.getState().load();
    resolveDates?.({ ok: true, data: dates.slice(0, 2) });
    await Promise.all([first, second]);
    await useRecommendationHistoryStore.getState().load();

    expect(getDates).toHaveBeenCalledTimes(1);
    expect(getHistory).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous date and songs when a date switch fails', async () => {
    const firstSong = createSong('history-first', '原日期歌曲');
    const getHistory = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        data: { providerId: 'netease', date: dates[0], songs: [firstSong] }
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'provider_failed', providerId: 'netease', message: '历史日推日期加载失败' }
      });
    installMusicPlayerApiMock({
      getRecommendationHistoryDates: vi.fn(async () => ({ ok: true as const, data: dates.slice(0, 2) })),
      getRecommendationHistory: getHistory
    });

    await useRecommendationHistoryStore.getState().load();
    await useRecommendationHistoryStore.getState().selectDate(dates[1]);

    const state = useRecommendationHistoryStore.getState();
    expect(state.activeDate).toBe(dates[0]);
    expect(state.songs).toEqual([firstSong]);
    expect(state.errorMessage).toBe('历史日推日期加载失败');
  });

  it('refreshes the date list and currently selected detail without crossing providers', async () => {
    const getDates = vi.fn(async (_providerId: string, _options?: unknown) => ({
      ok: true as const,
      data: dates.slice(0, 2)
    }));
    const getHistory = vi.fn(async (_providerId, date) => ({
      ok: true as const,
      data: { providerId: 'netease' as const, date, songs: [createSong(date, `歌曲 ${date}`)] }
    }));
    installMusicPlayerApiMock({
      getRecommendationHistoryDates: getDates,
      getRecommendationHistory: getHistory
    });

    await useRecommendationHistoryStore.getState().load();
    await useRecommendationHistoryStore.getState().selectDate(dates[1]);
    await useRecommendationHistoryStore.getState().load({ forceRefresh: true });

    expect(getDates).toHaveBeenLastCalledWith('netease', { forceRefresh: true });
    expect(getHistory).toHaveBeenLastCalledWith('netease', dates[1], { forceRefresh: true });
    expect(getDates.mock.calls.every(([providerId]) => providerId === 'netease')).toBe(true);
    expect(getHistory.mock.calls.every(([providerId]) => providerId === 'netease')).toBe(true);
  });

  it('treats an empty date list as a valid hidden state without requesting detail', async () => {
    const getHistory = vi.fn();
    installMusicPlayerApiMock({
      getRecommendationHistoryDates: vi.fn(async () => ({ ok: true as const, data: [] })),
      getRecommendationHistory: getHistory
    });

    await useRecommendationHistoryStore.getState().load();

    expect(useRecommendationHistoryStore.getState()).toMatchObject({
      dates: [],
      activeDate: null,
      songs: [],
      isLoading: false,
      loaded: true,
      errorMessage: null
    });
    expect(getHistory).not.toHaveBeenCalled();
  });
});

function createSong(platformSongId: string, title: string): Song {
  return {
    id: `netease:${platformSongId}`,
    providerId: 'netease',
    platformSongId,
    title,
    artist: '历史歌手',
    album: '历史专辑',
    durationMs: 180_000,
    coverTone: 'linear-gradient(135deg, #d94b55, #30343b)'
  };
}

function snapshotPlayback() {
  const state = usePlayerStore.getState();
  return {
    currentQueueItemId: state.currentQueueItemId,
    currentSong: state.currentSong,
    isPlaying: state.isPlaying,
    playbackPositionMs: state.playbackPositionMs,
    queue: state.queue,
    queueSongs: state.queueSongs
  };
}
