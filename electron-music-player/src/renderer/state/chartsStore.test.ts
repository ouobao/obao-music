import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartSummary, Song } from '../../shared/musicTypes';
import { installMusicPlayerApiMock } from '../test/fixtures/musicPlayerApi';
import { useChartsStore } from './chartsStore';

const qqChart: ChartSummary = {
  id: 'qq:chart:62',
  providerId: 'qq',
  platformChartId: '62',
  title: 'QQ 飙升榜',
  description: 'QQ 榜单',
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
  description: '网易云榜单',
  songIds: [],
  coverTone: 'linear-gradient(135deg, #d94b55, #30343b)',
  sourceLabel: '网易云',
  updateLabel: '每天更新'
};

const qqTrack: Song = {
  id: 'qq:track-1',
  providerId: 'qq',
  platformSongId: 'track-1',
  title: 'QQ 榜单歌曲',
  artist: 'QQ 歌手',
  album: 'QQ 专辑',
  durationMs: 180000,
  coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
};

describe('charts store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    installMusicPlayerApiMock();
    useChartsStore.getState().resetForTest();
  });

  it('loads and caches chart directories in separate provider buckets', async () => {
    const getCharts = vi.fn(async (providerId: 'qq' | 'netease') => ({
      ok: true as const,
      data: providerId === 'qq' ? [qqChart] : [neteaseChart]
    }));
    installMusicPlayerApiMock({ getCharts });

    await Promise.all([
      useChartsStore.getState().loadCharts('qq'),
      useChartsStore.getState().loadCharts('netease')
    ]);
    await useChartsStore.getState().loadCharts('qq');

    const state = useChartsStore.getState();
    expect(state.chartsByProvider.qq).toEqual([qqChart]);
    expect(state.chartsByProvider.netease).toEqual([neteaseChart]);
    expect(getCharts).toHaveBeenCalledTimes(2);
  });

  it('keeps provider errors isolated from successfully loaded directories', async () => {
    installMusicPlayerApiMock({
      getCharts: async (providerId) => providerId === 'qq'
        ? {
            ok: false,
            error: {
              code: 'provider_failed',
              providerId,
              message: 'QQ 排行榜加载失败'
            }
          }
        : { ok: true, data: [neteaseChart] }
    });

    await useChartsStore.getState().loadCharts('netease');
    await useChartsStore.getState().loadCharts('qq');

    const state = useChartsStore.getState();
    expect(state.chartsByProvider.netease).toEqual([neteaseChart]);
    expect(state.errorMessageByProvider.netease).toBeNull();
    expect(state.chartsByProvider.qq).toEqual([]);
    expect(state.errorMessageByProvider.qq).toBe('QQ 排行榜加载失败');
  });

  it('force refreshes a loaded provider directory', async () => {
    const refreshedChart = { ...qqChart, title: '刷新后的 QQ 飙升榜' };
    const getCharts = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, data: [qqChart] })
      .mockResolvedValueOnce({ ok: true as const, data: [refreshedChart] });
    installMusicPlayerApiMock({ getCharts });

    await useChartsStore.getState().loadCharts('qq');
    await useChartsStore.getState().loadCharts('qq', { forceRefresh: true });

    expect(getCharts).toHaveBeenLastCalledWith('qq', { forceRefresh: true });
    expect(useChartsStore.getState().chartsByProvider.qq).toEqual([refreshedChart]);
  });

  it('stores chart detail tracks by the complete chart id', async () => {
    const getChartTracks = vi.fn(async () => ({ ok: true as const, data: [qqTrack] }));
    installMusicPlayerApiMock({ getChartTracks });

    const tracks = await useChartsStore.getState().loadChartTracks('qq', qqChart.id);

    expect(getChartTracks).toHaveBeenCalledWith('qq', 'qq:chart:62');
    expect(tracks).toEqual([qqTrack]);
    expect(useChartsStore.getState().chartTracksById['qq:chart:62']).toEqual([qqTrack]);
  });

  it('remembers the most recently selected chart provider', () => {
    useChartsStore.getState().setLastProviderId('netease');

    expect(useChartsStore.getState().lastProviderId).toBe('netease');
    expect(window.localStorage.getItem('musicplayer.charts-provider')).toBe('netease');
  });
});
