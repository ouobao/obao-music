import type {
  ChartSummary,
  DiscoveredPlaylist,
  PlaylistCategory,
  RemoteProviderId
} from '../../../shared/musicTypes';

export const DISCOVERY_PLAYLIST_BATCH_SIZE = 6;

export interface QQDiscoveryChartSelection {
  featured: ChartSummary | null;
  secondary: ChartSummary[];
}

export interface NeteaseDiscoveryChartSelection {
  entries: ChartSummary[];
  trendChart: ChartSummary | null;
}

const neteaseEntryKeywordGroups = [
  ['新歌', '新曲', '新声'],
  ['热歌', '热门'],
  ['飙升', '上升', '趋势']
] as const;

const neteaseTrendKeywords = neteaseEntryKeywordGroups[0];

export function normalizeDiscoveryTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function selectQQDiscoveryCharts(charts: readonly ChartSummary[]): QQDiscoveryChartSelection {
  const uniqueCharts = selectUniqueProviderCharts(charts, 'qq');

  return {
    featured: uniqueCharts[0] ?? null,
    secondary: uniqueCharts.slice(1, 5)
  };
}

export function selectNeteaseDiscoveryCharts(
  charts: readonly ChartSummary[]
): NeteaseDiscoveryChartSelection {
  const uniqueCharts = selectUniqueProviderCharts(charts, 'netease');
  const trendChart = findChartByKeywords(uniqueCharts, neteaseTrendKeywords) ?? uniqueCharts[0] ?? null;
  const remainingCharts = trendChart
    ? uniqueCharts.filter((chart) => chartIdentity(chart) !== chartIdentity(trendChart))
    : uniqueCharts;
  const entries: ChartSummary[] = [];
  const selectedIds = new Set<string>();

  for (const keywords of neteaseEntryKeywordGroups) {
    const chart = findChartByKeywords(
      remainingCharts,
      keywords,
      selectedIds
    );
    if (chart) {
      entries.push(chart);
      selectedIds.add(chartIdentity(chart));
    }
  }

  for (const chart of remainingCharts) {
    const identity = chartIdentity(chart);
    if (entries.length >= DISCOVERY_PLAYLIST_BATCH_SIZE) {
      break;
    }
    if (!selectedIds.has(identity)) {
      entries.push(chart);
      selectedIds.add(identity);
    }
  }

  return {
    entries,
    trendChart
  };
}

