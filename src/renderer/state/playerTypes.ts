import type { QueueItem, Song } from '../../shared/musicTypes';
import type { Quality } from '../../shared/providerTypes';
import { uid } from '../utils/format';

export type PlaybackMode = 'sequence' | 'shuffle' | 'singleLoop' | 'listLoop';
export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'restricted' | 'error';

export interface SourceContextLike {
  type: string;
  providerId?: string;
  playlistId?: string;
  playlistTitle?: string;
  searchKeyword?: string;
  artistId?: string;
  artistName?: string;
  albumId?: string;
  albumTitle?: string;
}

export function createSourceContext(
  type: SourceContextLike['type'],
  providerId: string,
  extra: Partial<SourceContextLike> = {}
): SourceContextLike {
  return { type, providerId, ...extra };
}

export function queueItemForSong(song: Song, source: string, sourceContext?: SourceContextLike): QueueItem {
  return {
    id: uid('qi'),
    mediaId: `${song.providerId}:${song.id}`,
    mediaType: 'song',
    songId: song.id,
    source: source as QueueItem['source'],
    sourceContext: sourceContext as QueueItem['sourceContext']
  };
}

export interface PlaybackSessionV2 {
  queue: QueueItem[];
  queueMedia: Record<string, unknown>;
  queueSongs: Record<string, Song>;
  currentQueueItemId: string | null;
  positionMs: number;
  durationMs: number;
  mode: PlaybackMode;
  quality: Quality;
}

export function isQuality(value: unknown): value is Quality {
  return value === 'standard' || value === 'higher' || value === 'exhigh' || value === 'lossless';
}

export function isPlaybackMode(value: unknown): value is PlaybackMode {
  return value === 'sequence' || value === 'shuffle' || value === 'singleLoop' || value === 'listLoop';
}
