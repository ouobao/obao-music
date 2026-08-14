import type { Playlist, ProviderId } from '../../shared/musicTypes';

const officialLikedPlaylistTitles: Partial<Record<ProviderId, string>> = {
  netease: '我喜欢的音乐',
  qq: '喜欢的音乐'
};

const sidebarLikedPlaylistSuffixes: Partial<Record<ProviderId, string>> = {
  netease: '网易云音乐',
  qq: 'QQ音乐'
};

export function isProviderLikedPlaylist(playlist: Playlist): boolean {
  return playlist.isLiked === true;
}

export function formatPlaylistDisplayTitle(playlist: Playlist): string {
  if (!isProviderLikedPlaylist(playlist)) {
    return playlist.title;
  }

  return officialLikedPlaylistTitles[playlist.providerId] ?? playlist.title;
}

export function formatSidebarLikedPlaylistDisplayTitle(playlist: Playlist): string {
  const title = formatPlaylistDisplayTitle(playlist);
  const providerSuffix = sidebarLikedPlaylistSuffixes[playlist.providerId];

  return providerSuffix ? `${title}-${providerSuffix}` : title;
}