export function selectDiscoveryCategories(
  categories: readonly PlaylistCategory[],
  limit = 8
): PlaylistCategory[] {
  if (!Number.isInteger(limit) || limit <= 0) {
    return [];
  }

  const selectableCategories = categories.filter((category) => category.id !== 'all');
  const selected: PlaylistCategory[] = [];
  const selectedIds = new Set<string>();

  for (const category of [
    ...selectableCategories.filter((item) => item.hot),
    ...selectableCategories
  ]) {
    const identity = `${category.providerId}:${category.id}`;
    if (selectedIds.has(identity)) {
      continue;
    }

    selected.push(category);
    selectedIds.add(identity);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

export function selectDiscoveredPlaylists(
  playlists: readonly DiscoveredPlaylist[],
  limit = DISCOVERY_PLAYLIST_BATCH_SIZE
): DiscoveredPlaylist[] {
  if (!Number.isInteger(limit) || limit <= 0) {
    return [];
  }

  const selected: DiscoveredPlaylist[] = [];
  const selectedIds = new Set<string>();

  for (const playlist of playlists) {
    const identity = `${playlist.providerId}:${playlist.id}`;
    if (selectedIds.has(identity)) {
      continue;
    }

    selected.push(playlist);
    selectedIds.add(identity);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

export function getPlaylistBatch(
  playlists: readonly DiscoveredPlaylist[],
  batchIndex: number
): DiscoveredPlaylist[] {
  const uniquePlaylists = selectDiscoveredPlaylists(playlists, Number.MAX_SAFE_INTEGER);
  const batchCount = getPlaylistBatchCount(uniquePlaylists.length);
  const normalizedBatchIndex = normalizeBatchIndex(batchIndex, batchCount);
  const startIndex = normalizedBatchIndex * DISCOVERY_PLAYLIST_BATCH_SIZE;

  return uniquePlaylists.slice(startIndex, startIndex + DISCOVERY_PLAYLIST_BATCH_SIZE);
}

export function getNextPlaylistBatchIndex(currentBatchIndex: number, playlistCount: number): number {
  const batchCount = getPlaylistBatchCount(playlistCount);
  if (batchCount <= 1) {
    return 0;
  }
  if (!Number.isInteger(currentBatchIndex) || currentBatchIndex < 0 || currentBatchIndex >= batchCount) {
    return 0;
  }

  return currentBatchIndex + 1 < batchCount ? currentBatchIndex + 1 : 0;
}

export function getPlaylistBatchIndexAfterAppend(
  currentBatchIndex: number,
  playlistCountBeforeAppend: number,
  playlistCountAfterAppend: number
): number {
  const normalizedCountBeforeAppend = normalizePlaylistCount(playlistCountBeforeAppend);
  const batchCountBeforeAppend = getPlaylistBatchCount(normalizedCountBeforeAppend);
  if (
    batchCountBeforeAppend === 0
    || !Number.isInteger(currentBatchIndex)
    || currentBatchIndex < 0
    || currentBatchIndex >= batchCountBeforeAppend
  ) {
    return 0;
  }

  const normalizedCountAfterAppend = normalizePlaylistCount(playlistCountAfterAppend);
  const firstUnseenIndex = Math.min(
    (currentBatchIndex + 1) * DISCOVERY_PLAYLIST_BATCH_SIZE,
    normalizedCountBeforeAppend
  );

  if (firstUnseenIndex < normalizedCountAfterAppend) {
    return Math.floor(firstUnseenIndex / DISCOVERY_PLAYLIST_BATCH_SIZE);
  }

  return normalizeBatchIndex(
    currentBatchIndex,
    getPlaylistBatchCount(normalizedCountAfterAppend)
  );
}

function selectUniqueProviderCharts(
  charts: readonly ChartSummary[],
  providerId: RemoteProviderId
): ChartSummary[] {
  const selected: ChartSummary[] = [];
  const selectedIds = new Set<string>();

  for (const chart of charts) {
    const identity = chartIdentity(chart);
    if (chart.providerId === providerId && !selectedIds.has(identity)) {
      selected.push(chart);
      selectedIds.add(identity);
    }
  }

  return selected;
}

function findChartByKeywords(
  charts: readonly ChartSummary[],
  keywords: readonly string[],
  excludedIds: ReadonlySet<string> = new Set()
): ChartSummary | null {
  const normalizedKeywords = keywords.map(normalizeDiscoveryTitle);

  return charts.find((chart) => {
    if (excludedIds.has(chartIdentity(chart))) {
      return false;
    }

    const normalizedTitle = normalizeDiscoveryTitle(chart.title);
    return normalizedKeywords.some((keyword) => normalizedTitle.includes(keyword));
  }) ?? null;
}

function chartIdentity(chart: ChartSummary): string {
  return `${chart.providerId}:${chart.id}`;
}

function getPlaylistBatchCount(playlistCount: number): number {
  const normalizedPlaylistCount = normalizePlaylistCount(playlistCount);

  return Math.ceil(normalizedPlaylistCount / DISCOVERY_PLAYLIST_BATCH_SIZE);
}

function normalizePlaylistCount(playlistCount: number): number {
  if (!Number.isFinite(playlistCount) || playlistCount <= 0) {
    return 0;
  }

  return Math.floor(playlistCount);
}

function normalizeBatchIndex(batchIndex: number, batchCount: number): number {
  if (!Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex >= batchCount) {
    return 0;
  }

  return batchIndex;
}
