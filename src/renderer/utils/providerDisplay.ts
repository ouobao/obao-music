import type { ProviderId, RemoteProviderId } from '../../shared/musicTypes';

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  netease: '网易云音乐',
  qq: 'QQ音乐',
  local: '本地音乐'
};

export const REMOTE_PROVIDERS: RemoteProviderId[] = ['netease', 'qq'];

export function providerLabel(providerId: ProviderId): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}

export function sourceLabel(source: string, providerId?: ProviderId): string {
  const provider = providerId ? providerLabel(providerId) : '';
  const labels: Record<string, string> = {
    playlist: '歌单',
    search: '搜索',
    local: '本地',
    artist: '歌手',
    album: '专辑',
    podcast: '播客',
    radio: '电台',
    recommendation: '推荐'
  };
  const kind = labels[source] ?? source;
  return provider ? `${provider} · ${kind}` : kind;
}

export function formatPlaylistTitle(title: string, providerId?: ProviderId): string {
  const official = ['我喜欢的音乐', '喜欢的音乐'];
  if (official.includes(title)) {
    return providerId ? `${title} · ${providerLabel(providerId)}` : title;
  }
  return title;
}

export function chartUpdateLabel(updatedAt?: string): string {
  if (!updatedAt) return '';
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return '';
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}
