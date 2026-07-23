import type { ProviderId, QueueSourceType } from '../../shared/musicTypes';

const providerLabels: Record<ProviderId, string> = {
  netease: '网易云',
  qq: 'QQ 音乐',
  local: '本地',
};

const providerSourceLabels: Record<ProviderId, string> = {
  netease: '网易云音乐',
  qq: 'QQ 音乐',
  local: '本地音乐'
};

const queueSourceLabels: Record<QueueSourceType, string> = {
  playlist: '歌单',
  search: '搜索',
  local: '本地',
  artist: '歌手',
  album: '专辑',
  podcast: '播客',
  radio: '电台',
  recommendation: '推荐'
};

export function formatProviderLabel(providerId: ProviderId, sourceLabel?: string): string {
  return sourceLabel ?? providerLabels[providerId];
}

export function formatProviderSourceLabel(providerId: ProviderId): string {
  return providerSourceLabels[providerId];
}

export function formatSourceContextLabel(providerId: ProviderId, sourceType: QueueSourceType, sourceLabel?: string): string {
  return `${formatProviderLabel(providerId, sourceLabel)} · ${queueSourceLabels[sourceType]}`;
}
