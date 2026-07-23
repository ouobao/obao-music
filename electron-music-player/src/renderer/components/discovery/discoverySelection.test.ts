import { describe, expect, it } from 'vitest';
import type {
  ChartSummary,
  DiscoveredPlaylist,
  PlaylistCategory,
  RemoteProviderId
} from '../../../shared/musicTypes';
import {
  DISCOVERY_PLAYLIST_BATCH_SIZE,
  getNextPlaylistBatchIndex,
  getPlaylistBatch,
  getPlaylistBatchIndexAfterAppend,
  normalizeDiscoveryTitle,
  selectDiscoveryCategories,
  selectDiscoveredPlaylists,
  selectNeteaseDiscoveryCharts,
  selectQQDiscoveryCharts
} from './discoverySelection';

describe('discovery selection', () => {
  it('normalizes chart titles before keyword matching', () => {
    expect(normalizeDiscoveryTitle('  云音乐 · 新歌榜（每日更新） ')).toBe('云音乐新歌榜每日更新');
    expect(normalizeDiscoveryTitle('RISING-HITS 2026')).toBe('risinghits2026');
  });

  it('selects one QQ featured chart and four unique secondary charts in provider order', () => {
    const charts = [
      createChart('qq', '1', 'QQ 流行指数榜'),
      createChart('qq', '2', 'QQ 新歌榜'),
      createChart('qq', '2', '重复的新歌榜'),
      createChart('netease', '3', '其他来源榜单'),
      createChart('qq', '4', 'QQ 热歌榜'),
      createChart('qq', '5', 'QQ 飙升榜'),
      createChart('qq', '6', 'QQ 欧美榜'),
      createChart('qq', '7', '不会进入首屏')
    ];

    const selection = selectQQDiscoveryCharts(charts);

    expect(selection.featured?.id).toBe('qq:chart:1');
    expect(selection.secondary.map((chart) => chart.id)).toEqual([
      'qq:chart:2',
      'qq:chart:4',
      'qq:chart:5',
      'qq:chart:6'
    ]);
  });

  it('returns empty QQ roles when no QQ chart is available', () => {
    expect(selectQQDiscoveryCharts([])).toEqual({ featured: null, secondary: [] });
    expect(selectQQDiscoveryCharts([createChart('netease', '1', '网易云榜单')]))
      .toEqual({ featured: null, secondary: [] });
  });

  it('reserves one netease new-song chart for trends and prioritizes unique entry roles', () => {
    const charts = [
      createChart('netease', '1', '原创音乐榜'),
      createChart('netease', '2', '云音乐热歌榜'),
      createChart('netease', '3', '云音乐飙升榜'),
      createChart('netease', '4', '云音乐 · 新歌榜'),
      createChart('netease', '2', '重复热歌榜'),
      createChart('netease', '5', '欧美榜'),
      createChart('netease', '6', '说唱榜'),
      createChart('netease', '7', '国风榜'),
      createChart('netease', '8', '摇滚榜'),
      createChart('qq', '9', 'QQ 新歌榜')
    ];

    const selection = selectNeteaseDiscoveryCharts(charts);

    expect(selection.trendChart?.id).toBe('netease:chart:4');
    expect(selection.entries.map((chart) => chart.id)).toEqual([
      'netease:chart:2',
      'netease:chart:3',
      'netease:chart:1',
      'netease:chart:5',
      'netease:chart:6',
      'netease:chart:7'
    ]);
    expect(selection.entries).not.toContain(selection.trendChart);
  });

  it('falls back to the first netease chart when no new-song title matches', () => {
    const first = createChart('netease', '1', '云音乐原创榜');
    const second = createChart('netease', '2', '云音乐民谣榜');

    expect(selectNeteaseDiscoveryCharts([first, second])).toEqual({
      trendChart: first,
      entries: [second]
    });
    expect(selectNeteaseDiscoveryCharts([])).toEqual({ trendChart: null, entries: [] });
  });

  it('prioritizes hot categories, fills in provider order, and removes duplicates', () => {
    const categories: PlaylistCategory[] = [
      { id: 'all', providerId: 'qq', name: '全部' },
      { id: 'rock', providerId: 'qq', name: '摇滚' },
      { id: 'pop', providerId: 'qq', name: '流行', hot: true },
      { id: 'rock', providerId: 'qq', name: '重复摇滚', hot: true },
      { id: 'workout', providerId: 'qq', name: '运动', hot: true },
      { id: 'folk', providerId: 'qq', name: '民谣' }
    ];

    expect(selectDiscoveryCategories(categories, 4).map((category) => category.name)).toEqual([
      '流行',
      '重复摇滚',
      '运动',
      '民谣'
    ]);
    expect(selectDiscoveryCategories(categories, 0)).toEqual([]);
  });

  it('deduplicates public playlists by provider and id before truncating', () => {
    const playlists = [
      createPlaylist('qq', 'shared', 'QQ 一'),
      createPlaylist('qq', 'shared', 'QQ 重复'),
      createPlaylist('netease', 'shared', '网易云同 ID'),
      createPlaylist('qq', '2', 'QQ 二')
    ];

    expect(selectDiscoveredPlaylists(playlists, 3).map((playlist) => playlist.title)).toEqual([
      'QQ 一',
      '网易云同 ID',
      'QQ 二'
    ]);
    expect(selectDiscoveredPlaylists(playlists, -1)).toEqual([]);
  });

  it('returns six playlists per batch and wraps the next index at the local boundary', () => {
    const playlists = Array.from({ length: 14 }, (_, index) => (
      createPlaylist('netease', String(index + 1), `歌单 ${index + 1}`)
    ));

    expect(DISCOVERY_PLAYLIST_BATCH_SIZE).toBe(6);
    expect(getPlaylistBatch(playlists, 0).map((playlist) => playlist.title)).toEqual([
      '歌单 1', '歌单 2', '歌单 3', '歌单 4', '歌单 5', '歌单 6'
    ]);
    expect(getPlaylistBatch(playlists, 2).map((playlist) => playlist.title)).toEqual(['歌单 13', '歌单 14']);
    expect(getPlaylistBatch(playlists, 99)[0].title).toBe('歌单 1');

    expect(getNextPlaylistBatchIndex(0, 14)).toBe(1);
    expect(getNextPlaylistBatchIndex(1, 14)).toBe(2);
    expect(getNextPlaylistBatchIndex(2, 14)).toBe(0);
    expect(getNextPlaylistBatchIndex(0, 6)).toBe(0);
    expect(getNextPlaylistBatchIndex(99, 14)).toBe(0);
    expect(getNextPlaylistBatchIndex(0, 0)).toBe(0);
  });

  it('fills a partial final batch after appending without skipping new unique playlists', () => {
    const initialPlaylists = Array.from({ length: 14 }, (_, index) => (
      createPlaylist('netease', String(index + 1), `Playlist ${index + 1}`)
    ));
    const appendedPlaylists = selectDiscoveredPlaylists([
      ...initialPlaylists,
      createPlaylist('netease', '13', 'Duplicate 13'),
      createPlaylist('netease', '14', 'Duplicate 14'),
      ...Array.from({ length: 6 }, (_, index) => (
        createPlaylist('netease', String(index + 15), `Playlist ${index + 15}`)
      ))
    ], Number.MAX_SAFE_INTEGER);

    const nextBatchIndex = getPlaylistBatchIndexAfterAppend(
      2,
      initialPlaylists.length,
      appendedPlaylists.length
    );

    expect(appendedPlaylists).toHaveLength(20);
    expect(nextBatchIndex).toBe(2);
    expect(getPlaylistBatch(appendedPlaylists, nextBatchIndex).map((playlist) => playlist.id)).toEqual([
      '13', '14', '15', '16', '17', '18'
    ]);
  });

  it('advances after a full final batch and stays put when append adds no unique data', () => {
    expect(getPlaylistBatchIndexAfterAppend(1, 12, 18)).toBe(2);
    expect(getPlaylistBatchIndexAfterAppend(2, 14, 14)).toBe(2);
    expect(getPlaylistBatchIndexAfterAppend(0, 6, 6)).toBe(0);
  });

  it('uses the next local batch and normalizes invalid append boundaries', () => {
    expect(getPlaylistBatchIndexAfterAppend(0, 14, 20)).toBe(1);
    expect(getPlaylistBatchIndexAfterAppend(99, 14, 20)).toBe(0);
    expect(getPlaylistBatchIndexAfterAppend(0, 0, 6)).toBe(0);
    expect(getPlaylistBatchIndexAfterAppend(0, Number.NaN, 6)).toBe(0);
  });
});

function createChart(
  providerId: RemoteProviderId,
  platformChartId: string,
  title: string
): ChartSummary {
  return {
    id: `${providerId}:chart:${platformChartId}`,
    providerId,
    platformChartId,
    title,
    description: '',
    songIds: [],
    coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
  };
}

function createPlaylist(
  providerId: RemoteProviderId,
  platformPlaylistId: string,
  title: string
): DiscoveredPlaylist {
  return {
    id: platformPlaylistId,
    providerId,
    platformPlaylistId,
    title,
    description: '',
    songIds: [],
    coverTone: 'linear-gradient(135deg, #31c27c, #2f6f90)'
  };
}
