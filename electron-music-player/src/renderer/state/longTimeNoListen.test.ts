import { describe, expect, it } from 'vitest';
import type { Song } from '../../shared/musicTypes';
import { selectLongTimeNoListenSongs } from './longTimeNoListen';

const now = new Date('2026-07-17T12:00:00Z').getTime();
const dayMs = 24 * 60 * 60 * 1_000;

describe('selectLongTimeNoListenSongs', () => {
  it('selects the oldest current-provider songs without duplicating visible discovery songs', () => {
    const oldest = createSong('oldest');
    const old = createSong('old');
    const recent = createSong('recent');
    const foreign = { ...createSong('foreign'), id: 'netease:foreign', providerId: 'netease' as const };
    const history = [
      { song: old, qualifiedPlayCount: 3, lastPlayedAt: now - 40 * dayMs },
      { song: oldest, qualifiedPlayCount: 1, lastPlayedAt: now - 80 * dayMs },
      { song: recent, qualifiedPlayCount: 4, lastPlayedAt: now - 10 * dayMs },
      { song: foreign, qualifiedPlayCount: 2, lastPlayedAt: now - 90 * dayMs }
    ];

    expect(selectLongTimeNoListenSongs('qq', history, [old], now)).toEqual([oldest]);
    expect(selectLongTimeNoListenSongs('netease', history, [], now)).toEqual([foreign]);
  });
});

function createSong(id: string): Song {
  return {
    id: `qq:${id}`,
    providerId: 'qq',
    platformSongId: id,
    title: id,
    artist: 'Artist',
    album: 'Album',
    durationMs: 180_000,
    coverTone: '#31c27c'
  };
}
