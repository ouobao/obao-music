import type {
  HomepageBlockFeed,
  Playlist,
  RecommendationHomeFeed,
  RemoteProviderId,
  Song
} from '../../shared/musicTypes';

export interface RecommendationCollectionDetail {
  playlist: Playlist;
  songs: Song[];
}

interface RecommendationCollectionSources {
  recommendationFeed: RecommendationHomeFeed | null;
  homepageBlockFeed?: HomepageBlockFeed | null;
  historySongs?: readonly Song[];
}

export function resolveRecommendationCollection(
  providerId: RemoteProviderId,
  collectionId: string,
  sources: RecommendationCollectionSources
): RecommendationCollectionDetail | null {
  if (collectionId === 'new') {
    return createCollection(providerId, collectionId, providerId === 'qq' ? '新歌推荐' : '最新音乐', sources.recommendationFeed?.newSongs ?? []);
  }
  if (providerId === 'netease' && collectionId === 'daily') {
    return createCollection(providerId, collectionId, '每日推荐', sources.recommendationFeed?.dailySongs ?? []);
  }
  if (providerId === 'netease' && collectionId === 'history') {
    return createCollection(providerId, collectionId, '历史日推', sources.historySongs ?? []);
  }
  if (providerId === 'netease' && collectionId.startsWith('homepage:')) {
    const blockId = collectionId.slice('homepage:'.length);
    const block = sources.homepageBlockFeed?.blocks.find((candidate) => (
      candidate.kind === 'song' && candidate.id === blockId
    ));
    if (block?.kind === 'song') {
      return createCollection(providerId, collectionId, block.title, block.songs);
    }
  }
  return null;
}

function createCollection(
  providerId: RemoteProviderId,
  collectionId: string,
  title: string,
  songs: readonly Song[]
): RecommendationCollectionDetail {
  const uniqueSongs = deduplicateSongs(songs);
  const coverSong = uniqueSongs[0];
  return {
    playlist: {
      id: `${providerId}:recommendation:${collectionId}`,
      providerId,
      title,
      description: '来自当前发现音乐数据的歌曲集合',
      songIds: uniqueSongs.map((song) => song.id),
      coverTone: coverSong?.coverTone ?? 'linear-gradient(135deg, #31c27c, #607d8b)',
      ...(coverSong?.coverUrl ? { coverUrl: coverSong.coverUrl } : {}),
      sourceLabel: providerId === 'qq' ? 'QQ 音乐' : '网易云音乐'
    },
    songs: uniqueSongs
  };
}

function deduplicateSongs(songs: readonly Song[]): Song[] {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const identity = `${song.providerId}:${song.platformSongId ?? song.id}`;
    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
}
